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
    downloader::download_many,
    version::{
        classifier_for_windows, evaluate_rules, library_path_from_download,
        resolve_library_classifier_download,
    },
};

fn clear_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        if let Err(e) = std::fs::remove_dir_all(path) {
            println!("Предупреждение: не удалось полностью очистить папку: {}", e);
        }
    }
    std::fs::create_dir_all(path).map_err(|e| format!("create dir error: {e}"))
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
) -> Result<(), String> {
    let _ = clear_directory(natives_dir);
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
        if !archive_path.exists() {
            tasks.push((
                classifier_download.url.clone(),
                archive_path.clone(),
                format!("Native {}", library.name),
            ));
        }
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

    for (archive_path, excludes) in native_archives {
        let file =
            File::open(&archive_path).map_err(|e| format!("open natives archive error: {e}"))?;
        let mut zip = ZipArchive::new(file).map_err(|e| format!("zip open error: {e}"))?;

        for i in 0..zip.len() {
            let mut entry = zip
                .by_index(i)
                .map_err(|e| format!("zip entry error: {e}"))?;
            let enclosed = match entry.enclosed_name() {
                Some(p) => p.to_owned(),
                None => continue,
            };
            let entry_name = enclosed.to_string_lossy().replace('\\', "/");
            if should_skip_native_entry(&entry_name, &excludes) {
                continue;
            }
            let out_path = natives_dir.join(&enclosed);
            if entry.is_dir() {
                let _ = std::fs::create_dir_all(&out_path);
                continue;
            }
            if let Some(parent) = out_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match File::create(&out_path) {
                Ok(mut out_file) => {
                    let _ = io::copy(&mut entry, &mut out_file);
                }
                Err(_) => {
                    println!("Пропущен заблокированный натив: {:?}", out_path);
                }
            }
        }
        reporter.step(format!(
            "Processed {}",
            archive_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
        ));
    }
    Ok(())
}

pub async fn download_asset_index(
    app: &AppHandle,
    resolved: &VersionMeta,
) -> Result<(AssetIndexInfo, AssetIndexJson), String> {
    let index = resolved
        .asset_index
        .clone()
        .ok_or_else(|| "asset index missing".to_string())?;
    let path = assets_root()?
        .join("indexes")
        .join(format!("{}.json", index.id));
    let tasks = if path.exists() {
        Vec::new()
    } else {
        vec![(
            index.url.clone(),
            path.clone(),
            format!("Asset index {}", index.id),
        )]
    };
    download_many(app, "asset-index", tasks).await?;
    let raw = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read asset index error: {e}"))?;
    let json: AssetIndexJson =
        serde_json::from_str(&raw).map_err(|e| format!("parse asset index error: {e}"))?;
    Ok((index, json))
}

pub async fn download_assets(
    app: &AppHandle,
    asset_index_id: &str,
    asset_index: &AssetIndexJson,
    game_dir: &Path,
) -> Result<(), String> {
    let assets = assets_root()?;
    let virtual_root = assets.join("virtual").join(asset_index_id);
    let resources_root = game_dir.join("resources");
    let make_virtual = asset_index.virtual_.unwrap_or(false);
    let map_to_resources = asset_index.map_to_resources.unwrap_or(false);
    let mut tasks = Vec::new();

    for (logical_path, object) in &asset_index.objects {
        if object.hash.len() < 2 {
            continue;
        }
        let prefix = &object.hash[0..2];
        let object_path = assets.join("objects").join(prefix).join(&object.hash);
        let url = format!(
            "https://resources.download.minecraft.net/{prefix}/{}",
            object.hash
        );
        if !object_path.exists() {
            tasks.push((url, object_path.clone(), format!("Asset {logical_path}")));
        }
    }

    download_many(app, "assets", tasks).await?;
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
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("create virtual asset dir error: {e}"))?;
            }
            if !out.exists() {
                fs::copy(&object_path, &out)
                    .await
                    .map_err(|e| format!("copy virtual asset error: {e}"))?;
            }
        }

        if map_to_resources {
            let out = resources_root.join(logical_path);
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("create resources dir error: {e}"))?;
            }
            if !out.exists() {
                fs::copy(&object_path, &out)
                    .await
                    .map_err(|e| format!("copy resources asset error: {e}"))?;
            }
        }

        reporter.step(format!("Prepared asset {logical_path}"));
    }
    Ok(())
}

pub async fn download_logging_config(
    app: &AppHandle,
    resolved: &VersionMeta,
) -> Result<Option<PathBuf>, String> {
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
    let tasks = if path.exists() {
        Vec::new()
    } else {
        vec![(file.url.clone(), path.clone(), "Logging config".to_string())]
    };
    download_many(app, "logging", tasks).await?;
    Ok(Some(path))
}
