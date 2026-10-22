use crate::commands::errors::{CommandError, ErrorCode};
use std::{thread, time::Duration};

use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, WebviewWindow};

use crate::models::PhasePayload;

const UNFOLD_READY_DELAY: Duration = Duration::from_millis(1200);

#[tauri::command]
pub fn start_gallery_unfold(window: WebviewWindow) -> Result<(), CommandError> {
    let result: Result<_, CommandError> = (|| {
        let scale = window.scale_factor().unwrap_or(1.0);
        let monitor = window
            .primary_monitor()
            .ok()
            .flatten()
            .ok_or(CommandError::new(
                ErrorCode::InvalidInput,
                "Monitor not found",
            ))?;
        let screen = monitor.size().to_logical::<f64>(scale);

        let final_w = (screen.width * 0.7).clamp(900.0, 1280.0);
        let final_h = (screen.height * 0.75).clamp(620.0, 860.0);
        let center_x = screen.width / 2.0;
        let center_y = screen.height / 2.0;
        let win = window.clone();

        // Keep the webview at its final size for the entire opening animation.
        // Repeated native resizes force WebView2 to reflow and repaint on every
        // frame, which makes the right edge visibly trail behind the window.
        window
            .set_size(LogicalSize::new(final_w, final_h))
            .map_err(|error| {
                let detail = format!("Failed to size window: {error}");
                CommandError::from(error).context(detail)
            })?;
        window
            .set_position(LogicalPosition::new(
                center_x - final_w / 2.0,
                center_y - final_h / 2.0,
            ))
            .map_err(|error| {
                let detail = format!("Failed to position window: {error}");
                CommandError::from(error).context(detail)
            })?;
        window
            .emit("window-phase", PhasePayload { phase: "unfolding" })
            .map_err(|error| {
                let detail = format!("Failed to start window animation: {error}");
                CommandError::from(error).context(detail)
            })?;
        window.show().map_err(|error| {
            let detail = format!("Failed to show window: {error}");
            CommandError::from(error).context(detail)
        })?;

        thread::spawn(move || {
            thread::sleep(UNFOLD_READY_DELAY);
            let _ = win.emit("window-phase", PhasePayload { phase: "ready" });
        });

        Ok(())
    })();
    result
}

#[tauri::command]
pub fn exit_launcher(app: AppHandle) {
    app.exit(0);
}
