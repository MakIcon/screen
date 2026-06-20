//! Drag-and-drop content installation.
//!
//! When the user drops a `.jar`/`.zip` onto a build card, we copy it into the
//! right sub-folder of that build's game directory. `.jar` is always a mod; a
//! `.zip` is sniffed (a `shaders/` folder means a shaderpack, otherwise it is
//! treated as a resource pack). Loader-agnostic, no network — just file routing.

use std::{
    fs::File,
    path::{Path, PathBuf},
};

use tokio::fs;
use zip::ZipArchive;

use crate::{models::ActionResult, paths::read_instances};

/// Inspect a zip to decide whether it is a shaderpack or a resource pack.
fn classify_zip(path: &Path) -> Result<&'static str, String> {
    let file = File::open(path).map_err(|e| format!("open zip error: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("invalid zip archive: {e}"))?;
    let mut has_shaders = false;
    let mut has_pack_meta = false;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|e| format!("read zip entry error: {e}"))?;
        let name = entry.name().replace('\\', "/");
        if name.starts_with("shaders/") {
            has_shaders = true;
        }
        if name == "pack.mcmeta" {
            has_pack_meta = true;
        }
    }
    // Shaderpacks ship a `shaders/` folder; resource packs ship `pack.mcmeta`.
    // Anything else falls back to resourcepacks, the most common loose drop.
    Ok(if has_shaders {
        "shaderpacks"
    } else if has_pack_meta {
        "resourcepacks"
    } else {
        "resourcepacks"
    })
}

/// Target sub-folder for a dropped file, or `None` if the extension is not a
/// content file we know how to route.
async fn target_subdir(path: &Path) -> Result<Option<&'static str>, String> {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match ext.as_str() {
        "jar" => Ok(Some("mods")),
        "zip" => {
            let owned = path.to_path_buf();
            let kind = tokio::task::spawn_blocking(move || classify_zip(&owned))
                .await
                .map_err(|e| format!("zip classify task failed: {e}"))??;
            Ok(Some(kind))
        }
        _ => Ok(None),
    }
}

#[tauri::command]
pub async fn install_dropped_content(
    instance_id: String,
    paths: Vec<String>,
) -> Result<ActionResult, String> {
    let instance = read_instances()
        .await?
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| "Instance not found".to_string())?;
    let game_dir = PathBuf::from(&instance.game_dir);

    let mut installed = 0_usize;
    let mut skipped = 0_usize;
    for raw in &paths {
        let source = PathBuf::from(raw);
        let Some(filename) = source
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
        else {
            skipped += 1;
            continue;
        };
        let Some(subdir) = target_subdir(&source).await? else {
            skipped += 1;
            continue;
        };

        let dest_dir = game_dir.join(subdir);
        fs::create_dir_all(&dest_dir)
            .await
            .map_err(|e| format!("create {subdir} dir error: {e}"))?;
        fs::copy(&source, dest_dir.join(&filename))
            .await
            .map_err(|e| format!("copy {filename} error: {e}"))?;
        installed += 1;
    }

    let message = if installed == 0 {
        "No installable files in drop".to_string()
    } else if skipped == 0 {
        format!("Added {installed} file(s) to {}", instance.name)
    } else {
        format!("Added {installed}, skipped {skipped}")
    };

    Ok(ActionResult {
        ok: installed > 0,
        message,
        pid: None,
    })
}
