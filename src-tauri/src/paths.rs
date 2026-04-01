use std::{
    env,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use sysinfo::System;
use tokio::fs;

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

    let index = instances_index_path()?;
    if !index.exists() {
        fs::write(index, "[]")
            .await
            .map_err(|e| format!("create instances index error: {e}"))?;
    }

    Ok(())
}

pub async fn read_settings() -> Result<LauncherSettings, String> {
    ensure_layout().await?;
    let path = settings_path()?;

    if !path.exists() {
        let settings = LauncherSettings {
            default_ram_gb: 4_u32.min(detect_system_memory_gb()),
        };

        let raw = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("serialize settings error: {e}"))?;

        fs::write(&path, raw)
            .await
            .map_err(|e| format!("write settings error: {e}"))?;

        return Ok(settings);
    }

    let raw = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read settings error: {e}"))?;

    serde_json::from_str(&raw).map_err(|e| format!("parse settings error: {e}"))
}

pub async fn write_settings(settings: &LauncherSettings) -> Result<(), String> {
    ensure_layout().await?;
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("serialize settings error: {e}"))?;

    fs::write(settings_path()?, raw)
        .await
        .map_err(|e| format!("write settings error: {e}"))
}

pub async fn read_instances() -> Result<Vec<InstanceItem>, String> {
    ensure_layout().await?;
    let raw = fs::read_to_string(instances_index_path()?)
        .await
        .map_err(|e| format!("read instances error: {e}"))?;

    serde_json::from_str(&raw).map_err(|e| format!("parse instances error: {e}"))
}

pub async fn write_instances(items: &[InstanceItem]) -> Result<(), String> {
    ensure_layout().await?;
    let raw = serde_json::to_string_pretty(items)
        .map_err(|e| format!("serialize instances error: {e}"))?;
    fs::write(instances_index_path()?, raw)
        .await
        .map_err(|e| format!("write instances error: {e}"))
}

pub fn sanitize_name(name: &str) -> String {
    let filtered: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
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
        u64::from_be_bytes([0, 0, bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]])
    )
}
