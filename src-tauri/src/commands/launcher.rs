use std::{
    path::{Path, PathBuf},
    process::{Command, Output},
    time::UNIX_EPOCH,
};

use tauri::AppHandle;
use tokio::fs;

use crate::{
    commands::auth::{read_accounts, refresh_account_if_expired},
    minecraft::{
        build_launch_command, install_instance_files, spawn_minecraft_and_persist,
        update_instance_status,
    },
    models::{ActionResult, ScreenshotImage, ScreenshotItem},
    paths::{read_instances, read_settings, write_instances},
};

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

    let mut out = String::with_capacity(((bytes.len() + 2) / 3) * 4);
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
    let output = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .output();
    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.contains(&format!("\"{pid}\""))
        }
        Err(_) => false,
    }
}

async fn instance_game_dir(instance_id: &str) -> Result<PathBuf, String> {
    let items = read_instances().await?;
    let instance = items
        .iter()
        .find(|i| i.id == instance_id)
        .cloned()
        .ok_or_else(|| "Instance not found".to_string())?;

    Ok(PathBuf::from(instance.game_dir))
}

fn ensure_plain_file_name(file_name: &str) -> Result<(), String> {
    let path = Path::new(file_name);
    if path.file_name().and_then(|name| name.to_str()) == Some(file_name) {
        Ok(())
    } else {
        Err("Invalid screenshot name".to_string())
    }
}

#[tauri::command]
pub async fn install_instance(app: AppHandle, instance_id: String) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items
        .iter()
        .find(|i| i.id == instance_id)
        .cloned()
        .ok_or_else(|| "Instance not found".to_string())?;

    update_instance_status(&instance.id, "UPDATING").await?;
    let result = install_instance_files(&app, &instance).await;

    if result.is_ok() {
        update_instance_status(&instance.id, "READY").await?;
        Ok(ActionResult {
            ok: true,
            message: "Instance installed".to_string(),
            pid: None,
        })
    } else {
        update_instance_status(&instance.id, "EMPTY").await?;
        Err(result.err().unwrap_or_else(|| "Install failed".to_string()))
    }
}

#[tauri::command]
pub async fn launch_instance(
    app: AppHandle,
    instance_id: String,
    nickname: String,
    ms_account_id: Option<String>,
) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items
        .iter()
        .find(|i| i.id == instance_id)
        .cloned()
        .ok_or_else(|| "Instance not found".to_string())?;

    // Resolve Microsoft account (refresh token if needed)
    let ms_account = if let Some(acc_id) = ms_account_id {
        let accounts = read_accounts().await?;
        if let Some(acc) = accounts.into_iter().find(|a| a.id == acc_id) {
            Some(refresh_account_if_expired(&acc).await?)
        } else {
            None
        }
    } else {
        None
    };

    update_instance_status(&instance.id, "UPDATING").await?;
    install_instance_files(&app, &instance).await?;
    let settings = read_settings().await?;
    let (java_bin, args) = build_launch_command(
        &app,
        &instance,
        &nickname,
        ms_account.as_ref(),
        settings.optimized_java_args,
    )
    .await?;
    let pid = spawn_minecraft_and_persist(&instance, java_bin, args).await?;

    Ok(ActionResult {
        ok: true,
        message: "Minecraft launched".to_string(),
        pid: Some(pid),
    })
}

#[tauri::command]
pub async fn kill_instance(pid: u32) -> Result<ActionResult, String> {
    let output = Command::new("taskkill")
        .args(["/T", "/F", "/PID", &pid.to_string()])
        .output()
        .map_err(|e| format!("taskkill error: {e}"))?;

    if !output.status.success() && is_pid_alive(pid) {
        let details = task_output_text(&output);
        return Err(if details.is_empty() {
            "taskkill failed and the process is still running".to_string()
        } else {
            format!("taskkill failed: {details}")
        });
    }

    Ok(ActionResult {
        ok: true,
        message: "Instance killed".to_string(),
        pid: None,
    })
}

#[tauri::command]
pub fn is_process_alive(pid: u32) -> bool {
    is_pid_alive(pid)
}

#[tauri::command]
pub async fn record_playtime(instance_id: String, elapsed_secs: u64) -> Result<(), String> {
    let mut items = read_instances().await?;
    if let Some(index) = items.iter().position(|i| i.id == instance_id) {
        items[index].playtime_secs = items[index].playtime_secs.saturating_add(elapsed_secs);
        write_instances(&items).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_instance_folder(instance_id: String) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items
        .iter()
        .find(|i| i.id == instance_id)
        .cloned()
        .ok_or_else(|| "Instance not found".to_string())?;

    let instance_dir = PathBuf::from(&instance.game_dir)
        .parent()
        .ok_or_else(|| "instance folder missing".to_string())?
        .to_path_buf();

    Command::new("explorer")
        .arg(instance_dir)
        .spawn()
        .map_err(|e| format!("open folder error: {e}"))?;

    Ok(ActionResult {
        ok: true,
        message: "Folder opened".to_string(),
        pid: None,
    })
}

#[tauri::command]
pub async fn list_instance_screenshots(instance_id: String) -> Result<Vec<ScreenshotItem>, String> {
    let screenshots_dir = instance_game_dir(&instance_id).await?.join("screenshots");

    if !screenshots_dir.exists() {
        return Ok(Vec::new());
    }

    let mut read_dir = fs::read_dir(&screenshots_dir)
        .await
        .map_err(|e| format!("read screenshots dir error: {e}"))?;
    let mut screenshots = Vec::new();

    while let Some(entry) = read_dir
        .next_entry()
        .await
        .map_err(|e| format!("read screenshot entry error: {e}"))?
    {
        let path = entry.path();
        let Some(mime) = screenshot_mime_for_path(&path) else {
            continue;
        };

        let metadata = entry
            .metadata()
            .await
            .map_err(|e| format!("read screenshot metadata error: {e}"))?;

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

    screenshots.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(screenshots)
}

#[tauri::command]
pub async fn load_instance_screenshot(
    instance_id: String,
    file_name: String,
) -> Result<ScreenshotImage, String> {
    ensure_plain_file_name(&file_name)?;

    let screenshots_dir = instance_game_dir(&instance_id).await?.join("screenshots");
    let path = screenshots_dir.join(&file_name);
    let mime = screenshot_mime_for_path(&path)
        .ok_or_else(|| "Unsupported screenshot format".to_string())?
        .to_string();

    if !path.exists() {
        return Err("Screenshot not found".to_string());
    }

    let bytes = fs::read(&path)
        .await
        .map_err(|e| format!("read screenshot error: {e}"))?;

    Ok(ScreenshotImage {
        file_name,
        data_url: format!("data:{mime};base64,{}", base64_encode(&bytes)),
        mime,
    })
}

#[tauri::command]
pub async fn open_instance_screenshots_folder(instance_id: String) -> Result<ActionResult, String> {
    let screenshots_dir = instance_game_dir(&instance_id).await?.join("screenshots");
    fs::create_dir_all(&screenshots_dir)
        .await
        .map_err(|e| format!("create screenshots folder error: {e}"))?;

    Command::new("explorer")
        .arg(screenshots_dir)
        .spawn()
        .map_err(|e| format!("open screenshots folder error: {e}"))?;

    Ok(ActionResult {
        ok: true,
        message: "Screenshots folder opened".to_string(),
        pid: None,
    })
}
