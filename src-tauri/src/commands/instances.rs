use crate::commands::errors::{CommandError, ErrorCode};
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
pub async fn delete_instance(instance_id: String) -> Result<(), CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("delete", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
        let mut items = edit_instances().await?;
        let Some(index) = items.iter().position(|i| i.id == instance_id) else {
            return Err(CommandError::new(
                ErrorCode::BuildNotFound,
                "Instance not found",
            ));
        };
        if is_trashed(&items[index]) {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "Build is already in the trash",
            ));
        }
        items[index].status = format!("{TRASH_PREFIX}{}", items[index].status);
        items.commit().await
    }
    .await;
    result
}

#[tauri::command]
pub async fn list_instances() -> Result<Vec<InstanceItem>, CommandError> {
    let result: Result<_, CommandError> = async {
        Ok(read_instances()
            .await?
            .into_iter()
            .filter(|item| !is_trashed(item))
            .collect())
    }
    .await;
    result
}

#[tauri::command]
pub async fn list_deleted_instances() -> Result<Vec<InstanceItem>, CommandError> {
    let result: Result<_, CommandError> = async {
        Ok(read_instances()
            .await?
            .into_iter()
            .filter(is_trashed)
            .collect())
    }
    .await;
    result
}

#[tauri::command]
pub async fn restore_instance(instance_id: String) -> Result<InstanceItem, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("restore", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
        let mut items = edit_instances().await?;
        let index = items
            .iter()
            .position(|item| item.id == instance_id && is_trashed(item))
            .ok_or_else(|| {
                CommandError::new(ErrorCode::InvalidInput, "Build is not in the trash")
            })?;
        if items
            .iter()
            .any(|item| !is_trashed(item) && item.name.eq_ignore_ascii_case(&items[index].name))
        {
            return Err(CommandError::new(
                ErrorCode::NameExists,
                "An active build already has this name",
            ));
        }
        if !PathBuf::from(&items[index].game_dir).exists() {
            return Err(CommandError::new(
                ErrorCode::FileNotFound,
                "Build files are missing; cannot restore",
            ));
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
    result
}

#[tauri::command]
pub async fn purge_deleted_instance(instance_id: String) -> Result<(), CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("purge", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
        let mut items = edit_instances().await?;
        let index = items
            .iter()
            .position(|item| item.id == instance_id && is_trashed(item))
            .ok_or_else(|| {
                CommandError::new(ErrorCode::InvalidInput, "Build is not in the trash")
            })?;
        let instance_dir = PathBuf::from(&items[index].game_dir)
            .parent()
            .ok_or_else(|| {
                CommandError::new(ErrorCode::FileNotFound, "Instance directory is missing")
            })?
            .to_path_buf();
        if instance_dir.exists() {
            let root = fs::canonicalize(instances_root()?).await.map_err(|e| {
                let detail = format!("resolve instances root error: {e}");
                CommandError::from(e).context(detail)
            })?;
            let target = fs::canonicalize(&instance_dir).await.map_err(|e| {
                let detail = format!("resolve instance directory error: {e}");
                CommandError::from(e).context(detail)
            })?;
            if target == root || !target.starts_with(&root) {
                return Err(CommandError::new(
                    ErrorCode::InvalidInput,
                    "Build directory is outside the instances folder",
                ));
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
                    && fs::canonicalize(&other_dir).await.map_err(|e| {
                        let detail = format!("resolve another build directory error: {e}");
                        CommandError::from(e).context(detail)
                    })? == target
                {
                    return Err(CommandError::new(
                        ErrorCode::InvalidInput,
                        "Another build uses the same directory",
                    ));
                }
            }
            fs::remove_dir_all(&instance_dir).await.map_err(|e| {
                let detail = format!("delete instance dir error: {e}");
                CommandError::from(e).context(detail)
            })?;
        }
        let backups_dir = launcher_root()?.join("world-backups").join(&instance_id);
        if backups_dir.exists() {
            fs::remove_dir_all(&backups_dir).await.map_err(|e| {
                let detail = format!("delete world backups error: {e}");
                CommandError::from(e).context(detail)
            })?;
        }
        items.remove(index);
        items.commit().await
    }
    .await;
    result
}

