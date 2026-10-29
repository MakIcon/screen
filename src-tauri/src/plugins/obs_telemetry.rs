use crate::commands::errors::{CommandError, ErrorCode};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::State;
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
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_CLIENTS: usize = 16;
const STALE_AFTER_MS: u64 = 3000;

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
    configured_port: u16,
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
            configured_port: DEFAULT_OBS_TELEMETRY_PORT,
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
        state: if runtime.server.is_some()
            && runtime.state == "receiving"
            && last_update_age_ms.is_none_or(|age| age > STALE_AFTER_MS)
        {
            "waiting".to_string()
        } else {
            runtime.state.clone()
        },
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

pub(crate) fn current_status(
    state: &ObsTelemetryState,
) -> Result<ObsTelemetryStatus, CommandError> {
    let runtime = state
        .inner
        .lock()
        .map_err(|_| CommandError::new(ErrorCode::Unknown, "OBS telemetry state lock poisoned"))?;
    Ok(snapshot_status(&runtime))
}

fn find_header_end(bytes: &[u8]) -> Option<usize> {
    bytes.windows(4).position(|window| window == b"\r\n\r\n")
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, CommandError> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| {
            let detail = format!("set read timeout error: {error}");
            CommandError::from(error).context(detail)
        })?;

    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 4096];
    let header_end = loop {
        if bytes.len() > MAX_HEADER_BYTES {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "request too large",
            ));
        }
        if let Some(header_end) = find_header_end(&bytes) {
            if header_end > MAX_HEADER_BYTES {
                return Err(CommandError::new(
                    ErrorCode::InvalidInput,
                    "headers too large",
                ));
            }
            break header_end;
        }

        let read = stream.read(&mut chunk).map_err(|error| {
            let detail = format!("read request error: {error}");
            CommandError::from(error).context(detail)
        })?;
        if read == 0 {
            return Err(CommandError::new(
                ErrorCode::Network,
                "connection closed before headers",
            ));
        }
        bytes.extend_from_slice(&chunk[..read]);
    };

    let header_text = std::str::from_utf8(&bytes[..header_end]).map_err(|error| {
        let detail = format!("request header utf8 error: {error}");
        CommandError::from(error).context(detail)
    })?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| CommandError::new(ErrorCode::InvalidInput, "missing request line"))?;
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

    if headers.contains_key("transfer-encoding") {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "transfer encoding is unsupported",
        ));
    }
    let content_length = headers
        .get("content-length")
        .map(|value| value.parse::<usize>())
        .transpose()
        .map_err(|_| CommandError::new(ErrorCode::InvalidInput, "invalid content length"))?
        .unwrap_or(0);
    let body_start = header_end + 4;
    if content_length > MAX_REQUEST_BYTES.saturating_sub(body_start) {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "request too large",
        ));
    }

    while bytes.len() < body_start + content_length {
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "request too large",
            ));
        }
        let read = stream.read(&mut chunk).map_err(|error| {
            let detail = format!("read request body error: {error}");
            CommandError::from(error).context(detail)
        })?;
        if read == 0 {
            return Err(CommandError::new(
                ErrorCode::Network,
                "connection closed before body",
            ));
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
) -> Result<Vec<u8>, CommandError> {
    if !is_safe_texture_part(minecraft_version)
        || texture_parts.is_empty()
        || !matches!(texture_parts[0], "item" | "block" | "gui")
        || !texture_parts.iter().all(|part| is_safe_texture_part(part))
    {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "invalid texture path",
        ));
    }

    let jar_path = versions_root()?
        .join(minecraft_version)
        .join(format!("{minecraft_version}.jar"));
    let file = fs::File::open(&jar_path).map_err(|error| {
        let detail = format!("open Minecraft jar {} error: {error}", jar_path.display());
        CommandError::from(error).context(detail)
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| {
        let detail = format!("read Minecraft jar {} error: {error}", jar_path.display());
        CommandError::from(error).context(detail)
    })?;
    let texture_path = format!("assets/minecraft/textures/{}.png", texture_parts.join("/"));
    let mut texture = archive.by_name(&texture_path).map_err(|_| {
        CommandError::new(
            ErrorCode::InvalidInput,
            format!("texture not found: {texture_path}"),
        )
    })?;
    let mut bytes = Vec::new();
    texture.read_to_end(&mut bytes).map_err(|error| {
        let detail = format!("read texture error: {error}");
        CommandError::from(error).context(detail)
    })?;
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

fn minecraft_icon_from_jar(
    minecraft_version: &str,
    item_name: &str,
) -> Result<Vec<u8>, CommandError> {
    if !is_safe_texture_part(minecraft_version) || !is_safe_texture_part(item_name) {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "invalid icon path",
        ));
    }

    let jar_path = versions_root()?
        .join(minecraft_version)
        .join(format!("{minecraft_version}.jar"));
    let file = fs::File::open(&jar_path).map_err(|error| {
        let detail = format!("open Minecraft jar {} error: {error}", jar_path.display());
        CommandError::from(error).context(detail)
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| {
        let detail = format!("read Minecraft jar {} error: {error}", jar_path.display());
        CommandError::from(error).context(detail)
    })?;

    let direct_item = format!("assets/minecraft/textures/item/{item_name}.png");
    if let Ok(mut texture) = archive.by_name(&direct_item) {
        let mut bytes = Vec::new();
        texture.read_to_end(&mut bytes).map_err(|error| {
            let detail = format!("read item icon error: {error}");
            CommandError::from(error).context(detail)
        })?;
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
            texture.read_to_end(&mut bytes).map_err(|error| {
                let detail = format!("read model icon error: {error}");
                CommandError::from(error).context(detail)
            })?;
            return Ok(bytes);
        }
    }

    Err(CommandError::new(
        ErrorCode::InvalidInput,
        format!("icon texture not found for {item_name}"),
    ))
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
        Err(error) => write_response(
            stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            error.detail,
        ),
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
        Err(error) => write_response(
            stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            error.detail,
        ),
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

    match super::optional_extensions::extension_dir(super::obs_telemetry_package::ID)
        .and_then(|directory| fs::read(directory.join("Monocraft.ttf")).map_err(CommandError::from))
    {
        Ok(bytes) => {
            write_response_with_cache(stream, "200 OK", "font/ttf", bytes, "public, max-age=3600")
        }
        Err(_) => write_response(
            stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            "font not installed",
        ),
    }
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
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
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
                OBS_OVERLAY_HTML,
            );
        }
        ("GET", "/state.json") => match state.lock() {
            Ok(runtime) => {
                let status = snapshot_status(&runtime);
                drop(runtime);
                write_json_response(&mut stream, "200 OK", &status);
            }
            Err(_) => write_response(
                &mut stream,
                "500 Internal Server Error",
                "text/plain; charset=utf-8",
                "OBS telemetry state lock poisoned",
            ),
        },
        ("GET", "/overlay.json") => {
            let snapshot = state.lock().ok().map(|runtime| serde_json::json!({
                "running": runtime.server.is_some(),
                "lastPayload": runtime.last_payload,
                "lastUpdateAgeMs": runtime.last_update_ms.map(|time| now_millis().saturating_sub(time))
            }));
            match snapshot {
                Some(snapshot) => write_json_response(&mut stream, "200 OK", &snapshot),
                None => write_response(
                    &mut stream,
                    "503 Service Unavailable",
                    "text/plain",
                    "state unavailable",
                ),
            }
        }
        ("POST", "/api/telemetry") => handle_telemetry_post(&mut stream, request, state),
        _ => write_response(
            &mut stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            "not found",
        ),
    }
}

