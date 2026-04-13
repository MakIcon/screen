use std::{collections::HashMap, path::PathBuf, process::Command};

use reqwest::Client;
use tauri::AppHandle;

use crate::{
    models::{InstanceItem, MicrosoftAccount, VersionMeta},
    paths::{
        assets_root, clamp_ram_to_system, libraries_root, offline_uuid, read_instances,
        versions_root, write_instances,
    },
};

use super::{
    assets::download_logging_config,
    effective_version_id_for_instance,
    java::{effective_ram_gb, is_modern_mc, resolve_java_bin},
    version::{
        collect_argument_list, evaluate_rules, library_path_from_download, replace_tokens,
        resolve_library_artifact_download, resolve_version_meta,
    },
};

pub fn normalized_ram(ram: u32) -> u32 {
    clamp_ram_to_system(ram)
}

pub async fn download_libraries(app: &AppHandle, resolved: &VersionMeta) -> Result<Vec<PathBuf>, String> {
    let mut classpath_entries = Vec::new();
    let mut tasks = Vec::new();

    for library in &resolved.libraries {
        if !evaluate_rules(&library.rules) {
            continue;
        }
        if let Some(artifact) = resolve_library_artifact_download(library) {
            let path = library_path_from_download(&artifact)?;
            classpath_entries.push(path.clone());
            if !path.exists() {
                tasks.push((artifact.url.clone(), path, format!("Library {}", library.name)));
            }
        }
    }

    super::downloader::download_many(app, "libraries", tasks).await?;
    Ok(classpath_entries)
}

fn split_legacy_arguments(s: &str) -> Vec<String> {
    s.split_whitespace().map(|x| x.to_string()).collect()
}

