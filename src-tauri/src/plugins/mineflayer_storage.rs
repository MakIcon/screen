use super::*;
use crate::models::{
    MineflayerBotPluginSettings, MineflayerStorageGroup, MineflayerStoragePosition,
};
use tauri::Emitter;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageApplication {
    saved: usize,
    applied: usize,
    offline: usize,
    errors: Vec<serde_json::Value>,
    groups_by_bot: HashMap<String, Vec<MineflayerStorageGroup>>,
    scan: Option<serde_json::Value>,
}

fn invalid(message: &str) -> CommandError {
    CommandError::new(ErrorCode::InvalidInput, message)
}

pub(super) struct StorageScanJob {
    token: String,
    members: Vec<String>,
    cancelled: bool,
    saving: bool,
}

struct ScanGuard(Arc<Mutex<Option<StorageScanJob>>>);
impl Drop for ScanGuard {
    fn drop(&mut self) {
        if let Ok(mut job) = self.0.lock() {
            *job = None;
        }
    }
}

fn scan_active(state: &MineflayerBotState) -> Result<(), CommandError> {
    let job = state
        .storage_scan_job
        .lock()
        .map_err(|_| invalid("Не удалось прочитать состояние поиска"))?;
    if job.as_ref().is_none_or(|job| job.cancelled) {
        return Err(invalid("Поиск складов остановлен"));
    }
    Ok(())
}

async fn stop_team(state: &MineflayerBotState, members: &[String], token: &str) {
    let mut stops = tokio::task::JoinSet::new();
    for id in members {
        if let Ok(bot) = state.for_bot(Some(id)) {
            let token = token.to_owned();
            stops.spawn(async move {
                send_worker_request_with_timeout(
                    &bot,
                    serde_json::json!({"type":"storage_scan", "action":"stop", "token":token}),
                    Duration::from_secs(30),
                )
                .await
            });
        }
    }
    while stops.join_next().await.is_some() {}
}

// Nearby containers stay in the same section. Each container belongs to exactly
// one worker, including double chests discovered as one canonical container.
fn scan_sections(
    mut blocks: Vec<serde_json::Value>,
    available: usize,
) -> Vec<Vec<serde_json::Value>> {
    if blocks.is_empty() || available == 0 {
        return Vec::new();
    }
    blocks.sort_by_key(|b| {
        (
            b["position"]["x"].as_i64().unwrap_or(0),
            b["position"]["z"].as_i64().unwrap_or(0),
            b["position"]["y"].as_i64().unwrap_or(0),
        )
    });
    let count = blocks.len().div_ceil(12).min(8).min(available);
    // Balanced sections avoid leaving one worker with nearly all the containers.
    let mut sections = Vec::with_capacity(count);
    let mut remaining = blocks.into_iter();
    let total = remaining.len();
    for index in 0..count {
        sections.push(
            remaining
                .by_ref()
                .take(total / count + usize::from(index < total % count))
                .collect(),
        );
    }
    sections
}

fn container_key(record: &serde_json::Value) -> String {
    record["positions"]
        .as_array()
        .and_then(|positions| positions.iter().map(|p| p.to_string()).min())
        .unwrap_or_else(|| record["position"].to_string())
}

fn combined_records(scans: &[serde_json::Value]) -> Vec<serde_json::Value> {
    let mut records = std::collections::BTreeMap::new();
    for record in scans
        .iter()
        .flat_map(|scan| scan["records"].as_array().into_iter().flatten())
    {
        let key = container_key(record);
        // A failed retry must never replace an earlier successful inspection.
        if !records.get(&key).is_some_and(|old: &serde_json::Value| {
            old["error"].is_null() && !record["error"].is_null()
        }) {
            records.insert(key, record.clone());
        }
    }
    records.into_values().collect()
}

fn unchecked_blocks(
    blocks: &[serde_json::Value],
    records: &[serde_json::Value],
) -> Vec<serde_json::Value> {
    let checked: HashSet<_> = records
        .iter()
        .filter(|r| r["error"].is_null())
        .map(container_key)
        .collect();
    blocks
        .iter()
        .filter(|block| !checked.contains(&container_key(block)))
        .cloned()
        .collect()
}

