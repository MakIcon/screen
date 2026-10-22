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
    SkinFormat,
    SkinSize,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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

impl std::error::Error for CommandError {}

impl CommandError {
    pub fn new(code: ErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    /// Add diagnostics without changing a category assigned by the failing operation.
    pub fn context(mut self, detail: impl Into<String>) -> Self {
        self.detail = detail.into();
        self
    }

    pub fn java(error: std::io::Error) -> Self {
        let code = match error.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::JavaMissing,
            std::io::ErrorKind::PermissionDenied => ErrorCode::PermissionDenied,
            _ => ErrorCode::JavaFailed,
        };
        Self::new(code, error.to_string())
    }
}

impl From<std::io::Error> for CommandError {
    fn from(error: std::io::Error) -> Self {
        let code = match error.kind() {
            std::io::ErrorKind::PermissionDenied => ErrorCode::PermissionDenied,
            std::io::ErrorKind::NotFound => ErrorCode::FileNotFound,
            std::io::ErrorKind::InvalidData => ErrorCode::InvalidFile,
            std::io::ErrorKind::InvalidInput => ErrorCode::InvalidInput,
            std::io::ErrorKind::TimedOut
            | std::io::ErrorKind::ConnectionRefused
            | std::io::ErrorKind::ConnectionReset
            | std::io::ErrorKind::ConnectionAborted
            | std::io::ErrorKind::NotConnected => ErrorCode::Network,
            _ => ErrorCode::Unknown,
        };
        Self::new(code, error.to_string())
    }
}

impl From<reqwest::Error> for CommandError {
    fn from(error: reqwest::Error) -> Self {
        let code = if error.is_decode() {
            ErrorCode::InvalidFile
        } else if error.is_builder() {
            ErrorCode::InvalidInput
        } else if error.status().is_some() {
            ErrorCode::DownloadFailed
        } else {
            ErrorCode::Network
        };
        Self::new(code, error.to_string())
    }
}

impl From<serde_json::Error> for CommandError {
    fn from(error: serde_json::Error) -> Self {
        Self::new(ErrorCode::InvalidFile, error.to_string())
    }
}

impl From<zip::result::ZipError> for CommandError {
    fn from(error: zip::result::ZipError) -> Self {
        match error {
            zip::result::ZipError::Io(error) => error.into(),
            error => Self::new(ErrorCode::InvalidFile, error.to_string()),
        }
    }
}

impl From<tokio::task::JoinError> for CommandError {
    fn from(error: tokio::task::JoinError) -> Self {
        Self::new(
            if error.is_cancelled() {
                ErrorCode::Cancelled
            } else {
                ErrorCode::Unknown
            },
            error.to_string(),
        )
    }
}

impl From<tauri::Error> for CommandError {
    fn from(error: tauri::Error) -> Self {
        Self::new(ErrorCode::Unknown, error.to_string())
    }
}

impl From<url::ParseError> for CommandError {
    fn from(error: url::ParseError) -> Self {
        Self::new(ErrorCode::InvalidInput, error.to_string())
    }
}

impl From<quick_xml::DeError> for CommandError {
    fn from(error: quick_xml::DeError) -> Self {
        Self::new(ErrorCode::InvalidFile, error.to_string())
    }
}

impl From<tauri_plugin_opener::Error> for CommandError {
    fn from(error: tauri_plugin_opener::Error) -> Self {
        Self::new(ErrorCode::Unknown, error.to_string())
    }
}

impl From<std::str::Utf8Error> for CommandError {
    fn from(error: std::str::Utf8Error) -> Self {
        Self::new(ErrorCode::InvalidFile, error.to_string())
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
    fn serializes_a_stable_code_independent_of_diagnostic_language() {
        for detail in [
            "Instance not found",
            "Сборка отсутствует",
            "download cancelled",
        ] {
            let error = CommandError::new(ErrorCode::BuildNotFound, detail);
            let json = serde_json::to_value(&error).unwrap();
            assert_eq!(json["code"], "build_not_found");
            assert_eq!(json["detail"], detail);
            assert_eq!(error.to_string(), detail);
        }
    }

    #[test]
    fn io_categories_follow_error_kind_even_with_misleading_text() {
        for (kind, code) in [
            (
                std::io::ErrorKind::PermissionDenied,
                ErrorCode::PermissionDenied,
            ),
            (std::io::ErrorKind::NotFound, ErrorCode::FileNotFound),
            (std::io::ErrorKind::TimedOut, ErrorCode::Network),
            (std::io::ErrorKind::InvalidData, ErrorCode::InvalidFile),
            (std::io::ErrorKind::Other, ErrorCode::Unknown),
        ] {
            let error = CommandError::from(std::io::Error::new(kind, "cancelled / Ошибка"));
            assert_eq!(error.code, code);
            assert_eq!(error.detail, "cancelled / Ошибка");
        }
    }

    #[test]
    fn context_and_question_mark_preserve_the_original_code() {
        fn operation() -> Result<(), CommandError> {
            Err(CommandError::new(ErrorCode::Cancelled, "Остановлено"))
        }
        fn command() -> Result<(), CommandError> {
            operation().map_err(|error| {
                let detail = format!("Import failed: {error}");
                error.context(detail)
            })?;
            Ok(())
        }
        let error = command().unwrap_err();
        assert_eq!(error.code, ErrorCode::Cancelled);
        assert_eq!(error.detail, "Import failed: Остановлено");
    }

    #[test]
    fn archive_io_errors_keep_their_category() {
        let error = zip::result::ZipError::Io(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "Нет доступа",
        ));
        assert_eq!(CommandError::from(error).code, ErrorCode::PermissionDenied);
        let parse_error = serde_json::from_str::<serde_json::Value>("not json").unwrap_err();
        assert_eq!(CommandError::from(parse_error).code, ErrorCode::InvalidFile);
    }

    #[test]
    fn missing_java_and_java_process_failure_have_distinct_codes() {
        assert_eq!(
            CommandError::java(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Исполняемый файл отсутствует",
            ))
            .code,
            ErrorCode::JavaMissing
        );
        assert_eq!(
            CommandError::java(std::io::Error::other("network cancelled")).code,
            ErrorCode::JavaFailed
        );
    }
}