fn bind_obs_listener(start_port: u16) -> Result<(TcpListener, u16), CommandError> {
    let start_port = if start_port == 0 {
        DEFAULT_OBS_TELEMETRY_PORT
    } else {
        start_port
    };
    let end_port = start_port.saturating_add(OBS_TELEMETRY_PORT_SCAN_LIMIT);

    for port in start_port..=end_port {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            listener.set_nonblocking(true).map_err(|error| {
                let detail = format!("set OBS telemetry listener nonblocking error: {error}");
                CommandError::from(error).context(detail)
            })?;
            return Ok((listener, port));
        }
    }

    Err(CommandError::new(
        ErrorCode::InvalidInput,
        format!("No free OBS telemetry port found from {start_port} to {end_port}"),
    ))
}

fn spawn_obs_server(
    listener: TcpListener,
    state: Arc<Mutex<ObsTelemetryRuntime>>,
) -> ObsTelemetryServer {
    let (shutdown, shutdown_rx) = mpsc::channel::<()>();
    let clients = Arc::new(AtomicUsize::new(0));
    let handle = thread::spawn(move || loop {
        if !matches!(shutdown_rx.try_recv(), Err(mpsc::TryRecvError::Empty)) {
            break;
        }

        match listener.accept() {
            Ok((stream, _)) => {
                if clients
                    .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |count| {
                        (count < MAX_CLIENTS).then_some(count + 1)
                    })
                    .is_err()
                {
                    continue;
                }
                let request_state = state.clone();
                let clients = clients.clone();
                thread::spawn(move || {
                    struct ClientGuard(Arc<AtomicUsize>);
                    impl Drop for ClientGuard {
                        fn drop(&mut self) {
                            self.0.fetch_sub(1, Ordering::Relaxed);
                        }
                    }
                    let _guard = ClientGuard(clients);
                    handle_http_client(stream, request_state);
                });
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
) -> Result<(u16, String), CommandError> {
    super::obs_telemetry_package::directory()?;
    start_server(state, plugin)
}

fn start_server(
    state: &ObsTelemetryState,
    plugin: &ObsTelemetryPluginSettings,
) -> Result<(u16, String), CommandError> {
    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| CommandError::new(ErrorCode::Unknown, "OBS telemetry state lock poisoned"))?;
    if runtime.server.is_some() {
        return Ok((runtime.port, runtime.token.clone()));
    }

    let requested_port = if plugin.port == runtime.configured_port && !runtime.token.is_empty() {
        runtime.port
    } else {
        plugin.port
    };
    let (listener, selected_port) = bind_obs_listener(requested_port)?;
    let token = if runtime.token.is_empty() {
        Uuid::new_v4().simple().to_string()
    } else {
        runtime.token.clone()
    };

    runtime.port = selected_port;
    runtime.configured_port = plugin.port;
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
    let server = spawn_obs_server(listener, state.inner.clone());
    runtime.server = Some(server);

    Ok((selected_port, token))
}

fn telemetry_jar_matches_version(file_name: &str, minecraft_version: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    let version = minecraft_version.to_ascii_lowercase();
    lower.ends_with(".jar")
        && lower.starts_with("obs-telemetry-")
        && (lower.contains(&format!("+mc{version}.jar"))
            || lower.contains(&format!("-mc{version}.jar"))
            || lower.contains(&format!("_mc{version}.jar")))
}

fn find_telemetry_jar(minecraft_version: &str) -> Result<PathBuf, CommandError> {
    let resource_dir = super::obs_telemetry_package::directory()?;
    if !resource_dir.exists() {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            format!(
                "OBS telemetry resources not found: {}",
                resource_dir.display()
            ),
        ));
    }

    let mut candidates = fs::read_dir(&resource_dir)
        .map_err(|error| {
            let detail = format!("read OBS telemetry resources error: {error}");
            CommandError::from(error).context(detail)
        })?
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

    candidates.sort_by_cached_key(|path| {
        path.file_name()
            .and_then(|name| name.to_str())
            .and_then(|name| name.strip_prefix("obs-telemetry-"))
            .and_then(|name| name.split('+').next())
            .and_then(|version| semver::Version::parse(version).ok())
    });
    candidates.into_iter().next_back().ok_or_else(|| {
        CommandError::new(ErrorCode::InvalidInput, format!(
            "OBS Telemetry has no mod for Minecraft {minecraft_version} in the installed package. Update OBS Telemetry from Extensions (Fabric 1.21 through 26.3)."
        ))
    })
}

