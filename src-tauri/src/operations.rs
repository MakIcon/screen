//! Cross-window task lifetime and the exclusive launcher-update reservation.
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock, Weak},
};
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub kind: String,
    pub instance_id: Option<String>,
}

#[derive(Default)]
struct Registry {
    active: HashMap<String, Operation>,
    update: Option<String>,
}

fn registry() -> &'static Mutex<Registry> {
    static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(Registry::default()))
}

#[must_use]
pub struct OperationGuard(String);

impl Drop for OperationGuard {
    fn drop(&mut self) {
        registry()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .active
            .remove(&self.0);
    }
}

pub fn begin(kind: &str, instance_id: Option<&str>) -> Result<OperationGuard, String> {
    let mut registry = registry().lock().unwrap_or_else(|e| e.into_inner());
    if registry.update.is_some() {
        return Err("Launcher update is being installed; try again after restarting".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    registry.active.insert(
        id.clone(),
        Operation {
            id: id.clone(),
            kind: kind.into(),
            instance_id: instance_id.map(str::to_owned),
        },
    );
    Ok(OperationGuard(id))
}

/// Acquire before the index lock. All filesystem changes for a build use this
/// same lock, including exports, imports, content changes, and world backups.
pub async fn lock_instance(id: &str) -> OwnedMutexGuard<()> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Weak<AsyncMutex<()>>>>> = OnceLock::new();
    let lock = {
        let mut locks = LOCKS
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        locks.retain(|_, lock| lock.strong_count() > 0);
        match locks.get(id).and_then(Weak::upgrade) {
            Some(lock) => lock,
            None => {
                let lock = Arc::new(AsyncMutex::new(()));
                locks.insert(id.to_owned(), Arc::downgrade(&lock));
                lock
            }
        }
    };
    lock.lock_owned().await
}

#[tauri::command]
pub fn get_active_operations() -> Vec<Operation> {
    registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .active
        .values()
        .cloned()
        .collect()
}

#[tauri::command]
pub fn prepare_launcher_update() -> Option<String> {
    let mut registry = registry().lock().unwrap_or_else(|e| e.into_inner());
    if registry.update.is_some() || !registry.active.is_empty() {
        return None;
    }
    let token = uuid::Uuid::new_v4().to_string();
    registry.update = Some(token.clone());
    Some(token)
}

#[tauri::command]
pub fn finish_launcher_update(token: String) {
    let mut registry = registry().lock().unwrap_or_else(|e| e.into_inner());
    if registry.update.as_ref() == Some(&token) {
        registry.update = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn update_reservation_waits_for_tasks_and_blocks_new_tasks_until_released() {
        let operation = begin("import", Some("registry-test")).unwrap();
        assert!(get_active_operations()
            .iter()
            .any(|entry| entry.id == operation.0));
        assert!(prepare_launcher_update().is_none());
        drop(operation);
        let token = prepare_launcher_update().unwrap();
        assert!(begin("backup", None).is_err());
        assert!(prepare_launcher_update().is_none());
        finish_launcher_update("wrong-token".into());
        assert!(begin("install", None).is_err());
        finish_launcher_update(token);
        let (started, ready) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            let operation = begin("content", None).unwrap();
            started.send(operation.0.clone()).unwrap();
            std::future::pending::<()>().await;
            drop(operation);
        });
        let id = ready.await.unwrap();
        assert!(prepare_launcher_update().is_none());
        task.abort();
        let _ = task.await;
        assert!(!get_active_operations().iter().any(|entry| entry.id == id));
        let token = prepare_launcher_update().unwrap();
        finish_launcher_update(token);
    }

    #[tokio::test]
    async fn same_build_is_serialized_while_other_builds_can_work() {
        let id = uuid::Uuid::new_v4().to_string();
        let first = lock_instance(&id).await;
        let mut second = Box::pin(lock_instance(&id));
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), &mut second)
                .await
                .is_err()
        );
        let other = lock_instance("independent-build").await;
        drop(other);
        drop(first);
        let _second = tokio::time::timeout(std::time::Duration::from_secs(1), second)
            .await
            .unwrap();
    }
}
