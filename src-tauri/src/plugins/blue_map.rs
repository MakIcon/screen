use std::{
    env, fs,
    io::{BufRead, BufReader},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use url::Url;

use crate::{
    models::{ActionResult, BlueMapPluginSettings, BlueMapStatus, InstanceItem, LauncherSettings},
    paths::{launcher_root, read_instances, read_settings, write_settings},
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const DEFAULT_BLUEMAP_PORT: u16 = 8100;
const BLUEMAP_PORT_SCAN_LIMIT: u16 = 50;
const DEFAULT_MAP_URL: &str = "http://127.0.0.1:8100/";
const GITHUB_LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/BlueMap-Minecraft/BlueMap/releases/latest";
const JAVA21_BLUEMAP_CLI_URL: &str =
    "https://github.com/BlueMap-Minecraft/BlueMap/releases/download/v5.16/bluemap-5.16-cli.jar";
const MAX_LOG_LINES: usize = 100;

#[derive(Clone, Default)]
pub struct BlueMapState {
    inner: Arc<Mutex<BlueMapRuntime>>,
}

struct BlueMapRuntime {
    child: Option<Child>,
    state: String,
    pid: Option<u32>,
    url: String,
    cli_jar_path: Option<String>,
    working_dir: Option<String>,
    world_path: Option<String>,
    last_error: Option<String>,
    logs: Vec<String>,
}

#[derive(Debug, serde::Deserialize)]
struct GithubRelease {
    assets: Vec<GithubAsset>,
}

#[derive(Debug, serde::Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug)]
struct PreparedBlueMap {
    cli_jar: PathBuf,
    working_dir: PathBuf,
    java_bin: String,
    map_url: String,
    world_path: Option<PathBuf>,
    downloaded: bool,
    generated_config: bool,
    port_remapped: Option<(u16, u16)>,
}

struct BlueMapPortSelection {
    map_url: String,
    requested_port: u16,
    selected_port: u16,
}

struct BlueMapDownloadTarget {
    file_name: &'static str,
    url: &'static str,
    min_java_major: u32,
}

impl Default for BlueMapRuntime {
    fn default() -> Self {
        Self {
            child: None,
            state: "idle".to_string(),
            pid: None,
            url: DEFAULT_MAP_URL.to_string(),
            cli_jar_path: None,
            working_dir: None,
            world_path: None,
            last_error: None,
            logs: Vec::new(),
        }
    }
}

fn push_log(runtime: &mut BlueMapRuntime, line: impl Into<String>) {
    super::push_log_line(&mut runtime.logs, MAX_LOG_LINES, line);
}

fn snapshot_status(runtime: &BlueMapRuntime) -> BlueMapStatus {
    BlueMapStatus {
        running: runtime.child.is_some(),
        state: runtime.state.clone(),
        pid: runtime.pid,
        url: runtime.url.clone(),
        cli_jar_path: runtime.cli_jar_path.clone(),
        working_dir: runtime.working_dir.clone(),
        world_path: runtime.world_path.clone(),
        last_error: runtime.last_error.clone(),
        logs: runtime.logs.clone(),
    }
}

fn refresh_child_state(runtime: &mut BlueMapRuntime) {
    let exit_status = match runtime.child.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(Some(status)) => Some(format!("{status}")),
            Ok(None) => None,
            Err(error) => Some(format!("status check failed: {error}")),
        },
        None => None,
    };

    if let Some(status) = exit_status {
        runtime.child.take();
        runtime.pid = None;
        runtime.state = "stopped".to_string();
        push_log(runtime, format!("process stopped: {status}"));
    }
}

fn spawn_log_reader<R>(reader: R, state: Arc<Mutex<BlueMapRuntime>>, label: &'static str)
where
    R: std::io::Read + Send + 'static,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines() {
            let Ok(line) = line else {
                continue;
            };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(mut runtime) = state.lock() {
                push_log(&mut runtime, format!("{label}: {trimmed}"));
                if label == "stderr" {
                    runtime.last_error = Some(trimmed.to_string());
                }
                if matches!(
                    runtime.state.as_str(),
                    "starting" | "rendering" | "updating"
                ) && trimmed.to_ascii_lowercase().contains("webserver")
                {
                    runtime.state = "serving".to_string();
                }
            }
        }
    });
}

