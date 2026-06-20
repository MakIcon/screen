use reqwest::Client;

use crate::{minecraft::mirrors, models::MinecraftManifest, paths::MANIFEST_URL};

pub async fn fetch_manifest_network(client: &Client) -> Result<MinecraftManifest, String> {
    let response = mirrors::get_with_fallback(client, MANIFEST_URL).await?;

    if !response.status().is_success() {
        return Err(format!("manifest http error: {}", response.status()));
    }

    response
        .json::<MinecraftManifest>()
        .await
        .map_err(|e| format!("manifest parse error: {e}"))
}