#[tauri::command]
pub async fn create_instance(payload: CreateInstancePayload) -> Result<InstanceItem, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("create", None)?;
        let environment_variables = normalize_environment_variables(payload.environment_variables)?;
        let mut items = edit_instances().await?;
        let clean_name = sanitize_name(&payload.name);

        if clean_name.is_empty() {
            return Err(CommandError::new(
                ErrorCode::NameRequired,
                "Build name is empty",
            ));
        }

        if items
            .iter()
            .any(|i| !is_trashed(i) && i.name.eq_ignore_ascii_case(&clean_name))
        {
            return Err(CommandError::new(
                ErrorCode::NameExists,
                "Build with this name already exists",
            ));
        }

        let (loader_kind, loader_version) =
            normalized_loader_and_version(&payload.loader, payload.loader_version.clone())?;

        let id = format!("inst-{}", Uuid::new_v4());
        let instance_dir = unique_instance_dir(&payload.version, &clean_name)?;
        let game_dir = instance_dir.join("minecraft");

        fs::create_dir_all(&game_dir).await.map_err(|e| {
            let detail = format!("create instance dir error: {e}");
            CommandError::from(e).context(detail)
        })?;

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
        let raw = serde_json::to_string_pretty(&item).map_err(|e| {
            let detail = format!("serialize instance meta error: {e}");
            CommandError::from(e).context(detail)
        })?;

        crate::paths::atomic_write_path(&meta_path, raw.as_bytes())
            .await
            .map_err(|e| {
                let detail = format!("write instance meta error: {e}");
                e.context(detail)
            })?;

        items.push(item.clone());
        items.commit().await?;

        Ok(item)
    }
    .await;
    result
}

#[tauri::command]
pub async fn update_instance(payload: UpdateInstancePayload) -> Result<InstanceItem, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("edit", Some(&payload.id))?;
        let _instance_guard = crate::operations::lock_instance(&payload.id).await;
        let environment_variables = normalize_environment_variables(payload.environment_variables)?;
        let mut items = edit_instances().await?;
        let clean_name = sanitize_name(&payload.name);

        if clean_name.is_empty() {
            return Err(CommandError::new(
                ErrorCode::NameRequired,
                "Build name is empty",
            ));
        }
        if items.iter().any(|item| {
            !is_trashed(item)
                && item.id != payload.id
                && item.name.eq_ignore_ascii_case(&clean_name)
        }) {
            return Err(CommandError::new(
                ErrorCode::NameExists,
                "Build with this name already exists",
            ));
        }

        let Some(index) = items.iter().position(|i| i.id == payload.id) else {
            return Err(CommandError::new(
                ErrorCode::BuildNotFound,
                "Instance not found",
            ));
        };

        let (loader_kind, loader_version) =
            normalized_loader_and_version(&payload.loader, payload.loader_version.clone())?;

        let old_item = items[index].clone();
        let old_instance_dir = PathBuf::from(&old_item.game_dir)
            .parent()
            .ok_or_else(|| CommandError::new(ErrorCode::InvalidInput, "instance dir missing"))?
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
                .map_err(|e| {
                    let detail = format!("rename instance dir error: {e}");
                    CommandError::from(e).context(detail)
                })?;
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
        let raw = serde_json::to_string_pretty(&updated_item).map_err(|e| {
            let detail = format!("serialize instance meta error: {e}");
            CommandError::from(e).context(detail)
        })?;

        crate::paths::atomic_write_path(&meta_path, raw.as_bytes())
            .await
            .map_err(|e| {
                let detail = format!("write instance meta error: {e}");
                e.context(detail)
            })?;

        Ok(updated_item)
    }
    .await;
    result
}

