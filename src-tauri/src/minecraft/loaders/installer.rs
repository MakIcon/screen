//! Forge and NeoForge: loaders distributed as a headless installer jar that
//! patches the vanilla client and writes a version profile into `versions/`.
//!
//! Both share the same installer framework (`--install-client <dir>`); they only
//! differ in their Maven coordinates, how a Minecraft version maps to loader
//! versions, and the profile id the installer produces.

use reqwest::Client;
use tokio::fs;

use crate::{
    minecraft::java::resolve_java_bin,
    models::InstanceItem,
    paths::{ensure_layout, launcher_root, versions_root},
};

use super::{
    common::{
        download_verified_installer, fetch_maven_versions, installer_marker, java_console_binary,
        run_client_installer, sorted_unique_versions, write_marker,
    },
    LoaderKind,
};

const NEOFORGE_MAVEN_BASE_URL: &str = "https://maven.neoforged.net/releases/net/neoforged/neoforge";
const FORGE_MAVEN_BASE_URL: &str = "https://maven.minecraftforge.net/net/minecraftforge/forge";

/// NeoForge versions for `1.20.2` look like `20.2.x`; modern calendar versions
/// (`26.1`) look like `26.1.x`. We list everything and filter by this prefix.
fn neoforge_version_prefix(game_version: &str) -> Result<String, String> {
    let release = game_version
        .trim()
        .split('-')
        .next()
        .ok_or_else(|| "Invalid Minecraft version".to_string())?;
    let parts = release
        .split('.')
        .map(|part| part.parse::<u32>())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| format!("NeoForge does not support Minecraft version {game_version}"))?;
    match parts.as_slice() {
        [1, minor] => Ok(format!("{minor}.0.")),
        [1, minor, patch] => Ok(format!("{minor}.{patch}.")),
        [year, release] if *year >= 26 => Ok(format!("{year}.{release}.0.")),
        [year, release, patch] if *year >= 26 => Ok(format!("{year}.{release}.{patch}.")),
        _ => Err(format!(
            "NeoForge does not support Minecraft version {game_version}"
        )),
    }
}

async fn fetch_neoforge_versions(
    client: &Client,
    game_version: &str,
) -> Result<Vec<String>, String> {
    let prefix = neoforge_version_prefix(game_version)?;
    let versions = fetch_maven_versions(
        client,
        &format!("{NEOFORGE_MAVEN_BASE_URL}/maven-metadata.xml"),
    )
    .await?;
    Ok(sorted_unique_versions(
        versions
            .into_iter()
            .filter(|version| version.starts_with(&prefix)),
    ))
}

/// Forge Maven lists versions as `<mc>-<forge>` (e.g. `1.21.1-52.0.63`). We keep
/// only those for the requested Minecraft version and return the `<forge>` part.
async fn fetch_forge_versions(client: &Client, game_version: &str) -> Result<Vec<String>, String> {
    let prefix = format!("{game_version}-");
    let versions = fetch_maven_versions(
        client,
        &format!("{FORGE_MAVEN_BASE_URL}/maven-metadata.xml"),
    )
    .await?;
    Ok(sorted_unique_versions(versions.into_iter().filter_map(
        |version| version.strip_prefix(&prefix).map(str::to_string),
    )))
}

pub(super) async fn fetch_loader_versions(
    client: &Client,
    kind: LoaderKind,
    game_version: &str,
) -> Result<Vec<String>, String> {
    match kind {
        LoaderKind::NeoForge => fetch_neoforge_versions(client, game_version).await,
        LoaderKind::Forge => fetch_forge_versions(client, game_version).await,
        _ => Err("loader is not installer-based".to_string()),
    }
}

/// `(installer jar url, cache directory name)` for the installer of `kind`.
fn installer_url(kind: LoaderKind, game_version: &str, loader_version: &str) -> Option<String> {
    match kind {
        LoaderKind::NeoForge => Some(format!(
            "{NEOFORGE_MAVEN_BASE_URL}/{loader_version}/neoforge-{loader_version}-installer.jar"
        )),
        LoaderKind::Forge => {
            let full = format!("{game_version}-{loader_version}");
            Some(format!(
                "{FORGE_MAVEN_BASE_URL}/{full}/forge-{full}-installer.jar"
            ))
        }
        _ => None,
    }
}

pub(super) async fn ensure_profile(
    client: &Client,
    kind: LoaderKind,
    instance: &InstanceItem,
    loader_version: &str,
) -> Result<String, String> {
    ensure_layout().await?;
    let id = super::synthetic_version_id(kind, &instance.version, loader_version);
    let json_path = versions_root()?.join(&id).join(format!("{id}.json"));
    let marker = installer_marker(kind.cache_dir_name(), loader_version)?;
    if json_path.exists() && marker.exists() {
        return Ok(id);
    }

    let jar_url = installer_url(kind, &instance.version, loader_version)
        .ok_or_else(|| "loader is not installer-based".to_string())?;
    let cache_path = launcher_root()?
        .join("cache")
        .join("loaders")
        .join(kind.cache_dir_name())
        .join(loader_version)
        .join("installer.jar");
    download_verified_installer(client, &jar_url, &cache_path).await?;

    let java_console = instance
        .java_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .map(java_console_binary)
        .unwrap_or_else(|| java_console_binary(&resolve_java_bin(&instance.version)));
    run_client_installer(cache_path, java_console).await?;

    if !json_path.exists() {
        return Err(format!(
            "{} installer did not create profile {id}",
            kind.canonical_name()
        ));
    }
    write_marker(&marker).await?;
    let _ = fs::metadata(&json_path).await; // touch to surface IO errors early
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_minecraft_versions_to_neoforge_prefixes() {
        assert_eq!(neoforge_version_prefix("1.20.2").unwrap(), "20.2.");
        assert_eq!(neoforge_version_prefix("1.21.1").unwrap(), "21.1.");
        assert_eq!(neoforge_version_prefix("26.1").unwrap(), "26.1.0.");
        assert_eq!(neoforge_version_prefix("26.1.2").unwrap(), "26.1.2.");
    }

    #[test]
    fn builds_forge_installer_url_with_combined_version() {
        let url = installer_url(LoaderKind::Forge, "1.21.1", "52.0.63").unwrap();
        assert_eq!(
            url,
            "https://maven.minecraftforge.net/net/minecraftforge/forge/1.21.1-52.0.63/forge-1.21.1-52.0.63-installer.jar"
        );
    }

    #[test]
    fn builds_neoforge_installer_url() {
        let url = installer_url(LoaderKind::NeoForge, "1.21.1", "21.1.200").unwrap();
        assert_eq!(
            url,
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.200/neoforge-21.1.200-installer.jar"
        );
    }
}
