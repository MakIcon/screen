pub mod blue_map;
pub mod discord_rpc;
pub mod mineflayer_bot;
pub mod obs_telemetry;

/// Append a line to a plugin's in-memory log ring, dropping the oldest lines so
/// it never grows past `capacity`. Shared by the managed-process plugins, which
/// each keep their own `Vec<String>` of recent output.
pub(crate) fn push_log_line(logs: &mut Vec<String>, capacity: usize, line: impl Into<String>) {
    logs.push(line.into());
    if logs.len() > capacity {
        let overflow = logs.len() - capacity;
        logs.drain(0..overflow);
    }
}

#[cfg(test)]
mod tests {
    use super::push_log_line;

    #[test]
    fn push_log_line_trims_to_capacity_keeping_newest() {
        let mut logs = Vec::new();
        for index in 0..5 {
            push_log_line(&mut logs, 3, format!("line {index}"));
        }
        assert_eq!(logs, vec!["line 2", "line 3", "line 4"]);
    }
}
