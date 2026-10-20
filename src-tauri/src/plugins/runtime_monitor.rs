use serde::Serialize;
use tauri::State;

use crate::{
    commands::launcher::is_process_alive,
    models::{BlueMapStatus, MineflayerBotStatus, ObsTelemetryStatus},
};

use super::{
    blue_map::{self, BlueMapState},
    mineflayer_bot::{self, MineflayerBotState},
    obs_telemetry::{self, ObsTelemetryState},
    optional_extensions::{self, OptionalExtensionStatus},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProcessStatus {
    pub pid: u32,
    pub alive: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMonitorSnapshot {
    pub mineflayer_bot: MineflayerBotStatus,
    pub blue_map: BlueMapStatus,
    pub obs_telemetry: ObsTelemetryStatus,
    pub processes: Vec<RuntimeProcessStatus>,
    pub optional_extensions: Vec<OptionalExtensionStatus>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMonitorActivity {
    pub blue_map: BlueMapStatus,
    pub obs_telemetry: ObsTelemetryStatus,
    pub processes: Vec<RuntimeProcessStatus>,
}

#[tauri::command]
pub async fn get_runtime_monitor_activity(
    pids: Vec<u32>,
    blue_map_state: State<'_, BlueMapState>,
    obs_telemetry_state: State<'_, ObsTelemetryState>,
) -> Result<RuntimeMonitorActivity, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        Ok(RuntimeMonitorActivity {
            blue_map: blue_map::current_status(&blue_map_state)?,
            obs_telemetry: obs_telemetry::current_status(&obs_telemetry_state)?,
            processes: process_statuses(pids),
        })
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

fn process_statuses(pids: Vec<u32>) -> Vec<RuntimeProcessStatus> {
    pids.into_iter()
        .map(|pid| RuntimeProcessStatus {
            pid,
            alive: is_process_alive(pid),
        })
        .collect()
}

#[tauri::command]
pub async fn get_runtime_monitor_snapshot(
    pids: Vec<u32>,
    mineflayer_state: State<'_, MineflayerBotState>,
    blue_map_state: State<'_, BlueMapState>,
    obs_telemetry_state: State<'_, ObsTelemetryState>,
) -> Result<RuntimeMonitorSnapshot, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let mineflayer_bot = mineflayer_bot::current_status(&mineflayer_state)?;
        let blue_map = blue_map::current_status(&blue_map_state)?;
        let obs_telemetry = obs_telemetry::current_status(&obs_telemetry_state)?;
        let processes = process_statuses(pids);

        Ok(RuntimeMonitorSnapshot {
            mineflayer_bot,
            blue_map,
            obs_telemetry,
            processes,
            optional_extensions: optional_extensions::statuses(),
        })
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}
