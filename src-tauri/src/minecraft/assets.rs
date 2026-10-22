use crate::commands::errors::{CommandError, ErrorCode};
use std::{
    fs::File,
    io,
    path::{Path, PathBuf},
};

use tauri::AppHandle;
use tokio::fs;
use zip::ZipArchive;

use crate::{
    models::{AssetIndexInfo, AssetIndexJson, VersionMeta},
    paths::{assets_root, launcher_root},
    progress::ProgressReporter,
};

use super::{
    downloader::{download_many, DownloadTask},
    version::{
        classifier_for_windows, evaluate_rules, library_path_from_download,
        resolve_library_classifier_download,
    },
};

fn clear_directory(path: &Path) -> Result<(), CommandError> {
    if path.exists() {
        std::fs::remove_dir_all(path).map_err(|e| {
            let detail = format!("clear natives directory {} error: {e}", path.display());
            CommandError::from(e).context(detail)
        })?;
    }
    std::fs::create_dir_all(path).map_err(|e| {
        let detail = format!("create dir error: {e}");
        CommandError::from(e).context(detail)
    })
}

fn should_skip_native_entry(name: &str, excludes: &[String]) -> bool {
    if name.starts_with("META-INF/") || name.starts_with("META-INF\\") {
        return true;
    }
    excludes.iter().any(|prefix| name.starts_with(prefix))
}

pub async fn extract_natives(
    app: &AppHandle,
    resolved: &VersionMeta,
    natives_dir: &Path,
) -> Result<(), CommandError> {
    let mut tasks = Vec::new();
    let mut native_archives: Vec<(PathBuf, Vec<String>)> = Vec::new();

    for library in &resolved.libraries {
        if !evaluate_rules(&library.rules) {
            continue;
        }
        let Some(classifier) = classifier_for_windows(library) else {
            continue;
        };
        let Some(classifier_download) = resolve_library_classifier_download(library, &classifier)
        else {
            continue;
        };

        let archive_path = library_path_from_download(&classifier_download)?;
        tasks.push(DownloadTask::new(
            classifier_download.url.clone(),
            archive_path.clone(),
            format!("Native {}", library.name),
            classifier_download.sha1.clone(),
            classifier_download.size,
        ));
        let excludes = library
            .extract
            .as_ref()
            .and_then(|e| e.exclude.clone())
            .unwrap_or_default();
        native_archives.push((archive_path, excludes));
    }

    download_many(app, "natives-download", tasks).await?;
    let reporter = ProgressReporter::new(
        app.clone(),
        "natives-extract".to_string(),
        native_archives.len().max(1),
    );

    let natives_dir = natives_dir.to_owned();
    tokio::task::spawn_blocking(move || {
        extract_native_archives(&natives_dir, &native_archives, |archive_path| {
            reporter.step(format!(
                "Processed {}",
                archive_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
            ));
        })
    })
    .await
    .map_err(|e| {
        let detail = format!("natives extraction task error: {e}");
        CommandError::from(e).context(detail)
    })?
}

