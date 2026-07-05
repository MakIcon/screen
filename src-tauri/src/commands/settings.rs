use crate::{
    minecraft::{mirrors, normalized_ram},
    models::{LauncherPluginsSettings, LauncherSettings},
    paths::{read_settings, write_settings},
};
use serde::Serialize;
use std::time::{Duration, Instant};

const PROXY_TEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyTestResult {
    pub ok: bool,
    pub status: Option<u16>,
    pub latency_ms: u128,
    pub message: String,
}

#[tauri::command]
pub async fn get_launcher_settings() -> Result<LauncherSettings, String> {
    read_settings().await
}

#[tauri::command]
pub async fn set_default_ram_gb(ram: u32) -> Result<LauncherSettings, String> {
    let mut settings = read_settings().await?;
    settings.default_ram_gb = normalized_ram(ram);
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn set_optimized_java_args(enabled: bool) -> Result<LauncherSettings, String> {
    let mut settings = read_settings().await?;
    settings.optimized_java_args = enabled;
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn set_auto_download_java(enabled: bool) -> Result<LauncherSettings, String> {
    let mut settings = read_settings().await?;
    settings.auto_download_java = enabled;
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn set_mascot_enabled(enabled: bool) -> Result<LauncherSettings, String> {
    let mut settings = read_settings().await?;
    settings.mascot_enabled = enabled;
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn set_launcher_plugins(
    plugins: LauncherPluginsSettings,
) -> Result<LauncherSettings, String> {
    // The proxy plugin feeds the shared network client. Validate the URL now so
    // a bad value surfaces in the UI instead of failing later mid-download.
    if plugins.proxy.enabled {
        let trimmed = plugins.proxy.url.trim();
        if !trimmed.is_empty() {
            mirrors::configured_proxy(trimmed, &plugins.proxy.bypass)?;
        }
    }

    let mut settings = read_settings().await?;
    settings.plugins = plugins;
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn test_proxy_connection(proxy_url: String) -> Result<ProxyTestResult, String> {
    if proxy_url.trim().is_empty() {
        return Err("Enter a proxy URL first".to_string());
    }

    // Disable environment/system proxies so this check can only succeed through
    // the explicit proxy being tested.
    let proxy = mirrors::configured_proxy(&proxy_url, "")?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .proxy(proxy)
        .user_agent("ScreenLauncher/0.1.0 proxy-test")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| format!("Proxy test client error: {error}"))?;
    let started = Instant::now();

    match client.get(PROXY_TEST_URL).send().await {
        Ok(response) => {
            let status = response.status();
            Ok(ProxyTestResult {
                ok: status.is_success(),
                status: Some(status.as_u16()),
                latency_ms: started.elapsed().as_millis(),
                message: if status.is_success() {
                    "Connected through proxy".to_string()
                } else {
                    format!("Proxy returned HTTP {status}")
                },
            })
        }
        Err(error) => Ok(ProxyTestResult {
            ok: false,
            status: error.status().map(|status| status.as_u16()),
            latency_ms: started.elapsed().as_millis(),
            message: format!("Connection failed: {}", error.without_url()),
        }),
    }
}

#[tauri::command]
pub async fn set_network_settings(mirror: String) -> Result<LauncherSettings, String> {
    let mut settings = read_settings().await?;
    settings.network.mirror = crate::minecraft::mirrors::MirrorMode::parse(&mirror)
        .as_str()
        .to_string();
    write_settings(&settings).await?;
    Ok(settings)
}