fn spawn_output_collector<R>(reader: R) -> thread::JoinHandle<String>
where
    R: std::io::Read + Send + 'static,
{
    thread::spawn(move || {
        let mut lines = Vec::new();
        for line in BufReader::new(reader).lines() {
            let Ok(line) = line else {
                continue;
            };
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                lines.push(trimmed.to_string());
            }
        }
        lines.join("\n")
    })
}

fn join_output(handle: Option<thread::JoinHandle<String>>) -> String {
    handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
}

fn process_output_details(
    stdout: Option<thread::JoinHandle<String>>,
    stderr: Option<thread::JoinHandle<String>>,
) -> String {
    let text = [join_output(stdout), join_output(stderr)]
        .into_iter()
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    let mut chars = text.chars();
    let snippet = chars.by_ref().take(1600).collect::<String>();
    if chars.next().is_some() {
        format!("{snippet}\n...")
    } else {
        snippet
    }
}

fn normalize_map_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let candidate = if trimmed.is_empty() {
        DEFAULT_MAP_URL.to_string()
    } else if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };

    let parsed =
        Url::parse(&candidate).map_err(|error| format!("BlueMap URL parse error: {error}"))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("BlueMap URL must use http or https".to_string());
    }
    if parsed.host_str().is_none() {
        return Err("BlueMap URL must include a host".to_string());
    }

    Ok(parsed.to_string())
}

fn requested_bluemap_port(url: &Url) -> u16 {
    url.port().unwrap_or(DEFAULT_BLUEMAP_PORT)
}

fn can_bind_bluemap_port(port: u16) -> bool {
    TcpListener::bind(("0.0.0.0", port)).is_ok()
}

fn find_available_bluemap_port(start_port: u16) -> Option<u16> {
    let start_port = if start_port == 0 {
        DEFAULT_BLUEMAP_PORT
    } else {
        start_port
    };
    let end_port = start_port.saturating_add(BLUEMAP_PORT_SCAN_LIMIT);

    (start_port..=end_port).find(|port| can_bind_bluemap_port(*port))
}

fn select_available_map_url(map_url: &str) -> Result<BlueMapPortSelection, String> {
    let mut parsed =
        Url::parse(map_url).map_err(|error| format!("BlueMap URL parse error: {error}"))?;
    let requested_port = requested_bluemap_port(&parsed);
    let selected_port = find_available_bluemap_port(requested_port).ok_or_else(|| {
        let end_port = requested_port.saturating_add(BLUEMAP_PORT_SCAN_LIMIT);
        format!("No free BlueMap webserver port found from {requested_port} to {end_port}")
    })?;

    parsed
        .set_port(Some(selected_port))
        .map_err(|_| "BlueMap URL port update failed".to_string())?;

    Ok(BlueMapPortSelection {
        map_url: parsed.to_string(),
        requested_port,
        selected_port,
    })
}

fn managed_bluemap_dir() -> Result<PathBuf, String> {
    Ok(launcher_root()?.join("plugins").join("bluemap"))
}

fn is_probably_file_path(value: &str) -> bool {
    value.contains('\\') || value.contains('/') || value.contains(':')
}

fn candidate_java_bin(home: impl AsRef<Path>) -> Option<String> {
    let executable = if cfg!(windows) { "java.exe" } else { "java" };
    let path = home.as_ref().join("bin").join(executable);
    path.exists().then(|| path.to_string_lossy().to_string())
}

fn java_bin_from_env(var_name: &str) -> Option<String> {
    env::var(var_name).ok().and_then(candidate_java_bin)
}

fn java_root_candidates() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    #[cfg(windows)]
    {
        roots.extend([
            PathBuf::from(r"C:\Program Files\Java"),
            PathBuf::from(r"C:\Program Files\Eclipse Adoptium"),
            PathBuf::from(r"C:\Program Files\Eclipse Foundation"),
            PathBuf::from(r"C:\Program Files\Microsoft"),
            PathBuf::from(r"C:\Program Files\Azul Systems\Zulu"),
            PathBuf::from(r"C:\Program Files\Amazon Corretto"),
            PathBuf::from(r"C:\Program Files\BellSoft\LibericaJDK"),
            PathBuf::from(r"C:\Program Files\IBM Semeru Runtime Open Edition"),
            PathBuf::from(r"C:\Program Files\SapMachine"),
        ]);
    }

    roots
}

