use std::path::Path;

use crate::{
    commands::errors::CommandError,
    paths::{atomic_write_path, launcher_root},
};

const AGENT: &[u8] = include_bytes!("../../resources/offline-lan-agent.jar");
const BOOTSTRAP: &[u8] = include_bytes!("../../resources/offline-lan-bootstrap.jar");

async fn write_agent(directory: &Path) -> Result<String, CommandError> {
    use sha2::{Digest, Sha256};
    use std::sync::OnceLock;
    static WRITE_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    let _guard = WRITE_LOCK.get_or_init(Default::default).lock().await;
    // Content-address the file so updating the launcher never replaces a JAR
    // held open by an already-running game.
    let mut hasher = Sha256::new();
    hasher.update(AGENT);
    hasher.update(BOOTSTRAP);
    let directory = directory.join(format!("offline-lan-{:x}", hasher.finalize()));
    tokio::fs::create_dir_all(&directory).await?;
    // Keep the bootstrap file next to the agent, as declared in Boot-Class-Path.
    for (name, bytes) in [
        ("offline-lan-bootstrap.jar", BOOTSTRAP),
        ("offline-lan-agent.jar", AGENT),
    ] {
        let path = directory.join(name);
        if tokio::fs::read(&path).await.ok().as_deref() != Some(bytes) {
            atomic_write_path(&path, bytes).await?;
        }
    }
    Ok(format!(
        "-javaagent:{}",
        directory.join("offline-lan-agent.jar").to_string_lossy()
    ))
}

pub async fn launch_args() -> Result<Vec<String>, CommandError> {
    Ok(vec![write_agent(&launcher_root()?.join("agents")).await?])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn obsolete_lan_settings_do_not_survive_migration() {
        let mut value = serde_json::to_value(crate::models::LauncherSettings::default()).unwrap();
        value["offlineLanEnabled"] = serde_json::json!(false);
        let settings: crate::models::LauncherSettings = serde_json::from_value(value).unwrap();
        let saved = serde_json::to_value(settings).unwrap();
        assert!(saved.get("offlineLanEnabled").is_none());
    }

    #[tokio::test]
    async fn embedded_agent_is_written_and_corruption_is_repaired() {
        let directory = std::env::temp_dir().join(format!("screen-lan-{}", uuid::Uuid::new_v4()));
        let arg = write_agent(&directory).await.unwrap();
        let path = arg.strip_prefix("-javaagent:").unwrap();
        assert_eq!(tokio::fs::read(path).await.unwrap(), AGENT);
        let bootstrap = Path::new(path).with_file_name("offline-lan-bootstrap.jar");
        assert_eq!(tokio::fs::read(&bootstrap).await.unwrap(), BOOTSTRAP);
        tokio::fs::write(&bootstrap, b"corrupt").await.unwrap();
        tokio::fs::write(path, b"corrupt").await.unwrap();
        assert_eq!(write_agent(&directory).await.unwrap(), arg);
        assert_eq!(tokio::fs::read(path).await.unwrap(), AGENT);
        assert_eq!(tokio::fs::read(&bootstrap).await.unwrap(), BOOTSTRAP);
        let (first, second) = tokio::join!(write_agent(&directory), write_agent(&directory));
        assert_eq!(first.unwrap(), arg);
        assert_eq!(second.unwrap(), arg);
        tokio::fs::remove_dir_all(directory).await.unwrap();
    }
}
