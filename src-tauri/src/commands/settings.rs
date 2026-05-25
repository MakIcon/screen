use crate::{
    minecraft::normalized_ram,
    models::LauncherSettings,
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
