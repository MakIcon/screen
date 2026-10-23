// All launcher webviews share a WebView2 environment. Configure the one required
// Blink feature before Tauri starts it, so native HTML effects and the Studio
// preview use the same API without changing browser profiles or system settings.
#[cfg(windows)]
pub fn configure_html_in_canvas() {
    let current = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        with_canvas_capture(&current),
    );
}

#[cfg(any(windows, test))]
fn with_canvas_capture(arguments: &str) -> String {
    const PREFIX: &str = "--enable-blink-features=";
    if let Some(start) = arguments.find(PREFIX) {
        let value_start = start + PREFIX.len();
        let value_end = arguments[value_start..]
            .find(char::is_whitespace)
            .map_or(arguments.len(), |offset| value_start + offset);
        let existing = &arguments[value_start..value_end];
        if existing
            .split(',')
            .any(|feature| feature == "CanvasDrawElement")
        {
            return arguments.to_string();
        }
        let mut next = arguments.to_string();
        next.insert_str(
            value_end,
            if existing.is_empty() {
                "CanvasDrawElement"
            } else {
                ",CanvasDrawElement"
            },
        );
        next
    } else {
        format!("{arguments} {PREFIX}CanvasDrawElement")
            .trim_start()
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::with_canvas_capture;

    #[test]
    fn enables_capture_and_preserves_existing_browser_arguments() {
        assert_eq!(
            with_canvas_capture(""),
            "--enable-blink-features=CanvasDrawElement"
        );
        assert_eq!(
            with_canvas_capture("--remote-debugging-port=9223 --enable-blink-features=OtherFeature --user-agent=Test"),
            "--remote-debugging-port=9223 --enable-blink-features=OtherFeature,CanvasDrawElement --user-agent=Test"
        );
        let existing =
            "--enable-blink-features=OtherFeature,CanvasDrawElement --remote-debugging-port=9223";
        assert_eq!(with_canvas_capture(existing), existing);
    }
}
