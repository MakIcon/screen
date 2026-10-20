use std::path::PathBuf;

use tokio::fs;
use uuid::Uuid;

use std::collections::HashMap;
use tauri::AppHandle;

use crate::{
    commands::import_progress::{ImportContext, IMPORT_CANCELLED},
    commands::modrinth::{build_client, install_project_to_dir, InstalledModEntry},
    minecraft::{normalize_environment_variables, normalized_loader_and_version, normalized_ram},
    models::{
        CreateInstancePayload, ExportedItem, ImportContentResult, ImportInstancePayload,
        ImportInstanceResult, InstanceExportData, InstanceItem, InstanceSource,
        UpdateInstancePayload,
    },
    paths::{
        edit_instances, instances_root, launcher_root, make_instance_dir_name, now_string,
        read_instances, sanitize_name, unique_instance_dir,
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

const TRASH_PREFIX: &str = "TRASHED:";

pub(crate) fn is_trashed(instance: &InstanceItem) -> bool {
    instance.status.starts_with(TRASH_PREFIX)
}

#[tauri::command]
pub async fn delete_instance(
    instance_id: String,
) -> Result<(), crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let mut items = edit_instances().await?;
        let Some(index) = items.iter().position(|i| i.id == instance_id) else {
            return Err("Instance not found".into());
        };
        if is_trashed(&items[index]) {
            return Err("Build is already in the trash".into());
        }
        items[index].status = format!("{TRASH_PREFIX}{}", items[index].status);
        items.commit().await
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn list_instances() -> Result<Vec<InstanceItem>, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        Ok(read_instances()
            .await?
            .into_iter()
            .filter(|item| !is_trashed(item))
            .collect())
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn list_deleted_instances(
) -> Result<Vec<InstanceItem>, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        Ok(read_instances()
            .await?
            .into_iter()
            .filter(is_trashed)
            .collect())
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn restore_instance(
    instance_id: String,
) -> Result<InstanceItem, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let mut items = edit_instances().await?;
        let index = items
            .iter()
            .position(|item| item.id == instance_id && is_trashed(item))
            .ok_or_else(|| "Build is not in the trash".to_string())?;
        if items
            .iter()
            .any(|item| !is_trashed(item) && item.name.eq_ignore_ascii_case(&items[index].name))
        {
            return Err("An active build already has this name".into());
        }
        if !PathBuf::from(&items[index].game_dir).exists() {
            return Err("Build files are missing; cannot restore".into());
        }
        items[index].status = items[index]
            .status
            .strip_prefix(TRASH_PREFIX)
            .filter(|status| !status.is_empty() && *status != "UPDATING")
            .unwrap_or("EMPTY")
            .to_string();
        let restored = items[index].clone();
        items.commit().await?;
        Ok(restored)
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn purge_deleted_instance(
    instance_id: String,
) -> Result<(), crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let mut items = edit_instances().await?;
        let index = items
            .iter()
            .position(|item| item.id == instance_id && is_trashed(item))
            .ok_or_else(|| "Build is not in the trash".to_string())?;
        let instance_dir = PathBuf::from(&items[index].game_dir)
            .parent()
            .ok_or_else(|| "Instance directory is missing".to_string())?
            .to_path_buf();
        if instance_dir.exists() {
            let root = fs::canonicalize(instances_root()?)
                .await
                .map_err(|e| format!("resolve instances root error: {e}"))?;
            let target = fs::canonicalize(&instance_dir)
                .await
                .map_err(|e| format!("resolve instance directory error: {e}"))?;
            if target == root || !target.starts_with(&root) {
                return Err("Build directory is outside the instances folder".into());
            }
            for other in items
                .iter()
                .enumerate()
                .filter_map(|(other_index, item)| (other_index != index).then_some(item))
            {
                let Some(other_dir) = PathBuf::from(&other.game_dir)
                    .parent()
                    .map(|path| path.to_path_buf())
                else {
                    continue;
                };
                if other_dir.exists()
                    && fs::canonicalize(&other_dir)
                        .await
                        .map_err(|e| format!("resolve another build directory error: {e}"))?
                        == target
                {
                    return Err("Another build uses the same directory".into());
                }
            }
            fs::remove_dir_all(&instance_dir)
                .await
                .map_err(|e| format!("delete instance dir error: {e}"))?;
        }
        let backups_dir = launcher_root()?.join("world-backups").join(&instance_id);
        if backups_dir.exists() {
            fs::remove_dir_all(&backups_dir)
                .await
                .map_err(|e| format!("delete world backups error: {e}"))?;
        }
        items.remove(index);
        items.commit().await
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn create_instance(
    payload: CreateInstancePayload,
) -> Result<InstanceItem, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let environment_variables = normalize_environment_variables(payload.environment_variables)?;
        let mut items = edit_instances().await?;
        let clean_name = sanitize_name(&payload.name);

        if clean_name.is_empty() {
            return Err("Build name is empty".into());
        }

        if items
            .iter()
            .any(|i| !is_trashed(i) && i.name.eq_ignore_ascii_case(&clean_name))
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
            source: InstanceSource::Official,
            pinned: false,
            version: payload.version.clone(),
            loader: loader_kind.canonical_name().to_string(),
            loader_version,
            status: "EMPTY".to_string(),
            ram: normalized_ram(payload.ram),
            java_args: normalize_optional_text(payload.java_args),
            java_path: normalize_optional_path(payload.java_path),
            environment_variables,
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
        items.commit().await?;

        Ok(item)
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn update_instance(
    payload: UpdateInstancePayload,
) -> Result<InstanceItem, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let environment_variables = normalize_environment_variables(payload.environment_variables)?;
        let mut items = edit_instances().await?;
        let clean_name = sanitize_name(&payload.name);

        if clean_name.is_empty() {
            return Err("Build name is empty".into());
        }
        if items.iter().any(|item| {
            !is_trashed(item)
                && item.id != payload.id
                && item.name.eq_ignore_ascii_case(&clean_name)
        }) {
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
            source: old_item.source,
            pinned: payload.pinned,
            version: payload.version.clone(),
            loader: loader_kind.canonical_name().to_string(),
            loader_version,
            status: old_item.status,
            ram: normalized_ram(payload.ram),
            java_args: normalize_optional_text(payload.java_args),
            java_path: normalize_optional_path(payload.java_path),
            environment_variables,
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
        items.commit().await?;

        let meta_path = final_instance_dir.join("instance.json");
        let raw = serde_json::to_string_pretty(&updated_item)
            .map_err(|e| format!("serialize instance meta error: {e}"))?;

        fs::write(meta_path, raw)
            .await
            .map_err(|e| format!("write instance meta error: {e}"))?;

        Ok(updated_item)
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn get_instance_export_data(
    instance_id: String,
) -> Result<InstanceExportData, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
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

            let mut tracked_filenames = std::collections::HashSet::new();
            let mut result = Vec::new();
            for (filename, entry) in &state {
                if !directory.join(filename).is_file()
                    && !directory.join(format!("{filename}.disabled")).is_file()
                {
                    continue;
                }
                tracked_filenames.insert(filename.to_lowercase());
                result.push(ExportedItem {
                    project_id: Some(entry.project_id.clone()),
                    title: entry.title.clone(),
                    source: "modrinth".to_string(),
                    icon_url: entry.icon_url.clone(),
                });
            }

            if let Ok(mut entries) = fs::read_dir(&directory).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let Ok(file_type) = entry.file_type().await else {
                        continue;
                    };
                    if !file_type.is_file() {
                        continue;
                    }
                    let filename = entry.file_name().to_string_lossy().to_string();
                    let base_filename = filename.strip_suffix(".disabled").unwrap_or(&filename);
                    if filename == state_file
                        || tracked_filenames.contains(&base_filename.to_lowercase())
                    {
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
            environment_variables: instance.environment_variables,
            window_width: instance.window_width,
            window_height: instance.window_height,
            fullscreen: instance.fullscreen,
            mods,
            shaders,
            resource_packs,
        })
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

async fn install_import_content(
    item: &InstanceItem,
    mods: &[ExportedItem],
    shaders: &[ExportedItem],
    resource_packs: &[ExportedItem],
    context: Option<&ImportContext>,
) -> Result<Vec<ImportContentResult>, String> {
    let client = build_client();
    let game_dir = PathBuf::from(&item.game_dir);
    let loader = item.loader.to_lowercase();
    let mod_loaders = if loader == "vanilla" {
        Vec::new()
    } else {
        vec![loader.as_str()]
    };
    let mut results = Vec::new();
    let total = mods.len() + shaders.len() + resource_packs.len();
    if let Some(context) = context {
        context.emit("installing", 0, total, "");
    }
    for (category, directory, state_file, entries, loaders) in [
        (
            "mods",
            "mods",
            ".screenlauncher-modrinth.json",
            mods,
            mod_loaders.as_slice(),
        ),
        (
            "shaders",
            "shaderpacks",
            ".screenlauncher-modrinth-shaderpacks.json",
            shaders,
            &[][..],
        ),
        (
            "resourcePacks",
            "resourcepacks",
            ".screenlauncher-modrinth-resourcepacks.json",
            resource_packs,
            &[][..],
        ),
    ] {
        if entries.is_empty() {
            continue;
        }
        let target_dir = game_dir.join(directory);
        let state_path = target_dir.join(state_file);
        let mut state: HashMap<String, InstalledModEntry> = match fs::read(&state_path).await {
            Ok(raw) => serde_json::from_slice(&raw).unwrap_or_default(),
            Err(_) => HashMap::new(),
        };
        for exported in entries {
            if let Some(context) = context {
                context.check()?;
                context.emit("installing", results.len(), total, &exported.title);
            }
            let result = async {
                if exported.source != "modrinth" {
                    return Err(
                        "Local files are not embedded in .slbuild; copy this file manually"
                            .to_string(),
                    );
                }
                let project_id = exported
                    .project_id
                    .as_deref()
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| "Missing Modrinth project id".to_string())?;
                if category == "mods" && loaders.is_empty() {
                    return Err("Vanilla builds cannot install mods".to_string());
                }
                let client = client.as_ref().map_err(|error| error.clone())?;
                fs::create_dir_all(&target_dir)
                    .await
                    .map_err(|error| format!("create content folder error: {error}"))?;
                let installation = install_project_to_dir(
                    client,
                    item,
                    project_id,
                    &target_dir,
                    loaders,
                    &mut state,
                    None,
                );
                if let Some(context) = context {
                    context.run(installation).await?;
                } else {
                    installation.await?;
                }
                let raw = serde_json::to_vec_pretty(&state).map_err(|error| error.to_string())?;
                fs::write(&state_path, raw)
                    .await
                    .map_err(|error| format!("save installed content state error: {error}"))
            }
            .await;
            if matches!(&result, Err(error) if error == IMPORT_CANCELLED) {
                return Err(IMPORT_CANCELLED.to_string());
            }
            results.push(ImportContentResult {
                category: category.to_string(),
                item: exported.clone(),
                success: result.is_ok(),
                message: result.err().unwrap_or_else(|| "Installed".to_string()),
            });
            if let Some(context) = context {
                context.emit("installing", results.len(), total, &exported.title);
            }
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn retry_import_content(
    app: AppHandle,
    operation_id: String,
    instance_id: String,
    mods: Vec<ExportedItem>,
    shaders: Vec<ExportedItem>,
    resource_packs: Vec<ExportedItem>,
) -> Result<Vec<ImportContentResult>, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let context = ImportContext::start(app, operation_id).await?;
        let result =
            retry_import_content_inner(instance_id, mods, shaders, resource_packs, &context).await;
        context.finish().await;
        result
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

async fn retry_import_content_inner(
    instance_id: String,
    mods: Vec<ExportedItem>,
    shaders: Vec<ExportedItem>,
    resource_packs: Vec<ExportedItem>,
    context: &ImportContext,
) -> Result<Vec<ImportContentResult>, String> {
    let item = read_instances()
        .await?
        .into_iter()
        .find(|item| item.id == instance_id && !is_trashed(item))
        .ok_or_else(|| "Build not found".to_string())?;
    install_import_content(&item, &mods, &shaders, &resource_packs, Some(context)).await
}

#[tauri::command]
pub async fn import_instance(
    app: AppHandle,
    operation_id: String,
    payload: ImportInstancePayload,
) -> Result<ImportInstanceResult, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let context = ImportContext::start(app, operation_id).await?;
        let result = import_instance_inner(payload, &context).await;
        context.finish().await;
        result
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

async fn import_instance_inner(
    payload: ImportInstancePayload,
    context: &ImportContext,
) -> Result<ImportInstanceResult, String> {
    context.check()?;
    let item = create_imported_instance(payload.clone()).await?;
    let result = install_import_content(
        &item,
        &payload.mods,
        &payload.shaders,
        &payload.resource_packs,
        Some(context),
    )
    .await;
    if matches!(&result, Err(error) if error == IMPORT_CANCELLED) {
        discard_imported_instance(&item).await?;
    }
    let items = result?;
    if let Err(error) = context.check() {
        discard_imported_instance(&item).await?;
        return Err(error);
    }
    context.emit("complete", items.len(), items.len(), "");
    Ok(ImportInstanceResult {
        instance: item,
        items,
    })
}

pub(crate) async fn discard_imported_instance(item: &InstanceItem) -> Result<(), String> {
    delete_instance(item.id.clone()).await?;
    purge_deleted_instance(item.id.clone())
        .await
        .map_err(String::from)
}

pub(crate) async fn create_imported_instance(
    payload: ImportInstancePayload,
) -> Result<InstanceItem, String> {
    let environment_variables = normalize_environment_variables(payload.environment_variables)?;
    let mut items = edit_instances().await?;
    let clean_name = sanitize_name(&payload.name);

    if clean_name.is_empty() {
        return Err("Build name is empty".into());
    }

    if items
        .iter()
        .any(|i| !is_trashed(i) && i.name.eq_ignore_ascii_case(&clean_name))
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
        source: InstanceSource::Imported,
        pinned: false,
        version: payload.version.clone(),
        loader: loader_kind.canonical_name().to_string(),
        loader_version,
        status: "EMPTY".to_string(),
        ram: normalized_ram(payload.ram),
        java_args: normalize_optional_text(payload.java_args),
        java_path: normalize_optional_path(payload.java_path),
        environment_variables,
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
    items.commit().await?;

    Ok(item)
}

#[cfg(test)]
mod tests {
    use super::install_import_content;
    use crate::models::{ExportedItem, InstanceItem};

    #[tokio::test]
    async fn import_reports_local_files_that_slbuild_cannot_supply() {
        let instance = InstanceItem {
            id: "inst-test".into(),
            name: "TEST".into(),
            source: Default::default(),
            pinned: false,
            version: "1.21.1".into(),
            loader: "Fabric".into(),
            loader_version: Some("0.16.0".into()),
            status: "EMPTY".into(),
            ram: 4,
            java_args: None,
            java_path: None,
            environment_variables: Default::default(),
            window_width: None,
            window_height: None,
            fullscreen: false,
            last_played: "NEVER".into(),
            playtime_secs: 0,
            created_at: "0".into(),
            game_dir: String::new(),
        };
        let local = ExportedItem {
            project_id: None,
            title: "local.jar".into(),
            source: "local".into(),
            icon_url: None,
        };
        let results = install_import_content(&instance, &[local], &[], &[], None)
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(!results[0].success);
        assert!(results[0].message.contains("not embedded"));
    }
}
