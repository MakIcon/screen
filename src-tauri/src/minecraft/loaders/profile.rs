//! Fabric and Quilt: loaders that expose a ready-made version profile JSON over
//! an HTTP meta API. Installing is just downloading that JSON into `versions/`.

use crate::commands::errors::{CommandError, ErrorCode};
use reqwest::Client;
use serde::Deserialize;
use tokio::fs;

use crate::{
    minecraft::mirrors,
    paths::{ensure_layout, versions_root, FABRIC_META_BASE_URL},
};

use super::{common::sorted_unique_versions, LoaderKind};

pub(super) const QUILT_META_BASE_URL: &str = "https://meta.quiltmc.org/v3/versions";

#[derive(Debug, Deserialize)]
struct LoaderVersionEntry {
    loader: LoaderVersionInfo,
}

#[derive(Debug, Deserialize)]
struct LoaderVersionInfo {
    version: String,
}

fn meta_base_url(kind: LoaderKind) -> Option<&'static str> {
    match kind {
        LoaderKind::Fabric => Some(FABRIC_META_BASE_URL),
        LoaderKind::Quilt => Some(QUILT_META_BASE_URL),
        _ => None,
    }
}

pub(super) async fn fetch_loader_versions(
    client: &Client,
    kind: LoaderKind,
    game_version: &str,
) -> Result<Vec<String>, CommandError> {
    let base_url = meta_base_url(kind)
        .ok_or_else(|| CommandError::new(ErrorCode::Unsupported, "loader has no meta API"))?;
    let response =
        mirrors::get_with_fallback(client, &format!("{base_url}/loader/{game_version}")).await?;
    if !response.status().is_success() {
        return Err(CommandError::new(
            ErrorCode::Network,
            format!(
                "loader versions http error for {game_version}: {}",
                response.status()
            ),
        ));
    }
    let entries = response
        .json::<Vec<LoaderVersionEntry>>()
        .await
        .map_err(|e| {
            let detail = format!("loader versions parse error: {e}");
            CommandError::from(e).context(detail)
        })?;
    Ok(sorted_unique_versions(
        entries.into_iter().map(|entry| entry.loader.version),
    ))
}

pub(super) async fn ensure_profile(
    client: &Client,
    kind: LoaderKind,
    game_version: &str,
    loader_version: &str,
) -> Result<String, CommandError> {
    ensure_layout().await?;
    let base_url = meta_base_url(kind)
        .ok_or_else(|| CommandError::new(ErrorCode::Unsupported, "loader has no meta API"))?;
    let id = super::synthetic_version_id(kind, game_version, loader_version);
    let version_dir = versions_root()?.join(&id);
    let json_path = version_dir.join(format!("{id}.json"));
    if json_path.exists() {
        return Ok(id);
    }
    fs::create_dir_all(&version_dir).await.map_err(|e| {
        let detail = format!("create loader version dir error: {e}");
        CommandError::from(e).context(detail)
    })?;

    let url = format!("{base_url}/loader/{game_version}/{loader_version}/profile/json");
    let response = mirrors::get_with_fallback(client, &url).await?;
    if !response.status().is_success() {
        return Err(CommandError::new(
            ErrorCode::Network,
            format!(
                "loader profile http error for {game_version}/{loader_version}: {}",
                response.status()
            ),
        ));
    }
    let body = response.text().await.map_err(|e| {
        let detail = format!("loader profile body error: {e}");
        CommandError::from(e).context(detail)
    })?;
    fs::write(&json_path, body).await.map_err(|e| {
        let detail = format!("write loader version json error: {e}");
        CommandError::from(e).context(detail)
    })?;
    Ok(id)
}
