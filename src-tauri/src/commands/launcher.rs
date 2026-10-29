use crate::commands::errors::{CommandError, ErrorCode};
use std::{
    path::{Path, PathBuf},
    process::{Command, Output},
    time::{Duration, Instant, UNIX_EPOCH},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, State};
use tokio::fs;

use crate::{
    commands::auth::{read_accounts, refresh_account_if_expired},
    minecraft::{
        build_launch_command, install_instance_files, read_latest_launch_log,
        spawn_minecraft_and_persist, update_instance_status,
    },
    models::{
        ActionResult, LaunchLogSnapshot, PlaytimeLog, PlaytimeSession, ScreenshotImage,
        ScreenshotItem,
    },
    paths::{edit_instances, read_instances, read_settings},
    plugins::obs_telemetry::{prepare_obs_telemetry_for_launch, ObsTelemetryState},
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn background_command(program: &str) -> Command {
    #[cfg(windows)]
    {
        let mut command = Command::new(program);
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }

    #[cfg(not(windows))]
    {
        Command::new(program)
    }
}

fn screenshot_mime_for_path(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("webp") => Some("image/webp"),
        _ => None,
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut index = 0;

    while index < bytes.len() {
        let b0 = bytes[index];
        let b1 = bytes.get(index + 1).copied();
        let b2 = bytes.get(index + 2).copied();

        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1.unwrap_or(0) >> 4)) as usize] as char);

        if let Some(b1) = b1 {
            out.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2.unwrap_or(0) >> 6)) as usize] as char);
        } else {
            out.push('=');
        }

        if let Some(b2) = b2 {
            out.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            out.push('=');
        }

        index += 3;
    }

    out
}

fn task_output_text(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    [stdout, stderr]
        .into_iter()
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn is_pid_alive(pid: u32) -> bool {
    let pid = Pid::from_u32(pid);
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    system.process(pid).is_some()
}

async fn instance_game_dir(instance_id: &str) -> Result<PathBuf, CommandError> {
    let items = read_instances().await?;
    let instance = items
        .iter()
        .find(|i| i.id == instance_id)
        .cloned()
        .ok_or_else(|| CommandError::new(ErrorCode::BuildNotFound, "Instance not found"))?;

    Ok(PathBuf::from(instance.game_dir))
}

fn ensure_plain_file_name(file_name: &str) -> Result<(), CommandError> {
    let path = Path::new(file_name);
    if path.file_name().and_then(|name| name.to_str()) == Some(file_name) {
        Ok(())
    } else {
        Err(CommandError::new(
            ErrorCode::InvalidInput,
            "Invalid screenshot name",
        ))
    }
}

#[tauri::command]
pub async fn install_instance(
    app: AppHandle,
    instance_id: String,
) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("install", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
        let items = read_instances().await?;
        let instance = items
            .iter()
            .find(|i| i.id == instance_id)
            .cloned()
            .ok_or_else(|| CommandError::new(ErrorCode::BuildNotFound, "Instance not found"))?;

        for category in ["mods", "shaderpacks", "resourcepacks"] {
            crate::file_transaction::FileTransaction::recover(
                &std::path::PathBuf::from(&instance.game_dir).join(category),
            )?;
        }
        update_instance_status(&instance.id, "UPDATING").await?;
        let result = async {
            install_instance_files(&app, &instance).await?;
            let settings = read_settings().await?;
            crate::minecraft::ensure_java_for_instance(&app, &instance, settings.auto_download_java)
                .await
        }
        .await;

        if result.is_ok() {
            update_instance_status(&instance.id, "READY").await?;
            Ok(ActionResult {
                ok: true,
                message: "Instance installed".to_string(),
                pid: None,
            })
        } else {
            update_instance_status(&instance.id, "EMPTY").await?;
            Err(result
                .err()
                .unwrap_or_else(|| CommandError::new(ErrorCode::DownloadFailed, "Install failed")))
        }
    }
    .await;
    result
}

