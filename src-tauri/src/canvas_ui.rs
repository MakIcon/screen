// Canvas UI requires Chromium's HTML-in-Canvas API. Enable that one feature
// before creating any WebView2 environments, including detached app windows.
// Process-local environment options preserve Wry's default browser arguments.
#[cfg(windows)]
pub fn configure_webview() {
    const KEY: &str = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
    let existing = std::env::var(KEY).unwrap_or_default();
    std::env::set_var(KEY, browser_arguments(&existing));
}

#[cfg(any(windows, test))]
fn browser_arguments(existing: &str) -> String {
    let mut features: Vec<&str> = existing
        .split_whitespace()
        .filter_map(|argument| argument.strip_prefix("--enable-blink-features="))
        .flat_map(|features| features.split(','))
        .filter(|feature| !feature.is_empty())
        .collect();
    if features.contains(&"CanvasDrawElement") {
        return existing.to_owned();
    }
    features.push("CanvasDrawElement");
    format!("{existing} --enable-blink-features={}", features.join(","))
        .trim_start()
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::browser_arguments;

    #[test]
    fn enables_native_capture_and_preserves_other_browser_options() {
        assert_eq!(
            browser_arguments(""),
            "--enable-blink-features=CanvasDrawElement"
        );
        let existing = "--remote-debugging-port=9223 --enable-blink-features=OtherFeature";
        let arguments = browser_arguments(existing);
        assert!(arguments.starts_with(existing));
        assert!(arguments.ends_with("--enable-blink-features=OtherFeature,CanvasDrawElement"));
        assert_eq!(browser_arguments(&arguments), arguments);
    }
}
