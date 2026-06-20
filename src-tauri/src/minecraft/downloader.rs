use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use reqwest::Client;
use tauri::AppHandle;
use tokio::{fs, sync::Semaphore};

use crate::{minecraft::mirrors, paths::DOWNLOAD_CONCURRENCY, progress::ProgressReporter};

async fn fetch_bytes(client: &Client, url: &str) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download request error: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "download http error {} for {url}",
            response.status()
        ));
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|e| format!("read download bytes error: {e}"))
}

pub async fn download_to_path(client: &Client, url: &str, path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create parent dir error: {e}"))?;
    }

    // Try the official host plus any mirror, in the order the user configured.
    let mut last_error = None;
    for candidate in mirrors::candidates(url) {
        match fetch_bytes(client, &candidate).await {
            Ok(bytes) => {
                return fs::write(path, bytes)
                    .await
                    .map_err(|e| format!("write file error: {e}"));
            }
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error.unwrap_or_else(|| format!("download failed for {url}")))
}

pub async fn download_many(
    app: &AppHandle,
    phase: &str,
    tasks: Vec<(String, PathBuf, String)>,
) -> Result<(), String> {
    if tasks.is_empty() {
        let reporter = ProgressReporter::new(app.clone(), phase.to_string(), 1);
        reporter.step("Nothing to download");
        return Ok(());
    }

    let reporter = ProgressReporter::new(app.clone(), phase.to_string(), tasks.len());
    reporter.emit("Starting downloads");

    let semaphore = Arc::new(Semaphore::new(DOWNLOAD_CONCURRENCY));
    let client = Arc::new(mirrors::build_client()?);
    let mut handles = Vec::new();

    for (url, path, detail) in tasks {
        let permit = semaphore.clone();
        let client = client.clone();
        let reporter = reporter.clone();
        let handle = tokio::spawn(async move {
            let _permit = permit.acquire_owned().await.map_err(|e| e.to_string())?;
            download_to_path(&client, &url, &path).await?;
            reporter.step(detail);
            Ok::<(), String>(())
        });
        handles.push(handle);
    }

    for handle in handles {
        handle
            .await
            .map_err(|e| format!("join download task error: {e}"))??;
    }

    Ok(())
}
