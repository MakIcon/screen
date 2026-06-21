use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::auth::{read_accounts, refresh_account_if_expired},
    models::{MicrosoftAccount, MineflayerBotPluginSettings, MineflayerBotStatus},
    paths::read_settings,
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const MAX_LOG_LINES: usize = 80;

#[derive(Clone, Default)]
pub struct MineflayerBotState {
    inner: Arc<Mutex<MineflayerBotRuntime>>,
}

struct MineflayerBotRuntime {
    child: Option<Child>,
    state: String,
    pid: Option<u32>,
    owner_name: Option<String>,
    bot_username: Option<String>,
    server: Option<String>,
    last_error: Option<String>,
    logs: Vec<String>,
}

impl Default for MineflayerBotRuntime {
    fn default() -> Self {
        Self {
            child: None,
            state: "idle".to_string(),
            pid: None,
            owner_name: None,
            bot_username: None,
            server: None,
            last_error: None,
            logs: Vec::new(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerConfig {
    server: WorkerServerConfig,
    owner_name: String,
    command_prefix: String,
    follow_distance: u32,
    account: WorkerAccountConfig,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerEvent {
    #[serde(rename = "type")]
    event_type: String,
    message: Option<String>,
    state: Option<String>,
    bot_username: Option<String>,
    error: Option<String>,
}

fn push_log(runtime: &mut MineflayerBotRuntime, line: impl Into<String>) {
    super::push_log_line(&mut runtime.logs, MAX_LOG_LINES, line);
}

fn snapshot_status(runtime: &MineflayerBotRuntime) -> MineflayerBotStatus {
    MineflayerBotStatus {
        running: runtime.child.is_some(),
        state: runtime.state.clone(),
        pid: runtime.pid,
        owner_name: runtime.owner_name.clone(),
        bot_username: runtime.bot_username.clone(),
        server: runtime.server.clone(),
        last_error: runtime.last_error.clone(),
        logs: runtime.logs.clone(),
    }
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
        runtime.child.take();
        runtime.pid = None;
        runtime.state = "stopped".to_string();
        push_log(runtime, format!("process stopped: {status}"));
    }
}

fn update_from_worker_event(runtime: &mut MineflayerBotRuntime, event: WorkerEvent) {
    match event.event_type.as_str() {
        "ready" => {
            runtime.state = "connected".to_string();
            runtime.bot_username = event.bot_username;
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
        "error" => {
            let message = event
                .error
                .or(event.message)
                .unwrap_or_else(|| "unknown worker error".to_string());
            runtime.last_error = Some(message.clone());
            runtime.state = "error".to_string();
            push_log(runtime, format!("error: {message}"));
        }
        "end" => {
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
}

fn spawn_log_reader<R>(reader: R, state: Arc<Mutex<MineflayerBotRuntime>>, label: &'static str)
where
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

            if let Ok(event) = serde_json::from_str::<WorkerEvent>(trimmed) {
                if let Ok(mut runtime) = state.lock() {
                    update_from_worker_event(&mut runtime, event);
                }
                continue;
            }

            if let Ok(mut runtime) = state.lock() {
                push_log(&mut runtime, format!("{label}: {trimmed}"));
                if label == "stderr" {
                    runtime.last_error = Some(trimmed.to_string());
                }
            }
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

fn worker_path(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("mineflayer-bot-worker.cjs"));
    }

    app.path()
        .resource_dir()
        .map(|path| path.join("resources").join("mineflayer-bot-worker.cjs"))
        .map_err(|error| format!("resolve resource dir error: {error}"))
}

fn project_root_for_node() -> Option<PathBuf> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|path| path.to_path_buf())
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
) -> Result<MineflayerBotStatus, String> {
    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "Mineflayer bot state lock poisoned".to_string())?;
    refresh_child_state(&mut runtime);
    Ok(snapshot_status(&runtime))
}

#[tauri::command]
pub async fn stop_mineflayer_bot(
    state: State<'_, MineflayerBotState>,
) -> Result<MineflayerBotStatus, String> {
    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "Mineflayer bot state lock poisoned".to_string())?;

    if let Some(mut child) = runtime.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    runtime.pid = None;
    runtime.state = "stopped".to_string();
    push_log(&mut runtime, "stop requested from launcher");
    Ok(snapshot_status(&runtime))
}

#[tauri::command]
pub async fn start_mineflayer_bot(
    app: AppHandle,
    state: State<'_, MineflayerBotState>,
    launcher_nickname: String,
    launcher_account_type: String,
    launcher_ms_account_id: Option<String>,
) -> Result<MineflayerBotStatus, String> {
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
    let follow_distance = plugin.follow_distance.clamp(1, 16);
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
        command_prefix,
        follow_distance,
        account,
    };

    let worker = worker_path(&app)?;
    if !worker.exists() {
        return Err(format!("Mineflayer worker not found: {}", worker.display()));
    }

    let config_raw = serde_json::to_vec(&config)
        .map_err(|error| format!("serialize bot config error: {error}"))?;

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
        .arg(&worker)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(root) = project_root_for_node() {
        command.current_dir(&root);
        command.env("NODE_PATH", root.join("node_modules"));
    }

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| {
        format!("start node worker error: {error}. Install Node.js 22+ and retry.")
    })?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to open bot worker stdin".to_string())?;
    if let Err(error) = stdin.write_all(&config_raw) {
        let _ = child.kill();
        return Err(format!("write bot config error: {error}"));
    }
    drop(stdin);

    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(stdout, state.inner.clone(), "stdout");
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(stderr, state.inner.clone(), "stderr");
    }

    runtime.child = Some(child);
    runtime.pid = runtime.child.as_ref().map(|child| child.id());
    runtime.state = "starting".to_string();
    runtime.owner_name = Some(owner_name);
    runtime.bot_username = Some(bot_username);
    runtime.server = Some(server_label);
    runtime.last_error = None;
    runtime.logs.clear();
    push_log(&mut runtime, "start requested from launcher");

    Ok(snapshot_status(&runtime))
}
