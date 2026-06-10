use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
pub struct PhasePayload {
    pub phase: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgressPayload {
    pub phase: String,
    pub current: usize,
    pub total: usize,
    pub percent: f64,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftManifest {
    pub latest: ManifestLatest,
    pub versions: Vec<ManifestVersion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLatest {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestVersion {
    pub id: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub url: String,
    pub time: String,
    pub release_time: String,
    pub sha1: Option<String>,
    pub compliance_level: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceItem {
    pub id: String,
    pub name: String,
    pub version: String,
    pub loader: String,
    #[serde(default)]
    pub fabric_loader_version: Option<String>,
    pub status: String,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub window_width: Option<u32>,
    #[serde(default)]
    pub window_height: Option<u32>,
    #[serde(default)]
    pub fullscreen: bool,
    pub last_played: String,
    #[serde(default)]
    pub playtime_secs: u64,
    pub created_at: String,
    pub game_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstancePayload {
    pub name: String,
    pub version: String,
    pub loader: String,
    #[serde(default)]
    pub fabric_loader_version: Option<String>,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub window_width: Option<u32>,
    #[serde(default)]
    pub window_height: Option<u32>,
    #[serde(default)]
    pub fullscreen: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstancePayload {
    pub id: String,
    pub name: String,
    pub version: String,
    pub loader: String,
    #[serde(default)]
    pub fabric_loader_version: Option<String>,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub window_width: Option<u32>,
    #[serde(default)]
    pub window_height: Option<u32>,
    #[serde(default)]
    pub fullscreen: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub ok: bool,
    pub message: String,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotItem {
    pub file_name: String,
    pub path: String,
    pub modified_at: u64,
    pub size_bytes: u64,
    pub mime: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotImage {
    pub file_name: String,
    pub data_url: String,
    pub mime: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VersionMeta {
    pub id: String,
    #[serde(default, rename = "inheritsFrom")]
    pub inherits_from: Option<String>,
    #[serde(default, rename = "mainClass")]
    pub main_class: Option<String>,
    #[serde(default)]
    pub assets: Option<String>,
    #[serde(default, rename = "assetIndex")]
    pub asset_index: Option<AssetIndexInfo>,
    #[serde(default)]
    pub downloads: Option<VersionDownloads>,
    #[serde(default)]
    pub libraries: Vec<Library>,
    #[serde(default)]
    pub arguments: Option<VersionArguments>,
    #[serde(default, rename = "minecraftArguments")]
    pub minecraft_arguments: Option<String>,
    #[serde(default, rename = "javaVersion")]
    pub java_version: Option<JavaVersionInfo>,
    #[serde(default)]
    pub logging: Option<LoggingInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexInfo {
    pub id: String,
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub total_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VersionDownloads {
    pub client: Option<DownloadInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DownloadInfo {
    pub path: Option<String>,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub name: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub downloads: Option<LibraryDownloads>,
    #[serde(default)]
    pub rules: Option<Vec<Rule>>,
    #[serde(default)]
    pub natives: Option<HashMap<String, String>>,
    #[serde(default)]
    pub extract: Option<ExtractInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDownloads {
    pub artifact: Option<DownloadInfo>,
    pub classifiers: Option<HashMap<String, DownloadInfo>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub action: String,
    #[serde(default)]
    pub os: Option<OsRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OsRule {
    pub name: Option<String>,
    pub arch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtractInfo {
    pub exclude: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VersionArguments {
    #[serde(default)]
    pub game: Option<Vec<ArgumentItem>>,
    #[serde(default)]
    pub jvm: Option<Vec<ArgumentItem>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ArgumentItem {
    String(String),
    Ruled {
        rules: Vec<Rule>,
        value: ArgumentValue,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ArgumentValue {
    Single(String),
    Multi(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersionInfo {
    pub component: Option<String>,
    pub major_version: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoggingInfo {
    pub client: Option<LoggingClientInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoggingClientInfo {
    pub argument: Option<String>,
    pub file: Option<DownloadInfo>,
    #[serde(rename = "type")]
    pub r#type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexJson {
    #[serde(default)]
    pub objects: HashMap<String, AssetObject>,
    #[serde(default)]
    pub virtual_: Option<bool>,
    #[serde(default)]
    pub map_to_resources: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    pub default_ram_gb: u32,
    #[serde(default = "default_optimized_java_args")]
    pub optimized_java_args: bool,
    #[serde(default)]
    pub plugins: LauncherPluginsSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherPluginsSettings {
    #[serde(default)]
    pub discord_rpc: DiscordRpcPluginSettings,
    #[serde(default)]
    pub mineflayer_bot: MineflayerBotPluginSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordRpcPluginSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub application_id: String,
    #[serde(default = "default_discord_rpc_display_mode")]
    pub display_mode: String,
    #[serde(default)]
    pub activity_name_template: String,
    #[serde(default = "default_discord_rpc_details_template")]
    pub details_template: String,
    #[serde(default = "default_discord_rpc_state_template")]
    pub state_template: String,
    #[serde(default = "default_discord_rpc_launcher_details_template")]
    pub launcher_details_template: String,
    #[serde(default = "default_discord_rpc_launcher_state_template")]
    pub launcher_state_template: String,
    #[serde(default = "default_discord_rpc_combined_details_template")]
    pub combined_details_template: String,
    #[serde(default = "default_discord_rpc_combined_state_template")]
    pub combined_state_template: String,
    #[serde(default = "default_discord_rpc_show_elapsed_time")]
    pub show_elapsed_time: bool,
    #[serde(default)]
    pub large_image_key: String,
    #[serde(default = "default_discord_rpc_large_image_text_template")]
    pub large_image_text_template: String,
    #[serde(default)]
    pub small_image_key: String,
    #[serde(default = "default_discord_rpc_small_image_text_template")]
    pub small_image_text_template: String,
    #[serde(default)]
    pub button_label: String,
    #[serde(default)]
    pub button_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MineflayerBotPluginSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_mineflayer_bot_port")]
    pub port: u16,
    #[serde(default)]
    pub version: String,
    #[serde(default = "default_mineflayer_bot_command_prefix")]
    pub command_prefix: String,
    #[serde(default = "default_mineflayer_bot_account_mode")]
    pub bot_account_mode: String,
    #[serde(default = "default_mineflayer_bot_nickname")]
    pub bot_nickname: String,
    #[serde(default)]
    pub bot_microsoft_account_id: Option<String>,
    #[serde(default = "default_mineflayer_bot_follow_distance")]
    pub follow_distance: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MineflayerBotStatus {
    pub running: bool,
    pub state: String,
    pub pid: Option<u32>,
    pub owner_name: Option<String>,
    pub bot_username: Option<String>,
    pub server: Option<String>,
    pub last_error: Option<String>,
    pub logs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftAccount {
    pub id: String,
    pub uuid: String,
    pub username: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            default_ram_gb: 4,
            optimized_java_args: default_optimized_java_args(),
            plugins: LauncherPluginsSettings::default(),
        }
    }
}

impl Default for LauncherPluginsSettings {
    fn default() -> Self {
        Self {
            discord_rpc: DiscordRpcPluginSettings::default(),
            mineflayer_bot: MineflayerBotPluginSettings::default(),
        }
    }
}

impl Default for DiscordRpcPluginSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            application_id: String::new(),
            display_mode: default_discord_rpc_display_mode(),
            activity_name_template: String::new(),
            details_template: default_discord_rpc_details_template(),
            state_template: default_discord_rpc_state_template(),
            launcher_details_template: default_discord_rpc_launcher_details_template(),
            launcher_state_template: default_discord_rpc_launcher_state_template(),
            combined_details_template: default_discord_rpc_combined_details_template(),
            combined_state_template: default_discord_rpc_combined_state_template(),
            show_elapsed_time: default_discord_rpc_show_elapsed_time(),
            large_image_key: String::new(),
            large_image_text_template: default_discord_rpc_large_image_text_template(),
            small_image_key: String::new(),
            small_image_text_template: default_discord_rpc_small_image_text_template(),
            button_label: String::new(),
            button_url: String::new(),
        }
    }
}

impl Default for MineflayerBotPluginSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            host: String::new(),
            port: default_mineflayer_bot_port(),
            version: String::new(),
            command_prefix: default_mineflayer_bot_command_prefix(),
            bot_account_mode: default_mineflayer_bot_account_mode(),
            bot_nickname: default_mineflayer_bot_nickname(),
            bot_microsoft_account_id: None,
            follow_distance: default_mineflayer_bot_follow_distance(),
        }
    }
}

fn default_optimized_java_args() -> bool {
    true
}

fn default_discord_rpc_details_template() -> String {
    "Playing %build_name%".to_string()
}

fn default_discord_rpc_state_template() -> String {
    "%build_version% / %build_loader% via ScreenLauncher".to_string()
}

fn default_discord_rpc_display_mode() -> String {
    "minecraft".to_string()
}

fn default_discord_rpc_launcher_details_template() -> String {
    "In ScreenLauncher".to_string()
}

fn default_discord_rpc_launcher_state_template() -> String {
    "Managing %total_builds% builds".to_string()
}

fn default_discord_rpc_combined_details_template() -> String {
    "Playing %build_name%".to_string()
}

fn default_discord_rpc_combined_state_template() -> String {
    "%build_version% / %build_loader% via ScreenLauncher".to_string()
}

fn default_discord_rpc_show_elapsed_time() -> bool {
    true
}

fn default_discord_rpc_large_image_text_template() -> String {
    "ScreenLauncher".to_string()
}

fn default_discord_rpc_small_image_text_template() -> String {
    "Minecraft %build_version%".to_string()
}

fn default_mineflayer_bot_port() -> u16 {
    25565
}

fn default_mineflayer_bot_command_prefix() -> String {
    "!".to_string()
}

fn default_mineflayer_bot_account_mode() -> String {
    "offline".to_string()
}

fn default_mineflayer_bot_nickname() -> String {
    "SCREEN_BOT".to_string()
}

fn default_mineflayer_bot_follow_distance() -> u32 {
    3
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedItem {
    pub project_id: Option<String>,
    pub title: String,
    pub source: String,
    #[serde(default)]
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceExportData {
    pub schema_version: u32,
    pub name: String,
    pub version: String,
    pub loader: String,
    #[serde(default)]
    pub fabric_loader_version: Option<String>,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub window_width: Option<u32>,
    #[serde(default)]
    pub window_height: Option<u32>,
    #[serde(default)]
    pub fullscreen: bool,
    #[serde(default)]
    pub mods: Vec<ExportedItem>,
    #[serde(default)]
    pub shaders: Vec<ExportedItem>,
    #[serde(default)]
    pub resource_packs: Vec<ExportedItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInstancePayload {
    pub name: String,
    pub version: String,
    pub loader: String,
    #[serde(default)]
    pub fabric_loader_version: Option<String>,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub window_width: Option<u32>,
    #[serde(default)]
    pub window_height: Option<u32>,
    #[serde(default)]
    pub fullscreen: bool,
    #[serde(default)]
    pub mods: Vec<ExportedItem>,
    #[serde(default)]
    pub shaders: Vec<ExportedItem>,
    #[serde(default)]
    pub resource_packs: Vec<ExportedItem>,
}