pub async fn build_launch_command(
    app: &AppHandle,
    instance: &InstanceItem,
    nickname: &str,
    ms_account: Option<&MicrosoftAccount>,
) -> Result<(String, Vec<String>), String> {
    let client = Client::new();
    let resolved_version_id = effective_version_id_for_instance(instance)?;
    let resolved = resolve_version_meta(&client, &resolved_version_id).await?;
    let game_dir = PathBuf::from(&instance.game_dir);
    let instance_dir = game_dir.parent().ok_or("instance dir parent missing")?;
    let natives_dir = instance_dir.join("natives");
    let logging_path = download_logging_config(app, &resolved).await?;

    let client_jar = versions_root()?
        .join(&instance.version)
        .join(format!("{}.jar", instance.version));
    let mut classpath_entries = download_libraries(app, &resolved).await?;
    classpath_entries.push(client_jar);

    let classpath_separator = ";";
    let classpath = classpath_entries
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(classpath_separator);

    let assets = assets_root()?;
    let asset_index_name = resolved
        .asset_index
        .as_ref()
        .map(|x| x.id.clone())
        .or_else(|| resolved.assets.clone())
        .unwrap_or_else(|| "legacy".to_string());
    let (username, auth_uuid, auth_access_token, user_type) = if let Some(acc) = ms_account {
        (
            acc.username.clone(),
            acc.uuid.clone(),
            acc.access_token.clone(),
            "msa".to_string(),
        )
    } else {
        let un = if nickname.trim().is_empty() {
            "PLAYER".to_string()
        } else {
            nickname.trim().to_string()
        };
        let uu = offline_uuid(&un);
        (un, uu, "0".to_string(), "legacy".to_string())
    };

    let mut tokens: HashMap<&str, String> = HashMap::new();
    tokens.insert("auth_player_name", username.clone());
    tokens.insert("version_name", resolved.id.clone());
    tokens.insert("game_directory", game_dir.to_string_lossy().to_string());
    tokens.insert("assets_root", assets.to_string_lossy().to_string());
    tokens.insert("assets_index_name", asset_index_name.clone());
    tokens.insert("auth_uuid", auth_uuid);
    tokens.insert("auth_access_token", auth_access_token.clone());
    tokens.insert("auth_session", auth_access_token);
    tokens.insert("user_type", user_type);
    tokens.insert("version_type", "release".to_string());
    tokens.insert("natives_directory", natives_dir.to_string_lossy().to_string());
    tokens.insert("launcher_name", "ScreenLauncher".to_string());
    tokens.insert("launcher_version", "0.1.0".to_string());
    tokens.insert("classpath", classpath);
    tokens.insert("classpath_separator", classpath_separator.to_string());
    tokens.insert(
        "library_directory",
        libraries_root()?.to_string_lossy().to_string(),
    );
    tokens.insert("resolution_width", "1280".to_string());
    tokens.insert("resolution_height", "720".to_string());
    tokens.insert(
        "path",
        logging_path
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
    );
    tokens.insert("user_properties", "{}".to_string());
    tokens.insert("profile_properties", "{}".to_string());
    tokens.insert("auth_xuid", "".to_string());
    tokens.insert("clientid", "".to_string());
    tokens.insert("client_id", "".to_string());
    tokens.insert("access_token", "0".to_string());

    let java_bin = resolve_java_bin(&instance.version);
    let ram_gb = effective_ram_gb(&java_bin, instance.ram);

    let mut args = vec![
        format!("-Xmx{}G", ram_gb),
        "-Xms512M".to_string(),
        "-Djava.net.preferIPv4Stack=true".to_string(),
    ];

    // For offline accounts block the real auth endpoints; MS accounts use real ones
    if ms_account.is_none() {
        args.extend(vec![
            "-Dminecraft.api.env=custom".to_string(),
            "-Dminecraft.api.auth.host=https://nope.invalid".to_string(),
            "-Dminecraft.api.account.host=https://nope.invalid".to_string(),
            "-Dminecraft.api.session.host=https://nope.invalid".to_string(),
            "-Dminecraft.api.services.host=https://nope.invalid".to_string(),
        ]);
    }

    if is_modern_mc(&instance.version) {
        args.extend(vec![
            "--add-opens".to_string(),
            "java.base/jdk.internal.loader=ALL-UNNAMED".to_string(),
            "--add-opens".to_string(),
            "java.base/java.net=ALL-UNNAMED".to_string(),
            "--add-opens".to_string(),
            "java.base/java.lang=ALL-UNNAMED".to_string(),
            "--add-opens".to_string(),
            "java.base/java.util=ALL-UNNAMED".to_string(),
        ]);
    }

    let mut jvm_args = if let Some(arguments) = &resolved.arguments {
        collect_argument_list(&arguments.jvm.clone().unwrap_or_default(), &tokens)
    } else {
        vec![
            format!("-Djava.library.path={}", natives_dir.to_string_lossy()),
            "-cp".to_string(),
            tokens.get("classpath").cloned().unwrap_or_default(),
        ]
    };

    if let Some(logging) = resolved.logging.as_ref().and_then(|l| l.client.as_ref()) {
        if let Some(argument) = &logging.argument {
            let resolved_arg = replace_tokens(argument, &tokens);
            if !resolved_arg.is_empty() && !jvm_args.contains(&resolved_arg) {
                jvm_args.push(resolved_arg);
            }
        }
    }
    args.extend(jvm_args);

    let main_class = resolved.main_class.clone().ok_or("mainClass missing")?;
    args.push(main_class);

    let raw_game_args = if let Some(arguments) = &resolved.arguments {
        collect_argument_list(&arguments.game.clone().unwrap_or_default(), &tokens)
    } else if let Some(legacy) = &resolved.minecraft_arguments {
        split_legacy_arguments(&replace_tokens(legacy, &tokens))
    } else {
        Vec::new()
    };

    let mut filtered_game_args = Vec::new();
    let mut it = raw_game_args.into_iter();
    while let Some(arg) = it.next() {
        if arg == "--quickPlayPath"
            || arg == "--quickPlaySingleplayer"
            || arg == "--quickPlayMultiplayer"
            || arg == "--quickPlayRealms"
            || arg == "--server"
            || arg == "--port"
        {
            let _ = it.next();
            continue;
        }
        if arg == "--demo" {
            continue;
        }
        if !arg.is_empty() {
            filtered_game_args.push(arg);
        }
    }
    args.extend(filtered_game_args);

    Ok((java_bin, args))
}

pub async fn spawn_minecraft_and_persist(
    instance: &InstanceItem,
    java_bin: String,
    args: Vec<String>,
) -> Result<u32, String> {
    let child = Command::new(&java_bin)
        .args(&args)
        .current_dir(&instance.game_dir)
        .spawn()
        .map_err(|e| format!("launch error: {e}"))?;

    let mut items = read_instances().await?;
    if let Some(index) = items.iter().position(|i| i.id == instance.id) {
        items[index].status = "READY".to_string();
        items[index].last_played = crate::paths::now_string();
        write_instances(&items).await?;
    }

    Ok(child.id())
}
