use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    time::Duration,
};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::fs;

use crate::{
    models::{ActionResult, InstanceItem, MinecraftManifest},
    paths::{read_instances, MANIFEST_URL},
};

const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";
const MODRINTH_STATE_FILE: &str = ".screenlauncher-modrinth.json";
const MODRINTH_RESOURCEPACK_STATE_FILE: &str = ".screenlauncher-modrinth-resourcepacks.json";
const MODRINTH_SHADERPACK_STATE_FILE: &str = ".screenlauncher-modrinth-shaderpacks.json";
const SEARCH_PAGE_SIZE_MAX: usize = 100;
const MODRINTH_SEARCH_INDEX: &str = "relevance";

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
#[serde(rename_all = "camelCase")]
struct ModrinthVersion {
    #[serde(default)]
    id: String,
    #[serde(default)]
    project_id: String,
    #[serde(default)]
    author_id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    version_number: String,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
    #[serde(default)]
    dependencies: Vec<ModrinthDependency>,
    #[serde(default)]
    files: Vec<ModrinthVersionFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ModrinthDependency {
    version_id: Option<String>,
    project_id: Option<String>,
    file_name: Option<String>,
    #[serde(default)]
    dependency_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ModrinthVersionFile {
    #[serde(default)]
    url: String,
    #[serde(default)]
    filename: String,
    #[serde(default)]
    primary: bool,
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("ScreenLauncher/0.1.0")
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("http client error: {e}"))
}

fn mods_dir_for_instance(instance: &InstanceItem) -> PathBuf {
    PathBuf::from(&instance.game_dir).join("mods")
}

fn metadata_path_for_instance(instance: &InstanceItem) -> PathBuf {
    mods_dir_for_instance(instance).join(MODRINTH_STATE_FILE)
}

async fn ensure_mods_dir(instance: &InstanceItem) -> Result<PathBuf, String> {
    let mods_dir = mods_dir_for_instance(instance);
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)
            .await
            .map_err(|e| format!("create mods dir error: {e}"))?;
    }
    Ok(mods_dir)
}

fn resourcepacks_dir_for_instance(instance: &InstanceItem) -> PathBuf {
    PathBuf::from(&instance.game_dir).join("resourcepacks")
}

fn resourcepacks_metadata_path_for_instance(instance: &InstanceItem) -> PathBuf {
    resourcepacks_dir_for_instance(instance).join(MODRINTH_RESOURCEPACK_STATE_FILE)
}

async fn ensure_resourcepacks_dir(instance: &InstanceItem) -> Result<PathBuf, String> {
    let dir = resourcepacks_dir_for_instance(instance);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| format!("create resourcepacks dir error: {e}"))?;
    }
    Ok(dir)
}

fn shaderpacks_dir_for_instance(instance: &InstanceItem) -> PathBuf {
    PathBuf::from(&instance.game_dir).join("shaderpacks")
}

fn shaderpacks_metadata_path_for_instance(instance: &InstanceItem) -> PathBuf {
    shaderpacks_dir_for_instance(instance).join(MODRINTH_SHADERPACK_STATE_FILE)
}

async fn ensure_shaderpacks_dir(instance: &InstanceItem) -> Result<PathBuf, String> {
    let dir = shaderpacks_dir_for_instance(instance);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| format!("create shaderpacks dir error: {e}"))?;
    }
    Ok(dir)
}

async fn read_modrinth_state(
    instance: &InstanceItem,
) -> Result<HashMap<String, InstalledModEntry>, String> {
    let path = metadata_path_for_instance(instance);
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read Modrinth state error: {e}"))?;

    serde_json::from_str(&raw).map_err(|e| format!("parse Modrinth state error: {e}"))
}

async fn write_modrinth_state(
    instance: &InstanceItem,
    state: &HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    let path = metadata_path_for_instance(instance);
    let raw = serde_json::to_string_pretty(state)
        .map_err(|e| format!("serialize Modrinth state error: {e}"))?;
    fs::write(path, raw)
        .await
        .map_err(|e| format!("write Modrinth state error: {e}"))
}

