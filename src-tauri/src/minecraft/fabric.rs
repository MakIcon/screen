use std::collections::HashSet;

use reqwest::Client;
use serde::Deserialize;
use tokio::fs;

use crate::{
    models::InstanceItem,
    paths::{ensure_layout, versions_root, FABRIC_META_BASE_URL},
};

#[derive(Debug, Deserialize)]
struct FabricLoaderVersionEntry {
    loader: FabricLoaderInfo,
}

#[derive(Debug, Deserialize)]
struct FabricLoaderInfo {
    version: String,
}

pub fn is_fabric_loader(loader: &str) -> bool {
    loader.eq_ignore_ascii_case("fabric")
}

pub fn synthetic_fabric_version_id(game_version: &str, loader_version: &str) -> String {
    format!("fabric-loader-{loader_version}-{game_version}")
}

pub fn effective_version_id_for_instance(instance: &InstanceItem) -> Result<String, String> {
    if is_fabric_loader(&instance.loader) {
        let loader_version = instance
            .fabric_loader_version
            .as_ref()
            .ok_or_else(|| "Fabric loader version missing for instance".to_string())?;
        Ok(synthetic_fabric_version_id(
            &instance.version,
            loader_version,
        ))
    } else {
        Ok(instance.version.clone())
    }
}

pub async fn fetch_fabric_loader_versions(
    client: &Client,
    game_version: &str,
) -> Result<Vec<String>, String> {
    let url = format!("{FABRIC_META_BASE_URL}/loader/{game_version}");
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("fabric loader versions request error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "fabric loader versions http error for {game_version}: {}",
            response.status()
        ));
    }

    let entries = response
        .json::<Vec<FabricLoaderVersionEntry>>()
        .await
        .map_err(|e| format!("fabric loader versions parse error: {e}"))?;

    let mut seen = HashSet::new();
    let mut versions = Vec::new();

    for entry in entries {
        if seen.insert(entry.loader.version.clone()) {
            versions.push(entry.loader.version);
        }
    }

    Ok(versions)
}

pub async fn ensure_fabric_version_json(
    client: &Client,
    game_version: &str,
    loader_version: &str,
) -> Result<String, String> {
    ensure_layout().await?;
    let synthetic_id = synthetic_fabric_version_id(game_version, loader_version);
    let version_dir = versions_root()?.join(&synthetic_id);
    let json_path = version_dir.join(format!("{synthetic_id}.json"));

    if json_path.exists() {
        return Ok(synthetic_id);
    }

    fs::create_dir_all(&version_dir)
        .await
        .map_err(|e| format!("create fabric version dir error: {e}"))?;

    let url = format!("{FABRIC_META_BASE_URL}/loader/{game_version}/{loader_version}/profile/json");

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("fabric profile request error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "fabric profile http error for {game_version}/{loader_version}: {}",
            response.status()
        ));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("fabric profile body error: {e}"))?;

    fs::write(&json_path, body)
        .await
        .map_err(|e| format!("write fabric version json error: {e}"))?;

    Ok(synthetic_id)
}
