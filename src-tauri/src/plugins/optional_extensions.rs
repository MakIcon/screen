use crate::commands::errors::{CommandError, ErrorCode};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::task;

use crate::paths::{edit_settings, extensions_root};

use super::{
    blue_map::{self, BlueMapState},
    mineflayer_bot::{self, MineflayerBotState},
    obs_telemetry::{self, ObsTelemetryState},
    obs_telemetry_package,
};

pub const MINEFLAYER_BOT_ID: &str = "mineflayer-bot";
pub const BLUE_MAP_SERVER_ID: &str = "blue-map-server";
static PACKAGE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

const MINEFLAYER_WORKER: &str = include_str!("../../../extensions/mineflayer-bot/worker.cjs");
const MINEFLAYER_KNOCKBACK: &str = include_str!("../../../extensions/mineflayer-bot/knockback.cjs");
const MINEFLAYER_COMBAT: &str = include_str!("../../../extensions/mineflayer-bot/combat.cjs");
const MINEFLAYER_COMBAT_BRAIN: &str =
    include_str!("../../../extensions/mineflayer-bot/combat-brain.cjs");
const MINEFLAYER_COMBAT_FOOTWORK: &str =
    include_str!("../../../extensions/mineflayer-bot/combat-footwork.cjs");
const MINEFLAYER_PEARLS: &str = include_str!("../../../extensions/mineflayer-bot/pearls.cjs");
const MINEFLAYER_CRYSTALS: &str = include_str!("../../../extensions/mineflayer-bot/crystals.cjs");
const MINEFLAYER_CRYSTAL_MOVEMENT: &str =
    include_str!("../../../extensions/mineflayer-bot/crystal-movement.cjs");
const MINEFLAYER_COMBAT_INVENTORY: &str =
    include_str!("../../../extensions/mineflayer-bot/combat-inventory.cjs");
const MINEFLAYER_ARMOR_MANAGER: &str =
    include_str!("../../../extensions/mineflayer-bot/armor-manager.cjs");
const MINEFLAYER_MELEE_SHIELD: &str =
    include_str!("../../../extensions/mineflayer-bot/melee-shield.cjs");
const MINEFLAYER_MACE: &str = include_str!("../../../extensions/mineflayer-bot/mace.cjs");
const MINEFLAYER_BOW_DEFENSE: &str =
    include_str!("../../../extensions/mineflayer-bot/bow-defense.cjs");
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

