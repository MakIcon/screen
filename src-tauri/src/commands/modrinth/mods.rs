use crate::commands::errors::{CommandError, ErrorCode};
use std::{
    collections::{HashMap, HashSet},
    sync::OnceLock,
};

use serde::Serialize;
use tauri::AppHandle;
use tokio::{
    fs,
    sync::{watch, Mutex},
};

use crate::{minecraft::LoaderKind, models::ActionResult};

use super::file_content::{
    content_dir, ensure_content_dir, find_instance, metadata_path, read_state,
    uninstall_file_content, validate_filename, FileContentConfig,
};
use super::{
    build_client, choose_primary_file, fetch_modrinth_search, http_json, install_project_to_dir,
    resolve_project_install_plan, reusable_installed_entry, InstalledModEntry, InstalledModView,
    ModDownloadContext, ModDownloadControlState, ModrinthSearchResponse, ModrinthVersion,
    ModrinthVersionFile, MODRINTH_API_BASE, SEARCH_PAGE_SIZE_MAX,
};

const MODS_STATE_FILE: &str = ".screenlauncher-modrinth.json";

type ActiveModDownloads = Mutex<HashMap<String, watch::Sender<ModDownloadControlState>>>;
static ACTIVE_MOD_DOWNLOADS: OnceLock<ActiveModDownloads> = OnceLock::new();

fn active_mod_downloads() -> &'static ActiveModDownloads {
    ACTIVE_MOD_DOWNLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn download_key(instance_id: &str, project_id: &str) -> String {
    format!("{instance_id}\0{project_id}")
}

// Mods share the generic content state layer, but keep their own command
// surface because installs are loader-aware and resolve dependencies.
const MODS: FileContentConfig = FileContentConfig::new("mods", MODS_STATE_FILE, "mod", "Mod");

fn instance_loader(loader: &str) -> Result<&'static str, CommandError> {
    LoaderKind::parse(loader)?.modrinth_id().ok_or_else(|| {
        CommandError::new(
            ErrorCode::InvalidInput,
            "Vanilla builds do not support mods",
        )
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ModrinthDependencyStatus {
    Download,
    Installed,
    Enable,
}

impl ModrinthDependencyStatus {
    fn for_file(
        version: &ModrinthVersion,
        file: &ModrinthVersionFile,
        state: &HashMap<String, InstalledModEntry>,
        available_files: &HashSet<String>,
    ) -> Self {
        if reusable_installed_entry(version, file, state, available_files).is_none() {
            Self::Download
        } else if available_files.contains(&file.filename) {
            Self::Installed
        } else {
            Self::Enable
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthModDependency {
    pub project_id: String,
    pub title: String,
    pub icon_url: Option<String>,
    pub version_number: String,
    pub direct: bool,
    pub status: ModrinthDependencyStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthModDependencies {
    pub version_number: String,
    pub dependencies: Vec<ModrinthModDependency>,
}

#[tauri::command]
pub async fn get_modrinth_mod_dependencies(
    instance_id: String,
    project_id: String,
) -> Result<ModrinthModDependencies, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("content-read", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
        let instance = find_instance(&instance_id).await?;
        let loader = instance_loader(&instance.loader)?;
        let client = build_client()?;
        let state = read_state(&instance, MODS).await?;
        let (plan, available_files) = resolve_project_install_plan(
            &client,
            &instance,
            &project_id,
            &content_dir(&instance, MODS),
            &[loader],
            &state,
            None,
        )
        .await?;
        let root = plan.first().ok_or(CommandError::new(
            ErrorCode::InvalidInput,
            "Не удалось подобрать версию мода",
        ))?;
        let version_number = root.version.version_number.clone();
        let direct_dependencies = root.dependencies.clone();
        let mut dependencies = Vec::new();
        for item in plan.into_iter().skip(1) {
            let version = item.version;
            let file = choose_primary_file(&version).ok_or_else(|| {
                CommandError::new(
                    ErrorCode::InvalidInput,
                    format!("У зависимости {} нет файлов", version.project_id),
                )
            })?;
            validate_filename(&file.filename)?;
            let status =
                ModrinthDependencyStatus::for_file(&version, file, &state, &available_files);
            let existing = reusable_installed_entry(&version, file, &state, &available_files);
            let (title, icon_url) =
                if let Some(entry) = existing.filter(|entry| !entry.title.is_empty()) {
                    (entry.title.clone(), entry.icon_url.clone())
                } else {
                    let metadata: serde_json::Value = http_json(
                        &client,
                        &format!("{MODRINTH_API_BASE}/project/{}", version.project_id),
                    )
                    .await?;
                    (
                        metadata
                            .get("title")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or(&version.project_id)
                            .to_string(),
                        metadata
                            .get("icon_url")
                            .and_then(serde_json::Value::as_str)
                            .map(str::to_string),
                    )
                };
            dependencies.push(ModrinthModDependency {
                direct: direct_dependencies.contains(&version.project_id),
                project_id: version.project_id,
                title,
                icon_url,
                version_number: version.version_number,
                status,
            });
        }
        Ok(ModrinthModDependencies {
            version_number,
            dependencies,
        })
    }
    .await;
    result
}

#[tauri::command]
pub async fn search_modrinth_mods(
    instance_id: String,
    query: String,
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("content-read", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
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
    .await;
    result
}

#[tauri::command]
pub async fn install_modrinth_project(
    app: AppHandle,
    instance_id: String,
    project_id: String,
) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("content", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
        let client = build_client()?;
        let instance = find_instance(&instance_id).await?;
        let loader = instance_loader(&instance.loader)?;

        let target_dir = ensure_content_dir(&instance, MODS).await?;
        let mut install_batch = read_state(&instance, MODS).await?;
        let key = download_key(&instance_id, &project_id);
        let (control_sender, control_receiver) =
            watch::channel(ModDownloadControlState::Downloading);
        {
            let mut active = active_mod_downloads().lock().await;
            if active.contains_key(&key) {
                return Err(CommandError::new(
                    ErrorCode::InvalidInput,
                    "This mod download is already running",
                ));
            }
            active.insert(key.clone(), control_sender);
        }
        let context = ModDownloadContext::new(
            app,
            instance_id.clone(),
            project_id.clone(),
            control_receiver,
        );

        let install_result = install_project_to_dir(
            &client,
            &instance,
            &project_id,
            &target_dir,
            &metadata_path(&instance, MODS),
            &[loader],
            &mut install_batch,
            Some(&context),
        )
        .await;
        active_mod_downloads().lock().await.remove(&key);

        if let Err(error) = install_result {
            if error.code == ErrorCode::Cancelled {
                context.emit("", 0, 0, "cancelled");
            }
            return Err(error);
        }
        context.emit("", 0, 0, "completed");

        Ok(ActionResult {
            ok: true,
            message: "Мод и все обязательные зависимости установлены".into(),
            pid: None,
        })
    }
    .await;
    result
}

#[tauri::command]
pub async fn set_modrinth_download_paused(
    instance_id: String,
    project_id: String,
    paused: bool,
) -> Result<(), CommandError> {
    let result: Result<_, CommandError> = async {
        let active = active_mod_downloads().lock().await;
        let control = active
            .get(&download_key(&instance_id, &project_id))
            .ok_or_else(|| {
                CommandError::new(ErrorCode::InvalidInput, "Mod download is no longer active")
            })?;
        control
            .send(if paused {
                ModDownloadControlState::Paused
            } else {
                ModDownloadControlState::Downloading
            })
            .map_err(|_| {
                CommandError::new(ErrorCode::InvalidInput, "Mod download is no longer active")
            })
    }
    .await;
    result
}

#[tauri::command]
pub async fn cancel_modrinth_download(
    instance_id: String,
    project_id: String,
) -> Result<(), CommandError> {
    let result: Result<_, CommandError> = async {
        let active = active_mod_downloads().lock().await;
        let control = active
            .get(&download_key(&instance_id, &project_id))
            .ok_or_else(|| {
                CommandError::new(ErrorCode::InvalidInput, "Mod download is no longer active")
            })?;
        control
            .send(ModDownloadControlState::Cancelled)
            .map_err(|_| {
                CommandError::new(ErrorCode::InvalidInput, "Mod download is no longer active")
            })
    }
    .await;
    result
}

#[tauri::command]
pub async fn uninstall_modrinth_mod(
    instance_id: String,
    filename: String,
) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> =
        async { uninstall_file_content(MODS, instance_id, filename).await }.await;
    result
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
) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("content", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
        validate_filename(&filename)?;
        let instance = find_instance(&instance_id).await?;

        let _state = read_state(&instance, MODS).await?;
        let mods_dir = content_dir(&instance, MODS);
        let current_path = mods_dir.join(&filename);
        if !current_path.exists() {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("Mod file not found: {filename}"),
            ));
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
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("Cannot toggle mod, target already exists: {target_filename}"),
            ));
        }

        fs::rename(&current_path, &target_path).await.map_err(|e| {
            let detail = format!("toggle mod error: {e}");
            CommandError::from(e).context(detail)
        })?;

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
    .await;
    result
}

