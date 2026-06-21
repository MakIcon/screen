use crate::{
    minecraft::normalized_ram,
    models::{LauncherPluginsSettings, LauncherSettings},
    paths::{read_settings, write_settings},
};

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
pub async fn set_launcher_plugins(
    plugins: LauncherPluginsSettings,
) -> Result<LauncherSettings, String> {
    // The proxy plugin feeds the shared network client. Validate the URL now so
    // a bad value surfaces in the UI instead of failing later mid-download.
    if plugins.proxy.enabled {
        let trimmed = plugins.proxy.url.trim();
        if !trimmed.is_empty() {
            reqwest::Proxy::all(trimmed).map_err(|e| format!("Invalid proxy: {e}"))?;
        }
    }

    let mut settings = read_settings().await?;
    settings.plugins = plugins;
    write_settings(&settings).await?;
    Ok(settings)
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
