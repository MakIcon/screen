use crate::{
    commands::instances::is_trashed,
    paths::{launcher_root, now_string, read_instances},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};
use tokio::sync::Mutex;
use uuid::Uuid;

// Serialize filesystem transactions and preference writes, including across windows.
static BACKUP_OPERATIONS: Mutex<()> = Mutex::const_new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupWorldInfo {
    pub folder_name: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum BackupKind {
    #[default]
    Manual,
    BeforeRestore,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldBackupInfo {
    pub id: String,
    pub instance_id: String,
    pub created_at: String,
    pub world_count: usize,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub kind: BackupKind,
    #[serde(default)]
    pub worlds: Vec<BackupWorldInfo>,
    #[serde(default)]
    pub size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldBackupState {
    pub worlds: Vec<BackupWorldInfo>,
    pub backups: Vec<WorldBackupInfo>,
    pub selected_worlds: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldRestoreResult {
    pub restored_worlds: Vec<String>,
    pub safety_backup: Option<WorldBackupInfo>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupPreferences {
    excluded_worlds: Vec<String>,
}

fn backup_root(instance_id: &str) -> Result<PathBuf, String> {
    Ok(launcher_root()?.join("world-backups").join(instance_id))
}

fn is_link(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // Junctions aren't is_symlink(), but must never be traversed either.
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn real_directory(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|e| format!("Не удалось прочитать папку {}: {e}", path.display()))?;
    if !metadata.is_dir() || is_link(&metadata) {
        return Err(format!(
            "Папка {} должна быть обычной папкой, без ссылок",
            path.display()
        ));
    }
    Ok(())
}

fn valid_world_name(name: &str) -> bool {
    let mut components = Path::new(name).components();
    !name.is_empty()
        && !name.contains(['/', '\\', ':'])
        && matches!(components.next(), Some(Component::Normal(_)))
        && components.next().is_none()
}

fn read_world_preview_sync(saves: &Path, world_name: &str) -> Result<Option<Vec<u8>>, String> {
    if !valid_world_name(world_name) {
        return Err("Недопустимое имя мира".into());
    }
    real_directory(saves)?;
    let world = saves.join(world_name);
    real_directory(&world)?;
    let icon = world.join("icon.png");
    let metadata = match fs::symlink_metadata(&icon) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Не удалось прочитать превью мира: {error}")),
    };
    const MAX_PREVIEW_BYTES: u64 = 1024 * 1024;
    if !metadata.is_file() || is_link(&metadata) || metadata.len() > MAX_PREVIEW_BYTES {
        return Ok(None);
    }
    let mut bytes = Vec::new();
    fs::File::open(icon)
        .and_then(|file| file.take(MAX_PREVIEW_BYTES + 1).read_to_end(&mut bytes))
        .map_err(|error| format!("Не удалось прочитать превью мира: {error}"))?;
    // Minecraft writes a PNG screenshot here. Ignore missing/broken thumbnails
    // without preventing the user from backing up the world itself.
    if bytes.len() < 24
        || bytes.len() as u64 > MAX_PREVIEW_BYTES
        || !bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || &bytes[12..16] != b"IHDR"
    {
        return Ok(None);
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    if width == 0 || height == 0 || width > 2048 || height > 2048 {
        return Ok(None);
    }
    Ok(Some(bytes))
}

fn tree_size(source: &Path) -> Result<u64, String> {
    real_directory(source)?;
    let mut size = 0_u64;
    let mut pending = vec![source.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for entry in
            fs::read_dir(directory).map_err(|e| format!("Не удалось прочитать мир: {e}"))?
        {
            let entry = entry.map_err(|e| e.to_string())?;
            let metadata = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
            if is_link(&metadata) {
                return Err("Мир содержит символическую ссылку или junction".into());
            }
            if metadata.is_dir() {
                pending.push(entry.path());
            } else if metadata.is_file() {
                size = size.saturating_add(metadata.len());
            }
        }
    }
    Ok(size)
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    real_directory(source)?;
    fs::create_dir_all(destination).map_err(|e| format!("Не удалось создать папку копии: {e}"))?;
    let mut pending = vec![(source.to_path_buf(), destination.to_path_buf())];
    while let Some((from, to)) = pending.pop() {
        for entry in fs::read_dir(&from).map_err(|e| format!("Не удалось прочитать мир: {e}"))?
        {
            let entry = entry.map_err(|e| e.to_string())?;
            let metadata = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
            let target = to.join(entry.file_name());
            if is_link(&metadata) {
                return Err("Мир содержит символическую ссылку или junction".into());
            }
            if metadata.is_dir() {
                fs::create_dir_all(&target).map_err(|e| e.to_string())?;
                pending.push((entry.path(), target));
            } else if metadata.is_file() {
                fs::copy(entry.path(), target)
                    .map_err(|e| format!("Не удалось скопировать мир: {e}"))?;
            }
        }
    }
    Ok(())
}

fn world_folders(saves: &Path) -> Result<Vec<String>, String> {
    if !saves.exists() {
        return Ok(Vec::new());
    }
    real_directory(saves)?;
    let mut folders = Vec::new();
    for entry in fs::read_dir(saves).map_err(|e| format!("Не удалось прочитать saves: {e}"))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        if metadata.is_dir() && !is_link(&metadata) {
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| "Неподдерживаемые символы в имени папки мира".to_string())?;
            if valid_world_name(&name) {
                folders.push(name);
            }
        }
    }
    folders.sort_by_key(|name| name.to_lowercase());
    Ok(folders)
}

fn list_worlds_sync(saves: &Path) -> Result<Vec<BackupWorldInfo>, String> {
    world_folders(saves)?
        .into_iter()
        .map(|folder_name| {
            let folder = saves.join(&folder_name);
            let modified_at = fs::metadata(folder.join("level.dat"))
                .or_else(|_| fs::metadata(&folder))
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs().to_string())
                .unwrap_or_default();
            Ok(BackupWorldInfo {
                size_bytes: tree_size(&folder)?,
                folder_name,
                modified_at,
            })
        })
        .collect()
}

fn selected_names(
    available: &[String],
    requested: Option<&[String]>,
) -> Result<Vec<String>, String> {
    let selected = requested.unwrap_or(available);
    if selected.is_empty() {
        return Err("Выбери хотя бы один мир".into());
    }
    let mut seen = HashSet::new();
    for name in selected {
        if !valid_world_name(name) || !available.contains(name) {
            return Err(format!("Мир «{name}» не найден. Обнови список миров"));
        }
        if !seen.insert(name) {
            return Err("Мир выбран несколько раз".into());
        }
    }
    Ok(selected.to_vec())
}

fn ensure_world_unlocked(world: &Path) -> Result<(), String> {
    let lock = world.join("session.lock");
    if !lock.exists() {
        return Ok(());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(&lock)
            .map_err(|_| {
                format!(
                    "Мир {} занят игрой. Закрой Minecraft и повтори",
                    world.display()
                )
            })?;
    }
    Ok(())
}

fn create_backup_sync(
    instance_id: &str,
    game_dir: &Path,
    root: &Path,
    requested: Option<&[String]>,
    name: &str,
    kind: BackupKind,
) -> Result<WorldBackupInfo, String> {
    let saves = game_dir.join("saves");
    let selected = selected_names(&world_folders(&saves)?, requested)?;
    for world in &selected {
        ensure_world_unlocked(&saves.join(world))?;
    }
    fs::create_dir_all(root).map_err(|e| format!("Не удалось создать папку бекапов: {e}"))?;
    real_directory(root)?;
    let id = Uuid::new_v4().to_string();
    let pending = root.join(format!(".pending-{id}"));
    let final_path = root.join(&id);
    let result = (|| {
        for world in &selected {
            copy_tree(&saves.join(world), &pending.join("saves").join(world))?;
        }
        let worlds = list_worlds_sync(&pending.join("saves"))?;
        let info = WorldBackupInfo {
            id,
            instance_id: instance_id.to_string(),
            created_at: now_string(),
            world_count: worlds.len(),
            name: name.trim().chars().take(100).collect(),
            kind,
            size_bytes: worlds.iter().map(|world| world.size_bytes).sum(),
            worlds,
        };
        fs::write(
            pending.join("backup.json"),
            serde_json::to_vec_pretty(&info).map_err(|e| e.to_string())?,
        )
        .map_err(|e| format!("Не удалось записать описание копии: {e}"))?;
        fs::rename(&pending, &final_path)
            .map_err(|e| format!("Не удалось завершить бекап: {e}"))?;
        Ok(info)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&pending);
    }
    result
}

fn read_backup(
    instance_id: &str,
    backup_id: &str,
    root: &Path,
) -> Result<(PathBuf, WorldBackupInfo), String> {
    Uuid::parse_str(backup_id).map_err(|_| "Invalid backup id".to_string())?;
    real_directory(root)?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let backup = root.join(backup_id);
    real_directory(&backup)?;
    if backup.canonicalize().map_err(|e| e.to_string())?.parent() != Some(root.as_path()) {
        return Err("Backup path is outside this build's backups folder".into());
    }
    let mut info: WorldBackupInfo = serde_json::from_slice(
        &fs::read(backup.join("backup.json"))
            .map_err(|e| format!("Не удалось прочитать копию: {e}"))?,
    )
    .map_err(|e| format!("Не удалось прочитать описание копии: {e}"))?;
    if info.id != backup_id || info.instance_id != instance_id {
        return Err("Backup does not belong to this build".into());
    }
    // Legacy backups only recorded worldCount. Keep them usable without rewriting them.
    if info.worlds.is_empty() {
        info.worlds = list_worlds_sync(&backup.join("saves"))?;
        info.world_count = info.worlds.len();
        info.size_bytes = info.worlds.iter().map(|world| world.size_bytes).sum();
    }
    Ok((backup, info))
}

fn list_backups_sync(instance_id: &str, root: &Path) -> Result<Vec<WorldBackupInfo>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    real_directory(root)?;
    let mut backups = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| format!("Не удалось прочитать бекапы: {e}"))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let id = entry.file_name().to_string_lossy().to_string();
        if Uuid::parse_str(&id).is_ok() {
            if let Ok((_, info)) = read_backup(instance_id, &id, root) {
                backups.push(info);
            }
        }
    }
    backups.sort_by(|left, right| {
        right
            .created_at
            .parse::<u64>()
            .unwrap_or(0)
            .cmp(&left.created_at.parse::<u64>().unwrap_or(0))
            .then_with(|| right.id.cmp(&left.id))
    });
    Ok(backups)
}

