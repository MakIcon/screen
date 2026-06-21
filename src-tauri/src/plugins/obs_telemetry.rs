use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager, State};
use tokio::fs as async_fs;
use uuid::Uuid;

use crate::{
    minecraft::LoaderKind,
    models::{
        ActionResult, InstanceItem, ObsTelemetryPayload, ObsTelemetryPluginSettings,
        ObsTelemetryStatus,
    },
    paths::{read_settings, versions_root},
};

const DEFAULT_OBS_TELEMETRY_PORT: u16 = 18991;
const OBS_TELEMETRY_PORT_SCAN_LIMIT: u16 = 50;
const MAX_LOG_LINES: usize = 80;
const MAX_REQUEST_BYTES: usize = 512 * 1024;

#[derive(Clone, Default)]
pub struct ObsTelemetryState {
    inner: Arc<Mutex<ObsTelemetryRuntime>>,
}

struct ObsTelemetryServer {
    shutdown: mpsc::Sender<()>,
    handle: Option<thread::JoinHandle<()>>,
}

struct ObsTelemetryRuntime {
    server: Option<ObsTelemetryServer>,
    state: String,
    port: u16,
    token: String,
    last_payload: Option<ObsTelemetryPayload>,
    last_update_ms: Option<u64>,
    last_error: Option<String>,
    logs: Vec<String>,
}

struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

impl Default for ObsTelemetryRuntime {
    fn default() -> Self {
        Self {
            server: None,
            state: "idle".to_string(),
            port: DEFAULT_OBS_TELEMETRY_PORT,
            token: String::new(),
            last_payload: None,
            last_update_ms: None,
            last_error: None,
            logs: Vec::new(),
        }
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn push_log(runtime: &mut ObsTelemetryRuntime, line: impl Into<String>) {
    super::push_log_line(&mut runtime.logs, MAX_LOG_LINES, line);
}

fn overlay_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/overlay")
}

fn overlay_urls(port: u16) -> HashMap<String, String> {
    [
        ("all", "/overlay"),
        ("settings", "/settings"),
        ("health", "/health"),
        ("food", "/food"),
        ("xp", "/xp"),
        ("armor", "/armor"),
        ("helmet", "/helmet"),
        ("chestplate", "/chestplate"),
        ("leggings", "/leggings"),
        ("boots", "/boots"),
        ("coords", "/coords"),
        ("items", "/items"),
        ("mainHand", "/mainhand"),
        ("offhand", "/offhand"),
        ("dimension", "/dimension"),
    ]
    .into_iter()
    .map(|(key, path)| (key.to_string(), format!("http://127.0.0.1:{port}{path}")))
    .collect()
}

fn json_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/state.json")
}

fn snapshot_status(runtime: &ObsTelemetryRuntime) -> ObsTelemetryStatus {
    let last_update_age_ms = runtime
        .last_update_ms
        .map(|updated_at| now_millis().saturating_sub(updated_at));
    let last_player_name = runtime
        .last_payload
        .as_ref()
        .map(|payload| payload.player_name.clone())
        .filter(|name| !name.trim().is_empty());

    ObsTelemetryStatus {
        running: runtime.server.is_some(),
        state: runtime.state.clone(),
        port: runtime.port,
        overlay_url: overlay_url(runtime.port),
        overlay_urls: overlay_urls(runtime.port),
        json_url: json_url(runtime.port),
        last_player_name,
        last_update_age_ms,
        last_payload: runtime.last_payload.clone(),
        last_error: runtime.last_error.clone(),
        logs: runtime.logs.clone(),
    }
}

