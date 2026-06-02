use std::{
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::State;

use crate::{
    models::{DiscordRpcPluginSettings, InstanceItem},
    paths::{detect_system_memory_gb, read_instances, read_settings},
};

const LAUNCHER_RPC_SESSION_ID: &str = "__launcher__";

#[derive(Default)]
pub struct DiscordRpcState {
    current: Mutex<Option<DiscordRpcSession>>,
}

struct DiscordRpcSession {
    instance_id: String,
    client: DiscordIpcClient,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum DiscordRpcDisplayMode {
    Launcher,
    Minecraft,
    Combined,
}

fn now_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn disconnect_session(mut session: DiscordRpcSession) {
    let _ = <DiscordIpcClient as DiscordIpc>::clear_activity(&mut session.client);
    let _ = <DiscordIpcClient as DiscordIpc>::close(&mut session.client);
}

fn clear_current_session(state: &DiscordRpcState, instance_id: Option<&str>) -> Result<(), String> {
    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Discord RPC state lock poisoned".to_string())?;

    let should_clear = guard
        .as_ref()
        .map(|session| {
            instance_id
                .map(|id| id == session.instance_id)
                .unwrap_or(true)
        })
        .unwrap_or(false);

    if should_clear {
        if let Some(session) = guard.take() {
            disconnect_session(session);
        }
    }

    Ok(())
}

fn to_friendly_value(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    match trimmed.to_ascii_lowercase().as_str() {
        "empty" => "Empty".to_string(),
        "fabric" => "Fabric".to_string(),
        "microsoft" => "Microsoft".to_string(),
        "offline" => "Offline".to_string(),
        "ready" => "Ready".to_string(),
        "running" => "Running".to_string(),
        "updating" => "Updating".to_string(),
        "vanilla" => "Vanilla".to_string(),
        _ if trimmed.chars().all(|ch| {
            ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_' || ch == '-' || ch == ' '
        }) =>
        {
            trimmed
                .to_ascii_lowercase()
                .replace(['_', '-'], " ")
                .split_whitespace()
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        Some(first) => {
                            format!("{}{}", first.to_ascii_uppercase(), chars.as_str())
                        }
                        None => String::new(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        }
        _ => trimmed.to_string(),
    }
}

fn format_playtime(secs: u64) -> String {
    if secs < 60 {
        return format!("{secs}s");
    }

    let minutes = secs / 60;
    if minutes < 60 {
        return format!("{minutes}m");
    }

    let hours = minutes / 60;
    let rest_minutes = minutes % 60;
    if rest_minutes == 0 {
        format!("{hours}h")
    } else {
        format!("{hours}h {rest_minutes}m")
    }
}

fn placeholder_pairs(
    instances: &[InstanceItem],
    instance: &InstanceItem,
    account_type: &str,
) -> Vec<(&'static str, String)> {
    let total_playtime_secs = instances.iter().map(|item| item.playtime_secs).sum::<u64>();

    vec![
        ("system_ram", format!("{} GB", detect_system_memory_gb())),
        (
            "system_ram_max",
            format!("{} GB", detect_system_memory_gb()),
        ),
        ("build_name", instance.name.clone()),
        ("build_version", instance.version.clone()),
        ("build_loader", to_friendly_value(&instance.loader)),
        ("build_ram", format!("{}GB", instance.ram)),
        ("build_playtime", format_playtime(instance.playtime_secs)),
        (
            "build_last_played",
            to_friendly_value(&instance.last_played),
        ),
        ("build_status", to_friendly_value(&instance.status)),
        ("build_state", "Running".to_string()),
        ("account_type", to_friendly_value(account_type)),
        ("total_playtime", format_playtime(total_playtime_secs)),
        ("total_builds", instances.len().to_string()),
    ]
}

fn resolve_rpc_template(
    template: &str,
    instances: &[InstanceItem],
    instance: &InstanceItem,
    account_type: &str,
) -> String {
    let mut resolved = template.to_string();

    for (key, value) in placeholder_pairs(instances, instance, account_type) {
        resolved = resolved.replace(&format!("^%{key}%"), &value.to_uppercase());
        resolved = resolved.replace(&format!("%{key}%"), &value);
    }

    resolved
}

fn clamp_activity_text(value: String, fallback: &str) -> String {
    let trimmed = value.trim();
    let text = if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    };
    text.chars().take(128).collect()
}

fn clamp_button_label(value: String) -> String {
    value.trim().chars().take(32).collect()
}

fn is_discord_url(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

fn parse_display_mode(value: &str) -> DiscordRpcDisplayMode {
    match value.trim().to_ascii_lowercase().as_str() {
        "launcher" => DiscordRpcDisplayMode::Launcher,
        "combined" | "both" | "all" => DiscordRpcDisplayMode::Combined,
        _ => DiscordRpcDisplayMode::Minecraft,
    }
}

fn fallback_activity_name(mode: &DiscordRpcDisplayMode) -> &'static str {
    match mode {
        DiscordRpcDisplayMode::Launcher => "ScreenLauncher",
        DiscordRpcDisplayMode::Minecraft => "Minecraft",
        DiscordRpcDisplayMode::Combined => "Minecraft",
    }
}

fn resolve_activity_name(
    plugin: &DiscordRpcPluginSettings,
    mode: &DiscordRpcDisplayMode,
    instances: &[InstanceItem],
    instance: &InstanceItem,
    account_type: &str,
) -> String {
    let fallback = fallback_activity_name(mode);
    clamp_activity_text(
        resolve_rpc_template(
            &plugin.activity_name_template,
            instances,
            instance,
            account_type,
        ),
        fallback,
    )
}

fn resolve_activity_copy(
    plugin: &DiscordRpcPluginSettings,
    mode: &DiscordRpcDisplayMode,
    instances: &[InstanceItem],
    instance: &InstanceItem,
    account_type: &str,
) -> (String, String) {
    let (details_template, state_template, details_fallback, state_fallback) = match mode {
        DiscordRpcDisplayMode::Launcher => (
            plugin.launcher_details_template.as_str(),
            plugin.launcher_state_template.as_str(),
            "In ScreenLauncher",
            "Preparing a build",
        ),
        DiscordRpcDisplayMode::Minecraft => (
            plugin.details_template.as_str(),
            plugin.state_template.as_str(),
            "Playing Minecraft",
            "ScreenLauncher",
        ),
        DiscordRpcDisplayMode::Combined => (
            plugin.combined_details_template.as_str(),
            plugin.combined_state_template.as_str(),
            "Playing Minecraft",
            "Via ScreenLauncher",
        ),
    };

    let details = clamp_activity_text(
        resolve_rpc_template(details_template, instances, instance, account_type),
        details_fallback,
    );
    let state = clamp_activity_text(
        resolve_rpc_template(state_template, instances, instance, account_type),
        state_fallback,
    );

    (details, state)
}

fn apply_assets<'a>(
    mut activity: activity::Activity<'a>,
    plugin: &'a DiscordRpcPluginSettings,
    instances: &[InstanceItem],
    instance: &InstanceItem,
    account_type: &str,
) -> activity::Activity<'a> {
    let large_image = plugin.large_image_key.trim();
    let small_image = plugin.small_image_key.trim();

    if large_image.is_empty() && small_image.is_empty() {
        return activity;
    }

    let mut assets = activity::Assets::new();

    if !large_image.is_empty() {
        let large_text = clamp_activity_text(
            resolve_rpc_template(
                &plugin.large_image_text_template,
                instances,
                instance,
                account_type,
            ),
            "ScreenLauncher",
        );
        assets = assets.large_image(large_image).large_text(large_text);
    }

    if !small_image.is_empty() {
        let small_text = clamp_activity_text(
            resolve_rpc_template(
                &plugin.small_image_text_template,
                instances,
                instance,
                account_type,
            ),
            "Minecraft",
        );
        assets = assets.small_image(small_image).small_text(small_text);
    }

    activity = activity.assets(assets);
    activity
}

