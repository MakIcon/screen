use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    commands::instances::is_trashed,
    paths::{launcher_root, now_string, read_instances},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldBackupInfo {
    pub id: String,
    pub instance_id: String,
    pub created_at: String,
    pub world_count: usize,
}

fn backup_root(instance_id: &str) -> Result<PathBuf, String> {
    Ok(launcher_root()?.join("world-backups").join(instance_id))
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|e| format!("create backup directory error: {e}"))?;
    let mut pending = vec![(source.to_path_buf(), destination.to_path_buf())];
    while let Some((from, to)) = pending.pop() {
        for entry in fs::read_dir(&from).map_err(|e| format!("read world directory error: {e}"))? {
            let entry = entry.map_err(|e| format!("read world entry error: {e}"))?;
            let file_type = entry
                .file_type()
                .map_err(|e| format!("read world type error: {e}"))?;
            let target = to.join(entry.file_name());
            if file_type.is_symlink() {
                return Err("World backup cannot contain symbolic links".into());
            }
            if file_type.is_dir() {
                fs::create_dir_all(&target)
                    .map_err(|e| format!("create world directory error: {e}"))?;
                pending.push((entry.path(), target));
            } else if file_type.is_file() {
                fs::copy(entry.path(), target)
                    .map_err(|e| format!("copy world file error: {e}"))?;
            }
        }
    }
    Ok(())
}

fn world_count(saves: &Path) -> Result<usize, String> {
    let mut count = 0;
    for entry in fs::read_dir(saves).map_err(|e| format!("read saves error: {e}"))? {
        let entry = entry.map_err(|e| format!("read save entry error: {e}"))?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            count += 1;
        }
    }
    Ok(count)
}

fn create_backup_sync(
    instance_id: &str,
    game_dir: &Path,
    root: &Path,
) -> Result<WorldBackupInfo, String> {
    let saves = game_dir.join("saves");
    if !saves.is_dir() {
        return Err("There are no worlds to back up".into());
    }
    let count = world_count(&saves)?;
    if count == 0 {
        return Err("There are no worlds to back up".into());
    }
    fs::create_dir_all(root).map_err(|e| format!("create backups folder error: {e}"))?;
    let id = Uuid::new_v4().to_string();
    let pending = root.join(format!(".pending-{id}"));
    let final_path = root.join(&id);
    let info = WorldBackupInfo {
        id,
        instance_id: instance_id.to_string(),
        created_at: now_string(),
        world_count: count,
    };
    let result = (|| {
        copy_tree(&saves, &pending.join("saves"))?;
        let metadata = serde_json::to_vec_pretty(&info).map_err(|e| e.to_string())?;
        fs::write(pending.join("backup.json"), metadata)
            .map_err(|e| format!("write backup metadata error: {e}"))?;
        fs::rename(&pending, &final_path).map_err(|e| format!("finish backup error: {e}"))
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&pending);
    }
    result.map(|_| info)
}

fn list_backups_sync(instance_id: &str, root: &Path) -> Result<Vec<WorldBackupInfo>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut backups = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| format!("read backups error: {e}"))? {
        let entry = entry.map_err(|e| format!("read backup entry error: {e}"))?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let Ok(raw) = fs::read(entry.path().join("backup.json")) else {
            continue;
        };
        let Ok(info) = serde_json::from_slice::<WorldBackupInfo>(&raw) else {
            continue;
        };
        if info.instance_id == instance_id && info.id == entry.file_name().to_string_lossy() {
            backups.push(info);
        }
    }
    backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(backups)
}