#[tauri::command]
pub async fn get_instance_export_data(
    instance_id: String,
) -> Result<InstanceExportData, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("export", Some(&instance_id))?;
        let _instance_guard = crate::operations::lock_instance(&instance_id).await;
        let items = read_instances().await?;
        let instance = items
            .into_iter()
            .find(|i| i.id == instance_id)
            .ok_or_else(|| CommandError::new(ErrorCode::BuildNotFound, "Instance not found"))?;

        instance_export_data_locked(instance).await
    }
    .await;
    result
}

/// The caller holds the build lock for the complete export.
pub(crate) async fn instance_export_data_locked(
    instance: InstanceItem,
) -> Result<InstanceExportData, CommandError> {
    let game_dir = PathBuf::from(&instance.game_dir);

    let read_export_items = |directory: PathBuf, state_file: &'static str| async move {
        crate::file_transaction::FileTransaction::recover(&directory)?;
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
        Ok::<_, CommandError>(result)
    };

    let mods = read_export_items(game_dir.join("mods"), ".screenlauncher-modrinth.json").await?;

    let shaders = read_export_items(
        game_dir.join("shaderpacks"),
        ".screenlauncher-modrinth-shaderpacks.json",
    )
    .await?;

    let resource_packs = read_export_items(
        game_dir.join("resourcepacks"),
        ".screenlauncher-modrinth-resourcepacks.json",
    )
    .await?;
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

async fn install_import_content(
    item: &InstanceItem,
    mods: &[ExportedItem],
    shaders: &[ExportedItem],
    resource_packs: &[ExportedItem],
    context: Option<&ImportContext>,
) -> Result<Vec<ImportContentResult>, CommandError> {
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
        crate::file_transaction::FileTransaction::recover(&target_dir)?;
        let state_path = target_dir.join(state_file);
        let mut state: HashMap<String, InstalledModEntry> = match fs::read(&state_path).await {
            Ok(raw) => serde_json::from_slice(&raw).map_err(|e| {
                let detail = format!("parse content state error: {e}");
                CommandError::from(e).context(detail)
            })?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => HashMap::new(),
            Err(e) => {
                return Err({
                    let detail = format!("read content state error: {e}");
                    CommandError::from(e).context(detail)
                })
            }
        };
        for exported in entries {
            if let Some(context) = context {
                context.check()?;
                context.emit("installing", results.len(), total, &exported.title);
            }
            let result = async {
                if exported.source != "modrinth" {
                    return Err(CommandError::new(
                        ErrorCode::InvalidInput,
                        "Local files are not embedded in .slbuild; copy this file manually",
                    ));
                }
                let project_id = exported
                    .project_id
                    .as_deref()
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        CommandError::new(ErrorCode::InvalidInput, "Missing Modrinth project id")
                    })?;
                if category == "mods" && loaders.is_empty() {
                    return Err(CommandError::new(
                        ErrorCode::InvalidInput,
                        "Vanilla builds cannot install mods",
                    ));
                }
                let client = client.as_ref().map_err(|error| error.clone())?;
                fs::create_dir_all(&target_dir).await.map_err(|error| {
                    let detail = format!("create content folder error: {error}");
                    CommandError::from(error).context(detail)
                })?;
                let installation = install_project_to_dir(
                    client,
                    item,
                    project_id,
                    &target_dir,
                    &state_path,
                    loaders,
                    &mut state,
                    None,
                );
                if let Some(context) = context {
                    context.run(installation).await?;
                } else {
                    installation.await?;
                }
                Ok(())
            }
            .await;
            if matches!(&result, Err(error) if error.code == ErrorCode::Cancelled) {
                return Err(CommandError::new(ErrorCode::Cancelled, IMPORT_CANCELLED));
            }
            results.push(ImportContentResult {
                category: category.to_string(),
                item: exported.clone(),
                success: result.is_ok(),
                message: result
                    .err()
                    .map(|error| error.detail)
                    .unwrap_or_else(|| "Installed".to_string()),
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
) -> Result<Vec<ImportContentResult>, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("import", Some(&instance_id))?;
        let context = ImportContext::start(app, operation_id).await?;
        let result =
            retry_import_content_inner(instance_id, mods, shaders, resource_packs, &context).await;
        context.finish().await;
        result
    }
    .await;
    result
}

