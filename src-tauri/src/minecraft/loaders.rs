use std::{cmp::Ordering, collections::HashSet, path::PathBuf, process::Command};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use quick_xml::de::from_str as from_xml_str;
use reqwest::Client;
use semver::Version;
use serde::Deserialize;
use sha1::{Digest, Sha1};
use tokio::fs;

use crate::{
    minecraft::java::resolve_java_bin,
    models::InstanceItem,
    paths::{ensure_layout, launcher_root, shared_root, versions_root, FABRIC_META_BASE_URL},
};

const QUILT_META_BASE_URL: &str = "https://meta.quiltmc.org/v3/versions";
const NEOFORGE_MAVEN_BASE_URL: &str = "https://maven.neoforged.net/releases/net/neoforged/neoforge";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoaderKind {
    Vanilla,
    Fabric,
    Quilt,
    NeoForge,
}

impl LoaderKind {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "vanilla" => Ok(Self::Vanilla),
            "fabric" => Ok(Self::Fabric),
            "quilt" => Ok(Self::Quilt),
            "neoforge" => Ok(Self::NeoForge),
            _ => Err(format!("Unsupported loader: {}", value.trim())),
        }
    }

    pub fn canonical_name(self) -> &'static str {
        match self {
            Self::Vanilla => "Vanilla",
            Self::Fabric => "Fabric",
            Self::Quilt => "Quilt",
            Self::NeoForge => "NeoForge",
        }
    }

    pub fn modrinth_id(self) -> Option<&'static str> {
        match self {
            Self::Vanilla => None,
            Self::Fabric => Some("fabric"),
            Self::Quilt => Some("quilt"),
            Self::NeoForge => Some("neoforge"),
        }
    }

    pub fn requires_version(self) -> bool {
        self != Self::Vanilla
    }
}

#[derive(Debug, Deserialize)]
struct LoaderVersionEntry {
    loader: LoaderVersionInfo,
}

#[derive(Debug, Deserialize)]
struct LoaderVersionInfo {
    version: String,
}

#[derive(Debug, Deserialize)]
struct MavenMetadata {
    versioning: MavenVersioning,
}

#[derive(Debug, Deserialize)]
struct MavenVersioning {
    versions: MavenVersions,
}

#[derive(Debug, Deserialize)]
struct MavenVersions {
    #[serde(rename = "version", default)]
    items: Vec<String>,
}

fn validate_loader_version(version: &str) -> Result<&str, String> {
    let clean = version.trim();
    if clean.is_empty()
        || !clean
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | '+'))
    {
        return Err("Invalid loader version".to_string());
    }
    Ok(clean)
}

fn compare_versions(a: &str, b: &str) -> Ordering {
    match (Version::parse(a), Version::parse(b)) {
        (Ok(a), Ok(b)) => {
            let stable_order = b.pre.is_empty().cmp(&a.pre.is_empty());
            if stable_order == Ordering::Equal {
                b.cmp(&a)
            } else {
                stable_order
            }
        }
        _ => b.cmp(a),
    }
}

fn sorted_unique_versions(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut versions = values
        .into_iter()
        .filter(|value| seen.insert(value.clone()))
        .collect::<Vec<_>>();
    versions.sort_by(|a, b| compare_versions(a, b));
    versions
}

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
    Ok((kind, Some(validate_loader_version(version)?.to_string())))
}

pub fn synthetic_version_id(kind: LoaderKind, game_version: &str, loader_version: &str) -> String {
    match kind {
        LoaderKind::Vanilla => game_version.to_string(),
        LoaderKind::Fabric => format!("fabric-loader-{loader_version}-{game_version}"),
        LoaderKind::Quilt => format!("quilt-loader-{loader_version}-{game_version}"),
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

async fn fetch_profile_loader_versions(
    client: &Client,
    base_url: &str,
    game_version: &str,
) -> Result<Vec<String>, String> {
    let response = client
        .get(format!("{base_url}/loader/{game_version}"))
        .send()
        .await
        .map_err(|e| format!("loader versions request error: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "loader versions http error for {game_version}: {}",
            response.status()
        ));
    }
    let entries = response
        .json::<Vec<LoaderVersionEntry>>()
        .await
        .map_err(|e| format!("loader versions parse error: {e}"))?;
    Ok(sorted_unique_versions(
        entries.into_iter().map(|entry| entry.loader.version),
    ))
}

async fn fetch_neoforge_versions(
    client: &Client,
    game_version: &str,
) -> Result<Vec<String>, String> {
    let prefix = neoforge_version_prefix(game_version)?;
    let response = client
        .get(format!("{NEOFORGE_MAVEN_BASE_URL}/maven-metadata.xml"))
        .send()
        .await
        .map_err(|e| format!("NeoForge metadata request error: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "NeoForge metadata http error: {}",
            response.status()
        ));
    }
    let body = response
        .text()
        .await
        .map_err(|e| format!("NeoForge metadata body error: {e}"))?;
    let metadata: MavenMetadata =
        from_xml_str(&body).map_err(|e| format!("NeoForge metadata parse error: {e}"))?;
    Ok(sorted_unique_versions(
        metadata
            .versioning
            .versions
            .items
            .into_iter()
            .filter(|version| version.starts_with(&prefix)),
    ))
}

