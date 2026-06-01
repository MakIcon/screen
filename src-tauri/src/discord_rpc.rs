use std::{
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::State;

use crate::{
    models::InstanceItem,
    paths::{detect_system_memory_gb, read_instances, read_settings},
};

#[derive(Default)]
pub struct DiscordRpcState {
    current: Mutex<Option<DiscordRpcSession>>,
}

struct DiscordRpcSession {
    instance_id: String,
    client: DiscordIpcClient,
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

#[tauri::command]
pub async fn start_discord_rpc_for_instance(
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

    let details = clamp_activity_text(
        resolve_rpc_template(
            &plugin.details_template,
            &instances,
            &instance,
            &account_type,
        ),
        "Playing Minecraft",
    );
    let state_text = clamp_activity_text(
        resolve_rpc_template(&plugin.state_template, &instances, &instance, &account_type),
        "ScreenLauncher",
    );

    clear_current_session(&state, None)?;

    let mut activity = activity::Activity::new()
        .details(&details)
        .state(&state_text);

    if plugin.show_elapsed_time {
        activity = activity.timestamps(activity::Timestamps::new().start(now_unix_secs()));
    }

    let mut client = DiscordIpcClient::new(&application_id);
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
        instance_id,
        client,
    });

    Ok(())
}

#[tauri::command]
pub fn stop_discord_rpc_for_instance(
    state: State<'_, DiscordRpcState>,
    instance_id: Option<String>,
) -> Result<(), String> {
    clear_current_session(&state, instance_id.as_deref())
}
