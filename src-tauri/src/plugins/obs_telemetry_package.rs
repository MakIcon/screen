use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::optional_extensions::{activate_package, extension_dir, OptionalExtensionStatus};
use crate::commands::errors::{CommandError, ErrorCode};

pub const ID: &str = "obs-telemetry";
const MANIFEST: &str = include_str!("../../../extensions/obs-telemetry/extension.json");

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Package {
    id: String,
    version: String,
    #[serde(default)]
    supported_minecraft_versions: Vec<String>,
    files: Vec<PackageFile>,
}

#[derive(Debug, Deserialize, Serialize)]
struct PackageFile {
    name: String,
    #[serde(default)]
    url: String,
    sha256: String,
    size: u64,
}

fn valid_file_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && !name.ends_with('.')
        && name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | '+'))
        && matches!(name.rsplit('.').next(), Some("jar" | "ttf" | "txt"))
}

fn installed_package(directory: &Path) -> Option<Package> {
    let package: Package =
        serde_json::from_slice(&fs::read(directory.join("extension.json")).ok()?).ok()?;
    (package.id == ID
        && package
            .files
            .iter()
            .any(|file| file.name == "Monocraft.ttf")
        && package.files.iter().any(|file| file.name.ends_with(".jar"))
        && package.files.iter().all(|file| {
            valid_file_name(&file.name)
                && fs::metadata(directory.join(&file.name))
                    .is_ok_and(|metadata| metadata.is_file() && metadata.len() == file.size)
        }))
    .then_some(package)
}

fn status_at(directory: &Path) -> OptionalExtensionStatus {
    let package = installed_package(directory);
    OptionalExtensionStatus {
        id: ID.to_string(),
        installed: package.is_some(),
        version: package.map(|package| package.version),
        install_path: directory.to_string_lossy().into_owned(),
        message: "Install OBS Telemetry separately from Extensions".to_string(),
    }
}

pub fn status() -> OptionalExtensionStatus {
    status_at(&extension_dir(ID).unwrap_or_default())
}

pub fn directory() -> Result<PathBuf, CommandError> {
    let directory = extension_dir(ID)?;
    if installed_package(&directory).is_none() {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "OBS Telemetry package is not installed. Open Extensions and install it first.",
        ));
    }
    Ok(directory)
}

async fn download_package(
    client: &reqwest::Client,
    package: &Package,
    staging: &Path,
) -> Result<(), CommandError> {
    for file in &package.files {
        if !valid_file_name(&file.name) {
            return Err(CommandError::new(
                ErrorCode::InvalidFile,
                "Invalid OBS package filename",
            ));
        }
        if file.url.is_empty() {
            return Err(CommandError::new(ErrorCode::InvalidInput,
                "This OBS package has not been published online. Use Install from ZIP with screenlauncher-obs-telemetry.zip."));
        }
        let response = client.get(&file.url).send().await?.error_for_status()?;
        let bytes = response.bytes().await?;
        if bytes.len() as u64 != file.size || format!("{:x}", Sha256::digest(&bytes)) != file.sha256
        {
            return Err(CommandError::new(
                ErrorCode::ChecksumMismatch,
                format!("OBS Telemetry checksum mismatch: {}", file.name),
            ));
        }
        tokio::fs::write(staging.join(&file.name), bytes).await?;
    }
    tokio::fs::write(
        staging.join("extension.json"),
        serde_json::to_vec_pretty(package)?,
    )
    .await?;
    Ok(())
}

async fn install_at(
    package: &Package,
    target: &Path,
    client: &reqwest::Client,
) -> Result<OptionalExtensionStatus, CommandError> {
    let root = target.parent().ok_or_else(|| {
        CommandError::new(ErrorCode::InvalidInput, "Missing extensions directory")
    })?;
    tokio::fs::create_dir_all(root).await?;
    let staging = root.join(format!(
        ".obs-telemetry-installing-{}",
        uuid::Uuid::new_v4()
    ));
    tokio::fs::create_dir(&staging).await?;
    let result = async {
        download_package(client, package, &staging).await?;
        if !status_at(&staging).installed {
            return Err(CommandError::new(
                ErrorCode::InvalidFile,
                "OBS Telemetry package is incomplete",
            ));
        }
        activate_package(&staging, target).await?;
        Ok(status_at(target))
    }
    .await;
    if staging.exists() {
        let _ = tokio::fs::remove_dir_all(&staging).await;
    }
    result
}

