use std::{
    env,
    ops::{Deref, DerefMut},
    path::PathBuf,
    sync::{Arc, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use sysinfo::System;
use tokio::{
    fs,
    sync::{Mutex, OwnedMutexGuard},
};

use crate::models::{InstanceItem, LauncherSettings};

pub const MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
pub const FABRIC_META_BASE_URL: &str = "https://meta.fabricmc.net/v2/versions";
pub const LAUNCHER_DIR_NAME: &str = "ScreenLauncher";
pub const DOWNLOAD_CONCURRENCY: usize = 8;

pub fn now_string() -> String {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_secs().to_string(),
        Err(_) => "0".to_string(),
    }
}

pub fn launcher_root() -> Result<PathBuf, String> {
    let appdata = env::var("APPDATA").map_err(|_| "APPDATA not found".to_string())?;
    Ok(PathBuf::from(appdata).join(LAUNCHER_DIR_NAME))
}

pub fn instances_root() -> Result<PathBuf, String> {
    Ok(launcher_root()?.join("instances"))
}
pub fn instances_index_path() -> Result<PathBuf, String> {
    Ok(instances_root()?.join("index.json"))
}
pub fn settings_path() -> Result<PathBuf, String> {
    Ok(launcher_root()?.join("settings.json"))
}
pub fn shared_root() -> Result<PathBuf, String> {
    Ok(launcher_root()?.join("minecraft"))
}
pub fn versions_root() -> Result<PathBuf, String> {
    Ok(shared_root()?.join("versions"))
}
pub fn libraries_root() -> Result<PathBuf, String> {
    Ok(shared_root()?.join("libraries"))
}
pub fn assets_root() -> Result<PathBuf, String> {
    Ok(shared_root()?.join("assets"))
}
/// Where auto-downloaded Java runtimes are stored, one subfolder per major.
pub fn java_runtimes_root() -> Result<PathBuf, String> {
    Ok(launcher_root()?.join("java"))
}
pub fn extensions_root() -> Result<PathBuf, String> {
    Ok(launcher_root()?.join("extensions"))
}
pub fn accounts_path() -> Result<PathBuf, String> {
    Ok(launcher_root()?.join("accounts.json"))
}
pub fn account_secrets_root() -> Result<PathBuf, String> {
    Ok(launcher_root()?.join("account-secrets"))
}
pub fn playtime_log_path(instance_id: &str) -> Result<PathBuf, String> {
    Ok(launcher_root()?
        .join("playtime")
        .join(format!("{instance_id}.json")))
}

pub fn detect_system_memory_gb() -> u32 {
    let mut sys = System::new_all();
    sys.refresh_memory();
    let total_bytes = sys.total_memory();
    let total_gb = (total_bytes as f64 / 1024_f64 / 1024_f64 / 1024_f64) as u32;

    // Округляем до стандартного размера планки: 2, 4, 8, 16, 32, 64...
    let standard = [2u32, 4, 8, 16, 32, 64, 128];
    standard
        .iter()
        .find(|&&s| s >= total_gb)
        .copied()
        .unwrap_or(total_gb)
}

pub fn clamp_ram_to_system(ram: u32) -> u32 {
    ram.clamp(1, detect_system_memory_gb())
}

pub async fn ensure_layout() -> Result<(), String> {
    let root = launcher_root()?;
    let instances = instances_root()?;
    let shared = shared_root()?;
    let versions = versions_root()?;
    let libs = libraries_root()?;
    let assets = assets_root()?;

    for path in [
        root,
        instances.clone(),
        shared,
        versions,
        libs,
        assets.join("indexes"),
        assets.join("objects"),
        assets.join("virtual"),
        launcher_root()?.join("log_configs"),
    ] {
        if !path.exists() {
            fs::create_dir_all(&path)
                .await
                .map_err(|e| format!("create dir error: {e}"))?;
        }
    }

    Ok(())
}

pub async fn read_settings() -> Result<LauncherSettings, String> {
    ensure_layout().await?;
    let path = settings_path()?;

    if !path.exists() {
        let settings = LauncherSettings {
            default_ram_gb: 4_u32.min(detect_system_memory_gb()),
            ..LauncherSettings::default()
        };

        let raw = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("serialize settings error: {e}"))?;

        fs::write(&path, raw)
            .await
            .map_err(|e| format!("write settings error: {e}"))?;

        sync_network_config(&settings);
        return Ok(settings);
    }

    let raw = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read settings error: {e}"))?;

    let settings: LauncherSettings =
        serde_json::from_str(&raw).map_err(|e| format!("parse settings error: {e}"))?;
    sync_network_config(&settings);
    Ok(settings)
}

