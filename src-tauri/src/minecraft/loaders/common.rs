//! Shared helpers used by every loader backend.

use crate::commands::errors::{CommandError, ErrorCode};
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
    minecraft::mirrors,
    paths::{launcher_root, shared_root},
};

#[cfg(windows)]
pub(super) const CREATE_NO_WINDOW: u32 = 0x08000000;

/// A loader version string may only contain characters that are safe to splice
/// into a URL or a path segment.
pub(super) fn validate_loader_version(version: &str) -> Result<&str, CommandError> {
    let clean = version.trim();
    if clean.is_empty()
        || !clean
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | '+'))
    {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "Invalid loader version",
        ));
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

/// De-duplicate and sort versions newest-first, with stable releases ahead of
/// pre-releases.
pub(super) fn sorted_unique_versions(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut versions = values
        .into_iter()
        .filter(|value| seen.insert(value.clone()))
        .collect::<Vec<_>>();
    versions.sort_by(|a, b| compare_versions(a, b));
    versions
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

/// Fetch and parse the `<version>` entries from a Maven `maven-metadata.xml`.
pub(super) async fn fetch_maven_versions(
    client: &Client,
    metadata_url: &str,
) -> Result<Vec<String>, CommandError> {
    let response = mirrors::get_with_fallback(client, metadata_url).await?;
    if !response.status().is_success() {
        return Err(CommandError::new(
            ErrorCode::Network,
            format!("maven metadata http error: {}", response.status()),
        ));
    }
    let body = response.text().await.map_err(|e| {
        let detail = format!("maven metadata body error: {e}");
        CommandError::from(e).context(detail)
    })?;
    let metadata: MavenMetadata = from_xml_str(&body).map_err(|e| {
        let detail = format!("maven metadata parse error: {e}");
        CommandError::from(e).context(detail)
    })?;
    Ok(metadata.versioning.versions.items)
}

/// `javaw.exe` swallows installer output; prefer the console `java.exe` next to
/// it when we need to capture stdout/stderr from a headless installer.
pub(super) fn java_console_binary(java_bin: &str) -> PathBuf {
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

/// Download an installer jar to `cache_path`, verifying it against the
/// `<jar-url>.sha1` checksum and reusing a valid cached copy.
pub(super) async fn download_verified_installer(
    client: &Client,
    jar_url: &str,
    cache_path: &PathBuf,
) -> Result<(), CommandError> {
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).await.map_err(|e| {
            let detail = format!("create installer cache error: {e}");
            CommandError::from(e).context(detail)
        })?;
    }

    let expected_sha1 = mirrors::get_with_fallback(client, &format!("{jar_url}.sha1"))
        .await?
        .error_for_status()
        .map_err(|e| {
            let detail = format!("installer checksum http error: {e}");
            CommandError::from(e).context(detail)
        })?
        .text()
        .await
        .map_err(|e| {
            let detail = format!("installer checksum body error: {e}");
            CommandError::from(e).context(detail)
        })?
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_string();

    let valid_cached = if cache_path.exists() {
        let bytes = fs::read(cache_path).await.map_err(|e| {
            let detail = format!("read cached installer error: {e}");
            CommandError::from(e).context(detail)
        })?;
        format!("{:x}", Sha1::digest(&bytes)).eq_ignore_ascii_case(&expected_sha1)
    } else {
        false
    };
    if valid_cached {
        return Ok(());
    }

    let bytes = mirrors::get_with_fallback(client, jar_url)
        .await?
        .error_for_status()
        .map_err(|e| {
            let detail = format!("installer http error: {e}");
            CommandError::from(e).context(detail)
        })?
        .bytes()
        .await
        .map_err(|e| {
            let detail = format!("installer body error: {e}");
            CommandError::from(e).context(detail)
        })?;
    let actual_sha1 = format!("{:x}", Sha1::digest(&bytes));
    if !expected_sha1.is_empty() && !actual_sha1.eq_ignore_ascii_case(&expected_sha1) {
        return Err(CommandError::new(
            ErrorCode::ChecksumMismatch,
            "installer checksum mismatch",
        ));
    }
    fs::write(cache_path, &bytes).await.map_err(|e| {
        let detail = format!("write installer error: {e}");
        CommandError::from(e).context(detail)
    })
}

/// Run a Forge/NeoForge-style headless client installer (`--install-client <dir>`).
/// Ensures the `launcher_profiles.json` stub the installer expects exists first.
pub(super) async fn run_client_installer(
    installer: PathBuf,
    java_console: PathBuf,
) -> Result<(), CommandError> {
    let root = shared_root()?;
    let profiles = root.join("launcher_profiles.json");
    if !profiles.exists() {
        fs::write(&profiles, b"{\"profiles\":{}}")
            .await
            .map_err(|e| {
                let detail = format!("create launcher profile stub error: {e}");
                CommandError::from(e).context(detail)
            })?;
    }

    let output = tokio::task::spawn_blocking(move || {
        let mut command = Command::new(java_console);
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
    .map_err(|e| {
        let detail = format!("installer task failed: {e}");
        CommandError::from(e).context(detail)
    })?
    .map_err(|e| {
        let detail = format!("start installer error: {e}");
        CommandError::from(e).context(detail)
    })?;

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
        return Err(CommandError::new(
            ErrorCode::Unknown,
            format!("installer failed: {}", tail.trim()),
        ));
    }
    Ok(())
}

/// Marker written next to a cached installer once its profile has been produced,
/// so we don't re-run the installer on every launch.
pub(super) fn installer_marker(
    loader: &str,
    loader_version: &str,
) -> Result<PathBuf, CommandError> {
    Ok(launcher_root()?
        .join("cache")
        .join("loaders")
        .join(loader)
        .join(loader_version)
        .join("installed.ok"))
}

pub(super) async fn write_marker(marker: &PathBuf) -> Result<(), CommandError> {
    if let Some(parent) = marker.parent() {
        fs::create_dir_all(parent).await.map_err(|e| {
            let detail = format!("create installer marker directory error: {e}");
            CommandError::from(e).context(detail)
        })?;
    }
    fs::write(marker, b"ok").await.map_err(|e| {
        let detail = format!("write installer marker error: {e}");
        CommandError::from(e).context(detail)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_versions_sort_before_prereleases() {
        let versions = sorted_unique_versions(vec![
            "0.30.0-beta.1".into(),
            "0.29.1".into(),
            "0.29.2".into(),
        ]);
        assert_eq!(versions, vec!["0.29.2", "0.29.1", "0.30.0-beta.1"]);
    }

    #[test]
    fn rejects_unsafe_loader_versions() {
        assert!(validate_loader_version("0.29.2").is_ok());
        assert!(validate_loader_version("../bad").is_err());
        assert!(validate_loader_version("").is_err());
    }
}