const MINEFLAYER_FILES: &[(&str, &str)] = &[
    ("worker.cjs", MINEFLAYER_WORKER),
    (
        "fabric.cjs",
        include_str!("../../../extensions/mineflayer-bot/fabric.cjs"),
    ),
    (
        "mineflayer-fabric.cjs",
        include_str!("../../../extensions/mineflayer-bot/mineflayer-fabric.cjs"),
    ),
    (
        "FABRIC.md",
        include_str!("../../../extensions/mineflayer-bot/FABRIC.md"),
    ),
    (
        "FABRIC-LICENSE",
        include_str!("../../../extensions/mineflayer-bot/FABRIC-LICENSE"),
    ),
    (
        "FABRIC-NOTICE",
        include_str!("../../../extensions/mineflayer-bot/FABRIC-NOTICE"),
    ),
    (
        "production.cjs",
        include_str!("../../../extensions/mineflayer-bot/production.cjs"),
    ),
    (
        "workflow.cjs",
        include_str!("../../../extensions/mineflayer-bot/workflow.cjs"),
    ),
    (
        "production-plan.cjs",
        include_str!("../../../extensions/mineflayer-bot/production-plan.cjs"),
    ),
    (
        "storage-scan.cjs",
        include_str!("../../../extensions/mineflayer-bot/storage-scan.cjs"),
    ),
    (
        "production-commands.cjs",
        include_str!("../../../extensions/mineflayer-bot/production-commands.cjs"),
    ),
    (
        "PRODUCTION.md",
        include_str!("../../../extensions/mineflayer-bot/PRODUCTION.md"),
    ),
    (
        "web-inventory.cjs",
        include_str!("../../../extensions/mineflayer-bot/web-inventory.cjs"),
    ),
    (
        "gathering.cjs",
        include_str!("../../../extensions/mineflayer-bot/gathering.cjs"),
    ),
    (
        "farming.cjs",
        include_str!("../../../extensions/mineflayer-bot/farming.cjs"),
    ),
    (
        "FARMING.md",
        include_str!("../../../extensions/mineflayer-bot/FARMING.md"),
    ),
    (
        "gathering-defense.cjs",
        include_str!("../../../extensions/mineflayer-bot/gathering-defense.cjs"),
    ),
    (
        "gathering-storage.cjs",
        include_str!("../../../extensions/mineflayer-bot/gathering-storage.cjs"),
    ),
    (
        "storage-filters.json",
        include_str!("../../../extensions/mineflayer-bot/storage-filters.json"),
    ),
    (
        "gathering-plan.cjs",
        include_str!("../../../extensions/mineflayer-bot/gathering-plan.cjs"),
    ),
    (
        "gathering-defaults.json",
        include_str!("../../../extensions/mineflayer-bot/gathering-defaults.json"),
    ),
    (
        "gathering-scan.cjs",
        include_str!("../../../extensions/mineflayer-bot/gathering-scan.cjs"),
    ),
    (
        "gathering-commands.cjs",
        include_str!("../../../extensions/mineflayer-bot/gathering-commands.cjs"),
    ),
    (
        "GATHERING.md",
        include_str!("../../../extensions/mineflayer-bot/GATHERING.md"),
    ),
    ("knockback.cjs", MINEFLAYER_KNOCKBACK),
    ("combat.cjs", MINEFLAYER_COMBAT),
    ("combat-brain.cjs", MINEFLAYER_COMBAT_BRAIN),
    ("combat-footwork.cjs", MINEFLAYER_COMBAT_FOOTWORK),
    ("pearls.cjs", MINEFLAYER_PEARLS),
    ("crystals.cjs", MINEFLAYER_CRYSTALS),
    ("crystal-movement.cjs", MINEFLAYER_CRYSTAL_MOVEMENT),
    ("bow-defense.cjs", MINEFLAYER_BOW_DEFENSE),
    (
        "bow-aim.cjs",
        include_str!("../../../extensions/mineflayer-bot/bow-aim.cjs"),
    ),
    ("combat-inventory.cjs", MINEFLAYER_COMBAT_INVENTORY),
    ("armor-manager.cjs", MINEFLAYER_ARMOR_MANAGER),
    (
        "auto-eat.cjs",
        include_str!("../../../extensions/mineflayer-bot/auto-eat.cjs"),
    ),
    (
        "auto-buff.cjs",
        include_str!("../../../extensions/mineflayer-bot/auto-buff.cjs"),
    ),
    (
        "potion-data.cjs",
        include_str!("../../../extensions/mineflayer-bot/potion-data.cjs"),
    ),
    (
        "emergency-mlg.cjs",
        include_str!("../../../extensions/mineflayer-bot/emergency-mlg.cjs"),
    ),
    (
        "survival.cjs",
        include_str!("../../../extensions/mineflayer-bot/survival.cjs"),
    ),
    (
        "survival-defaults.json",
        include_str!("../../../extensions/mineflayer-bot/survival-defaults.json"),
    ),
    (
        "SURVIVAL.md",
        include_str!("../../../extensions/mineflayer-bot/SURVIVAL.md"),
    ),
    (
        "AUTO-EAT-LICENSE",
        include_str!("../../../extensions/mineflayer-bot/AUTO-EAT-LICENSE"),
    ),
    ("melee-shield.cjs", MINEFLAYER_MELEE_SHIELD),
    ("mace.cjs", MINEFLAYER_MACE),
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
    (
        "BARITONE-LICENSE",
        include_str!("../../../extensions/mineflayer-bot/BARITONE-LICENSE"),
    ),
    ("THIRD-PARTY-NOTICES.md", MINEFLAYER_NOTICES),
    ("pathfinder-source.json", MINEFLAYER_SOURCE),
    ("restore-pathfinder-source.cjs", MINEFLAYER_RESTORE_SOURCE),
];

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

pub fn extension_dir(id: &str) -> Result<PathBuf, CommandError> {
    if !matches!(
        id,
        MINEFLAYER_BOT_ID | BLUE_MAP_SERVER_ID | obs_telemetry_package::ID
    ) {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            format!("Unknown optional extension: {id}"),
        ));
    }
    Ok(extensions_root()?.join(id))
}

