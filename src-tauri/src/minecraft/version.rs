use std::{collections::HashMap, path::PathBuf};

use reqwest::Client;

use crate::{
    models::{
        ArgumentItem, ArgumentValue, DownloadInfo, Library, ManifestVersion, MinecraftManifest,
        VersionArguments, VersionDownloads, VersionMeta,
    },
    paths::{ensure_layout, libraries_root, versions_root},
};

use super::{downloader::download_to_path, manifest::fetch_manifest_network};

async fn load_or_fetch_version_json(
    client: &Client,
    version_id: &str,
) -> Result<VersionMeta, String> {
    ensure_layout().await?;
    let json_path = versions_root()?
        .join(version_id)
        .join(format!("{version_id}.json"));

    if !json_path.exists() {
        let manifest: MinecraftManifest = fetch_manifest_network(client).await?;
        let found: ManifestVersion = manifest
            .versions
            .into_iter()
            .find(|v| v.id == version_id)
            .ok_or_else(|| format!("version not found in manifest: {version_id}"))?;

        download_to_path(client, &found.url, &json_path).await?;
    }

    let raw = tokio::fs::read_to_string(&json_path)
        .await
        .map_err(|e| format!("read version json error: {e}"))?;

    serde_json::from_str(&raw).map_err(|e| format!("parse version json error: {e}"))
}

fn merge_arguments(
    parent: Option<VersionArguments>,
    child: Option<VersionArguments>,
) -> Option<VersionArguments> {
    match (parent, child) {
        (None, None) => None,
        (Some(p), None) => Some(p),
        (None, Some(c)) => Some(c),
        (Some(mut p), Some(c)) => {
            let mut game = p.game.take().unwrap_or_default();
            game.extend(c.game.unwrap_or_default());
            let mut jvm = p.jvm.take().unwrap_or_default();
            jvm.extend(c.jvm.unwrap_or_default());
            Some(VersionArguments {
                game: Some(game),
                jvm: Some(jvm),
            })
        }
    }
}

fn merge_downloads(
    parent: Option<VersionDownloads>,
    child: Option<VersionDownloads>,
) -> Option<VersionDownloads> {
    match (parent, child) {
        (None, None) => None,
        (Some(p), None) => Some(p),
        (None, Some(c)) => Some(c),
        (Some(p), Some(c)) => Some(VersionDownloads {
            client: c.client.or(p.client),
        }),
    }
}

fn dedup_libraries(libraries: Vec<Library>) -> Vec<Library> {
    let mut seen = std::collections::HashSet::new();
    let mut result: Vec<Library> = Vec::new();
    // Key = group:artifact:classifier (ignores version only).
    // Reverse iteration means child (Fabric) version wins over parent (vanilla).
    for lib in libraries.into_iter().rev() {
        let parts: Vec<&str> = lib.name.split(':').collect();
        let group = parts.first().copied().unwrap_or("");
        let artifact = parts.get(1).copied().unwrap_or("");
        let classifier = parts.get(3).copied().unwrap_or("");
        let key = format!("{group}:{artifact}:{classifier}");
        if seen.insert(key) {
            result.push(lib);
        }
    }
    result.reverse();
    result
}

fn merge_meta(parent: VersionMeta, child: VersionMeta) -> VersionMeta {
    let mut libraries = parent.libraries;
    libraries.extend(child.libraries);
    let libraries = dedup_libraries(libraries);

    VersionMeta {
        id: child.id,
        inherits_from: None,
        main_class: child.main_class.or(parent.main_class),
        assets: child.assets.or(parent.assets),
        asset_index: child.asset_index.or(parent.asset_index),
        downloads: merge_downloads(parent.downloads, child.downloads),
        libraries,
        arguments: merge_arguments(parent.arguments, child.arguments),
        minecraft_arguments: child.minecraft_arguments.or(parent.minecraft_arguments),
        java_version: child.java_version.or(parent.java_version),
        logging: child.logging.or(parent.logging),
    }
}

pub async fn resolve_version_meta(
    client: &Client,
    version_id: &str,
) -> Result<VersionMeta, String> {
    let mut chain = Vec::new();
    let mut current = load_or_fetch_version_json(client, version_id).await?;

    loop {
        let parent = current.inherits_from.clone();
        chain.push(current);
        if let Some(parent_id) = parent {
            current = load_or_fetch_version_json(client, &parent_id).await?;
        } else {
            break;
        }
    }

    chain.reverse();
    let mut resolved = chain
        .first()
        .cloned()
        .ok_or_else(|| "empty version resolution chain".to_string())?;

    for item in chain.into_iter().skip(1) {
        resolved = merge_meta(resolved, item);
    }

    Ok(resolved)
}

fn current_os_name() -> &'static str {
    "windows"
}

fn current_arch_string() -> &'static str {
    if cfg!(target_pointer_width = "64") {
        "64"
    } else {
        "32"
    }
}

