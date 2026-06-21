use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use tokio::fs;

use crate::{
    minecraft::LoaderKind,
    models::{ActionResult, InstanceItem},
    paths::read_instances,
};

use super::{
    build_client, fetch_modrinth_search, install_project_to_dir, InstalledModEntry,
    InstalledModView, ModrinthSearchResponse, SEARCH_PAGE_SIZE_MAX,
};

const MODRINTH_STATE_FILE: &str = ".screenlauncher-modrinth.json";

fn mods_dir_for_instance(instance: &InstanceItem) -> PathBuf {
    PathBuf::from(&instance.game_dir).join("mods")
}

fn metadata_path_for_instance(instance: &InstanceItem) -> PathBuf {
    mods_dir_for_instance(instance).join(MODRINTH_STATE_FILE)
}

async fn ensure_mods_dir(instance: &InstanceItem) -> Result<PathBuf, String> {
    let mods_dir = mods_dir_for_instance(instance);
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)
            .await
            .map_err(|e| format!("create mods dir error: {e}"))?;
    }
    Ok(mods_dir)
}

pub(crate) async fn read_modrinth_state(
    instance: &InstanceItem,
) -> Result<HashMap<String, InstalledModEntry>, String> {
    let path = metadata_path_for_instance(instance);
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read Modrinth state error: {e}"))?;

    serde_json::from_str(&raw).map_err(|e| format!("parse Modrinth state error: {e}"))
}

async fn write_modrinth_state(
    instance: &InstanceItem,
    state: &HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    let path = metadata_path_for_instance(instance);
    let raw = serde_json::to_string_pretty(state)
        .map_err(|e| format!("serialize Modrinth state error: {e}"))?;
    fs::write(path, raw)
        .await
        .map_err(|e| format!("write Modrinth state error: {e}"))
}

async fn merge_and_write_modrinth_state(
    instance: &InstanceItem,
    additions: &HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    let mut latest = read_modrinth_state(instance).await.unwrap_or_default();
    let mods_dir = mods_dir_for_instance(instance);

    for (filename, entry) in additions {
        let stale_filenames = latest
            .iter()
            .filter(|(existing_filename, existing_entry)| {
                existing_entry.project_id == entry.project_id && *existing_filename != filename
            })
            .map(|(existing_filename, _)| existing_filename.clone())
            .collect::<Vec<_>>();

        for stale_filename in stale_filenames {
            let stale_path = mods_dir.join(&stale_filename);
            if stale_path.exists() {
                fs::remove_file(&stale_path)
                    .await
                    .map_err(|e| format!("remove old mod file error: {e}"))?;
            }
            latest.remove(&stale_filename);
        }

        latest.insert(filename.clone(), entry.clone());
    }
    write_modrinth_state(instance, &latest).await
}

#[tauri::command]
pub async fn search_modrinth_mods(
    instance_id: String,
    query: String,
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, String> {
    let client = build_client()?;
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| "Instance not found".to_string())?;
    let loader = LoaderKind::parse(&instance.loader)?
        .modrinth_id()
        .ok_or_else(|| "Vanilla builds do not support mods".to_string())?;
    let limit = limit.clamp(1, SEARCH_PAGE_SIZE_MAX);
    let mut response = fetch_modrinth_search(
        &client,
        &query,
        &instance.version,
        "mod",
        &[loader],
        offset,
        limit,
    )
    .await?;
    let state = read_modrinth_state(&instance).await?;
    let installed_project_ids = state
        .values()
        .map(|entry| entry.project_id.clone())
        .collect::<HashSet<_>>();
    for hit in &mut response.hits {
        hit.installed = installed_project_ids.contains(&hit.project_id);
    }

    Ok(response)
}

#[tauri::command]
pub async fn install_modrinth_project(
    instance_id: String,
    project_id: String,
) -> Result<ActionResult, String> {
    let client = build_client()?;
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;
    let loader = LoaderKind::parse(&instance.loader)?
        .modrinth_id()
        .ok_or_else(|| "Vanilla builds do not support mods".to_string())?;

    let target_dir = ensure_mods_dir(&instance).await?;
    let mut install_batch = HashMap::new();

    install_project_to_dir(
        &client,
        &instance,
        &project_id,
        &target_dir,
        &[loader],
        &mut install_batch,
    )
    .await?;

    merge_and_write_modrinth_state(&instance, &install_batch).await?;

    Ok(ActionResult {
        ok: true,
        message: "Installed".into(),
        pid: None,
    })
}