pub fn mineflayer_runtime_dir() -> Result<PathBuf, CommandError> {
    let installed = extension_dir(MINEFLAYER_BOT_ID)?;
    if installed.join("extension.json").is_file() {
        if !installed.join("pathfinder.cjs").is_file() || !installed.join("knockback.cjs").is_file()
        {
            return Err(CommandError::new(
                ErrorCode::IncompatibleVersion,
                "Mineflayer Bot package needs an update. Open Extensions and install it again.",
            ));
        }
        if !installed.join("combat.cjs").is_file()
            || !installed.join("combat-defaults.json").is_file()
            || !installed.join("pearls.cjs").is_file()
            || !installed.join("crystals.cjs").is_file()
            || !installed.join("bow-defense.cjs").is_file()
            || !installed.join("combat-inventory.cjs").is_file()
            || !installed.join("armor-manager.cjs").is_file()
            || !installed.join("melee-shield.cjs").is_file()
        {
            return Err(CommandError::new(
                ErrorCode::IncompatibleVersion,
                "Mineflayer Bot package needs a PvP update. Open Extensions and install it again.",
            ));
        }
        return Ok(installed);
    }
    Err(CommandError::new(
        ErrorCode::InvalidInput,
        "Mineflayer Bot package is not installed. Open Extensions and install it first.",
    ))
}

pub(crate) fn sync_mineflayer_worker(runtime_dir: &Path) -> Result<(), CommandError> {
    // The worker requires these modules at startup. Updating only worker.cjs
    // leaves installed bots running old combat code after a launcher update.
    for &(name, contents) in MINEFLAYER_FILES {
        let path = runtime_dir.join(name);
        let current = match fs::read_to_string(&path) {
            Ok(current) => Some(current),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => {
                return Err({
                    let detail = format!("Read Mineflayer package file {name} error: {error}");
                    CommandError::from(error).context(detail)
                })
            }
        };
        if current.as_deref() != Some(contents) {
            fs::write(&path, contents).map_err(|error| {
                let detail = format!("Update Mineflayer package file {name} error: {error}");
                CommandError::from(error).context(detail)
            })?;
        }
    }
    Ok(())
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
                && managed.join("knockback.cjs").is_file()
                && managed.join("combat.cjs").is_file()
                && managed.join("combat-defaults.json").is_file()
                && managed.join("pearls.cjs").is_file()
                && managed.join("crystals.cjs").is_file()
                && managed.join("bow-defense.cjs").is_file()
                && managed.join("combat-inventory.cjs").is_file()
                && managed.join("armor-manager.cjs").is_file()
                && managed.join("melee-shield.cjs").is_file()
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
    vec![
        mineflayer_status(),
        blue_map_status(),
        obs_telemetry_package::status(),
    ]
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

async fn write_mineflayer_scaffold(staging: &Path) -> Result<(), CommandError> {
    for &(name, contents) in MINEFLAYER_FILES {
        tokio::fs::write(staging.join(name), contents)
            .await
            .map_err(|error| {
                let detail = format!("Write Mineflayer package file {name} error: {error}");
                CommandError::from(error).context(detail)
            })?;
    }
    Ok(())
}

async fn install_mineflayer_dependencies(staging: &Path) -> Result<(), CommandError> {
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
    .map_err(|error| { let detail = format!("Mineflayer dependency installation task error: {error}"); CommandError::from(error).context(detail) })?
    .map_err(|error| {
        { let detail = format!(
            "Cannot start npm to install Mineflayer. Install Node.js with npm and restart the launcher: {error}"
        ); CommandError::from(error).context(detail) }
    })?;

    if !output.status.success() {
        let detail = npm_error_detail(&output.stdout, &output.stderr);
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            if detail.is_empty() {
                format!(
                    "Mineflayer dependency installation failed with status {}",
                    output.status
                )
            } else {
                format!("Mineflayer dependency installation failed: {detail}")
            },
        ));
    }
    Ok(())
}