pub async fn fetch_loader_versions(
    client: &Client,
    loader: &str,
    game_version: &str,
) -> Result<Vec<String>, String> {
    match LoaderKind::parse(loader)? {
        LoaderKind::Vanilla => Ok(Vec::new()),
        LoaderKind::Fabric => {
            fetch_profile_loader_versions(client, FABRIC_META_BASE_URL, game_version).await
        }
        LoaderKind::Quilt => {
            fetch_profile_loader_versions(client, QUILT_META_BASE_URL, game_version).await
        }
        LoaderKind::NeoForge => fetch_neoforge_versions(client, game_version).await,
    }
}

async fn ensure_json_profile(
    client: &Client,
    kind: LoaderKind,
    game_version: &str,
    loader_version: &str,
) -> Result<String, String> {
    ensure_layout().await?;
    let id = synthetic_version_id(kind, game_version, loader_version);
    let version_dir = versions_root()?.join(&id);
    let json_path = version_dir.join(format!("{id}.json"));
    if json_path.exists() {
        return Ok(id);
    }
    fs::create_dir_all(&version_dir)
        .await
        .map_err(|e| format!("create loader version dir error: {e}"))?;
    let url = match kind {
        LoaderKind::Fabric => {
            format!("{FABRIC_META_BASE_URL}/loader/{game_version}/{loader_version}/profile/json")
        }
        LoaderKind::Quilt => {
            format!("{QUILT_META_BASE_URL}/loader/{game_version}/{loader_version}/profile/json")
        }
        _ => return Err("Loader does not provide a JSON profile".to_string()),
    };
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("loader profile request error: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "loader profile http error for {game_version}/{loader_version}: {}",
            response.status()
        ));
    }
    let body = response
        .text()
        .await
        .map_err(|e| format!("loader profile body error: {e}"))?;
    fs::write(&json_path, body)
        .await
        .map_err(|e| format!("write loader version json error: {e}"))?;
    Ok(id)
}

fn java_console_binary(java_bin: &str) -> PathBuf {
    let path = PathBuf::from(java_bin);
    if path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.eq_ignore_ascii_case("javaw.exe"))
        .unwrap_or(false)
    {
        let console = path.with_file_name("java.exe");
        if !path.is_absolute() || console.exists() {
            return console;
        }
    }
    path
}

