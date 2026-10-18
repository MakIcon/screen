use crate::{
    minecraft::{mirrors, normalized_ram},
    models::{LauncherPluginsSettings, LauncherSettings, MascotSettings},
    paths::{read_settings, write_settings},
};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::sync::Mutex;

static SETTINGS_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LauncherPluginId {
    DiscordRpc,
    MineflayerBot,
    BlueMap,
    ObsTelemetry,
    Proxy,
}

fn merge_plugins(
    current: &mut LauncherPluginsSettings,
    incoming: LauncherPluginsSettings,
    plugin_ids: Option<Vec<LauncherPluginId>>,
) {
    let Some(plugin_ids) = plugin_ids else {
        *current = incoming;
        return;
    };
    for id in plugin_ids {
        match id {
            LauncherPluginId::DiscordRpc => current.discord_rpc = incoming.discord_rpc.clone(),
            LauncherPluginId::MineflayerBot => {
                current.mineflayer_bot = incoming.mineflayer_bot.clone()
            }
            LauncherPluginId::BlueMap => current.blue_map = incoming.blue_map.clone(),
            LauncherPluginId::ObsTelemetry => {
                current.obs_telemetry = incoming.obs_telemetry.clone()
            }
            LauncherPluginId::Proxy => current.proxy = incoming.proxy.clone(),
        }
    }
}

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
    let _guard = SETTINGS_LOCK.lock().await;
    read_settings().await
}

#[tauri::command]
pub async fn set_default_ram_gb(ram: u32) -> Result<LauncherSettings, String> {
    let _guard = SETTINGS_LOCK.lock().await;
    let mut settings = read_settings().await?;
    settings.default_ram_gb = normalized_ram(ram);
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn set_optimized_java_args(enabled: bool) -> Result<LauncherSettings, String> {
    let _guard = SETTINGS_LOCK.lock().await;
    let mut settings = read_settings().await?;
    settings.optimized_java_args = enabled;
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn set_auto_download_java(enabled: bool) -> Result<LauncherSettings, String> {
    let _guard = SETTINGS_LOCK.lock().await;
    let mut settings = read_settings().await?;
    settings.auto_download_java = enabled;
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn set_mascot_enabled(enabled: bool) -> Result<LauncherSettings, String> {
    let _guard = SETTINGS_LOCK.lock().await;
    let mut settings = read_settings().await?;
    settings.mascot_enabled = enabled;
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn set_mascot_settings(mascot: MascotSettings) -> Result<LauncherSettings, String> {
    let _guard = SETTINGS_LOCK.lock().await;
    let mut settings = read_settings().await?;
    settings.mascot = mascot.normalize();
    write_settings(&settings).await?;
    Ok(settings)
}

#[tauri::command]
pub async fn set_launcher_plugins(
    app: tauri::AppHandle,
    plugins: LauncherPluginsSettings,
    plugin_ids: Option<Vec<LauncherPluginId>>,
) -> Result<LauncherSettings, String> {
    let _guard = SETTINGS_LOCK.lock().await;
    let mut settings = read_settings().await?;
    merge_plugins(&mut settings.plugins, plugins, plugin_ids);
    // The proxy plugin feeds the shared network client. Validate the URL now so
    // a bad value surfaces in the UI instead of failing later mid-download.
    if settings.plugins.proxy.enabled {
        let trimmed = settings.plugins.proxy.url.trim();
        if !trimmed.is_empty() {
            mirrors::configured_proxy(trimmed, &settings.plugins.proxy.bypass)?;
        }
    }

    write_settings(&settings).await?;
    let _ = app.emit("launcher-plugins-changed", &settings.plugins);
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
    let _guard = SETTINGS_LOCK.lock().await;
    let mut settings = read_settings().await?;
    settings.network.mirror = crate::minecraft::mirrors::MirrorMode::parse(&mirror)
        .as_str()
        .to_string();
    write_settings(&settings).await?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::{merge_plugins, LauncherPluginId};
    use crate::models::LauncherPluginsSettings;

    #[test]
    fn detached_bot_edit_preserves_other_plugins_changed_in_launcher() {
        let mut current = LauncherPluginsSettings::default();
        current.proxy.enabled = true;
        current.proxy.url = "http://127.0.0.1:8080".into();
        current.discord_rpc.enabled = true;
        let mut stale_window = LauncherPluginsSettings::default();
        stale_window.mineflayer_bot.host = "play.example.net".into();

        merge_plugins(
            &mut current,
            stale_window,
            Some(vec![LauncherPluginId::MineflayerBot]),
        );

        assert_eq!(current.mineflayer_bot.host, "play.example.net");
        assert!(current.proxy.enabled);
        assert_eq!(current.proxy.url, "http://127.0.0.1:8080");
        assert!(current.discord_rpc.enabled);
    }

    #[test]
    fn launcher_edit_preserves_bot_changes_from_detached_window() {
        let mut current = LauncherPluginsSettings::default();
        current.mineflayer_bot.host = "new.example.net".into();
        let mut stale_launcher = LauncherPluginsSettings::default();
        stale_launcher.discord_rpc.enabled = true;

        merge_plugins(
            &mut current,
            stale_launcher,
            Some(vec![LauncherPluginId::DiscordRpc]),
        );

        assert_eq!(current.mineflayer_bot.host, "new.example.net");
        assert!(current.discord_rpc.enabled);
    }

    #[test]
    fn plugin_patch_ids_match_frontend_names_and_reject_unknown_plugins() {
        for id in [
            "discordRpc",
            "mineflayerBot",
            "blueMap",
            "obsTelemetry",
            "proxy",
        ] {
            assert!(serde_json::from_value::<LauncherPluginId>(serde_json::json!(id)).is_ok());
        }
        assert!(serde_json::from_value::<LauncherPluginId>(serde_json::json!("unknown")).is_err());
    }
}
