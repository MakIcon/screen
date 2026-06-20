use std::{
    sync::{Arc, Condvar, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::State;

use crate::{
    models::{DiscordRpcPluginSettings, InstanceItem},
    paths::{detect_system_memory_gb, read_instances, read_settings},
};

const LAUNCHER_RPC_SESSION_ID: &str = "__launcher__";

/// Keeps diagnostic call sites type-checked without writing RPC noise to stderr.
macro_rules! rpc_log {
    ($($arg:tt)*) => {{
        let _ = format_args!($($arg)*);
    }};
}

/// How long the worker waits between connection attempts while it has a
/// presence to show but Discord is unavailable (e.g. not started yet).
const RECONNECT_INTERVAL: Duration = Duration::from_secs(5);
/// Keep-alive cadence: while connected the worker re-sends the active presence
/// on this interval, which also lets it notice a dropped pipe and reconnect.
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(30);

// ---------------------------------------------------------------------------
// Display mode
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum DiscordRpcDisplayMode {
    Launcher,
    Minecraft,
    Combined,
}

fn parse_display_mode(value: &str) -> DiscordRpcDisplayMode {
    match value.trim().to_ascii_lowercase().as_str() {
        "launcher" => DiscordRpcDisplayMode::Launcher,
        "combined" | "both" | "all" => DiscordRpcDisplayMode::Combined,
        _ => DiscordRpcDisplayMode::Minecraft,
    }
}

fn fallback_activity_name(mode: DiscordRpcDisplayMode) -> &'static str {
    match mode {
        DiscordRpcDisplayMode::Launcher => "ScreenLauncher",
        DiscordRpcDisplayMode::Minecraft | DiscordRpcDisplayMode::Combined => "Minecraft",
    }
}

// ---------------------------------------------------------------------------
// Resolved presence snapshot
//
// The Tauri commands resolve all templates (which needs async file IO) into a
// plain, owned snapshot. The background worker only ever deals with snapshots,
// so it never touches the filesystem and stays cheap and Send.
// ---------------------------------------------------------------------------

#[derive(Clone, PartialEq, Eq)]
struct PresenceSnapshot {
    /// Discord application id to connect with.
    application_id: String,
    /// Identifies the logical session (instance id or launcher). Used to keep
    /// the elapsed-time start stable across identical re-applies.
    session_id: String,
    activity_name: String,
    details: String,
    state: String,
    show_elapsed: bool,
    large_image: Option<String>,
    large_text: String,
    small_image: Option<String>,
    small_text: String,
    button: Option<(String, String)>,
}

fn build_activity<'a>(snap: &'a PresenceSnapshot, start: Option<i64>) -> activity::Activity<'a> {
    let mut act = activity::Activity::new()
        .activity_type(activity::ActivityType::Playing)
        .details(snap.details.as_str())
        .state(snap.state.as_str());

    if !snap.activity_name.is_empty() {
        act = act.name(snap.activity_name.as_str());
    }

    if let Some(start) = start {
        act = act.timestamps(activity::Timestamps::new().start(start));
    }

    if snap.large_image.is_some() || snap.small_image.is_some() {
        let mut assets = activity::Assets::new();
        if let Some(large) = &snap.large_image {
            assets = assets.large_image(large.as_str());
            if !snap.large_text.is_empty() {
                assets = assets.large_text(snap.large_text.as_str());
            }
        }
        if let Some(small) = &snap.small_image {
            assets = assets.small_image(small.as_str());
            if !snap.small_text.is_empty() {
                assets = assets.small_text(snap.small_text.as_str());
            }
        }
        act = act.assets(assets);
    }

    if let Some((label, url)) = &snap.button {
        act = act.buttons(vec![activity::Button::new(label.as_str(), url.as_str())]);
    }

    act
}

// ---------------------------------------------------------------------------
// Shared state + background worker
// ---------------------------------------------------------------------------

struct Shared {
    inner: Mutex<Inner>,
    signal: Condvar,
}

struct Inner {
    /// The presence the UI wants shown, or `None` to clear.
    desired: Option<PresenceSnapshot>,
    /// Set whenever `desired` changes so the worker re-evaluates immediately.
    dirty: bool,
    shutdown: bool,
}

pub struct DiscordRpcState {
    shared: Arc<Shared>,
}

