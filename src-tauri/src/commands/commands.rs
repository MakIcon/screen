mod modrinth;

use std::{path::PathBuf, process::Command};

use reqwest::Client;
use tauri::AppHandle;
use tokio::fs;
use uuid::Uuid;

use crate::{
    minecraft::{
        build_launch_command, fetch_manifest_network, install_instance_files, normalized_ram,
        spawn_minecraft_and_persist, update_instance_status,
    },
    models::{ActionResult, CreateInstancePayload, InstanceItem, LauncherSettings, MinecraftManifest, UpdateInstancePayload},
    paths::{
        detect_system_memory_gb, make_instance_dir_name, now_string, read_instances, read_settings,
        sanitize_name, unique_instance_dir, write_instances, write_settings, instances_root,
    },
};

#[tauri::command]
pub async fn get_minecraft_manifest() -> Result<MinecraftManifest, String> {
    let client = Client::new();
    fetch_manifest_network(&client).await
}

#[tauri::command]
pub async fn list_instances() -> Result<Vec<InstanceItem>, String> {
    read_instances().await
}

#[tauri::command]
pub async fn get_system_memory_gb() -> Result<u32, String> {
    Ok(detect_system_memory_gb())
}

#[tauri::command]
pub async fn get_launcher_settings() -> Result<LauncherSettings, String> {
    read_settings().await
}

#[tauri::command]
pub async fn set_default_ram_gb(ram: u32) -> Result<LauncherSettings, String> {
    let mut settings = read_settings().await?;
    settings.default_ram_gb = normalized_ram(ram);
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn create_instance(payload: CreateInstancePayload) -> Result<InstanceItem, String> {
    let mut items = read_instances().await?;
    let clean_name = sanitize_name(&payload.name);

    if clean_name.is_empty() {
        return Err("Build name is empty".into());
    }

    if items.iter().any(|i| i.name.eq_ignore_ascii_case(&clean_name)) {
        return Err("Build with this name already exists".into());
    }

    let id = format!("inst-{}", Uuid::new_v4());
    let instance_dir = unique_instance_dir(&payload.version, &clean_name)?;
    let game_dir = instance_dir.join("minecraft");

    fs::create_dir_all(&game_dir)
        .await
        .map_err(|e| format!("create instance dir error: {e}"))?;

    let item = InstanceItem {id:id.clone(),name:clean_name.to_uppercase(),version:payload.version.clone(),loader:"Vanilla".to_string(),status:"EMPTY".to_string(),ram:normalized_ram(payload.ram),last_played:"NEVER".to_string(),playtime_hours:0,created_at:now_string(),game_dir:game_dir.to_string_lossy().to_string(), fabric_loader_version: todo!() };

    let meta_path = instance_dir.join("instance.json");
    let raw = serde_json::to_string_pretty(&item)
        .map_err(|e| format!("serialize instance meta error: {e}"))?;

    fs::write(meta_path, raw)
        .await
        .map_err(|e| format!("write instance meta error: {e}"))?;

    items.push(item.clone());
    write_instances(&items).await?;

    Ok(item)
}

#[tauri::command]
pub async fn update_instance(payload: UpdateInstancePayload) -> Result<InstanceItem, String> {
    let mut items = read_instances().await?;
    let clean_name = sanitize_name(&payload.name);

    let Some(index) = items.iter().position(|i| i.id == payload.id) else {
        return Err("Instance not found".into());
    };

    let old_item = items[index].clone();
    let old_instance_dir = PathBuf::from(&old_item.game_dir)
        .parent()
        .ok_or_else(|| "instance dir missing".to_string())?
        .to_path_buf();

    let desired_dir_name = make_instance_dir_name(&payload.version, &clean_name);
    let desired_instance_dir = instances_root()?.join(desired_dir_name);

    let final_instance_dir = if old_instance_dir != desired_instance_dir {
        if desired_instance_dir.exists() {
            unique_instance_dir(&payload.version, &clean_name)?
        } else {
            desired_instance_dir
        }
    } else {
        old_instance_dir.clone()
    };

    if old_instance_dir != final_instance_dir {
        fs::rename(&old_instance_dir, &final_instance_dir)
            .await
            .map_err(|e| format!("rename instance dir error: {e}"))?;
    }

    let updated_item = InstanceItem {id:old_item.id.clone(),name:clean_name.to_uppercase(),version:payload.version.clone(),loader:"Vanilla".to_string(),status:old_item.status,ram:normalized_ram(payload.ram),last_played:old_item.last_played,playtime_hours:old_item.playtime_hours,created_at:old_item.created_at,game_dir:final_instance_dir.join("minecraft").to_string_lossy().to_string(), fabric_loader_version: todo!() };

    items[index] = updated_item.clone();
    write_instances(&items).await?;

    let meta_path = final_instance_dir.join("instance.json");
    let raw = serde_json::to_string_pretty(&updated_item)
        .map_err(|e| format!("serialize instance meta error: {e}"))?;

    fs::write(meta_path, raw)
        .await
        .map_err(|e| format!("write instance meta error: {e}"))?;

    Ok(updated_item)
}

#[tauri::command]
pub async fn install_instance(app: AppHandle, instance_id: String) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items.iter().find(|i| i.id == instance_id).cloned().ok_or_else(|| "Instance not found".to_string())?;

    update_instance_status(&instance.id, "UPDATING").await?;
    let result = install_instance_files(&app, &instance).await;

    if result.is_ok() {
        update_instance_status(&instance.id, "READY").await?;
        Ok(ActionResult { ok: true, message: "Instance installed".to_string(), pid: None })
    } else {
        update_instance_status(&instance.id, "EMPTY").await?;
        Err(result.err().unwrap_or_else(|| "Install failed".to_string()))
    }
}

#[tauri::command]
pub async fn launch_instance(app: AppHandle, instance_id: String, nickname: String) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items.iter().find(|i| i.id == instance_id).cloned().ok_or_else(|| "Instance not found".to_string())?;

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
pub async fn open_instance_folder(instance_id: String) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items.iter().find(|i| i.id == instance_id).cloned().ok_or_else(|| "Instance not found".to_string())?;

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
