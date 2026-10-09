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
    #[serde(default)]
    pub pinned: bool,
    pub version: String,
    pub loader: String,
    #[serde(default, alias = "fabricLoaderVersion")]
    pub loader_version: Option<String>,
    pub status: String,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub environment_variables: HashMap<String, String>,
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
pub struct PlaytimeSession {
    /// Unix timestamp (seconds) when the session ended.
    pub ts: u64,
    /// Duration of the session in seconds.
    pub secs: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlaytimeLog {
    #[serde(default)]
    pub sessions: Vec<PlaytimeSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstancePayload {
    pub name: String,
    pub version: String,
    pub loader: String,
    #[serde(default, alias = "fabricLoaderVersion")]
    pub loader_version: Option<String>,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub environment_variables: HashMap<String, String>,
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
    #[serde(default)]
    pub pinned: bool,
    pub version: String,
    pub loader: String,
    #[serde(default, alias = "fabricLoaderVersion")]
    pub loader_version: Option<String>,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub environment_variables: HashMap<String, String>,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaSettingsTestPayload {
    #[serde(default)]
    pub instance_id: Option<String>,
    pub version: String,
    pub ram: u32,
    pub java_args: Option<String>,
    pub java_path: Option<String>,
    #[serde(default)]
    pub environment_variables: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaSettingsTestResult {
    pub success: bool,
    pub java_path: String,
    pub output: String,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchLogSnapshot {
    pub instance_id: String,
    pub instance_name: String,
    pub log_path: Option<String>,
    pub minecraft_log_path: Option<String>,
    pub crash_report_path: Option<String>,
    pub log_tail: String,
    pub crash_report_tail: Option<String>,
    pub hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftExitPayload {
    pub instance_id: String,
    pub instance_name: String,
    pub pid: u32,
    pub exit_code: Option<i32>,
    pub runtime_secs: u64,
    pub crashed: bool,
    pub reason: String,
    pub log_path: Option<String>,
    pub minecraft_log_path: Option<String>,
    pub crash_report_path: Option<String>,
    pub log_tail: String,
    pub crash_report_tail: Option<String>,
    pub hint: Option<String>,
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
    /// Download a matching Java runtime automatically when none is found locally.
    #[serde(default = "default_auto_download_java")]
    pub auto_download_java: bool,
    /// Show the interactive mascot in the launcher sidebar.
    #[serde(default = "default_mascot_enabled")]
    pub mascot_enabled: bool,
    /// Behaviour and permissions for the interactive launcher mascot.
    #[serde(default)]
    pub mascot: MascotSettings,
    #[serde(default)]
    pub network: NetworkSettings,
    #[serde(default)]
    pub plugins: LauncherPluginsSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MascotSettings {
    #[serde(default = "default_mascot_name")]
    pub name: String,
    #[serde(default = "default_true")]
    pub show_name: bool,
    #[serde(default = "default_true")]
    pub rage_enabled: bool,
    #[serde(default = "default_true")]
    pub bowl_enabled: bool,
    #[serde(default = "default_true")]
    pub movement_enabled: bool,
    #[serde(default = "default_true")]
    pub interactions_enabled: bool,
    #[serde(default = "default_true")]
    pub carry_elements_enabled: bool,
    #[serde(default = "default_true")]
    pub scroll_lists_enabled: bool,
}

impl Default for MascotSettings {
    fn default() -> Self {
        Self {
            name: default_mascot_name(),
            show_name: true,
            rage_enabled: true,
            bowl_enabled: true,
            movement_enabled: true,
            interactions_enabled: true,
            carry_elements_enabled: true,
            scroll_lists_enabled: true,
        }
    }
}

impl MascotSettings {
    pub fn normalize(mut self) -> Self {
        let normalized_name = self.name.trim().chars().take(24).collect::<String>();
        self.name = if normalized_name.is_empty() {
            default_mascot_name()
        } else {
            normalized_name
        };
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSettings {
    /// Download source: "official", "auto" (official first, mirror fallback) or
    /// "mirror" (BMCLAPI first). See `minecraft::mirrors::MirrorMode`.
    #[serde(default = "default_mirror_mode")]
    pub mirror: String,
}

impl Default for NetworkSettings {
    fn default() -> Self {
        Self {
            mirror: default_mirror_mode(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LauncherPluginsSettings {
    #[serde(default)]
    pub discord_rpc: DiscordRpcPluginSettings,
    #[serde(default)]
    pub mineflayer_bot: MineflayerBotPluginSettings,
    #[serde(default)]
    pub blue_map: BlueMapPluginSettings,
    #[serde(default)]
    pub obs_telemetry: ObsTelemetryPluginSettings,
    #[serde(default)]
    pub proxy: ProxyPluginSettings,
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
    #[serde(default = "default_mineflayer_bot_command_source")]
    pub command_source: String,
    #[serde(default)]
    pub extra_owners: String,
    #[serde(default = "default_mineflayer_bot_command_cooldown_ms")]
    pub command_cooldown_ms: u32,
    #[serde(default = "default_true")]
    pub send_chat_feedback: bool,
    #[serde(default)]
    pub allow_say_command: bool,
    #[serde(default = "default_true")]
    pub allow_quit_command: bool,
    #[serde(default = "default_mineflayer_bot_account_mode")]
    pub bot_account_mode: String,
    #[serde(default = "default_mineflayer_bot_nickname")]
    pub bot_nickname: String,
    #[serde(default)]
    pub bot_microsoft_account_id: Option<String>,
    #[serde(default = "default_mineflayer_bot_follow_distance")]
    pub follow_distance: u32,
    #[serde(default = "default_mineflayer_bot_goto_radius")]
    pub goto_radius: u32,
    #[serde(default = "default_true")]
    pub allow_sprinting: bool,
    #[serde(default = "default_true")]
    pub allow_parkour: bool,
    #[serde(default)]
    pub allow_air_strafe: bool,
    #[serde(default)]
    pub can_dig: bool,
    #[serde(default = "default_mineflayer_bot_max_drop_down")]
    pub max_drop_down: u32,
    #[serde(default = "default_true")]
    pub stay_on_water: bool,
    #[serde(default)]
    pub auto_follow_on_spawn: bool,
    #[serde(default)]
    pub announce_on_spawn: bool,
    #[serde(default = "default_mineflayer_bot_spawn_message")]
    pub spawn_message: String,
    #[serde(default = "default_true")]
    pub auto_reconnect: bool,
    #[serde(default = "default_mineflayer_bot_reconnect_delay_seconds")]
    pub reconnect_delay_seconds: u32,
    #[serde(default = "default_mineflayer_bot_max_reconnect_attempts")]
    pub max_reconnect_attempts: u32,
    #[serde(default = "default_mineflayer_bot_connect_timeout_seconds")]
    pub connect_timeout_seconds: u32,
    #[serde(default = "default_true")]
    pub auto_respawn: bool,
    #[serde(default)]
    pub log_path_updates: bool,
    #[serde(default)]
    pub combat: MineflayerCombatSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MineflayerCombatSettings {
    pub enabled: bool,
    pub engine: String,
    pub style: String,
    pub auto_target: String,
    pub target_range: f64,
    pub reaction_ms: u32,
    pub melee_skill: u32,
    pub cps: u32,
    pub attack_range: f64,
    pub weapon: String,
    pub strafe: String,
    pub criticals: String,
    pub sprint_tap: String,
    pub shield: bool,
    pub shield_break: bool,
    pub smooth_aim: bool,
    pub smooth_aim_speed: u32,
    pub bow_enabled: bool,
    pub bow_engine: String,
    pub bow_accuracy: u32,
    pub bow_range: f64,
    pub bow_interval_ms: u32,
    pub bow_predict: bool,
    pub bow_offhand: bool,
    pub melee_fallback: bool,
}

impl Default for MineflayerCombatSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            engine: "custom".into(),
            style: "auto".into(),
            auto_target: "manual".into(),
            target_range: 24.0,
            reaction_ms: 250,
            melee_skill: 80,
            cps: 12,
            attack_range: 3.0,
            weapon: "sword".into(),
            strafe: "intelligent".into(),
            criticals: "hop".into(),
            sprint_tap: "wtap".into(),
            shield: true,
            shield_break: true,
            smooth_aim: true,
            smooth_aim_speed: 100,
            bow_enabled: true,
            bow_engine: "custom".into(),
            bow_accuracy: 90,
            bow_range: 48.0,
            bow_interval_ms: 1500,
            bow_predict: true,
            bow_offhand: false,
            melee_fallback: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueMapPluginSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_bluemap_map_url")]
    pub map_url: String,
    #[serde(default)]
    pub cli_jar_path: String,
    #[serde(default)]
    pub working_dir: String,
    #[serde(default = "default_bluemap_java_path")]
    pub java_path: String,
    #[serde(default = "default_bluemap_render_on_start")]
    pub render_on_start: bool,
    #[serde(default = "default_bluemap_update_on_start")]
    pub update_on_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObsTelemetryPluginSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_obs_telemetry_port")]
    pub port: u16,
}

/// Routes every launcher HTTP request through a user proxy. Lives here as a
/// plugin so it sits next to the other optional integrations in the UI, but the
/// value is fed straight into the shared network client (see
/// `minecraft::mirrors`). Needed mainly to reach hosts BMCLAPI can't mirror
/// (e.g. QuiltMC) from blocked regions.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProxyPluginSettings {
    #[serde(default)]
    pub enabled: bool,
    /// e.g. `http://127.0.0.1:8080` or `socks5://127.0.0.1:1080`.
    #[serde(default)]
    pub url: String,
    /// Comma/newline separated hosts, domains, IPs or CIDR ranges that should
    /// connect directly instead of using the proxy.
    #[serde(default)]
    pub bypass: String,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueMapStatus {
    pub running: bool,
    pub state: String,
    pub pid: Option<u32>,
    pub url: String,
    pub cli_jar_path: Option<String>,
    pub working_dir: Option<String>,
    pub world_path: Option<String>,
    pub last_error: Option<String>,
    pub logs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsTelemetryPosition {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsTelemetryBlockPosition {
    #[serde(default)]
    pub x: i32,
    #[serde(default)]
    pub y: i32,
    #[serde(default)]
    pub z: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsTelemetryItem {
    #[serde(default)]
    pub slot: Option<String>,
    #[serde(default)]
    pub item_id: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub count: u32,
    #[serde(default)]
    pub damage: u32,
    #[serde(default)]
    pub max_damage: u32,
    #[serde(default)]
    pub durability: u32,
    #[serde(default)]
    pub durability_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsTelemetryPayload {
    #[serde(default)]
    pub minecraft_version: String,
    #[serde(default)]
    pub player_name: String,
    #[serde(default)]
    pub dimension: String,
    #[serde(default)]
    pub health: f32,
    #[serde(default)]
    pub max_health: f32,
    #[serde(default)]
    pub armor: u32,
    #[serde(default)]
    pub food: u32,
    #[serde(default)]
    pub saturation: f32,
    #[serde(default)]
    pub experience_level: u32,
    #[serde(default)]
    pub experience_progress: f32,
    #[serde(default)]
    pub total_experience: u32,
    #[serde(default)]
    pub yaw: f32,
    #[serde(default)]
    pub pitch: f32,
    #[serde(default)]
    pub position: ObsTelemetryPosition,
    #[serde(default)]
    pub block_position: ObsTelemetryBlockPosition,
    #[serde(default)]
    pub held_item: Option<ObsTelemetryItem>,
    #[serde(default)]
    pub offhand_item: Option<ObsTelemetryItem>,
    #[serde(default)]
    pub armor_items: Vec<ObsTelemetryItem>,
    #[serde(default)]
    pub sent_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObsTelemetryStatus {
    pub running: bool,
    pub state: String,
    pub port: u16,
    pub overlay_url: String,
    pub overlay_urls: HashMap<String, String>,
    pub json_url: String,
    pub last_player_name: Option<String>,
    pub last_update_age_ms: Option<u64>,
    pub last_payload: Option<ObsTelemetryPayload>,
    pub last_error: Option<String>,
    pub logs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct MicrosoftAccount {
    pub id: String,
    pub uuid: String,
    pub username: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftAccountSummary {
    pub id: String,
    pub uuid: String,
    pub username: String,
    pub expires_at: u64,
}

impl From<&MicrosoftAccount> for MicrosoftAccountSummary {
    fn from(account: &MicrosoftAccount) -> Self {
        Self {
            id: account.id.clone(),
            uuid: account.uuid.clone(),
            username: account.username.clone(),
            expires_at: account.expires_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub skins: Vec<MinecraftSkin>,
    #[serde(default)]
    pub capes: Vec<MinecraftCape>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftSkin {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub variant: Option<String>,
    #[serde(default)]
    pub alias: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftCape {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub alias: Option<String>,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            default_ram_gb: 4,
            optimized_java_args: default_optimized_java_args(),
            auto_download_java: default_auto_download_java(),
            mascot_enabled: default_mascot_enabled(),
            mascot: MascotSettings::default(),
            network: NetworkSettings::default(),
            plugins: LauncherPluginsSettings::default(),
        }
    }
}

impl LauncherSettings {
    pub fn blue_map_plugin(&self) -> &BlueMapPluginSettings {
        &self.plugins.blue_map
    }

    pub fn blue_map_plugin_mut(&mut self) -> &mut BlueMapPluginSettings {
        &mut self.plugins.blue_map
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
            command_source: default_mineflayer_bot_command_source(),
            extra_owners: String::new(),
            command_cooldown_ms: default_mineflayer_bot_command_cooldown_ms(),
            send_chat_feedback: true,
            allow_say_command: false,
            allow_quit_command: true,
            bot_account_mode: default_mineflayer_bot_account_mode(),
            bot_nickname: default_mineflayer_bot_nickname(),
            bot_microsoft_account_id: None,
            follow_distance: default_mineflayer_bot_follow_distance(),
            goto_radius: default_mineflayer_bot_goto_radius(),
            allow_sprinting: true,
            allow_parkour: true,
            allow_air_strafe: false,
            can_dig: false,
            max_drop_down: default_mineflayer_bot_max_drop_down(),
            stay_on_water: true,
            auto_follow_on_spawn: false,
            announce_on_spawn: false,
            spawn_message: default_mineflayer_bot_spawn_message(),
            auto_reconnect: true,
            reconnect_delay_seconds: default_mineflayer_bot_reconnect_delay_seconds(),
            max_reconnect_attempts: default_mineflayer_bot_max_reconnect_attempts(),
            connect_timeout_seconds: default_mineflayer_bot_connect_timeout_seconds(),
            auto_respawn: true,
            log_path_updates: false,
            combat: MineflayerCombatSettings::default(),
        }
    }
}

impl Default for BlueMapPluginSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            map_url: default_bluemap_map_url(),
            cli_jar_path: String::new(),
            working_dir: String::new(),
            java_path: default_bluemap_java_path(),
            render_on_start: default_bluemap_render_on_start(),
            update_on_start: default_bluemap_update_on_start(),
        }
    }
}

impl Default for ObsTelemetryPluginSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            port: default_obs_telemetry_port(),
        }
    }
}

fn default_optimized_java_args() -> bool {
    true
}

fn default_auto_download_java() -> bool {
    true
}

fn default_mascot_enabled() -> bool {
    false
}

fn default_mascot_name() -> String {
    "PIXEL".to_string()
}

fn default_mirror_mode() -> String {
    "auto".to_string()
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

fn default_mineflayer_bot_command_source() -> String {
    "both".to_string()
}

fn default_mineflayer_bot_command_cooldown_ms() -> u32 {
    500
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

fn default_mineflayer_bot_goto_radius() -> u32 {
    1
}

fn default_mineflayer_bot_max_drop_down() -> u32 {
    3
}

fn default_mineflayer_bot_spawn_message() -> String {
    "Ready, %owner%!".to_string()
}

fn default_mineflayer_bot_reconnect_delay_seconds() -> u32 {
    5
}

fn default_mineflayer_bot_max_reconnect_attempts() -> u32 {
    10
}

fn default_mineflayer_bot_connect_timeout_seconds() -> u32 {
    30
}

fn default_true() -> bool {
    true
}

fn default_bluemap_map_url() -> String {
    "http://127.0.0.1:8100/".to_string()
}

fn default_bluemap_java_path() -> String {
    "java".to_string()
}

fn default_bluemap_render_on_start() -> bool {
    true
}

fn default_bluemap_update_on_start() -> bool {
    true
}

fn default_obs_telemetry_port() -> u16 {
    18991
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
    #[serde(default, alias = "fabricLoaderVersion")]
    pub loader_version: Option<String>,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub environment_variables: HashMap<String, String>,
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
    #[serde(default, alias = "fabricLoaderVersion")]
    pub loader_version: Option<String>,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub environment_variables: HashMap<String, String>,
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
pub struct ImportContentResult {
    pub category: String,
    pub item: ExportedItem,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInstanceResult {
    pub instance: InstanceItem,
    pub items: Vec<ImportContentResult>,
}

#[cfg(test)]
mod loader_schema_tests {
    use super::{
        InstanceExportData, LauncherSettings, MascotSettings, MineflayerBotPluginSettings,
    };

    #[test]
    fn reads_legacy_fabric_loader_version_and_writes_loader_version() {
        let legacy = serde_json::json!({
            "schemaVersion": 1,
            "name": "Legacy Fabric",
            "version": "1.21.1",
            "loader": "Fabric",
            "fabricLoaderVersion": "0.16.14",
            "ram": 4
        });
        let parsed: InstanceExportData = serde_json::from_value(legacy).unwrap();
        assert_eq!(parsed.loader_version.as_deref(), Some("0.16.14"));
        assert!(parsed.environment_variables.is_empty());

        let serialized = serde_json::to_value(parsed).unwrap();
        assert_eq!(serialized["loaderVersion"], "0.16.14");
        assert!(serialized.get("fabricLoaderVersion").is_none());
    }

    #[test]
    fn environment_overrides_round_trip_through_build_metadata() {
        let metadata = serde_json::json!({
            "schemaVersion": 2, "name": "Test", "version": "1.21.1",
            "loader": "Vanilla", "ram": 4,
            "environmentVariables": { "SCREEN_LITERAL": "  a=b  ", "SCREEN_EMPTY": "" }
        });
        let parsed: InstanceExportData = serde_json::from_value(metadata.clone()).unwrap();
        let serialized = serde_json::to_value(parsed).unwrap();
        assert_eq!(
            serialized["environmentVariables"],
            metadata["environmentVariables"]
        );
    }

    #[test]
    fn reads_legacy_mineflayer_settings_with_safe_defaults() {
        let legacy = serde_json::json!({
            "enabled": true,
            "host": "localhost",
            "followDistance": 5
        });
        let parsed: MineflayerBotPluginSettings = serde_json::from_value(legacy).unwrap();

        assert_eq!(parsed.host, "localhost");
        assert_eq!(parsed.follow_distance, 5);
        assert!(!parsed.allow_air_strafe);
        assert!(parsed.auto_reconnect);
        assert!(parsed.auto_respawn);
        assert!(!parsed.can_dig);
        assert!(parsed.stay_on_water);
        assert_eq!(parsed.command_source, "both");
        assert_eq!(parsed.command_cooldown_ms, 500);
        assert_eq!(parsed.combat.engine, "custom");
        assert_eq!(parsed.combat.auto_target, "manual");
        assert_eq!(parsed.combat.smooth_aim_speed, 100);
    }

    #[test]
    fn mineflayer_combat_round_trips_and_defaults_match_worker() {
        let parsed: MineflayerBotPluginSettings = serde_json::from_value(serde_json::json!({
            "combat": { "engine": "basic", "bowEngine": "hawkeye", "bowPredict": false, "attackRange": 2.5, "smoothAimSpeed": 175 }
        })).unwrap();
        let saved = serde_json::to_value(&parsed).unwrap();
        assert_eq!(saved["combat"]["engine"], "basic");
        assert_eq!(saved["combat"]["bowEngine"], "hawkeye");
        assert_eq!(saved["combat"]["bowPredict"], false);
        assert_eq!(saved["combat"]["attackRange"], 2.5);
        assert_eq!(saved["combat"]["bowIntervalMs"], 1500);
        assert_eq!(saved["combat"]["smoothAimSpeed"], 175);
        let worker: super::MineflayerCombatSettings = serde_json::from_str(include_str!(
            "../../extensions/mineflayer-bot/combat-defaults.json"
        ))
        .unwrap();
        assert_eq!(
            serde_json::to_value(super::MineflayerCombatSettings::default()).unwrap(),
            serde_json::to_value(worker).unwrap()
        );
    }

    #[test]
    fn preserves_disabled_water_protection_in_saved_settings() {
        let parsed: MineflayerBotPluginSettings =
            serde_json::from_value(serde_json::json!({ "stayOnWater": false })).unwrap();
        assert!(!parsed.stay_on_water);
        assert_eq!(serde_json::to_value(parsed).unwrap()["stayOnWater"], false);
    }

    #[test]
    fn preserves_explicit_jump_head_turn_setting() {
        let parsed: MineflayerBotPluginSettings =
            serde_json::from_value(serde_json::json!({ "allowAirStrafe": true })).unwrap();
        assert!(parsed.allow_air_strafe);
        assert_eq!(serde_json::to_value(parsed).unwrap()["allowAirStrafe"], true);
        assert!(!MineflayerBotPluginSettings::default().allow_air_strafe);
    }

    #[test]
    fn legacy_launcher_settings_receive_mascot_defaults() {
        let legacy = serde_json::json!({
            "defaultRamGb": 4,
            "optimizedJavaArgs": true,
            "autoDownloadJava": true,
            "mascotEnabled": true
        });
        let parsed: LauncherSettings = serde_json::from_value(legacy).unwrap();

        assert_eq!(parsed.mascot.name, "PIXEL");
        assert!(parsed.mascot.show_name);
        assert!(parsed.mascot.rage_enabled);
        assert!(parsed.mascot.bowl_enabled);
        assert!(parsed.mascot.movement_enabled);
        assert!(parsed.mascot.interactions_enabled);
        assert!(parsed.mascot.carry_elements_enabled);
        assert!(parsed.mascot.scroll_lists_enabled);
    }

    #[test]
    fn mascot_name_is_trimmed_limited_and_never_empty() {
        let normalized = MascotSettings {
            name: "  123456789012345678901234567890  ".to_string(),
            ..MascotSettings::default()
        }
        .normalize();
        assert_eq!(normalized.name.chars().count(), 24);

        let fallback = MascotSettings {
            name: "   ".to_string(),
            ..MascotSettings::default()
        }
        .normalize();
        assert_eq!(fallback.name, "PIXEL");
    }
}