#[tauri::command]
pub async fn launch_instance(
    app: AppHandle,
    obs_telemetry_state: State<'_, ObsTelemetryState>,
    instance_id: String,
    nickname: String,
    ms_account_id: Option<String>,
) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("launch", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
        let items = read_instances().await?;
        let instance = items
            .iter()
            .find(|i| i.id == instance_id)
            .cloned()
            .ok_or_else(|| CommandError::new(ErrorCode::BuildNotFound, "Instance not found"))?;

        // Resolve Microsoft account (refresh token if needed)
        let ms_account = if let Some(acc_id) = ms_account_id {
            let accounts = read_accounts().await?;
            let account = accounts
                .into_iter()
                .find(|account| account.id == acc_id)
                .ok_or_else(|| {
                    CommandError::new(
                        ErrorCode::Authentication,
                        "Selected Microsoft account no longer exists",
                    )
                })?;
            Some(refresh_account_if_expired(&account).await?)
        } else {
            None
        };

        for category in ["mods", "shaderpacks", "resourcepacks"] {
            crate::file_transaction::FileTransaction::recover(
                &std::path::PathBuf::from(&instance.game_dir).join(category),
            )?;
        }
        update_instance_status(&instance.id, "UPDATING").await?;
        let launch_result = async {
            install_instance_files(&app, &instance).await?;
            let settings = read_settings().await?;
            crate::minecraft::ensure_java_for_instance(
                &app,
                &instance,
                settings.auto_download_java,
            )
            .await?;
            let obs_jvm_args = prepare_obs_telemetry_for_launch(
                &obs_telemetry_state,
                &settings.plugins.obs_telemetry,
                &instance,
            )
            .await?;
            let (java_bin, args) = build_launch_command(
                &app,
                &instance,
                &nickname,
                ms_account.as_ref(),
                settings.optimized_java_args,
                &obs_jvm_args,
            )
            .await?;
            spawn_minecraft_and_persist(app, &instance, java_bin, args).await
        }
        .await;
        let pid = match launch_result {
            Ok(pid) => pid,
            Err(error) => {
                let previous_status = if instance.status == "UPDATING" {
                    "EMPTY"
                } else {
                    &instance.status
                };
                if let Err(status_error) =
                    update_instance_status(&instance.id, previous_status).await
                {
                    return Err({
                        let detail =
                            format!("{error}; could not reset build status: {status_error}");
                        error.context(detail)
                    });
                }
                return Err(error);
            }
        };

        Ok(ActionResult {
            ok: true,
            message: "Minecraft launched".to_string(),
            pid: Some(pid),
        })
    }
    .await;
    result
}

#[tauri::command]
pub async fn read_instance_launch_log(
    instance_id: String,
) -> Result<LaunchLogSnapshot, CommandError> {
    let result: Result<_, CommandError> = async {
        let items = read_instances().await?;
        let instance = items
            .iter()
            .find(|i| i.id == instance_id)
            .cloned()
            .ok_or_else(|| CommandError::new(ErrorCode::BuildNotFound, "Instance not found"))?;

        Ok(read_latest_launch_log(&instance))
    }
    .await;
    result
}

#[tauri::command]
pub async fn stop_instance(pid: u32) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> = async {
        let graceful = background_command("taskkill")
            .args(["/T", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| {
                let detail = format!("taskkill error: {e}");
                CommandError::from(e).context(detail)
            })?;

        if graceful.status.success() {
            let started = Instant::now();
            while is_pid_alive(pid) && started.elapsed() < Duration::from_secs(10) {
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        }

        let forced = is_pid_alive(pid);
        if forced {
            let output = background_command("taskkill")
                .args(["/T", "/F", "/PID", &pid.to_string()])
                .output()
                .map_err(|e| {
                    let detail = format!("forced taskkill error: {e}");
                    CommandError::from(e).context(detail)
                })?;
            if !output.status.success() && is_pid_alive(pid) {
                let details = task_output_text(&output);
                return Err(CommandError::new(
                    ErrorCode::InvalidInput,
                    if details.is_empty() {
                        "Minecraft did not respond to a normal close or a forced stop".to_string()
                    } else {
                        format!("Minecraft stop failed: {details}")
                    },
                ));
            }
        }

        Ok(ActionResult {
            ok: true,
            message: if forced {
                "Minecraft did not answer the close request and was force-stopped".to_string()
            } else {
                "Minecraft closed normally".to_string()
            },
            pid: None,
        })
    }
    .await;
    result
}

#[tauri::command]
pub fn is_process_alive(pid: u32) -> bool {
    is_pid_alive(pid)
}

#[tauri::command]
pub async fn record_playtime(instance_id: String, elapsed_secs: u64) -> Result<(), CommandError> {
    let result: Result<_, CommandError> = async {
        let mut items = edit_instances().await?;
        if let Some(index) = items.iter().position(|i| i.id == instance_id) {
            items[index].playtime_secs = items[index].playtime_secs.saturating_add(elapsed_secs);
            items.commit().await?;
        }
        if elapsed_secs > 0 {
            append_playtime_session(&instance_id, elapsed_secs).await?;
        }
        Ok(())
    }
    .await;
    result
}

async fn append_playtime_session(instance_id: &str, elapsed_secs: u64) -> Result<(), CommandError> {
    let path = crate::paths::playtime_log_path(instance_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(CommandError::from)?;
    }

    let mut log: PlaytimeLog = match fs::read(&path).await {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => PlaytimeLog::default(),
    };

    let ts = crate::paths::now_string().parse::<u64>().unwrap_or(0);
    log.sessions.push(PlaytimeSession {
        ts,
        secs: elapsed_secs,
    });

    let json = serde_json::to_vec_pretty(&log).map_err(CommandError::from)?;
    fs::write(&path, json).await.map_err(CommandError::from)?;
    Ok(())
}

#[tauri::command]
pub async fn get_playtime_sessions(
    instance_id: String,
) -> Result<Vec<PlaytimeSession>, CommandError> {
    let result: Result<_, CommandError> = async {
        let path = crate::paths::playtime_log_path(&instance_id)?;
        match fs::read(&path).await {
            Ok(bytes) => {
                let log: PlaytimeLog = serde_json::from_slice(&bytes).unwrap_or_default();
                Ok(log.sessions)
            }
            Err(_) => Ok(Vec::new()),
        }
    }
    .await;
    result
}

#[tauri::command]
pub async fn open_instance_folder(instance_id: String) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> = async {
        let items = read_instances().await?;
        let instance = items
            .iter()
            .find(|i| i.id == instance_id)
            .cloned()
            .ok_or_else(|| CommandError::new(ErrorCode::BuildNotFound, "Instance not found"))?;

        let instance_dir = PathBuf::from(&instance.game_dir)
            .parent()
            .ok_or_else(|| CommandError::new(ErrorCode::InvalidInput, "instance folder missing"))?
            .to_path_buf();

        Command::new("explorer")
            .arg(instance_dir)
            .spawn()
            .map_err(|e| {
                let detail = format!("open folder error: {e}");
                CommandError::from(e).context(detail)
            })?;

        Ok(ActionResult {
            ok: true,
            message: "Folder opened".to_string(),
            pid: None,
        })
    }
    .await;
    result
}

