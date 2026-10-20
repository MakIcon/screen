use std::{
    collections::{HashMap, HashSet},
    future::Future,
    sync::OnceLock,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{watch, Mutex};

pub const IMPORT_CANCELLED: &str = "IMPORT_CANCELLED";
const PROGRESS_EVENT: &str = "build-import-progress";

#[derive(Default)]
struct ImportRegistry {
    active: HashMap<String, watch::Sender<bool>>,
    pending_cancel: HashSet<String>,
}
type ActiveImports = Mutex<ImportRegistry>;
static ACTIVE_IMPORTS: OnceLock<ActiveImports> = OnceLock::new();

fn active_imports() -> &'static ActiveImports {
    ACTIVE_IMPORTS.get_or_init(|| Mutex::new(ImportRegistry::default()))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportProgressPayload {
    operation_id: String,
    stage: &'static str,
    processed: usize,
    total: usize,
    filename: String,
}

#[derive(Clone)]
pub struct ImportContext {
    app: AppHandle,
    operation_id: String,
    cancel: watch::Receiver<bool>,
}

impl ImportContext {
    pub async fn start(app: AppHandle, operation_id: String) -> Result<Self, String> {
        if operation_id.trim().is_empty() {
            return Err("Import operation id is empty".to_string());
        }
        let mut active = active_imports().lock().await;
        if active.active.contains_key(&operation_id) {
            return Err("Import operation is already active".to_string());
        }
        let initially_cancelled = active.pending_cancel.remove(&operation_id);
        let (sender, cancel) = watch::channel(initially_cancelled);
        active.active.insert(operation_id.clone(), sender);
        drop(active);
        let context = Self {
            app,
            operation_id,
            cancel,
        };
        context.emit("preparing", 0, 0, "");
        Ok(context)
    }

    pub async fn finish(&self) {
        active_imports()
            .lock()
            .await
            .active
            .remove(&self.operation_id);
    }

    pub fn check(&self) -> Result<(), String> {
        if *self.cancel.borrow() {
            Err(IMPORT_CANCELLED.to_string())
        } else {
            Ok(())
        }
    }

    pub fn emit(&self, stage: &'static str, processed: usize, total: usize, filename: &str) {
        let _ = self.app.emit(
            PROGRESS_EVENT,
            ImportProgressPayload {
                operation_id: self.operation_id.clone(),
                stage,
                processed,
                total,
                filename: filename.to_string(),
            },
        );
    }

    async fn cancelled(&self) {
        let mut receiver = self.cancel.clone();
        if *receiver.borrow() {
            return;
        }
        while receiver.changed().await.is_ok() {
            if *receiver.borrow() {
                return;
            }
        }
    }

    pub async fn run<T>(
        &self,
        future: impl Future<Output = Result<T, String>>,
    ) -> Result<T, String> {
        self.check()?;
        tokio::select! {
            result = future => result,
            _ = self.cancelled() => Err(IMPORT_CANCELLED.to_string()),
        }
    }
}

#[tauri::command]
pub async fn cancel_import(
    operation_id: String,
) -> Result<(), crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        if operation_id.trim().is_empty() {
            return Err("Import operation id is empty".to_string());
        }
        let mut registry = active_imports().lock().await;
        if let Some(sender) = registry.active.get(&operation_id) {
            return sender
                .send(true)
                .map_err(|_| "Import is no longer active".to_string());
        }
        // The user can click Cancel before the import command has registered.
        if registry.pending_cancel.len() >= 128 {
            registry.pending_cancel.clear();
        }
        registry.pending_cancel.insert(operation_id);
        Ok(())
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}
