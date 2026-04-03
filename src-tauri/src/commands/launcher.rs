use std::{path::PathBuf, process::Command};

use tauri::AppHandle;

use crate::{
    minecraft::{
        build_launch_command, install_instance_files, spawn_minecraft_and_persist,
        update_instance_status,
    },
    models::ActionResult,
    paths::{read_instances, write_instances},
};

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
) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items
        .iter()
        .find(|i| i.id == instance_id)
        .cloned()
        .ok_or_else(|| "Instance not found".to_string())?;

    update_instance_status(&instance.id, "UPDATING").await?;
    install_instance_files(&app, &instance).await?;
    let (java_bin, args) = build_launch_command(&app, &instance, &nickname).await?;
    let pid = spawn_minecraft_and_persist(&instance, java_bin, args).await?;

    Ok(ActionResult {
        ok: true,
        message: "Minecraft launched".to_string(),
        pid: Some(pid),
    })
}

#[tauri::command]
pub async fn kill_instance(pid: u32) -> Result<ActionResult, String> {
    Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .spawn()
        .map_err(|e| format!("taskkill error: {e}"))?;

    Ok(ActionResult {
        ok: true,
        message: "Instance killed".to_string(),
        pid: None,
    })
}

#[tauri::command]
pub fn is_process_alive(pid: u32) -> bool {
    // tasklist /FI "PID eq <pid>" /NH — если процесс жив, вернёт строку с его именем
    let output = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .output();
    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            // Если процесс жив — в выводе будет строка с pid в кавычках
            stdout.contains(&format!("\"{pid}\""))
        }
        Err(_) => false,
    }
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