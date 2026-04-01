use std::{path::{Path, PathBuf}, sync::Arc};

use reqwest::Client;
use tauri::AppHandle;
use tokio::{fs, sync::Semaphore};

use crate::{paths::DOWNLOAD_CONCURRENCY, progress::ProgressReporter};

pub async fn download_to_path(client: &Client, url: &str, path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create parent dir error: {e}"))?;
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download request error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("download http error {} for {url}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read download bytes error: {e}"))?;

    fs::write(path, bytes)
        .await
        .map_err(|e| format!("write file error: {e}"))
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
    let client = Arc::new(Client::new());
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
