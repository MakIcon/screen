use crate::models::ActionResult;

use super::{
    file_content::{
        install_file_content, list_file_content, search_file_content, uninstall_file_content,
        FileContentConfig,
    },
    InstalledModView, ModrinthSearchResponse,
};

const RESOURCE_PACKS: FileContentConfig = FileContentConfig::new(
    "resourcepacks",
    ".screenlauncher-modrinth-resourcepacks.json",
    "resourcepack",
    "Resource pack",
);

#[tauri::command]
pub async fn search_modrinth_resourcepacks(
    instance_id: Option<String>,
    query: String,
    game_version: String,
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        search_file_content(
            RESOURCE_PACKS,
            instance_id,
            query,
            game_version,
            offset,
            limit,
        )
        .await
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn install_modrinth_resourcepack(
    instance_id: String,
    project_id: String,
) -> Result<ActionResult, crate::commands::errors::CommandError> {
    let result: Result<_, String> =
        async { install_file_content(RESOURCE_PACKS, instance_id, project_id).await }.await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn uninstall_modrinth_resourcepack(
    instance_id: String,
    filename: String,
) -> Result<ActionResult, crate::commands::errors::CommandError> {
    let result: Result<_, String> =
        async { uninstall_file_content(RESOURCE_PACKS, instance_id, filename).await }.await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn list_installed_resourcepacks(
    instance_id: String,
) -> Result<Vec<InstalledModView>, crate::commands::errors::CommandError> {
    let result: Result<_, String> =
        async { list_file_content(RESOURCE_PACKS, instance_id).await }.await;
    result.map_err(crate::commands::errors::CommandError::from)
}
