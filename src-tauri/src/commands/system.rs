use crate::commands::errors::{CommandError, ErrorCode};
use crate::{
    minecraft::{fetch_loader_versions, fetch_manifest_network, mirrors, JavaInstallation},
    models::{JavaSettingsTestPayload, JavaSettingsTestResult, MinecraftManifest},
    paths::{detect_system_memory_gb, read_instances, read_settings},
};

#[tauri::command]
pub async fn get_minecraft_manifest() -> Result<MinecraftManifest, CommandError> {
    let result: Result<_, CommandError> = async {
        read_settings().await?;
        let client = mirrors::build_client()?;
        fetch_manifest_network(&client).await
    }
    .await;
    result
}

#[tauri::command]
pub async fn get_cached_minecraft_manifest() -> Result<Option<MinecraftManifest>, CommandError> {
    let result: Result<_, CommandError> =
        async { crate::minecraft::read_cached_manifest().await }.await;
    result
}

#[tauri::command]
pub async fn get_loader_versions(
    loader: String,
    mc_version: String,
) -> Result<Vec<String>, CommandError> {
    let result: Result<_, CommandError> = async {
        let client = mirrors::build_client()?;
        fetch_loader_versions(&client, &loader, &mc_version).await
    }
    .await;
    result
}

#[tauri::command]
pub async fn get_system_memory_gb() -> Result<f64, CommandError> {
    let result: Result<_, CommandError> = async { Ok(detect_system_memory_gb()) }.await;
    result
}

#[tauri::command]
pub async fn get_system_memory_info() -> Result<crate::memory::SystemMemoryInfo, CommandError> {
    Ok(crate::memory::detect_system_memory())
}

#[tauri::command]
pub async fn scan_java_installations() -> Result<Vec<JavaInstallation>, CommandError> {
    let result: Result<_, CommandError> = async {
        tokio::task::spawn_blocking(crate::minecraft::scan_java_installations)
            .await
            .map_err(|e| {
                let detail = format!("java scan task error: {e}");
                CommandError::from(e).context(detail)
            })
    }
    .await;
    result
}

#[tauri::command]
pub async fn test_java_settings(
    payload: JavaSettingsTestPayload,
) -> Result<JavaSettingsTestResult, CommandError> {
    let result: Result<_, CommandError> = async {
        let settings = read_settings().await?;
        let game_dir = if let Some(id) = &payload.instance_id {
            Some(
                read_instances()
                    .await?
                    .into_iter()
                    .find(|instance| &instance.id == id)
                    .ok_or_else(|| {
                        CommandError::new(ErrorCode::BuildNotFound, "Instance not found")
                    })?
                    .game_dir,
            )
        } else {
            None
        };
        crate::minecraft::test_java_settings(
            payload,
            settings.optimized_java_args,
            game_dir.as_deref(),
        )
        .await
    }
    .await;
    result
}
