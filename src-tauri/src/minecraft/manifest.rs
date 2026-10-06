use reqwest::Client;

use crate::{
    minecraft::mirrors,
    models::MinecraftManifest,
    paths::{atomic_write_path, launcher_root, MANIFEST_URL},
};

async fn read_manifest_cache(path: &std::path::Path) -> Result<Option<MinecraftManifest>, String> {
    match tokio::fs::read(path).await {
        Ok(raw) => Ok(serde_json::from_slice(&raw).ok()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("read manifest cache error: {error}")),
    }
}

pub async fn read_cached_manifest() -> Result<Option<MinecraftManifest>, String> {
    read_manifest_cache(&launcher_root()?.join("version_manifest_v2.json")).await
}

pub async fn fetch_manifest_network(client: &Client) -> Result<MinecraftManifest, String> {
    let response = mirrors::get_with_fallback(client, MANIFEST_URL).await?;

    if !response.status().is_success() {
        return Err(format!("manifest http error: {}", response.status()));
    }

    let manifest = response
        .json::<MinecraftManifest>()
        .await
        .map_err(|e| format!("manifest parse error: {e}"))?;
    let root = launcher_root()?;
    tokio::fs::create_dir_all(&root)
        .await
        .map_err(|e| format!("create manifest cache directory error: {e}"))?;
    let raw = serde_json::to_vec(&manifest)
        .map_err(|e| format!("serialize manifest cache error: {e}"))?;
    // A cache-write failure should not discard a usable network response.
    if let Err(error) = atomic_write_path(&root.join("version_manifest_v2.json"), &raw).await {
        eprintln!("{error}");
    }
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reads_cached_manifest_without_network_and_recovers_from_invalid_cache() {
        let path =
            std::env::temp_dir().join(format!("screen-manifest-{}.json", uuid::Uuid::new_v4()));
        assert!(read_manifest_cache(&path).await.unwrap().is_none());
        atomic_write_path(
            &path,
            br#"{"latest":{"release":"1.21.1","snapshot":"1.21.1"},"versions":[]}"#,
        )
        .await
        .unwrap();
        assert_eq!(
            read_manifest_cache(&path)
                .await
                .unwrap()
                .unwrap()
                .latest
                .release,
            "1.21.1"
        );
        tokio::fs::write(&path, b"broken cache").await.unwrap();
        assert!(read_manifest_cache(&path).await.unwrap().is_none());
        tokio::fs::remove_file(path).await.unwrap();
    }
}
