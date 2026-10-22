//! Streaming downloads shared by Minecraft and Modrinth. Destinations become
//! visible only after the complete response passes its integrity checks.
use crate::commands::errors::{CommandError, ErrorCode};
use reqwest::Client;
use sha1::{Digest, Sha1};
use sha2::Sha512;
use std::{
    future::Future,
    path::{Path, PathBuf},
};
use tokio::{fs, io::AsyncWriteExt};

#[derive(Default, Clone, Copy)]
pub(crate) struct Integrity<'a> {
    pub sha1: Option<&'a str>,
    pub sha512: Option<&'a str>,
    pub size: Option<u64>,
}

struct TemporaryDownload {
    path: PathBuf,
    file: Option<fs::File>,
}

impl Drop for TemporaryDownload {
    fn drop(&mut self) {
        drop(self.file.take());
        let _ = std::fs::remove_file(&self.path);
    }
}

pub(crate) async fn stream_to_path<F, Fut>(
    client: &Client,
    url: &str,
    path: &Path,
    integrity: Integrity<'_>,
    mut control: F,
) -> Result<(), CommandError>
where
    F: FnMut(u64, u64) -> Fut,
    Fut: Future<Output = Result<(), CommandError>>,
{
    for (name, hash, length) in [
        ("SHA-1", integrity.sha1, 40),
        ("SHA-512", integrity.sha512, 128),
    ] {
        if hash.is_some_and(|hash| {
            hash.len() != length || !hash.bytes().all(|b| b.is_ascii_hexdigit())
        }) {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("Invalid download {name} metadata"),
            ));
        }
    }
    control(0, integrity.size.unwrap_or(0)).await?;
    let mut response = client.get(url).send().await.map_err(|e| {
        let detail = format!("download request error: {e}");
        CommandError::from(e).context(detail)
    })?;
    if !response.status().is_success() {
        return Err(CommandError::new(
            ErrorCode::DownloadFailed,
            format!("download http error {} for {url}", response.status()),
        ));
    }
    let content_length = response.content_length();
    if let (Some(expected), Some(actual)) = (integrity.size, content_length) {
        if actual != expected {
            return Err(CommandError::new(
                ErrorCode::ChecksumMismatch,
                format!("download size mismatch for {url}"),
            ));
        }
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.map_err(|e| {
            let detail = format!("create download directory error: {e}");
            CommandError::from(e).context(detail)
        })?;
    }
    let mut temp = TemporaryDownload {
        path: path.with_extension(format!("{}.part", uuid::Uuid::new_v4())),
        file: None,
    };
    temp.file = Some(fs::File::from_std(
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp.path)
            .map_err(|e| {
                let detail = format!("create download file error: {e}");
                CommandError::from(e).context(detail)
            })?,
    ));
    let mut sha1 = Sha1::new();
    let mut sha512 = Sha512::new();
    let mut received = 0u64;
    let total = integrity.size.or(content_length).unwrap_or(0);
    loop {
        control(received, total).await?;
        let Some(chunk) = response.chunk().await.map_err(|e| {
            let detail = format!("read download bytes error: {e}");
            CommandError::from(e).context(detail)
        })?
        else {
            break;
        };
        received = received
            .checked_add(chunk.len() as u64)
            .ok_or(CommandError::new(
                ErrorCode::Unknown,
                "download size overflow",
            ))?;
        if integrity
            .size
            .or(content_length)
            .is_some_and(|size| received > size)
        {
            return Err(CommandError::new(
                ErrorCode::ChecksumMismatch,
                format!("download size exceeds metadata for {url}"),
            ));
        }
        if integrity.sha1.is_some() {
            sha1.update(&chunk);
        }
        if integrity.sha512.is_some() {
            sha512.update(&chunk);
        }
        temp.file
            .as_mut()
            .ok_or(CommandError::new(
                ErrorCode::Unknown,
                "download file is closed",
            ))?
            .write_all(&chunk)
            .await
            .map_err(|e| {
                let detail = format!("write download error: {e}");
                CommandError::from(e).context(detail)
            })?;
    }
    if integrity
        .size
        .or(content_length)
        .is_some_and(|size| received != size)
        || (received == 0 && integrity.size != Some(0))
    {
        return Err(CommandError::new(
            ErrorCode::ChecksumMismatch,
            format!("download size mismatch for {url}"),
        ));
    }
    for (name, expected, actual) in [
        ("SHA-1", integrity.sha1, format!("{:x}", sha1.finalize())),
        (
            "SHA-512",
            integrity.sha512,
            format!("{:x}", sha512.finalize()),
        ),
    ] {
        if expected.is_some_and(|expected| !actual.eq_ignore_ascii_case(expected)) {
            return Err(CommandError::new(
                ErrorCode::ChecksumMismatch,
                format!("download {name} mismatch for {url}"),
            ));
        }
    }
    control(received, total).await?;
    let file = temp.file.as_mut().ok_or(CommandError::new(
        ErrorCode::Unknown,
        "download file is closed",
    ))?;
    file.flush().await.map_err(|e| {
        let detail = format!("flush download error: {e}");
        CommandError::from(e).context(detail)
    })?;
    file.sync_all().await.map_err(|e| {
        let detail = format!("sync download error: {e}");
        CommandError::from(e).context(detail)
    })?;
    drop(temp.file.take());
    // Keep the rename synchronous: cancellation cannot interrupt activation.
    std::fs::rename(&temp.path, path).map_err(|e| {
        let detail = format!("commit download error: {e}");
        CommandError::from(e).context(detail)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };

    struct Directory(PathBuf);
    impl Directory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("screen-stream-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn serve(body: Vec<u8>, declared_size: usize) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}/file", listener.local_addr().unwrap());
        let task = std::thread::spawn(move || {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            let mut socket = loop {
                match listener.accept() {
                    Ok((socket, _)) => break socket,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(std::time::Instant::now() < deadline);
                        std::thread::sleep(std::time::Duration::from_millis(5));
                    }
                    Err(e) => panic!("{e}"),
                }
            };
            socket.set_nonblocking(false).unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            socket
                .set_write_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut request = [0u8; 1024];
            let mut request_size = 0;
            while !request[..request_size]
                .windows(4)
                .any(|part| part == b"\r\n\r\n")
            {
                let read = socket.read(&mut request[request_size..]).unwrap();
                assert!(read > 0);
                request_size += read;
            }
            let _ = write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {declared_size}\r\nConnection: close\r\n\r\n"
            );
            for chunk in body.chunks(16 * 1024) {
                if socket.write_all(chunk).is_err() {
                    break;
                }
            }
            let _ = socket.shutdown(std::net::Shutdown::Write);
            let _ = socket.read(&mut request);
        });
        (url, task)
    }

    #[tokio::test]
    async fn writes_chunks_to_disk_before_activation_and_checks_both_hashes() {
        let directory = Directory::new();
        let destination = directory.0.join("mod.jar");
        std::fs::write(&destination, b"old").unwrap();
        let body = vec![42u8; 2 * 1024 * 1024];
        let sha1 = format!("{:x}", Sha1::digest(&body));
        let sha512 = format!("{:x}", Sha512::digest(&body));
        let (url, server) = serve(body.clone(), body.len());
        let observed = std::sync::atomic::AtomicBool::new(false);
        stream_to_path(
            &Client::builder().no_proxy().build().unwrap(),
            &url,
            &destination,
            Integrity {
                sha1: Some(&sha1),
                sha512: Some(&sha512),
                size: Some(body.len() as u64),
            },
            |received, _| {
                let directory = &directory;
                let destination = &destination;
                let observed = &observed;
                async move {
                    if received > 0 {
                        assert_eq!(std::fs::read(destination).unwrap(), b"old");
                        // Tokio may still be completing the buffered file write.
                        // Waiting here proves disk output exists before activation;
                        // a downloader accumulating a Vec would time out.
                        tokio::time::timeout(std::time::Duration::from_secs(2), async {
                            loop {
                                if std::fs::read_dir(&directory.0).unwrap().any(|entry| {
                                    let entry = entry.unwrap();
                                    entry.path().extension().is_some_and(|ext| ext == "part")
                                        && std::fs::File::open(entry.path())
                                            .unwrap()
                                            .metadata()
                                            .unwrap()
                                            .len()
                                            > 0
                                }) {
                                    break;
                                }
                                tokio::task::yield_now().await;
                            }
                        })
                        .await
                        .unwrap();
                        observed.store(true, std::sync::atomic::Ordering::Relaxed);
                    }
                    Ok(())
                }
            },
        )
        .await
        .unwrap();
        server.join().unwrap();
        assert!(observed.load(std::sync::atomic::Ordering::Relaxed));
        assert_eq!(std::fs::read(&destination).unwrap(), body);
        assert_eq!(std::fs::read_dir(&directory.0).unwrap().count(), 1);
    }

    #[tokio::test]
    async fn bad_hash_size_truncation_and_cancellation_preserve_the_destination() {
        for scenario in ["sha1", "sha512", "size", "truncated", "cancel"] {
            let directory = Directory::new();
            let destination = directory.0.join("pack.zip");
            std::fs::write(&destination, b"old").unwrap();
            let (url, server) = serve(
                b"new data".to_vec(),
                if scenario == "truncated" { 20 } else { 8 },
            );
            let bad_sha1 = "0".repeat(40);
            let bad_sha512 = "0".repeat(128);
            let result = stream_to_path(
                &Client::builder().no_proxy().build().unwrap(),
                &url,
                &destination,
                Integrity {
                    sha1: (scenario == "sha1").then_some(bad_sha1.as_str()),
                    sha512: (scenario == "sha512").then_some(bad_sha512.as_str()),
                    size: if scenario == "size" { Some(9) } else { None },
                },
                |received, _| async move {
                    if scenario == "cancel" && received > 0 {
                        Err(CommandError::new(ErrorCode::Cancelled, "cancelled"))
                    } else {
                        Ok(())
                    }
                },
            )
            .await;
            server.join().unwrap();
            assert!(result.is_err(), "{scenario}");
            assert_eq!(std::fs::read(&destination).unwrap(), b"old", "{scenario}");
            assert_eq!(
                std::fs::read_dir(&directory.0).unwrap().count(),
                1,
                "{scenario}"
            );
        }
    }
}