impl Default for DiscordRpcState {
    fn default() -> Self {
        let shared = Arc::new(Shared {
            inner: Mutex::new(Inner {
                desired: None,
                dirty: false,
                shutdown: false,
            }),
            signal: Condvar::new(),
        });

        let worker_shared = Arc::clone(&shared);
        if let Err(error) = thread::Builder::new()
            .name("discord-rpc".to_string())
            .spawn(move || worker_loop(&worker_shared))
        {
            rpc_log!("failed to spawn worker thread: {error}");
        }

        Self { shared }
    }
}

impl DiscordRpcState {
    fn set_target(&self, snapshot: PresenceSnapshot) {
        let Ok(mut inner) = self.shared.inner.lock() else {
            rpc_log!("set_target: state lock poisoned");
            return;
        };
        if inner.desired.as_ref() != Some(&snapshot) {
            rpc_log!(
                "set_target: new presence session='{}' app='{}' details='{}' state='{}'",
                snapshot.session_id,
                snapshot.application_id,
                snapshot.details,
                snapshot.state
            );
            inner.desired = Some(snapshot);
            inner.dirty = true;
            self.shared.signal.notify_all();
        }
    }

    /// Clears the presence. When `session_id` is given, the presence is only
    /// cleared if it currently belongs to that session (so stopping one
    /// instance does not wipe another instance's presence).
    fn clear_target(&self, session_id: Option<&str>) {
        let Ok(mut inner) = self.shared.inner.lock() else {
            return;
        };
        let should_clear = match (&inner.desired, session_id) {
            (Some(current), Some(id)) => current.session_id == id,
            (Some(_), None) => true,
            (None, _) => false,
        };
        if should_clear {
            rpc_log!("clear_target: clearing presence (session={session_id:?})");
            inner.desired = None;
            inner.dirty = true;
            self.shared.signal.notify_all();
        } else {
            rpc_log!("clear_target: nothing to clear (session={session_id:?})");
        }
    }
}

impl Drop for DiscordRpcState {
    fn drop(&mut self) {
        if let Ok(mut inner) = self.shared.inner.lock() {
            inner.shutdown = true;
            self.shared.signal.notify_all();
        }
    }
}

enum Outcome {
    /// Nothing to show; worker is idle and disconnected.
    Idle,
    /// Presence applied successfully.
    Applied,
    /// Something failed (connect/send); retry after a short delay.
    Retry,
}

/// Owns the live IPC connection and the timing state for the elapsed timer.
struct Worker {
    client: Option<DiscordIpcClient>,
    connected_app: Option<String>,
    /// Snapshot most recently pushed to Discord (used only for bookkeeping).
    applied: Option<PresenceSnapshot>,
    /// Start timestamp (unix seconds) of the current elapsed timer.
    start_ts: Option<i64>,
    /// Session the current `start_ts` belongs to.
    start_session: Option<String>,
}

impl Worker {
    fn new() -> Self {
        Self {
            client: None,
            connected_app: None,
            applied: None,
            start_ts: None,
            start_session: None,
        }
    }

    fn disconnect(&mut self) {
        if let Some(mut client) = self.client.take() {
            let _ = client.clear_activity();
            let _ = client.close();
        }
        self.connected_app = None;
        self.applied = None;
        self.start_ts = None;
        self.start_session = None;
    }

    fn ensure_connected(&mut self, application_id: &str) -> Result<(), ()> {
        let already = self.client.is_some()
            && self.connected_app.as_deref() == Some(application_id);
        if already {
            return Ok(());
        }

        // App id changed or we are not connected: drop any stale client first.
        if let Some(mut old) = self.client.take() {
            let _ = old.close();
        }
        self.connected_app = None;
        self.applied = None;

        rpc_log!("connecting to Discord (app '{application_id}')...");
        let mut client = DiscordIpcClient::new(application_id);
        match client.connect() {
            Ok(()) => {
                rpc_log!("connected to Discord (app '{application_id}')");
                self.client = Some(client);
                self.connected_app = Some(application_id.to_string());
                Ok(())
            }
            Err(error) => {
                rpc_log!("connect failed (will retry): {error}");
                Err(())
            }
        }
    }