fn find_java_in_roots() -> Option<String> {
    let mut found = Vec::new();

    for root in java_root_candidates() {
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };

        for entry in entries.flatten() {
            let dir_name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if !(dir_name.contains("25")
                || dir_name.contains("24")
                || dir_name.contains("23")
                || dir_name.contains("22")
                || dir_name.contains("21"))
            {
                continue;
            }

            if let Some(bin) = candidate_java_bin(entry.path()) {
                found.push(bin);
            }
        }
    }

    found.sort_by(|a, b| b.cmp(a));
    found.into_iter().next()
}

fn java_executable(java_path: &str) -> String {
    let configured = java_path.trim();
    if !configured.is_empty() {
        if is_probably_file_path(configured) {
            let path = PathBuf::from(configured);
            if path.exists() {
                return path.to_string_lossy().to_string();
            }
        }
        return configured.to_string();
    }

    if let Some(bin) = java_bin_from_env("JAVA25_HOME")
        .or_else(|| java_bin_from_env("JAVA_HOME"))
        .or_else(find_java_in_roots)
    {
        return bin;
    }

    if cfg!(windows) {
        "java.exe".to_string()
    } else {
        "java".to_string()
    }
}

fn parse_java_major(raw: &str) -> Option<u32> {
    let version = raw
        .split('"')
        .nth(1)
        .or_else(|| raw.split_whitespace().find(|part| part.contains('.')))?;
    let mut parts = version.split('.');
    let first = parts.next()?.parse::<u32>().ok()?;

    if first == 1 {
        parts.next()?.parse::<u32>().ok()
    } else {
        Some(first)
    }
}

fn detect_java_major(java_bin: &str) -> Option<u32> {
    let output = Command::new(java_bin).arg("-version").output().ok()?;
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    parse_java_major(&combined)
}

fn is_java21_bluemap_version(version: &str) -> bool {
    let mut parts = version.split('.');
    let major = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let minor = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);

    major < 5 || (major == 5 && minor <= 16)
}

fn bluemap_version_from_file_name(path: &Path) -> Option<String> {
    let file_name = path.file_name()?.to_str()?;
    let lower = file_name.to_ascii_lowercase();
    let rest = lower.strip_prefix("bluemap-")?;
    let version = rest.strip_suffix("-cli.jar")?;
    Some(version.to_string())
}

fn is_compatible_bluemap_cli_jar(path: &Path, java_major: Option<u32>) -> bool {
    if !is_bluemap_cli_jar(path) {
        return false;
    }

    let Some(java_major) = java_major else {
        return true;
    };

    if java_major >= 25 {
        return true;
    }

    bluemap_version_from_file_name(path)
        .map(|version| is_java21_bluemap_version(&version))
        .unwrap_or(false)
}

fn java21_download_target() -> BlueMapDownloadTarget {
    BlueMapDownloadTarget {
        file_name: "bluemap-5.16-cli.jar",
        url: JAVA21_BLUEMAP_CLI_URL,
        min_java_major: 21,
    }
}

fn config_dir(working_dir: &Path) -> PathBuf {
    working_dir.join("config")
}

fn core_config_path(working_dir: &Path) -> PathBuf {
    let root_path = working_dir.join("core.conf");
    if root_path.exists() {
        root_path
    } else {
        config_dir(working_dir).join("core.conf")
    }
}

fn webserver_config_path(working_dir: &Path) -> PathBuf {
    let root_path = working_dir.join("webserver.conf");
    if root_path.exists() {
        root_path
    } else {
        config_dir(working_dir).join("webserver.conf")
    }
}

fn maps_config_dir(working_dir: &Path) -> PathBuf {
    let root_path = working_dir.join("maps");
    let nested_path = config_dir(working_dir).join("maps");
    if root_path.exists() || !nested_path.exists() {
        root_path
    } else {
        nested_path
    }
}

fn generated_config_exists(working_dir: &Path) -> bool {
    working_dir.join("core.conf").exists()
        || config_dir(working_dir).join("core.conf").exists()
        || working_dir.join("webserver.conf").exists()
        || config_dir(working_dir).join("webserver.conf").exists()
}

fn path_for_hocon(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace('"', "\\\"")
}