pub(crate) async fn ensure_mineflayer_dependencies(runtime_dir: &Path) -> Result<(), CommandError> {
    // Existing installations are synchronized on startup. A new worker also
    // needs its newly introduced dependencies before Node loads it.
    for (name, version) in [
        ("mineflayer-statemachine", "1.7.0"),
        ("mineflayer-tool", "1.2.0"),
        ("mineflayer-web-inventory", "1.8.5"),
    ] {
        let path = runtime_dir
            .join("node_modules")
            .join(name)
            .join("package.json");
        let installed = fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
        if installed
            .as_ref()
            .and_then(|json| json.get("version"))
            .and_then(|v| v.as_str())
            != Some(version)
        {
            install_mineflayer_dependencies(runtime_dir).await?;
            break;
        }
    }
    Ok(())
}

async fn install_mineflayer_package() -> Result<OptionalExtensionStatus, CommandError> {
    let target = extension_dir(MINEFLAYER_BOT_ID)?;
    let root = extensions_root()?;
    let staging = root.join(".mineflayer-bot-installing");
    tokio::fs::create_dir_all(&root).await.map_err(|error| {
        let detail = format!("Create extensions directory error: {error}");
        CommandError::from(error).context(detail)
    })?;
    if staging.exists() {
        tokio::fs::remove_dir_all(&staging).await.map_err(|error| {
            let detail = format!("Clean Mineflayer staging directory error: {error}");
            CommandError::from(error).context(detail)
        })?;
    }
    tokio::fs::create_dir_all(&staging).await.map_err(|error| {
        let detail = format!("Create Mineflayer staging directory error: {error}");
        CommandError::from(error).context(detail)
    })?;

    write_mineflayer_scaffold(&staging).await?;
    install_mineflayer_dependencies(&staging).await?;

    let manifest = read_manifest(&staging).ok_or_else(|| {
        CommandError::new(
            ErrorCode::InvalidInput,
            "Mineflayer package has no valid extension.json",
        )
    })?;
    if manifest.id != MINEFLAYER_BOT_ID
        || !staging.join(&manifest.entry).is_file()
        || !staging.join("node_modules").is_dir()
    {
        return Err(CommandError::new(
            ErrorCode::InvalidFile,
            "Mineflayer package is incomplete",
        ));
    }
    activate_package(&staging, &target).await?;

    Ok(mineflayer_status())
}

// Prepare downloads before replacing the installed package, and roll back if
// activation fails (for example when Windows still holds a file open).
pub(super) async fn activate_package(staging: &Path, target: &Path) -> Result<(), CommandError> {
    let backup = target.with_file_name(format!(".extension-backup-{}", uuid::Uuid::new_v4()));
    let had_target = target.exists();
    if had_target {
        fs::rename(target, &backup)?;
    }
    if let Err(error) = fs::rename(staging, target) {
        if had_target {
            fs::rename(&backup, target).map_err(|restore_error| {
                CommandError::from(restore_error).context(format!(
                    "Restore extension failed; previous package is at {}",
                    backup.display()
                ))
            })?;
        }
        return Err(CommandError::from(error).context("Activate extension package failed"));
    }
    if had_target {
        let _ = tokio::fs::remove_dir_all(backup).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn install_optional_extension(
    extension_id: String,
    mineflayer_state: State<'_, MineflayerBotState>,
    blue_map_state: State<'_, BlueMapState>,
    obs_telemetry_state: State<'_, ObsTelemetryState>,
) -> Result<OptionalExtensionStatus, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("extension", None)?;
        let _package_lock = PACKAGE_LOCK.lock().await;
        match extension_id.as_str() {
            MINEFLAYER_BOT_ID => {
                mineflayer_bot::stop_mineflayer_bot(mineflayer_state).await?;
                install_mineflayer_package().await
            }
            BLUE_MAP_SERVER_ID => {
                blue_map::stop_bluemap(blue_map_state).await?;
                super::blue_map::install_server_package().await?;
                Ok(blue_map_status())
            }
            obs_telemetry_package::ID => {
                obs_telemetry::stop_obs_telemetry(obs_telemetry_state).await?;
                obs_telemetry_package::install().await
            }
            _ => Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("Unknown optional extension: {extension_id}"),
            )),
        }
    }
    .await;
    result
}