fn extract_native_archives(
    natives_dir: &Path,
    native_archives: &[(PathBuf, Vec<String>)],
    mut on_archive: impl FnMut(&Path),
) -> Result<(), CommandError> {
    clear_directory(natives_dir)?;
    for (archive_path, excludes) in native_archives {
        let file = File::open(archive_path).map_err(|e| {
            let detail = format!("open natives archive error: {e}");
            CommandError::from(e).context(detail)
        })?;
        let mut zip = ZipArchive::new(file).map_err(|e| {
            let detail = format!("zip open error: {e}");
            CommandError::from(e).context(detail)
        })?;

        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| {
                let detail = format!("zip entry error: {e}");
                CommandError::from(e).context(detail)
            })?;
            let enclosed = match entry.enclosed_name() {
                Some(p) => p.to_owned(),
                None => continue,
            };
            let entry_name = enclosed.to_string_lossy().replace('\\', "/");
            if should_skip_native_entry(&entry_name, excludes) {
                continue;
            }
            let out_path = natives_dir.join(&enclosed);
            if entry.is_dir() {
                std::fs::create_dir_all(&out_path).map_err(|e| {
                    let detail =
                        format!("create natives directory {} error: {e}", out_path.display());
                    CommandError::from(e).context(detail)
                })?;
                continue;
            }
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    let detail =
                        format!("create natives directory {} error: {e}", parent.display());
                    CommandError::from(e).context(detail)
                })?;
            }
            let mut out_file = File::create(&out_path).map_err(|e| {
                let detail = format!("create native {} error: {e}", out_path.display());
                CommandError::from(e).context(detail)
            })?;
            io::copy(&mut entry, &mut out_file).map_err(|e| {
                let detail = format!("extract native {} error: {e}", out_path.display());
                CommandError::from(e).context(detail)
            })?;
        }
        on_archive(archive_path);
    }
    Ok(())
}

pub async fn download_asset_index(
    app: &AppHandle,
    resolved: &VersionMeta,
) -> Result<(AssetIndexInfo, AssetIndexJson), CommandError> {
    let index = resolved
        .asset_index
        .clone()
        .ok_or_else(|| CommandError::new(ErrorCode::InvalidInput, "asset index missing"))?;
    let path = assets_root()?
        .join("indexes")
        .join(format!("{}.json", index.id));
    let tasks = vec![DownloadTask::new(
        index.url.clone(),
        path.clone(),
        format!("Asset index {}", index.id),
        index.sha1.clone(),
        index.size,
    )];
    download_many(app, "asset-index", tasks).await?;
    let raw = fs::read_to_string(&path).await.map_err(|e| {
        let detail = format!("read asset index error: {e}");
        CommandError::from(e).context(detail)
    })?;
    let json: AssetIndexJson = serde_json::from_str(&raw).map_err(|e| {
        let detail = format!("parse asset index error: {e}");
        CommandError::from(e).context(detail)
    })?;
    Ok((index, json))
}

pub async fn download_assets(
    app: &AppHandle,
    asset_index_id: &str,
    asset_index: &AssetIndexJson,
    game_dir: &Path,
) -> Result<(), CommandError> {
    let assets = assets_root()?;
    let virtual_root = assets.join("virtual").join(asset_index_id);
    let resources_root = game_dir.join("resources");
    let make_virtual = asset_index.virtual_.unwrap_or(false);
    let map_to_resources = asset_index.map_to_resources.unwrap_or(false);
    let mut tasks = Vec::new();

    for (logical_path, object) in &asset_index.objects {
        if object.hash.len() != 40 || !object.hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("Invalid SHA-1 for asset {logical_path}"),
            ));
        }
        let prefix = &object.hash[0..2];
        let object_path = assets.join("objects").join(prefix).join(&object.hash);
        let url = format!(
            "https://resources.download.minecraft.net/{prefix}/{}",
            object.hash
        );
        tasks.push(DownloadTask::new(
            url,
            object_path,
            format!("Asset {logical_path}"),
            Some(object.hash.clone()),
            Some(object.size),
        ));
    }

    download_many(app, "assets", tasks).await?;
    if !make_virtual && !map_to_resources {
        ProgressReporter::new(app.clone(), "assets-copy", 1)
            .step("Assets ready; no copies required");
        return Ok(());
    }
    let reporter = ProgressReporter::new(
        app.clone(),
        "assets-copy".to_string(),
        asset_index.objects.len().max(1),
    );
    if asset_index.objects.is_empty() {
        reporter.step("No assets to copy");
        return Ok(());
    }

    for (logical_path, object) in &asset_index.objects {
        let prefix = &object.hash[0..2];
        let object_path = assets.join("objects").join(prefix).join(&object.hash);

        if make_virtual {
            let out = virtual_root.join(logical_path);
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).await.map_err(|e| {
                    let detail = format!("create virtual asset dir error: {e}");
                    CommandError::from(e).context(detail)
                })?;
            }
            if !out.exists() {
                fs::copy(&object_path, &out).await.map_err(|e| {
                    let detail = format!("copy virtual asset error: {e}");
                    CommandError::from(e).context(detail)
                })?;
            }
        }

        if map_to_resources {
            let out = resources_root.join(logical_path);
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).await.map_err(|e| {
                    let detail = format!("create resources dir error: {e}");
                    CommandError::from(e).context(detail)
                })?;
            }
            if !out.exists() {
                fs::copy(&object_path, &out).await.map_err(|e| {
                    let detail = format!("copy resources asset error: {e}");
                    CommandError::from(e).context(detail)
                })?;
            }
        }

        reporter.step(format!("Prepared asset {logical_path}"));
    }
    Ok(())
}