async fn read_modrinth_resourcepack_state(
    instance: &InstanceItem,
) -> Result<HashMap<String, InstalledModEntry>, String> {
    let path = resourcepacks_metadata_path_for_instance(instance);
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read Modrinth resourcepack state error: {e}"))?;

    serde_json::from_str(&raw)
        .map_err(|e| format!("parse Modrinth resourcepack state error: {e}"))
}

async fn write_modrinth_resourcepack_state(
    instance: &InstanceItem,
    state: &HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    let path = resourcepacks_metadata_path_for_instance(instance);
    let raw = serde_json::to_string_pretty(state)
        .map_err(|e| format!("serialize Modrinth resourcepack state error: {e}"))?;

    fs::write(path, raw)
        .await
        .map_err(|e| format!("write Modrinth resourcepack state error: {e}"))
}

async fn read_modrinth_shaderpack_state(
    instance: &InstanceItem,
) -> Result<HashMap<String, InstalledModEntry>, String> {
    let path = shaderpacks_metadata_path_for_instance(instance);
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read Modrinth shaderpack state error: {e}"))?;

    serde_json::from_str(&raw)
        .map_err(|e| format!("parse Modrinth shaderpack state error: {e}"))
}

async fn write_modrinth_shaderpack_state(
    instance: &InstanceItem,
    state: &HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    let path = shaderpacks_metadata_path_for_instance(instance);
    let raw = serde_json::to_string_pretty(state)
        .map_err(|e| format!("serialize Modrinth shaderpack state error: {e}"))?;

    fs::write(path, raw)
        .await
        .map_err(|e| format!("write Modrinth shaderpack state error: {e}"))
}

