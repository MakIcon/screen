//! Mod-loader support.
//!
//! Each loader is one of two shapes:
//!   * **profile-based** (Fabric, Quilt) — a version profile JSON is downloaded
//!     straight from the loader's meta API ([`profile`]).
//!   * **installer-based** (Forge, NeoForge) — a headless installer jar patches
//!     the client and emits a profile ([`installer`]).
//!
//! [`LoaderKind`] is the single source of truth; the dispatchers below route to
//! the right backend so the rest of the app never has to branch on the loader.

mod common;
mod installer;
mod profile;

use reqwest::Client;

use crate::models::InstanceItem;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoaderKind {
    Vanilla,
    Fabric,
    Quilt,
    Forge,
    NeoForge,
}

impl LoaderKind {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "vanilla" => Ok(Self::Vanilla),
            "fabric" => Ok(Self::Fabric),
            "quilt" => Ok(Self::Quilt),
            "forge" => Ok(Self::Forge),
            "neoforge" => Ok(Self::NeoForge),
            _ => Err(format!("Unsupported loader: {}", value.trim())),
        }
    }

    pub fn canonical_name(self) -> &'static str {
        match self {
            Self::Vanilla => "Vanilla",
            Self::Fabric => "Fabric",
            Self::Quilt => "Quilt",
            Self::Forge => "Forge",
            Self::NeoForge => "NeoForge",
        }
    }

    pub fn modrinth_id(self) -> Option<&'static str> {
        match self {
            Self::Vanilla => None,
            Self::Fabric => Some("fabric"),
            Self::Quilt => Some("quilt"),
            Self::Forge => Some("forge"),
            Self::NeoForge => Some("neoforge"),
        }
    }

    pub fn requires_version(self) -> bool {
        self != Self::Vanilla
    }

    /// Whether installing this loader runs a headless installer jar.
    fn is_installer_based(self) -> bool {
        matches!(self, Self::Forge | Self::NeoForge)
    }

    /// Cache sub-directory name for installer-based loaders.
    fn cache_dir_name(self) -> &'static str {
        match self {
            Self::Forge => "forge",
            Self::NeoForge => "neoforge",
            _ => "loader",
        }
    }
}

pub fn normalized_loader_and_version(
    loader: &str,
    loader_version: Option<String>,
) -> Result<(LoaderKind, Option<String>), String> {
    let kind = LoaderKind::parse(loader)?;
    if !kind.requires_version() {
        return Ok((kind, None));
    }
    let version = loader_version
        .as_deref()
        .ok_or_else(|| format!("{} loader version is required", kind.canonical_name()))?;
    Ok((
        kind,
        Some(common::validate_loader_version(version)?.to_string()),
    ))
}

/// The on-disk `versions/<id>` profile id for a loader + game version.
pub fn synthetic_version_id(kind: LoaderKind, game_version: &str, loader_version: &str) -> String {
    match kind {
        LoaderKind::Vanilla => game_version.to_string(),
        LoaderKind::Fabric => format!("fabric-loader-{loader_version}-{game_version}"),
        LoaderKind::Quilt => format!("quilt-loader-{loader_version}-{game_version}"),
        LoaderKind::Forge => format!("{game_version}-forge-{loader_version}"),
        LoaderKind::NeoForge => format!("neoforge-{loader_version}"),
    }
}

pub fn effective_version_id_for_instance(instance: &InstanceItem) -> Result<String, String> {
    let kind = LoaderKind::parse(&instance.loader)?;
    if !kind.requires_version() {
        return Ok(instance.version.clone());
    }
    let loader_version = instance.loader_version.as_deref().ok_or_else(|| {
        format!(
            "{} loader version missing for instance",
            kind.canonical_name()
        )
    })?;
    Ok(synthetic_version_id(
        kind,
        &instance.version,
        loader_version,
    ))
}

pub async fn fetch_loader_versions(
    client: &Client,
    loader: &str,
    game_version: &str,
) -> Result<Vec<String>, String> {
    let kind = LoaderKind::parse(loader)?;
    match kind {
        LoaderKind::Vanilla => Ok(Vec::new()),
        LoaderKind::Fabric | LoaderKind::Quilt => {
            profile::fetch_loader_versions(client, kind, game_version).await
        }
        LoaderKind::Forge | LoaderKind::NeoForge => {
            installer::fetch_loader_versions(client, kind, game_version).await
        }
    }
}

pub async fn ensure_loader_profile(
    client: &Client,
    instance: &InstanceItem,
) -> Result<String, String> {
    let kind = LoaderKind::parse(&instance.loader)?;
    if kind == LoaderKind::Vanilla {
        return Ok(instance.version.clone());
    }
    let loader_version = common::validate_loader_version(
        instance
            .loader_version
            .as_deref()
            .ok_or_else(|| format!("{} loader version missing", kind.canonical_name()))?,
    )?;
    if kind.is_installer_based() {
        installer::ensure_profile(client, kind, instance, loader_version).await
    } else {
        profile::ensure_profile(client, kind, &instance.version, loader_version).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_supported_loaders() {
        assert_eq!(LoaderKind::parse(" vanilla ").unwrap(), LoaderKind::Vanilla);
        assert_eq!(LoaderKind::parse("FABRIC").unwrap(), LoaderKind::Fabric);
        assert_eq!(LoaderKind::parse("quilt").unwrap(), LoaderKind::Quilt);
        assert_eq!(LoaderKind::parse("Forge").unwrap(), LoaderKind::Forge);
        assert_eq!(LoaderKind::parse("NeoForge").unwrap(), LoaderKind::NeoForge);
        assert!(LoaderKind::parse("LiteLoader").is_err());
    }

    #[test]
    fn requires_versions_for_mod_loaders() {
        assert!(normalized_loader_and_version("Vanilla", None).is_ok());
        assert!(normalized_loader_and_version("Fabric", None).is_err());
        assert!(normalized_loader_and_version("Quilt", Some("0.29.2".into())).is_ok());
        assert!(normalized_loader_and_version("Forge", Some("../bad".into())).is_err());
    }

    #[test]
    fn builds_synthetic_profile_ids() {
        assert_eq!(
            synthetic_version_id(LoaderKind::Forge, "1.21.1", "52.0.63"),
            "1.21.1-forge-52.0.63"
        );
        assert_eq!(
            synthetic_version_id(LoaderKind::NeoForge, "1.21.1", "21.1.200"),
            "neoforge-21.1.200"
        );
        assert_eq!(
            synthetic_version_id(LoaderKind::Fabric, "1.21.1", "0.16.14"),
            "fabric-loader-0.16.14-1.21.1"
        );
    }
}
