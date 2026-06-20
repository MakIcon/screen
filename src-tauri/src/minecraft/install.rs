use std::path::PathBuf;

use reqwest::Client;
use tauri::{AppHandle, Emitter};

use crate::{
    minecraft::ensure_loader_profile,
    models::{InstallProgressPayload, InstanceItem},
    paths::{ensure_layout, read_instances, write_instances},
};

use super::{
    assets::{download_asset_index, download_assets, download_logging_config, extract_natives},
    launch::download_libraries,
    version::resolve_version_meta,
};

async fn download_client_jar(
    app: &AppHandle,
    minecraft_version_id: &str,
    resolved: &crate::models::VersionMeta,
) -> Result<PathBuf, String> {
    let download = resolved
        .downloads
        .as_ref()
        .and_then(|d| d.client.as_ref())
        .ok_or_else(|| "client download missing".to_string())?;

    let path = crate::paths::versions_root()?
        .join(minecraft_version_id)
        .join(format!("{minecraft_version_id}.jar"));
    super::downloader::download_many(
        app,
        "client",
        vec![(
            download.url.clone(),
            path.clone(),
            format!("Client jar {minecraft_version_id}"),
        )],
    )
    .await?;
    Ok(path)
}

pub async fn install_instance_files(
    app: &AppHandle,
    instance: &InstanceItem,
) -> Result<(), String> {
    ensure_layout().await?;
    let client = Client::new();

    let _ = app.emit(
        "install-progress",
        InstallProgressPayload {
            phase: "prepare".to_string(),
            current: 0,
            total: 1,
            percent: 0.0,
            detail: "Resolving version metadata".to_string(),
        },
    );

    let version_id_to_resolve = ensure_loader_profile(&client, instance).await?;

    let resolved = resolve_version_meta(&client, &version_id_to_resolve).await?;
    let game_dir = PathBuf::from(&instance.game_dir);
    let instance_dir = game_dir
        .parent()
        .ok_or_else(|| "instance dir parent missing".to_string())?;
    let natives_dir = instance_dir.join("natives");

    if !game_dir.exists() {
        tokio::fs::create_dir_all(&game_dir)
            .await
            .map_err(|e| format!("create game dir error: {e}"))?;
    }

    download_client_jar(app, &instance.version, &resolved).await?;
    download_libraries(app, &resolved).await?;
    extract_natives(app, &resolved, &natives_dir).await?;
    let (asset_info, asset_json) = download_asset_index(app, &resolved).await?;
    download_assets(app, &asset_info.id, &asset_json, &game_dir).await?;
    download_logging_config(app, &resolved).await?;

    let _ = app.emit(
        "install-progress",
        InstallProgressPayload {
            phase: "done".to_string(),
            current: 1,
            total: 1,
            percent: 100.0,
            detail: "Install complete".to_string(),
        },
    );

    Ok(())
}

pub async fn update_instance_status(id: &str, status: &str) -> Result<(), String> {
    let mut items = read_instances().await?;
    for item in &mut items {
        if item.id == id {
            item.status = status.to_string();
        }
    }
    write_instances(&items).await
}