    /// Resolve the elapsed-time start for the snapshot, keeping it stable while
    /// the session is unchanged so re-applies don't reset the timer.
    fn timer_start(&mut self, snap: &PresenceSnapshot) -> Option<i64> {
        if !snap.show_elapsed {
            self.start_ts = None;
            self.start_session = None;
            return None;
        }
        if self.start_session.as_deref() != Some(snap.session_id.as_str()) {
            self.start_ts = Some(now_unix_secs());
            self.start_session = Some(snap.session_id.clone());
        }
        self.start_ts
    }

    fn apply(&mut self, snap: &PresenceSnapshot) -> Outcome {
        if self.ensure_connected(&snap.application_id).is_err() {
            return Outcome::Retry;
        }

        let start = self.timer_start(snap);
        let activity = build_activity(snap, start);

        let Some(client) = self.client.as_mut() else {
            return Outcome::Retry;
        };

        match client.set_activity(activity) {
            Ok(()) => {
                // Log only when the presence actually changed, so the periodic
                // keep-alive re-sends don't spam the console.
                if self.applied.as_ref() != Some(snap) {
                    rpc_log!(
                        "presence applied: details='{}' state='{}'",
                        snap.details,
                        snap.state
                    );
                }
                self.applied = Some(snap.clone());
                Outcome::Applied
            }
            Err(error) => {
                rpc_log!("set_activity failed (will reconnect): {error}");
                // The pipe is most likely dead; reset so the next pass reconnects.
                if let Some(mut client) = self.client.take() {
                    let _ = client.close();
                }
                self.connected_app = None;
                self.applied = None;
                Outcome::Retry
            }
        }
    }
}