async fn retry_import_content_inner(
    instance_id: String,
    mods: Vec<ExportedItem>,
    shaders: Vec<ExportedItem>,
    resource_packs: Vec<ExportedItem>,
    context: &ImportContext,
) -> Result<Vec<ImportContentResult>, CommandError> {
    let _instance_guard = crate::operations::lock_instance(&instance_id).await;
    let item = read_instances()
        .await?
        .into_iter()
        .find(|item| item.id == instance_id && !is_trashed(item))
        .ok_or_else(|| CommandError::new(ErrorCode::BuildNotFound, "Build not found"))?;
    install_import_content(&item, &mods, &shaders, &resource_packs, Some(context)).await
}

#[tauri::command]
pub async fn import_instance(
    app: AppHandle,
    operation_id: String,
    payload: ImportInstancePayload,
) -> Result<ImportInstanceResult, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("import", None)?;
        let context = ImportContext::start(app, operation_id).await?;
        let result = import_instance_inner(payload, &context).await;
        context.finish().await;
        result
    }
    .await;
    result
}

async fn import_instance_inner(
    payload: ImportInstancePayload,
    context: &ImportContext,
) -> Result<ImportInstanceResult, CommandError> {
    context.check()?;
    let (item, instance_guard) = create_imported_instance(payload.clone()).await?;
    let result = install_import_content(
        &item,
        &payload.mods,
        &payload.shaders,
        &payload.resource_packs,
        Some(context),
    )
    .await;
    drop(instance_guard);
    if matches!(&result, Err(error) if error.code == ErrorCode::Cancelled) {
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

pub(crate) async fn discard_imported_instance(item: &InstanceItem) -> Result<(), CommandError> {
    delete_instance(item.id.clone()).await?;
    purge_deleted_instance(item.id.clone()).await
}

pub(crate) async fn create_imported_instance(
    payload: ImportInstancePayload,
) -> Result<(InstanceItem, tokio::sync::OwnedMutexGuard<()>), CommandError> {
    let environment_variables = normalize_environment_variables(payload.environment_variables)?;
    let id = format!("inst-{}", uuid::Uuid::new_v4());
    let instance_guard = crate::operations::lock_instance(&id).await;
    let mut items = edit_instances().await?;
    let clean_name = sanitize_name(&payload.name);

    if clean_name.is_empty() {
        return Err(CommandError::new(
            ErrorCode::NameRequired,
            "Build name is empty",
        ));
    }

    if items
        .iter()
        .any(|i| !is_trashed(i) && i.name.eq_ignore_ascii_case(&clean_name))
    {
        return Err(CommandError::new(
            ErrorCode::NameExists,
            "Build with this name already exists",
        ));
    }

    let (loader_kind, loader_version) =
        normalized_loader_and_version(&payload.loader, payload.loader_version.clone())?;

    let instance_dir = unique_instance_dir(&payload.version, &clean_name)?;
    let game_dir = instance_dir.join("minecraft");

    fs::create_dir_all(&game_dir).await.map_err(|e| {
        let detail = format!("create instance dir error: {e}");
        CommandError::from(e).context(detail)
    })?;

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
    let raw = serde_json::to_string_pretty(&item).map_err(|e| {
        let detail = format!("serialize instance meta error: {e}");
        CommandError::from(e).context(detail)
    })?;

    crate::paths::atomic_write_path(&meta_path, raw.as_bytes())
        .await
        .map_err(|e| {
            let detail = format!("write instance meta error: {e}");
            e.context(detail)
        })?;

    items.push(item.clone());
    items.commit().await?;

    Ok((item, instance_guard))
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
