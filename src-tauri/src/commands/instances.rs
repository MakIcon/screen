use std::path::PathBuf;

use tokio::fs;
use uuid::Uuid;

use std::collections::HashMap;

use crate::{
    commands::modrinth::{build_client, install_project_to_dir, InstalledModEntry},
    minecraft::{normalized_loader_and_version, normalized_ram},
    models::{
        CreateInstancePayload, ExportedItem, ImportInstancePayload, InstanceExportData,
        InstanceItem, UpdateInstancePayload,
    },
    paths::{
        instances_root, make_instance_dir_name, now_string, read_instances, sanitize_name,
        unique_instance_dir, write_instances,
    },
};

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.map(|text| text.replace("\r\n", "\n"))
}

fn normalize_optional_path(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn normalize_window_width(value: Option<u32>) -> Option<u32> {
    value.map(|dimension| dimension.clamp(320, 7680))
}

fn normalize_window_height(value: Option<u32>) -> Option<u32> {
    value.map(|dimension| dimension.clamp(240, 4320))
}

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

    if items
        .iter()
        .any(|i| i.name.eq_ignore_ascii_case(&clean_name))
    {
        return Err("Build with this name already exists".into());
    }

    let (loader_kind, loader_version) =
        normalized_loader_and_version(&payload.loader, payload.loader_version.clone())?;

    let id = format!("inst-{}", Uuid::new_v4());
    let instance_dir = unique_instance_dir(&payload.version, &clean_name)?;
    let game_dir = instance_dir.join("minecraft");

    fs::create_dir_all(&game_dir)
        .await
        .map_err(|e| format!("create instance dir error: {e}"))?;

    let item = InstanceItem {
        id: id.clone(),
        name: clean_name.to_uppercase(),
        pinned: false,
        version: payload.version.clone(),
        loader: loader_kind.canonical_name().to_string(),
        loader_version,
        status: "EMPTY".to_string(),
        ram: normalized_ram(payload.ram),
        java_args: normalize_optional_text(payload.java_args),
        java_path: normalize_optional_path(payload.java_path),
        window_width: normalize_window_width(payload.window_width),
        window_height: normalize_window_height(payload.window_height),
        fullscreen: payload.fullscreen,
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

    if clean_name.is_empty() {
        return Err("Build name is empty".into());
    }
    if items
        .iter()
        .any(|item| item.id != payload.id && item.name.eq_ignore_ascii_case(&clean_name))
    {
        return Err("Build with this name already exists".into());
    }

    let Some(index) = items.iter().position(|i| i.id == payload.id) else {
        return Err("Instance not found".into());
    };

    let (loader_kind, loader_version) =
        normalized_loader_and_version(&payload.loader, payload.loader_version.clone())?;

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
        pinned: payload.pinned,
        version: payload.version.clone(),
        loader: loader_kind.canonical_name().to_string(),
        loader_version,
        status: old_item.status,
        ram: normalized_ram(payload.ram),
        java_args: normalize_optional_text(payload.java_args),
        java_path: normalize_optional_path(payload.java_path),
        window_width: normalize_window_width(payload.window_width),
        window_height: normalize_window_height(payload.window_height),
        fullscreen: payload.fullscreen,
        last_played: old_item.last_played,
        playtime_secs: old_item.playtime_secs,
        created_at: old_item.created_at,
        game_dir: final_instance_dir
            .join("minecraft")
            .to_string_lossy()
            .to_string(),
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

#[tauri::command]
pub async fn get_instance_export_data(instance_id: String) -> Result<InstanceExportData, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or_else(|| "Instance not found".to_string())?;

    let game_dir = PathBuf::from(&instance.game_dir);

    let read_export_items = |directory: PathBuf, state_file: &'static str| async move {
        let state_path = directory.join(state_file);
        let state: HashMap<String, InstalledModEntry> = if state_path.exists() {
            let raw = fs::read_to_string(&state_path).await.unwrap_or_default();
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            HashMap::new()
        };

        let mut result = state
            .values()
            .map(|entry| ExportedItem {
                project_id: Some(entry.project_id.clone()),
                title: entry.title.clone(),
                source: "modrinth".to_string(),
                icon_url: entry.icon_url.clone(),
            })
            .collect::<Vec<_>>();

        if let Ok(mut entries) = fs::read_dir(&directory).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let Ok(file_type) = entry.file_type().await else {
                    continue;
                };
                if !file_type.is_file() {
                    continue;
                }
                let filename = entry.file_name().to_string_lossy().to_string();
                if filename == state_file || state.contains_key(&filename) {
                    continue;
                }
                result.push(ExportedItem {
                    project_id: None,
                    title: filename,
                    source: "local".to_string(),
                    icon_url: None,
                });
            }
        }

        result.sort_by_key(|item| item.title.to_lowercase());
        result
    };

    let mods = read_export_items(game_dir.join("mods"), ".screenlauncher-modrinth.json").await;

    let shaders = read_export_items(
        game_dir.join("shaderpacks"),
        ".screenlauncher-modrinth-shaderpacks.json",
    )
    .await;

    let resource_packs = read_export_items(
        game_dir.join("resourcepacks"),
        ".screenlauncher-modrinth-resourcepacks.json",
    )
    .await;
    Ok(InstanceExportData {
        schema_version: 2,
        name: instance.name,
        version: instance.version,
        loader: instance.loader,
        loader_version: instance.loader_version,
        ram: instance.ram,
        java_args: instance.java_args,
        java_path: instance.java_path,
        window_width: instance.window_width,
        window_height: instance.window_height,
        fullscreen: instance.fullscreen,
        mods,
        shaders,
        resource_packs,
    })
}