async fn install_telemetry_mod(instance: &InstanceItem) -> Result<PathBuf, CommandError> {
    let source_jar = find_telemetry_jar(&instance.version)?;
    let mods_dir = PathBuf::from(&instance.game_dir).join("mods");
    async_fs::create_dir_all(&mods_dir).await.map_err(|error| {
        let detail = format!("create mods dir error: {error}");
        CommandError::from(error).context(detail)
    })?;

    let target_file_name = source_jar
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::InvalidInput,
                "OBS telemetry jar file name missing",
            )
        })?;
    let mut transaction = crate::file_transaction::FileTransaction::new(&mods_dir)?;
    let staged = transaction.staged(target_file_name);
    async_fs::copy(&source_jar, &staged).await?;
    let mut entries = async_fs::read_dir(&mods_dir).await.map_err(|error| {
        let detail = format!("read mods dir error: {error}");
        CommandError::from(error).context(detail)
    })?;
    while let Some(entry) = entries.next_entry().await.map_err(|error| {
        let detail = format!("read mods dir entry error: {error}");
        CommandError::from(error).context(detail)
    })? {
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let lower = file_name.to_ascii_lowercase();
        if lower.ends_with(".jar")
            && lower.starts_with("obs-telemetry-")
            && file_name != target_file_name
        {
            transaction.remove(file_name)?;
        }
    }

    let target_path = mods_dir.join(target_file_name);
    transaction.replace(&staged, target_file_name)?;
    transaction.commit()?;

    Ok(target_path)
}

