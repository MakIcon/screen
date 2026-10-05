use crate::{
    minecraft::{fetch_loader_versions, fetch_manifest_network, mirrors, JavaInstallation},
    models::{JavaSettingsTestPayload, JavaSettingsTestResult, MinecraftManifest},
    paths::{detect_system_memory_gb, read_instances, read_settings},
};

#[tauri::command]
pub async fn get_minecraft_manifest() -> Result<MinecraftManifest, String> {
    let client = mirrors::build_client()?;
    fetch_manifest_network(&client).await
}

#[tauri::command]
pub async fn get_loader_versions(
    loader: String,
    mc_version: String,
) -> Result<Vec<String>, String> {
    let client = mirrors::build_client()?;
    fetch_loader_versions(&client, &loader, &mc_version).await
}

#[tauri::command]
pub async fn get_system_memory_gb() -> Result<u32, String> {
    Ok(detect_system_memory_gb())
}

#[tauri::command]
pub async fn scan_java_installations() -> Result<Vec<JavaInstallation>, String> {
    tokio::task::spawn_blocking(crate::minecraft::scan_java_installations)
        .await
        .map_err(|e| format!("java scan task error: {e}"))
}

#[tauri::command]
pub async fn test_java_settings(
    payload: JavaSettingsTestPayload,
) -> Result<JavaSettingsTestResult, String> {
    let settings = read_settings().await?;
    let game_dir = if let Some(id) = &payload.instance_id {
        Some(
            read_instances()
                .await?
                .into_iter()
                .find(|instance| &instance.id == id)
                .ok_or_else(|| "Instance not found".to_string())?
                .game_dir,
        )
    } else {
        None
    };
    crate::minecraft::test_java_settings(payload, settings.optimized_java_args, game_dir.as_deref())
        .await
}