fn quote_hocon(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn update_hocon_setting(raw: &str, key: &str, value: &str) -> String {
    let mut replaced = false;
    let mut out = Vec::new();

    for line in raw.lines() {
        let trimmed = line.trim_start();
        let uncommented = trimmed.trim_start_matches('#').trim_start();
        let after_key = uncommented
            .strip_prefix(key)
            .map(str::trim_start)
            .unwrap_or_default();
        if uncommented.starts_with(key)
            && (after_key.starts_with(':') || after_key.starts_with('='))
        {
            out.push(format!("{key}: {value}"));
            replaced = true;
        } else {
            out.push(line.to_string());
        }
    }

    if !replaced {
        out.push(format!("{key}: {value}"));
    }

    let mut text = out.join("\n");
    text.push('\n');
    text
}

async fn set_hocon_setting(path: &Path, key: &str, value: &str) -> Result<(), String> {
    let raw = tokio::fs::read_to_string(path).await.unwrap_or_default();
    let next = update_hocon_setting(&raw, key, value);
    tokio::fs::write(path, next)
        .await
        .map_err(|error| format!("write {} error: {error}", path.display()))
}

fn run_bluemap_once_for_config(
    java_bin: &str,
    cli_jar: &Path,
    working_dir: &Path,
) -> Result<bool, String> {
    if core_config_path(working_dir).exists() && maps_config_dir(working_dir).exists() {
        return Ok(false);
    }

    let mut command = Command::new(java_bin);
    command
        .arg("-jar")
        .arg(cli_jar)
        .current_dir(working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .spawn()
        .map_err(|error| format!("generate BlueMap config error: {error}"))?;
    let mut stdout = child.stdout.take().map(spawn_output_collector);
    let mut stderr = child.stderr.take().map(spawn_output_collector);

    for _ in 0..250 {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() && !generated_config_exists(working_dir) {
                    let details = process_output_details(stdout.take(), stderr.take());
                    return Err(if details.is_empty() {
                        format!("BlueMap config generation failed: {status}")
                    } else {
                        format!("BlueMap config generation failed: {status}\n{details}")
                    });
                }
                return Ok(true);
            }
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(error) => return Err(format!("BlueMap config generation status error: {error}")),
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    let details = process_output_details(stdout.take(), stderr.take());

    if generated_config_exists(working_dir) {
        Ok(true)
    } else if details.is_empty() {
        Err("BlueMap config generation timed out".to_string())
    } else {
        Err(format!("BlueMap config generation timed out\n{details}"))
    }
}

fn candidate_modified(path: &Path) -> SystemTime {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

fn push_world_candidate(candidates: &mut Vec<(SystemTime, PathBuf)>, path: PathBuf) {
    let level_dat = path.join("level.dat");
    if level_dat.exists() {
        candidates.push((candidate_modified(&level_dat), path));
    }
}

fn scan_saves_dir(candidates: &mut Vec<(SystemTime, PathBuf)>, saves_dir: PathBuf) {
    let Ok(entries) = fs::read_dir(saves_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            push_world_candidate(candidates, path);
        }
    }
}

fn candidate_worlds_from_instance(
    candidates: &mut Vec<(SystemTime, PathBuf)>,
    instance: &InstanceItem,
) {
    let game_dir = PathBuf::from(&instance.game_dir);
    push_world_candidate(candidates, game_dir.clone());
    scan_saves_dir(candidates, game_dir.join("saves"));
}

async fn find_world_for_bluemap() -> Result<Option<PathBuf>, String> {
    let mut candidates = Vec::new();

    for instance in read_instances().await.unwrap_or_default() {
        candidate_worlds_from_instance(&mut candidates, &instance);
    }

    if let Ok(appdata) = env::var("APPDATA") {
        scan_saves_dir(
            &mut candidates,
            PathBuf::from(appdata).join(".minecraft").join("saves"),
        );
    }

    if let Ok(root) = launcher_root() {
        scan_saves_dir(&mut candidates, root.join("minecraft").join("saves"));
        scan_saves_dir(&mut candidates, root.join("saves"));
    }

    candidates.sort_by_key(|(modified, _)| *modified);
    Ok(candidates.pop().map(|(_, path)| path))
}

fn world_display_name(world_path: &Path) -> String {
    world_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("ScreenLauncher World")
        .to_string()
}

fn map_config_text(world_path: &Path, dimension: &str, name: &str, sorting: i32) -> String {
    format!(
        "world: {}\ndimension: {}\nname: {}\nsorting: {sorting}\nstorage: \"file\"\nenable-hires: false\n",
        quote_hocon(&path_for_hocon(world_path)),
        quote_hocon(dimension),
        quote_hocon(name),
    )
}

async fn write_map_configs(working_dir: &Path, world_path: &Path) -> Result<(), String> {
    let maps_dir = maps_config_dir(working_dir);
    tokio::fs::create_dir_all(&maps_dir)
        .await
        .map_err(|error| format!("create BlueMap maps config dir error: {error}"))?;

    let name = world_display_name(world_path);
    let overworld = map_config_text(world_path, "minecraft:overworld", &name, 0);
    tokio::fs::write(maps_dir.join("screenlauncher_world.conf"), overworld)
        .await
        .map_err(|error| format!("write BlueMap overworld config error: {error}"))?;

    if world_path.join("DIM-1").exists() {
        let nether = map_config_text(
            world_path,
            "minecraft:the_nether",
            &format!("{name} Nether"),
            10,
        );
        tokio::fs::write(maps_dir.join("screenlauncher_nether.conf"), nether)
            .await
            .map_err(|error| format!("write BlueMap nether config error: {error}"))?;
    }

    if world_path.join("DIM1").exists() {
        let end = map_config_text(world_path, "minecraft:the_end", &format!("{name} End"), 20);
        tokio::fs::write(maps_dir.join("screenlauncher_end.conf"), end)
            .await
            .map_err(|error| format!("write BlueMap end config error: {error}"))?;
    }

    Ok(())
}

async fn configure_generated_files(
    working_dir: &Path,
    map_url: &str,
    world_path: Option<&Path>,
) -> Result<(), String> {
    let core = core_config_path(working_dir);
    if core.exists() {
        set_hocon_setting(&core, "accept-download", "true").await?;
        set_hocon_setting(&core, "render-thread-count", "-2").await?;
    }

    if let Ok(parsed) = Url::parse(map_url) {
        if let Some(port) = parsed.port() {
            let webserver = webserver_config_path(working_dir);
            if webserver.exists() {
                set_hocon_setting(&webserver, "port", &port.to_string()).await?;
            }
        }
    }

    if let Some(world_path) = world_path {
        write_map_configs(working_dir, world_path).await?;
    }

    Ok(())
}

fn resolve_working_dir(plugin: &BlueMapPluginSettings) -> Result<PathBuf, String> {
    let work_raw = plugin.working_dir.trim();
    if work_raw.is_empty() {
        managed_bluemap_dir()
    } else {
        Ok(PathBuf::from(work_raw))
    }
}

fn is_bluemap_cli_jar(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let lower = file_name.to_ascii_lowercase();
    lower.ends_with(".jar") && lower.contains("bluemap") && lower.contains("cli")
}

fn collect_cli_jars(root: &Path, max_depth: usize, found: &mut Vec<PathBuf>) {
    if max_depth == 0 || !root.exists() {
        return;
    }

    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if is_bluemap_cli_jar(&path) {
                found.push(path);
            }
            continue;
        }

        if path.is_dir() {
            collect_cli_jars(&path, max_depth - 1, found);
        }
    }
}

