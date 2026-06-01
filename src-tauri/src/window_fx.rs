use std::{
    thread,
    time::{Duration, Instant},
};

use tauri::{Emitter, LogicalPosition, LogicalSize, WebviewWindow};

use crate::models::PhasePayload;

fn ease_in_out_expo(x: f64) -> f64 {
    if x == 0.0 {
        0.0
    } else if x == 1.0 {
        1.0
    } else if x < 0.5 {
        2.0f64.powf(20.0 * x - 10.0) / 2.0
    } else {
        (2.0 - 2.0f64.powf(-20.0 * x + 10.0)) / 2.0
    }
}

#[tauri::command]
pub fn start_gallery_unfold(window: WebviewWindow) -> Result<(), String> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let monitor = window
        .primary_monitor()
        .ok()
        .flatten()
        .ok_or("Monitor not found")?;
    let screen = monitor.size().to_logical::<f64>(scale);

    let final_w = (screen.width * 0.7).clamp(900.0, 1280.0);
    let final_h = (screen.height * 0.75).clamp(620.0, 860.0);
    let center_x = screen.width / 2.0;
    let center_y = screen.height / 2.0;
    let win = window.clone();

    thread::spawn(move || {
        let start = Instant::now();
        let duration_h = 500.0;
        let duration_w = 700.0;

        let _ = win.set_size(LogicalSize::new(4.0, 10.0));
        let _ = win.set_position(LogicalPosition::new(center_x - 2.0, center_y - 5.0));
        let _ = win.show();

        loop {
            let elapsed = start.elapsed().as_millis() as f64;

            if elapsed <= duration_h {
                let t = ease_in_out_expo(elapsed / duration_h);
                let h = (final_h * t).max(10.0);
                let _ = win.set_size(LogicalSize::new(4.0, h));
                let _ = win.set_position(LogicalPosition::new(center_x - 2.0, center_y - h / 2.0));
            } else if elapsed <= duration_h + duration_w {
                let t = ease_in_out_expo((elapsed - duration_h) / duration_w);
                let w = (final_w * t).max(4.0);
                let _ = win.set_size(LogicalSize::new(w, final_h));
                let _ = win.set_position(LogicalPosition::new(
                    center_x - w / 2.0,
                    center_y - final_h / 2.0,
                ));
                let _ = win.emit("window-phase", PhasePayload { phase: "unfolding" });
            } else {
                let _ = win.set_size(LogicalSize::new(final_w, final_h));
                let _ = win.set_position(LogicalPosition::new(
                    center_x - final_w / 2.0,
                    center_y - final_h / 2.0,
                ));
                let _ = win.emit("window-phase", PhasePayload { phase: "ready" });
                break;
            }

            thread::sleep(Duration::from_millis(10));
        }
    });

    Ok(())
}
