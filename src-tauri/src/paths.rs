use crate::commands::errors::{CommandError, ErrorCode};
use std::{
    env,
    ops::{Deref, DerefMut},
    path::PathBuf,
    sync::{Arc, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

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

pub fn launcher_root() -> Result<PathBuf, CommandError> {
    let appdata = env::var("APPDATA")
        .map_err(|_| CommandError::new(ErrorCode::InvalidInput, "APPDATA not found"))?;
    Ok(PathBuf::from(appdata).join(LAUNCHER_DIR_NAME))
}

pub fn instances_root() -> Result<PathBuf, CommandError> {
    Ok(launcher_root()?.join("instances"))
}
pub fn instances_index_path() -> Result<PathBuf, CommandError> {
    Ok(instances_root()?.join("index.json"))
}
pub fn settings_path() -> Result<PathBuf, CommandError> {
    Ok(launcher_root()?.join("settings.json"))
}
pub fn shared_root() -> Result<PathBuf, CommandError> {
    Ok(launcher_root()?.join("minecraft"))
}
pub fn versions_root() -> Result<PathBuf, CommandError> {
    Ok(shared_root()?.join("versions"))
}
pub fn libraries_root() -> Result<PathBuf, CommandError> {
    Ok(shared_root()?.join("libraries"))
}
pub fn assets_root() -> Result<PathBuf, CommandError> {
    Ok(shared_root()?.join("assets"))
}
/// Where auto-downloaded Java runtimes are stored, one subfolder per major.
pub fn java_runtimes_root() -> Result<PathBuf, CommandError> {
    Ok(launcher_root()?.join("java"))
}
pub fn extensions_root() -> Result<PathBuf, CommandError> {
    Ok(launcher_root()?.join("extensions"))
}
pub fn accounts_path() -> Result<PathBuf, CommandError> {
    Ok(launcher_root()?.join("accounts.json"))
}
pub fn account_secrets_root() -> Result<PathBuf, CommandError> {
    Ok(launcher_root()?.join("account-secrets"))
}
pub fn playtime_log_path(instance_id: &str) -> Result<PathBuf, CommandError> {
    Ok(launcher_root()?
        .join("playtime")
        .join(format!("{instance_id}.json")))
}

pub use crate::memory::{clamp_ram_to_system, detect_system_memory, detect_system_memory_gb};

pub async fn ensure_layout() -> Result<(), CommandError> {
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
            fs::create_dir_all(&path).await.map_err(|e| {
                let detail = format!("create dir error: {e}");
                CommandError::from(e).context(detail)
            })?;
        }
    }

    Ok(())
}

pub struct SettingsStore {
    settings: LauncherSettings,
    path: PathBuf,
    _guard: OwnedMutexGuard<()>,
}

impl Deref for SettingsStore {
    type Target = LauncherSettings;
    fn deref(&self) -> &Self::Target {
        &self.settings
    }
}
impl DerefMut for SettingsStore {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.settings
    }
}
impl SettingsStore {
    pub async fn commit(&self) -> Result<(), CommandError> {
        let raw = serde_json::to_vec_pretty(&self.settings).map_err(|e| {
            let detail = format!("serialize settings error: {e}");
            CommandError::from(e).context(detail)
        })?;
        atomic_write_path(&self.path, &raw).await?;
        sync_network_config(&self.settings);
        Ok(())
    }
}

impl SettingsStore {
    async fn open(path: PathBuf, lock: Arc<Mutex<()>>) -> Result<Self, CommandError> {
        let guard = lock.lock_owned().await;
        let settings = match fs::read(&path).await {
            Ok(raw) => serde_json::from_slice(&raw).map_err(|e| {
                let detail = format!("parse settings error: {e}");
                CommandError::from(e).context(detail)
            })?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let settings = LauncherSettings {
                    default_ram_gb: detect_system_memory().recommended_minecraft_ram_gb,
                    ..Default::default()
                };
                let raw = serde_json::to_vec_pretty(&settings).map_err(|e| {
                    let detail = format!("serialize settings error: {e}");
                    CommandError::from(e).context(detail)
                })?;
                atomic_write_path(&path, &raw).await?;
                settings
            }
            Err(e) => {
                return Err({
                    let detail = format!("read settings error: {e}");
                    CommandError::from(e).context(detail)
                })
            }
        };
        sync_network_config(&settings);
        Ok(SettingsStore {
            settings,
            path,
            _guard: guard,
        })
    }
}

