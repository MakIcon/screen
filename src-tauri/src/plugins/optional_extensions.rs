use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::task;

use crate::paths::{extensions_root, read_settings, write_settings};

use super::{
    blue_map::{self, BlueMapState},
    mineflayer_bot::{self, MineflayerBotState},
};

pub const MINEFLAYER_BOT_ID: &str = "mineflayer-bot";
pub const BLUE_MAP_SERVER_ID: &str = "blue-map-server";

const MINEFLAYER_WORKER: &str = include_str!("../../../extensions/mineflayer-bot/worker.cjs");
const MINEFLAYER_COMBAT: &str = include_str!("../../../extensions/mineflayer-bot/combat.cjs");
const MINEFLAYER_COMBAT_DEFAULTS: &str =
    include_str!("../../../extensions/mineflayer-bot/combat-defaults.json");
const MINEFLAYER_PATHFINDER: &str =
    include_str!("../../../extensions/mineflayer-bot/pathfinder.cjs");
const MINEFLAYER_MANIFEST: &str = include_str!("../../../extensions/mineflayer-bot/extension.json");
const MINEFLAYER_PACKAGE: &str = include_str!("../../../extensions/mineflayer-bot/package.json");
const MINEFLAYER_PACKAGE_LOCK: &str =
    include_str!("../../../extensions/mineflayer-bot/package-lock.json");
const MINEFLAYER_COPYING: &str = include_str!("../../../extensions/mineflayer-bot/COPYING");
const MINEFLAYER_NOTICES: &str =
    include_str!("../../../extensions/mineflayer-bot/THIRD-PARTY-NOTICES.md");
const MINEFLAYER_SOURCE: &str =
    include_str!("../../../extensions/mineflayer-bot/pathfinder-source.json");
const MINEFLAYER_RESTORE_SOURCE: &str =
    include_str!("../../../extensions/mineflayer-bot/restore-pathfinder-source.cjs");

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionalExtensionStatus {
    pub id: String,
    pub installed: bool,
    pub version: Option<String>,
    pub install_path: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionManifest {
    id: String,
    version: String,
    entry: String,
}

pub fn extension_dir(id: &str) -> Result<PathBuf, String> {
    if !matches!(id, MINEFLAYER_BOT_ID | BLUE_MAP_SERVER_ID) {
        return Err(format!("Unknown optional extension: {id}"));
    }
    Ok(extensions_root()?.join(id))
}

pub fn mineflayer_runtime_dir() -> Result<PathBuf, String> {
    let installed = extension_dir(MINEFLAYER_BOT_ID)?;
    if installed.join("extension.json").is_file() {
        if !installed.join("pathfinder.cjs").is_file() {
            return Err(
                "Mineflayer Bot package needs an update. Open Extensions and install it again."
                    .to_string(),
            );
        }
        if !installed.join("combat.cjs").is_file()
            || !installed.join("combat-defaults.json").is_file()
        {
            return Err(
                "Mineflayer Bot package needs a PvP update. Open Extensions and install it again."
                    .to_string(),
            );
        }
        return Ok(installed);
    }
    Err(
        "Mineflayer Bot package is not installed. Open Extensions and install it first."
            .to_string(),
    )
}

fn read_manifest(directory: &Path) -> Option<ExtensionManifest> {
    let raw = fs::read_to_string(directory.join("extension.json")).ok()?;
    serde_json::from_str(&raw).ok()
}

fn mineflayer_status() -> OptionalExtensionStatus {
    let managed = extension_dir(MINEFLAYER_BOT_ID).unwrap_or_default();
    let manifest = read_manifest(&managed);
    let installed = manifest
        .as_ref()
        .map(|manifest| {
            manifest.id == MINEFLAYER_BOT_ID
                && managed.join(&manifest.entry).is_file()
                && managed.join("node_modules").is_dir()
                && managed.join("pathfinder.cjs").is_file()
                && managed.join("combat.cjs").is_file()
                && managed.join("combat-defaults.json").is_file()
        })
        .unwrap_or(false);

    OptionalExtensionStatus {
        id: MINEFLAYER_BOT_ID.to_string(),
        installed,
        version: manifest.map(|manifest| manifest.version),
        install_path: managed.to_string_lossy().to_string(),
        message: if installed {
            "Mineflayer package is isolated and ready".to_string()
        } else {
            "Mineflayer package is not installed".to_string()
        },
    }
}

fn blue_map_status() -> OptionalExtensionStatus {
    let directory = extension_dir(BLUE_MAP_SERVER_ID).unwrap_or_default();
    let jar = fs::read_dir(&directory).ok().and_then(|entries| {
        entries.flatten().map(|entry| entry.path()).find(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| {
                        let lower = name.to_ascii_lowercase();
                        lower.ends_with(".jar")
                            && lower.contains("bluemap")
                            && lower.contains("cli")
                    })
                    .unwrap_or(false)
        })
    });
    let version = jar.as_ref().and_then(|path| {
        let name = path.file_stem()?.to_str()?;
        name.split('-')
            .find(|part| part.chars().next().is_some_and(|ch| ch.is_ascii_digit()))
            .map(str::to_string)
    });
    let installed = jar.is_some();

    OptionalExtensionStatus {
        id: BLUE_MAP_SERVER_ID.to_string(),
        installed,
        version,
        install_path: directory.to_string_lossy().to_string(),
        message: if installed {
            "BlueMap server package is isolated and ready".to_string()
        } else {
            "BlueMap server package is not installed".to_string()
        },
    }
}