fn newest_file(paths: Vec<PathBuf>) -> Option<PathBuf> {
    paths
        .into_iter()
        .filter_map(|path| {
            let modified = fs::metadata(&path).and_then(|meta| meta.modified()).ok()?;
            Some((modified, path))
        })
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

fn blue_map_search_roots(working_dir: &Path) -> Vec<(PathBuf, usize)> {
    let mut roots = vec![
        (working_dir.to_path_buf(), 4),
        (
            managed_bluemap_dir().unwrap_or_else(|_| working_dir.to_path_buf()),
            4,
        ),
    ];

    if let Ok(root) = launcher_root() {
        roots.push((root, 4));
    }

    if let Ok(profile) = env::var("USERPROFILE") {
        let profile = PathBuf::from(profile);
        roots.push((profile.join("Downloads"), 2));
        roots.push((profile.join("Desktop"), 2));
    }

    #[cfg(windows)]
    {
        roots.extend([
            (PathBuf::from(r"C:\Program Files\BlueMap"), 3),
            (PathBuf::from(r"C:\Program Files (x86)\BlueMap"), 3),
        ]);
    }

    roots
}

fn find_local_bluemap_cli_jar(
    plugin: &BlueMapPluginSettings,
    working_dir: &Path,
    java_major: Option<u32>,
) -> Option<PathBuf> {
    let configured = plugin.cli_jar_path.trim();
    if !configured.is_empty() {
        let path = PathBuf::from(configured);
        if path.is_file() && is_compatible_bluemap_cli_jar(&path, java_major) {
            return Some(path);
        }
    }

    let mut found = Vec::new();
    for (root, depth) in blue_map_search_roots(working_dir) {
        collect_cli_jars(&root, depth, &mut found);
    }

    newest_file(
        found
            .into_iter()
            .filter(|path| is_compatible_bluemap_cli_jar(path, java_major))
            .collect(),
    )
}

async fn download_file(url: &str, target_path: &Path) -> Result<(), String> {
    if let Some(parent) = target_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("create BlueMap download dir error: {error}"))?;
    }

    let client = reqwest::Client::builder()
        .user_agent("ScreenLauncher/0.1.0")
        .build()
        .map_err(|error| format!("BlueMap http client error: {error}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("BlueMap download request error: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("BlueMap download http error {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("read BlueMap download bytes error: {error}"))?;
    tokio::fs::write(target_path, bytes)
        .await
        .map_err(|error| format!("write BlueMap CLI jar error: {error}"))
}

async fn download_latest_bluemap_cli(managed_dir: &Path) -> Result<PathBuf, String> {
    tokio::fs::create_dir_all(managed_dir)
        .await
        .map_err(|error| format!("create BlueMap managed dir error: {error}"))?;

    let client = reqwest::Client::builder()
        .user_agent("ScreenLauncher/0.1.0")
        .build()
        .map_err(|error| format!("BlueMap http client error: {error}"))?;
    let release = client
        .get(GITHUB_LATEST_RELEASE_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("BlueMap latest release request error: {error}"))?;

    if !release.status().is_success() {
        return Err(format!(
            "BlueMap latest release http error {}",
            release.status()
        ));
    }

    let release = release
        .json::<GithubRelease>()
        .await
        .map_err(|error| format!("BlueMap latest release parse error: {error}"))?;
    let asset = release
        .assets
        .into_iter()
        .find(|asset| {
            let name = asset.name.to_ascii_lowercase();
            name.ends_with(".jar") && name.contains("bluemap") && name.contains("cli")
        })
        .ok_or_else(|| "BlueMap latest release has no CLI jar asset".to_string())?;
    let target_path = managed_dir.join(&asset.name);

    if !target_path.exists() {
        download_file(&asset.browser_download_url, &target_path).await?;
    }

    Ok(target_path)
}

async fn download_bluemap_cli_target(
    managed_dir: &Path,
    target: BlueMapDownloadTarget,
    java_major: Option<u32>,
) -> Result<PathBuf, String> {
    if java_major
        .map(|major| major < target.min_java_major)
        .unwrap_or(false)
    {
        return Err(format!(
            "BlueMap {} requires Java {}+, but detected Java {}",
            target.file_name,
            target.min_java_major,
            java_major.unwrap_or_default()
        ));
    }

    tokio::fs::create_dir_all(managed_dir)
        .await
        .map_err(|error| format!("create BlueMap managed dir error: {error}"))?;

    let target_path = managed_dir.join(target.file_name);
    if !target_path.exists() {
        download_file(target.url, &target_path).await?;
    }

    Ok(target_path)
}

async fn resolve_cli_jar(
    plugin: &BlueMapPluginSettings,
    working_dir: &Path,
    java_major: Option<u32>,
) -> Result<(PathBuf, bool), String> {
    if let Some(path) = find_local_bluemap_cli_jar(plugin, working_dir, java_major) {
        return Ok((path, false));
    }

    let managed_dir = managed_bluemap_dir()?;
    if java_major.map(|major| major < 25).unwrap_or(false) {
        let downloaded =
            download_bluemap_cli_target(&managed_dir, java21_download_target(), java_major).await?;
        return Ok((downloaded, true));
    }

    let downloaded = download_latest_bluemap_cli(&managed_dir).await?;
    Ok((downloaded, true))
}

async fn prepare_bluemap_settings(
    settings: &mut LauncherSettings,
) -> Result<PreparedBlueMap, String> {
    let plugin = settings.blue_map_plugin().clone();
    let normalized_map_url = normalize_map_url(&plugin.map_url)?;
    let port_selection = select_available_map_url(&normalized_map_url)?;
    let map_url = port_selection.map_url;
    let working_dir = resolve_working_dir(&plugin)?;

    tokio::fs::create_dir_all(&working_dir)
        .await
        .map_err(|error| format!("create BlueMap working dir error: {error}"))?;

    let java_bin = java_executable(&plugin.java_path);
    let java_major = detect_java_major(&java_bin);
    let (cli_jar, downloaded) = resolve_cli_jar(&plugin, &working_dir, java_major).await?;
    let generated_config = run_bluemap_once_for_config(&java_bin, &cli_jar, &working_dir)?;
    let world_path = find_world_for_bluemap().await?;
    configure_generated_files(&working_dir, &map_url, world_path.as_deref()).await?;

    let blue_map = settings.blue_map_plugin_mut();
    blue_map.map_url = map_url.clone();
    blue_map.cli_jar_path = cli_jar.to_string_lossy().to_string();
    blue_map.working_dir = working_dir.to_string_lossy().to_string();
    blue_map.java_path = java_bin.clone();
    write_settings(settings).await?;

    Ok(PreparedBlueMap {
        cli_jar,
        working_dir,
        java_bin,
        map_url,
        world_path,
        downloaded,
        generated_config,
        port_remapped: (port_selection.selected_port != port_selection.requested_port)
            .then_some((port_selection.requested_port, port_selection.selected_port)),
    })
}

#[tauri::command]
pub async fn get_bluemap_status(state: State<'_, BlueMapState>) -> Result<BlueMapStatus, String> {
    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "BlueMap state lock poisoned".to_string())?;
    refresh_child_state(&mut runtime);
    Ok(snapshot_status(&runtime))
}

#[tauri::command]
pub async fn stop_bluemap(state: State<'_, BlueMapState>) -> Result<BlueMapStatus, String> {
    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "BlueMap state lock poisoned".to_string())?;

    if let Some(mut child) = runtime.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    runtime.pid = None;
    runtime.state = "stopped".to_string();
    push_log(&mut runtime, "stop requested from launcher");
    Ok(snapshot_status(&runtime))
}

