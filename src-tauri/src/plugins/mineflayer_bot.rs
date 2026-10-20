use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

use crate::{
    commands::auth::{read_accounts, refresh_account_if_expired},
    models::{
        MicrosoftAccount, MineflayerBotPluginSettings, MineflayerBotStatus,
        MineflayerCombatSettings,
    },
    paths::read_settings,
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const MAX_LOG_LINES: usize = 80;
const STATUS_EVENT: &str = "mineflayer-bot-status";
const WORKFLOW_STEP_LIMIT: usize = 100;

#[derive(Clone, Default)]
pub struct MineflayerBotState {
    inner: Arc<Mutex<MineflayerBotRuntime>>,
}

struct MineflayerBotRuntime {
    app: Option<AppHandle>,
    revision: u64,
    generation: u64,
    child: Option<Child>,
    state: String,
    pid: Option<u32>,
    owner_name: Option<String>,
    bot_username: Option<String>,
    server: Option<String>,
    last_error: Option<String>,
    logs: Vec<String>,
    pending_chat: HashMap<String, oneshot::Sender<Result<(), String>>>,
    inventory_url: Option<String>,
    inventory: Option<serde_json::Value>,
    gathering: Option<serde_json::Value>,
    catalog: Option<serde_json::Value>,
}

impl Default for MineflayerBotRuntime {
    fn default() -> Self {
        Self {
            app: None,
            revision: 0,
            generation: 0,
            child: None,
            state: "idle".to_string(),
            pid: None,
            owner_name: None,
            bot_username: None,
            server: None,
            last_error: None,
            logs: Vec::new(),
            pending_chat: HashMap::new(),
            inventory_url: None,
            inventory: None,
            gathering: None,
            catalog: None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerConfig {
    server: WorkerServerConfig,
    owner_name: String,
    account: WorkerAccountConfig,
    commands: WorkerCommandConfig,
    movement: WorkerMovementConfig,
    connection: WorkerConnectionConfig,
    behavior: WorkerBehaviorConfig,
    combat: MineflayerCombatSettings,
    survival: crate::models::MineflayerSurvivalSettings,
    gathering: crate::models::MineflayerGatheringSettings,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerServerConfig {
    host: String,
    port: u16,
    version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerAccountConfig {
    mode: String,
    username: String,
    uuid: Option<String>,
    access_token: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerCommandConfig {
    prefix: String,
    source: String,
    extra_owners: Vec<String>,
    cooldown_ms: u32,
    send_feedback: bool,
    allow_say: bool,
    allow_quit: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerMovementConfig {
    follow_distance: u32,
    goto_radius: u32,
    allow_sprinting: bool,
    allow_low_ceiling_jumps: bool,
    allow_parkour: bool,
    allow_air_strafe: bool,
    can_dig: bool,
    max_drop_down: u32,
    allow_water_drop: bool,
    allow_bucket_water_drop: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerConnectionConfig {
    auto_reconnect: bool,
    reconnect_delay_ms: u64,
    max_reconnect_attempts: u32,
    check_timeout_interval_ms: u64,
    auto_respawn: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerBehaviorConfig {
    stay_on_water: bool,
    anti_knockback: bool,
    auto_follow_on_spawn: bool,
    announce_on_spawn: bool,
    spawn_message: String,
    log_path_updates: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerEvent {
    #[serde(rename = "type")]
    event_type: String,
    message: Option<String>,
    state: Option<String>,
    bot_username: Option<String>,
    error: Option<String>,
    request_id: Option<String>,
    inventory_url: Option<String>,
    inventory: Option<serde_json::Value>,
    gathering: Option<serde_json::Value>,
    catalog: Option<serde_json::Value>,
}

fn write_worker_message(writer: &mut impl Write, payload: &impl Serialize) -> Result<(), String> {
    let mut line = serde_json::to_vec(payload)
        .map_err(|error| format!("serialize bot message error: {error}"))?;
    line.push(b'\n');
    writer
        .write_all(&line)
        .and_then(|_| writer.flush())
        .map_err(|error| format!("write bot message error: {error}"))
}

fn validate_chat_message(message: &str) -> Result<&str, String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("Введите сообщение".to_string());
    }
    if message.encode_utf16().count() > 240 {
        return Err("Сообщение должно быть не длиннее 240 символов".to_string());
    }
    if message
        .chars()
        .any(|character| character.is_control() || character == '§')
    {
        return Err("Сообщение содержит недопустимые символы".to_string());
    }
    Ok(message)
}

fn fail_pending_chat(runtime: &mut MineflayerBotRuntime) {
    for (_, reply) in runtime.pending_chat.drain() {
        let _ = reply.send(Err("Бот отключился до подтверждения отправки".to_string()));
    }
}

fn push_log(runtime: &mut MineflayerBotRuntime, line: impl Into<String>) {
    super::push_log_line(&mut runtime.logs, MAX_LOG_LINES, line);
}

fn snapshot_status(runtime: &MineflayerBotRuntime) -> MineflayerBotStatus {
    MineflayerBotStatus {
        revision: runtime.revision,
        running: runtime.child.is_some(),
        state: runtime.state.clone(),
        pid: runtime.pid,
        owner_name: runtime.owner_name.clone(),
        bot_username: runtime.bot_username.clone(),
        server: runtime.server.clone(),
        last_error: runtime.last_error.clone(),
        logs: runtime.logs.clone(),
        inventory_url: runtime.inventory_url.clone(),
        inventory: runtime.inventory.clone(),
        gathering: runtime.gathering.clone(),
    }
}

fn publish_status(runtime: &mut MineflayerBotRuntime) {
    runtime.revision += 1;
    if let Some(app) = &runtime.app {
        // Emit under the state lock so stdout, stderr and lifecycle changes stay ordered.
        // A failed delivery is repaired by the UI's occasional full snapshot.
        let _ = app.emit_to("main", STATUS_EVENT, snapshot_status(runtime));
    }
}

pub(crate) fn current_status(state: &MineflayerBotState) -> Result<MineflayerBotStatus, String> {
    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "Mineflayer bot state lock poisoned".to_string())?;
    refresh_child_state(&mut runtime);
    Ok(snapshot_status(&runtime))
}

fn refresh_child_state(runtime: &mut MineflayerBotRuntime) {
    let exit_status = match runtime.child.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(Some(status)) => Some(format!("{status}")),
            Ok(None) => None,
            Err(error) => Some(format!("status check failed: {error}")),
        },
        None => None,
    };

    if let Some(status) = exit_status {
        runtime.generation += 1;
        fail_pending_chat(runtime);
        runtime.child.take();
        runtime.pid = None;
        runtime.state = "stopped".to_string();
        runtime.inventory_url = None;
        runtime.inventory = None;
        runtime.gathering = None;
        runtime.catalog = None;
        push_log(runtime, format!("process stopped: {status}"));
        publish_status(runtime);
    }
}

fn update_from_worker_event(runtime: &mut MineflayerBotRuntime, event: WorkerEvent) {
    let status_changed = event.event_type != "minecraft_catalog";
    match event.event_type.as_str() {
        "inventory" => runtime.inventory_url = event.inventory_url,
        "gathering" => runtime.gathering = event.gathering,
        "bot_inventory" => runtime.inventory = event.inventory,
        "minecraft_catalog" => runtime.catalog = event.catalog,
        "chat_result" => {
            if let Some(request_id) = event.request_id {
                if let Some(reply) = runtime.pending_chat.remove(&request_id) {
                    let result = event.error.map_or(Ok(()), Err);
                    let _ = reply.send(result);
                }
            }
            if let Some(message) = event.message {
                push_log(runtime, message);
            }
        }
        "ready" => {
            runtime.state = "connected".to_string();
            runtime.bot_username = event.bot_username;
            runtime.last_error = None;
            if let Some(message) = event.message {
                push_log(runtime, message);
            }
        }
        "status" => {
            if let Some(state) = event.state {
                runtime.state = state;
            }
            if let Some(message) = event.message {
                push_log(runtime, message);
            }
        }
        "production_started" => {
            if runtime
                .last_error
                .as_deref()
                .is_some_and(|message| message.starts_with("production:"))
            {
                runtime.last_error = None;
            }
        }
        "error" => {
            let message = event
                .error
                .or(event.message)
                .unwrap_or_else(|| "unknown worker error".to_string());
            runtime.last_error = Some(message.clone());
            if runtime.state != "connected" {
                runtime.state = "error".to_string();
            }
            push_log(runtime, format!("error: {message}"));
        }
        "end" => {
            runtime.inventory_url = None;
            runtime.inventory = None;
            runtime.gathering = None;
            runtime.catalog = None;
            fail_pending_chat(runtime);
            runtime.state = "stopped".to_string();
            if let Some(message) = event.message {
                push_log(runtime, message);
            }
        }
        _ => {
            if let Some(message) = event.message {
                push_log(runtime, message);
            }
        }
    }
    if status_changed {
        publish_status(runtime);
    }
}

fn apply_worker_line(runtime: &mut MineflayerBotRuntime, line: &str, label: &str, generation: u64) {
    // Output from a stopped worker must not overwrite a newer connection.
    if runtime.generation != generation {
        return;
    }
    if let Ok(event) = serde_json::from_str::<WorkerEvent>(line) {
        update_from_worker_event(runtime, event);
    } else {
        push_log(runtime, format!("{label}: {line}"));
        if label == "stderr" {
            runtime.last_error = Some(line.to_string());
        }
        publish_status(runtime);
    }
}

fn spawn_log_reader<R>(
    reader: R,
    state: Arc<Mutex<MineflayerBotRuntime>>,
    label: &'static str,
    generation: u64,
) where
    R: std::io::Read + Send + 'static,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines() {
            let Ok(line) = line else {
                continue;
            };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(mut runtime) = state.lock() {
                apply_worker_line(&mut runtime, trimmed, label, generation);
            }
        }
    });
}

fn spawn_exit_watcher(state: Arc<Mutex<MineflayerBotRuntime>>, generation: u64) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(250));
        let Ok(mut runtime) = state.lock() else {
            return;
        };
        if runtime.generation != generation || runtime.child.is_none() {
            return;
        }
        // Also publish crashes that produce no worker "end" event.
        refresh_child_state(&mut runtime);
        if runtime.child.is_none() {
            return;
        }
    });
}