pub fn statuses() -> Vec<OptionalExtensionStatus> {
    vec![mineflayer_status(), blue_map_status()]
}

fn npm_executable() -> &'static str {
    if cfg!(windows) {
        "npm.cmd"
    } else {
        "npm"
    }
}

fn npm_error_detail(stdout: &[u8], stderr: &[u8]) -> String {
    let stderr = String::from_utf8_lossy(stderr);
    let output = if stderr.trim().is_empty() {
        String::from_utf8_lossy(stdout)
    } else {
        stderr
    };
    let mut lines = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .rev()
        .take(8)
        .collect::<Vec<_>>();
    lines.reverse();
    lines.join(" | ")
}

async fn write_mineflayer_scaffold(staging: &Path) -> Result<(), String> {
    for (name, contents) in [
        ("worker.cjs", MINEFLAYER_WORKER),
        ("combat.cjs", MINEFLAYER_COMBAT),
        ("combat-defaults.json", MINEFLAYER_COMBAT_DEFAULTS),
        (
            "COMBAT.md",
            include_str!("../../../extensions/mineflayer-bot/COMBAT.md"),
        ),
        ("pathfinder.cjs", MINEFLAYER_PATHFINDER),
        ("extension.json", MINEFLAYER_MANIFEST),
        ("package.json", MINEFLAYER_PACKAGE),
        ("package-lock.json", MINEFLAYER_PACKAGE_LOCK),
        ("COPYING", MINEFLAYER_COPYING),
        ("THIRD-PARTY-NOTICES.md", MINEFLAYER_NOTICES),
        ("pathfinder-source.json", MINEFLAYER_SOURCE),
        ("restore-pathfinder-source.cjs", MINEFLAYER_RESTORE_SOURCE),
    ] {
        tokio::fs::write(staging.join(name), contents)
            .await
            .map_err(|error| format!("Write Mineflayer package file {name} error: {error}"))?;
    }
    Ok(())
}

async fn install_mineflayer_dependencies(staging: &Path) -> Result<(), String> {
    let working_directory = staging.to_path_buf();
    let output = task::spawn_blocking(move || {
        let mut command = Command::new(npm_executable());
        command
            .args([
                "ci",
                "--omit=dev",
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
                "--loglevel=error",
            ])
            .current_dir(working_directory);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        command.output()
    })
    .await
    .map_err(|error| format!("Mineflayer dependency installation task error: {error}"))?
    .map_err(|error| {
        format!(
            "Cannot start npm to install Mineflayer. Install Node.js with npm and restart the launcher: {error}"
        )
    })?;

    if !output.status.success() {
        let detail = npm_error_detail(&output.stdout, &output.stderr);
        return Err(if detail.is_empty() {
            format!(
                "Mineflayer dependency installation failed with status {}",
                output.status
            )
        } else {
            format!("Mineflayer dependency installation failed: {detail}")
        });
    }
    Ok(())
}

