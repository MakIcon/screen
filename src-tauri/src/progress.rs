use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

use tauri::{AppHandle, Emitter};

use crate::models::InstallProgressPayload;

#[derive(Clone)]
pub struct ProgressReporter {
    app: AppHandle,
    phase: String,
    total: usize,
    done: Arc<AtomicUsize>,
}

impl ProgressReporter {
    pub fn new(app: AppHandle, phase: impl Into<String>, total: usize) -> Self {
        Self {
            app,
            phase: phase.into(),
            total: total.max(1),
            done: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub fn emit(&self, detail: impl Into<String>) {
        let current = self.done.load(Ordering::Relaxed);
        let percent = (current as f64 / self.total as f64) * 100.0;
        let _ = self.app.emit(
            "install-progress",
            InstallProgressPayload {
                phase: self.phase.clone(),
                current,
                total: self.total,
                percent,
                detail: detail.into(),
            },
        );
    }

    pub fn step(&self, detail: impl Into<String>) {
        let current = self.done.fetch_add(1, Ordering::Relaxed) + 1;
        let percent = (current as f64 / self.total as f64) * 100.0;
        let _ = self.app.emit(
            "install-progress",
            InstallProgressPayload {
                phase: self.phase.clone(),
                current,
                total: self.total,
                percent,
                detail: detail.into(),
            },
        );
    }
}