fn worker_loop(shared: &Arc<Shared>) {
    let mut worker = Worker::new();

    loop {
        // Snapshot the desired state and consume the dirty flag.
        let (desired, shutdown) = {
            let Ok(mut inner) = shared.inner.lock() else {
                return;
            };
            inner.dirty = false;
            (inner.desired.clone(), inner.shutdown)
        };

        if shutdown {
            worker.disconnect();
            return;
        }

        let outcome = match desired {
            None => {
                worker.disconnect();
                Outcome::Idle
            }
            Some(snap) => worker.apply(&snap),
        };

        // Decide how long to sleep before the next pass.
        let wait = match outcome {
            Outcome::Idle => None,
            Outcome::Applied => Some(KEEPALIVE_INTERVAL),
            Outcome::Retry => Some(RECONNECT_INTERVAL),
        };

        let Ok(inner) = shared.inner.lock() else {
            return;
        };
        if inner.dirty || inner.shutdown {
            continue;
        }
        match wait {
            None => {
                let guard = shared.signal.wait(inner);
                drop(guard);
            }
            Some(duration) => {
                let guard = shared.signal.wait_timeout(inner, duration);
                drop(guard);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Template resolution helpers
// ---------------------------------------------------------------------------

fn now_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
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
        ("system_ram_max", format!("{} GB", detect_system_memory_gb())),
        ("build_name", instance.name.clone()),
        ("build_version", instance.version.clone()),
        ("build_loader", to_friendly_value(&instance.loader)),
        ("build_ram", format!("{}GB", instance.ram)),
        ("build_playtime", format_playtime(instance.playtime_secs)),
        ("build_last_played", to_friendly_value(&instance.last_played)),
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
    let text = if trimmed.is_empty() { fallback } else { trimmed };
    text.chars().take(128).collect()
}

fn clamp_button_label(value: String) -> String {
    value.trim().chars().take(32).collect()
}

fn is_discord_url(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

fn launcher_placeholder_instance(instances: &[InstanceItem]) -> InstanceItem {
    instances.last().cloned().unwrap_or_else(|| InstanceItem {
        id: LAUNCHER_RPC_SESSION_ID.to_string(),
        name: "ScreenLauncher".to_string(),
        version: "Launcher".to_string(),
        loader: "Ready".to_string(),
        loader_version: None,
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

/// Resolve every template into the final, owned `PresenceSnapshot`.
fn build_snapshot(
    plugin: &DiscordRpcPluginSettings,
    mode: DiscordRpcDisplayMode,
    instances: &[InstanceItem],
    instance: &InstanceItem,
    account_type: &str,
    application_id: String,
    session_id: String,
) -> PresenceSnapshot {
    let activity_name = clamp_activity_text(
        resolve_rpc_template(&plugin.activity_name_template, instances, instance, account_type),
        fallback_activity_name(mode),
    );

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

    let large_key = plugin.large_image_key.trim();
    let large_image = (!large_key.is_empty()).then(|| large_key.to_string());
    let large_text = if large_image.is_some() {
        clamp_activity_text(
            resolve_rpc_template(
                &plugin.large_image_text_template,
                instances,
                instance,
                account_type,
            ),
            "ScreenLauncher",
        )
    } else {
        String::new()
    };

    let small_key = plugin.small_image_key.trim();
    let small_image = (!small_key.is_empty()).then(|| small_key.to_string());
    let small_text = if small_image.is_some() {
        clamp_activity_text(
            resolve_rpc_template(
                &plugin.small_image_text_template,
                instances,
                instance,
                account_type,
            ),
            "Minecraft",
        )
    } else {
        String::new()
    };

    let button = {
        let label = clamp_button_label(resolve_rpc_template(
            &plugin.button_label,
            instances,
            instance,
            account_type,
        ));
        let url = resolve_rpc_template(&plugin.button_url, instances, instance, account_type);
        if label.is_empty() || !is_discord_url(&url) {
            None
        } else {
            Some((label, url.trim().to_string()))
        }
    };

    PresenceSnapshot {
        application_id,
        session_id,
        activity_name,
        details,
        state,
        show_elapsed: plugin.show_elapsed_time,
        large_image,
        large_text,
        small_image,
        small_text,
        button,
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn start_discord_rpc_for_launcher(
    state: State<'_, DiscordRpcState>,
    account_type: String,
) -> Result<(), String> {
    let settings = read_settings().await?;
    let plugin = settings.plugins.discord_rpc;
    let application_id = plugin.application_id.trim().to_string();

    rpc_log!(
        "cmd start_for_launcher: enabled={} app_id_len={} mode='{}'",
        plugin.enabled,
        application_id.len(),
        plugin.display_mode
    );

    if !plugin.enabled || application_id.is_empty() {
        rpc_log!("cmd start_for_launcher: disabled or empty app id -> clearing");
        state.clear_target(None);
        return Ok(());
    }

    let mode = parse_display_mode(&plugin.display_mode);
    // In Minecraft-only mode there is no launcher presence; it appears once an
    // instance is running.
    if mode == DiscordRpcDisplayMode::Minecraft {
        rpc_log!("cmd start_for_launcher: minecraft-only mode, nothing to show idle");
        return Ok(());
    }

    let instances = read_instances().await?;
    let instance = launcher_placeholder_instance(&instances);
    let snapshot = build_snapshot(
        &plugin,
        DiscordRpcDisplayMode::Launcher,
        &instances,
        &instance,
        &account_type,
        application_id,
        LAUNCHER_RPC_SESSION_ID.to_string(),
    );

    state.set_target(snapshot);
    Ok(())
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

    rpc_log!(
        "cmd start_for_instance '{instance_id}': enabled={} app_id_len={} mode='{}'",
        plugin.enabled,
        application_id.len(),
        plugin.display_mode
    );

    if !plugin.enabled || application_id.is_empty() {
        rpc_log!("cmd start_for_instance: disabled or empty app id -> clearing");
        state.clear_target(None);
        return Ok(());
    }

    let instances = read_instances().await?;
    let instance = instances
        .iter()
        .find(|item| item.id == instance_id)
        .cloned()
        .ok_or_else(|| "Instance not found".to_string())?;

    let mode = parse_display_mode(&plugin.display_mode);

    // Launcher mode keeps showing the launcher presence even while playing.
    if mode == DiscordRpcDisplayMode::Launcher {
        let snapshot = build_snapshot(
            &plugin,
            DiscordRpcDisplayMode::Launcher,
            &instances,
            &launcher_placeholder_instance(&instances),
            &account_type,
            application_id,
            LAUNCHER_RPC_SESSION_ID.to_string(),
        );
        state.set_target(snapshot);
        return Ok(());
    }

    let snapshot = build_snapshot(
        &plugin,
        mode,
        &instances,
        &instance,
        &account_type,
        application_id,
        instance_id,
    );
    state.set_target(snapshot);
    Ok(())
}

#[tauri::command]
pub fn stop_discord_rpc_for_instance(
    state: State<'_, DiscordRpcState>,
    instance_id: Option<String>,
) -> Result<(), String> {
    state.clear_target(instance_id.as_deref());
    Ok(())
}