fn find_header_end(bytes: &[u8]) -> Option<usize> {
    bytes.windows(4).position(|window| window == b"\r\n\r\n")
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("set read timeout error: {error}"))?;

    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 4096];
    let header_end = loop {
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err("request too large".to_string());
        }
        if let Some(header_end) = find_header_end(&bytes) {
            break header_end;
        }

        let read = stream
            .read(&mut chunk)
            .map_err(|error| format!("read request error: {error}"))?;
        if read == 0 {
            return Err("connection closed before headers".to_string());
        }
        bytes.extend_from_slice(&chunk[..read]);
    };

    let header_text = std::str::from_utf8(&bytes[..header_end])
        .map_err(|error| format!("request header utf8 error: {error}"))?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| "missing request line".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default().to_string();
    let raw_path = request_parts.next().unwrap_or("/").to_string();
    let path = raw_path
        .split('?')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("/")
        .to_string();

    let mut headers = HashMap::new();
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    let content_length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let body_start = header_end + 4;

    while bytes.len() < body_start + content_length {
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err("request too large".to_string());
        }
        let read = stream
            .read(&mut chunk)
            .map_err(|error| format!("read request body error: {error}"))?;
        if read == 0 {
            return Err("connection closed before body".to_string());
        }
        bytes.extend_from_slice(&chunk[..read]);
    }

    Ok(HttpRequest {
        method,
        path,
        headers,
        body: bytes[body_start..body_start + content_length].to_vec(),
    })
}

fn write_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: impl AsRef<[u8]>,
) {
    write_response_with_cache(stream, status, content_type, body, "no-store");
}

fn write_response_with_cache(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: impl AsRef<[u8]>,
    cache_control: &str,
) {
    let body = body.as_ref();
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type, X-Screen-OBS-Token\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nCache-Control: {cache_control}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn write_json_response<T: serde::Serialize>(stream: &mut TcpStream, status: &str, value: &T) {
    match serde_json::to_vec(value) {
        Ok(body) => write_response(stream, status, "application/json; charset=utf-8", body),
        Err(error) => write_response(
            stream,
            "500 Internal Server Error",
            "text/plain; charset=utf-8",
            format!("json encode error: {error}"),
        ),
    }
}

fn is_safe_texture_part(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.'))
}

fn minecraft_texture_from_jar(
    minecraft_version: &str,
    texture_parts: &[&str],
) -> Result<Vec<u8>, String> {
    if !is_safe_texture_part(minecraft_version)
        || texture_parts.is_empty()
        || !matches!(texture_parts[0], "item" | "block" | "gui")
        || !texture_parts.iter().all(|part| is_safe_texture_part(part))
    {
        return Err("invalid texture path".to_string());
    }

    let jar_path = versions_root()?
        .join(minecraft_version)
        .join(format!("{minecraft_version}.jar"));
    let file = fs::File::open(&jar_path)
        .map_err(|error| format!("open Minecraft jar {} error: {error}", jar_path.display()))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("read Minecraft jar {} error: {error}", jar_path.display()))?;
    let texture_path = format!("assets/minecraft/textures/{}.png", texture_parts.join("/"));
    let mut texture = archive
        .by_name(&texture_path)
        .map_err(|_| format!("texture not found: {texture_path}"))?;
    let mut bytes = Vec::new();
    texture
        .read_to_end(&mut bytes)
        .map_err(|error| format!("read texture error: {error}"))?;
    Ok(bytes)
}

fn read_zip_text(archive: &mut zip::ZipArchive<fs::File>, path: &str) -> Option<String> {
    let mut file = archive.by_name(path).ok()?;
    let mut text = String::new();
    file.read_to_string(&mut text).ok()?;
    Some(text)
}

fn normalize_model_ref(model_ref: &str) -> Option<String> {
    let raw = model_ref.strip_prefix("minecraft:").unwrap_or(model_ref);
    if raw
        .split('/')
        .all(|part| is_safe_texture_part(part) && part != "." && part != "..")
    {
        Some(raw.to_string())
    } else {
        None
    }
}

fn normalize_texture_ref(texture_ref: &str) -> Option<String> {
    let raw = texture_ref
        .strip_prefix("minecraft:")
        .unwrap_or(texture_ref);
    if raw.starts_with('#') {
        return None;
    }
    if raw
        .split('/')
        .all(|part| is_safe_texture_part(part) && part != "." && part != "..")
    {
        Some(raw.to_string())
    } else {
        None
    }
}