#[tauri::command]
pub async fn prepare_bluemap(state: State<'_, BlueMapState>) -> Result<BlueMapStatus, String> {
    let mut settings = read_settings().await?;
    let prepared = prepare_bluemap_settings(&mut settings).await?;

    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "BlueMap state lock poisoned".to_string())?;
    refresh_child_state(&mut runtime);
    runtime.url = prepared.map_url;
    runtime.cli_jar_path = Some(prepared.cli_jar.to_string_lossy().to_string());
    runtime.working_dir = Some(prepared.working_dir.to_string_lossy().to_string());
    runtime.world_path = prepared
        .world_path
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());
    runtime.last_error = None;
    push_log(
        &mut runtime,
        if prepared.downloaded {
            "downloaded BlueMap CLI jar"
        } else {
            "found local BlueMap CLI jar"
        },
    );
    push_log(&mut runtime, format!("java: {}", prepared.java_bin));
    if prepared.generated_config {
        push_log(&mut runtime, "generated BlueMap config files");
    }
    if let Some((requested_port, selected_port)) = prepared.port_remapped {
        push_log(
            &mut runtime,
            format!("port {requested_port} was busy; using {selected_port}"),
        );
    }
    if let Some(world_path) = runtime.world_path.clone() {
        push_log(&mut runtime, format!("world: {world_path}"));
    } else {
        push_log(&mut runtime, "no Minecraft world found for map config");
    }
    Ok(snapshot_status(&runtime))
}