fn clean_player_name(name: &str, fallback: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn parse_extra_owners(raw: &str) -> Vec<String> {
    let mut owners = Vec::new();
    for candidate in raw.split([',', ';', '\n', '\r']) {
        let candidate = candidate.trim();
        if candidate.is_empty()
            || owners
                .iter()
                .any(|owner: &String| owner.eq_ignore_ascii_case(candidate))
        {
            continue;
        }
        owners.push(candidate.to_string());
    }
    owners
}

async fn microsoft_account_by_id(id: &str) -> Result<MicrosoftAccount, String> {
    let accounts = read_accounts().await?;
    let account = accounts
        .into_iter()
        .find(|account| account.id == id)
        .ok_or_else(|| "Microsoft account not found".to_string())?;

    refresh_account_if_expired(&account).await
}

async fn resolve_owner_name(
    launcher_nickname: &str,
    launcher_account_type: &str,
    launcher_ms_account_id: Option<&str>,
) -> Result<String, String> {
    if launcher_account_type.eq_ignore_ascii_case("MICROSOFT") {
        let account_id = launcher_ms_account_id
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| "Select a Microsoft account for the launcher owner first".to_string())?;
        let account = microsoft_account_by_id(account_id).await?;
        return Ok(account.username);
    }

    Ok(clean_player_name(launcher_nickname, "PLAYER"))
}