fn collect_model_textures(
    archive: &mut zip::ZipArchive<fs::File>,
    model_ref: &str,
    visited: &mut HashSet<String>,
    textures: &mut Vec<String>,
) {
    let Some(normalized_model_ref) = normalize_model_ref(model_ref) else {
        return;
    };
    if !visited.insert(normalized_model_ref.clone()) {
        return;
    }

    let model_path = format!("assets/minecraft/models/{normalized_model_ref}.json");
    let Some(raw) = read_zip_text(archive, &model_path) else {
        return;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return;
    };

    if let Some(texture_map) = json.get("textures").and_then(|value| value.as_object()) {
        let preferred_keys = [
            "layer0", "all", "front", "side", "end", "top", "bottom", "particle",
        ];
        for key in preferred_keys {
            if let Some(texture_ref) = texture_map.get(key).and_then(|value| value.as_str()) {
                if let Some(normalized_texture_ref) = normalize_texture_ref(texture_ref) {
                    textures.push(normalized_texture_ref);
                }
            }
        }

        for texture_ref in texture_map.values().filter_map(|value| value.as_str()) {
            if let Some(normalized_texture_ref) = normalize_texture_ref(texture_ref) {
                if !textures.contains(&normalized_texture_ref) {
                    textures.push(normalized_texture_ref);
                }
            }
        }
    }

    if let Some(parent) = json.get("parent").and_then(|value| value.as_str()) {
        collect_model_textures(archive, parent, visited, textures);
    }
}

fn minecraft_icon_from_jar(minecraft_version: &str, item_name: &str) -> Result<Vec<u8>, String> {
    if !is_safe_texture_part(minecraft_version) || !is_safe_texture_part(item_name) {
        return Err("invalid icon path".to_string());
    }

    let jar_path = versions_root()?
        .join(minecraft_version)
        .join(format!("{minecraft_version}.jar"));
    let file = fs::File::open(&jar_path)
        .map_err(|error| format!("open Minecraft jar {} error: {error}", jar_path.display()))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("read Minecraft jar {} error: {error}", jar_path.display()))?;

    let direct_item = format!("assets/minecraft/textures/item/{item_name}.png");
    if let Ok(mut texture) = archive.by_name(&direct_item) {
        let mut bytes = Vec::new();
        texture
            .read_to_end(&mut bytes)
            .map_err(|error| format!("read item icon error: {error}"))?;
        return Ok(bytes);
    }

    let mut textures = Vec::new();
    let mut visited = HashSet::new();
    collect_model_textures(
        &mut archive,
        &format!("item/{item_name}"),
        &mut visited,
        &mut textures,
    );
    collect_model_textures(
        &mut archive,
        &format!("block/{item_name}"),
        &mut visited,
        &mut textures,
    );

    for texture_ref in textures {
        let texture_path = format!("assets/minecraft/textures/{texture_ref}.png");
        if let Ok(mut texture) = archive.by_name(&texture_path) {
            let mut bytes = Vec::new();
            texture
                .read_to_end(&mut bytes)
                .map_err(|error| format!("read model icon error: {error}"))?;
            return Ok(bytes);
        }
    }

    Err(format!("icon texture not found for {item_name}"))
}

fn handle_texture_request(stream: &mut TcpStream, path: &str) {
    let parts = path.trim_start_matches('/').split('/').collect::<Vec<_>>();
    if parts.len() < 4 || parts[0] != "texture" {
        write_response(
            stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            "texture not found",
        );
        return;
    }

    match minecraft_texture_from_jar(parts[1], &parts[2..]) {
        Ok(bytes) => write_response_with_cache(
            stream,
            "200 OK",
            "image/png",
            bytes,
            "public, max-age=31536000, immutable",
        ),
        Err(error) => write_response(stream, "404 Not Found", "text/plain; charset=utf-8", error),
    }
}