async fn install_mineflayer_package() -> Result<OptionalExtensionStatus, String> {
    let target = extension_dir(MINEFLAYER_BOT_ID)?;
    let root = extensions_root()?;
    let staging = root.join(".mineflayer-bot-installing");
    tokio::fs::create_dir_all(&root)
        .await
        .map_err(|error| format!("Create extensions directory error: {error}"))?;
    if staging.exists() {
        tokio::fs::remove_dir_all(&staging)
            .await
            .map_err(|error| format!("Clean Mineflayer staging directory error: {error}"))?;
    }
    tokio::fs::create_dir_all(&staging)
        .await
        .map_err(|error| format!("Create Mineflayer staging directory error: {error}"))?;

    write_mineflayer_scaffold(&staging).await?;
    install_mineflayer_dependencies(&staging).await?;

    let manifest = read_manifest(&staging)
        .ok_or_else(|| "Mineflayer package has no valid extension.json".to_string())?;
    if manifest.id != MINEFLAYER_BOT_ID
        || !staging.join(&manifest.entry).is_file()
        || !staging.join("node_modules").is_dir()
    {
        return Err("Mineflayer package is incomplete".to_string());
    }
    if target.exists() {
        tokio::fs::remove_dir_all(&target)
            .await
            .map_err(|error| format!("Replace Mineflayer package error: {error}"))?;
    }
    tokio::fs::rename(&staging, &target)
        .await
        .map_err(|error| format!("Activate Mineflayer package error: {error}"))?;

    Ok(mineflayer_status())
}

#[tauri::command]
pub async fn install_optional_extension(
    extension_id: String,
) -> Result<OptionalExtensionStatus, String> {
    match extension_id.as_str() {
        MINEFLAYER_BOT_ID => install_mineflayer_package().await,
        BLUE_MAP_SERVER_ID => {
            super::blue_map::install_server_package().await?;
            Ok(blue_map_status())
        }
        _ => Err(format!("Unknown optional extension: {extension_id}")),
    }
}

async fn uninstall_mineflayer_package() -> Result<OptionalExtensionStatus, String> {
    let target = extension_dir(MINEFLAYER_BOT_ID)?;
    if target.exists() {
        tokio::fs::remove_dir_all(&target)
            .await
            .map_err(|error| format!("Remove Mineflayer package error: {error}"))?;
    }
    Ok(mineflayer_status())
}

async fn uninstall_blue_map_package() -> Result<OptionalExtensionStatus, String> {
    let directory = extension_dir(BLUE_MAP_SERVER_ID)?;
    if directory.is_dir() {
        let entries = fs::read_dir(&directory)
            .map_err(|error| format!("Read BlueMap package directory error: {error}"))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let is_cli_jar = path
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| {
                    let lower = name.to_ascii_lowercase();
                    lower.ends_with(".jar") && lower.contains("bluemap") && lower.contains("cli")
                })
                .unwrap_or(false);
            if is_cli_jar {
                tokio::fs::remove_file(&path)
                    .await
                    .map_err(|error| format!("Remove BlueMap package error: {error}"))?;
            }
        }
    }

    let mut settings = read_settings().await?;
    let blue_map = settings.blue_map_plugin_mut();
    let configured_jar = PathBuf::from(blue_map.cli_jar_path.trim());
    if configured_jar.starts_with(&directory) {
        blue_map.cli_jar_path.clear();
        write_settings(&settings).await?;
    }

    Ok(blue_map_status())
}

#[tauri::command]
pub async fn uninstall_optional_extension(
    extension_id: String,
    mineflayer_state: State<'_, MineflayerBotState>,
    blue_map_state: State<'_, BlueMapState>,
) -> Result<OptionalExtensionStatus, String> {
    match extension_id.as_str() {
        MINEFLAYER_BOT_ID => {
            mineflayer_bot::stop_mineflayer_bot(mineflayer_state).await?;
            uninstall_mineflayer_package().await
        }
        BLUE_MAP_SERVER_ID => {
            blue_map::stop_bluemap(blue_map_state).await?;
            uninstall_blue_map_package().await
        }
        _ => Err(format!("Unknown optional extension: {extension_id}")),
    }
}
