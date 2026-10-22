use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::{fs, sync::watch};

use crate::models::InstanceItem;

mod dependencies;
mod file_content;
pub mod mods;
pub mod resourcepacks;
pub mod shaders;

pub use mods::*;
pub use resourcepacks::*;
pub use shaders::*;

pub(crate) const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";
pub(crate) const SEARCH_PAGE_SIZE_MAX: usize = 100;
/// Cap on simultaneous per-project metadata requests, so an instance with many
/// installed projects doesn't fire one Modrinth request each all at once.
const MAX_CONCURRENT_METADATA_REQUESTS: usize = 8;
pub(crate) const MODRINTH_SEARCH_INDEX: &str = "relevance";
pub(crate) const MOD_DOWNLOAD_CANCELLED: &str = "MOD_DOWNLOAD_CANCELLED";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ModDownloadControlState {
    Downloading,
    Paused,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModDownloadProgressPayload {
    instance_id: String,
    project_id: String,
    filename: String,
    received_bytes: u64,
    total_bytes: u64,
    percent: f64,
    state: &'static str,
}

#[derive(Clone)]
pub(crate) struct ModDownloadContext {
    app: AppHandle,
    instance_id: String,
    project_id: String,
    control: watch::Receiver<ModDownloadControlState>,
}

impl ModDownloadContext {
    pub(crate) fn new(
        app: AppHandle,
        instance_id: String,
        project_id: String,
        control: watch::Receiver<ModDownloadControlState>,
    ) -> Self {
        Self {
            app,
            instance_id,
            project_id,
            control,
        }
    }

    pub(crate) fn emit(
        &self,
        filename: &str,
        received_bytes: u64,
        total_bytes: u64,
        state: &'static str,
    ) {
        let percent = if state == "completed" {
            100.0
        } else if total_bytes == 0 {
            0.0
        } else {
            (received_bytes as f64 / total_bytes as f64 * 100.0).clamp(0.0, 100.0)
        };
        let _ = self.app.emit(
            "mod-download-progress",
            ModDownloadProgressPayload {
                instance_id: self.instance_id.clone(),
                project_id: self.project_id.clone(),
                filename: filename.to_string(),
                received_bytes,
                total_bytes,
                percent,
                state,
            },
        );
    }

    async fn wait_until_running(
        &self,
        filename: &str,
        received_bytes: u64,
        total_bytes: u64,
    ) -> Result<(), String> {
        let mut control = self.control.clone();
        let mut pause_announced = false;
        loop {
            match *control.borrow() {
                ModDownloadControlState::Downloading => {
                    if pause_announced {
                        self.emit(filename, received_bytes, total_bytes, "downloading");
                    }
                    return Ok(());
                }
                ModDownloadControlState::Paused => {
                    if !pause_announced {
                        self.emit(filename, received_bytes, total_bytes, "paused");
                        pause_announced = true;
                    }
                }
                ModDownloadControlState::Cancelled => {
                    self.emit(filename, received_bytes, total_bytes, "cancelled");
                    return Err(MOD_DOWNLOAD_CANCELLED.to_string());
                }
            }
            control
                .changed()
                .await
                .map_err(|_| MOD_DOWNLOAD_CANCELLED.to_string())?;
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthSearchResponse {
    pub total_hits: usize,
    pub hits: Vec<ModrinthProject>,
    pub offset: usize,
    pub limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthProject {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub author: String,
    pub description: String,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub display_categories: Vec<String>,
    #[serde(default)]
    pub versions: Vec<String>,
    #[serde(default)]
    pub downloads: u64,
    #[serde(default)]
    pub follows: u64,
    pub icon_url: Option<String>,
    #[serde(default)]
    pub installed: bool,
}

/// The richer project payload is fetched only after the user opens a catalog
/// item. Keeping it separate from search results keeps scrolling fast while
/// still giving the project sheet the same useful context as Modrinth.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthProjectDetails {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub author: String,
    pub description: String,
    pub body: String,
    pub project_type: String,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub loaders: Vec<String>,
    #[serde(default)]
    pub downloads: u64,
    #[serde(default)]
    pub follows: u64,
    pub icon_url: Option<String>,
    pub published: Option<String>,
    pub updated: Option<String>,
    pub license: Option<String>,
    pub source_url: Option<String>,
    pub issues_url: Option<String>,
    pub wiki_url: Option<String>,
    pub discord_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModEntry {
    pub project_id: String,
    pub version_id: String,
    pub title: String,
    pub author: String,
    #[serde(default)]
    pub icon_url: Option<String>,
    pub version_number: String,
    pub game_version: String,
    pub filename: String,
    pub installed_at: String,
    #[serde(default)]
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModView {
    pub project_id: Option<String>,
    pub title: String,
    pub author: String,
    pub version_number: Option<String>,
    pub filename: String,
    pub source: String,
    pub installed_at: Option<String>,
    /// `false` when the on-disk file carries a `.disabled` suffix (Prism-style).
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub icon_url: Option<String>,
}

impl InstalledModView {
    /// View of a Modrinth-tracked file, built from its stored metadata entry.
    pub(crate) fn from_metadata(filename: String, enabled: bool, meta: &InstalledModEntry) -> Self {
        Self {
            project_id: Some(meta.project_id.clone()),
            title: meta.title.clone(),
            author: if meta.author.trim().is_empty() {
                "MODRINTH".to_string()
            } else {
                meta.author.clone()
            },
            version_number: Some(meta.version_number.clone()),
            filename,
            source: "modrinth".to_string(),
            installed_at: Some(meta.installed_at.clone()),
            enabled,
            icon_url: meta.icon_url.clone(),
        }
    }

    /// View of an untracked file the user dropped into the folder by hand.
    pub(crate) fn local(filename: String, enabled: bool, title: String, author: &str) -> Self {
        Self {
            project_id: None,
            title,
            author: author.to_string(),
            version_number: None,
            filename,
            source: "local".to_string(),
            installed_at: None,
            enabled,
            icon_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ModrinthVersion {
    #[serde(default)]
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) project_id: String,
    #[serde(default)]
    pub(crate) author_id: String,
    #[serde(default)]
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) version_number: String,
    #[serde(default)]
    pub(crate) game_versions: Vec<String>,
    #[serde(default)]
    pub(crate) loaders: Vec<String>,
    #[serde(default)]
    pub(crate) dependencies: Vec<ModrinthDependency>,
    #[serde(default)]
    pub(crate) files: Vec<ModrinthVersionFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ModrinthDependency {
    pub(crate) version_id: Option<String>,
    pub(crate) project_id: Option<String>,
    pub(crate) file_name: Option<String>,
    #[serde(default)]
    pub(crate) dependency_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModrinthVersionFile {
    #[serde(default)]
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) filename: String,
    #[serde(default)]
    pub(crate) primary: bool,
    #[serde(default)]
    pub(crate) hashes: HashMap<String, String>,
    #[serde(default)]
    pub(crate) size: Option<u64>,
}

pub(crate) fn build_client() -> Result<Client, String> {
    // Shared client so Modrinth traffic honours the user's proxy too.
    crate::minecraft::mirrors::build_client()
}

pub(crate) async fn http_text(client: &Client, url: &str) -> Result<String, String> {
    let response = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("request error: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("read response body error: {e}"))?;

    if !status.is_success() {
        let snippet = body.chars().take(240).collect::<String>();
        return Err(format!("http error {status} for {url}: {snippet}"));
    }

    Ok(body.trim_start_matches('\u{feff}').to_string())
}

pub(crate) async fn http_json<T: serde::de::DeserializeOwned>(
    client: &Client,
    url: &str,
) -> Result<T, String> {
    let body = http_text(client, url).await?;
    serde_json::from_str::<T>(&body).map_err(|e| {
        let snippet = body.chars().take(240).collect::<String>();
        format!("json parse error: {e}; body: {snippet}")
    })
}

pub(crate) fn choose_primary_file(version: &ModrinthVersion) -> Option<&ModrinthVersionFile> {
    version
        .files
        .iter()
        .find(|file| file.primary)
        .or_else(|| version.files.first())
}

pub(crate) fn as_string_vec(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

pub(crate) fn parse_project_hit(hit: &Value) -> ModrinthProject {
    let project_id = hit
        .get("project_id")
        .or_else(|| hit.get("id"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let title = hit
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Unknown project")
        .to_string();

    let description = hit
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let author = hit
        .get("author")
        .and_then(Value::as_str)
        .or_else(|| hit.get("author_name").and_then(Value::as_str))
        .or_else(|| hit.get("owner").and_then(Value::as_str))
        .unwrap_or("Unknown author")
        .to_string();

    let follows = hit
        .get("follows")
        .and_then(Value::as_u64)
        .or_else(|| hit.get("followers").and_then(Value::as_u64))
        .unwrap_or(0);

    ModrinthProject {
        project_id,
        slug: hit
            .get("slug")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        title,
        author,
        description,
        categories: as_string_vec(hit.get("categories")),
        display_categories: as_string_vec(hit.get("display_categories")),
        versions: as_string_vec(hit.get("versions").or_else(|| hit.get("game_versions"))),
        downloads: hit.get("downloads").and_then(Value::as_u64).unwrap_or(0),
        follows,
        icon_url: hit
            .get("icon_url")
            .and_then(Value::as_str)
            .map(|s| s.to_string()),
        installed: false,
    }
}

pub(crate) async fn fetch_modrinth_search(
    client: &Client,
    query: &str,
    game_version: &str,
    project_type: &str,
    loaders: &[&str],
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, String> {
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{project_type}")]];

    if !loaders.is_empty() {
        facets.push(
            loaders
                .iter()
                .map(|loader| format!("categories:{loader}"))
                .collect(),
        );
    }

    facets.push(vec![format!("versions:{game_version}")]);

    let facets = serde_json::to_string(&facets).map_err(|e| e.to_string())?;

    let mut url = reqwest::Url::parse(&format!("{MODRINTH_API_BASE}/search"))
        .map_err(|e| format!("url parse error: {e}"))?;
    url.query_pairs_mut()
        .append_pair("query", query.trim())
        .append_pair("facets", &facets)
        .append_pair("index", MODRINTH_SEARCH_INDEX)
        .append_pair("offset", &offset.to_string())
        .append_pair("limit", &limit.to_string());

    let body = http_text(client, url.as_str()).await?;
    let json: Value = serde_json::from_str(&body).map_err(|e| {
        let snippet = body.chars().take(240).collect::<String>();
        format!("json parse error: {e}; body: {snippet}")
    })?;

    let total_hits = json.get("total_hits").and_then(Value::as_u64).unwrap_or(0) as usize;
    let offset = json
        .get("offset")
        .and_then(Value::as_u64)
        .unwrap_or(offset as u64) as usize;
    let limit = json
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(limit as u64) as usize;
    let hits = json
        .get("hits")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(parse_project_hit).collect::<Vec<_>>())
        .unwrap_or_default();

    Ok(ModrinthSearchResponse {
        total_hits,
        hits,
        offset,
        limit,
    })
}

async fn fetch_project_icon_url(
    client: &Client,
    project_id: &str,
) -> Result<Option<String>, String> {
    let project_meta: Value =
        http_json(client, &format!("{MODRINTH_API_BASE}/project/{project_id}")).await?;
    Ok(project_meta
        .get("icon_url")
        .and_then(Value::as_str)
        .map(|value| value.to_string()))
}

#[tauri::command]
pub async fn get_modrinth_project_icons(
    project_ids: Vec<String>,
) -> Result<HashMap<String, Option<String>>, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let client = build_client()?;
        let unique_ids = project_ids
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect::<HashSet<_>>();

        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(
            MAX_CONCURRENT_METADATA_REQUESTS,
        ));
        let mut tasks = tokio::task::JoinSet::new();
        for project_id in unique_ids {
            let client = client.clone();
            let semaphore = semaphore.clone();
            tasks.spawn(async move {
                let _permit = semaphore.acquire_owned().await;
                let icon_url = fetch_project_icon_url(&client, &project_id)
                    .await
                    .unwrap_or(None);
                (project_id, icon_url)
            });
        }

        let mut result = HashMap::new();
        while let Some(joined) = tasks.join_next().await {
            let (project_id, icon_url) =
                joined.map_err(|error| format!("project icon task join error: {error}"))?;
            result.insert(project_id, icon_url);
        }

        Ok(result)
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentIconRequest {
    key: String,
    title: String,
    kind: String,
}

fn icon_query(title: &str) -> Option<String> {
    let basename = title.rsplit(['/', '\\']).next()?;
    let mut filename = String::new();
    let mut previous_lowercase = false;
    for character in basename.chars() {
        if character.is_uppercase() && previous_lowercase {
            filename.push(' ');
        }
        filename.extend(character.to_lowercase());
        previous_lowercase = character.is_lowercase();
    }
    let filename = filename.strip_suffix(".disabled").unwrap_or(&filename);
    let (stem, is_file) = match filename.rsplit_once('.') {
        Some((stem, "jar" | "zip")) => (stem, true),
        _ => (filename, false),
    };
    if !is_file {
        return None;
    }
    let mut words = Vec::new();
    for word in stem
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|word| !word.is_empty())
    {
        if word.chars().all(|ch| ch.is_ascii_digit()) && words.is_empty() {
            continue;
        }
        if word.chars().all(|ch| ch.is_ascii_digit())
            || word
                .strip_prefix('v')
                .is_some_and(|rest| !rest.is_empty() && rest.chars().all(|ch| ch.is_ascii_digit()))
            || matches!(word, "fabric" | "forge" | "neoforge" | "quilt") && !words.is_empty()
        {
            break;
        }
        words.push(word);
    }
    let query = words.join(" ");
    (query.len() >= 5).then_some(query)
}

fn icon_name_matches(query: &str, candidate: &str) -> bool {
    let lower = candidate.to_lowercase();
    let normalized = lower
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    normalized == query
        || normalized.starts_with(&format!("{query} "))
        || normalized.replace(' ', "") == query.replace(' ', "")
}

async fn find_content_icon(client: &Client, request: &ContentIconRequest) -> Option<String> {
    let project_type = match request.kind.as_str() {
        "mods" => "mod",
        "shaders" => "shader",
        "resourcePacks" => "resourcepack",
        _ => return None,
    };
    let query = icon_query(&request.title)?;
    let facets = format!("[[\"project_type:{project_type}\"]]");
    let mut url = reqwest::Url::parse(&format!("{MODRINTH_API_BASE}/search")).ok()?;
    url.query_pairs_mut()
        .append_pair("query", &query)
        .append_pair("facets", &facets)
        .append_pair("index", MODRINTH_SEARCH_INDEX)
        .append_pair("limit", "10");
    let body = http_text(client, url.as_str()).await.ok()?;
    let response: Value = serde_json::from_str(&body).ok()?;
    response.get("hits")?.as_array()?.iter().find_map(|hit| {
        let project = parse_project_hit(hit);
        (icon_name_matches(&query, &project.title) || icon_name_matches(&query, &project.slug))
            .then_some(project.icon_url)
            .flatten()
    })
}

/// Looks up artwork only. A local file remains local; this never changes its
/// project id, installation state, or export behavior.
#[tauri::command]
pub async fn resolve_modrinth_content_icons(
    requests: Vec<ContentIconRequest>,
) -> Result<HashMap<String, Option<String>>, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let client = build_client()?;
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(
            MAX_CONCURRENT_METADATA_REQUESTS,
        ));
        let mut tasks = tokio::task::JoinSet::new();
        for request in requests.into_iter().take(100) {
            let client = client.clone();
            let semaphore = semaphore.clone();
            tasks.spawn(async move {
                let _permit = semaphore.acquire_owned().await;
                let icon = find_content_icon(&client, &request).await;
                (request.key, icon)
            });
        }
        let mut result = HashMap::new();
        while let Some(joined) = tasks.join_next().await {
            let (key, icon) =
                joined.map_err(|error| format!("content icon task error: {error}"))?;
            result.insert(key, icon);
        }
        Ok(result)
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

async fn fetch_project_author(client: &Client, project_id: &str) -> Result<Option<String>, String> {
    let members: Value = http_json(
        client,
        &format!("{MODRINTH_API_BASE}/project/{project_id}/members"),
    )
    .await?;
    let arr = members.as_array().cloned().unwrap_or_default();
    // Prefer the Owner; fall back to the first listed member.
    let owner = arr
        .iter()
        .find(|m| {
            m.get("role")
                .and_then(Value::as_str)
                .map(|r| r.eq_ignore_ascii_case("owner"))
                .unwrap_or(false)
        })
        .or_else(|| arr.first());
    Ok(owner
        .and_then(|m| m.get("user"))
        .and_then(|u| u.get("username"))
        .and_then(Value::as_str)
        .map(|s| s.to_string()))
}

#[tauri::command]
pub async fn get_modrinth_project_authors(
    project_ids: Vec<String>,
) -> Result<HashMap<String, Option<String>>, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let client = build_client()?;
        let unique_ids = project_ids
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect::<HashSet<_>>();

        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(
            MAX_CONCURRENT_METADATA_REQUESTS,
        ));
        let mut tasks = tokio::task::JoinSet::new();
        for project_id in unique_ids {
            let client = client.clone();
            let semaphore = semaphore.clone();
            tasks.spawn(async move {
                let _permit = semaphore.acquire_owned().await;
                let author = fetch_project_author(&client, &project_id)
                    .await
                    .unwrap_or(None);
                (project_id, author)
            });
        }

        let mut result = HashMap::new();
        while let Some(joined) = tasks.join_next().await {
            let (project_id, author) =
                joined.map_err(|error| format!("project author task join error: {error}"))?;
            result.insert(project_id, author);
        }

        Ok(result)
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

async fn download_version_file(
    client: &Client,
    file: &ModrinthVersionFile,
    path: &Path,
    context: Option<&ModDownloadContext>,
) -> Result<(), String> {
    let integrity = crate::downloads::Integrity {
        sha1: file.hashes.get("sha1").map(String::as_str),
        sha512: file.hashes.get("sha512").map(String::as_str),
        size: file.size,
    };
    if integrity.size.is_none() || (integrity.sha1.is_none() && integrity.sha512.is_none()) {
        return Err("Missing Modrinth file size or hash metadata".into());
    }
    crate::downloads::stream_to_path(
        client,
        &file.url,
        path,
        integrity,
        |received, total| async move {
            if let Some(context) = context {
                context
                    .wait_until_running(&file.filename, received, total)
                    .await?;
                context.emit(&file.filename, received, total, "downloading");
            }
            Ok(())
        },
    )
    .await
}

#[tauri::command]
pub async fn get_modrinth_project_details(
    project_id: String,
) -> Result<ModrinthProjectDetails, crate::commands::errors::CommandError> {
    let result: Result<_, String> = async {
        let project_id = project_id.trim();
        if project_id.is_empty() {
            return Err("Project id is empty".to_string());
        }

        let client = build_client()?;
        let project: Value = http_json(
            &client,
            &format!("{MODRINTH_API_BASE}/project/{project_id}"),
        )
        .await?;
        let author = fetch_project_author(&client, project_id)
            .await
            .ok()
            .flatten()
            .unwrap_or_else(|| "Modrinth".to_string());
        let license = project
            .get("license")
            .and_then(|value| {
                value
                    .get("id")
                    .or_else(|| value.get("name"))
                    .and_then(Value::as_str)
            })
            .map(str::to_string);

        Ok(ModrinthProjectDetails {
            project_id: project
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or(project_id)
                .to_string(),
            slug: project
                .get("slug")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            title: project
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Unknown project")
                .to_string(),
            author,
            description: project
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            body: project
                .get("body")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            project_type: project
                .get("project_type")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            categories: as_string_vec(project.get("categories")),
            game_versions: as_string_vec(project.get("game_versions")),
            loaders: as_string_vec(project.get("loaders")),
            downloads: project
                .get("downloads")
                .and_then(Value::as_u64)
                .unwrap_or(0),
            follows: project
                .get("followers")
                .or_else(|| project.get("follows"))
                .and_then(Value::as_u64)
                .unwrap_or(0),
            icon_url: project
                .get("icon_url")
                .and_then(Value::as_str)
                .map(str::to_string),
            published: project
                .get("published")
                .and_then(Value::as_str)
                .map(str::to_string),
            updated: project
                .get("updated")
                .and_then(Value::as_str)
                .map(str::to_string),
            license,
            source_url: project
                .get("source_url")
                .and_then(Value::as_str)
                .map(str::to_string),
            issues_url: project
                .get("issues_url")
                .and_then(Value::as_str)
                .map(str::to_string),
            wiki_url: project
                .get("wiki_url")
                .and_then(Value::as_str)
                .map(str::to_string),
            discord_url: project
                .get("discord_url")
                .and_then(Value::as_str)
                .map(str::to_string),
        })
    }
    .await;
    result.map_err(crate::commands::errors::CommandError::from)
}

pub(crate) async fn resolve_project_version(
    client: &Client,
    project_id: &str,
    game_version: &str,
    loaders: &[&str],
) -> Result<ModrinthVersion, String> {
    let game_versions = serde_json::to_string(&vec![game_version]).map_err(|e| e.to_string())?;
    let loaders_json = if loaders.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&loaders).map_err(|e| e.to_string())?)
    };

    let mut featured_url =
        reqwest::Url::parse(&format!("{MODRINTH_API_BASE}/project/{project_id}/version"))
            .map_err(|e| format!("url parse error: {e}"))?;
    {
        let mut qp = featured_url.query_pairs_mut();
        if let Some(loaders_json) = &loaders_json {
            qp.append_pair("loaders", loaders_json);
        }
        qp.append_pair("game_versions", &game_versions)
            .append_pair("featured", "true")
            .append_pair("include_changelog", "false");
    }

    let mut listed_url =
        reqwest::Url::parse(&format!("{MODRINTH_API_BASE}/project/{project_id}/version"))
            .map_err(|e| format!("url parse error: {e}"))?;
    {
        let mut qp = listed_url.query_pairs_mut();
        if let Some(loaders_json) = &loaders_json {
            qp.append_pair("loaders", loaders_json);
        }
        qp.append_pair("game_versions", &game_versions)
            .append_pair("include_changelog", "false");
    }

    let listed: Vec<ModrinthVersion> = http_json(client, listed_url.as_str()).await?;
    if let Some(version) = listed.into_iter().next() {
        return Ok(version);
    }

    let featured: Vec<ModrinthVersion> = http_json(client, featured_url.as_str())
        .await
        .unwrap_or_default();
    featured.into_iter().next().ok_or_else(|| {
        if loaders.is_empty() {
            format!("No version found for project {project_id} and Minecraft {game_version}")
        } else {
            format!(
                "No compatible version found for project {project_id}, Minecraft {game_version}, loaders {:?}",
                loaders
            )
        }
    })
}

async fn resolve_project_install_plan(
    client: &Client,
    instance: &InstanceItem,
    root_project_id: &str,
    target_dir: &Path,
    loaders: &[&str],
    state: &HashMap<String, InstalledModEntry>,
    download_context: Option<&ModDownloadContext>,
) -> Result<(Vec<dependencies::InstallPlanEntry>, HashSet<String>), String> {
    let mut available_files = HashSet::new();
    match fs::read_dir(target_dir).await {
        Ok(mut directory) => {
            while let Some(entry) = directory.next_entry().await.map_err(|e| e.to_string())? {
                if entry
                    .file_type()
                    .await
                    .map_err(|e| e.to_string())?
                    .is_file()
                {
                    available_files.insert(entry.file_name().to_string_lossy().to_string());
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("read content folder error: {error}")),
    }
    let installed = state
        .values()
        .filter(|entry| {
            !entry.version_id.is_empty()
                && entry.game_version == instance.version
                && (available_files.contains(&entry.filename)
                    || available_files.contains(&format!("{}.disabled", entry.filename)))
        })
        .map(|entry| (entry.project_id.clone(), entry))
        .collect::<HashMap<_, _>>();

    if let Some(context) = download_context {
        context
            .wait_until_running("Проверка обязательных зависимостей", 0, 0)
            .await?;
    }
    let root = resolve_project_version(client, root_project_id, &instance.version, loaders).await?;
    let plan = dependencies::resolve_required_versions(
        root,
        &instance.version,
        loaders,
        &available_files,
        |request| {
            let installed = &installed;
            async move {
                if let Some(context) = download_context {
                    context
                        .wait_until_running("Проверка обязательных зависимостей", 0, 0)
                        .await?;
                }
                match request {
                    dependencies::VersionRequest::Exact(id) => {
                        http_json(client, &format!("{MODRINTH_API_BASE}/version/{id}"))
                            .await
                            .map_err(|error| {
                                format!("Не удалось загрузить обязательную версию {id}: {error}")
                            })
                    }
                    dependencies::VersionRequest::Project(id) => {
                        if let Some(entry) = installed.get(&id) {
                            let version: ModrinthVersion = http_json(
                                client,
                                &format!("{MODRINTH_API_BASE}/version/{}", entry.version_id),
                            )
                            .await?;
                            if dependencies::version_is_compatible(
                                &version,
                                &instance.version,
                                loaders,
                            ) {
                                return Ok(version);
                            }
                        }
                        resolve_project_version(client, &id, &instance.version, loaders)
                            .await
                            .map_err(|error| {
                                format!("Не удалось подобрать обязательный мод {id}: {error}")
                            })
                    }
                }
            }
        },
    )
    .await?;
    Ok((plan, available_files))
}

fn reusable_installed_entry<'a>(
    version: &ModrinthVersion,
    file: &ModrinthVersionFile,
    state: &'a HashMap<String, InstalledModEntry>,
    available_files: &HashSet<String>,
) -> Option<&'a InstalledModEntry> {
    state.get(&file.filename).filter(|entry| {
        entry.project_id == version.project_id
            && entry.version_id == version.id
            && (available_files.contains(&file.filename)
                || available_files.contains(&format!("{}.disabled", file.filename)))
    })
}

pub(crate) async fn install_project_to_dir(
    client: &Client,
    instance: &InstanceItem,
    root_project_id: &str,
    target_dir: &Path,
    state_path: &Path,
    loaders: &[&str],
    state: &mut HashMap<String, InstalledModEntry>,
    download_context: Option<&ModDownloadContext>,
) -> Result<(), String> {
    fs::create_dir_all(target_dir)
        .await
        .map_err(|e| format!("create target dir error: {e}"))?;
    let (plan, available_files) = resolve_project_install_plan(
        client,
        instance,
        root_project_id,
        target_dir,
        loaders,
        state,
        download_context,
    )
    .await?;

    // Fetch metadata and validate all filenames before writing any mod files.
    let mut prepared = Vec::new();
    let mut filenames = HashSet::new();
    for item in plan.into_iter().rev() {
        let version = item.version;
        let file = choose_primary_file(&version)
            .ok_or_else(|| format!("No files for project {}", version.project_id))?
            .clone();
        file_content::validate_filename(&file.filename)?;
        if !filenames.insert(file.filename.clone()) {
            return Err(format!(
                "Разные обязательные моды используют одинаковое имя файла {}",
                file.filename
            ));
        }
        let existing = reusable_installed_entry(&version, &file, state, &available_files);
        let reusable = existing.is_some();
        let mut entry = if let Some(entry) = existing {
            entry.clone()
        } else {
            if let Some(context) = download_context {
                context
                    .wait_until_running(&file.filename, 0, file.size.unwrap_or(0))
                    .await?;
            }
            let project_meta: Value = http_json(
                client,
                &format!("{MODRINTH_API_BASE}/project/{}", version.project_id),
            )
            .await?;
            InstalledModEntry {
                project_id: version.project_id,
                version_id: version.id,
                title: project_meta
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("Unknown Project")
                    .to_string(),
                author: String::new(),
                icon_url: project_meta
                    .get("icon_url")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                version_number: version.version_number,
                game_version: instance.version.clone(),
                filename: file.filename.clone(),
                installed_at: crate::paths::now_string(),
                dependencies: Vec::new(),
            }
        };
        entry.dependencies = item.dependencies;
        prepared.push((file, entry, reusable));
    }

    install_prepared_files(
        client,
        target_dir,
        prepared,
        &available_files,
        state,
        download_context,
        Some(state_path),
    )
    .await
}

async fn install_prepared_files(
    client: &Client,
    target_dir: &Path,
    prepared: Vec<(ModrinthVersionFile, InstalledModEntry, bool)>,
    available_files: &HashSet<String>,
    state: &mut HashMap<String, InstalledModEntry>,
    download_context: Option<&ModDownloadContext>,
    state_path: Option<&Path>,
) -> Result<(), String> {
    let mut next_state = state.clone();
    for (file, entry, _) in &prepared {
        file_content::validate_filename(&file.filename)?;
        for (filename, old) in state
            .iter()
            .filter(|(_, old)| old.project_id == entry.project_id)
        {
            file_content::validate_filename(filename)?;
            file_content::validate_filename(&old.filename)?;
        }
        next_state.retain(|_, old| old.project_id != entry.project_id);
        next_state.insert(entry.filename.clone(), entry.clone());
    }
    let metadata = state_path
        .map(|path| {
            if path.parent() != Some(target_dir) {
                return Err("Content metadata is outside target directory".to_string());
            }
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or("Invalid content metadata filename")?;
            let bytes = serde_json::to_vec_pretty(&next_state)
                .map_err(|e| format!("serialize content state error: {e}"))?;
            Ok((name.to_owned(), bytes))
        })
        .transpose()?;
    let mut transaction = crate::file_transaction::FileTransaction::new(target_dir)?;
    for (file, _, reusable) in &prepared {
        if !*reusable {
            download_version_file(
                client,
                file,
                &transaction.staged(&file.filename),
                download_context,
            )
            .await?;
        }
    }
    if let Some(context) = download_context {
        context
            .wait_until_running("Установка мода и зависимостей", 0, 0)
            .await?;
    }
    // No await inside the commit: the journal owns all old files until the
    // atomic metadata replacement succeeds. Drop also rolls back cancellation.
    let result = (|| {
        for (file, _, reusable) in &prepared {
            if !*reusable {
                transaction.replace(&transaction.staged(&file.filename), &file.filename)?;
            } else if !available_files.contains(&file.filename) {
                // Move the disabled copy into staging first so it participates
                // in exactly the same rollback journal as downloaded files.
                let disabled = format!("{}.disabled", file.filename);
                let staged = transaction.staged(&file.filename);
                std::fs::copy(target_dir.join(&disabled), &staged)
                    .map_err(|e| format!("stage disabled mod error: {e}"))?;
                transaction.replace(&staged, &file.filename)?;
                transaction.remove(&disabled)?;
            }
        }
        let destinations = prepared
            .iter()
            .map(|(file, _, _)| file.filename.as_str())
            .collect::<HashSet<_>>();
        for (file, entry, _) in &prepared {
            for old in state
                .values()
                .filter(|old| old.project_id == entry.project_id)
            {
                for name in [old.filename.clone(), format!("{}.disabled", old.filename)] {
                    if !destinations.contains(name.as_str()) {
                        transaction.remove(&name)?;
                    }
                }
            }
            // Also remove an untracked disabled copy of the new filename.
            transaction.remove(&format!("{}.disabled", file.filename))?;
        }
        if let Some((name, bytes)) = metadata {
            transaction.write(&name, &bytes)?;
        }
        Ok(())
    })();
    if let Err(error) = result {
        return match transaction.rollback() {
            Ok(()) => Err(error),
            Err(rollback) => Err(format!("{error}; {rollback}")),
        };
    }
    transaction.commit()?;
    *state = next_state;
    Ok(())
}

#[cfg(test)]
mod installation_tests {
    use super::*;
    use sha1::Digest;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        path::PathBuf,
        time::{Duration, Instant},
    };

    struct Directory(PathBuf);

    impl Directory {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("screen-mod-install-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn entry(project: &str, version: &str, filename: &str) -> InstalledModEntry {
        InstalledModEntry {
            project_id: project.into(),
            version_id: version.into(),
            filename: filename.into(),
            game_version: "1.21.1".into(),
            ..Default::default()
        }
    }

    fn prepared(
        entry: InstalledModEntry,
        url: &str,
        reusable: bool,
    ) -> (ModrinthVersionFile, InstalledModEntry, bool) {
        (
            ModrinthVersionFile {
                filename: entry.filename.clone(),
                url: url.into(),
                size: Some(7),
                hashes: HashMap::from([(
                    "sha1".into(),
                    format!("{:x}", sha1::Sha1::digest(b"new jar")),
                )]),
                ..Default::default()
            },
            entry,
            reusable,
        )
    }

    // A single bounded HTTP request proves real file downloads without external services.
    fn serve_file() -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/mod.jar", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let task = std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(5);
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(Instant::now() < deadline, "No download request received");
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("{error}"),
                }
            };
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = [0; 4096];
            assert!(stream.read(&mut request).unwrap() > 0);
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nnew jar",
                )
                .unwrap();
        });
        (url, task)
    }

    #[tokio::test]
    async fn reuses_enabled_and_reenables_disabled_dependencies_without_downloading() {
        let directory = Directory::new();
        std::fs::write(directory.0.join("api.jar.disabled"), b"existing api").unwrap();
        std::fs::write(directory.0.join("helper.jar"), b"existing helper").unwrap();
        let api = entry("api", "api-v1", "api.jar");
        let helper = entry("helper", "helper-v1", "helper.jar");
        let mut state = HashMap::from([
            ("api.jar".into(), api.clone()),
            ("helper.jar".into(), helper.clone()),
        ]);
        install_prepared_files(
            &Client::new(),
            &directory.0,
            vec![
                prepared(api, "invalid-url", true),
                prepared(helper, "invalid-url", true),
            ],
            &HashSet::from(["api.jar.disabled".into(), "helper.jar".into()]),
            &mut state,
            None,
            None,
        )
        .await
        .unwrap();
        assert_eq!(
            std::fs::read(directory.0.join("api.jar")).unwrap(),
            b"existing api"
        );
        assert_eq!(
            std::fs::read(directory.0.join("helper.jar")).unwrap(),
            b"existing helper"
        );
        assert!(!directory.0.join("api.jar.disabled").exists());
        assert_eq!(std::fs::read_dir(&directory.0).unwrap().count(), 2);
    }

    #[tokio::test]
    async fn failed_dependency_download_leaves_existing_files_and_metadata_unchanged() {
        let directory = Directory::new();
        std::fs::write(directory.0.join("old-api.jar.disabled"), b"old api").unwrap();
        let old_api = entry("api", "old", "old-api.jar");
        let mut state = HashMap::from([("old-api.jar".into(), old_api)]);
        let before = serde_json::to_string(&state).unwrap();
        let (url, server) = serve_file();
        let result = install_prepared_files(
            &Client::builder().no_proxy().build().unwrap(),
            &directory.0,
            vec![
                prepared(entry("root", "root-v1", "root.jar"), &url, false),
                prepared(entry("api", "api-v1", "api.jar"), "invalid-url", false),
            ],
            &HashSet::from(["old-api.jar.disabled".into()]),
            &mut state,
            None,
            None,
        )
        .await;
        server.join().unwrap();
        assert!(result.is_err());
        assert_eq!(serde_json::to_string(&state).unwrap(), before);
        assert_eq!(
            std::fs::read(directory.0.join("old-api.jar.disabled")).unwrap(),
            b"old api"
        );
        assert!(!directory.0.join("root.jar").exists());
        assert!(!directory.0.join("api.jar").exists());
        assert_eq!(std::fs::read_dir(&directory.0).unwrap().count(), 1);
    }

    #[tokio::test]
    async fn replaces_old_dependency_files_and_preserves_unrelated_mods() {
        let directory = Directory::new();
        for filename in ["old-api.jar", "old-api.jar.disabled", "unrelated.jar"] {
            std::fs::write(directory.0.join(filename), b"old").unwrap();
        }
        let mut state = HashMap::from([
            ("old-api.jar".into(), entry("api", "old", "old-api.jar")),
            (
                "unrelated.jar".into(),
                entry("unrelated", "v1", "unrelated.jar"),
            ),
        ]);
        let (url, server) = serve_file();
        install_prepared_files(
            &Client::builder().no_proxy().build().unwrap(),
            &directory.0,
            vec![prepared(entry("api", "new", "api.jar"), &url, false)],
            &HashSet::from([
                "old-api.jar".into(),
                "old-api.jar.disabled".into(),
                "unrelated.jar".into(),
            ]),
            &mut state,
            None,
            None,
        )
        .await
        .unwrap();
        server.join().unwrap();
        assert_eq!(
            std::fs::read(directory.0.join("api.jar")).unwrap(),
            b"new jar"
        );
        assert_eq!(
            std::fs::read(directory.0.join("unrelated.jar")).unwrap(),
            b"old"
        );
        assert!(!directory.0.join("old-api.jar").exists());
        assert!(!directory.0.join("old-api.jar.disabled").exists());
        assert_eq!(state.len(), 2);
        assert_eq!(state["api.jar"].version_id, "new");
        assert!(!state.contains_key("old-api.jar"));
    }

    #[tokio::test]
    async fn replaces_a_dependency_that_keeps_the_same_filename() {
        let directory = Directory::new();
        std::fs::write(directory.0.join("api.jar"), b"old api").unwrap();
        std::fs::write(directory.0.join("api.jar.disabled"), b"old api").unwrap();
        let mut state = HashMap::from([("api.jar".into(), entry("api", "old", "api.jar"))]);
        let (url, server) = serve_file();
        install_prepared_files(
            &Client::builder().no_proxy().build().unwrap(),
            &directory.0,
            vec![prepared(entry("api", "new", "api.jar"), &url, false)],
            &HashSet::from(["api.jar".into(), "api.jar.disabled".into()]),
            &mut state,
            None,
            None,
        )
        .await
        .unwrap();
        server.join().unwrap();
        assert_eq!(
            std::fs::read(directory.0.join("api.jar")).unwrap(),
            b"new jar"
        );
        assert!(!directory.0.join("api.jar.disabled").exists());
        assert_eq!(state["api.jar"].version_id, "new");
    }
    #[tokio::test]
    async fn failed_commit_restores_replaced_and_removed_files_and_metadata() {
        for fail_metadata in [false, true] {
            let directory = Directory::new();
            for name in [
                "api.jar",
                "api.jar.disabled",
                "old-api.jar",
                "unrelated.jar",
            ] {
                std::fs::write(directory.0.join(name), b"old").unwrap();
            }
            let mut state = HashMap::from([
                ("old-api.jar".into(), entry("api", "old", "old-api.jar")),
                (
                    "unrelated.jar".into(),
                    entry("other", "v1", "unrelated.jar"),
                ),
            ]);
            let before = serde_json::to_vec(&state).unwrap();
            let metadata = directory.0.join("state.json");
            if fail_metadata {
                std::fs::create_dir(&metadata).unwrap();
            } else {
                std::fs::write(&metadata, &before).unwrap();
                std::fs::create_dir(directory.0.join("blocked.jar")).unwrap();
                std::fs::write(directory.0.join("blocked.jar.disabled"), b"disabled").unwrap();
            }
            let (url, server) = serve_file();
            let mut batch = vec![prepared(entry("api", "new", "api.jar"), &url, false)];
            if !fail_metadata {
                batch.push(prepared(
                    entry("blocked", "v1", "blocked.jar"),
                    "invalid",
                    true,
                ));
            }
            let result = install_prepared_files(
                &Client::builder().no_proxy().build().unwrap(),
                &directory.0,
                batch,
                &HashSet::from(["blocked.jar.disabled".into()]),
                &mut state,
                None,
                Some(&metadata),
            )
            .await;
            server.join().unwrap();
            assert!(result.is_err());
            assert_eq!(serde_json::to_vec(&state).unwrap(), before);
            for name in [
                "api.jar",
                "api.jar.disabled",
                "old-api.jar",
                "unrelated.jar",
            ] {
                assert_eq!(std::fs::read(directory.0.join(name)).unwrap(), b"old");
            }
            if !fail_metadata {
                assert_eq!(std::fs::read(&metadata).unwrap(), before);
                assert_eq!(
                    std::fs::read(directory.0.join("blocked.jar.disabled")).unwrap(),
                    b"disabled"
                );
            }
            assert!(!std::fs::read_dir(&directory.0).unwrap().any(|entry| entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".screenlauncher-install-")));
        }
    }

    #[tokio::test]
    async fn commits_files_and_metadata_as_one_batch_without_losing_other_projects() {
        let directory = Directory::new();
        let mut state = HashMap::from([(
            "unrelated.jar".into(),
            entry("other", "v1", "unrelated.jar"),
        )]);
        let metadata = directory.0.join("state.json");
        std::fs::write(&metadata, serde_json::to_vec(&state).unwrap()).unwrap();
        let (url, server) = serve_file();
        install_prepared_files(
            &Client::builder().no_proxy().build().unwrap(),
            &directory.0,
            vec![prepared(entry("api", "new", "api.jar"), &url, false)],
            &HashSet::new(),
            &mut state,
            None,
            Some(&metadata),
        )
        .await
        .unwrap();
        server.join().unwrap();
        let persisted: HashMap<String, InstalledModEntry> =
            serde_json::from_slice(&std::fs::read(metadata).unwrap()).unwrap();
        assert_eq!(persisted.len(), 2);
        assert_eq!(persisted["api.jar"].version_id, "new");
        assert_eq!(persisted["unrelated.jar"].project_id, "other");
        assert_eq!(
            std::fs::read(directory.0.join("api.jar")).unwrap(),
            b"new jar"
        );
    }
}

#[cfg(test)]
mod icon_lookup_tests {
    use super::{icon_name_matches, icon_query};

    #[test]
    fn extracts_project_names_without_versions_or_paths() {
        assert_eq!(
            icon_query("mods/architectury-9.2.14-fabric.jar"),
            Some("architectury".into())
        );
        assert_eq!(
            icon_query("cloth-config-11.1.136-fabric.jar.disabled"),
            Some("cloth config".into())
        );
        assert_eq!(
            icon_query("mods/ComplementaryShaders_v4.6.zip"),
            Some("complementary shaders".into())
        );
        assert_eq!(icon_query("mods/client.json"), None);
    }

    #[test]
    fn requires_a_name_match_before_using_search_artwork() {
        assert!(icon_name_matches("architectury", "Architectury API"));
        assert!(icon_name_matches("cloth config", "cloth-config-api"));
        assert!(icon_name_matches("fancy menu", "FancyMenu"));
        assert!(!icon_name_matches(
            "architectury",
            "The Mighty Architectury"
        ));
    }
}