async fn resolve_bot_account(
    plugin: &MineflayerBotPluginSettings,
    launcher_account_type: &str,
    launcher_ms_account_id: Option<&str>,
) -> Result<WorkerAccountConfig, String> {
    if plugin
        .bot_account_mode
        .trim()
        .eq_ignore_ascii_case("microsoft")
    {
        let bot_account_id = plugin
            .bot_microsoft_account_id
            .as_deref()
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| "Select a Microsoft account for the bot".to_string())?;

        if launcher_account_type.eq_ignore_ascii_case("MICROSOFT")
            && launcher_ms_account_id
                .map(|id| id == bot_account_id)
                .unwrap_or(false)
        {
            return Err(
                "Bot account must be different from the active player Microsoft account"
                    .to_string(),
            );
        }

        let account = microsoft_account_by_id(bot_account_id).await?;
        return Ok(WorkerAccountConfig {
            mode: "microsoft".to_string(),
            username: account.username,
            uuid: Some(account.uuid),
            access_token: Some(account.access_token),
        });
    }

    Ok(WorkerAccountConfig {
        mode: "offline".to_string(),
        username: clean_player_name(&plugin.bot_nickname, "SCREEN_BOT"),
        uuid: None,
        access_token: None,
    })
}

fn worker_path() -> Result<(PathBuf, PathBuf), String> {
    let runtime_dir = super::optional_extensions::mineflayer_runtime_dir()?;
    Ok((runtime_dir.join("worker.cjs"), runtime_dir))
}

fn node_executable() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}

#[tauri::command]
pub async fn get_mineflayer_bot_status(
    state: State<'_, MineflayerBotState>,
) -> Result<MineflayerBotStatus, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async { current_status(&state) }.await;
    result.map_err(crate::commands::errors::CommandError::from)
}