#[tauri::command]
pub async fn start_bluemap(state: State<'_, BlueMapState>) -> Result<BlueMapStatus, String> {
    let mut settings = read_settings().await?;
    let mut plugin = settings.blue_map_plugin().clone();

    if !plugin.enabled {
        return Err("BlueMap extension is disabled".to_string());
    }

    if plugin.render_on_start && !plugin.update_on_start {
        settings.blue_map_plugin_mut().update_on_start = true;
        plugin.update_on_start = true;
    }

    {
        let mut runtime = state
            .inner
            .lock()
            .map_err(|_| "BlueMap state lock poisoned".to_string())?;
        refresh_child_state(&mut runtime);
        if runtime.child.is_some() {
            return Err("BlueMap is already running".to_string());
        }
    }

    let prepared = prepare_bluemap_settings(&mut settings).await?;
    let render_on_start = plugin.render_on_start;
    let update_on_start = plugin.update_on_start;

    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "BlueMap state lock poisoned".to_string())?;
    refresh_child_state(&mut runtime);
    if runtime.child.is_some() {
        return Err("BlueMap is already running".to_string());
    }
    runtime.state = if render_on_start {
        "rendering".to_string()
    } else if update_on_start {
        "updating".to_string()
    } else {
        "starting".to_string()
    };
    runtime.url = prepared.map_url.clone();
    runtime.cli_jar_path = Some(prepared.cli_jar.to_string_lossy().to_string());
    runtime.working_dir = Some(prepared.working_dir.to_string_lossy().to_string());
    runtime.world_path = prepared
        .world_path
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());
    runtime.last_error = None;
    runtime.logs.clear();
    if prepared.downloaded {
        push_log(&mut runtime, "downloaded BlueMap CLI jar");
    } else {
        push_log(&mut runtime, "found local BlueMap CLI jar");
    }
    push_log(&mut runtime, format!("java: {}", prepared.java_bin));
    if prepared.generated_config {
        push_log(&mut runtime, "generated BlueMap config files");
    }
    if let Some((requested_port, selected_port)) = prepared.port_remapped {
        push_log(
            &mut runtime,
            format!("port {requested_port} was busy; using {selected_port}"),
        );
    }
    if let Some(world_path) = runtime.world_path.clone() {
        push_log(&mut runtime, format!("world: {world_path}"));
    } else {
        push_log(&mut runtime, "no Minecraft world found for map config");
    }
    if render_on_start {
        push_log(&mut runtime, "background render enabled");
    }
    if update_on_start {
        push_log(&mut runtime, "live update enabled");
    }
    push_log(&mut runtime, "webserver will start immediately");
    drop(runtime);

    let mut command = Command::new(&prepared.java_bin);
    command.arg("-jar").arg(&prepared.cli_jar);
    if render_on_start {
        command.arg("-r");
    }
    if update_on_start {
        command.arg("-u");
    }
    command
        .arg("-w")
        .current_dir(&prepared.working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .spawn()
        .map_err(|error| format!("start BlueMap CLI error: {error}. Install Java and retry."))?;

    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(stdout, state.inner.clone(), "stdout");
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(stderr, state.inner.clone(), "stderr");
    }

    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "BlueMap state lock poisoned".to_string())?;
    runtime.child = Some(child);
    runtime.pid = runtime.child.as_ref().map(|child| child.id());
    runtime.state = if render_on_start {
        "rendering".to_string()
    } else if update_on_start {
        "updating".to_string()
    } else {
        "starting".to_string()
    };
    runtime.url = prepared.map_url;
    runtime.cli_jar_path = Some(prepared.cli_jar.to_string_lossy().to_string());
    runtime.working_dir = Some(prepared.working_dir.to_string_lossy().to_string());
    runtime.world_path = prepared
        .world_path
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());
    runtime.last_error = None;
    push_log(
        &mut runtime,
        format!(
            "start requested from launcher: {}",
            [
                "-jar",
                "<bluemap>",
                if render_on_start { "-r" } else { "" },
                if update_on_start { "-u" } else { "" },
                "-w"
            ]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
        ),
    );

    Ok(snapshot_status(&runtime))
}