fn handle_icon_request(stream: &mut TcpStream, path: &str) {
    let parts = path.trim_start_matches('/').split('/').collect::<Vec<_>>();
    if parts.len() != 3 || parts[0] != "icon" {
        write_response(
            stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            "icon not found",
        );
        return;
    }

    match minecraft_icon_from_jar(parts[1], parts[2]) {
        Ok(bytes) => write_response_with_cache(
            stream,
            "200 OK",
            "image/png",
            bytes,
            "public, max-age=31536000, immutable",
        ),
        Err(error) => write_response(stream, "404 Not Found", "text/plain; charset=utf-8", error),
    }
}

fn handle_font_request(stream: &mut TcpStream, path: &str) {
    if path != "/font/monocraft.ttf" {
        write_response(
            stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            "font not found",
        );
        return;
    }

    write_response_with_cache(
        stream,
        "200 OK",
        "font/ttf",
        MONOCRAFT_TTF,
        "public, max-age=31536000, immutable",
    );
}

fn handle_telemetry_post(
    stream: &mut TcpStream,
    request: HttpRequest,
    state: Arc<Mutex<ObsTelemetryRuntime>>,
) {
    let provided_token = request
        .headers
        .get("x-screen-obs-token")
        .cloned()
        .unwrap_or_default();
    let expected_token = match state.lock() {
        Ok(runtime) => runtime.token.clone(),
        Err(_) => {
            write_response(
                stream,
                "500 Internal Server Error",
                "text/plain; charset=utf-8",
                "OBS telemetry state lock poisoned",
            );
            return;
        }
    };

    if expected_token.is_empty() || provided_token != expected_token {
        write_response(
            stream,
            "401 Unauthorized",
            "text/plain; charset=utf-8",
            "invalid telemetry token",
        );
        return;
    }

    let payload = match serde_json::from_slice::<ObsTelemetryPayload>(&request.body) {
        Ok(payload) => payload,
        Err(error) => {
            if let Ok(mut runtime) = state.lock() {
                runtime.last_error = Some(format!("telemetry parse error: {error}"));
                push_log(&mut runtime, format!("telemetry parse error: {error}"));
            }
            write_response(
                stream,
                "400 Bad Request",
                "text/plain; charset=utf-8",
                format!("telemetry parse error: {error}"),
            );
            return;
        }
    };

    if let Ok(mut runtime) = state.lock() {
        let previous_player = runtime
            .last_payload
            .as_ref()
            .map(|previous| previous.player_name.clone());
        let player_name = payload.player_name.clone();

        runtime.last_payload = Some(payload);
        runtime.last_update_ms = Some(now_millis());
        runtime.last_error = None;
        runtime.state = "receiving".to_string();

        if previous_player.as_deref() != Some(player_name.as_str()) {
            let label = if player_name.trim().is_empty() {
                "unknown player".to_string()
            } else {
                player_name
            };
            push_log(&mut runtime, format!("receiving telemetry from {label}"));
        }
    }

    write_response(stream, "204 No Content", "text/plain; charset=utf-8", "");
}

fn handle_http_client(mut stream: TcpStream, state: Arc<Mutex<ObsTelemetryRuntime>>) {
    let request = match read_http_request(&mut stream) {
        Ok(request) => request,
        Err(error) => {
            write_response(
                &mut stream,
                "400 Bad Request",
                "text/plain; charset=utf-8",
                format!("bad request: {error}"),
            );
            return;
        }
    };

    if request.method == "OPTIONS" {
        write_response(
            &mut stream,
            "204 No Content",
            "text/plain; charset=utf-8",
            "",
        );
        return;
    }

    if request.method == "GET" && request.path.starts_with("/texture/") {
        handle_texture_request(&mut stream, &request.path);
        return;
    }
    if request.method == "GET" && request.path.starts_with("/icon/") {
        handle_icon_request(&mut stream, &request.path);
        return;
    }
    if request.method == "GET" && request.path.starts_with("/font/") {
        handle_font_request(&mut stream, &request.path);
        return;
    }

    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/")
        | ("GET", "/overlay")
        | ("GET", "/settings")
        | ("GET", "/health")
        | ("GET", "/food")
        | ("GET", "/xp")
        | ("GET", "/armor")
        | ("GET", "/helmet")
        | ("GET", "/chestplate")
        | ("GET", "/leggings")
        | ("GET", "/boots")
        | ("GET", "/coords")
        | ("GET", "/items")
        | ("GET", "/mainhand")
        | ("GET", "/offhand")
        | ("GET", "/dimension") => {
            write_response(
                &mut stream,
                "200 OK",
                "text/html; charset=utf-8",
                OBS_OVERLAY_HTML_V2,
            );
        }
        ("GET", "/state.json") => match state.lock() {
            Ok(runtime) => {
                let status = snapshot_status(&runtime);
                write_json_response(&mut stream, "200 OK", &status);
            }
            Err(_) => write_response(
                &mut stream,
                "500 Internal Server Error",
                "text/plain; charset=utf-8",
                "OBS telemetry state lock poisoned",
            ),
        },
        ("POST", "/api/telemetry") => handle_telemetry_post(&mut stream, request, state),
        _ => write_response(
            &mut stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            "not found",
        ),
    }
}