pub async fn prepare_obs_telemetry_for_launch(
    state: &ObsTelemetryState,
    plugin: &ObsTelemetryPluginSettings,
    instance: &InstanceItem,
) -> Result<Vec<String>, CommandError> {
    if !plugin.enabled {
        return Ok(Vec::new());
    }

    if LoaderKind::parse(&instance.loader)? != LoaderKind::Fabric {
        return Err(CommandError::new(
            ErrorCode::IncompatibleVersion,
            "OBS Telemetry requires a Fabric instance",
        ));
    }

    let installed_path = install_telemetry_mod(instance).await?;
    let (port, token) = ensure_obs_telemetry_started(state, plugin)?;

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
) -> Result<ObsTelemetryStatus, CommandError> {
    let result: Result<_, CommandError> = async { current_status(&state) }.await;
    result
}

#[tauri::command]
pub async fn start_obs_telemetry(
    state: State<'_, ObsTelemetryState>,
) -> Result<ObsTelemetryStatus, CommandError> {
    let result: Result<_, CommandError> = async {
        let settings = read_settings().await?;
        let plugin = settings.plugins.obs_telemetry;

        if !plugin.enabled {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "OBS Telemetry extension is disabled",
            ));
        }

        ensure_obs_telemetry_started(&state, &plugin)?;
        let runtime = state.inner.lock().map_err(|_| {
            CommandError::new(ErrorCode::Unknown, "OBS telemetry state lock poisoned")
        })?;
        Ok(snapshot_status(&runtime))
    }
    .await;
    result
}

#[tauri::command]
pub async fn stop_obs_telemetry(
    state: State<'_, ObsTelemetryState>,
) -> Result<ObsTelemetryStatus, CommandError> {
    stop_server(&state)
}

fn stop_server(state: &ObsTelemetryState) -> Result<ObsTelemetryStatus, CommandError> {
    let server = {
        let mut runtime = state.inner.lock().map_err(|_| {
            CommandError::new(ErrorCode::Unknown, "OBS telemetry state lock poisoned")
        })?;
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
        .map_err(|_| CommandError::new(ErrorCode::Unknown, "OBS telemetry state lock poisoned"))?;
    runtime.state = "stopped".to_string();
    runtime.last_payload = None;
    runtime.last_update_ms = None;
    push_log(&mut runtime, "stop requested from launcher");
    Ok(snapshot_status(&runtime))
}

#[tauri::command]
pub async fn open_obs_telemetry_overlay(
    state: State<'_, ObsTelemetryState>,
) -> Result<ActionResult, CommandError> {
    let result: Result<_, CommandError> = async {
        let url = {
            let runtime = state.inner.lock().map_err(|_| {
                CommandError::new(ErrorCode::Unknown, "OBS telemetry state lock poisoned")
            })?;
            overlay_url(runtime.port)
        };

        tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|error| {
            let detail = format!("open OBS overlay error: {error}");
            CommandError::from(error).context(detail)
        })?;

        Ok(ActionResult {
            ok: true,
            message: "OBS telemetry overlay opened".to_string(),
            pid: None,
        })
    }
    .await;
    result
}