async fn uninstall_mineflayer_package() -> Result<OptionalExtensionStatus, CommandError> {
    let target = extension_dir(MINEFLAYER_BOT_ID)?;
    if target.exists() {
        tokio::fs::remove_dir_all(&target).await.map_err(|error| {
            let detail = format!("Remove Mineflayer package error: {error}");
            CommandError::from(error).context(detail)
        })?;
    }
    Ok(mineflayer_status())
}

async fn uninstall_blue_map_package() -> Result<OptionalExtensionStatus, CommandError> {
    let directory = extension_dir(BLUE_MAP_SERVER_ID)?;
    if directory.is_dir() {
        let entries = fs::read_dir(&directory).map_err(|error| {
            let detail = format!("Read BlueMap package directory error: {error}");
            CommandError::from(error).context(detail)
        })?;
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
                tokio::fs::remove_file(&path).await.map_err(|error| {
                    let detail = format!("Remove BlueMap package error: {error}");
                    CommandError::from(error).context(detail)
                })?;
            }
        }
    }

    let mut settings = edit_settings().await?;
    let blue_map = settings.blue_map_plugin_mut();
    let configured_jar = PathBuf::from(blue_map.cli_jar_path.trim());
    if configured_jar.starts_with(&directory) {
        blue_map.cli_jar_path.clear();
        settings.commit().await?;
    }

    Ok(blue_map_status())
}

#[tauri::command]
pub async fn uninstall_optional_extension(
    extension_id: String,
    mineflayer_state: State<'_, MineflayerBotState>,
    blue_map_state: State<'_, BlueMapState>,
    obs_telemetry_state: State<'_, ObsTelemetryState>,
) -> Result<OptionalExtensionStatus, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("extension", None)?;
        let _package_lock = PACKAGE_LOCK.lock().await;
        match extension_id.as_str() {
            MINEFLAYER_BOT_ID => {
                mineflayer_bot::stop_mineflayer_bot(mineflayer_state).await?;
                uninstall_mineflayer_package().await
            }
            BLUE_MAP_SERVER_ID => {
                blue_map::stop_bluemap(blue_map_state).await?;
                uninstall_blue_map_package().await
            }
            obs_telemetry_package::ID => {
                obs_telemetry::stop_obs_telemetry(obs_telemetry_state).await?;
                let status = obs_telemetry_package::uninstall().await?;
                let mut settings = edit_settings().await?;
                settings.plugins.obs_telemetry.enabled = false;
                settings.commit().await?;
                Ok(status)
            }
            _ => Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("Unknown optional extension: {extension_id}"),
            )),
        }
    }
    .await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn failed_package_activation_restores_the_previous_installation() {
        let root = std::env::temp_dir().join(format!(
            "screen-extension-rollback-{}",
            uuid::Uuid::new_v4()
        ));
        let target = root.join("installed");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("keep.txt"), "installed package").unwrap();
        assert!(activate_package(&root.join("missing-staging"), &target)
            .await
            .is_err());
        assert_eq!(
            fs::read_to_string(target.join("keep.txt")).unwrap(),
            "installed package"
        );
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn fabric_runtime_is_installed_and_refreshed_with_the_worker() {
        let directory =
            std::env::temp_dir().join(format!("screen-fabric-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        write_mineflayer_scaffold(&directory).await.unwrap();
        for name in [
            "fabric.cjs",
            "mineflayer-fabric.cjs",
            "FABRIC.md",
            "FABRIC-LICENSE",
            "FABRIC-NOTICE",
        ] {
            assert!(directory.join(name).is_file(), "missing {name}");
        }
        fs::write(directory.join("mineflayer-fabric.cjs"), "stale library").unwrap();
        sync_mineflayer_worker(&directory).unwrap();
        let library = fs::read_to_string(directory.join("mineflayer-fabric.cjs")).unwrap();
        assert!(library.contains("mineflayer-fabric 0.2.1"));
        assert!(library.contains("blockCollisionShapes"));
        assert!(fs::read_to_string(directory.join("worker.cjs"))
            .unwrap()
            .contains("installFabricSupport(bot, emit)"));
        assert_eq!(directory.parent(), Some(std::env::temp_dir().as_path()));
        fs::remove_dir_all(directory).unwrap();
    }
}