pub fn evaluate_rules(rules: &Option<Vec<crate::models::Rule>>) -> bool {
    let Some(rules) = rules else {
        return true;
    };
    let mut allowed = false;

    for rule in rules {
        let os_match = match &rule.os {
            None => true,
            Some(os) => {
                let name_ok = os
                    .name
                    .as_ref()
                    .map(|name| name == current_os_name())
                    .unwrap_or(true);
                let arch_ok = os
                    .arch
                    .as_ref()
                    .map(|arch| {
                        let want_64 = arch.contains('6') && arch.contains('4');
                        let have_64 = current_arch_string() == "64";
                        want_64 == have_64
                    })
                    .unwrap_or(true);
                name_ok && arch_ok
            }
        };

        if os_match {
            allowed = rule.action == "allow";
        }
    }

    allowed
}

pub fn replace_tokens(input: &str, tokens: &HashMap<&str, String>) -> String {
    let mut out = input.to_string();
    for (key, value) in tokens {
        let marker = format!("${{{key}}}");
        out = out.replace(&marker, value);
    }
    out
}

pub fn collect_argument_list(
    items: &[ArgumentItem],
    tokens: &HashMap<&str, String>,
) -> Vec<String> {
    let mut out = Vec::new();
    for item in items {
        match item {
            ArgumentItem::String(s) => out.push(replace_tokens(s, tokens)),
            ArgumentItem::Ruled { rules, value } => {
                if !evaluate_rules(&Some(rules.clone())) {
                    continue;
                }
                match value {
                    ArgumentValue::Single(s) => out.push(replace_tokens(s, tokens)),
                    ArgumentValue::Multi(list) => {
                        for s in list {
                            out.push(replace_tokens(s, tokens));
                        }
                    }
                }
            }
        }
    }
    out
}

fn parse_library_name(name: &str) -> Option<(String, String, String, Option<String>, String)> {
    let (coords, ext) = match name.rsplit_once('@') {
        Some((coords, ext)) => (coords, ext.to_string()),
        None => (name, "jar".to_string()),
    };

    let parts: Vec<&str> = coords.split(':').collect();
    if parts.len() < 3 {
        return None;
    }

    let group = parts[0].replace('.', "/");
    let artifact = parts[1].to_string();
    let version = parts[2].to_string();
    let classifier = if parts.len() >= 4 {
        Some(parts[3].to_string())
    } else {
        None
    };

    Some((group, artifact, version, classifier, ext))
}

fn library_base_url(library: &Library) -> String {
    library
        .url
        .clone()
        .unwrap_or_else(|| "https://libraries.minecraft.net/".to_string())
        .trim_end_matches('/')
        .to_string()
}

fn build_library_download(
    library: &Library,
    classifier_override: Option<&str>,
) -> Option<DownloadInfo> {
    let (group, artifact, version, parsed_classifier, ext) = parse_library_name(&library.name)?;
    let classifier = classifier_override
        .map(|v| v.to_string())
        .or(parsed_classifier);

    let filename = match &classifier {
        Some(classifier) => format!("{artifact}-{version}-{classifier}.{ext}"),
        None => format!("{artifact}-{version}.{ext}"),
    };

    let rel_path = format!("{group}/{artifact}/{version}/{filename}");
    let url = format!("{}/{}", library_base_url(library), rel_path);

    Some(DownloadInfo {
        path: Some(rel_path),
        sha1: None,
        size: None,
        url,
    })
}

pub fn resolve_library_artifact_download(library: &Library) -> Option<DownloadInfo> {
    if let Some(download) = library
        .downloads
        .as_ref()
        .and_then(|d| d.artifact.as_ref())
        .cloned()
    {
        if download.path.is_some() {
            return Some(download);
        }

        let mut derived = build_library_download(library, None)?;
        derived.url = download.url;
        derived.sha1 = download.sha1;
        derived.size = download.size;
        return Some(derived);
    }

    build_library_download(library, None)
}

pub fn resolve_library_classifier_download(
    library: &Library,
    classifier: &str,
) -> Option<DownloadInfo> {
    if let Some(download) = library
        .downloads
        .as_ref()
        .and_then(|d| d.classifiers.as_ref())
        .and_then(|c| c.get(classifier))
        .cloned()
    {
        if download.path.is_some() {
            return Some(download);
        }

        let mut derived = build_library_download(library, Some(classifier))?;
        derived.url = download.url;
        derived.sha1 = download.sha1;
        derived.size = download.size;
        return Some(derived);
    }

    build_library_download(library, Some(classifier))
}

pub fn classifier_for_windows(library: &Library) -> Option<String> {
    let natives = library.natives.as_ref()?;
    let raw = natives.get("windows")?;
    Some(raw.replace("${arch}", current_arch_string()))
}

pub fn library_path_from_download(download: &DownloadInfo) -> Result<PathBuf, String> {
    let rel = download
        .path
        .as_ref()
        .ok_or_else(|| "library download path missing".to_string())?;
    Ok(libraries_root()?.join(rel))
}
