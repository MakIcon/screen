use reqwest::Client;

use crate::{models::MinecraftManifest, paths::MANIFEST_URL};

pub async fn fetch_manifest_network(client: &Client) -> Result<MinecraftManifest, String> {
    let response = client
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("manifest request error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("manifest http error: {}", response.status()));
    }

    response
        .json::<MinecraftManifest>()
        .await
        .map_err(|e| format!("manifest parse error: {e}"))
}