fn apply_button<'a>(
    activity: activity::Activity<'a>,
    plugin: &DiscordRpcPluginSettings,
    instances: &[InstanceItem],
    instance: &InstanceItem,
    account_type: &str,
) -> activity::Activity<'a> {
    let label = clamp_button_label(resolve_rpc_template(
        &plugin.button_label,
        instances,
        instance,
        account_type,
    ));
    let url = resolve_rpc_template(&plugin.button_url, instances, instance, account_type);

    if label.is_empty() || !is_discord_url(&url) {
        return activity;
    }

    activity.buttons(vec![activity::Button::new(label, url.trim().to_string())])
}

fn launcher_placeholder_instance(instances: &[InstanceItem]) -> InstanceItem {
    instances.last().cloned().unwrap_or_else(|| InstanceItem {
        id: LAUNCHER_RPC_SESSION_ID.to_string(),
        name: "ScreenLauncher".to_string(),
        version: "Launcher".to_string(),
        loader: "Ready".to_string(),
        fabric_loader_version: None,
        status: "READY".to_string(),
        ram: 0,
        java_args: None,
        java_path: None,
        window_width: None,
        window_height: None,
        fullscreen: false,
        last_played: String::new(),
        playtime_secs: 0,
        created_at: String::new(),
        game_dir: String::new(),
    })
}