async fn http_text(client: &Client, url: &str) -> Result<String, String> {
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

async fn http_json<T: serde::de::DeserializeOwned>(client: &Client, url: &str) -> Result<T, String> {
    let body = http_text(client, url).await?;
    serde_json::from_str::<T>(&body).map_err(|e| {
        let snippet = body.chars().take(240).collect::<String>();
        format!("json parse error: {e}; body: {snippet}")
    })
}

async fn download_file(client: &Client, url: &str, path: &Path) -> Result<(), String> {
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
        return Err(format!("download http error {} for {url}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read download bytes error: {e}"))?;

    fs::write(path, bytes)
        .await
        .map_err(|e| format!("write file error: {e}"))
}

fn choose_primary_file(version: &ModrinthVersion) -> Option<&ModrinthVersionFile> {
    version
        .files
        .iter()
        .find(|file| file.primary)
        .or_else(|| version.files.first())
}

fn as_string_vec(value: Option<&Value>) -> Vec<String> {
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

fn parse_project_hit(hit: &Value) -> ModrinthProject {
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
        icon_url: hit.get("icon_url").and_then(Value::as_str).map(|s| s.to_string()),
        installed: false,
    }
}

async fn fetch_modrinth_search(
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
    let offset = json.get("offset").and_then(Value::as_u64).unwrap_or(offset as u64) as usize;
    let limit = json.get("limit").and_then(Value::as_u64).unwrap_or(limit as u64) as usize;
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

async fn fetch_manifest_releases(client: &Client) -> Result<Vec<String>, String> {
    let manifest: MinecraftManifest = http_json(client, MANIFEST_URL).await?;
    let mut versions = manifest
        .versions
        .into_iter()
        .filter(|v| v.r#type == "release")
        .map(|v| v.id)
        .collect::<Vec<_>>();
    versions.sort();
    versions.reverse();
    Ok(versions)
}

async fn resolve_project_version(
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

    let featured: Vec<ModrinthVersion> =
        http_json(client, featured_url.as_str()).await.unwrap_or_default();
    if let Some(version) = featured.into_iter().next() {
        return Ok(version);
    }

    let listed: Vec<ModrinthVersion> = http_json(client, listed_url.as_str()).await?;
    listed.into_iter().next().ok_or_else(|| {
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

async fn install_project_to_dir(
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
        .collect::<HashSet<_>>();

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

        let version = resolve_project_version(client, &project_id, &instance.version, loaders).await?;
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

async fn merge_and_write_modrinth_state(
    instance: &InstanceItem,
    additions: &HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    let mut latest = read_modrinth_state(instance).await.unwrap_or_default();

    for (filename, entry) in additions {
        latest.insert(filename.clone(), entry.clone());
    }

    write_modrinth_state(instance, &latest).await
}

async fn merge_and_write_modrinth_resourcepack_state(
    instance: &InstanceItem,
    additions: &HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    let mut latest = read_modrinth_resourcepack_state(instance)
        .await
        .unwrap_or_default();

    for (filename, entry) in additions {
        latest.insert(filename.clone(), entry.clone());
    }

    write_modrinth_resourcepack_state(instance, &latest).await
}

async fn merge_and_write_modrinth_shaderpack_state(
    instance: &InstanceItem,
    additions: &HashMap<String, InstalledModEntry>,
) -> Result<(), String> {
    let mut latest = read_modrinth_shaderpack_state(instance)
        .await
        .unwrap_or_default();

    for (filename, entry) in additions {
        latest.insert(filename.clone(), entry.clone());
    }

    write_modrinth_shaderpack_state(instance, &latest).await
}

#[tauri::command]
pub async fn get_modrinth_fabric_versions() -> Result<Vec<String>, String> {
    let client = build_client()?;
    fetch_manifest_releases(&client).await
}

#[tauri::command]
pub async fn search_modrinth_mods(
    instance_id: Option<String>,
    query: String,
    game_version: String,
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, String> {
    let client = build_client()?;
    let limit = limit.clamp(1, SEARCH_PAGE_SIZE_MAX);
    let mut response = fetch_modrinth_search(
        &client,
        &query,
        &game_version,
        "mod",
        &["fabric"],
        offset,
        limit,
    )
    .await?;

    if let Some(instance_id) = instance_id {
        let items = read_instances().await?;
        if let Some(instance) = items.into_iter().find(|item| item.id == instance_id) {
            let state = read_modrinth_state(&instance).await?;
            let installed_project_ids = state
                .values()
                .map(|entry| entry.project_id.clone())
                .collect::<HashSet<_>>();

            for hit in &mut response.hits {
                hit.installed = installed_project_ids.contains(&hit.project_id);
            }
        }
    }

    Ok(response)
}

#[tauri::command]
pub async fn search_modrinth_resourcepacks(
    instance_id: Option<String>,
    query: String,
    game_version: String,
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, String> {
    let client = build_client()?;
    let limit = limit.clamp(1, SEARCH_PAGE_SIZE_MAX);

    let mut response = fetch_modrinth_search(
        &client,
        &query,
        &game_version,
        "resourcepack",
        &[],
        offset,
        limit,
    )
    .await?;

    if let Some(instance_id) = instance_id {
        let items = read_instances().await?;
        if let Some(instance) = items.into_iter().find(|item| item.id == instance_id) {
            let state = read_modrinth_resourcepack_state(&instance).await?;
            let installed_project_ids = state
                .values()
                .map(|entry| entry.project_id.clone())
                .collect::<HashSet<_>>();

            for hit in &mut response.hits {
                hit.installed = installed_project_ids.contains(&hit.project_id);
            }
        }
    }

    Ok(response)
}

#[tauri::command]
pub async fn search_modrinth_shaders(
    instance_id: Option<String>,
    query: String,
    game_version: String,
    offset: usize,
    limit: usize,
) -> Result<ModrinthSearchResponse, String> {
    let client = build_client()?;
    let limit = limit.clamp(1, SEARCH_PAGE_SIZE_MAX);

    let mut response = fetch_modrinth_search(
        &client,
        &query,
        &game_version,
        "shader",
        &[],
        offset,
        limit,
    )
    .await?;

    if let Some(instance_id) = instance_id {
        let items = read_instances().await?;
        if let Some(instance) = items.into_iter().find(|item| item.id == instance_id) {
            let state = read_modrinth_shaderpack_state(&instance).await?;
            let installed_project_ids = state
                .values()
                .map(|entry| entry.project_id.clone())
                .collect::<HashSet<_>>();

            for hit in &mut response.hits {
                hit.installed = installed_project_ids.contains(&hit.project_id);
            }
        }
    }

    Ok(response)
}

#[tauri::command]
pub async fn install_modrinth_project(
    instance_id: String,
    project_id: String,
) -> Result<ActionResult, String> {
    let client = build_client()?;
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;

    let target_dir = ensure_mods_dir(&instance).await?;
    let mut install_batch = HashMap::new();

    install_project_to_dir(
        &client,
        &instance,
        &project_id,
        &target_dir,
        &["fabric"],
        &mut install_batch,
    )
    .await?;

    merge_and_write_modrinth_state(&instance, &install_batch).await?;

    Ok(ActionResult {
        ok: true,
        message: "Installed".into(),
        pid: None,
    })
}

#[tauri::command]
pub async fn install_modrinth_resourcepack(
    instance_id: String,
    project_id: String,
) -> Result<ActionResult, String> {
    let client = build_client()?;
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;

    let target_dir = ensure_resourcepacks_dir(&instance).await?;
    let mut install_batch = HashMap::new();

    install_project_to_dir(
        &client,
        &instance,
        &project_id,
        &target_dir,
        &[],
        &mut install_batch,
    )
    .await?;

    merge_and_write_modrinth_resourcepack_state(&instance, &install_batch).await?;

    Ok(ActionResult {
        ok: true,
        message: "Resource pack installed".into(),
        pid: None,
    })
}

#[tauri::command]
pub async fn install_modrinth_shader(
    instance_id: String,
    project_id: String,
) -> Result<ActionResult, String> {
    let client = build_client()?;
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;

    let target_dir = ensure_shaderpacks_dir(&instance).await?;
    let mut install_batch = HashMap::new();

    install_project_to_dir(
        &client,
        &instance,
        &project_id,
        &target_dir,
        &[],
        &mut install_batch,
    )
    .await?;

    merge_and_write_modrinth_shaderpack_state(&instance, &install_batch).await?;

    Ok(ActionResult {
        ok: true,
        message: "Shader installed".into(),
        pid: None,
    })
}

#[tauri::command]
pub async fn uninstall_modrinth_mod(
    instance_id: String,
    filename: String,
) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;

    let mods_dir = mods_dir_for_instance(&instance);
    let file_path = mods_dir.join(&filename);
    if file_path.exists() {
        fs::remove_file(&file_path)
            .await
            .map_err(|e| format!("remove file error: {e}"))?;
    }

    let mut latest_state = read_modrinth_state(&instance).await.unwrap_or_default();
    latest_state.remove(&filename);
    write_modrinth_state(&instance, &latest_state).await?;

    Ok(ActionResult {
        ok: true,
        message: "Deleted".into(),
        pid: None,
    })
}

#[tauri::command]
pub async fn uninstall_modrinth_resourcepack(
    instance_id: String,
    filename: String,
) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;

    let dir = resourcepacks_dir_for_instance(&instance);
    let file_path = dir.join(&filename);

    if file_path.exists() {
        fs::remove_file(&file_path)
            .await
            .map_err(|e| format!("remove resourcepack file error: {e}"))?;
    }

    let mut latest_state = read_modrinth_resourcepack_state(&instance)
        .await
        .unwrap_or_default();
    latest_state.remove(&filename);
    write_modrinth_resourcepack_state(&instance, &latest_state).await?;

    Ok(ActionResult {
        ok: true,
        message: "Resource pack deleted".into(),
        pid: None,
    })
}

#[tauri::command]
pub async fn uninstall_modrinth_shader(
    instance_id: String,
    filename: String,
) -> Result<ActionResult, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;

    let dir = shaderpacks_dir_for_instance(&instance);
    let file_path = dir.join(&filename);

    if file_path.exists() {
        fs::remove_file(&file_path)
            .await
            .map_err(|e| format!("remove shader file error: {e}"))?;
    }

    let mut latest_state = read_modrinth_shaderpack_state(&instance)
        .await
        .unwrap_or_default();
    latest_state.remove(&filename);
    write_modrinth_shaderpack_state(&instance, &latest_state).await?;

    Ok(ActionResult {
        ok: true,
        message: "Shader deleted".into(),
        pid: None,
    })
}

#[tauri::command]
pub async fn list_installed_mods(instance_id: String) -> Result<Vec<InstalledModView>, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| "Instance not found".to_string())?;

    let mods_dir = ensure_mods_dir(&instance).await?;
    let state = read_modrinth_state(&instance).await.unwrap_or_default();
    let mut entries = fs::read_dir(&mods_dir)
        .await
        .map_err(|e| format!("read mods dir error: {e}"))?;

    let mut out = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("mods dir iteration error: {e}"))?
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(filename) = path.file_name().map(|name| name.to_string_lossy().to_string()) else {
            continue;
        };
        if filename == MODRINTH_STATE_FILE {
            continue;
        }
        if !filename.ends_with(".jar") && !filename.ends_with(".zip") && !filename.ends_with(".disabled") {
            continue;
        }

        if let Some(meta) = state.get(&filename) {
            out.push(InstalledModView {
                project_id: Some(meta.project_id.clone()),
                title: meta.title.clone(),
                author: if meta.author.is_empty() {
                    "MODRINTH".to_string()
                } else {
                    meta.author.clone()
                },
                version_number: Some(meta.version_number.clone()),
                filename,
                source: "modrinth".to_string(),
                installed_at: Some(meta.installed_at.clone()),
            });
        } else {
            out.push(InstalledModView {
                project_id: None,
                title: filename
                    .trim_end_matches(".jar")
                    .trim_end_matches(".zip")
                    .to_string(),
                author: "LOCAL FILE".to_string(),
                version_number: None,
                filename,
                source: "local".to_string(),
                installed_at: None,
            });
        }
    }

    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub async fn list_installed_resourcepacks(
    instance_id: String,
) -> Result<Vec<InstalledModView>, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| "Instance not found".to_string())?;

    let dir = ensure_resourcepacks_dir(&instance).await?;
    let state = read_modrinth_resourcepack_state(&instance)
        .await
        .unwrap_or_default();
    let mut entries = fs::read_dir(&dir)
        .await
        .map_err(|e| format!("read resourcepacks dir error: {e}"))?;

    let mut out = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("resourcepacks dir iteration error: {e}"))?
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(filename) = path.file_name().map(|name| name.to_string_lossy().to_string()) else {
            continue;
        };

        if filename == MODRINTH_RESOURCEPACK_STATE_FILE {
            continue;
        }

        if !filename.ends_with(".zip") && !filename.ends_with(".disabled") {
            continue;
        }

        if let Some(meta) = state.get(&filename) {
            out.push(InstalledModView {
                project_id: Some(meta.project_id.clone()),
                title: meta.title.clone(),
                author: if meta.author.trim().is_empty() {
                    "MODRINTH".to_string()
                } else {
                    meta.author.clone()
                },
                version_number: Some(meta.version_number.clone()),
                filename: meta.filename.clone(),
                source: "modrinth".to_string(),
                installed_at: Some(meta.installed_at.clone()),
            });
        } else {
            out.push(InstalledModView {
                project_id: None,
                title: filename.clone(),
                author: "LOCAL".to_string(),
                version_number: None,
                filename,
                source: "local".to_string(),
                installed_at: None,
            });
        }
    }

    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub async fn list_installed_shaders(
    instance_id: String,
) -> Result<Vec<InstalledModView>, String> {
    let items = read_instances().await?;
    let instance = items
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| "Instance not found".to_string())?;

    let dir = ensure_shaderpacks_dir(&instance).await?;
    let state = read_modrinth_shaderpack_state(&instance)
        .await
        .unwrap_or_default();
    let mut entries = fs::read_dir(&dir)
        .await
        .map_err(|e| format!("read shaderpacks dir error: {e}"))?;

    let mut out = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("shaderpacks dir iteration error: {e}"))?
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(filename) = path.file_name().map(|name| name.to_string_lossy().to_string()) else {
            continue;
        };

        if filename == MODRINTH_SHADERPACK_STATE_FILE {
            continue;
        }

        if !filename.ends_with(".zip") && !filename.ends_with(".disabled") {
            continue;
        }

        if let Some(meta) = state.get(&filename) {
            out.push(InstalledModView {
                project_id: Some(meta.project_id.clone()),
                title: meta.title.clone(),
                author: if meta.author.trim().is_empty() {
                    "MODRINTH".to_string()
                } else {
                    meta.author.clone()
                },
                version_number: Some(meta.version_number.clone()),
                filename: meta.filename.clone(),
                source: "modrinth".to_string(),
                installed_at: Some(meta.installed_at.clone()),
            });
        } else {
            out.push(InstalledModView {
                project_id: None,
                title: filename.clone(),
                author: "LOCAL".to_string(),
                version_number: None,
                filename,
                source: "local".to_string(),
                installed_at: None,
            });
        }
    }

    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(out)
}