#[tauri::command]
pub async fn list_instance_screenshots(
    instance_id: String,
) -> Result<Vec<ScreenshotItem>, CommandError> {
    let result: Result<_, CommandError> = async {
        let screenshots_dir = instance_game_dir(&instance_id).await?.join("screenshots");

        if !screenshots_dir.exists() {
            return Ok(Vec::new());
        }

        let mut read_dir = fs::read_dir(&screenshots_dir).await.map_err(|e| {
            let detail = format!("read screenshots dir error: {e}");
            CommandError::from(e).context(detail)
        })?;
        let mut screenshots = Vec::new();

        while let Some(entry) = read_dir.next_entry().await.map_err(|e| {
            let detail = format!("read screenshot entry error: {e}");
            CommandError::from(e).context(detail)
        })? {
            let path = entry.path();
            let Some(mime) = screenshot_mime_for_path(&path) else {
                continue;
            };

            let metadata = entry.metadata().await.map_err(|e| {
                let detail = format!("read screenshot metadata error: {e}");
                CommandError::from(e).context(detail)
            })?;

            if !metadata.is_file() {
                continue;
            }

            let Some(file_name) = path
                .file_name()
                .and_then(|file_name| file_name.to_str())
                .map(|file_name| file_name.to_string())
            else {
                continue;
            };

            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|modified| modified.as_secs())
                .unwrap_or(0);

            screenshots.push(ScreenshotItem {
                file_name,
                path: path.to_string_lossy().to_string(),
                modified_at,
                size_bytes: metadata.len(),
                mime: mime.to_string(),
            });
        }

        screenshots.sort_by_key(|screenshot| std::cmp::Reverse(screenshot.modified_at));
        Ok(screenshots)
    }
    .await;
    result
}

#[tauri::command]
pub async fn load_instance_screenshot(
    instance_id: String,
    file_name: String,
) -> Result<ScreenshotImage, CommandError> {
    let result: Result<_, CommandError> = async {
        ensure_plain_file_name(&file_name)?;

        let screenshots_dir = instance_game_dir(&instance_id).await?.join("screenshots");
        let path = screenshots_dir.join(&file_name);
        let mime = screenshot_mime_for_path(&path)
            .ok_or_else(|| {
                CommandError::new(ErrorCode::Unsupported, "Unsupported screenshot format")
            })?
            .to_string();

        if !path.exists() {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "Screenshot not found",
            ));
        }

        let bytes = fs::read(&path).await.map_err(|e| {
            let detail = format!("read screenshot error: {e}");
            CommandError::from(e).context(detail)
        })?;

        Ok(ScreenshotImage {
            file_name,
            data_url: format!("data:{mime};base64,{}", base64_encode(&bytes)),
            mime,
        })
    }
    .await;
    result
}

#[tauri::command]
pub async fn open_instance_screenshots_folder(
    instance_id: String,
) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> = async {
        let screenshots_dir = instance_game_dir(&instance_id).await?.join("screenshots");
        fs::create_dir_all(&screenshots_dir).await.map_err(|e| {
            let detail = format!("create screenshots folder error: {e}");
            CommandError::from(e).context(detail)
        })?;

        Command::new("explorer")
            .arg(screenshots_dir)
            .spawn()
            .map_err(|e| {
                let detail = format!("open screenshots folder error: {e}");
                CommandError::from(e).context(detail)
            })?;

        Ok(ActionResult {
            ok: true,
            message: "Screenshots folder opened".to_string(),
            pid: None,
        })
    }
    .await;
    result
}

#[cfg(test)]
mod tests {
    use super::is_pid_alive;

    #[test]
    fn process_liveness_detects_current_process() {
        assert!(is_pid_alive(std::process::id()));
    }
}