async fn download_neoforge_installer(
    client: &Client,
    loader_version: &str,
) -> Result<PathBuf, String> {
    let cache_dir = launcher_root()?
        .join("cache")
        .join("loaders")
        .join("neoforge")
        .join(loader_version);
    fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("create NeoForge cache error: {e}"))?;
    let installer = cache_dir.join(format!("neoforge-{loader_version}-installer.jar"));
    let base = format!(
        "{NEOFORGE_MAVEN_BASE_URL}/{loader_version}/neoforge-{loader_version}-installer.jar"
    );
    let expected_sha1 = client
        .get(format!("{base}.sha1"))
        .send()
        .await
        .map_err(|e| format!("NeoForge checksum request error: {e}"))?
        .error_for_status()
        .map_err(|e| format!("NeoForge checksum http error: {e}"))?
        .text()
        .await
        .map_err(|e| format!("NeoForge checksum body error: {e}"))?
        .trim()
        .to_string();
    let valid_cached = if installer.exists() {
        let bytes = fs::read(&installer)
            .await
            .map_err(|e| format!("read cached NeoForge installer error: {e}"))?;
        format!("{:x}", Sha1::digest(&bytes)).eq_ignore_ascii_case(&expected_sha1)
    } else {
        false
    };
    if valid_cached {
        return Ok(installer);
    }
    let bytes = client
        .get(base)
        .send()
        .await
        .map_err(|e| format!("NeoForge installer request error: {e}"))?
        .error_for_status()
        .map_err(|e| format!("NeoForge installer http error: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("NeoForge installer body error: {e}"))?;
    let actual_sha1 = format!("{:x}", Sha1::digest(&bytes));
    if !actual_sha1.eq_ignore_ascii_case(&expected_sha1) {
        return Err("NeoForge installer checksum mismatch".to_string());
    }
    fs::write(&installer, &bytes)
        .await
        .map_err(|e| format!("write NeoForge installer error: {e}"))?;
    Ok(installer)
}

async fn ensure_neoforge_profile(
    client: &Client,
    instance: &InstanceItem,
    loader_version: &str,
) -> Result<String, String> {
    ensure_layout().await?;
    let id = synthetic_version_id(LoaderKind::NeoForge, &instance.version, loader_version);
    let json_path = versions_root()?.join(&id).join(format!("{id}.json"));
    let marker = launcher_root()?
        .join("cache")
        .join("loaders")
        .join("neoforge")
        .join(loader_version)
        .join("installed.ok");
    if json_path.exists() && marker.exists() {
        return Ok(id);
    }
    let installer = download_neoforge_installer(client, loader_version).await?;
    let root = shared_root()?;
    let profiles = root.join("launcher_profiles.json");
    if !profiles.exists() {
        fs::write(&profiles, b"{\x22profiles\x22:{}}")
            .await
            .map_err(|e| format!("create launcher profile stub error: {e}"))?;
    }
    let configured_java = instance
        .java_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .map(java_console_binary)
        .unwrap_or_else(|| java_console_binary(&resolve_java_bin(&instance.version)));
    let output = tokio::task::spawn_blocking(move || {
        let mut command = Command::new(configured_java);
        command
            .arg("-jar")
            .arg(installer)
            .arg("--install-client")
            .arg(root);
        #[cfg(windows)]
        command.creation_flags(CREATE_NO_WINDOW);
        command.output()
    })
    .await
    .map_err(|e| format!("NeoForge installer task failed: {e}"))?
    .map_err(|e| format!("start NeoForge installer error: {e}"))?;
    if !output.status.success() {
        let details = format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let tail = details
            .chars()
            .rev()
            .take(8_000)
            .collect::<String>()
            .chars()
            .rev()
            .collect::<String>();
        return Err(format!("NeoForge installer failed: {}", tail.trim()));
    }
    if !json_path.exists() {
        return Err(format!("NeoForge installer did not create profile {id}"));
    }
    if let Some(parent) = marker.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create NeoForge marker directory error: {e}"))?;
    }
    fs::write(marker, b"ok")
        .await
        .map_err(|e| format!("write NeoForge install marker error: {e}"))?;
    Ok(id)
}

pub async fn ensure_loader_profile(
    client: &Client,
    instance: &InstanceItem,
) -> Result<String, String> {
    let kind = LoaderKind::parse(&instance.loader)?;
    if kind == LoaderKind::Vanilla {
        return Ok(instance.version.clone());
    }
    let loader_version = validate_loader_version(
        instance
            .loader_version
            .as_deref()
            .ok_or_else(|| format!("{} loader version missing", kind.canonical_name()))?,
    )?;
    match kind {
        LoaderKind::Vanilla => Ok(instance.version.clone()),
        LoaderKind::Fabric | LoaderKind::Quilt => {
            ensure_json_profile(client, kind, &instance.version, loader_version).await
        }
        LoaderKind::NeoForge => ensure_neoforge_profile(client, instance, loader_version).await,
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
        assert_eq!(LoaderKind::parse("NeoForge").unwrap(), LoaderKind::NeoForge);
        assert!(LoaderKind::parse("Forge").is_err());
    }

    #[test]
    fn requires_versions_for_mod_loaders() {
        assert!(normalized_loader_and_version("Vanilla", None).is_ok());
        assert!(normalized_loader_and_version("Fabric", None).is_err());
        assert!(normalized_loader_and_version("Quilt", Some("0.29.2".into())).is_ok());
        assert!(normalized_loader_and_version("NeoForge", Some("../bad".into())).is_err());
    }

    #[test]
    fn maps_minecraft_versions_to_neoforge_prefixes() {
        assert_eq!(neoforge_version_prefix("1.20.2").unwrap(), "20.2.");
        assert_eq!(neoforge_version_prefix("1.21.1").unwrap(), "21.1.");
        assert_eq!(neoforge_version_prefix("26.1").unwrap(), "26.1.0.");
        assert_eq!(neoforge_version_prefix("26.1.2").unwrap(), "26.1.2.");
    }

    #[test]
    fn stable_versions_sort_before_prereleases() {
        let versions = sorted_unique_versions(vec![
            "0.30.0-beta.1".into(),
            "0.29.1".into(),
            "0.29.2".into(),
        ]);
        assert_eq!(versions, vec!["0.29.2", "0.29.1", "0.30.0-beta.1"]);
    }
}