async fn scan_snapshot(bot: &MineflayerBotState, token: &str) -> Option<serde_json::Value> {
    let cached = bot.inner.lock().ok().and_then(|runtime| {
        runtime
            .inventory
            .as_ref()
            .map(|inventory| inventory["production"]["storageScan"].clone())
    });
    let fresh = send_worker_request_data(
        bot,
        serde_json::json!({"type":"storage_scan", "action":"snapshot"}),
        Duration::from_secs(5),
    )
    .await
    .ok();
    fresh
        .filter(|scan| scan["token"] == token)
        .or_else(|| cached.filter(|scan| scan["token"] == token))
}

async fn classify_records(
    state: &MineflayerBotState,
    candidates: &[String],
    records: &[serde_json::Value],
) -> Result<serde_json::Value, CommandError> {
    if records.len() > 512 {
        return Err(invalid("Слишком много сундуков для одной проверки"));
    }
    for id in candidates {
        let bot = state.for_bot(Some(id))?;
        if let Ok(assigned) = send_worker_request_data(
            &bot,
            serde_json::json!({"type":"storage_assign", "records":records}),
            Duration::from_secs(10),
        )
        .await
        {
            if assigned["groups"].is_array() && assigned["records"].is_array() {
                return Ok(assigned);
            }
        }
    }
    Err(invalid(
        "Подключите бота на этом сервере, чтобы распределить проверенные сундуки по складам",
    ))
}

async fn inspect_section(
    bot: &MineflayerBotState,
    request: serde_json::Value,
    token: &str,
) -> serde_json::Value {
    match send_worker_request_data(bot, request, Duration::from_secs(1800)).await {
        Ok(scan) => scan,
        Err(error) => {
            let mut scan = scan_snapshot(bot, token)
                .await
                .unwrap_or_else(|| serde_json::json!({"token":token,"state":"error","records":[]}));
            scan["failure"] = error.to_string().into();
            scan
        }
    }
}

fn recipients(
    settings: &MineflayerBotPluginSettings,
    ids: Vec<String>,
) -> Result<Vec<String>, CommandError> {
    let mut seen = HashSet::new();
    let ids: Vec<_> = ids
        .into_iter()
        .filter(|id| seen.insert(id.clone()))
        .collect();
    if ids.is_empty() || ids.len() > 100 {
        return Err(invalid("Выберите от 1 до 100 ботов"));
    }
    if ids
        .iter()
        .any(|id| id != "default" && !settings.bots.iter().any(|bot| bot.id == *id))
    {
        return Err(invalid("Часть выбранных ботов удалена; обновите список"));
    }
    Ok(ids)
}