fn restore_backup_sync(
    instance_id: &str,
    backup_id: &str,
    game_dir: &Path,
    root: &Path,
) -> Result<(), String> {
    Uuid::parse_str(backup_id).map_err(|_| "Invalid backup id".to_string())?;
    let backup = root.join(backup_id);
    let metadata: WorldBackupInfo = serde_json::from_slice(
        &fs::read(backup.join("backup.json")).map_err(|e| format!("read backup error: {e}"))?,
    )
    .map_err(|e| format!("parse backup error: {e}"))?;
    if metadata.id != backup_id
        || metadata.instance_id != instance_id
        || !backup.join("saves").is_dir()
    {
        return Err("Backup does not belong to this build".into());
    }

    let saves = game_dir.join("saves");
    if saves.exists() && !saves.is_dir() {
        return Err("The saves path is not a directory".into());
    }
    if saves.is_dir() && world_count(&saves)? > 0 {
        create_backup_sync(instance_id, game_dir, root)?;
    }
    let nonce = Uuid::new_v4();
    let staged = game_dir.join(format!(".saves-restore-{nonce}"));
    let previous = game_dir.join(format!(".saves-previous-{nonce}"));
    if let Err(error) = copy_tree(&backup.join("saves"), &staged) {
        let _ = fs::remove_dir_all(&staged);
        return Err(error);
    }
    let had_saves = saves.exists();
    if had_saves {
        if let Err(error) = fs::rename(&saves, &previous) {
            let _ = fs::remove_dir_all(&staged);
            return Err(format!("stage current worlds error: {error}"));
        }
    }
    if let Err(error) = fs::rename(&staged, &saves) {
        if had_saves {
            if let Err(rollback_error) = fs::rename(&previous, &saves) {
                return Err(format!("restore worlds error: {error}; could not put the original saves folder back: {rollback_error}"));
            }
        }
        let _ = fs::remove_dir_all(&staged);
        return Err(format!("restore worlds error: {error}"));
    }
    if had_saves {
        let _ = fs::remove_dir_all(previous);
    }
    Ok(())
}

async fn active_game_dir(instance_id: &str) -> Result<PathBuf, String> {
    read_instances()
        .await?
        .into_iter()
        .find(|item| item.id == instance_id && !is_trashed(item))
        .map(|item| PathBuf::from(item.game_dir))
        .ok_or_else(|| "Build not found".into())
}

#[tauri::command]
pub async fn create_world_backup(instance_id: String) -> Result<WorldBackupInfo, String> {
    let game_dir = active_game_dir(&instance_id).await?;
    let root = backup_root(&instance_id)?;
    tokio::task::spawn_blocking(move || create_backup_sync(&instance_id, &game_dir, &root))
        .await
        .map_err(|e| format!("backup task error: {e}"))?
}

#[tauri::command]
pub async fn list_world_backups(instance_id: String) -> Result<Vec<WorldBackupInfo>, String> {
    active_game_dir(&instance_id).await?;
    let root = backup_root(&instance_id)?;
    tokio::task::spawn_blocking(move || list_backups_sync(&instance_id, &root))
        .await
        .map_err(|e| format!("backup list task error: {e}"))?
}

#[tauri::command]
pub async fn restore_world_backup(instance_id: String, backup_id: String) -> Result<(), String> {
    let game_dir = active_game_dir(&instance_id).await?;
    let root = backup_root(&instance_id)?;
    tokio::task::spawn_blocking(move || {
        restore_backup_sync(&instance_id, &backup_id, &game_dir, &root)
    })
    .await
    .map_err(|e| format!("restore task error: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::{create_backup_sync, list_backups_sync, restore_backup_sync};
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn creates_and_restores_worlds_with_safety_copy() {
        let root = std::env::temp_dir().join(format!("screen-backups-{}", Uuid::new_v4()));
        let game = root.join("game");
        let backups = root.join("backups");
        fs::create_dir_all(game.join("saves/world")).unwrap();
        fs::write(game.join("saves/world/level.dat"), b"before").unwrap();
        let original = create_backup_sync("inst-test", &game, &backups).unwrap();
        fs::write(game.join("saves/world/level.dat"), b"after").unwrap();
        restore_backup_sync("inst-test", &original.id, &game, &backups).unwrap();
        assert_eq!(
            fs::read(game.join("saves/world/level.dat")).unwrap(),
            b"before"
        );
        assert_eq!(list_backups_sync("inst-test", &backups).unwrap().len(), 2);
        fs::remove_dir_all(root).unwrap();
    }
}