pub async fn download_logging_config(
    app: &AppHandle,
    resolved: &VersionMeta,
) -> Result<Option<PathBuf>, CommandError> {
    let Some(logging) = resolved.logging.as_ref() else {
        return Ok(None);
    };
    let Some(client_logging) = logging.client.as_ref() else {
        return Ok(None);
    };
    let Some(file) = client_logging.file.as_ref() else {
        return Ok(None);
    };

    let filename = file
        .path
        .as_ref()
        .and_then(|p| {
            Path::new(p)
                .file_name()
                .map(|x| x.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "client-logging.xml".to_string());
    let path = launcher_root()?.join("log_configs").join(filename);
    let tasks = vec![DownloadTask::new(
        file.url.clone(),
        path.clone(),
        "Logging config",
        file.sha1.clone(),
        file.size,
    )];
    download_many(app, "logging", tasks).await?;
    Ok(Some(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("screen-natives-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&root).unwrap();
            Self(root)
        }
        fn archive(&self, files: &[(&str, &[u8])]) -> PathBuf {
            let path = self.0.join("natives.jar");
            let mut zip = ZipWriter::new(File::create(&path).unwrap());
            let options =
                SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            for (name, content) in files {
                zip.start_file(*name, options).unwrap();
                zip.write_all(content).unwrap();
            }
            zip.finish().unwrap();
            path
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn extracts_nested_natives_and_honours_exclusions() {
        let fixture = Fixture::new();
        let archive = fixture.archive(&[
            ("META-INF/signature", b"skip"),
            ("skip/native.dll", b"skip"),
            ("nested/native.dll", b"dll"),
        ]);
        let out = fixture.0.join("out");
        extract_native_archives(&out, &[(archive, vec!["skip/".into()])], |_| {}).unwrap();
        assert_eq!(
            std::fs::read(out.join("nested/native.dll")).unwrap(),
            b"dll"
        );
        assert!(!out.join("skip").exists());
        assert!(!out.join("META-INF").exists());
    }

    #[test]
    fn returns_directory_and_corrupt_payload_errors_instead_of_reporting_success() {
        let fixture = Fixture::new();
        let archive = fixture.archive(&[
            ("native.dll", b"payload contents"),
            ("native.dll/child", b"blocked"),
        ]);
        let out = fixture.0.join("out");
        assert!(extract_native_archives(&out, &[(archive, vec![])], |_| {}).is_err());
        let archive = fixture.archive(&[("native.dll", b"payload contents")]);
        let mut bytes = std::fs::read(&archive).unwrap();
        let position = bytes
            .windows(b"payload contents".len())
            .position(|value| value == b"payload contents")
            .unwrap();
        bytes[position] ^= 1;
        std::fs::write(&archive, bytes).unwrap();
        let error = extract_native_archives(&out, &[(archive, vec![])], |_| {})
            .unwrap_err()
            .detail;
        assert!(error.contains("extract native"), "{error}");
    }
}