fn set_activity_session(
    state: &DiscordRpcState,
    session_id: String,
    application_id: &str,
    activity: activity::Activity<'_>,
) -> Result<(), String> {
    clear_current_session(state, None)?;

    let mut client = DiscordIpcClient::new(application_id);
    match <DiscordIpcClient as DiscordIpc>::connect(&mut client) {
        Ok(()) => {}
        Err(error) => return Err(format!("Discord RPC connect error: {error}")),
    }

    match <DiscordIpcClient as DiscordIpc>::set_activity(&mut client, activity) {
        Ok(()) => {}
        Err(error) => return Err(format!("Discord RPC activity error: {error}")),
    }

    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Discord RPC state lock poisoned".to_string())?;
    *guard = Some(DiscordRpcSession {
        instance_id: session_id,
        client,
    });

    Ok(())
}

fn build_activity<'a>(
    plugin: &'a DiscordRpcPluginSettings,
    mode: DiscordRpcDisplayMode,
    instances: &[InstanceItem],
    instance: &InstanceItem,
    account_type: &str,
) -> activity::Activity<'a> {
    let activity_name = resolve_activity_name(plugin, &mode, instances, instance, account_type);
    let (details, state_text) =
        resolve_activity_copy(plugin, &mode, instances, instance, account_type);

    let mut activity = activity::Activity::new()
        .activity_type(activity::ActivityType::Playing)
        .name(activity_name)
        .details(details)
        .state(state_text);

    if plugin.show_elapsed_time {
        activity = activity.timestamps(activity::Timestamps::new().start(now_unix_secs()));
    }

    activity = apply_assets(activity, plugin, instances, instance, account_type);
    apply_button(activity, plugin, instances, instance, account_type)
}

#[tauri::command(rename = "start_discord_rpc_for_launcher")]
pub async fn start_discord_rpc_for_launcher_command(
    state: State<'_, DiscordRpcState>,
    account_type: String,
) -> Result<(), String> {
    let settings = read_settings().await?;
    let plugin = settings.plugins.discord_rpc;
    let application_id = plugin.application_id.trim().to_string();

    if !plugin.enabled || application_id.is_empty() {
        return Ok(());
    }

    let mode = parse_display_mode(&plugin.display_mode);
    if mode == DiscordRpcDisplayMode::Minecraft {
        return Ok(());
    }

    let instances = read_instances().await?;
    let instance = launcher_placeholder_instance(&instances);
    let activity = build_activity(
        &plugin,
        DiscordRpcDisplayMode::Launcher,
        &instances,
        &instance,
        &account_type,
    );

    set_activity_session(
        &state,
        LAUNCHER_RPC_SESSION_ID.to_string(),
        &application_id,
        activity,
    )
}

#[tauri::command(rename = "start_discord_rpc_for_instance")]
pub async fn start_discord_rpc_for_instance_command(
    state: State<'_, DiscordRpcState>,
    instance_id: String,
    account_type: String,
) -> Result<(), String> {
    let settings = read_settings().await?;
    let plugin = settings.plugins.discord_rpc;
    let application_id = plugin.application_id.trim().to_string();

    if !plugin.enabled || application_id.is_empty() {
        return Ok(());
    }

    let instances = read_instances().await?;
    let instance = instances
        .iter()
        .find(|item| item.id == instance_id)
        .cloned()
        .ok_or_else(|| "Instance not found".to_string())?;

    let mode = parse_display_mode(&plugin.display_mode);
    if mode == DiscordRpcDisplayMode::Launcher {
        let activity = build_activity(
            &plugin,
            DiscordRpcDisplayMode::Launcher,
            &instances,
            &launcher_placeholder_instance(&instances),
            &account_type,
        );
        return set_activity_session(
            &state,
            LAUNCHER_RPC_SESSION_ID.to_string(),
            &application_id,
            activity,
        );
    }

    let activity = build_activity(&plugin, mode, &instances, &instance, &account_type);
    set_activity_session(&state, instance_id, &application_id, activity)?;

    Ok(())
}

#[tauri::command(rename = "stop_discord_rpc_for_instance")]
pub fn stop_discord_rpc_for_instance_command(
    state: State<'_, DiscordRpcState>,
    instance_id: Option<String>,
) -> Result<(), String> {
    clear_current_session(&state, instance_id.as_deref())
}
