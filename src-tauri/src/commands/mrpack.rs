use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::{self as std_fs, File},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use sha2::Sha512;
use tokio::fs;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

use crate::{
    commands::{
        instances::{delete_instance, get_instance_export_data, import_instance},
        modrinth::{
            build_client, download_file, http_json, InstalledModEntry, ModrinthVersion,
            MODRINTH_API_BASE,
        },
    },
    minecraft::LoaderKind,
    models::{ExportedItem, ImportInstancePayload, InstanceExportData, InstanceItem},
    paths::{now_string, read_instances},
};

const INDEX_FILE: &str = "modrinth.index.json";
const SCREEN_META_FILE: &str = "screenlauncher.instance.json";
const OVERRIDES_PREFIX: &str = "overrides/";
const CLIENT_OVERRIDES_PREFIX: &str = "client-overrides/";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MrpackExportOptions {
    pub include_name: bool,
    pub include_ram: bool,
    pub include_java_args: bool,
    pub include_java_path: bool,
    pub include_window: bool,
    pub include_mods: bool,
    pub include_shaders: bool,
    pub include_resource_packs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MrpackImportOptions {
    pub name: String,
    pub ram: u32,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub window_width: Option<u32>,
    #[serde(default)]
    pub window_height: Option<u32>,
    #[serde(default)]
    pub fullscreen: bool,
    pub include_mods: bool,
    pub include_shaders: bool,
    pub include_resource_packs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MrpackIndex {
    format_version: u32,
    game: String,
    version_id: String,
    name: String,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    files: Vec<MrpackFile>,
    dependencies: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MrpackFile {
    path: String,
    hashes: HashMap<String, String>,
    #[serde(default)]
    env: Option<MrpackEnvironment>,
    downloads: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MrpackEnvironment {
    client: String,
    server: String,
}

#[derive(Debug, Clone)]
struct MrpackBundle {
    index: MrpackIndex,
    screen_meta: Option<InstanceExportData>,
    override_paths: Vec<String>,
}

fn safe_relative_path(raw: &str) -> Result<PathBuf, String> {
    let normalized = raw.replace('\\', "/");
    let path = Path::new(&normalized);
    if path.is_absolute() {
        return Err(format!("absolute path is not allowed in mrpack: {raw}"));
    }

    let mut safe = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => safe.push(part),
            Component::CurDir => {}
            _ => return Err(format!("unsafe path in mrpack: {raw}")),
        }
    }

    if safe.as_os_str().is_empty() {
        return Err("empty path in mrpack".to_string());
    }
    Ok(safe)
}

fn normalized_relative(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn content_kind(path: &str) -> Option<&'static str> {
    let normalized = path.replace('\\', "/").to_ascii_lowercase();
    let root = normalized.split('/').next().unwrap_or_default();
    match root {
        "mods" => Some("mods"),
        "shaderpacks" => Some("shaders"),
        "resourcepacks" => Some("resourcePacks"),
        _ => None,
    }
}

fn category_enabled(path: &str, mods: bool, shaders: bool, resource_packs: bool) -> bool {
    match content_kind(path) {
        Some("mods") => mods,
        Some("shaders") => shaders,
        Some("resourcePacks") => resource_packs,
        _ => true,
    }
}

fn should_install_on_client(file: &MrpackFile) -> bool {
    file.env
        .as_ref()
        .map(|env| !env.client.eq_ignore_ascii_case("unsupported"))
        .unwrap_or(true)
}

fn bytes_match_hashes(bytes: &[u8], hashes: &HashMap<String, String>) -> bool {
    let mut checked = false;
    if let Some(expected) = hashes.get("sha1") {
        checked = true;
        let actual = format!("{:x}", Sha1::digest(bytes));
        if !actual.eq_ignore_ascii_case(expected) {
            return false;
        }
    }
    if let Some(expected) = hashes.get("sha512") {
        checked = true;
        let actual = format!("{:x}", Sha512::digest(bytes));
        if !actual.eq_ignore_ascii_case(expected) {
            return false;
        }
    }
    checked
}

fn loader_from_dependencies(
    dependencies: &BTreeMap<String, String>,
) -> Result<(String, Option<String>), String> {
    let declared = [
        ("fabric-loader", LoaderKind::Fabric),
        ("quilt-loader", LoaderKind::Quilt),
        ("forge", LoaderKind::Forge),
        ("neoforge", LoaderKind::NeoForge),
    ]
    .into_iter()
    .filter_map(|(key, loader)| dependencies.get(key).map(|version| (loader, version)))
    .collect::<Vec<_>>();
    if declared.len() > 1 {
        return Err("mrpack declares multiple mod loaders".to_string());
    }
    Ok(declared
        .first()
        .map(|(loader, version)| {
            (
                loader.canonical_name().to_string(),
                Some((*version).clone()),
            )
        })
        .unwrap_or_else(|| ("Vanilla".to_string(), None)))
}

fn loader_dependency(
    loader: &str,
    loader_version: Option<&str>,
) -> Result<Option<(String, String)>, String> {
    let kind = LoaderKind::parse(loader)?;
    if !kind.requires_version() {
        return Ok(None);
    }
    let version = loader_version
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("{} loader version is missing", kind.canonical_name()))?;
    let key = match kind {
        LoaderKind::Fabric => "fabric-loader",
        LoaderKind::Quilt => "quilt-loader",
        LoaderKind::Forge => "forge",
        LoaderKind::NeoForge => "neoforge",
        LoaderKind::Vanilla => unreachable!(),
    };
    Ok(Some((key.to_string(), version.to_string())))
}

fn validate_index(index: &MrpackIndex) -> Result<(), String> {
    if index.format_version != 1 {
        return Err(format!(
            "Unsupported mrpack format version: {}",
            index.format_version
        ));
    }
    if !index.game.eq_ignore_ascii_case("minecraft") {
        return Err(format!("Unsupported mrpack game: {}", index.game));
    }
    if !index.dependencies.contains_key("minecraft") {
        return Err("mrpack does not declare a Minecraft version".to_string());
    }
    loader_from_dependencies(&index.dependencies)?;
    for file in &index.files {
        safe_relative_path(&file.path)?;
        if file.downloads.is_empty() {
            return Err(format!("mrpack file has no download URL: {}", file.path));
        }
        if !file.hashes.contains_key("sha1") && !file.hashes.contains_key("sha512") {
            return Err(format!("mrpack file has no supported hash: {}", file.path));
        }
    }
    Ok(())
}

fn read_bundle(path: &Path) -> Result<MrpackBundle, String> {
    let file = File::open(path).map_err(|e| format!("open mrpack error: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("invalid mrpack archive: {e}"))?;

    let index = {
        let mut entry = archive
            .by_name(INDEX_FILE)
            .map_err(|_| "mrpack is missing modrinth.index.json".to_string())?;
        let mut raw = String::new();
        entry
            .read_to_string(&mut raw)
            .map_err(|e| format!("read mrpack index error: {e}"))?;
        serde_json::from_str::<MrpackIndex>(&raw)
            .map_err(|e| format!("parse mrpack index error: {e}"))?
    };
    validate_index(&index)?;

    let screen_meta = match archive.by_name(SCREEN_META_FILE) {
        Ok(mut entry) => {
            let mut raw = String::new();
            entry
                .read_to_string(&mut raw)
                .map_err(|e| format!("read ScreenLauncher metadata error: {e}"))?;
            serde_json::from_str::<InstanceExportData>(&raw).ok()
        }
        Err(_) => None,
    };

    let mut override_paths = Vec::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|e| format!("read mrpack entry error: {e}"))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        let relative = name
            .strip_prefix(CLIENT_OVERRIDES_PREFIX)
            .or_else(|| name.strip_prefix(OVERRIDES_PREFIX));
        if let Some(relative) = relative {
            safe_relative_path(relative)?;
            override_paths.push(relative.to_string());
        }
    }

    Ok(MrpackBundle {
        index,
        screen_meta,
        override_paths,
    })
}

fn item_from_path(path: &str) -> ExportedItem {
    let title = Path::new(path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    ExportedItem {
        project_id: None,
        title,
        source: "mrpack".to_string(),
        icon_url: None,
    }
}

fn bundle_summary(bundle: MrpackBundle) -> Result<InstanceExportData, String> {
    let (loader, loader_version) = loader_from_dependencies(&bundle.index.dependencies)?;
    let version = bundle
        .index
        .dependencies
        .get("minecraft")
        .cloned()
        .ok_or_else(|| "mrpack does not declare a Minecraft version".to_string())?;

    let mut mods = Vec::new();
    let mut shaders = Vec::new();
    let mut resource_packs = Vec::new();
    let mut seen = HashSet::new();
    for path in bundle
        .index
        .files
        .iter()
        .map(|file| file.path.as_str())
        .chain(bundle.override_paths.iter().map(String::as_str))
    {
        if !seen.insert(path.to_ascii_lowercase()) {
            continue;
        }
        match content_kind(path) {
            Some("mods") => mods.push(item_from_path(path)),
            Some("shaders") => shaders.push(item_from_path(path)),
            Some("resourcePacks") => resource_packs.push(item_from_path(path)),
            _ => {}
        }
    }

    let meta = bundle.screen_meta;
    Ok(InstanceExportData {
        schema_version: 2,
        name: bundle.index.name,
        version,
        loader,
        loader_version,
        ram: meta.as_ref().map(|value| value.ram).unwrap_or(0),
        java_args: meta.as_ref().and_then(|value| value.java_args.clone()),
        java_path: meta.as_ref().and_then(|value| value.java_path.clone()),
        window_width: meta.as_ref().and_then(|value| value.window_width),
        window_height: meta.as_ref().and_then(|value| value.window_height),
        fullscreen: meta.as_ref().map(|value| value.fullscreen).unwrap_or(false),
        mods,
        shaders,
        resource_packs,
    })
}

#[tauri::command]
pub async fn read_slbuild_file(path: String) -> Result<InstanceExportData, String> {
    let raw = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read .slbuild error: {e}"))?;
    let data: InstanceExportData =
        serde_json::from_str(&raw).map_err(|e| format!("parse .slbuild error: {e}"))?;
    if data.version.trim().is_empty() || data.loader.trim().is_empty() {
        return Err("Invalid .slbuild: version or loader is missing".to_string());
    }
    if data.schema_version == 0 || data.schema_version > 2 {
        return Err(format!(
            "Unsupported .slbuild schema version: {}",
            data.schema_version
        ));
    }
    Ok(data)
}

#[tauri::command]
pub async fn inspect_mrpack(path: String) -> Result<InstanceExportData, String> {
    tokio::task::spawn_blocking(move || read_bundle(Path::new(&path)).and_then(bundle_summary))
        .await
        .map_err(|e| format!("mrpack inspection task failed: {e}"))?
}

async fn read_state(path: &Path) -> HashMap<String, InstalledModEntry> {
    let raw = fs::read_to_string(path).await.unwrap_or_default();
    serde_json::from_str(&raw).unwrap_or_default()
}

async fn collect_indexed_category(
    game_dir: &Path,
    directory: &str,
    state_file: &str,
    server_env: &str,
) -> Vec<MrpackFile> {
    let state = read_state(&game_dir.join(directory).join(state_file)).await;
    if state.is_empty() {
        return Vec::new();
    }

    let client = match build_client() {
        Ok(client) => client,
        Err(_) => return Vec::new(),
    };
    let mut indexed = Vec::new();
    for entry in state.values() {
        let local_path = game_dir.join(directory).join(&entry.filename);
        if !local_path.is_file() || entry.version_id.trim().is_empty() {
            continue;
        }

        let version: ModrinthVersion = match http_json(
            &client,
            &format!("{MODRINTH_API_BASE}/version/{}", entry.version_id),
        )
        .await
        {
            Ok(version) => version,
            Err(_) => continue,
        };
        let file = version
            .files
            .iter()
            .find(|file| file.filename == entry.filename)
            .or_else(|| version.files.iter().find(|file| file.primary))
            .or_else(|| version.files.first());
        let Some(file) = file else {
            continue;
        };
        if file.url.trim().is_empty() || file.hashes.is_empty() {
            continue;
        }
        let Ok(local_bytes) = fs::read(&local_path).await else {
            continue;
        };
        if !bytes_match_hashes(&local_bytes, &file.hashes) {
            continue;
        }

        indexed.push(MrpackFile {
            path: format!("{directory}/{}", entry.filename),
            hashes: file.hashes.clone(),
            env: Some(MrpackEnvironment {
                client: "required".to_string(),
                server: server_env.to_string(),
            }),
            downloads: vec![file.url.clone()],
            file_size: file.size,
        });
    }
    indexed
}

fn should_skip_override(
    relative: &str,
    indexed: &HashSet<String>,
    options: &MrpackExportOptions,
) -> bool {
    let normalized = relative.replace('\\', "/");
    let lower = normalized.to_ascii_lowercase();
    if indexed.contains(&lower) {
        return true;
    }
    if lower
        .split('/')
        .next_back()
        .map(|name| name.starts_with(".screenlauncher-"))
        .unwrap_or(false)
    {
        return true;
    }
    if matches!(
        lower.split('/').next().unwrap_or_default(),
        "logs" | "crash-reports" | "screenshots" | "saves" | "backups" | ".fabric" | "natives"
    ) {
        return true;
    }
    !category_enabled(
        &normalized,
        options.include_mods,
        options.include_shaders,
        options.include_resource_packs,
    )
}

fn add_overrides_to_zip(
    zip: &mut ZipWriter<File>,
    game_dir: &Path,
    current: &Path,
    indexed: &HashSet<String>,
    export_options: &MrpackExportOptions,
    zip_options: SimpleFileOptions,
) -> Result<(), String> {
    for entry in
        std_fs::read_dir(current).map_err(|e| format!("read build directory error: {e}"))?
    {
        let entry = entry.map_err(|e| format!("read build entry error: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("read build entry type error: {e}"))?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            add_overrides_to_zip(zip, game_dir, &path, indexed, export_options, zip_options)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }

        let relative_path = path
            .strip_prefix(game_dir)
            .map_err(|e| format!("resolve build path error: {e}"))?;
        let relative = normalized_relative(relative_path);
        if should_skip_override(&relative, indexed, export_options) {
            continue;
        }

        zip.start_file(format!("{OVERRIDES_PREFIX}{relative}"), zip_options)
            .map_err(|e| format!("start mrpack override error: {e}"))?;
        let mut source = File::open(&path).map_err(|e| format!("open build file error: {e}"))?;
        std::io::copy(&mut source, zip).map_err(|e| format!("write mrpack override error: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn export_instance_mrpack(
    instance_id: String,
    output_path: String,
    options: MrpackExportOptions,
) -> Result<String, String> {
    let instance = read_instances()
        .await?
        .into_iter()
        .find(|value| value.id == instance_id)
        .ok_or_else(|| "Instance not found".to_string())?;
    let game_dir = PathBuf::from(&instance.game_dir);

    let mut files = Vec::new();
    if options.include_mods {
        files.extend(
            collect_indexed_category(
                &game_dir,
                "mods",
                ".screenlauncher-modrinth.json",
                "required",
            )
            .await,
        );
    }
    if options.include_shaders {
        files.extend(
            collect_indexed_category(
                &game_dir,
                "shaderpacks",
                ".screenlauncher-modrinth-shaderpacks.json",
                "unsupported",
            )
            .await,
        );
    }
    if options.include_resource_packs {
        files.extend(
            collect_indexed_category(
                &game_dir,
                "resourcepacks",
                ".screenlauncher-modrinth-resourcepacks.json",
                "unsupported",
            )
            .await,
        );
    }

    let mut dependencies = BTreeMap::new();
    dependencies.insert("minecraft".to_string(), instance.version.clone());
    if let Some((dependency, version)) =
        loader_dependency(&instance.loader, instance.loader_version.as_deref())?
    {
        dependencies.insert(dependency, version);
    }

    let pack_name = if options.include_name && !instance.name.trim().is_empty() {
        instance.name.clone()
    } else {
        "ScreenLauncher Build".to_string()
    };
    let index = MrpackIndex {
        format_version: 1,
        game: "minecraft".to_string(),
        version_id: "1.0.0".to_string(),
        name: pack_name,
        summary: Some("Exported by ScreenLauncher".to_string()),
        files,
        dependencies,
    };

    let mut screen_meta = get_instance_export_data(instance.id.clone()).await?;
    screen_meta.name = if options.include_name {
        screen_meta.name
    } else {
        String::new()
    };
    screen_meta.ram = if options.include_ram {
        screen_meta.ram
    } else {
        0
    };
    if !options.include_java_args {
        screen_meta.java_args = None;
    }
    if !options.include_java_path {
        screen_meta.java_path = None;
    }
    if !options.include_window {
        screen_meta.window_width = None;
        screen_meta.window_height = None;
        screen_meta.fullscreen = false;
    }
    screen_meta.mods.clear();
    screen_meta.shaders.clear();
    screen_meta.resource_packs.clear();

    let output = PathBuf::from(&output_path);
    let indexed = index
        .files
        .iter()
        .map(|file| file.path.to_ascii_lowercase())
        .collect::<HashSet<_>>();
    let index_raw = serde_json::to_vec_pretty(&index)
        .map_err(|e| format!("serialize mrpack index error: {e}"))?;
    let meta_raw = serde_json::to_vec_pretty(&screen_meta)
        .map_err(|e| format!("serialize ScreenLauncher metadata error: {e}"))?;
    let game_dir_for_zip = game_dir.clone();
    let options_for_zip = options.clone();
    let output_for_result = output.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if let Some(parent) = output.parent() {
            std_fs::create_dir_all(parent)
                .map_err(|e| format!("create mrpack output directory error: {e}"))?;
        }
        let temp_path = output.with_extension("mrpack.part");
        if temp_path.exists() {
            let _ = std_fs::remove_file(&temp_path);
        }
        let file = File::create(&temp_path).map_err(|e| format!("create mrpack error: {e}"))?;
        let mut zip = ZipWriter::new(file);
        let zip_options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o644);

        zip.start_file(INDEX_FILE, zip_options)
            .map_err(|e| format!("write mrpack index entry error: {e}"))?;
        zip.write_all(&index_raw)
            .map_err(|e| format!("write mrpack index error: {e}"))?;
        zip.start_file(SCREEN_META_FILE, zip_options)
            .map_err(|e| format!("write ScreenLauncher metadata entry error: {e}"))?;
        zip.write_all(&meta_raw)
            .map_err(|e| format!("write ScreenLauncher metadata error: {e}"))?;
        add_overrides_to_zip(
            &mut zip,
            &game_dir_for_zip,
            &game_dir_for_zip,
            &indexed,
            &options_for_zip,
            zip_options,
        )?;
        zip.finish()
            .map_err(|e| format!("finish mrpack error: {e}"))?;

        if output.exists() {
            std_fs::remove_file(&output).map_err(|e| format!("replace mrpack error: {e}"))?;
        }
        std_fs::rename(&temp_path, &output).map_err(|e| format!("save mrpack error: {e}"))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("mrpack export task failed: {e}"))??;

    Ok(output_for_result.to_string_lossy().to_string())
}

async fn verify_download(path: &Path, hashes: &HashMap<String, String>) -> Result<(), String> {
    let bytes = fs::read(path)
        .await
        .map_err(|e| format!("read downloaded mrpack file error: {e}"))?;
    if bytes_match_hashes(&bytes, hashes) {
        return Ok(());
    }
    let _ = fs::remove_file(path).await;
    Err(format!("hash mismatch for {}", path.display()))
}
fn modrinth_ids(downloads: &[String]) -> Option<(String, String)> {
    for download in downloads {
        let Ok(url) = url::Url::parse(download) else {
            continue;
        };
        let Some(segments) = url.path_segments() else {
            continue;
        };
        let segments = segments.collect::<Vec<_>>();
        let Some(data_index) = segments.iter().position(|segment| *segment == "data") else {
            continue;
        };
        if segments.get(data_index + 2).copied() != Some("versions") {
            continue;
        }
        let (Some(project_id), Some(version_id)) =
            (segments.get(data_index + 1), segments.get(data_index + 3))
        else {
            continue;
        };
        return Some((project_id.to_string(), version_id.to_string()));
    }
    None
}
fn extract_override_layer(
    archive_path: &Path,
    game_dir: &Path,
    prefix: &str,
    options: &MrpackImportOptions,
) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| format!("open mrpack error: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("invalid mrpack archive: {e}"))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("read mrpack override error: {e}"))?;
        let name = entry.name().replace('\\', "/");
        let Some(relative) = name.strip_prefix(prefix) else {
            continue;
        };
        if relative.is_empty()
            || !category_enabled(
                relative,
                options.include_mods,
                options.include_shaders,
                options.include_resource_packs,
            )
        {
            continue;
        }
        let safe = safe_relative_path(relative)?;
        let destination = game_dir.join(safe);
        if entry.is_dir() {
            std_fs::create_dir_all(&destination)
                .map_err(|e| format!("create mrpack override directory error: {e}"))?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            std_fs::create_dir_all(parent)
                .map_err(|e| format!("create mrpack override parent error: {e}"))?;
        }
        let mut output = File::create(&destination)
            .map_err(|e| format!("create mrpack override file error: {e}"))?;
        std::io::copy(&mut entry, &mut output)
            .map_err(|e| format!("extract mrpack override error: {e}"))?;
    }
    Ok(())
}

async fn write_import_state(
    game_dir: &Path,
    state: HashMap<String, HashMap<String, InstalledModEntry>>,
) {
    let mappings = [
        ("mods", ".screenlauncher-modrinth.json"),
        ("shaderpacks", ".screenlauncher-modrinth-shaderpacks.json"),
        (
            "resourcepacks",
            ".screenlauncher-modrinth-resourcepacks.json",
        ),
    ];
    for (directory, filename) in mappings {
        let Some(entries) = state.get(directory) else {
            continue;
        };
        if entries.is_empty() {
            continue;
        }
        if let Ok(raw) = serde_json::to_string_pretty(entries) {
            let _ = fs::write(game_dir.join(directory).join(filename), raw).await;
        }
    }
}

#[tauri::command]
pub async fn import_mrpack(
    path: String,
    options: MrpackImportOptions,
) -> Result<InstanceItem, String> {
    let archive_path = PathBuf::from(&path);
    let bundle = tokio::task::spawn_blocking({
        let archive_path = archive_path.clone();
        move || read_bundle(&archive_path)
    })
    .await
    .map_err(|e| format!("mrpack read task failed: {e}"))??;

    let (loader, loader_version) = loader_from_dependencies(&bundle.index.dependencies)?;
    let minecraft_version = bundle
        .index
        .dependencies
        .get("minecraft")
        .cloned()
        .ok_or_else(|| "mrpack does not declare a Minecraft version".to_string())?;

    let item = import_instance(ImportInstancePayload {
        name: options.name.clone(),
        version: minecraft_version,
        loader,
        loader_version,
        ram: options.ram,
        java_args: options.java_args.clone(),
        java_path: options.java_path.clone(),
        window_width: options.window_width,
        window_height: options.window_height,
        fullscreen: options.fullscreen,
        mods: Vec::new(),
        shaders: Vec::new(),
        resource_packs: Vec::new(),
    })
    .await?
    .instance;

    let game_dir = PathBuf::from(&item.game_dir);
    let result = async {
        let client = build_client()?;
        let mut import_state: HashMap<String, HashMap<String, InstalledModEntry>> = HashMap::new();
        for file in &bundle.index.files {
            if !should_install_on_client(file)
                || !category_enabled(
                    &file.path,
                    options.include_mods,
                    options.include_shaders,
                    options.include_resource_packs,
                )
            {
                continue;
            }
            let safe_path = safe_relative_path(&file.path)?;
            let destination = game_dir.join(&safe_path);
            let mut last_error = None;
            let mut downloaded = false;
            for url in &file.downloads {
                match download_file(&client, url, &destination).await {
                    Ok(()) => match verify_download(&destination, &file.hashes).await {
                        Ok(()) => {
                            downloaded = true;
                            break;
                        }
                        Err(error) => last_error = Some(error),
                    },
                    Err(error) => last_error = Some(error),
                }
            }
            if !downloaded {
                return Err(last_error.unwrap_or_else(|| format!("download failed: {}", file.path)));
            }

            if let Some((project_id, version_id)) = modrinth_ids(&file.downloads) {
                let directory =
                    safe_path
                        .components()
                        .next()
                        .and_then(|component| match component {
                            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
                            _ => None,
                        });
                if let Some(directory) = directory {
                    if matches!(directory.as_str(), "mods" | "shaderpacks" | "resourcepacks") {
                        let filename = safe_path
                            .file_name()
                            .map(|value| value.to_string_lossy().to_string())
                            .unwrap_or_else(|| file.path.clone());
                        import_state.entry(directory).or_default().insert(
                            filename.clone(),
                            InstalledModEntry {
                                project_id,
                                version_id,
                                title: filename.clone(),
                                author: String::new(),
                                icon_url: None,
                                version_number: String::new(),
                                game_version: item.version.clone(),
                                filename,
                                installed_at: now_string(),
                                dependencies: Vec::new(),
                            },
                        );
                    }
                }
            }
        }

        let archive_for_extract = archive_path.clone();
        let game_for_extract = game_dir.clone();
        let options_for_extract = options.clone();
        tokio::task::spawn_blocking(move || {
            extract_override_layer(
                &archive_for_extract,
                &game_for_extract,
                OVERRIDES_PREFIX,
                &options_for_extract,
            )?;
            extract_override_layer(
                &archive_for_extract,
                &game_for_extract,
                CLIENT_OVERRIDES_PREFIX,
                &options_for_extract,
            )
        })
        .await
        .map_err(|e| format!("mrpack extraction task failed: {e}"))??;

        write_import_state(&game_dir, import_state).await;
        Ok::<(), String>(())
    }
    .await;

    if let Err(error) = result {
        if let Err(cleanup_error) = delete_instance(item.id.clone()).await {
            return Err(format!(
                "{error}; failed to discard incomplete build: {cleanup_error}"
            ));
        }
        if let Err(cleanup_error) =
            crate::commands::instances::purge_deleted_instance(item.id.clone()).await
        {
            return Err(format!(
                "{error}; failed to remove incomplete build from trash: {cleanup_error}"
            ));
        }
        return Err(error);
    }

    Ok(item)
}
#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn rejects_unsafe_archive_paths() {
        assert!(safe_relative_path("../escape.jar").is_err());
        assert!(safe_relative_path("mods/../../escape.jar").is_err());
        assert!(safe_relative_path("C:/escape.jar").is_err());
        assert!(safe_relative_path("mods/example.jar").is_ok());
    }

    #[test]
    fn recognizes_supported_pack_loaders_and_rejects_ambiguous_packs() {
        let quilt = BTreeMap::from([("quilt-loader".to_string(), "0.29.2".to_string())]);
        assert_eq!(
            loader_from_dependencies(&quilt).unwrap(),
            ("Quilt".to_string(), Some("0.29.2".to_string()))
        );

        let neoforge = BTreeMap::from([("neoforge".to_string(), "21.1.200".to_string())]);
        assert_eq!(
            loader_from_dependencies(&neoforge).unwrap(),
            ("NeoForge".to_string(), Some("21.1.200".to_string()))
        );

        let forge = BTreeMap::from([("forge".to_string(), "47.3.0".to_string())]);
        assert_eq!(
            loader_from_dependencies(&forge).unwrap(),
            ("Forge".to_string(), Some("47.3.0".to_string()))
        );

        let mixed = BTreeMap::from([
            ("fabric-loader".to_string(), "0.16.14".to_string()),
            ("quilt-loader".to_string(), "0.29.2".to_string()),
        ]);
        assert!(loader_from_dependencies(&mixed).is_err());
    }

    #[test]
    fn exports_loader_dependencies_with_modrinth_keys() {
        assert_eq!(loader_dependency("Vanilla", None).unwrap(), None);
        assert_eq!(
            loader_dependency("Fabric", Some("0.16.14")).unwrap(),
            Some(("fabric-loader".to_string(), "0.16.14".to_string()))
        );
        assert_eq!(
            loader_dependency("Quilt", Some("0.29.2")).unwrap(),
            Some(("quilt-loader".to_string(), "0.29.2".to_string()))
        );
        assert_eq!(
            loader_dependency("NeoForge", Some("21.1.200")).unwrap(),
            Some(("neoforge".to_string(), "21.1.200".to_string()))
        );
        assert!(loader_dependency("NeoForge", None).is_err());
    }

    #[test]
    fn reads_summary_and_filters_override_categories() {
        let root = std::env::temp_dir().join(format!("screen-mrpack-test-{}", Uuid::new_v4()));
        std_fs::create_dir_all(&root).expect("create test directory");
        let archive_path = root.join("sample.mrpack");
        let output_dir = root.join("output");
        std_fs::create_dir_all(&output_dir).expect("create output directory");

        let mut hashes = HashMap::new();
        hashes.insert("sha1".to_string(), "deadbeef".to_string());
        let index = MrpackIndex {
            format_version: 1,
            game: "minecraft".to_string(),
            version_id: "1.0.0".to_string(),
            name: "Test Pack".to_string(),
            summary: None,
            files: vec![MrpackFile {
                path: "mods/remote.jar".to_string(),
                hashes,
                env: Some(MrpackEnvironment {
                    client: "required".to_string(),
                    server: "required".to_string(),
                }),
                downloads: vec![
                    "https://cdn.modrinth.com/data/project/versions/version/remote.jar".to_string(),
                ],
                file_size: Some(42),
            }],
            dependencies: BTreeMap::from([
                ("minecraft".to_string(), "1.21.1".to_string()),
                ("fabric-loader".to_string(), "0.16.14".to_string()),
            ]),
        };

        let archive = File::create(&archive_path).expect("create archive");
        let mut zip = ZipWriter::new(archive);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        zip.start_file(INDEX_FILE, options).expect("start index");
        zip.write_all(&serde_json::to_vec(&index).expect("serialize index"))
            .expect("write index");
        zip.start_file("overrides/mods/local.jar", options)
            .expect("start local mod");
        zip.write_all(b"local mod").expect("write local mod");
        zip.start_file("overrides/config/example.toml", options)
            .expect("start config");
        zip.write_all(b"enabled=true").expect("write config");
        zip.finish().expect("finish archive");

        let bundle = read_bundle(&archive_path).expect("read bundle");
        let summary = bundle_summary(bundle).expect("build summary");
        assert_eq!(summary.name, "Test Pack");
        assert_eq!(summary.version, "1.21.1");
        assert_eq!(summary.loader, "Fabric");
        assert_eq!(summary.mods.len(), 2);

        let serialized_file = serde_json::to_value(&index.files[0]).expect("serialize file");
        assert_eq!(
            serialized_file
                .get("fileSize")
                .and_then(|value| value.as_u64()),
            Some(42)
        );

        let import_options = MrpackImportOptions {
            name: "Test Pack".to_string(),
            ram: 4,
            java_args: None,
            java_path: None,
            window_width: None,
            window_height: None,
            fullscreen: false,
            include_mods: false,
            include_shaders: true,
            include_resource_packs: true,
        };
        extract_override_layer(
            &archive_path,
            &output_dir,
            OVERRIDES_PREFIX,
            &import_options,
        )
        .expect("extract overrides");
        assert!(output_dir.join("config/example.toml").is_file());
        assert!(!output_dir.join("mods/local.jar").exists());

        std_fs::remove_dir_all(root).expect("remove test directory");
    }
}
