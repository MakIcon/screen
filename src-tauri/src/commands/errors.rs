use serde::Serialize;

/// Stable IPC codes let each window translate an error without parsing English.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    Cancelled,
    BuildNotFound,
    NameRequired,
    NameExists,
    BuildRunning,
    IncompatibleVersion,
    JavaMissing,
    JavaFailed,
    Authentication,
    Network,
    PermissionDenied,
    FileNotFound,
    InvalidFile,
    InvalidInput,
    DownloadFailed,
    ChecksumMismatch,
    Unsupported,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommandError {
    pub code: ErrorCode,
    /// Kept verbatim for diagnostic logs; the interface displays translated copy.
    pub detail: String,
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.detail)
    }
}

impl From<String> for CommandError {
    fn from(detail: String) -> Self {
        let text = detail.to_ascii_lowercase();
        let code = if text.contains("cancelled") || text.contains("canceled") {
            ErrorCode::Cancelled
        } else if text.contains("instance not found") || text.contains("build not found") {
            ErrorCode::BuildNotFound
        } else if text.contains("name is empty") {
            ErrorCode::NameRequired
        } else if text.contains("name already exists") {
            ErrorCode::NameExists
        } else if text.contains("stop the") || text.contains("is running") {
            ErrorCode::BuildRunning
        } else if text.contains("no compatible") || text.contains("not compatible") {
            ErrorCode::IncompatibleVersion
        } else if text.contains("java") && (text.contains("not found") || text.contains("missing"))
        {
            ErrorCode::JavaMissing
        } else if text.contains("java") && (text.contains("failed") || text.contains("error")) {
            ErrorCode::JavaFailed
        } else if text.contains("account")
            || text.contains("oauth")
            || text.contains("authentication")
        {
            ErrorCode::Authentication
        } else if text.contains("permission denied") || text.contains("access is denied") {
            ErrorCode::PermissionDenied
        } else if text.contains("checksum")
            || text.contains("hash mismatch")
            || text.contains("sha-1 mismatch")
        {
            ErrorCode::ChecksumMismatch
        } else if text.contains("timeout")
            || text.contains("timed out")
            || text.contains("connect")
            || text.contains("network")
            || text.contains("dns")
            || text.contains("error sending request")
        {
            ErrorCode::Network
        } else if text.contains("download") {
            ErrorCode::DownloadFailed
        } else if text.contains("no such file")
            || text.contains("file not found")
            || text.contains("cannot find the file")
        {
            ErrorCode::FileNotFound
        } else if text.contains("unsupported") || text.contains("not supported") {
            ErrorCode::Unsupported
        } else if text.contains("invalid")
            || text.contains("unsafe")
            || text.contains("does not declare")
        {
            if text.contains("archive")
                || text.contains("mrpack")
                || text.contains("slbuild")
                || text.contains("file")
            {
                ErrorCode::InvalidFile
            } else {
                ErrorCode::InvalidInput
            }
        } else {
            ErrorCode::Unknown
        };
        Self { code, detail }
    }
}

// Internal operations keep their original String diagnostics when composing commands.
impl From<CommandError> for String {
    fn from(error: CommandError) -> Self {
        error.detail
    }
}

/// Frontend formatting keeps diagnostics in a local launcher log, including
/// errors raised before a backend command could return a structured code.
#[tauri::command]
pub fn record_launcher_error(code: String, detail: String) {
    use std::io::Write;
    let Ok(root) = crate::paths::launcher_root() else {
        return;
    };
    let directory = root.join("logs");
    if std::fs::create_dir_all(&directory).is_err() {
        return;
    }
    let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("launcher-errors.jsonl"))
    else {
        return;
    };
    let entry = serde_json::json!({
        "timestamp": crate::paths::now_string(),
        "code": code.chars().take(80).collect::<String>(),
        "detail": detail.chars().take(8192).collect::<String>(),
    });
    let _ = writeln!(file, "{entry}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_a_stable_code_and_preserves_diagnostics() {
        let error = CommandError::from("Instance not found".to_string());
        assert_eq!(error.code, ErrorCode::BuildNotFound);
        let json = serde_json::to_value(error).unwrap();
        assert_eq!(json["code"], "build_not_found");
        assert_eq!(json["detail"], "Instance not found");
    }

    #[test]
    fn preserves_cancellation_and_unknown_errors() {
        assert_eq!(
            CommandError::from("IMPORT_CANCELLED".to_string()).code,
            ErrorCode::Cancelled
        );
        let error = CommandError::from("low-level diagnostic".to_string());
        assert_eq!(error.code, ErrorCode::Unknown);
        assert_eq!(String::from(error), "low-level diagnostic");
    }
}