fn validate_groups(groups: &[MineflayerStorageGroup]) -> Result<(), CommandError> {
    let mut ids = HashSet::new();
    let known_filters: HashSet<String> = serde_json::from_str::<Vec<serde_json::Value>>(
        include_str!("../../../extensions/mineflayer-bot/storage-filters.json"),
    )
    .unwrap_or_default()
    .iter()
    .filter_map(|entry| entry["name"].as_str().map(String::from))
    .collect();
    if groups.len() > MAX_STORAGE_GROUPS
        || groups.iter().any(|g| {
            g.id.is_empty()
                || g.id.len() > 64
                || !g
                    .id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
                || !ids.insert(g.id.clone())
                || g.name.chars().count() > 64
                || g.chests.len() > 32
                || g.filters.len() > 64
                || g.filters.iter().any(|token| {
                    !known_filters.contains(token)
                        && (token.is_empty()
                            || token.strip_suffix('*').unwrap_or(token).is_empty()
                            || !token
                                .strip_suffix('*')
                                .unwrap_or(token)
                                .bytes()
                                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_'))
                })
                || g.chests.iter().any(|p| {
                    [p.x, p.y, p.z]
                        .iter()
                        .any(|v| v.unsigned_abs() > 30_000_000)
                })
        })
    {
        return Err(invalid(
            "Можно сохранить до 100 складов, по 32 сундука и 64 ресурса в каждом",
        ));
    }
    Ok(())
}

fn pos_key(p: &MineflayerStoragePosition) -> String {
    format!("{},{},{}", p.x, p.y, p.z)
}

fn merge_groups(
    current: &[MineflayerStorageGroup],
    found: &[MineflayerStorageGroup],
    records: &[serde_json::Value],
) -> Result<Vec<MineflayerStorageGroup>, CommandError> {
    let mut groups = current.to_vec();
    let mut owned: HashSet<_> = groups
        .iter()
        .flat_map(|g| g.chests.iter().map(pos_key))
        .collect();
    // Either half of an already configured double chest owns the same container.
    for record in records {
        let aliases: Vec<MineflayerStoragePosition> =
            serde_json::from_value(record["positions"].clone()).unwrap_or_default();
        if aliases.iter().any(|p| owned.contains(&pos_key(p))) {
            owned.extend(aliases.iter().map(pos_key));
        }
    }
    for group in found {
        let mut chests: Vec<_> = group
            .chests
            .iter()
            .filter(|p| !owned.contains(&pos_key(p)))
            .cloned()
            .collect();
        if chests.is_empty() {
            continue;
        }
        if let Some(existing) = groups
            .iter_mut()
            .find(|g| g.enabled && g.id == group.id && g.filters == group.filters)
        {
            let count = (32 - existing.chests.len()).min(chests.len());
            owned.extend(chests.iter().take(count).map(pos_key));
            existing.chests.extend(chests.drain(..count));
        }
        while !chests.is_empty() {
            if groups.len() >= MAX_STORAGE_GROUPS {
                return Err(invalid(
                    "Достигнут лимит 100 складов; освободите место и повторите поиск",
                ));
            }
            let mut addition = group.clone();
            let base = addition.id.clone();
            let mut suffix = 2;
            while groups.iter().any(|g| g.id == addition.id) {
                addition.id = format!("{base}-{suffix}");
                suffix += 1;
            }
            let count = 32.min(chests.len());
            owned.extend(chests.iter().take(count).map(pos_key));
            addition.chests = chests.drain(..count).collect();
            groups.push(addition);
        }
    }
    validate_groups(&groups)?;
    Ok(groups)
}

fn configure_profiles(
    settings: &mut MineflayerBotPluginSettings,
    bot_ids: Vec<String>,
    groups: &[MineflayerStorageGroup],
    records: Option<&[serde_json::Value]>,
) -> Result<Vec<(String, Vec<MineflayerStorageGroup>)>, CommandError> {
    validate_groups(&groups)?;
    let ids = recipients(settings, bot_ids)?;
    let mut jobs = Vec::new();
    for id in &ids {
        let config = if id == "default" {
            &settings.configuration
        } else {
            &settings.bots.iter().find(|b| b.id == *id).unwrap().settings
        };
        let next = match records {
            Some(records) => merge_groups(&config.gathering.storage_groups, &groups, records)?,
            None => groups.to_vec(),
        };
        jobs.push((id.clone(), next));
    }
    for (id, groups) in &jobs {
        let config = if id == "default" {
            &mut settings.configuration
        } else {
            &mut settings
                .bots
                .iter_mut()
                .find(|bot| bot.id == *id)
                .unwrap()
                .settings
        };
        config.gathering.storage_groups = groups.clone();
    }
    Ok(jobs)
}

async fn apply(
    app: &AppHandle,
    state: &MineflayerBotState,
    bot_ids: Vec<String>,
    groups: Vec<MineflayerStorageGroup>,
    records: Option<&[serde_json::Value]>,
) -> Result<StorageApplication, CommandError> {
    let mut settings = edit_settings().await?;
    let jobs = configure_profiles(
        &mut settings.plugins.mineflayer_bot,
        bot_ids,
        &groups,
        records,
    )?;
    settings.commit().await?;
    let _ = app.emit("launcher-plugins-changed", &settings.plugins);
    drop(settings);
    let mut result = StorageApplication {
        saved: jobs.len(),
        applied: 0,
        offline: 0,
        errors: Vec::new(),
        groups_by_bot: jobs.iter().cloned().collect(),
        scan: None,
    };
    for chunk in jobs.chunks(4) {
        let mut updates = tokio::task::JoinSet::new();
        for (id, groups) in chunk {
            let bot = state.for_bot(Some(id))?;
            let online = {
                let mut runtime = bot
                    .inner
                    .lock()
                    .map_err(|_| invalid("Не удалось прочитать состояние бота"))?;
                refresh_child_state(&mut runtime);
                runtime.state == "connected" && runtime.child.is_some()
            };
            if !online {
                result.offline += 1;
                continue;
            }
            let (id, groups) = (id.clone(), groups.clone());
            updates.spawn(async move {
                (
                    id,
                    send_worker_request(
                        &bot,
                        serde_json::json!({"type":"storage_config", "groups":groups}),
                    )
                    .await,
                )
            });
        }
        while let Some(update) = updates.join_next().await {
            match update {
                Ok((_, Ok(()))) => result.applied += 1,
                Ok((id, Err(error))) => result
                    .errors
                    .push(serde_json::json!({"botId":id, "error":error.to_string()})),
                Err(error) => result
                    .errors
                    .push(serde_json::json!({"error":error.to_string()})),
            }
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn apply_mineflayer_storage(
    app: AppHandle,
    state: State<'_, MineflayerBotState>,
    bot_ids: Vec<String>,
    groups: Vec<MineflayerStorageGroup>,
    scan_token: Option<String>,
    candidate_ids: Option<Vec<String>>,
) -> Result<StorageApplication, CommandError> {
    let Some(token) = scan_token else {
        return apply(&app, &state, bot_ids, groups, None).await;
    };
    if token.is_empty() || token.len() > 80 {
        return Err(invalid("Некорректный результат поиска"));
    }
    let _scan = state
        .storage_scan
        .try_lock()
        .map_err(|_| invalid("Дождитесь завершения поиска или остановите его"))?;
    let settings = read_settings().await?;
    let candidates = recipients(
        &settings.plugins.mineflayer_bot,
        candidate_ids.unwrap_or_default(),
    )?;
    let mut snapshots = tokio::task::JoinSet::new();
    for id in &candidates {
        let bot = state.for_bot(Some(id))?;
        let token = token.clone();
        snapshots.spawn(async move { scan_snapshot(&bot, &token).await });
    }
    let mut scans = Vec::new();
    while let Some(snapshot) = snapshots.join_next().await {
        if let Ok(Some(scan)) = snapshot {
            scans.push(scan);
        }
    }
    let records = combined_records(&scans);
    if !records
        .iter()
        .any(|r| r["error"].is_null() && r["contents"].is_array())
    {
        return Err(invalid(
            "Нет проверенных сундуков для сохранения; запустите поиск ещё раз",
        ));
    }
    let assigned = classify_records(&state, &candidates, &records).await?;
    let found: Vec<MineflayerStorageGroup> = serde_json::from_value(assigned["groups"].clone())
        .map_err(|_| invalid("Неверный список складов"))?;
    let groups = merge_groups(&groups, &found, &records)?;
    let mut application = apply(&app, &state, bot_ids, groups, None).await?;
    let mut scan = scans.first().cloned().unwrap_or_default();
    let total = scans
        .iter()
        .filter_map(|s| s["teamTotal"].as_u64().or(s["total"].as_u64()))
        .max()
        .unwrap_or(records.len() as u64);
    if let Some(object) = scan.as_object_mut() {
        object.extend(assigned.as_object().unwrap().clone());
        object.insert("total".into(), total.into());
        object.insert("saved".into(), true.into());
    }
    application.scan = Some(scan);
    Ok(application)
}

#[tauri::command]
pub async fn scan_mineflayer_storage_near_player(
    app: AppHandle,
    state: State<'_, MineflayerBotState>,
    bot_ids: Vec<String>,
    candidate_ids: Vec<String>,
    radius: u32,
    token: String,
) -> Result<serde_json::Value, CommandError> {
    if !(4..=64).contains(&radius) || token.is_empty() || token.len() > 80 {
        return Err(invalid("Радиус поиска складов — от 4 до 64 блоков"));
    }
    let _scan = state
        .storage_scan
        .try_lock()
        .map_err(|_| invalid("Бот уже ищет склады; дождитесь завершения или остановите поиск"))?;
    let settings = read_settings().await?;
    let ids = recipients(&settings.plugins.mineflayer_bot, bot_ids)?;
    let candidates = recipients(&settings.plugins.mineflayer_bot, candidate_ids)?;
    let mut probes = tokio::task::JoinSet::new();
    for id in candidates {
        let bot = state.for_bot(Some(&id))?;
        let online = bot
            .inner
            .lock()
            .map_err(|_| invalid("Не удалось прочитать состояние бота"))?
            .state
            == "connected";
        if online {
            probes.spawn(async move {
                let result = send_worker_request_data(
                    &bot,
                    serde_json::json!({"type":"storage_probe"}),
                    Duration::from_secs(4),
                )
                .await;
                (id, bot, result)
            });
        }
    }
    let mut eligible = Vec::new();
    while let Some(probe) = probes.join_next().await {
        if let Ok((id, bot, Ok(context))) = probe {
            if context["scanning"].as_bool() == Some(true) {
                return Err(invalid("Бот уже проверяет склады рядом с игроком"));
            }
            if context["eligible"].as_bool() == Some(true) {
                if let Some(distance) = context["distance"]
                    .as_f64()
                    .filter(|d| d.is_finite() && *d >= 0.0)
                {
                    eligible.push((distance, id, bot, context));
                }
            }
        }
    }
    eligible.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    let (_, runner, bot, owner_context) = eligible.first().cloned().ok_or_else(|| invalid("Нет подходящего бота, который видит игрока. Подойдите к ботам; дождитесь окончания крафта или работы с инвентарём"))?;
    eligible.retain(|entry| {
        entry.3["ownerName"] == owner_context["ownerName"]
            && entry.3["dimension"] == owner_context["dimension"]
    });
    *state
        .storage_scan_job
        .lock()
        .map_err(|_| invalid("Не удалось начать поиск"))? = Some(StorageScanJob {
        token: token.clone(),
        members: vec![runner.clone()],
        cancelled: false,
        saving: false,
    });
    let _guard = ScanGuard(state.storage_scan_job.clone());
    let result = async {
        let mut scan = send_worker_request_data(&bot, serde_json::json!({"type":"storage_scan", "action":"discover", "radius":radius, "token":token}), Duration::from_secs(90)).await?;
        scan_active(&state)?;
        let blocks = scan["blocks"].as_array().cloned().ok_or_else(|| invalid("Бот вернул неверный список сундуков"))?;
        if blocks.len() > 512 { return Err(invalid("Слишком много сундуков для одной проверки")); }
        let total = blocks.len();
        let block_total: usize = blocks.iter().map(|b| b["positions"].as_array().map_or(1, Vec::len)).sum();
        let sections = scan_sections(blocks.clone(), eligible.len());
        let count = sections.len();
        let mut workers: Vec<_> = eligible.into_iter().take(count.max(1)).collect();
        let members: Vec<_> = workers.iter().map(|entry| entry.1.clone()).collect();
        {
            let mut job = state.storage_scan_job.lock().map_err(|_| invalid("Не удалось начать совместный поиск"))?;
            let job = job.as_mut().ok_or_else(|| invalid("Поиск складов остановлен"))?;
            if job.cancelled { return Err(invalid("Поиск складов остановлен")); }
            job.members = members.clone();
        }
        let mut inspections = tokio::task::JoinSet::new();
        let mut finished = Vec::new();
        if total == 0 {
            // Release the discovery reservation even when there is nothing to inspect.
            stop_team(&state, &members, &token).await;
        }
        for section in sections {
            let center: Vec<f64> = ["x", "y", "z"].iter().map(|axis| section.iter().map(|b| b["position"][axis].as_f64().unwrap_or(0.0)).sum::<f64>() / section.len() as f64).collect();
            let distance = |entry: &(f64, String, MineflayerBotState, serde_json::Value)| {
                let position = if entry.1 == runner { &scan["origin"] } else { &entry.3["position"] };
                ["x", "y", "z"].iter().enumerate().map(|(i, axis)| (position[axis].as_f64().unwrap_or(0.0) - center[i]).powi(2)).sum::<f64>()
            };
            let index = (0..workers.len()).min_by(|a, b| distance(&workers[*a]).total_cmp(&distance(&workers[*b]))).unwrap();
            let (_, id, worker, _) = workers.remove(index);
            let request = serde_json::json!({"type":"storage_scan", "action":"inspect", "radius":radius, "token":token, "blocks":section, "origin":scan["origin"], "teamSize":count, "teamTotal":total});
            let token = token.clone();
            inspections.spawn(async move {
                let result = inspect_section(&worker, request, &token).await;
                (id, worker, result)
            });
        }
        while let Some(inspection) = inspections.join_next().await {
            match inspection {
                Ok((id, worker, section)) => finished.push((id, worker, section)),
                Err(_) => continue,
            }
        }
        let mut records = combined_records(&finished.iter().map(|(_, _, s)| s.clone()).collect::<Vec<_>>());
        let remaining = unchecked_blocks(&blocks, &records);
        // One interrupted worker must not discard the other sections. Healthy
        // workers retry the missing or inaccessible containers once.
        if !remaining.is_empty() && scan_active(&state).is_ok() {
            let healthy: Vec<_> = finished.iter().filter(|(_, _, s)| s["state"] == "complete").map(|(id, worker, _)| (id.clone(), worker.clone())).collect();
            for ((id, worker), section) in healthy.into_iter().zip(scan_sections(remaining, finished.iter().filter(|(_, _, s)| s["state"] == "complete").count())) {
                let request = serde_json::json!({"type":"storage_scan", "action":"inspect", "radius":radius, "token":token, "blocks":section, "origin":scan["origin"], "teamSize":count, "teamTotal":total});
                let token = token.clone();
                inspections.spawn(async move { let result = inspect_section(&worker, request, &token).await; (id, worker, result) });
            }
            while let Some(inspection) = inspections.join_next().await {
                if let Ok(section) = inspection { finished.push(section); }
            }
            records = combined_records(&finished.iter().map(|(_, _, s)| s.clone()).collect::<Vec<_>>());
        }
        let missing = unchecked_blocks(&blocks, &records);
        let cancelled = scan_active(&state).is_err();
        let partial = !missing.is_empty();
        let recorded: HashSet<_> = records.iter().map(container_key).collect();
        for mut block in missing.into_iter().filter(|b| !recorded.contains(&container_key(b))) {
            block["error"] = "Сундук ещё не проверен".into(); block["label"] = "Не проверен".into(); records.push(block);
        }
        // Classify once for the whole warehouse so empty chests are allocated
        // according to the contents found by every worker, not per section.
        let assigned = classify_records(&state, &members, &records).await?;
        let groups: Vec<MineflayerStorageGroup> = serde_json::from_value(assigned["groups"].clone()).map_err(|_| invalid("Бот вернул неверный список складов"))?;
        let records = assigned["records"].as_array().cloned().ok_or_else(|| invalid("Бот вернул неверный результат проверки"))?;
        let application = if !partial && !cancelled {
            let mut job = state.storage_scan_job.lock().map_err(|_| invalid("Не удалось сохранить результат поиска"))?;
            let job = job.as_mut().ok_or_else(|| invalid("Поиск складов остановлен"))?;
            if job.cancelled { return Err(invalid("Поиск складов остановлен")); }
            job.saving = true;
            Some(())
        } else { None };
        let application = if application.is_some() { Some(apply(&app, &state, ids, groups, Some(&records)).await?) } else { None };
        if let Some(object) = scan.as_object_mut() {
            object.remove("blocks");
            for (key, value) in assigned.as_object().ok_or_else(|| invalid("Бот вернул неверный результат проверки"))? { object.insert(key.clone(), value.clone()); }
            object.insert("saved".into(), application.is_some().into());
            object.insert("state".into(), (if cancelled { "cancelled" } else if partial { "error" } else { "complete" }).into());
            object.insert("partial".into(), partial.into());
            object.insert("blockTotal".into(), block_total.into());
            object.insert("teamSize".into(), count.max(1).into());
            object.insert("teamTotal".into(), total.into());
            object.insert("total".into(), total.into());
            object.insert("phase".into(), "inspecting".into());
        }
        for (_, worker, section) in finished.into_iter().filter(|_| application.is_some()) {
            let _ = send_worker_request(&worker, serde_json::json!({"type":"command", "message":format!("stash scan saved {}", section["id"])})).await;
        }
        Ok(serde_json::json!({"botId":runner, "botIds":members, "scan":scan, "application":application}))
    }.await;
    if result.is_err() {
        let members = state
            .storage_scan_job
            .lock()
            .ok()
            .and_then(|job| job.as_ref().map(|job| job.members.clone()))
            .unwrap_or_default();
        stop_team(&state, &members, &token).await;
    }
    result
}

#[tauri::command]
pub async fn stop_mineflayer_storage_scan(
    state: State<'_, MineflayerBotState>,
    bot_id: String,
) -> Result<(), CommandError> {
    let team = {
        let mut job = state
            .storage_scan_job
            .lock()
            .map_err(|_| invalid("Не удалось остановить поиск"))?;
        if let Some(job) = job.as_mut() {
            if job.saving {
                return Err(invalid("Проверка завершена, сохраняю склады"));
            }
            job.cancelled = true;
            Some((job.members.clone(), job.token.clone()))
        } else {
            None
        }
    };
    if let Some((members, token)) = team {
        stop_team(&state, &members, &token).await;
        return Ok(());
    }
    send_worker_request_with_timeout(
        &state.for_bot(Some(&bot_id))?,
        serde_json::json!({"type":"storage_scan", "action":"stop"}),
        Duration::from_secs(30),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn interrupted_sixty_container_scan_keeps_fifty_five_checks_and_retries_only_the_missing_five()
    {
        let blocks: Vec<_> = (0..60).map(|x| serde_json::json!({"name":"barrel","position":{"x":x,"y":64,"z":0},"positions":[{"x":x,"y":64,"z":0}]})).collect();
        let checked = |b: &serde_json::Value| {
            let mut r = b.clone();
            r["contents"] = serde_json::json!([]);
            r
        };
        let partial = serde_json::json!({"state":"cancelled","records":blocks.iter().take(55).map(checked).collect::<Vec<_>>()});
        let saved = combined_records(&[partial.clone()]);
        assert_eq!(saved.len(), 55);
        let missing = unchecked_blocks(&blocks, &saved);
        assert_eq!(missing.len(), 5);
        assert_eq!(missing[0]["position"]["x"], 55);
        let retry = serde_json::json!({"records":missing.iter().map(checked).collect::<Vec<_>>()});
        let failed_retry = serde_json::json!({"records":[{"positions":[{"x":0,"y":64,"z":0}],"error":"Нет доступа"}]});
        let complete = combined_records(&[partial, retry, failed_retry]);
        assert_eq!(complete.len(), 60);
        assert!(unchecked_blocks(&blocks, &complete).is_empty());
        assert!(complete.iter().all(|r| r["error"].is_null()));
    }
    #[test]
    fn extending_a_full_automatic_group_keeps_all_sixty_destinations() {
        let mut full = group("auto-scan-bulk", "#bulk", 0);
        full.chests = (0..32)
            .map(|x| MineflayerStoragePosition { x, y: 64, z: 0 })
            .collect();
        let mut addition = full.clone();
        addition.chests = (32..60)
            .map(|x| MineflayerStoragePosition { x, y: 64, z: 0 })
            .collect();
        let merged = merge_groups(&[full], &[addition.clone()], &[]).unwrap();
        assert_eq!(merged.len(), 2);
        assert_eq!(merged.iter().map(|g| g.chests.len()).sum::<usize>(), 60);
        assert_eq!(
            merge_groups(&merged, &[addition], &[])
                .unwrap()
                .iter()
                .map(|g| g.chests.len())
                .sum::<usize>(),
            60
        );
    }
    fn group(id: &str, filter: &str, x: i32) -> MineflayerStorageGroup {
        MineflayerStorageGroup {
            id: id.into(),
            name: id.into(),
            enabled: true,
            filters: vec![filter.into()],
            chests: vec![MineflayerStoragePosition { x, y: 64, z: 0 }],
        }
    }
    #[test]
    fn large_scans_divide_containers_into_balanced_disjoint_sections_with_bounded_helpers() {
        let blocks = |count| {
            (0..count)
                .rev()
                .map(|x| serde_json::json!({"position":{"x":x,"y":64,"z":0}}))
                .collect()
        };
        for (total, available, expected) in [
            (1, 53, 1),
            (12, 53, 1),
            (13, 53, 2),
            (47, 53, 4),
            (100, 3, 3),
            (512, 53, 8),
        ] {
            let sections = scan_sections(blocks(total), available);
            assert_eq!(sections.len(), expected);
            let lengths: Vec<_> = sections.iter().map(Vec::len).collect();
            assert!(lengths.iter().max().unwrap() - lengths.iter().min().unwrap() <= 1);
            let positions: Vec<_> = sections
                .into_iter()
                .flatten()
                .map(|block| block["position"]["x"].as_i64().unwrap())
                .collect();
            assert_eq!(positions, (0..total).collect::<Vec<_>>());
        }
        assert!(scan_sections(blocks(47), 0).is_empty());
        assert!(scan_sections(blocks(0), 8).is_empty());
    }
    #[test]
    fn clearing_one_group_or_all_preserves_unselected_profiles_and_other_settings() {
        let mut settings: MineflayerBotPluginSettings = serde_json::from_value(serde_json::json!({"host":"localhost", "connectionIntervalMs":0, "bots":[{"id":"miner","settings":{}},{"id":"farmer","settings":{}}]})).unwrap();
        let all = vec!["default".into(), "miner".into(), "farmer".into()];
        let groups = vec![group("manual", "#wood", 12)];
        configure_profiles(&mut settings, all.clone(), &groups, None).unwrap();
        configure_profiles(&mut settings, vec!["miner".into()], &[], None).unwrap();
        assert!(settings.bots[0]
            .settings
            .gathering
            .storage_groups
            .is_empty());
        assert_eq!(settings.bots[1].settings.gathering.storage_groups.len(), 1);
        assert_eq!(settings.gathering.storage_groups.len(), 1);
        configure_profiles(
            &mut settings,
            vec!["miner".into(), "farmer".into()],
            &[],
            None,
        )
        .unwrap();
        assert_eq!(settings.gathering.storage_groups.len(), 1);
        assert!(settings
            .bots
            .iter()
            .all(|bot| bot.settings.gathering.storage_groups.is_empty()));
        configure_profiles(&mut settings, all, &[], None).unwrap();
        assert!(settings.gathering.storage_groups.is_empty());
        assert_eq!(settings.host, "localhost");
        assert_eq!(settings.connection_interval_ms, 0);
    }
    #[test]
    fn scanning_preserves_manual_destinations_and_deduplicates_double_chests() {
        let manual = group("manual", "#wood", 11);
        let found = vec![
            group("auto-scan-valuable", "#valuable", 10),
            group("auto-scan-bulk", "#bulk", 20),
        ];
        let records =
            vec![serde_json::json!({"positions":[{"x":10,"y":64,"z":0},{"x":11,"y":64,"z":0}]})];
        let result = merge_groups(&[manual], &found, &records).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].id, "manual");
        assert_eq!(result[0].chests[0].x, 11);
        assert_eq!(result[1].chests[0].x, 20);
    }
    #[test]
    fn repeat_scans_do_not_duplicate_chests_or_change_existing_purposes() {
        let current = vec![group("auto-scan-wood", "#wood", 1)];
        let found = vec![
            group("auto-scan-wood", "#wood", 2),
            group("auto-scan-wood", "#valuable", 3),
        ];
        let first = merge_groups(&current, &found, &[]).unwrap();
        assert_eq!(first[0].chests.len(), 2);
        assert_eq!(first[1].id, "auto-scan-wood-2");
        assert_eq!(first[1].filters, vec!["#valuable"]);
        assert_eq!(
            serde_json::to_value(merge_groups(&first, &found, &[]).unwrap()).unwrap(),
            serde_json::to_value(first).unwrap()
        );
    }
    #[test]
    fn capacity_failures_preserve_existing_storage_and_recipients_are_explicit() {
        let groups: Vec<_> = (0..100)
            .map(|i| group(&format!("manual{i}"), "#wood", i))
            .collect();
        validate_groups(&groups).unwrap();
        let mut oversized = groups.clone();
        oversized.push(group("another", "#bulk", 100));
        assert!(validate_groups(&oversized).is_err());
        assert!(merge_groups(&groups, &[group("another", "#bulk", 100)], &[]).is_err());
        assert_eq!(groups.len(), 100);
        let settings: MineflayerBotPluginSettings =
            serde_json::from_value(serde_json::json!({"bots":[{"id":"miner","settings":{}}]}))
                .unwrap();
        assert_eq!(
            recipients(&settings, vec!["miner".into(), "miner".into()]).unwrap(),
            vec!["miner"]
        );
        assert!(recipients(&settings, vec!["missing".into()]).is_err());
        assert!(recipients(&settings, vec![]).is_err());
    }
    #[test]
    fn one_group_and_all_modes_update_only_the_explicit_profiles_including_offline_ones() {
        let mut settings: MineflayerBotPluginSettings = serde_json::from_value(serde_json::json!({
            "host":"localhost", "gathering":{"tunnelWidth":3},
            "bots":[{"id":"miner","settings":{"botNickname":"Miner"}}, {"id":"farmer","settings":{"botNickname":"Farmer"}}]
        })).unwrap();
        let new_groups = vec![group("wood", "#wood", 12)];
        configure_profiles(&mut settings, vec!["miner".into()], &new_groups, None).unwrap();
        assert!(settings.gathering.storage_groups.is_empty());
        assert_eq!(settings.bots[0].settings.gathering.storage_groups.len(), 1);
        assert!(settings.bots[1]
            .settings
            .gathering
            .storage_groups
            .is_empty());
        configure_profiles(
            &mut settings,
            vec!["miner".into(), "farmer".into()],
            &new_groups,
            None,
        )
        .unwrap();
        assert!(settings.gathering.storage_groups.is_empty());
        assert!(settings
            .bots
            .iter()
            .all(|bot| bot.settings.gathering.storage_groups.len() == 1));
        configure_profiles(
            &mut settings,
            vec!["default".into(), "miner".into(), "farmer".into()],
            &new_groups,
            None,
        )
        .unwrap();
        assert_eq!(settings.gathering.storage_groups.len(), 1);
        assert_eq!(settings.host, "localhost");
        assert_eq!(settings.gathering.tunnel_width, 3);
        assert_eq!(settings.bots[0].settings.bot_nickname, "Miner");
    }
}