#[tauri::command]
pub async fn list_installed_mods(
    instance_id: String,
) -> Result<Vec<InstalledModView>, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("content-read", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
        let instance = find_instance(&instance_id).await?;
        let mods_dir = ensure_content_dir(&instance, MODS).await?;
        let state = read_state(&instance, MODS).await?;
        let mut entries = fs::read_dir(&mods_dir).await.map_err(|e| {
            let detail = format!("read mods dir error: {e}");
            CommandError::from(e).context(detail)
        })?;

        let mut out = Vec::new();
        while let Some(entry) = entries.next_entry().await.map_err(|e| {
            let detail = format!("mods dir iteration error: {e}");
            CommandError::from(e).context(detail)
        })? {
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
    .await;
    result
}

#[cfg(test)]
mod dependency_preview_tests {
    use super::*;

    #[test]
    fn preview_distinguishes_download_reuse_and_enable_for_the_exact_required_version() {
        let version = ModrinthVersion {
            project_id: "api".into(),
            id: "required".into(),
            ..Default::default()
        };
        let file = ModrinthVersionFile {
            filename: "api.jar".into(),
            ..Default::default()
        };
        let entry = InstalledModEntry {
            project_id: "api".into(),
            version_id: "required".into(),
            filename: "api.jar".into(),
            ..Default::default()
        };
        let state = HashMap::from([("api.jar".into(), entry)]);
        for (files, expected) in [
            (
                HashSet::from(["api.jar".into()]),
                ModrinthDependencyStatus::Installed,
            ),
            (
                HashSet::from(["api.jar.disabled".into()]),
                ModrinthDependencyStatus::Enable,
            ),
            (HashSet::new(), ModrinthDependencyStatus::Download),
        ] {
            assert_eq!(
                ModrinthDependencyStatus::for_file(&version, &file, &state, &files),
                expected
            );
        }
        let available = HashSet::from(["api.jar".into()]);
        let mut wrong_version = state.clone();
        wrong_version.get_mut("api.jar").unwrap().version_id = "older".into();
        assert_eq!(
            ModrinthDependencyStatus::for_file(&version, &file, &wrong_version, &available),
            ModrinthDependencyStatus::Download
        );
        assert_eq!(
            ModrinthDependencyStatus::for_file(&version, &file, &HashMap::new(), &available),
            ModrinthDependencyStatus::Download
        );
    }
}
