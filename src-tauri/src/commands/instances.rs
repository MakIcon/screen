use std::path::PathBuf;

use tokio::fs;
use uuid::Uuid;

use crate::{
    minecraft::{is_fabric_loader, normalized_ram},
    models::{CreateInstancePayload, InstanceItem, UpdateInstancePayload},
    paths::{
        instances_root, make_instance_dir_name, now_string, read_instances, sanitize_name,
        unique_instance_dir, write_instances,
    },
};

#[tauri::command]
pub async fn delete_instance(instance_id: String) -> Result<(), String> {
    let mut items = read_instances().await?;
    let Some(index) = items.iter().position(|i| i.id == instance_id) else {
        return Err("Instance not found".into());
    };

    let instance = items[index].clone();
    let instance_dir = PathBuf::from(&instance.game_dir)
        .parent()
        .ok_or_else(|| "instance dir missing".to_string())?
        .to_path_buf();

    items.remove(index);
    write_instances(&items).await?;

    if instance_dir.exists() {
        fs::remove_dir_all(&instance_dir)
            .await
            .map_err(|e| format!("delete instance dir error: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn list_instances() -> Result<Vec<InstanceItem>, String> {
    read_instances().await
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

    let clean_loader = payload.loader.trim().to_string();
    let fabric_loader_version = if is_fabric_loader(&clean_loader) {
        let Some(loader_version) = payload.fabric_loader_version.clone() else {
            return Err("Fabric loader version is required".into());
        };
        Some(loader_version)
    } else {
        None
    };

    let id = format!("inst-{}", Uuid::new_v4());
    let instance_dir = unique_instance_dir(&payload.version, &clean_name)?;
    let game_dir = instance_dir.join("minecraft");

    fs::create_dir_all(&game_dir)
        .await
        .map_err(|e| format!("create instance dir error: {e}"))?;

    let item = InstanceItem {
        id: id.clone(),
        name: clean_name.to_uppercase(),
        version: payload.version.clone(),
        loader: if is_fabric_loader(&clean_loader) {
            "Fabric".to_string()
        } else {
            "Vanilla".to_string()
        },
        fabric_loader_version,
        status: "EMPTY".to_string(),
        ram: normalized_ram(payload.ram),
        last_played: "NEVER".to_string(),
        playtime_secs: 0,
        created_at: now_string(),
        game_dir: game_dir.to_string_lossy().to_string(),
    };

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

    let clean_loader = payload.loader.trim().to_string();
    let fabric_loader_version = if is_fabric_loader(&clean_loader) {
        let Some(loader_version) = payload.fabric_loader_version.clone() else {
            return Err("Fabric loader version is required".into());
        };
        Some(loader_version)
    } else {
        None
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

    let updated_item = InstanceItem {
        id: old_item.id.clone(),
        name: clean_name.to_uppercase(),
        version: payload.version.clone(),
        loader: if is_fabric_loader(&clean_loader) {
            "Fabric".to_string()
        } else {
            "Vanilla".to_string()
        },
        fabric_loader_version,
        status: old_item.status,
        ram: normalized_ram(payload.ram),
        last_played: old_item.last_played,
        playtime_secs: old_item.playtime_secs,
        created_at: old_item.created_at,
        game_dir: final_instance_dir.join("minecraft").to_string_lossy().to_string(),
    };

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