fn delete_backup_sync(instance_id: &str, backup_id: &str, root: &Path) -> Result<(), String> {
    let (backup, _) = read_backup(instance_id, backup_id, root)?;
    fs::remove_dir_all(backup).map_err(|e| format!("Не удалось удалить бекап: {e}"))
}

fn read_preferences(root: &Path) -> Result<BackupPreferences, String> {
    match fs::read(root.join("selection.json")) {
        Ok(raw) => serde_json::from_slice(&raw)
            .map_err(|e| format!("Не удалось прочитать выбор миров: {e}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(BackupPreferences::default())
        }
        Err(error) => Err(format!("Не удалось прочитать выбор миров: {error}")),
    }
}

fn save_selection_sync(game_dir: &Path, root: &Path, selected: &[String]) -> Result<(), String> {
    let available = world_folders(&game_dir.join("saves"))?;
    if !selected.is_empty() {
        selected_names(&available, Some(selected))?;
    }
    let mut preferences = read_preferences(root)?;
    preferences
        .excluded_worlds
        .retain(|name| !available.contains(name));
    preferences.excluded_worlds.extend(
        available
            .into_iter()
            .filter(|name| !selected.contains(name)),
    );
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    real_directory(root)?;
    let pending = root.join(format!(".selection-{}.json", Uuid::new_v4()));
    let result = (|| {
        fs::write(
            &pending,
            serde_json::to_vec_pretty(&preferences).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        fs::rename(&pending, root.join("selection.json")).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&pending);
    }
    result.map_err(|e| format!("Не удалось сохранить выбор миров: {e}"))
}

fn backup_state_sync(
    instance_id: &str,
    game_dir: &Path,
    root: &Path,
) -> Result<WorldBackupState, String> {
    let worlds = list_worlds_sync(&game_dir.join("saves"))?;
    let excluded = read_preferences(root)?.excluded_worlds;
    let selected_worlds = worlds
        .iter()
        .filter(|world| !excluded.contains(&world.folder_name))
        .map(|world| world.folder_name.clone())
        .collect();
    Ok(WorldBackupState {
        worlds,
        backups: list_backups_sync(instance_id, root)?,
        selected_worlds,
    })
}

fn restore_backup_sync(
    instance_id: &str,
    backup_id: &str,
    game_dir: &Path,
    root: &Path,
    requested: Option<&[String]>,
) -> Result<WorldRestoreResult, String> {
    let (backup, metadata) = read_backup(instance_id, backup_id, root)?;
    let source = backup.join("saves");
    real_directory(&source)?;
    let available = metadata
        .worlds
        .iter()
        .map(|world| world.folder_name.clone())
        .collect::<Vec<_>>();
    let selected = selected_names(&available, requested)?;
    let saves = game_dir.join("saves");
    if fs::symlink_metadata(&saves).is_ok() {
        real_directory(&saves)?;
    }
    let mut overwritten = Vec::new();
    for name in &selected {
        real_directory(&source.join(name))?;
        let target = saves.join(name);
        if fs::symlink_metadata(&target).is_ok() {
            real_directory(&target)?;
            ensure_world_unlocked(&target)?;
            overwritten.push(name.clone());
        }
    }
    let staged = game_dir.join(format!(".world-restore-{}", Uuid::new_v4()));
    let incoming = staged.join("incoming");
    let previous = staged.join("previous");
    // Stage and validate every selected world before touching live data.
    let prepare = (|| {
        fs::create_dir_all(&previous).map_err(|e| e.to_string())?;
        for name in &selected {
            copy_tree(&source.join(name), &incoming.join(name))?;
            let expected = metadata
                .worlds
                .iter()
                .find(|world| &world.folder_name == name)
                .unwrap();
            if tree_size(&incoming.join(name))? != expected.size_bytes {
                return Err(format!(
                    "Копия мира «{name}» повреждена: размер файлов не совпадает"
                ));
            }
        }
        if overwritten.is_empty() {
            Ok(None)
        } else {
            create_backup_sync(
                instance_id,
                game_dir,
                root,
                Some(&overwritten),
                "Перед восстановлением",
                BackupKind::BeforeRestore,
            )
            .map(Some)
        }
    })();
    let safety_backup = match prepare {
        Ok(safety) => safety,
        Err(error) => {
            let _ = fs::remove_dir_all(&staged);
            return Err(error);
        }
    };
    let mut moved = Vec::new();
    let mut installed = Vec::new();
    let commit = (|| {
        fs::create_dir_all(&saves).map_err(|e| e.to_string())?;
        for name in &selected {
            if overwritten.contains(name) {
                fs::rename(saves.join(name), previous.join(name))
                    .map_err(|e| format!("Не удалось заменить мир «{name}»: {e}"))?;
                moved.push(name.clone());
            }
            fs::rename(incoming.join(name), saves.join(name))
                .map_err(|e| format!("Не удалось восстановить мир «{name}»: {e}"))?;
            installed.push(name.clone());
        }
        Ok::<(), String>(())
    })();
    if let Err(error) = commit {
        let mut rollback_errors = Vec::new();
        for name in installed.iter().rev() {
            if let Err(error) = fs::rename(saves.join(name), incoming.join(name)) {
                rollback_errors.push(error.to_string());
            }
        }
        for name in moved.iter().rev() {
            if let Err(error) = fs::rename(previous.join(name), saves.join(name)) {
                rollback_errors.push(error.to_string());
            }
        }
        if !rollback_errors.is_empty() {
            // Preserve originals if Windows won't release a file during rollback.
            return Err(format!(
                "{error}. Ошибка отката: {}. Исходные данные сохранены в {} и страховочной копии",
                rollback_errors.join("; "),
                staged.display()
            ));
        }
        let _ = fs::remove_dir_all(&staged);
        return Err(error);
    }
    let _ = fs::remove_dir_all(&staged);
    Ok(WorldRestoreResult {
        restored_worlds: selected,
        safety_backup,
    })
}

async fn active_game_dir(instance_id: &str) -> Result<PathBuf, String> {
    read_instances()
        .await?
        .into_iter()
        .find(|item| item.id == instance_id && !is_trashed(item))
        .map(|item| PathBuf::from(item.game_dir))
        .ok_or_else(|| "Сборка не найдена".into())
}

#[tauri::command]
pub async fn load_world_preview(
    instance_id: String,
    world_name: String,
    backup_id: Option<String>,
) -> Result<Option<Vec<u8>>, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let guard = BACKUP_OPERATIONS.lock().await;
        let game_dir = active_game_dir(&instance_id).await?;
        let root = backup_root(&instance_id)?;
        tokio::task::spawn_blocking(move || {
            let _guard = guard;
            let saves = match backup_id {
                Some(id) => read_backup(&instance_id, &id, &root)?.0.join("saves"),
                None => game_dir.join("saves"),
            };
            read_world_preview_sync(&saves, &world_name)
        })
        .await
        .map_err(|error| format!("world preview task error: {error}"))?
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn get_world_backup_state(
    instance_id: String,
) -> Result<WorldBackupState, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let guard = BACKUP_OPERATIONS.lock().await;
        let game_dir = active_game_dir(&instance_id).await?;
        let root = backup_root(&instance_id)?;
        tokio::task::spawn_blocking(move || {
            let _guard = guard;
            backup_state_sync(&instance_id, &game_dir, &root)
        })
        .await
        .map_err(|e| format!("backup list task error: {e}"))?
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn set_world_backup_selection(
    instance_id: String,
    world_names: Vec<String>,
) -> Result<(), crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let guard = BACKUP_OPERATIONS.lock().await;
        let game_dir = active_game_dir(&instance_id).await?;
        let root = backup_root(&instance_id)?;
        tokio::task::spawn_blocking(move || {
            let _guard = guard;
            save_selection_sync(&game_dir, &root, &world_names)
        })
        .await
        .map_err(|e| format!("backup selection task error: {e}"))?
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn create_world_backup(
    instance_id: String,
    world_names: Option<Vec<String>>,
    name: Option<String>,
) -> Result<WorldBackupInfo, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let guard = BACKUP_OPERATIONS.lock().await;
        let game_dir = active_game_dir(&instance_id).await?;
        let root = backup_root(&instance_id)?;
        tokio::task::spawn_blocking(move || {
            let _guard = guard;
            create_backup_sync(
                &instance_id,
                &game_dir,
                &root,
                world_names.as_deref(),
                name.as_deref().unwrap_or_default(),
                BackupKind::Manual,
            )
        })
        .await
        .map_err(|e| format!("backup task error: {e}"))?
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn list_world_backups(
    instance_id: String,
) -> Result<Vec<WorldBackupInfo>, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let guard = BACKUP_OPERATIONS.lock().await;
        active_game_dir(&instance_id).await?;
        let root = backup_root(&instance_id)?;
        tokio::task::spawn_blocking(move || {
            let _guard = guard;
            list_backups_sync(&instance_id, &root)
        })
        .await
        .map_err(|e| format!("backup list task error: {e}"))?
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn delete_world_backup(
    instance_id: String,
    backup_id: String,
) -> Result<(), crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let guard = BACKUP_OPERATIONS.lock().await;
        active_game_dir(&instance_id).await?;
        let root = backup_root(&instance_id)?;
        tokio::task::spawn_blocking(move || {
            let _guard = guard;
            delete_backup_sync(&instance_id, &backup_id, &root)
        })
        .await
        .map_err(|e| format!("backup deletion task error: {e}"))?
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[tauri::command]
pub async fn restore_world_backup(
    instance_id: String,
    backup_id: String,
    world_names: Option<Vec<String>>,
) -> Result<WorldRestoreResult, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let guard = BACKUP_OPERATIONS.lock().await;
        let game_dir = active_game_dir(&instance_id).await?;
        let root = backup_root(&instance_id)?;
        tokio::task::spawn_blocking(move || {
            let _guard = guard;
            restore_backup_sync(
                &instance_id,
                &backup_id,
                &game_dir,
                &root,
                world_names.as_deref(),
            )
        })
        .await
        .map_err(|e| format!("restore task error: {e}"))?
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture {
        root: PathBuf,
        game: PathBuf,
        backups: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("screen-backups-{}", Uuid::new_v4()));
            Self {
                game: root.join("game"),
                backups: root.join("backups"),
                root,
            }
        }
        fn world(&self, name: &str, content: &[u8]) {
            fs::create_dir_all(self.game.join("saves").join(name)).unwrap();
            fs::write(
                self.game.join("saves").join(name).join("level.dat"),
                content,
            )
            .unwrap();
        }
        fn backup(&self, names: Option<&[String]>) -> WorldBackupInfo {
            create_backup_sync(
                "inst-test",
                &self.game,
                &self.backups,
                names,
                "",
                BackupKind::Manual,
            )
            .unwrap()
        }
        fn restore(&self, id: &str, names: Option<&[String]>) -> WorldRestoreResult {
            restore_backup_sync("inst-test", id, &self.game, &self.backups, names).unwrap()
        }
        fn content(&self, name: &str) -> Vec<u8> {
            fs::read(self.game.join("saves").join(name).join("level.dat")).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn world_preview_uses_the_minecraft_icon_and_survives_in_backups() {
        let f = Fixture::new();
        f.world("world", b"save");
        let png = include_bytes!("../../icons/32x32.png");
        fs::write(f.game.join("saves/world/icon.png"), png).unwrap();
        assert_eq!(
            read_world_preview_sync(&f.game.join("saves"), "world")
                .unwrap()
                .unwrap(),
            png
        );
        let backup = f.backup(None);
        fs::remove_file(f.game.join("saves/world/icon.png")).unwrap();
        assert!(read_world_preview_sync(&f.game.join("saves"), "world")
            .unwrap()
            .is_none());
        assert_eq!(
            read_world_preview_sync(&f.backups.join(backup.id).join("saves"), "world")
                .unwrap()
                .unwrap(),
            png
        );
    }

    #[test]
    fn world_preview_rejects_invalid_paths_and_ignores_invalid_images() {
        let f = Fixture::new();
        f.world("world", b"save");
        for name in ["..", "../world", "..\\world", "C:\\world"] {
            assert!(read_world_preview_sync(&f.game.join("saves"), name).is_err());
        }
        let icon = f.game.join("saves/world/icon.png");
        fs::write(&icon, b"not a png").unwrap();
        assert!(read_world_preview_sync(&f.game.join("saves"), "world")
            .unwrap()
            .is_none());
        fs::File::create(&icon)
            .unwrap()
            .set_len(1024 * 1024 + 1)
            .unwrap();
        assert!(read_world_preview_sync(&f.game.join("saves"), "world")
            .unwrap()
            .is_none());
        assert_eq!(f.content("world"), b"save");
    }

    #[test]
    fn restores_live_files_and_identifies_the_safety_copy() {
        let f = Fixture::new();
        f.world("world", b"before");
        let backup = f.backup(None);
        f.world("world", b"after");
        fs::write(f.game.join("saves/world/new-region.mca"), b"must disappear").unwrap();
        let result = f.restore(&backup.id, None);
        assert_eq!(f.content("world"), b"before");
        assert!(!f.game.join("saves/world/new-region.mca").exists());
        let safety = result.safety_backup.unwrap();
        assert_eq!(safety.kind, BackupKind::BeforeRestore);
        assert_eq!(
            fs::read(f.backups.join(safety.id).join("saves/world/level.dat")).unwrap(),
            b"after"
        );
        assert_eq!(list_backups_sync("inst-test", &f.backups).unwrap().len(), 2);
        assert_eq!(result.restored_worlds, ["world"]);
    }

    #[test]
    fn backs_up_only_selected_worlds_and_records_contents_and_size() {
        let f = Fixture::new();
        f.world("survival", b"one");
        f.world("creative", b"two");
        let backup = f.backup(Some(&["survival".into()]));
        assert_eq!(backup.world_count, 1);
        assert_eq!(backup.size_bytes, 3);
        assert_eq!(backup.worlds[0].folder_name, "survival");
        assert!(!f.backups.join(backup.id).join("saves/creative").exists());
    }

    #[test]
    fn partial_restore_preserves_other_worlds_and_only_protects_overwritten_worlds() {
        let f = Fixture::new();
        f.world("survival", b"old survival");
        f.world("creative", b"old creative");
        let backup = f.backup(None);
        f.world("survival", b"current survival");
        f.world("creative", b"current creative");
        f.world("new-world", b"unrelated");
        let result = f.restore(&backup.id, Some(&["survival".into()]));
        assert_eq!(f.content("survival"), b"old survival");
        assert_eq!(f.content("creative"), b"current creative");
        assert_eq!(f.content("new-world"), b"unrelated");
        assert_eq!(
            result.safety_backup.unwrap().worlds[0].folder_name,
            "survival"
        );
    }

    #[test]
    fn restores_a_missing_world_without_an_unnecessary_safety_copy() {
        let f = Fixture::new();
        f.world("world", b"saved");
        let backup = f.backup(None);
        fs::remove_dir_all(f.game.join("saves")).unwrap();
        let result = f.restore(&backup.id, None);
        assert_eq!(f.content("world"), b"saved");
        assert!(result.safety_backup.is_none());
        assert_eq!(list_backups_sync("inst-test", &f.backups).unwrap().len(), 1);
    }

    #[test]
    fn legacy_backups_remain_listable_and_restorable() {
        let f = Fixture::new();
        f.world("world", b"legacy");
        let backup = f.backup(None);
        fs::write(
            f.backups.join(&backup.id).join("backup.json"),
            serde_json::to_vec(&serde_json::json!({
                "id": backup.id, "instanceId": "inst-test", "createdAt": "99", "worldCount": 1
            }))
            .unwrap(),
        )
        .unwrap();
        let listed = list_backups_sync("inst-test", &f.backups).unwrap();
        assert_eq!(listed[0].worlds[0].folder_name, "world");
        f.world("world", b"current");
        f.restore(&backup.id, None);
        assert_eq!(f.content("world"), b"legacy");
    }

    #[test]
    fn remembers_exclusions_and_selects_new_worlds_by_default() {
        let f = Fixture::new();
        f.world("survival", b"one");
        f.world("creative", b"two");
        save_selection_sync(&f.game, &f.backups, &["survival".into()]).unwrap();
        save_selection_sync(&f.game, &f.backups, &["survival".into()]).unwrap();
        f.world("new-world", b"three");
        assert_eq!(
            backup_state_sync("inst-test", &f.game, &f.backups)
                .unwrap()
                .selected_worlds,
            ["new-world", "survival"]
        );
        save_selection_sync(&f.game, &f.backups, &[]).unwrap();
        assert!(backup_state_sync("inst-test", &f.game, &f.backups)
            .unwrap()
            .selected_worlds
            .is_empty());
    }

    #[test]
    fn refuses_empty_duplicate_unknown_and_traversing_selections_without_changing_files() {
        let f = Fixture::new();
        f.world("world", b"keep");
        let backup = f.backup(None);
        for names in [
            vec![],
            vec!["..".into()],
            vec!["../world".into()],
            vec!["..\\world".into()],
            vec!["missing".into()],
            vec!["world".into(), "world".into()],
        ] {
            assert!(create_backup_sync(
                "inst-test",
                &f.game,
                &f.backups,
                Some(&names),
                "",
                BackupKind::Manual
            )
            .is_err());
            assert!(restore_backup_sync(
                "inst-test",
                &backup.id,
                &f.game,
                &f.backups,
                Some(&names)
            )
            .is_err());
        }
        assert_eq!(f.content("world"), b"keep");
        assert_eq!(list_backups_sync("inst-test", &f.backups).unwrap().len(), 1);
    }

    #[test]
    fn damaged_backup_does_not_change_worlds_or_create_a_safety_copy() {
        let f = Fixture::new();
        f.world("one", b"saved one");
        f.world("two", b"saved two");
        let backup = f.backup(None);
        fs::remove_file(f.backups.join(&backup.id).join("saves/two/level.dat")).unwrap();
        f.world("one", b"current one");
        assert!(restore_backup_sync("inst-test", &backup.id, &f.game, &f.backups, None).is_err());
        assert_eq!(f.content("one"), b"current one");
        assert_eq!(list_backups_sync("inst-test", &f.backups).unwrap().len(), 1);
    }

    #[test]
    fn deletes_only_selected_backup_and_refuses_invalid_or_mismatched_ids() {
        let f = Fixture::new();
        f.world("world", b"keep");
        let selected = f.backup(None);
        let other = f.backup(None);
        for invalid in ["", "..", "../game", "..\\game", "C:\\", "/"] {
            assert_eq!(
                delete_backup_sync("inst-test", invalid, &f.backups).unwrap_err(),
                "Invalid backup id"
            );
            assert!(restore_backup_sync("inst-test", invalid, &f.game, &f.backups, None).is_err());
        }
        assert!(delete_backup_sync("inst-test", &Uuid::new_v4().to_string(), &f.backups).is_err());
        assert_eq!(
            delete_backup_sync("another-build", &selected.id, &f.backups).unwrap_err(),
            "Backup does not belong to this build"
        );
        delete_backup_sync("inst-test", &selected.id, &f.backups).unwrap();
        assert_eq!(
            list_backups_sync("inst-test", &f.backups).unwrap()[0].id,
            other.id
        );
        assert_eq!(f.content("world"), b"keep");
    }

    #[cfg(windows)]
    #[test]
    fn refuses_a_world_locked_by_minecraft() {
        use std::os::windows::fs::OpenOptionsExt;
        let f = Fixture::new();
        f.world("world", b"keep");
        let backup = f.backup(None);
        let _lock = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .share_mode(0)
            .open(f.game.join("saves/world/session.lock"))
            .unwrap();
        assert!(create_backup_sync(
            "inst-test",
            &f.game,
            &f.backups,
            None,
            "",
            BackupKind::Manual
        )
        .is_err());
        assert!(restore_backup_sync("inst-test", &backup.id, &f.game, &f.backups, None).is_err());
        assert_eq!(f.content("world"), b"keep");
    }

    #[cfg(windows)]
    #[test]
    fn rolls_back_already_restored_worlds_if_a_later_replacement_fails() {
        use std::os::windows::fs::OpenOptionsExt;
        let f = Fixture::new();
        f.world("one", b"old one");
        f.world("two", b"old two");
        let backup = f.backup(None);
        f.world("one", b"current one");
        f.world("two", b"current two");
        // Allow reading for the safety copy, but prevent Windows from renaming world two.
        let _lock = fs::OpenOptions::new()
            .read(true)
            .share_mode(3)
            .open(f.game.join("saves/two/level.dat"))
            .unwrap();
        assert!(restore_backup_sync("inst-test", &backup.id, &f.game, &f.backups, None).is_err());
        assert_eq!(f.content("one"), b"current one");
        assert_eq!(f.content("two"), b"current two");
        assert_eq!(list_backups_sync("inst-test", &f.backups).unwrap().len(), 2);
    }
}