#[tauri::command]
pub async fn open_bluemap_browser() -> Result<ActionResult, String> {
    let settings = read_settings().await?;
    let url = normalize_map_url(&settings.blue_map_plugin().map_url)?;

    tauri_plugin_opener::open_url(&url, None::<&str>)
        .map_err(|error| format!("open browser error: {error}"))?;

    Ok(ActionResult {
        ok: true,
        message: "BlueMap opened in browser".to_string(),
        pid: None,
    })
}

#[tauri::command]
pub async fn open_bluemap_window(app: AppHandle) -> Result<ActionResult, String> {
    let settings = read_settings().await?;
    let url = normalize_map_url(&settings.blue_map_plugin().map_url)?;
    if let Some(existing) = app.get_webview_window("bluemap-map") {
        let _ = existing.set_focus();
        return Ok(ActionResult {
            ok: true,
            message: "BlueMap window focused".to_string(),
            pid: None,
        });
    }

    let parsed = Url::parse(&url).map_err(|error| format!("BlueMap URL parse error: {error}"))?;
    let window = WebviewWindowBuilder::new(&app, "bluemap-map", WebviewUrl::External(parsed))
        .title("BlueMap")
        .inner_size(1180.0, 760.0)
        .min_inner_size(720.0, 480.0)
        .center()
        .resizable(true)
        .build()
        .map_err(|error| format!("open BlueMap window error: {error}"))?;

    let _ = window.set_focus();

    Ok(ActionResult {
        ok: true,
        message: "BlueMap opened in launcher window".to_string(),
        pid: None,
    })
}