#[tauri::command]
pub async fn import_instance(payload: ImportInstancePayload) -> Result<InstanceItem, String> {
    let mut items = read_instances().await?;
    let clean_name = sanitize_name(&payload.name);

    if clean_name.is_empty() {
        return Err("Build name is empty".into());
    }

    if items
        .iter()
        .any(|i| i.name.eq_ignore_ascii_case(&clean_name))
    {
        return Err("Build with this name already exists".into());
    }

    let (loader_kind, loader_version) =
        normalized_loader_and_version(&payload.loader, payload.loader_version.clone())?;

    let id = format!("inst-{}", uuid::Uuid::new_v4());
    let instance_dir = unique_instance_dir(&payload.version, &clean_name)?;
    let game_dir = instance_dir.join("minecraft");

    fs::create_dir_all(&game_dir)
        .await
        .map_err(|e| format!("create instance dir error: {e}"))?;

    let item = InstanceItem {
        id: id.clone(),
        name: clean_name.to_uppercase(),
        pinned: false,
        version: payload.version.clone(),
        loader: loader_kind.canonical_name().to_string(),
        loader_version,
        status: "EMPTY".to_string(),
        ram: normalized_ram(payload.ram),
        java_args: normalize_optional_text(payload.java_args),
        java_path: normalize_optional_path(payload.java_path),
        window_width: normalize_window_width(payload.window_width),
        window_height: normalize_window_height(payload.window_height),
        fullscreen: payload.fullscreen,
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

    let loaders: Vec<&str> = loader_kind.modrinth_id().into_iter().collect();

    // Install mods
    if !payload.mods.is_empty() {
        if let Ok(client) = build_client() {
            let mods_dir = game_dir.join("mods");
            let _ = fs::create_dir_all(&mods_dir).await;
            let mut state: HashMap<String, InstalledModEntry> = HashMap::new();
            for mod_item in &payload.mods {
                if mod_item.source == "modrinth" {
                    if let Some(ref pid) = mod_item.project_id {
                        let _ = install_project_to_dir(
                            &client, &item, pid, &mods_dir, &loaders, &mut state, None,
                        )
                        .await;
                    }
                }
            }
            if !state.is_empty() {
                let p = mods_dir.join(".screenlauncher-modrinth.json");
                if let Ok(s) = serde_json::to_string_pretty(&state) {
                    let _ = fs::write(p, s).await;
                }
            }
        }
    }

    // Install shaders
    if !payload.shaders.is_empty() {
        if let Ok(client) = build_client() {
            let shaders_dir = game_dir.join("shaderpacks");
            let _ = fs::create_dir_all(&shaders_dir).await;
            let mut state: HashMap<String, InstalledModEntry> = HashMap::new();
            for shader in &payload.shaders {
                if shader.source == "modrinth" {
                    if let Some(ref pid) = shader.project_id {
                        let _ = install_project_to_dir(
                            &client,
                            &item,
                            pid,
                            &shaders_dir,
                            &[],
                            &mut state,
                            None,
                        )
                        .await;
                    }
                }
            }
            if !state.is_empty() {
                let p = shaders_dir.join(".screenlauncher-modrinth-shaderpacks.json");
                if let Ok(s) = serde_json::to_string_pretty(&state) {
                    let _ = fs::write(p, s).await;
                }
            }
        }
    }

    // Install resource packs
    if !payload.resource_packs.is_empty() {
        if let Ok(client) = build_client() {
            let packs_dir = game_dir.join("resourcepacks");
            let _ = fs::create_dir_all(&packs_dir).await;
            let mut state: HashMap<String, InstalledModEntry> = HashMap::new();
            for pack in &payload.resource_packs {
                if pack.source == "modrinth" {
                    if let Some(ref pid) = pack.project_id {
                        let _ = install_project_to_dir(
                            &client,
                            &item,
                            pid,
                            &packs_dir,
                            &[],
                            &mut state,
                            None,
                        )
                        .await;
                    }
                }
            }
            if !state.is_empty() {
                let p = packs_dir.join(".screenlauncher-modrinth-resourcepacks.json");
                if let Ok(s) = serde_json::to_string_pretty(&state) {
                    let _ = fs::write(p, s).await;
                }
            }
        }
    }

    Ok(item)
}