#[tauri::command]
pub async fn uninstall_modrinth_mod(
    instance_id: String,
    filename: String,
) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;

    let mods_dir = mods_dir_for_instance(&instance);
    let file_path = mods_dir.join(&filename);
    if file_path.exists() {
        fs::remove_file(&file_path)
            .await
            .map_err(|e| format!("remove file error: {e}"))?;
    }

    // The metadata is keyed by the original filename, so drop any `.disabled`
    // suffix before removing the entry for a currently-disabled mod.
    let base_filename = filename
        .strip_suffix(".disabled")
        .unwrap_or(&filename)
        .to_string();
    let mut latest_state = read_modrinth_state(&instance).await.unwrap_or_default();
    latest_state.remove(&base_filename);
    write_modrinth_state(&instance, &latest_state).await?;

    Ok(ActionResult {
        ok: true,
        message: "Deleted".into(),
        pid: None,
    })
}

/// Enable or disable a mod by renaming its file, the way Prism/MultiMC do it:
/// disabling appends a `.disabled` suffix so Minecraft skips the jar, enabling
/// strips it back off. The metadata state is untouched (it is keyed by the
/// original filename), so a toggled-off mod keeps its Modrinth attribution.
#[tauri::command]
pub async fn set_mod_enabled(
    instance_id: String,
    filename: String,
    enabled: bool,
) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;

    let mods_dir = mods_dir_for_instance(&instance);
    let current_path = mods_dir.join(&filename);
    if !current_path.exists() {
        return Err(format!("Mod file not found: {filename}"));
    }

    let currently_enabled = !filename.ends_with(".disabled");
    if currently_enabled == enabled {
        // Already in the requested state — nothing to do.
        return Ok(ActionResult {
            ok: true,
            message: "No change".into(),
            pid: None,
        });
    }

    let target_filename = if enabled {
        filename
            .strip_suffix(".disabled")
            .unwrap_or(&filename)
            .to_string()
    } else {
        format!("{filename}.disabled")
    };
    let target_path = mods_dir.join(&target_filename);
    if target_path.exists() {
        return Err(format!(
            "Cannot toggle mod, target already exists: {target_filename}"
        ));
    }

    fs::rename(&current_path, &target_path)
        .await
        .map_err(|e| format!("toggle mod error: {e}"))?;

    Ok(ActionResult {
        ok: true,
        message: if enabled {
            "Enabled".into()
        } else {
            "Disabled".into()
        },
        pid: None,
    })
}

#[tauri::command]
pub async fn list_installed_mods(instance_id: String) -> Result<Vec<InstalledModView>, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| "Instance not found".to_string())?;

    let mods_dir = ensure_mods_dir(&instance).await?;
    let state = read_modrinth_state(&instance).await.unwrap_or_default();
    let mut entries = fs::read_dir(&mods_dir)
        .await
        .map_err(|e| format!("read mods dir error: {e}"))?;

    let mut out = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("mods dir iteration error: {e}"))?
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(filename) = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
        else {
            continue;
        };
        if filename == MODRINTH_STATE_FILE {
            continue;
        }
        if !filename.ends_with(".jar")
            && !filename.ends_with(".zip")
            && !filename.ends_with(".disabled")
        {
            continue;
        }

        // A `.disabled` suffix means the mod is toggled off. The metadata state is
        // still keyed by the original filename, so strip the suffix when looking it up.
        let enabled = !filename.ends_with(".disabled");
        let base_filename = filename
            .strip_suffix(".disabled")
            .unwrap_or(&filename)
            .to_string();

        if let Some(meta) = state.get(&base_filename) {
            out.push(InstalledModView {
                project_id: Some(meta.project_id.clone()),
                title: meta.title.clone(),
                author: if meta.author.is_empty() {
                    "MODRINTH".to_string()
                } else {
                    meta.author.clone()
                },
                version_number: Some(meta.version_number.clone()),
                filename,
                source: "modrinth".to_string(),
                installed_at: Some(meta.installed_at.clone()),
                enabled,
                icon_url: meta.icon_url.clone(),
            });
        } else {
            out.push(InstalledModView {
                project_id: None,
                title: base_filename
                    .trim_end_matches(".jar")
                    .trim_end_matches(".zip")
                    .to_string(),
                author: "LOCAL FILE".to_string(),
                version_number: None,
                filename,
                source: "local".to_string(),
                installed_at: None,
                enabled,
                icon_url: None,
            });
        }
    }

    out.sort_by_key(|item| item.title.to_lowercase());
    Ok(out)
}