// Keep the full registry/textures out of the frequently polled status snapshot.
#[tauri::command]
pub async fn get_minecraft_catalog(
    state: State<'_, MineflayerBotState>,
) -> Result<Option<serde_json::Value>, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let runtime = state
            .inner
            .lock()
            .map_err(|_| "Mineflayer bot state lock poisoned".to_string())?;
        Ok(runtime.catalog.clone())
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn send_mineflayer_bot_chat(
    state: State<'_, MineflayerBotState>,
    message: String,
    command: Option<bool>,
) -> Result<(), crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let message = validate_chat_message(&message)?;
        send_worker_request(state, serde_json::json!({ "type": if command.unwrap_or(false) { "command" } else { "chat" }, "message": message })).await
    }.await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn control_mineflayer_bot_workflow(
    state: State<'_, MineflayerBotState>,
    action: String,
    steps: Option<serde_json::Value>,
    name: Option<String>,
) -> Result<(), crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        validate_workflow_request(&action, steps.as_ref())?;
        send_worker_request(state, serde_json::json!({ "type": "workflow", "action": action, "steps": steps, "name": name })).await
    }.await;
    result.map_err(crate::commands::errors::CommandError::from)
}

fn validate_workflow_request(
    action: &str,
    steps: Option<&serde_json::Value>,
) -> Result<(), String> {
    if !["start", "pause", "resume", "stop"].contains(&action) {
        return Err("Неизвестное действие сценария".to_string());
    }
    if action == "start"
        && !steps
            .and_then(|value| value.as_array())
            .map(|items| !items.is_empty() && items.len() <= WORKFLOW_STEP_LIMIT)
            .unwrap_or(false)
    {
        return Err("Добавьте от 1 до 100 шагов".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn configure_mineflayer_bot_storage(
    state: State<'_, MineflayerBotState>,
    groups: Vec<crate::models::MineflayerStorageGroup>,
) -> Result<(), crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        if groups.len() > 32
            || groups.iter().any(|group| {
                group.chests.len() > 32
                    || group.filters.len() > 64
                    || group.name.chars().count() > 64
            })
        {
            return Err(
                "Можно задать до 32 групп, по 32 сундука и 64 ресурса в каждой".to_string(),
            );
        }
        send_worker_request(
            state,
            serde_json::json!({ "type": "storage_config", "groups": groups }),
        )
        .await
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

async fn send_worker_request(
    state: State<'_, MineflayerBotState>,
    mut payload: serde_json::Value,
) -> Result<(), String> {
    let request_id = uuid::Uuid::new_v4().to_string();
    payload["requestId"] = serde_json::json!(request_id);
    let (reply, response) = oneshot::channel();
    {
        let mut runtime = state
            .inner
            .lock()
            .map_err(|_| "Mineflayer bot state lock poisoned".to_string())?;
        refresh_child_state(&mut runtime);
        if runtime.state != "connected" || runtime.child.is_none() {
            return Err("Бот не подключён к серверу".to_string());
        }
        let stdin = runtime
            .child
            .as_mut()
            .and_then(|child| child.stdin.as_mut())
            .ok_or_else(|| "Канал отправки сообщений боту недоступен".to_string())?;
        write_worker_message(stdin, &payload)?;
        runtime.pending_chat.insert(request_id.clone(), reply);
    }

    match tokio::time::timeout(Duration::from_secs(5), response).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("Бот отключился до подтверждения отправки".to_string()),
        Err(_) => {
            if let Ok(mut runtime) = state.inner.lock() {
                runtime.pending_chat.remove(&request_id);
            }
            Err("Бот не подтвердил отправку сообщения. Проверьте журнал событий".to_string())
        }
    }
}

#[tauri::command]
pub async fn stop_mineflayer_bot(
    state: State<'_, MineflayerBotState>,
) -> Result<MineflayerBotStatus, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let mut runtime = state
            .inner
            .lock()
            .map_err(|_| "Mineflayer bot state lock poisoned".to_string())?;

        runtime.generation += 1;
        if let Some(mut child) = runtime.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        fail_pending_chat(&mut runtime);

        runtime.pid = None;
        runtime.state = "stopped".to_string();
        runtime.inventory_url = None;
        runtime.inventory = None;
        runtime.gathering = None;
        runtime.catalog = None;
        push_log(&mut runtime, "stop requested from launcher");
        publish_status(&mut runtime);
        Ok(snapshot_status(&runtime))
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn start_mineflayer_bot(
    app: AppHandle,
    state: State<'_, MineflayerBotState>,
    launcher_nickname: String,
    launcher_account_type: String,
    launcher_ms_account_id: Option<String>,
) -> Result<MineflayerBotStatus, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let settings = read_settings().await?;
        let plugin = settings.plugins.mineflayer_bot;

        if !plugin.enabled {
            return Err("Mineflayer Bot extension is disabled".to_string());
        }

        let host = plugin.host.trim().to_string();
        if host.is_empty() {
            return Err("Set a server host for the bot".to_string());
        }

        if plugin.port == 0 {
            return Err("Server port must be between 1 and 65535".to_string());
        }

        let command_prefix = clean_player_name(&plugin.command_prefix, "!");
        let command_source = match plugin.command_source.trim().to_ascii_lowercase().as_str() {
            "chat" => "chat",
            "whisper" => "whisper",
            _ => "both",
        }
        .to_string();
        let owner_name = resolve_owner_name(
            &launcher_nickname,
            &launcher_account_type,
            launcher_ms_account_id.as_deref(),
        )
        .await?;
        let account = resolve_bot_account(
            &plugin,
            &launcher_account_type,
            launcher_ms_account_id.as_deref(),
        )
        .await?;
        let bot_username = account.username.clone();
        let server_label = format!("{}:{}", host, plugin.port);
        let version = clean_player_name(&plugin.version, "");
        let config = WorkerConfig {
            combat: plugin.combat.clone(),
            server: WorkerServerConfig {
                host,
                port: plugin.port,
                version: if version.is_empty() {
                    None
                } else {
                    Some(version)
                },
            },
            owner_name: owner_name.clone(),
            account,
            commands: WorkerCommandConfig {
                prefix: command_prefix,
                source: command_source,
                extra_owners: parse_extra_owners(&plugin.extra_owners),
                cooldown_ms: plugin.command_cooldown_ms.min(10_000),
                send_feedback: plugin.send_chat_feedback,
                allow_say: plugin.allow_say_command,
                allow_quit: plugin.allow_quit_command,
            },
            movement: WorkerMovementConfig {
                follow_distance: plugin.follow_distance.clamp(1, 16),
                goto_radius: plugin.goto_radius.clamp(1, 16),
                allow_sprinting: plugin.allow_sprinting,
                allow_low_ceiling_jumps: plugin.allow_low_ceiling_jumps,
                allow_parkour: plugin.allow_parkour,
                allow_air_strafe: plugin.allow_air_strafe,
                can_dig: plugin.can_dig,
                max_drop_down: plugin.max_drop_down.clamp(1, 16),
                allow_water_drop: plugin.allow_water_drop,
                allow_bucket_water_drop: plugin.allow_bucket_water_drop,
            },
            connection: WorkerConnectionConfig {
                auto_reconnect: plugin.auto_reconnect,
                reconnect_delay_ms: u64::from(plugin.reconnect_delay_seconds.clamp(1, 300)) * 1_000,
                max_reconnect_attempts: plugin.max_reconnect_attempts.min(100),
                check_timeout_interval_ms: u64::from(plugin.connect_timeout_seconds.clamp(5, 300))
                    * 1_000,
                auto_respawn: plugin.auto_respawn,
            },
            behavior: WorkerBehaviorConfig {
                stay_on_water: plugin.stay_on_water,
                anti_knockback: plugin.anti_knockback,
                auto_follow_on_spawn: plugin.auto_follow_on_spawn,
                announce_on_spawn: plugin.announce_on_spawn,
                spawn_message: plugin.spawn_message.trim().chars().take(200).collect(),
                log_path_updates: plugin.log_path_updates,
            },
            survival: plugin.survival.clone(),
            gathering: crate::models::MineflayerGatheringSettings {
                tunnel_width: plugin.gathering.tunnel_width.clamp(1, 3),
                tunnel_height: plugin.gathering.tunnel_height.clamp(2, 4),
                stair_width: plugin.gathering.stair_width.clamp(1, 3),
                stair_height: plugin.gathering.stair_height.clamp(3, 4),
                place_torches: plugin.gathering.place_torches,
                torch_interval: plugin.gathering.torch_interval.clamp(4, 16),
                defend_mobs: plugin.gathering.defend_mobs,
                defend_players: plugin.gathering.defend_players,
                defend_arrows: plugin.gathering.defend_arrows,
                storage_groups: plugin.gathering.storage_groups.clone(),
            },
        };

        let (worker, runtime_dir) = worker_path()?;
        if !worker.exists() {
            return Err(format!("Mineflayer worker not found: {}", worker.display()));
        }

        {
            let mut runtime = state
                .inner
                .lock()
                .map_err(|_| "Mineflayer bot state lock poisoned".to_string())?;
            refresh_child_state(&mut runtime);
            if runtime.child.is_some() {
                return Err("Mineflayer bot is already running".to_string());
            }
        }
        super::optional_extensions::sync_mineflayer_worker(&runtime_dir)?;
        super::optional_extensions::ensure_mineflayer_dependencies(&runtime_dir).await?;

        let mut runtime = state
            .inner
            .lock()
            .map_err(|_| "Mineflayer bot state lock poisoned".to_string())?;
        refresh_child_state(&mut runtime);
        if runtime.child.is_some() {
            return Err("Mineflayer bot is already running".to_string());
        }

        let mut command = Command::new(node_executable());
        command
            .arg("--no-deprecation")
            .arg(&worker)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        command.current_dir(&runtime_dir);
        command.env("NODE_PATH", runtime_dir.join("node_modules"));

        #[cfg(windows)]
        command.creation_flags(CREATE_NO_WINDOW);

        let mut child = command.spawn().map_err(|error| {
            format!("start node worker error: {error}. Install Node.js 22+ and retry.")
        })?;

        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "failed to open bot worker stdin".to_string())?;
        if let Err(error) = write_worker_message(stdin, &config) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("write bot config error: {error}"));
        }

        runtime.app = Some(app);
        runtime.generation += 1;
        let generation = runtime.generation;
        if let Some(stdout) = child.stdout.take() {
            spawn_log_reader(stdout, state.inner.clone(), "stdout", generation);
        }
        if let Some(stderr) = child.stderr.take() {
            spawn_log_reader(stderr, state.inner.clone(), "stderr", generation);
        }

        runtime.child = Some(child);
        runtime.pid = runtime.child.as_ref().map(|child| child.id());
        runtime.state = "starting".to_string();
        runtime.owner_name = Some(owner_name);
        runtime.bot_username = Some(bot_username);
        runtime.server = Some(server_label);
        runtime.last_error = None;
        runtime.logs.clear();
        runtime.inventory_url = None;
        runtime.inventory = None;
        runtime.gathering = None;
        runtime.catalog = None;
        push_log(&mut runtime, "start requested from launcher");
        publish_status(&mut runtime);
        spawn_exit_watcher(state.inner.clone(), generation);

        Ok(snapshot_status(&runtime))
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[cfg(test)]
mod tests {
    use super::{
        fail_pending_chat, parse_extra_owners, update_from_worker_event, validate_chat_message,
        write_worker_message, MineflayerBotRuntime, WorkerBehaviorConfig, WorkerEvent,
        WorkerMovementConfig,
    };
    use tokio::sync::oneshot;

