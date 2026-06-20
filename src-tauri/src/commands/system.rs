use reqwest::Client;

use crate::{
    minecraft::{fetch_loader_versions, fetch_manifest_network},
    models::MinecraftManifest,
    paths::detect_system_memory_gb,
};

#[tauri::command]
pub async fn get_minecraft_manifest() -> Result<MinecraftManifest, String> {
    let client = Client::new();
    fetch_manifest_network(&client).await
}

#[tauri::command]
pub async fn get_loader_versions(
    loader: String,
    mc_version: String,
) -> Result<Vec<String>, String> {
    let client = Client::new();
    fetch_loader_versions(&client, &loader, &mc_version).await
}

#[tauri::command]
pub async fn get_system_memory_gb() -> Result<u32, String> {
    Ok(detect_system_memory_gb())
}