fn bind_obs_listener(start_port: u16) -> Result<(TcpListener, u16), String> {
    let start_port = if start_port == 0 {
        DEFAULT_OBS_TELEMETRY_PORT
    } else {
        start_port
    };
    let end_port = start_port.saturating_add(OBS_TELEMETRY_PORT_SCAN_LIMIT);

    for port in start_port..=end_port {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            listener.set_nonblocking(true).map_err(|error| {
                format!("set OBS telemetry listener nonblocking error: {error}")
            })?;
            return Ok((listener, port));
        }
    }

    Err(format!(
        "No free OBS telemetry port found from {start_port} to {end_port}"
    ))
}

fn spawn_obs_server(
    listener: TcpListener,
    state: Arc<Mutex<ObsTelemetryRuntime>>,
) -> ObsTelemetryServer {
    let (shutdown, shutdown_rx) = mpsc::channel::<()>();
    let handle = thread::spawn(move || loop {
        if shutdown_rx.try_recv().is_ok() {
            break;
        }

        match listener.accept() {
            Ok((stream, _)) => {
                let request_state = state.clone();
                thread::spawn(move || handle_http_client(stream, request_state));
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(40));
            }
            Err(error) => {
                if let Ok(mut runtime) = state.lock() {
                    runtime.last_error = Some(format!("OBS telemetry accept error: {error}"));
                    push_log(&mut runtime, format!("accept error: {error}"));
                }
                thread::sleep(Duration::from_millis(120));
            }
        }
    });

    ObsTelemetryServer {
        shutdown,
        handle: Some(handle),
    }
}

fn ensure_obs_telemetry_started(
    state: &ObsTelemetryState,
    plugin: &ObsTelemetryPluginSettings,
) -> Result<(u16, String), String> {
    {
        let runtime = state
            .inner
            .lock()
            .map_err(|_| "OBS telemetry state lock poisoned".to_string())?;
        if runtime.server.is_some() {
            return Ok((runtime.port, runtime.token.clone()));
        }
    }

    let (listener, selected_port) = bind_obs_listener(plugin.port)?;
    let token = Uuid::new_v4().simple().to_string();

    {
        let mut runtime = state
            .inner
            .lock()
            .map_err(|_| "OBS telemetry state lock poisoned".to_string())?;
        runtime.port = selected_port;
        runtime.token = token.clone();
        runtime.state = "serving".to_string();
        runtime.last_error = None;
        push_log(
            &mut runtime,
            format!(
                "OBS overlay server listening on {}",
                overlay_url(selected_port)
            ),
        );
        if selected_port != plugin.port {
            push_log(
                &mut runtime,
                format!("port {} was busy; using {selected_port}", plugin.port),
            );
        }
    }

    let server = spawn_obs_server(listener, state.inner.clone());
    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "OBS telemetry state lock poisoned".to_string())?;
    runtime.server = Some(server);

    Ok((selected_port, token))
}

fn telemetry_resource_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("obs-telemetry"));
    }

    app.path()
        .resource_dir()
        .map(|path| path.join("resources").join("obs-telemetry"))
        .map_err(|error| format!("resolve resource dir error: {error}"))
}

