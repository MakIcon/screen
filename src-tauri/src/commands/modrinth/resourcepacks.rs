use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use tokio::fs;

use crate::{
    models::{ActionResult, InstanceItem},
    paths::read_instances,
};

use super::{
    build_client, fetch_modrinth_search, install_project_to_dir,
    InstalledModEntry, InstalledModView, ModrinthSearchResponse, SEARCH_PAGE_SIZE_MAX,
};

const MODRINTH_RESOURCEPACK_STATE_FILE: &str = ".screenlauncher-modrinth-resourcepacks.json";

fn resourcepacks_dir_for_instance(instance: &InstanceItem) -> PathBuf {
    PathBuf::from(&instance.game_dir).join("resourcepacks")
}

fn resourcepacks_metadata_path_for_instance(instance: &InstanceItem) -> PathBuf {
    resourcepacks_dir_for_instance(instance).join(MODRINTH_RESOURCEPACK_STATE_FILE)
}

async fn ensure_resourcepacks_dir(instance: &InstanceItem) -> Result<PathBuf, String> {
    let dir = resourcepacks_dir_for_instance(instance);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| format!("create resourcepacks dir error: {e}"))?;
    }
    Ok(dir)
}

async fn read_modrinth_resourcepack_state(
    instance: &InstanceItem,
) -> Result<HashMap<String, InstalledModEntry>, String> {
    let path = resourcepacks_metadata_path_for_instance(instance);
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read Modrinth resourcepack state error: {e}"))?;

    serde_json::from_str(&raw)
        .map_err(|e| format!("parse Modrinth resourcepack state error: {e}"))
}

async fn write_modrinth_resourcepack_state(
    instance: &InstanceItem,
    state: &HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    let path = resourcepacks_metadata_path_for_instance(instance);
    let raw = serde_json::to_string_pretty(state)
        .map_err(|e| format!("serialize Modrinth resourcepack state error: {e}"))?;

    fs::write(path, raw)
        .await
        .map_err(|e| format!("write Modrinth resourcepack state error: {e}"))
}

async fn merge_and_write_modrinth_resourcepack_state(
    instance: &InstanceItem,
    additions: &HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    let mut latest = read_modrinth_resourcepack_state(instance)
        .await
        .unwrap_or_default();
    for (filename, entry) in additions {
        latest.insert(filename.clone(), entry.clone());
    }
    write_modrinth_resourcepack_state(instance, &latest).await
}

#[tauri::command]
pub async fn search_modrinth_resourcepacks(
    instance_id: Option<String>,
    query: String,
    game_version: String,
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, String> {
    let client = build_client()?;
    let limit = limit.clamp(1, SEARCH_PAGE_SIZE_MAX);

    let mut response = fetch_modrinth_search(
        &client,
        &query,
        &game_version,
        "resourcepack",
        &[],
        offset,
        limit,
    )
    .await?;

    if let Some(instance_id) = instance_id {
        let items = read_instances().await?;
        if let Some(instance) = items.into_iter().find(|item| item.id == instance_id) {
            let state = read_modrinth_resourcepack_state(&instance).await?;
            let installed_project_ids = state
                .values()
                .map(|entry| entry.project_id.clone())
                .collect::<HashSet<_>>();

            for hit in &mut response.hits {
                hit.installed = installed_project_ids.contains(&hit.project_id);
            }
        }
    }

    Ok(response)
}

#[tauri::command]
pub async fn install_modrinth_resourcepack(
    instance_id: String,
    project_id: String,
) -> Result<ActionResult, String> {
    let client = build_client()?;
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;

    let target_dir = ensure_resourcepacks_dir(&instance).await?;
    let mut install_batch = HashMap::new();

    install_project_to_dir(
        &client,
        &instance,
        &project_id,
        &target_dir,
        &[],
        &mut install_batch,
    )
    .await?;

    merge_and_write_modrinth_resourcepack_state(&instance, &install_batch).await?;

    Ok(ActionResult {
        ok: true,
        message: "Resource pack installed".into(),
        pid: None,
    })
}

#[tauri::command]
pub async fn uninstall_modrinth_resourcepack(
    instance_id: String,
    filename: String,
) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;

    let dir = resourcepacks_dir_for_instance(&instance);
    let file_path = dir.join(&filename);

    if file_path.exists() {
        fs::remove_file(&file_path)
            .await
            .map_err(|e| format!("remove resourcepack file error: {e}"))?;
    }

    let mut latest_state = read_modrinth_resourcepack_state(&instance)
        .await
        .unwrap_or_default();
    latest_state.remove(&filename);
    write_modrinth_resourcepack_state(&instance, &latest_state).await?;

    Ok(ActionResult {
        ok: true,
        message: "Resource pack deleted".into(),
        pid: None,
    })
}

#[tauri::command]
pub async fn list_installed_resourcepacks(
    instance_id: String,
) -> Result<Vec<InstalledModView>, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| "Instance not found".to_string())?;

    let dir = ensure_resourcepacks_dir(&instance).await?;
    let state = read_modrinth_resourcepack_state(&instance)
        .await
        .unwrap_or_default();
    let mut entries = fs::read_dir(&dir)
        .await
        .map_err(|e| format!("read resourcepacks dir error: {e}"))?;

    let mut out = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("resourcepacks dir iteration error: {e}"))?
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(filename) = path.file_name().map(|name| name.to_string_lossy().to_string()) else {
            continue;
        };

        if filename == MODRINTH_RESOURCEPACK_STATE_FILE {
            continue;
        }

        if !filename.ends_with(".zip") && !filename.ends_with(".disabled") {
            continue;
        }

        if let Some(meta) = state.get(&filename) {
            out.push(InstalledModView {
                project_id: Some(meta.project_id.clone()),
                title: meta.title.clone(),
                author: if meta.author.trim().is_empty() {
                    "MODRINTH".to_string()
                } else {
                    meta.author.clone()
                },
                version_number: Some(meta.version_number.clone()),
                filename: meta.filename.clone(),
                source: "modrinth".to_string(),
                installed_at: Some(meta.installed_at.clone()),
            });
        } else {
            out.push(InstalledModView {
                project_id: None,
                title: filename.clone(),
                author: "LOCAL".to_string(),
                version_number: None,
                filename,
                source: "local".to_string(),
                installed_at: None,
            });
        }
    }

    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(out)
}