    #[test]
    fn ignores_late_output_from_a_previous_worker_and_versions_updates() {
        let mut runtime = MineflayerBotRuntime {
            generation: 2,
            state: "connected".to_string(),
            ..Default::default()
        };
        super::apply_worker_line(&mut runtime, "old worker error", "stderr", 1);
        assert!(runtime.logs.is_empty());
        assert!(runtime.last_error.is_none());
        assert_eq!(runtime.revision, 0);

        super::apply_worker_line(
            &mut runtime,
            r#"{"type":"bot_inventory","inventory":{"health":18}}"#,
            "stdout",
            2,
        );
        assert_eq!(runtime.revision, 1);
        assert_eq!(super::snapshot_status(&runtime).revision, 1);
        assert_eq!(runtime.inventory.as_ref().unwrap()["health"], 18);

        super::apply_worker_line(&mut runtime, "current worker error", "stderr", 2);
        assert_eq!(runtime.revision, 2);
        assert_eq!(runtime.last_error.as_deref(), Some("current worker error"));
        super::apply_worker_line(&mut runtime, r#"{"type":"end"}"#, "stdout", 2);
        assert_eq!(runtime.revision, 3);
        assert!(runtime.inventory.is_none());
        super::apply_worker_line(&mut runtime, r#"{"type":"ready"}"#, "stdout", 1);
        assert_eq!(runtime.state, "stopped");
        assert_eq!(runtime.revision, 3);
    }

    #[test]
    fn catalog_does_not_trigger_a_large_status_event() {
        let mut runtime = MineflayerBotRuntime::default();
        super::apply_worker_line(
            &mut runtime,
            r#"{"type":"minecraft_catalog","catalog":{"entries":[]}}"#,
            "stdout",
            0,
        );
        assert!(runtime.catalog.is_some());
        assert_eq!(runtime.revision, 0);
        let status = serde_json::to_value(super::snapshot_status(&runtime)).unwrap();
        assert!(status.get("catalog").is_none());
    }

    #[test]
    fn observes_silent_worker_exit_without_a_frontend_status_request() {
        use std::{
            process::{Command, Stdio},
            sync::{Arc, Mutex},
            time::{Duration, Instant},
        };
        let child = Command::new(std::env::current_exe().unwrap())
            .arg("--list")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let (reply, mut response) = oneshot::channel();
        let mut runtime = MineflayerBotRuntime {
            generation: 1,
            pid: Some(child.id()),
            child: Some(child),
            state: "connected".to_string(),
            inventory: Some(serde_json::json!({ "health": 20 })),
            ..Default::default()
        };
        runtime.pending_chat.insert("pending".to_string(), reply);
        let state = Arc::new(Mutex::new(runtime));
        super::spawn_exit_watcher(state.clone(), 1);
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            {
                let runtime = state.lock().unwrap();
                if runtime.child.is_none() {
                    assert_eq!(runtime.state, "stopped");
                    assert!(runtime.pid.is_none());
                    assert!(runtime.inventory.is_none());
                    assert_eq!(runtime.revision, 1);
                    assert_eq!(runtime.generation, 2);
                    assert!(response.try_recv().unwrap().is_err());
                    break;
                }
            }
            assert!(
                Instant::now() < deadline,
                "exit watcher failed to observe the child"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn validates_chat_without_truncating_unicode_or_allowing_packet_controls() {
        assert_eq!(
            validate_chat_message("  Привет от бота  ").unwrap(),
            "Привет от бота"
        );
        assert!(validate_chat_message(" ").is_err());
        assert!(validate_chat_message(&"x".repeat(241)).is_err());
        assert!(validate_chat_message(&"😀".repeat(121)).is_err());
        assert!(validate_chat_message(&"😀".repeat(120)).is_ok());
        assert!(validate_chat_message("first\nsecond").is_err());
        assert!(validate_chat_message("§color").is_err());
    }

    #[test]
    fn worker_progress_inventory_and_command_errors_keep_connected_controls_available() {
        let mut runtime = MineflayerBotRuntime {
            state: "connected".into(),
            ..Default::default()
        };
        for json in [
            serde_json::json!({ "type": "gathering", "gathering": { "phase": "dig", "mined": 3 } }),
            serde_json::json!({ "type": "inventory", "inventoryUrl": "http://127.0.0.1:12345/" }),
            serde_json::json!({ "type": "bot_inventory", "inventory": { "health": 6, "food": 18, "armor": 12, "slots": [null] } }),
            serde_json::json!({ "type": "minecraft_catalog", "catalog": { "version": "26.1.2", "entries": [{ "name": "diamond_ore" }] } }),
            serde_json::json!({ "type": "error", "error": "Нет добычи для передачи" }),
        ] {
            update_from_worker_event(&mut runtime, serde_json::from_value(json).unwrap());
        }
        assert_eq!(runtime.state, "connected");
        assert_eq!(runtime.gathering.as_ref().unwrap()["mined"], 3);
        assert_eq!(
            runtime.inventory_url.as_deref(),
            Some("http://127.0.0.1:12345/")
        );
        assert_eq!(runtime.inventory.as_ref().unwrap()["health"], 6);
        assert_eq!(runtime.inventory.as_ref().unwrap()["food"], 18);
        assert_eq!(
            runtime.catalog.as_ref().unwrap()["entries"][0]["name"],
            "diamond_ore"
        );
        assert!(serde_json::to_value(super::snapshot_status(&runtime))
            .unwrap()
            .get("catalog")
            .is_none());
        update_from_worker_event(
            &mut runtime,
            serde_json::from_value(serde_json::json!({ "type": "end" })).unwrap(),
        );
        assert!(runtime.inventory_url.is_none());
        assert!(runtime.inventory.is_none());
        assert!(runtime.gathering.is_none());
        assert!(runtime.catalog.is_none());
    }

    #[test]
    fn a_new_production_job_clears_only_the_previous_production_error() {
        let mut runtime = MineflayerBotRuntime {
            state: "connected".into(),
            last_error: Some("production: missing ingredient".into()),
            ..Default::default()
        };
        update_from_worker_event(
            &mut runtime,
            serde_json::from_value(serde_json::json!({ "type": "production_started" })).unwrap(),
        );
        assert!(runtime.last_error.is_none());
        runtime.last_error = Some("connection failed".into());
        update_from_worker_event(
            &mut runtime,
            serde_json::from_value(serde_json::json!({ "type": "production_started" })).unwrap(),
        );
        assert_eq!(runtime.last_error.as_deref(), Some("connection failed"));
    }

    #[test]
    fn workflow_accepts_100_steps_and_rejects_101_before_sending_to_worker() {
        let steps = serde_json::json!(vec![
            serde_json::json!({ "kind": "craft", "item": "stick", "count": 8 });
            100
        ]);
        assert!(super::validate_workflow_request("start", Some(&steps)).is_ok());
        let oversized = serde_json::json!(vec![serde_json::json!({ "kind": "return" }); 101]);
        assert!(super::validate_workflow_request("start", Some(&oversized)).is_err());
        assert!(super::validate_workflow_request("start", Some(&serde_json::json!([]))).is_err());
        assert!(super::validate_workflow_request("stop", None).is_ok());
    }

    #[test]
    fn frames_worker_input_as_separate_json_lines() {
        let mut input = Vec::new();
        write_worker_message(
            &mut input,
            &serde_json::json!({ "server": { "host": "localhost" } }),
        )
        .unwrap();
        write_worker_message(
            &mut input,
            &serde_json::json!({ "type": "chat", "message": "Привет" }),
        )
        .unwrap();
        let raw = String::from_utf8(input).unwrap();
        let messages: Vec<serde_json::Value> = raw
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert!(raw.ends_with('\n'));
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0]["server"]["host"], "localhost");
        assert_eq!(messages[1]["message"], "Привет");
    }

    #[test]
    fn resolves_chat_acknowledgements_by_id_without_changing_connection_state() {
        let mut runtime = MineflayerBotRuntime {
            state: "connected".to_string(),
            ..Default::default()
        };
        let (first_tx, mut first_rx) = oneshot::channel();
        let (second_tx, mut second_rx) = oneshot::channel();
        runtime.pending_chat.insert("first".to_string(), first_tx);
        runtime.pending_chat.insert("second".to_string(), second_tx);
        let result: WorkerEvent = serde_json::from_value(serde_json::json!({
            "type": "chat_result", "requestId": "second", "error": "connection closed"
        }))
        .unwrap();
        update_from_worker_event(&mut runtime, result);
        assert_eq!(
            second_rx.try_recv().unwrap(),
            Err("connection closed".to_string())
        );
        assert!(first_rx.try_recv().is_err());
        assert_eq!(runtime.state, "connected");
        let result: WorkerEvent = serde_json::from_value(serde_json::json!({
            "type": "chat_result", "requestId": "first", "message": "chat sent: Привет"
        }))
        .unwrap();
        update_from_worker_event(&mut runtime, result);
        assert_eq!(first_rx.try_recv().unwrap(), Ok(()));
        assert!(runtime.pending_chat.is_empty());
        assert!(runtime.logs.last().unwrap().ends_with("chat sent: Привет"));
    }

    #[test]
    fn fails_pending_chat_when_bot_stops() {
        let mut runtime = MineflayerBotRuntime::default();
        let (tx, mut rx) = oneshot::channel();
        runtime.pending_chat.insert("pending".to_string(), tx);
        fail_pending_chat(&mut runtime);
        assert!(rx.try_recv().unwrap().is_err());
        assert!(runtime.pending_chat.is_empty());
    }

    #[test]
    fn parses_and_deduplicates_extra_owners() {
        assert_eq!(
            parse_extra_owners("Alex, steve\nALEX; Builder"),
            vec!["Alex", "steve", "Builder"]
        );
    }

    #[test]
    fn sends_anti_knockback_preference_to_worker() {
        for enabled in [true, false] {
            let settings = WorkerBehaviorConfig {
                stay_on_water: true,
                anti_knockback: enabled,
                auto_follow_on_spawn: false,
                announce_on_spawn: false,
                spawn_message: String::new(),
                log_path_updates: false,
            };
            assert_eq!(
                serde_json::to_value(settings).unwrap()["antiKnockback"],
                enabled
            );
        }
    }

    #[test]
    fn sends_jump_head_turn_preference_to_worker() {
        let settings = WorkerMovementConfig {
            follow_distance: 3,
            goto_radius: 1,
            allow_sprinting: true,
            allow_low_ceiling_jumps: true,
            allow_parkour: true,
            allow_air_strafe: true,
            can_dig: false,
            max_drop_down: 3,
            allow_water_drop: true,
            allow_bucket_water_drop: true,
        };
        let serialized = serde_json::to_value(settings).unwrap();
        assert_eq!(serialized["allowAirStrafe"], true);
        assert_eq!(serialized["allowLowCeilingJumps"], true);
        assert_eq!(serialized["allowWaterDrop"], true);
        assert_eq!(serialized["allowBucketWaterDrop"], true);
    }
}