pub async fn install() -> Result<OptionalExtensionStatus, CommandError> {
    let package: Package = serde_json::from_str(MANIFEST)?;
    let client = reqwest::Client::builder()
        .user_agent(concat!("ScreenLauncher/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(60))
        .build()?;
    install_at(&package, &extension_dir(ID)?, &client).await
}

fn unpack_archive(archive_path: &Path, staging: &Path) -> Result<(), CommandError> {
    use std::io::Read;
    let mut archive = zip::ZipArchive::new(fs::File::open(archive_path)?)?;
    let mut raw = String::new();
    archive
        .by_name("extension.json")?
        .take(128 * 1024)
        .read_to_string(&mut raw)?;
    let package: Package = serde_json::from_str(&raw)?;
    if package.id != ID || package.files.is_empty() || package.files.len() > 64 {
        return Err(CommandError::new(
            ErrorCode::InvalidFile,
            "Invalid OBS Telemetry package",
        ));
    }
    let mut names = std::collections::HashSet::new();
    for file in &package.files {
        if !valid_file_name(&file.name)
            || file.name == "extension.json"
            || !names.insert(&file.name)
            || file.size > 32 * 1024 * 1024
        {
            return Err(CommandError::new(
                ErrorCode::InvalidFile,
                "Invalid OBS package file",
            ));
        }
        let entry = archive.by_name(&file.name)?;
        if entry.size() != file.size {
            return Err(CommandError::new(
                ErrorCode::ChecksumMismatch,
                format!("OBS package size mismatch: {}", file.name),
            ));
        }
        let mut bytes = Vec::new();
        entry.take(file.size + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 != file.size || format!("{:x}", Sha256::digest(&bytes)) != file.sha256
        {
            return Err(CommandError::new(
                ErrorCode::ChecksumMismatch,
                format!("OBS package checksum mismatch: {}", file.name),
            ));
        }
        fs::write(staging.join(&file.name), bytes)?;
    }
    fs::write(
        staging.join("extension.json"),
        serde_json::to_vec_pretty(&package)?,
    )?;
    if !status_at(staging).installed {
        return Err(CommandError::new(
            ErrorCode::InvalidFile,
            "OBS Telemetry package is incomplete",
        ));
    }
    Ok(())
}

pub async fn import_archive(path: PathBuf) -> Result<OptionalExtensionStatus, CommandError> {
    let target = extension_dir(ID)?;
    let root = target.parent().ok_or_else(|| {
        CommandError::new(ErrorCode::InvalidInput, "Missing extensions directory")
    })?;
    tokio::fs::create_dir_all(root).await?;
    let staging = root.join(format!(
        ".obs-telemetry-installing-{}",
        uuid::Uuid::new_v4()
    ));
    tokio::fs::create_dir(&staging).await?;
    let result = async {
        let unpack_to = staging.clone();
        tokio::task::spawn_blocking(move || unpack_archive(&path, &unpack_to))
            .await
            .map_err(|error| {
                CommandError::new(
                    ErrorCode::Unknown,
                    format!("OBS package import failed: {error}"),
                )
            })??;
        activate_package(&staging, &target).await?;
        Ok(status_at(&target))
    }
    .await;
    if staging.exists() {
        let _ = tokio::fs::remove_dir_all(&staging).await;
    }
    result
}

pub async fn uninstall() -> Result<OptionalExtensionStatus, CommandError> {
    let directory = extension_dir(ID)?;
    if directory.exists() {
        tokio::fs::remove_dir_all(&directory).await?;
    }
    Ok(status_at(&directory))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };

    #[tokio::test]
    async fn downloads_checksums_and_preserves_installed_package_on_failure() {
        let root =
            std::env::temp_dir().join(format!("screen-obs-package-{}", uuid::Uuid::new_v4()));
        let target = root.join(ID);
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            for _ in 0..3 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0; 4096];
                assert!(stream.read(&mut request).unwrap() > 0);
                stream
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\ntest",
                    )
                    .unwrap();
            }
        });
        let mut package = Package {
            id: ID.into(),
            version: "1.0.0".into(),
            supported_minecraft_versions: Vec::new(),
            files: ["Monocraft.ttf", "obs-telemetry-1.0.0+mc1.21.1.jar"]
                .into_iter()
                .map(|name| PackageFile {
                    name: name.into(),
                    url: format!("http://{address}/{name}"),
                    sha256: format!("{:x}", Sha256::digest(b"test")),
                    size: 4,
                })
                .collect(),
        };
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        assert!(
            install_at(&package, &target, &client)
                .await
                .unwrap()
                .installed
        );
        fs::write(target.join("keep.txt"), "previous package").unwrap();
        package.files[0].sha256 = "incorrect".into();
        assert_eq!(
            install_at(&package, &target, &client)
                .await
                .unwrap_err()
                .code,
            ErrorCode::ChecksumMismatch
        );
        assert_eq!(
            fs::read_to_string(target.join("keep.txt")).unwrap(),
            "previous package"
        );
        assert!(status_at(&target).installed);
        fs::remove_file(target.join("Monocraft.ttf")).unwrap();
        assert!(!status_at(&target).installed);
        server.join().unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn catalog_matches_repository_assets() {
        let package: Package = serde_json::from_str(MANIFEST).unwrap();
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/obs-telemetry");
        for file in package.files {
            assert!(valid_file_name(&file.name));
            let bytes = fs::read(directory.join(file.name)).unwrap();
            assert_eq!(bytes.len() as u64, file.size);
            assert_eq!(format!("{:x}", Sha256::digest(bytes)), file.sha256);
        }
    }

    #[test]
    fn every_supported_game_has_an_exact_mod_with_the_right_java_target() {
        use std::io::Read;
        let package: Package = serde_json::from_str(MANIFEST).unwrap();
        assert_eq!(package.supported_minecraft_versions.len(), 17);
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/obs-telemetry");
        for version in &package.supported_minecraft_versions {
            let name = format!("obs-telemetry-{}+mc{version}.jar", package.version);
            assert!(
                package.files.iter().any(|file| file.name == name),
                "missing {version}"
            );
            let mut jar =
                zip::ZipArchive::new(fs::File::open(directory.join(name)).unwrap()).unwrap();
            let mut raw = String::new();
            jar.by_name("fabric.mod.json")
                .unwrap()
                .read_to_string(&mut raw)
                .unwrap();
            let metadata: serde_json::Value = serde_json::from_str(&raw).unwrap();
            assert_eq!(metadata["depends"]["minecraft"], format!("={version}"));
            let modern = version.starts_with("26.");
            assert_eq!(
                metadata["depends"]["java"],
                if modern { ">=25" } else { ">=21" }
            );
            let mut header = [0u8; 8];
            jar.by_name("com/makicon/screen/obs/client/OBSTelemetryClient.class")
                .unwrap()
                .read_exact(&mut header)
                .unwrap();
            assert_eq!(&header[..4], &[0xca, 0xfe, 0xba, 0xbe]);
            assert_eq!(
                u16::from_be_bytes([header[6], header[7]]),
                if modern { 69 } else { 65 }
            );
        }
    }

    #[test]
    fn imports_checked_archives_and_rejects_corruption_and_traversal() {
        use std::io::Write;
        let root = std::env::temp_dir().join(format!("screen-obs-zip-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/obs-telemetry");
        let mut package: Package = serde_json::from_str(MANIFEST).unwrap();
        for scenario in ["valid", "checksum", "path"] {
            let staging = root.join(scenario);
            fs::create_dir(&staging).unwrap();
            let zip_path = root.join(format!("{scenario}.zip"));
            let mut zip = zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
            let options = zip::write::SimpleFileOptions::default();
            if scenario == "checksum" {
                package.files[0].sha256 = "bad".into();
            }
            if scenario == "path" {
                package.files[0].name = "../outside.txt".into();
            }
            zip.start_file("extension.json", options).unwrap();
            zip.write_all(&serde_json::to_vec(&package).unwrap())
                .unwrap();
            for file in &package.files {
                if let Ok(bytes) = fs::read(source.join(&file.name)) {
                    zip.start_file(&file.name, options).unwrap();
                    zip.write_all(&bytes).unwrap();
                }
            }
            zip.finish().unwrap();
            let result = unpack_archive(&zip_path, &staging);
            if scenario == "valid" {
                result.unwrap();
                assert!(status_at(&staging).installed);
            } else {
                assert!(result.is_err());
            }
            assert!(!root.join("outside.txt").exists());
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    #[ignore = "Downloads the published OBS assets; run explicitly for release verification"]
    async fn published_package_downloads_and_installs() {
        let root = std::env::temp_dir().join(format!("screen-obs-live-{}", uuid::Uuid::new_v4()));
        let package: Package = serde_json::from_str(MANIFEST).unwrap();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .unwrap();
        let installed = install_at(&package, &root.join(ID), &client).await.unwrap();
        assert!(installed.installed);
        assert_eq!(installed.version.as_deref(), Some(package.version.as_str()));
        fs::remove_dir_all(root).unwrap();
    }
}
