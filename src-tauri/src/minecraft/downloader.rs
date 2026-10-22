use crate::commands::errors::{CommandError, ErrorCode};
use std::{
    collections::HashMap,
    future::Future,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::SystemTime,
};

use reqwest::Client;
use sha1::{Digest, Sha1};
use tauri::AppHandle;
use tokio::{fs, io::AsyncReadExt, task::JoinSet};

use crate::{minecraft::mirrors, paths::DOWNLOAD_CONCURRENCY, progress::ProgressReporter};

#[derive(Clone)]
pub(super) struct DownloadTask {
    pub url: String,
    pub path: PathBuf,
    pub detail: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}
impl DownloadTask {
    pub fn new(
        url: impl Into<String>,
        path: PathBuf,
        detail: impl Into<String>,
        sha1: Option<String>,
        size: Option<u64>,
    ) -> Self {
        Self {
            url: url.into(),
            path,
            detail: detail.into(),
            sha1,
            size,
        }
    }
}
struct VerifiedFile {
    size: u64,
    modified: Option<SystemTime>,
    sha1: String,
}
fn verified_files() -> &'static Mutex<HashMap<PathBuf, VerifiedFile>> {
    static VERIFIED: OnceLock<Mutex<HashMap<PathBuf, VerifiedFile>>> = OnceLock::new();
    VERIFIED.get_or_init(|| Mutex::new(HashMap::new()))
}
async fn cached_file_valid(
    path: &Path,
    sha1: Option<&str>,
    size: Option<u64>,
) -> Result<bool, CommandError> {
    let metadata = match fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => {
            return Err({
                let detail = format!("read cached file metadata error: {error}");
                CommandError::from(error).context(detail)
            })
        }
    };
    if !metadata.is_file() || size.is_some_and(|size| metadata.len() != size) {
        return Ok(false);
    }
    let Some(expected) = sha1 else {
        return Ok(size == Some(0) || metadata.len() > 0);
    };
    let modified = metadata.modified().ok();
    if let Ok(cache) = verified_files().lock() {
        if cache.get(path).is_some_and(|verified| {
            modified.is_some()
                && verified.modified == modified
                && verified.size == metadata.len()
                && verified.sha1.eq_ignore_ascii_case(expected)
        }) {
            return Ok(true);
        }
    }
    let mut file = fs::File::open(path).await.map_err(|e| {
        let detail = format!("open cached file error: {e}");
        CommandError::from(e).context(detail)
    })?;
    let opened_metadata = file.metadata().await.map_err(|e| {
        let detail = format!("read cached file metadata error: {e}");
        CommandError::from(e).context(detail)
    })?;
    let mut hasher = Sha1::new();
    let mut buffer = vec![0; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).await.map_err(|e| {
            let detail = format!("read cached file error: {e}");
            CommandError::from(e).context(detail)
        })?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let valid = format!("{:x}", hasher.finalize()).eq_ignore_ascii_case(expected);
    if valid {
        let after_read = file.metadata().await.map_err(|e| {
            let detail = format!("read cached file metadata error: {e}");
            CommandError::from(e).context(detail)
        })?;
        if opened_metadata.len() != after_read.len()
            || opened_metadata.modified().ok() != after_read.modified().ok()
        {
            return Ok(false);
        }
        if let Ok(mut cache) = verified_files().lock() {
            cache.insert(
                path.to_owned(),
                VerifiedFile {
                    size: opened_metadata.len(),
                    modified: opened_metadata.modified().ok(),
                    sha1: expected.to_owned(),
                },
            );
        }
    }
    Ok(valid)
}
async fn fetch_to_path(
    client: &Client,
    url: &str,
    path: &Path,
    expected_sha1: Option<&str>,
    expected_size: Option<u64>,
) -> Result<(), CommandError> {
    crate::downloads::stream_to_path(
        client,
        url,
        path,
        crate::downloads::Integrity {
            sha1: expected_sha1,
            size: expected_size,
            ..Default::default()
        },
        |_, _| async { Ok(()) },
    )
    .await?;
    if let (Some(expected), Ok(metadata)) = (expected_sha1, fs::metadata(path).await) {
        if let Ok(mut cache) = verified_files().lock() {
            cache.insert(
                path.to_owned(),
                VerifiedFile {
                    size: metadata.len(),
                    modified: metadata.modified().ok(),
                    sha1: expected.to_owned(),
                },
            );
        }
    }
    Ok(())
}
pub(super) async fn download_to_path(
    client: &Client,
    url: &str,
    path: &Path,
    sha1: Option<&str>,
    size: Option<u64>,
) -> Result<(), CommandError> {
    if sha1
        .is_some_and(|hash| hash.len() != 40 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
    {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "Invalid download SHA-1 metadata",
        ));
    }
    if cached_file_valid(path, sha1, size).await? {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.map_err(|e| {
            let detail = format!("create parent dir error: {e}");
            CommandError::from(e).context(detail)
        })?;
    }
    let mut last_error = None;
    for candidate in mirrors::candidates(url) {
        match fetch_to_path(client, &candidate, path, sha1, size).await {
            Ok(()) => return Ok(()),
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error.unwrap_or_else(|| {
        CommandError::new(
            ErrorCode::DownloadFailed,
            format!("download failed for {url}"),
        )
    }))
}
/// Only `concurrency` tasks exist at a time; failures abort and join all siblings.
async fn run_bounded<T, F, Fut>(
    tasks: impl IntoIterator<Item = T>,
    concurrency: usize,
    worker: F,
) -> Result<(), CommandError>
where
    T: Send + 'static,
    F: Fn(T) -> Fut,
    Fut: Future<Output = Result<(), CommandError>> + Send + 'static,
{
    let mut remaining = tasks.into_iter();
    let mut running = JoinSet::new();
    for task in remaining.by_ref().take(concurrency.max(1)) {
        running.spawn(worker(task));
    }
    while let Some(result) = running.join_next().await {
        let error = match result {
            Ok(Ok(())) => None,
            Ok(Err(error)) => Some(error),
            Err(error) => Some({
                let detail = format!("join download task error: {error}");
                CommandError::from(error).context(detail)
            }),
        };
        if let Some(error) = error {
            running.abort_all();
            while running.join_next().await.is_some() {}
            return Err(error);
        }
        if let Some(task) = remaining.next() {
            running.spawn(worker(task));
        }
    }
    Ok(())
}
pub(super) async fn download_many(
    app: &AppHandle,
    phase: &str,
    tasks: Vec<DownloadTask>,
) -> Result<(), CommandError> {
    let mut unique = HashMap::<PathBuf, DownloadTask>::new();
    for task in tasks {
        if let Some(previous) = unique.get(&task.path) {
            if previous.sha1 != task.sha1 || previous.size != task.size {
                return Err(CommandError::new(
                    ErrorCode::Unknown,
                    format!("Conflicting download metadata for {}", task.path.display()),
                ));
            }
        } else {
            unique.insert(task.path.clone(), task);
        }
    }
    let reporter = ProgressReporter::new(app.clone(), phase, unique.len().max(1));
    if unique.is_empty() {
        reporter.step("Nothing to download");
        return Ok(());
    }
    reporter.emit("Checking and downloading files");
    let client = mirrors::build_client()?;
    run_bounded(unique.into_values(), DOWNLOAD_CONCURRENCY, move |task| {
        let client = client.clone();
        let reporter = reporter.clone();
        async move {
            download_to_path(
                &client,
                &task.url,
                &task.path,
                task.sha1.as_deref(),
                task.size,
            )
            .await?;
            reporter.step(task.detail);
            Ok(())
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
        time::Duration,
    };

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("screen-download-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&root).unwrap();
            Self(root)
        }
        fn client() -> Client {
            Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(3))
                .build()
                .unwrap()
        }
        fn only_target(&self) -> bool {
            std::fs::read_dir(&self.0).unwrap().count() == 1
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn serve(body: &'static [u8], declared_size: usize) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/file", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut request = [0; 4096];
            assert!(socket.read(&mut request).unwrap() > 0);
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {declared_size}\r\nConnection: close\r\n\r\n"
            )
            .unwrap();
            socket.write_all(body).unwrap();
        });
        (url, server)
    }
    fn hash(body: &[u8]) -> String {
        format!("{:x}", Sha1::digest(body))
    }

    #[tokio::test]
    async fn replaces_a_corrupt_same_size_cache_and_reuses_verified_files_offline() {
        let fixture = Fixture::new();
        let path = fixture.0.join("file.jar");
        fs::write(&path, b"evil").await.unwrap();
        let (url, server) = serve(b"good", 4);
        download_to_path(
            &Fixture::client(),
            &url,
            &path,
            Some(&hash(b"good")),
            Some(4),
        )
        .await
        .unwrap();
        server.join().unwrap();
        assert_eq!(fs::read(&path).await.unwrap(), b"good");
        assert!(fixture.only_target());
        download_to_path(
            &Fixture::client(),
            "http://127.0.0.1:9/unavailable",
            &path,
            Some(&hash(b"good")),
            Some(4),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn wrong_hash_and_truncated_responses_do_not_replace_the_cache_or_leave_part_files() {
        let fixture = Fixture::new();
        let path = fixture.0.join("file.jar");
        fs::write(&path, b"previous").await.unwrap();
        let (url, server) = serve(b"evil", 4);
        let error = download_to_path(
            &Fixture::client(),
            &url,
            &path,
            Some(&hash(b"good")),
            Some(4),
        )
        .await
        .unwrap_err();
        server.join().unwrap();
        assert_eq!(error.code, ErrorCode::ChecksumMismatch);
        assert!(error.detail.contains("SHA-1"));
        assert_eq!(fs::read(&path).await.unwrap(), b"previous");
        assert!(fixture.only_target());
        let (url, server) = serve(b"half", 100);
        assert!(
            download_to_path(&Fixture::client(), &url, &path, None, Some(100))
                .await
                .is_err()
        );
        server.join().unwrap();
        assert_eq!(fs::read(&path).await.unwrap(), b"previous");
        assert!(fixture.only_target());
    }

    #[tokio::test]
    async fn enforces_the_declared_metadata_size() {
        let fixture = Fixture::new();
        let path = fixture.0.join("file.jar");
        let (url, server) = serve(b"good", 4);
        assert!(
            download_to_path(&Fixture::client(), &url, &path, None, Some(3))
                .await
                .unwrap_err()
                .detail
                .contains("size")
        );
        server.join().unwrap();
        assert!(!path.exists());
        assert_eq!(std::fs::read_dir(&fixture.0).unwrap().count(), 0);
    }

    #[tokio::test]
    async fn aborting_a_download_removes_its_temporary_file() {
        let fixture = Fixture::new();
        let path = fixture.0.join("file.jar");
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/file", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut request = [0; 4096];
            assert!(socket.read(&mut request).unwrap() > 0);
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\nhalf")
                .unwrap();
            let _ = socket.read(&mut request);
        });
        let task = tokio::spawn(async move {
            download_to_path(&Fixture::client(), &url, &path, None, Some(100)).await
        });
        tokio::time::timeout(Duration::from_secs(3), async {
            while std::fs::read_dir(&fixture.0).unwrap().count() == 0 {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        server.join().unwrap();
        assert_eq!(std::fs::read_dir(&fixture.0).unwrap().count(), 0);
    }

    struct Active(Arc<AtomicUsize>);
    impl Drop for Active {
        fn drop(&mut self) {
            self.0.fetch_sub(1, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn failure_cancels_and_joins_siblings_without_starting_queued_work() {
        let active = Arc::new(AtomicUsize::new(0));
        let started = Arc::new(AtomicUsize::new(0));
        let barrier = Arc::new(tokio::sync::Barrier::new(3));
        let result = tokio::time::timeout(
            Duration::from_secs(3),
            run_bounded(0..100, 3, {
                let active = active.clone();
                let started = started.clone();
                move |task| {
                    let active = active.clone();
                    let started = started.clone();
                    let barrier = barrier.clone();
                    async move {
                        active.fetch_add(1, Ordering::SeqCst);
                        let _guard = Active(active);
                        started.fetch_add(1, Ordering::SeqCst);
                        barrier.wait().await;
                        if task == 0 {
                            Err(CommandError::new(ErrorCode::Unknown, "failed"))
                        } else {
                            std::future::pending().await
                        }
                    }
                }
            }),
        )
        .await
        .unwrap();
        assert_eq!(result.unwrap_err().detail, "failed");
        assert_eq!(started.load(Ordering::SeqCst), 3);
        assert_eq!(active.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn processes_the_entire_queue_with_bounded_concurrency() {
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let completed = Arc::new(AtomicUsize::new(0));
        run_bounded(0..30, 3, {
            let active = active.clone();
            let peak = peak.clone();
            let completed = completed.clone();
            move |_| {
                let active = active.clone();
                let peak = peak.clone();
                let completed = completed.clone();
                async move {
                    let count = active.fetch_add(1, Ordering::SeqCst) + 1;
                    peak.fetch_max(count, Ordering::SeqCst);
                    let _guard = Active(active);
                    tokio::time::sleep(Duration::from_millis(1)).await;
                    completed.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(completed.load(Ordering::SeqCst), 30);
        assert!(peak.load(Ordering::SeqCst) <= 3);
        assert_eq!(active.load(Ordering::SeqCst), 0);
    }
}