/// Push the persisted network preferences into the process-wide mirror config so
/// every downloader picks up the user's mirror/proxy choice.
fn sync_network_config(settings: &LauncherSettings) {
    let proxy = &settings.plugins.proxy;
    let proxy_url = if proxy.enabled {
        proxy.url.as_str()
    } else {
        ""
    };
    crate::minecraft::mirrors::apply_from(&settings.network.mirror, proxy_url, &proxy.bypass);
}

pub async fn write_settings(settings: &LauncherSettings) -> Result<(), String> {
    ensure_layout().await?;
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("serialize settings error: {e}"))?;

    fs::write(settings_path()?, raw)
        .await
        .map_err(|e| format!("write settings error: {e}"))?;
    sync_network_config(settings);
    Ok(())
}

pub async fn read_instances() -> Result<Vec<InstanceItem>, String> {
    Ok(edit_instances().await?.to_vec())
}

/// Holds the index lock from reading through committing, including directory changes.
/// An atomic rename alone cannot protect read-modify-write operations from lost updates.
pub struct InstanceIndex {
    items: Vec<InstanceItem>,
    path: PathBuf,
    _guard: OwnedMutexGuard<()>,
}

impl InstanceIndex {
    async fn open(path: PathBuf, lock: Arc<Mutex<()>>) -> Result<Self, String> {
        let guard = lock.lock_owned().await;
        let items = match fs::read(&path).await {
            Ok(raw) => {
                serde_json::from_slice(&raw).map_err(|e| format!("parse instances error: {e}"))?
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(error) => return Err(format!("read instances error: {error}")),
        };
        Ok(Self {
            items,
            path,
            _guard: guard,
        })
    }

    pub async fn commit(&self) -> Result<(), String> {
        let raw = serde_json::to_vec_pretty(&self.items)
            .map_err(|e| format!("serialize instances error: {e}"))?;
        atomic_write_path(&self.path, &raw).await
    }
}

impl Deref for InstanceIndex {
    type Target = Vec<InstanceItem>;
    fn deref(&self) -> &Self::Target {
        &self.items
    }
}

impl DerefMut for InstanceIndex {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.items
    }
}

pub async fn edit_instances() -> Result<InstanceIndex, String> {
    static INDEX_LOCK: OnceLock<Arc<Mutex<()>>> = OnceLock::new();
    ensure_layout().await?;
    InstanceIndex::open(
        instances_index_path()?,
        INDEX_LOCK.get_or_init(|| Arc::new(Mutex::new(()))).clone(),
    )
    .await
}

pub(crate) async fn atomic_write_path(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    let temp = path.with_extension(format!("json.{}.tmp", uuid::Uuid::new_v4()));
    fs::write(&temp, bytes)
        .await
        .map_err(|e| format!("write temporary index error: {e}"))?;
    let result = fs::rename(&temp, path)
        .await
        .map_err(|e| format!("replace instances index error: {e}"));
    if result.is_err() {
        let _ = fs::remove_file(&temp).await;
    }
    result
}

pub fn sanitize_name(name: &str) -> String {
    let filtered: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
        .collect();

    filtered.trim().to_string()
}

pub fn slugify_name(name: &str) -> String {
    let s = sanitize_name(name).to_lowercase().replace(' ', "-");
    let trimmed = s.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "build".to_string()
    } else {
        trimmed
    }
}