fn telemetry_jar_matches_version(file_name: &str, minecraft_version: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    let version = minecraft_version.to_ascii_lowercase();
    lower.ends_with(".jar")
        && lower.contains("obs-telemetry")
        && (lower.contains(&format!("+mc{version}.jar"))
            || lower.contains(&format!("-mc{version}.jar"))
            || lower.contains(&format!("_mc{version}.jar")))
}

fn find_telemetry_jar(app: &AppHandle, minecraft_version: &str) -> Result<PathBuf, String> {
    let resource_dir = telemetry_resource_dir(app)?;
    if !resource_dir.exists() {
        return Err(format!(
            "OBS telemetry resources not found: {}",
            resource_dir.display()
        ));
    }

    let mut candidates = fs::read_dir(&resource_dir)
        .map_err(|error| format!("read OBS telemetry resources error: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| telemetry_jar_matches_version(name, minecraft_version))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    candidates.sort();
    candidates.into_iter().next().ok_or_else(|| {
        format!(
            "No OBS telemetry mod jar found for Minecraft {minecraft_version}. Build obs-telemetry-mod first."
        )
    })
}

async fn install_telemetry_mod(
    app: &AppHandle,
    instance: &InstanceItem,
) -> Result<PathBuf, String> {
    let source_jar = find_telemetry_jar(app, &instance.version)?;
    let mods_dir = PathBuf::from(&instance.game_dir).join("mods");
    async_fs::create_dir_all(&mods_dir)
        .await
        .map_err(|error| format!("create mods dir error: {error}"))?;

    let mut entries = async_fs::read_dir(&mods_dir)
        .await
        .map_err(|error| format!("read mods dir error: {error}"))?;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|error| format!("read mods dir entry error: {error}"))?
    {
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let lower = file_name.to_ascii_lowercase();
        if lower.ends_with(".jar") && lower.contains("obs-telemetry") {
            async_fs::remove_file(&path)
                .await
                .map_err(|error| format!("remove old OBS telemetry jar error: {error}"))?;
        }
    }

    let target_file_name = source_jar
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "OBS telemetry jar file name missing".to_string())?;
    let target_path = mods_dir.join(target_file_name);
    async_fs::copy(&source_jar, &target_path)
        .await
        .map_err(|error| format!("copy OBS telemetry jar error: {error}"))?;

    Ok(target_path)
}

pub async fn prepare_obs_telemetry_for_launch(
    app: &AppHandle,
    state: &ObsTelemetryState,
    plugin: &ObsTelemetryPluginSettings,
    instance: &InstanceItem,
) -> Result<Vec<String>, String> {
    if !plugin.enabled {
        return Ok(Vec::new());
    }

    if LoaderKind::parse(&instance.loader)? != LoaderKind::Fabric {
        return Err("OBS Telemetry requires a Fabric instance".to_string());
    }

    let (port, token) = ensure_obs_telemetry_started(state, plugin)?;
    let installed_path = install_telemetry_mod(app, instance).await?;

    if let Ok(mut runtime) = state.inner.lock() {
        push_log(
            &mut runtime,
            format!("installed telemetry mod: {}", installed_path.display()),
        );
    }

    Ok(vec![
        format!("-Dscreen.obs.port={port}"),
        format!("-Dscreen.obs.token={token}"),
    ])
}

#[tauri::command]
pub async fn get_obs_telemetry_status(
    state: State<'_, ObsTelemetryState>,
) -> Result<ObsTelemetryStatus, String> {
    let runtime = state
        .inner
        .lock()
        .map_err(|_| "OBS telemetry state lock poisoned".to_string())?;
    Ok(snapshot_status(&runtime))
}

