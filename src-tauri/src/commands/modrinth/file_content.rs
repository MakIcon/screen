use std::{
    collections::{HashMap, HashSet},
    path::{Component, Path, PathBuf},
};

use tokio::fs;

use crate::{
    models::{ActionResult, InstanceItem},
    paths::read_instances,
};

use super::{
    build_client, fetch_modrinth_search, install_project_to_dir, InstalledModEntry,
    InstalledModView, ModrinthSearchResponse, SEARCH_PAGE_SIZE_MAX,
};

#[derive(Clone, Copy)]
pub(super) struct FileContentConfig {
    directory: &'static str,
    state_file: &'static str,
    project_type: &'static str,
    label: &'static str,
}

impl FileContentConfig {
    pub(super) const fn new(
        directory: &'static str,
        state_file: &'static str,
        project_type: &'static str,
        label: &'static str,
    ) -> Self {
        Self {
            directory,
            state_file,
            project_type,
            label,
        }
    }
}

pub(super) fn content_dir(instance: &InstanceItem, config: FileContentConfig) -> PathBuf {
    PathBuf::from(&instance.game_dir).join(config.directory)
}

pub(super) fn metadata_path(instance: &InstanceItem, config: FileContentConfig) -> PathBuf {
    content_dir(instance, config).join(config.state_file)
}

pub(super) async fn find_instance(instance_id: &str) -> Result<InstanceItem, String> {
    let instance = read_instances()
        .await?
        .into_iter()
        .find(|instance| {
            instance.id == instance_id && !crate::commands::instances::is_trashed(instance)
        })
        .ok_or_else(|| "Instance not found".to_string())?;
    for category in ["mods", "shaderpacks", "resourcepacks"] {
        crate::file_transaction::FileTransaction::recover(
            &PathBuf::from(&instance.game_dir).join(category),
        )?;
    }
    Ok(instance)
}

pub(super) async fn ensure_content_dir(
    instance: &InstanceItem,
    config: FileContentConfig,
) -> Result<PathBuf, String> {
    let directory = content_dir(instance, config);
    fs::create_dir_all(&directory)
        .await
        .map_err(|error| format!("create {} directory error: {error}", config.directory))?;
    Ok(directory)
}