pub fn make_instance_dir_name(version: &str, name: &str) -> String {
    format!("{}-{}", version, slugify_name(name))
}

pub fn unique_instance_dir(version: &str, name: &str) -> Result<PathBuf, String> {
    let base = make_instance_dir_name(version, name);
    let root = instances_root()?;

    let mut i = 0_u32;
    loop {
        let candidate = if i == 0 {
            root.join(&base)
        } else {
            root.join(format!("{}-{}", base, i + 1))
        };
        if !candidate.exists() {
            return Ok(candidate);
        }
        i += 1;
    }
}

pub fn offline_uuid(name: &str) -> String {
    let mut bytes = md5::compute(format!("OfflinePlayer:{name}")).0;
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
        u16::from_be_bytes([bytes[4], bytes[5]]),
        u16::from_be_bytes([bytes[6], bytes[7]]),
        u16::from_be_bytes([bytes[8], bytes[9]]),
        u64::from_be_bytes([
            0, 0, bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ])
    )
}

#[cfg(test)]
mod name_tests {
    use super::{atomic_write_path, sanitize_name, slugify_name};

    #[test]
    fn keeps_cyrillic_build_names() {
        assert_eq!(sanitize_name("  Моя сборка 1  "), "Моя сборка 1");
        assert_eq!(slugify_name("Моя сборка 1"), "моя-сборка-1");
        assert_eq!(sanitize_name("../Мир: тест"), "Мир тест");
    }

    #[tokio::test]
    async fn replaces_existing_index_atomically() {
        let path = std::env::temp_dir().join(format!("screen-index-{}.json", uuid::Uuid::new_v4()));
        tokio::fs::write(&path, b"old").await.unwrap();
        atomic_write_path(&path, b"new").await.unwrap();
        assert_eq!(tokio::fs::read(&path).await.unwrap(), b"new");
        tokio::fs::remove_file(path).await.unwrap();
    }

    #[tokio::test]
    async fn serializes_concurrent_index_changes_without_losing_updates() {
        use super::{Arc, InstanceIndex, Mutex};
        let path =
            std::env::temp_dir().join(format!("screen-index-race-{}.json", uuid::Uuid::new_v4()));
        let lock = Arc::new(Mutex::new(()));
        let item: crate::models::InstanceItem = serde_json::from_value(serde_json::json!({
            "id": "test", "name": "BUILD", "version": "1.21", "loader": "Vanilla",
            "status": "EMPTY", "ram": 4, "lastPlayed": "NEVER", "createdAt": "0", "gameDir": "unused"
        })).unwrap();
        let mut first = InstanceIndex::open(path.clone(), lock.clone())
            .await
            .unwrap();
        first.push(item);
        first.commit().await.unwrap();
        let (started, waiting) = tokio::sync::oneshot::channel();
        let task = tokio::spawn({
            let path = path.clone();
            let lock = lock.clone();
            async move {
                started.send(()).unwrap();
                let mut second = InstanceIndex::open(path, lock).await.unwrap();
                second[0].status = "READY".into();
                second.commit().await.unwrap();
            }
        });
        waiting.await.unwrap();
        first[0].ram = 12;
        first.commit().await.unwrap();
        drop(first);
        task.await.unwrap();
        let result = InstanceIndex::open(path.clone(), lock.clone())
            .await
            .unwrap();
        assert_eq!(result[0].ram, 12);
        assert_eq!(result[0].status, "READY");
        drop(result);
        let mut tasks = tokio::task::JoinSet::new();
        for _ in 0..30 {
            let path = path.clone();
            let lock = lock.clone();
            tasks.spawn(async move {
                let mut items = InstanceIndex::open(path, lock).await.unwrap();
                items[0].playtime_secs += 1;
                items.commit().await.unwrap();
            });
        }
        while let Some(result) = tasks.join_next().await {
            result.unwrap();
        }
        let result = InstanceIndex::open(path.clone(), lock).await.unwrap();
        assert_eq!(result[0].playtime_secs, 30);
        drop(result);
        tokio::fs::remove_file(path).await.unwrap();
    }
}