#[tauri::command]
pub async fn start_obs_telemetry(
    state: State<'_, ObsTelemetryState>,
) -> Result<ObsTelemetryStatus, String> {
    let settings = read_settings().await?;
    let plugin = settings.plugins.obs_telemetry;

    if !plugin.enabled {
        return Err("OBS Telemetry extension is disabled".to_string());
    }

    ensure_obs_telemetry_started(&state, &plugin)?;
    let runtime = state
        .inner
        .lock()
        .map_err(|_| "OBS telemetry state lock poisoned".to_string())?;
    Ok(snapshot_status(&runtime))
}

#[tauri::command]
pub async fn stop_obs_telemetry(
    state: State<'_, ObsTelemetryState>,
) -> Result<ObsTelemetryStatus, String> {
    let server = {
        let mut runtime = state
            .inner
            .lock()
            .map_err(|_| "OBS telemetry state lock poisoned".to_string())?;
        runtime.server.take()
    };

    if let Some(mut server) = server {
        let _ = server.shutdown.send(());
        if let Some(handle) = server.handle.take() {
            let _ = handle.join();
        }
    }

    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "OBS telemetry state lock poisoned".to_string())?;
    runtime.state = "stopped".to_string();
    runtime.token.clear();
    push_log(&mut runtime, "stop requested from launcher");
    Ok(snapshot_status(&runtime))
}

#[tauri::command]
pub async fn open_obs_telemetry_overlay(
    state: State<'_, ObsTelemetryState>,
) -> Result<ActionResult, String> {
    let url = {
        let runtime = state
            .inner
            .lock()
            .map_err(|_| "OBS telemetry state lock poisoned".to_string())?;
        overlay_url(runtime.port)
    };

    tauri_plugin_opener::open_url(&url, None::<&str>)
        .map_err(|error| format!("open OBS overlay error: {error}"))?;

    Ok(ActionResult {
        ok: true,
        message: "OBS telemetry overlay opened".to_string(),
        pid: None,
    })
}

const OBS_OVERLAY_HTML_V2: &str = include_str!("obs_overlay.html");
const MONOCRAFT_TTF: &[u8] = include_bytes!("../../resources/obs-telemetry/Monocraft.ttf");