pub(super) async fn read_state(
    instance: &InstanceItem,
    config: FileContentConfig,
) -> Result<HashMap<String, InstalledModEntry>, String> {
    crate::file_transaction::FileTransaction::recover(&content_dir(instance, config))?;
    let path = metadata_path(instance, config);
    if !fs::try_exists(&path)
        .await
        .map_err(|error| format!("check {} state error: {error}", config.label))?
    {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(&path)
        .await
        .map_err(|error| format!("read {} state error: {error}", config.label))?;
    serde_json::from_str(&raw)
        .map_err(|error| format!("parse {} state error: {error}", config.label))
}

pub(super) fn validate_filename(filename: &str) -> Result<(), String> {
    let mut components = Path::new(filename).components();
    let is_plain_filename = !filename.bytes().any(|byte| byte == b'/' || byte == 92)
        && matches!(components.next(), Some(Component::Normal(_)))
        && components.next().is_none();

    if is_plain_filename {
        Ok(())
    } else {
        Err("Content filename must not contain a directory path".to_string())
    }
}

pub(super) async fn search_file_content(
    config: FileContentConfig,
    instance_id: Option<String>,
    query: String,
    game_version: String,
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, String> {
    let client = build_client()?;
    let mut response = fetch_modrinth_search(
        &client,
        &query,
        &game_version,
        config.project_type,
        &[],
        offset,
        limit.clamp(1, SEARCH_PAGE_SIZE_MAX),
    )
    .await?;

    if let Some(instance_id) = instance_id {
        let _operation = crate::operations::begin("content-read", Some(&instance_id))?;
        let _guard = crate::operations::lock_instance(&instance_id).await;
        let instance = find_instance(&instance_id).await?;
        let installed_project_ids = read_state(&instance, config)
            .await?
            .into_values()
            .map(|entry| entry.project_id)
            .collect::<HashSet<_>>();

        for hit in &mut response.hits {
            hit.installed = installed_project_ids.contains(&hit.project_id);
        }
    }

    Ok(response)
}

pub(super) async fn install_file_content(
    config: FileContentConfig,
    instance_id: String,
    project_id: String,
) -> Result<ActionResult, String> {
    let _operation = crate::operations::begin("content", Some(&instance_id))?;
    let _guard = crate::operations::lock_instance(&instance_id).await;
    let client = build_client()?;
    let instance = find_instance(&instance_id).await?;
    let target_dir = ensure_content_dir(&instance, config).await?;
    let mut install_batch = read_state(&instance, config).await?;

    install_project_to_dir(
        &client,
        &instance,
        &project_id,
        &target_dir,
        &metadata_path(&instance, config),
        &[],
        &mut install_batch,
        None,
    )
    .await?;

    Ok(ActionResult {
        ok: true,
        message: format!("{} installed", config.label),
        pid: None,
    })
}

pub(super) async fn uninstall_file_content(
    config: FileContentConfig,
    instance_id: String,
    filename: String,
) -> Result<ActionResult, String> {
    validate_filename(&filename)?;
    let _operation = crate::operations::begin("content", Some(&instance_id))?;
    let _guard = crate::operations::lock_instance(&instance_id).await;
    let instance = find_instance(&instance_id).await?;
    let directory = ensure_content_dir(&instance, config).await?;
    let base_filename = filename.strip_suffix(".disabled").unwrap_or(&filename);
    let mut state = read_state(&instance, config).await?;
    state.remove(base_filename);
    let raw = serde_json::to_vec_pretty(&state)
        .map_err(|e| format!("serialize content state error: {e}"))?;
    let mut transaction = crate::file_transaction::FileTransaction::new(&directory)?;
    let result = (|| {
        transaction.remove(&filename)?;
        transaction.write(config.state_file, &raw)
    })();
    if let Err(error) = result {
        return match transaction.rollback() {
            Ok(()) => Err(error),
            Err(rollback) => Err(format!("{error}; {rollback}")),
        };
    }
    transaction.commit()?;

    Ok(ActionResult {
        ok: true,
        message: format!("{} deleted", config.label),
        pid: None,
    })
}

pub(super) async fn list_file_content(
    config: FileContentConfig,
    instance_id: String,
) -> Result<Vec<InstalledModView>, String> {
    let _operation = crate::operations::begin("content-read", Some(&instance_id))?;
    let _guard = crate::operations::lock_instance(&instance_id).await;
    let instance = find_instance(&instance_id).await?;
    let directory = ensure_content_dir(&instance, config).await?;
    let state = read_state(&instance, config).await?;
    let mut directory_entries = fs::read_dir(&directory)
        .await
        .map_err(|error| format!("read {} directory error: {error}", config.directory))?;
    let mut installed = Vec::new();

    while let Some(entry) = directory_entries
        .next_entry()
        .await
        .map_err(|error| format!("{} directory iteration error: {error}", config.label))?
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

        if filename == config.state_file
            || (!filename.ends_with(".zip") && !filename.ends_with(".disabled"))
        {
            continue;
        }

        let enabled = !filename.ends_with(".disabled");
        let base_filename = filename.strip_suffix(".disabled").unwrap_or(&filename);
        if let Some(metadata) = state.get(base_filename) {
            installed.push(InstalledModView::from_metadata(filename, enabled, metadata));
        } else {
            let title = filename.clone();
            installed.push(InstalledModView::local(filename, enabled, title, "LOCAL"));
        }
    }

    installed.sort_by_key(|item| item.title.to_lowercase());
    Ok(installed)
}

#[cfg(test)]
mod tests {
    use super::validate_filename;

    #[test]
    fn content_filename_rejects_directory_traversal() {
        assert!(validate_filename("shader.zip").is_ok());
        assert!(validate_filename("../shader.zip").is_err());
        assert!(validate_filename("folder/shader.zip").is_err());
        assert!(validate_filename(r"folder\shader.zip").is_err());
    }
}
