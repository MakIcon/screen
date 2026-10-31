use std::path::Path;

use crate::{
    commands::errors::CommandError,
    paths::{atomic_write_path, launcher_root},
};

const AGENT: &[u8] = include_bytes!("../../resources/offline-lan-agent.jar");

fn supports_offline_lan(version: &str, loader: &str) -> bool {
    // These releases ship unobfuscated classes and use Java 25's Class-File API.
    // Other versions/loaders need separate compatibility testing before opting in.
    loader.eq_ignore_ascii_case("vanilla") && matches!(version, "26.1" | "26.1.1" | "26.1.2")
}

async fn write_agent(directory: &Path) -> Result<String, CommandError> {
    use sha2::{Digest, Sha256};
    use std::sync::OnceLock;
    static WRITE_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    let _guard = WRITE_LOCK.get_or_init(Default::default).lock().await;
    // Content-address the file so updating the launcher never replaces a JAR
    // held open by an already-running game.
    let hash = format!("{:x}", Sha256::digest(AGENT));
    let path = directory.join(format!("offline-lan-{hash}.jar"));
    if tokio::fs::read(&path).await.ok().as_deref() != Some(AGENT) {
        tokio::fs::create_dir_all(directory).await?;
        atomic_write_path(&path, AGENT).await?;
    }
    Ok(format!("-javaagent:{}", path.to_string_lossy()))
}

pub async fn launch_args(
    enabled: bool,
    version: &str,
    loader: &str,
) -> Result<Vec<String>, CommandError> {
    if !enabled || !supports_offline_lan(version, loader) {
        return Ok(Vec::new());
    }
    Ok(vec![write_agent(&launcher_root()?.join("agents")).await?])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn existing_settings_keep_offline_lan_disabled_until_the_host_enables_it() {
        let mut value = serde_json::to_value(crate::models::LauncherSettings::default()).unwrap();
        value.as_object_mut().unwrap().remove("offlineLanEnabled");
        let mut settings: crate::models::LauncherSettings = serde_json::from_value(value).unwrap();
        assert!(!settings.offline_lan_enabled);
        settings.offline_lan_enabled = true;
        let saved = serde_json::to_value(settings).unwrap();
        assert_eq!(saved["offlineLanEnabled"], true);
    }

    #[tokio::test]
    async fn agent_is_only_added_for_enabled_supported_vanilla_releases() {
        for version in ["26.1", "26.1.1", "26.1.2"] {
            assert!(supports_offline_lan(version, "Vanilla"));
            assert!(launch_args(false, version, "Vanilla")
                .await
                .unwrap()
                .is_empty());
        }
        for (version, loader) in [
            ("1.21.11", "Vanilla"),
            ("26.1-snapshot-1", "Vanilla"),
            ("26.1.20", "Vanilla"),
            ("26.2", "Vanilla"),
            ("26.1", "Fabric"),
            ("26.1", "NeoForge"),
        ] {
            assert!(!supports_offline_lan(version, loader));
            assert!(launch_args(true, version, loader).await.unwrap().is_empty());
        }
    }

    #[tokio::test]
    async fn embedded_agent_is_written_and_corruption_is_repaired() {
        let directory = std::env::temp_dir().join(format!("screen-lan-{}", uuid::Uuid::new_v4()));
        let arg = write_agent(&directory).await.unwrap();
        let path = arg.strip_prefix("-javaagent:").unwrap();
        assert_eq!(tokio::fs::read(path).await.unwrap(), AGENT);
        tokio::fs::write(path, b"corrupt").await.unwrap();
        assert_eq!(write_agent(&directory).await.unwrap(), arg);
        assert_eq!(tokio::fs::read(path).await.unwrap(), AGENT);
        let (first, second) = tokio::join!(write_agent(&directory), write_agent(&directory));
        assert_eq!(first.unwrap(), arg);
        assert_eq!(second.unwrap(), arg);
        tokio::fs::remove_dir_all(directory).await.unwrap();
    }
}