#[allow(dead_code)]
const OBS_OVERLAY_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Screen OBS Telemetry</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: rgba(8, 12, 18, 0.78);
      --line: rgba(255, 255, 255, 0.16);
      --ink: #f8fafc;
      --muted: #9aa4b2;
      --accent: #35d0ba;
      --warn: #ffb454;
      --bad: #ff6262;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-width: 360px;
      background: transparent;
      color: var(--ink);
      overflow: hidden;
    }

    .hud {
      width: min(760px, 100vw);
      padding: 14px;
      display: grid;
      gap: 10px;
    }

    .top,
    .stats,
    .equipment {
      border: 1px solid var(--line);
      background: var(--bg);
      backdrop-filter: blur(12px);
    }

    .top {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
    }

    .player {
      min-width: 0;
      display: grid;
      gap: 4px;
    }

    .player strong {
      overflow: hidden;
      font-size: 18px;
      line-height: 1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .player span,
    .label {
      color: var(--muted);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .status {
      color: var(--accent);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .status.offline { color: var(--bad); }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .tile {
      min-width: 0;
      padding: 12px;
      border-right: 1px solid var(--line);
    }

    .tile:last-child { border-right: 0; }

    .value {
      margin-top: 6px;
      overflow: hidden;
      font-size: 20px;
      font-weight: 900;
      line-height: 1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bar {
      height: 6px;
      margin-top: 8px;
      background: rgba(255,255,255,0.12);
      overflow: hidden;
    }

    .bar span {
      display: block;
      width: 0%;
      height: 100%;
      background: var(--accent);
      transition: width 0.18s ease;
    }

    .bar.health span { background: #ff6262; }
    .bar.food span { background: #ffb454; }

    .equipment {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0;
    }

    .slot {
      min-width: 0;
      padding: 12px;
      border-right: 1px solid var(--line);
    }

    .slot:last-child { border-right: 0; }

    .slot strong {
      display: block;
      margin-top: 6px;
      overflow: hidden;
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .slot small {
      display: block;
      margin-top: 5px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
    }

    @media (max-width: 520px) {
      .stats,
      .equipment {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .tile,
      .slot {
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
    }
  </style>
</head>
<body>
  <main class="hud">
    <section class="top">
      <div class="player">
        <span id="dimension">WAITING FOR MINECRAFT</span>
        <strong id="player">NO PLAYER</strong>
      </div>
      <div id="status" class="status offline">OFFLINE</div>
    </section>

    <section class="stats">
      <div class="tile">
        <div class="label">Health</div>
        <div id="health" class="value">-- / --</div>
        <div class="bar health"><span id="healthBar"></span></div>
      </div>
      <div class="tile">
        <div class="label">Armor</div>
        <div id="armor" class="value">--</div>
        <div class="bar"><span id="armorBar"></span></div>
      </div>
      <div class="tile">
        <div class="label">Food</div>
        <div id="food" class="value">--</div>
        <div class="bar food"><span id="foodBar"></span></div>
      </div>
      <div class="tile">
        <div class="label">Coords</div>
        <div id="coords" class="value">-- -- --</div>
      </div>
    </section>

    <section class="equipment">
      <div class="slot">
        <div class="label">Main Hand</div>
        <strong id="mainHand">Empty</strong>
        <small id="mainDurability">--</small>
      </div>
      <div class="slot">
        <div class="label">Offhand</div>
        <strong id="offhand">Empty</strong>
        <small id="offhandDurability">--</small>
      </div>
      <div class="slot">
        <div class="label">Armor Items</div>
        <strong id="armorItems">Empty</strong>
        <small id="armorDurability">--</small>
      </div>
    </section>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    const fmt = (value, digits = 0) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "--";
    const pct = (value, max) => Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));

    function itemName(item) {
      if (!item || !item.displayName) return "Empty";
      return item.count > 1 ? `${item.displayName} x${item.count}` : item.displayName;
    }

    function durability(item) {
      if (!item || !item.maxDamage) return "--";
      return `${item.durability}/${item.maxDamage} (${fmt(item.durabilityPercent, 0)}%)`;
    }

    function setOffline() {
      $("status").textContent = "OFFLINE";
      $("status").classList.add("offline");
    }

    function update(status) {
      const payload = status.lastPayload;
      const stale = status.lastUpdateAgeMs == null || status.lastUpdateAgeMs > 3000;
      if (!payload || stale) {
        setOffline();
        return;
      }

      $("status").textContent = "LIVE";
      $("status").classList.remove("offline");
      $("player").textContent = payload.playerName || "PLAYER";
      $("dimension").textContent = payload.dimension || "minecraft:overworld";
      $("health").textContent = `${fmt(payload.health, 1)} / ${fmt(payload.maxHealth, 1)}`;
      $("armor").textContent = `${payload.armor ?? 0}`;
      $("food").textContent = `${payload.food ?? 0}`;
      $("coords").textContent = `${payload.blockPosition?.x ?? "--"} ${payload.blockPosition?.y ?? "--"} ${payload.blockPosition?.z ?? "--"}`;
      $("healthBar").style.width = `${pct(payload.health, payload.maxHealth)}%`;
      $("armorBar").style.width = `${pct(payload.armor ?? 0, 20)}%`;
      $("foodBar").style.width = `${pct(payload.food ?? 0, 20)}%`;
      $("mainHand").textContent = itemName(payload.heldItem);
      $("mainDurability").textContent = durability(payload.heldItem);
      $("offhand").textContent = itemName(payload.offhandItem);
      $("offhandDurability").textContent = durability(payload.offhandItem);

      const armorItems = payload.armorItems || [];
      $("armorItems").textContent = armorItems.length ? armorItems.map(itemName).join(" | ") : "Empty";
      $("armorDurability").textContent = armorItems.length ? armorItems.map(durability).join(" | ") : "--";
    }

    async function poll() {
      try {
        const response = await fetch("/state.json", { cache: "no-store" });
        update(await response.json());
      } catch {
        setOffline();
      }
    }

    poll();
    setInterval(poll, 250);
  </script>
</body>
</html>
"#;
