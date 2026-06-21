use std::collections::{HashMap, HashSet};

use tokio::fs;

use crate::{minecraft::LoaderKind, models::ActionResult};

use super::file_content::{
    content_dir, ensure_content_dir, find_instance, merge_state, read_state, validate_filename,
    write_state, FileContentConfig,
};
use super::{
    build_client, fetch_modrinth_search, install_project_to_dir, InstalledModView,
    ModrinthSearchResponse, SEARCH_PAGE_SIZE_MAX,
};

const MODS_STATE_FILE: &str = ".screenlauncher-modrinth.json";

// Mods share the generic content state layer, but keep their own command
// surface because installs are loader-aware and resolve dependencies.
const MODS: FileContentConfig = FileContentConfig::new("mods", MODS_STATE_FILE, "mod", "Mod");

fn instance_loader(loader: &str) -> Result<&'static str, String> {
    LoaderKind::parse(loader)?
        .modrinth_id()
        .ok_or_else(|| "Vanilla builds do not support mods".to_string())
}

#[tauri::command]
pub async fn search_modrinth_mods(
    instance_id: String,
    query: String,
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, String> {
    let client = build_client()?;
    let instance = find_instance(&instance_id).await?;
    let loader = instance_loader(&instance.loader)?;
    let mut response = fetch_modrinth_search(
        &client,
        &query,
        &instance.version,
        "mod",
        &[loader],
        offset,
        limit.clamp(1, SEARCH_PAGE_SIZE_MAX),
    )
    .await?;

    let installed_project_ids = read_state(&instance, MODS)
        .await?
        .into_values()
        .map(|entry| entry.project_id)
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
    let instance = find_instance(&instance_id).await?;
    let loader = instance_loader(&instance.loader)?;

    let target_dir = ensure_content_dir(&instance, MODS).await?;
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
    merge_state(&instance, MODS, &install_batch).await?;

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
    validate_filename(&filename)?;
    let instance = find_instance(&instance_id).await?;

    let file_path = content_dir(&instance, MODS).join(&filename);
    if file_path.exists() {
        fs::remove_file(&file_path)
            .await
            .map_err(|e| format!("remove file error: {e}"))?;
    }

    // The metadata is keyed by the original filename, so drop any `.disabled`
    // suffix before removing the entry for a currently-disabled mod.
    let base_filename = filename.strip_suffix(".disabled").unwrap_or(&filename);
    let mut state = read_state(&instance, MODS).await.unwrap_or_default();
    state.remove(base_filename);
    write_state(&instance, MODS, &state).await?;

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
    validate_filename(&filename)?;
    let instance = find_instance(&instance_id).await?;

    let mods_dir = content_dir(&instance, MODS);
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
    let instance = find_instance(&instance_id).await?;
    let mods_dir = ensure_content_dir(&instance, MODS).await?;
    let state = read_state(&instance, MODS).await.unwrap_or_default();
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
        if filename == MODS_STATE_FILE {
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
            out.push(InstalledModView::from_metadata(filename, enabled, meta));
        } else {
            let title = base_filename
                .trim_end_matches(".jar")
                .trim_end_matches(".zip")
                .to_string();
            out.push(InstalledModView::local(
                filename,
                enabled,
                title,
                "LOCAL FILE",
            ));
        }
    }

    out.sort_by_key(|item| item.title.to_lowercase());
    Ok(out)
}
