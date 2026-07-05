//! Automatic Java runtime provisioning.
//!
//! When a build needs a Java major version that isn't installed on the system,
//! we fetch a matching JRE from Adoptium (Eclipse Temurin) and unpack it into the
//! launcher's managed `java/<major>` folder. Honoured only when the user keeps the
//! "auto download Java" setting on; otherwise launching falls back to whatever is
//! on `PATH`, exactly as before.

use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use reqwest::Client;
use tauri::AppHandle;

use crate::minecraft::java::{locate_java, managed_java_bin, required_java_major};
use crate::minecraft::mirrors;
use crate::models::InstanceItem;
use crate::paths::java_runtimes_root;
use crate::progress::ProgressReporter;

fn adoptium_url(major: u32) -> String {
    // `ga` = general availability, `eclipse` = Temurin. A 302 leads to the zip.
    format!(
        "https://api.adoptium.net/v3/binary/latest/{major}/ga/windows/x64/jre/hotspot/normal/eclipse"
    )
}

/// A download client that follows the user's proxy but allows a long timeout —
/// a JRE archive is ~45 MB and the shared 60s client can time out mid-download.
fn download_client() -> Result<Client, String> {
    let config = mirrors::current_config();
    let mut builder = Client::builder()
        .user_agent("ScreenLauncher/0.1.0")
        .timeout(Duration::from_secs(600));

    if let Some(proxy) = config
        .proxy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let proxy = mirrors::configured_proxy(proxy, &config.proxy_bypass)?;
        builder = builder.proxy(proxy);
    }

    builder
        .build()
        .map_err(|e| format!("java download client error: {e}"))
}

/// Join `relative` (a zip entry name) onto `base`, rejecting any `..`/absolute
/// components so a malicious archive can't escape the target directory.
fn safe_join(base: &Path, relative: &str) -> Option<PathBuf> {
    let mut out = base.to_path_buf();
    for component in Path::new(&relative.replace('\\', "/")).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out)
}

fn extract_zip(bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    // Start from a clean directory so a half-finished prior attempt can't linger.
    if target_dir.exists() {
        std::fs::remove_dir_all(target_dir).map_err(|e| format!("clear java dir error: {e}"))?;
    }
    std::fs::create_dir_all(target_dir).map_err(|e| format!("create java dir error: {e}"))?;

    let reader = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|e| format!("open java archive error: {e}"))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("read java archive entry error: {e}"))?;
        let Some(out_path) = safe_join(target_dir, entry.name()) else {
            continue;
        };

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("create java dir error: {e}"))?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create java dir error: {e}"))?;
        }
        let mut out =
            std::fs::File::create(&out_path).map_err(|e| format!("write java file error: {e}"))?;
        std::io::copy(&mut entry, &mut out).map_err(|e| format!("extract java file error: {e}"))?;
    }

    Ok(())
}

/// Download and unpack a managed Java `major` if it isn't already present.
/// Returns the path to its `javaw.exe`.
pub async fn ensure_managed_java(app: &AppHandle, major: u32) -> Result<String, String> {
    if let Some(bin) = managed_java_bin(major) {
        return Ok(bin);
    }

    let reporter = ProgressReporter::new(app.clone(), "java", 3);
    reporter.emit(format!("Downloading Java {major}"));

    let client = download_client()?;
    let url = adoptium_url(major);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("java download error: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "java download failed (http {}) for {url}",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read java download error: {e}"))?;

    reporter.step(format!("Unpacking Java {major}"));

    let target_dir = java_runtimes_root()?.join(major.to_string());
    tokio::task::spawn_blocking(move || extract_zip(&bytes, &target_dir))
        .await
        .map_err(|e| format!("java unpack task error: {e}"))??;

    reporter.step(format!("Java {major} ready"));

    managed_java_bin(major).ok_or_else(|| format!("Java {major} unpacked but javaw.exe is missing"))
}

/// Ensure a usable Java exists for this build before launch. No-op when the build
/// pins its own `java_path`, when a suitable Java is already found, or when the
/// user disabled auto-download (the launch then falls back to `PATH`).
pub async fn ensure_java_for_instance(
    app: &AppHandle,
    instance: &InstanceItem,
    auto_download: bool,
) -> Result<(), String> {
    let has_override = instance
        .java_path
        .as_deref()
        .map(str::trim)
        .is_some_and(|path| !path.is_empty());
    if has_override {
        return Ok(());
    }

    let major = required_java_major(&instance.version);
    if locate_java(major).is_some() || !auto_download {
        return Ok(());
    }

    ensure_managed_java(app, major).await.map(|_| ())
}
