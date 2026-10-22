use crate::commands::errors::{CommandError, ErrorCode};
use std::collections::{HashMap, HashSet};

/// Instance overrides are passed to the child process; the launcher keeps its environment.
pub fn normalize_environment_variables(
    values: HashMap<String, String>,
) -> Result<HashMap<String, String>, CommandError> {
    let mut normalized = HashMap::new();
    let mut names = HashSet::new();
    for (name, value) in values {
        let name = name.trim();
        if name.is_empty() || name.contains(['=', '\0']) {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "Имя переменной окружения не должно быть пустым или содержать = / NUL",
            ));
        }
        if value.contains('\0') {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("Значение переменной {name} содержит NUL"),
            ));
        }
        // Windows environment names are case-insensitive. Reject ambiguous imports too.
        let key = if cfg!(windows) {
            name.to_lowercase()
        } else {
            name.to_string()
        };
        if !names.insert(key) {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("Переменная окружения {name} указана несколько раз"),
            ));
        }
        normalized.insert(name.to_string(), value);
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_literal_values_and_empty_overrides() {
        let variables = HashMap::from([
            (
                " SCREEN_TEST_VALUE ".into(),
                "  a=b \"quoted\" $PATH  ".into(),
            ),
            ("SCREEN_TEST_EMPTY".into(), String::new()),
        ]);
        let normalized = normalize_environment_variables(variables).unwrap();
        assert_eq!(normalized["SCREEN_TEST_VALUE"], "  a=b \"quoted\" $PATH  ");
        assert_eq!(normalized["SCREEN_TEST_EMPTY"], "");
    }

    #[test]
    fn rejects_invalid_process_environment() {
        for (name, value) in [
            ("", "value"),
            ("A=B", "value"),
            ("A\0", "value"),
            ("A", "v\0"),
        ] {
            let error =
                normalize_environment_variables(HashMap::from([(name.into(), value.into())]))
                    .unwrap_err();
            assert_eq!(error.code, ErrorCode::InvalidInput);
        }
    }

    #[cfg(windows)]
    #[test]
    fn rejects_case_insensitive_duplicates_on_windows() {
        assert!(normalize_environment_variables(HashMap::from([
            ("Screen_Test".into(), "a".into()),
            ("SCREEN_TEST".into(), "b".into()),
        ]))
        .is_err());
    }

    #[cfg(windows)]
    #[test]
    fn child_receives_overrides_without_changing_launcher_environment() {
        use std::os::windows::process::CommandExt;
        let key = "SCREEN_ENVIRONMENT_PROCESS_TEST";
        let before = std::env::var_os(key);
        let variables = normalize_environment_variables(HashMap::from([(
            key.into(),
            "a=b with spaces".into(),
        )]))
        .unwrap();
        let output = std::process::Command::new("cmd.exe")
            .args(["/D", "/C", "set SCREEN_ENVIRONMENT_PROCESS_TEST"])
            .envs(&variables)
            .creation_flags(0x08000000)
            .output()
            .unwrap();
        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout)
            .contains("SCREEN_ENVIRONMENT_PROCESS_TEST=a=b with spaces"));
        assert_eq!(std::env::var_os(key), before);
    }
}