const OBS_OVERLAY_HTML: &str = include_str!("obs_overlay.html");

#[cfg(test)]
mod tests {
    use super::*;

    fn request(address: std::net::SocketAddr, raw: &[u8]) -> Vec<u8> {
        let mut stream = TcpStream::connect(address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        stream.write_all(raw).unwrap();
        let mut response = Vec::new();
        stream.read_to_end(&mut response).unwrap();
        response
    }

    #[test]
    fn accepts_authenticated_data_and_reports_staleness() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let runtime = Arc::new(Mutex::new(ObsTelemetryRuntime {
            token: "test-token".into(),
            ..Default::default()
        }));
        let server = spawn_obs_server(listener, runtime.clone());
        runtime.lock().unwrap().server = Some(server);
        let body = br#"{"playerName":"Test","health":18,"maxHealth":20,"minecraftVersion":"26.3"}"#;
        let post = |token: &str| {
            let mut raw = format!("POST /api/telemetry HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\nX-Screen-OBS-Token: {token}\r\n\r\n", body.len()).into_bytes();
            raw.extend_from_slice(body);
            request(address, &raw)
        };
        assert!(post("wrong-token").starts_with(b"HTTP/1.1 401"));
        assert!(runtime.lock().unwrap().last_payload.is_none());
        assert!(post("test-token").starts_with(b"HTTP/1.1 204"));
        let response = request(
            address,
            b"GET /overlay.json HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        let offset = find_header_end(&response).unwrap() + 4;
        let json: serde_json::Value = serde_json::from_slice(&response[offset..]).unwrap();
        assert_eq!(json["lastPayload"]["playerName"], "Test");
        assert!(json.get("logs").is_none());
        let mut state = runtime.lock().unwrap();
        assert_eq!(snapshot_status(&state).state, "receiving");
        state.last_update_ms = Some(now_millis() - STALE_AFTER_MS - 1);
        assert_eq!(snapshot_status(&state).state, "waiting");
        let mut server = state.server.take().unwrap();
        drop(state);
        server.shutdown.send(()).unwrap();
        server.handle.take().unwrap().join().unwrap();
    }

    #[test]
    fn rejects_invalid_or_overflowing_content_lengths_before_reading_body() {
        for length in ["invalid", "18446744073709551615", "524289"] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                assert!(read_http_request(&mut stream).is_err());
            });
            let mut stream = TcpStream::connect(address).unwrap();
            stream
                .write_all(
                    format!("POST /api/telemetry HTTP/1.1\r\nContent-Length: {length}\r\n\r\n")
                        .as_bytes(),
                )
                .unwrap();
            server.join().unwrap();
        }
    }

    #[test]
    fn jar_selection_requires_the_exact_game_version() {
        assert!(telemetry_jar_matches_version(
            "obs-telemetry-1.1.0+mc26.3.jar",
            "26.3"
        ));
        assert!(telemetry_jar_matches_version(
            "obs-telemetry-1.1.0+mc1.21.10.jar",
            "1.21.10"
        ));
        for name in [
            "obs-telemetry-1.1.0+mc26.3.jar",
            "obs-telemetry-1.1.0+mc1.21.10.jar",
            "other-obs-telemetry-1.0+mc1.21.1.jar",
        ] {
            assert!(!telemetry_jar_matches_version(name, "1.21.1"));
        }
    }

    #[test]
    fn restarting_preserves_the_running_games_port_and_token() {
        let reservation = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = reservation.local_addr().unwrap().port();
        drop(reservation);
        let state = ObsTelemetryState::default();
        let settings = ObsTelemetryPluginSettings {
            enabled: true,
            port,
        };
        let (first_port, first_token) = start_server(&state, &settings).unwrap();
        assert_eq!(
            start_server(&state, &settings).unwrap(),
            (first_port, first_token.clone())
        );
        assert!(!stop_server(&state).unwrap().running);
        let (second_port, second_token) = start_server(&state, &settings).unwrap();
        assert_eq!(first_port, second_port);
        assert_eq!(first_token, second_token);
        stop_server(&state).unwrap();
    }
}
