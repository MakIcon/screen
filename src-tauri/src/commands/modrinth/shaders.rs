use crate::commands::errors::CommandError;
use crate::models::ActionResult;
use tauri::AppHandle;

use super::{
    file_content::{
        install_file_content, list_file_content, search_file_content, uninstall_file_content,
        FileContentConfig,
    },
    InstalledModView, ModrinthSearchResponse,
};

const SHADERS: FileContentConfig = FileContentConfig::new(
    "shaderpacks",
    ".screenlauncher-modrinth-shaderpacks.json",
    "shader",
    "Shader",
);

#[tauri::command]
pub async fn search_modrinth_shaders(
    instance_id: Option<String>,
    query: String,
    game_version: String,
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, CommandError> {
    let result: Result<_, CommandError> = async {
        search_file_content(SHADERS, instance_id, query, game_version, offset, limit).await
    }
    .await;
    result
}

#[tauri::command]
pub async fn install_modrinth_shader(
    app: AppHandle,
    instance_id: String,
    project_id: String,
) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> =
        async { install_file_content(SHADERS, app, instance_id, project_id).await }.await;
    result
}

#[tauri::command]
pub async fn uninstall_modrinth_shader(
    instance_id: String,
    filename: String,
) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> =
        async { uninstall_file_content(SHADERS, instance_id, filename).await }.await;
    result
}

#[tauri::command]
pub async fn list_installed_shaders(
    instance_id: String,
) -> Result<Vec<InstalledModView>, CommandError> {
    let result: Result<_, CommandError> =
        async { list_file_content(SHADERS, instance_id).await }.await;
    result
}
