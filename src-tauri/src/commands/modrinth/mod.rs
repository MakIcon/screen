use std::{
    collections::{HashMap, HashSet},
    path::Path,
    time::Duration,
};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::fs;

use crate::models::InstanceItem;

pub mod mods;
pub mod resourcepacks;
pub mod shaders;

pub use mods::*;
pub use resourcepacks::*;
pub use shaders::*;

pub(crate) const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";
pub(crate) const SEARCH_PAGE_SIZE_MAX: usize = 100;
pub(crate) const MODRINTH_SEARCH_INDEX: &str = "relevance";

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
    Client::builder()
        .user_agent("ScreenLauncher/0.1.0")
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("http client error: {e}"))
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

pub(crate) async fn download_file(client: &Client, url: &str, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create parent dir error: {e}"))?;
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download request error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "download http error {} for {url}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read download bytes error: {e}"))?;

    fs::write(path, bytes)
        .await
        .map_err(|e| format!("write file error: {e}"))
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
) -> Result<HashMap<String, Option<String>>, String> {
    let client = build_client()?;
    let unique_ids = project_ids
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<HashSet<_>>();

    let mut tasks = tokio::task::JoinSet::new();
    for project_id in unique_ids {
        let client = client.clone();
        tasks.spawn(async move {
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
) -> Result<HashMap<String, Option<String>>, String> {
    let client = build_client()?;
    let unique_ids = project_ids
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<HashSet<_>>();

    let mut tasks = tokio::task::JoinSet::new();
    for project_id in unique_ids {
        let client = client.clone();
        tasks.spawn(async move {
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

pub(crate) async fn install_project_to_dir(
    client: &Client,
    instance: &InstanceItem,
    root_project_id: &str,
    target_dir: &Path,
    loaders: &[&str],
    state: &mut HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    fs::create_dir_all(target_dir)
        .await
        .map_err(|e| format!("create target dir error: {e}"))?;

    let mut project_queue = vec![root_project_id.to_string()];
    let mut installed_project_ids = state
        .values()
        .map(|v| v.project_id.clone())
        .collect::<std::collections::HashSet<_>>();

    while let Some(project_id) = project_queue.pop() {
        if installed_project_ids.contains(&project_id) {
            continue;
        }

        let project_meta: Value =
            http_json(client, &format!("{MODRINTH_API_BASE}/project/{project_id}")).await?;
        let project_title = project_meta
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Project")
            .to_string();
        let project_icon_url = project_meta
            .get("icon_url")
            .and_then(Value::as_str)
            .map(|value| value.to_string());

        let version =
            resolve_project_version(client, &project_id, &instance.version, loaders).await?;
        let file = choose_primary_file(&version)
            .ok_or_else(|| format!("No files for project {}", project_id))?
            .clone();

        let target_path = target_dir.join(&file.filename);
        download_file(client, &file.url, &target_path).await?;

        state.insert(
            file.filename.clone(),
            InstalledModEntry {
                project_id: project_id.clone(),
                version_id: version.id.clone(),
                title: project_title,
                author: String::new(),
                icon_url: project_icon_url,
                version_number: version.version_number,
                game_version: instance.version.clone(),
                filename: file.filename,
                installed_at: crate::paths::now_string(),
                dependencies: version
                    .dependencies
                    .iter()
                    .filter(|d| d.dependency_type == "required")
                    .filter_map(|d| d.project_id.clone())
                    .collect(),
            },
        );

        installed_project_ids.insert(project_id);

        for dep in version.dependencies {
            if dep.dependency_type == "required" {
                if let Some(dep_id) = dep.project_id {
                    project_queue.push(dep_id);
                }
            }
        }
    }

    Ok(())
}