pub async fn edit_settings() -> Result<SettingsStore, CommandError> {
    static LOCK: OnceLock<Arc<Mutex<()>>> = OnceLock::new();
    ensure_layout().await?;
    SettingsStore::open(
        settings_path()?,
        LOCK.get_or_init(|| Arc::new(Mutex::new(()))).clone(),
    )
    .await
}

pub async fn read_settings() -> Result<LauncherSettings, CommandError> {
    Ok(edit_settings().await?.settings.clone())
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

pub async fn read_instances() -> Result<Vec<InstanceItem>, CommandError> {
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
    async fn open(path: PathBuf, lock: Arc<Mutex<()>>) -> Result<Self, CommandError> {
        let guard = lock.lock_owned().await;
        let items = match fs::read(&path).await {
            Ok(raw) => serde_json::from_slice(&raw).map_err(|e| {
                let detail = format!("parse instances error: {e}");
                CommandError::from(e).context(detail)
            })?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(error) => {
                return Err({
                    let detail = format!("read instances error: {error}");
                    CommandError::from(error).context(detail)
                })
            }
        };
        Ok(Self {
            items,
            path,
            _guard: guard,
        })
    }

    pub async fn commit(&self) -> Result<(), CommandError> {
        let raw = serde_json::to_vec_pretty(&self.items).map_err(|e| {
            let detail = format!("serialize instances error: {e}");
            CommandError::from(e).context(detail)
        })?;
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

pub async fn edit_instances() -> Result<InstanceIndex, CommandError> {
    static INDEX_LOCK: OnceLock<Arc<Mutex<()>>> = OnceLock::new();
    ensure_layout().await?;
    InstanceIndex::open(
        instances_index_path()?,
        INDEX_LOCK.get_or_init(|| Arc::new(Mutex::new(()))).clone(),
    )
    .await
}

pub(crate) async fn atomic_write_path(
    path: &std::path::Path,
    bytes: &[u8],
) -> Result<(), CommandError> {
    // JSON documents are small. Keep write + sync + replace in one synchronous
    // critical section so cancellation cannot release their lock mid-write.
    atomic_write_path_sync(path, bytes)
}

pub(crate) fn atomic_write_path_sync(
    path: &std::path::Path,
    bytes: &[u8],
) -> Result<(), CommandError> {
    use std::io::Write;
    let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|e| {
                let detail = format!("create temporary JSON error: {e}");
                CommandError::from(e).context(detail)
            })?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| {
                let detail = format!("write temporary JSON error: {e}");
                CommandError::from(e).context(detail)
            })?;
        drop(file);
        std::fs::rename(&temp, path).map_err(|e| {
            let detail = format!("replace JSON error: {e}");
            CommandError::from(e).context(detail)
        })
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
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

pub fn unique_instance_dir(version: &str, name: &str) -> Result<PathBuf, CommandError> {
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
    async fn settings_and_extension_edits_share_one_read_modify_write_lock() {
        use super::{Arc, Mutex, SettingsStore};
        let path =
            std::env::temp_dir().join(format!("screen-settings-{}.json", uuid::Uuid::new_v4()));
        tokio::fs::write(
            &path,
            serde_json::to_vec(&crate::models::LauncherSettings::default()).unwrap(),
        )
        .await
        .unwrap();
        let lock = Arc::new(Mutex::new(()));
        let mut first = SettingsStore::open(path.clone(), lock.clone())
            .await
            .unwrap();
        let second = tokio::spawn({
            let path = path.clone();
            let lock = lock.clone();
            async move {
                let mut settings = SettingsStore::open(path, lock).await.unwrap();
                settings.plugins.blue_map.cli_jar_path = "extension.jar".into();
                settings.commit().await.unwrap();
            }
        });
        first.default_ram_gb = 7;
        first.commit().await.unwrap();
        drop(first);
        second.await.unwrap();
        let result = SettingsStore::open(path.clone(), lock).await.unwrap();
        assert_eq!(result.default_ram_gb, 7);
        assert_eq!(result.plugins.blue_map.cli_jar_path, "extension.jar");
        drop(result);
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
