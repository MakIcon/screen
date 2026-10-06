use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter};

use crate::models::InstallProgressPayload;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Default)]
struct ProgressState {
    done: usize,
    last_emitted: Option<Instant>,
}
impl ProgressState {
    fn advance(&mut self, total: usize, now: Instant) -> Option<usize> {
        self.done = (self.done + 1).min(total);
        if self.done == total
            || self
                .last_emitted
                .is_none_or(|last| now.duration_since(last) >= PROGRESS_INTERVAL)
        {
            self.last_emitted = Some(now);
            Some(self.done)
        } else {
            None
        }
    }
}
#[derive(Clone)]
pub struct ProgressReporter {
    app: AppHandle,
    phase: String,
    total: usize,
    state: Arc<Mutex<ProgressState>>,
}
impl ProgressReporter {
    pub fn new(app: AppHandle, phase: impl Into<String>, total: usize) -> Self {
        Self {
            app,
            phase: phase.into(),
            total: total.max(1),
            state: Arc::new(Mutex::new(ProgressState::default())),
        }
    }
    fn send(&self, current: usize, detail: String) {
        let _ = self.app.emit(
            "install-progress",
            InstallProgressPayload {
                phase: self.phase.clone(),
                current,
                total: self.total,
                percent: current as f64 / self.total as f64 * 100.0,
                detail,
            },
        );
    }
    pub fn emit(&self, detail: impl Into<String>) {
        if let Ok(mut state) = self.state.lock() {
            state.last_emitted = Some(Instant::now());
            self.send(state.done, detail.into());
        }
    }
    pub fn step(&self, detail: impl Into<String>) {
        // Serialize the counter and emissions so concurrent workers cannot send 99% after 100%.
        if let Ok(mut state) = self.state.lock() {
            if let Some(current) = state.advance(self.total, Instant::now()) {
                self.send(current, detail.into());
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn throttles_a_burst_and_always_reports_completion() {
        let now = Instant::now();
        let mut state = ProgressState {
            done: 0,
            last_emitted: Some(now),
        };
        for _ in 0..999 {
            assert_eq!(state.advance(1000, now), None);
        }
        assert_eq!(state.advance(1000, now), Some(1000));
    }
    #[test]
    fn reports_intermediate_progress_at_the_interval() {
        let now = Instant::now();
        let mut state = ProgressState::default();
        assert_eq!(state.advance(100, now), Some(1));
        assert_eq!(state.advance(100, now + Duration::from_millis(149)), None);
        assert_eq!(state.advance(100, now + PROGRESS_INTERVAL), Some(3));
        assert_eq!(state.advance(100, now + PROGRESS_INTERVAL), None);
    }
}
