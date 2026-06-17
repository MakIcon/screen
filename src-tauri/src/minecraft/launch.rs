use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    thread,
    time::{Instant, SystemTime},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use reqwest::Client;
use tauri::{AppHandle, Emitter};

use crate::{
    models::{
        InstanceItem, LaunchLogSnapshot, MicrosoftAccount, MinecraftExitPayload, VersionMeta,
    },
    paths::{
        assets_root, clamp_ram_to_system, libraries_root, offline_uuid, read_instances,
        versions_root, write_instances,
    },
};

use super::{
    assets::download_logging_config,
    effective_version_id_for_instance,
    java::{effective_ram_gb, is_modern_mc, optimized_minecraft_jvm_args, resolve_java_bin},
    version::{
        collect_argument_list, evaluate_rules, library_path_from_download, replace_tokens,
        resolve_library_artifact_download, resolve_version_meta,
    },
};

pub fn normalized_ram(ram: u32) -> u32 {
    clamp_ram_to_system(ram)
}

const LWJGL_STACK_SIZE_KB: u32 = 1024;
const MINECRAFT_EXIT_EVENT: &str = "minecraft-process-exited";
const LAUNCH_LOG_TAIL_LIMIT: usize = 64 * 1024;
const EARLY_EXIT_SECS: u64 = 30;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub async fn download_libraries(
    app: &AppHandle,
    resolved: &VersionMeta,
) -> Result<Vec<PathBuf>, String> {
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
                tasks.push((
                    artifact.url.clone(),
                    path,
                    format!("Library {}", library.name),
                ));
            }
        }
    }

    super::downloader::download_many(app, "libraries", tasks).await?;
    Ok(classpath_entries)
}

fn split_legacy_arguments(s: &str) -> Vec<String> {
    s.split_whitespace().map(|x| x.to_string()).collect()
}

fn split_custom_arguments(s: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escape = false;

    for ch in s.chars() {
        if escape {
            current.push(ch);
            escape = false;
            continue;
        }

        if ch == '\\' {
            escape = true;
            continue;
        }

        if let Some(active_quote) = quote {
            if ch == active_quote {
                quote = None;
            } else {
                current.push(ch);
            }
            continue;
        }

        if ch == '"' || ch == '\'' {
            quote = Some(ch);
            continue;
        }

        if ch.is_whitespace() {
            if !current.is_empty() {
                args.push(current.clone());
                current.clear();
            }
            continue;
        }

        current.push(ch);
    }

    if escape {
        current.push('\\');
    }

    if !current.is_empty() {
        args.push(current);
    }

    args
}

fn is_memory_argument(arg: &str) -> bool {
    arg.starts_with("-Xmx") || arg.starts_with("-Xms")
}

fn instance_java_args(instance: &InstanceItem) -> Option<Vec<String>> {
    instance.java_args.as_ref().map(|text| {
        split_custom_arguments(text)
            .into_iter()
            .filter(|arg| !is_memory_argument(arg))
            .collect::<Vec<_>>()
    })
}

fn uses_optimized_heap(
    custom_args: Option<&Vec<String>>,
    optimized_java_args_enabled: bool,
) -> bool {
    custom_args
        .map(|args| args.iter().any(|arg| arg == "-XX:+UseG1GC"))
        .unwrap_or(optimized_java_args_enabled)
}

fn launch_log_dir(instance: &InstanceItem) -> PathBuf {
    PathBuf::from(&instance.game_dir).join("logs")
}

fn launch_log_path(instance: &InstanceItem) -> PathBuf {
    launch_log_dir(instance).join(format!("screenlauncher-{}.log", crate::paths::now_string()))
}

fn read_text_tail(path: &PathBuf, limit: usize) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("read log error: {e}"))?;
    let start = bytes.len().saturating_sub(limit);
    let prefix = if start > 0 {
        format!("[... trimmed {} bytes ...]\n", start)
    } else {
        String::new()
    };

    Ok(format!(
        "{}{}",
        prefix,
        String::from_utf8_lossy(&bytes[start..])
    ))
}

fn newest_file_in_dir(
    dir: PathBuf,
    accept: impl Fn(&std::path::Path) -> bool,
    modified_after: Option<SystemTime>,
) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;

    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && accept(path))
        .filter_map(|path| {
            let modified = fs::metadata(&path).ok()?.modified().ok()?;
            if let Some(after) = modified_after {
                if modified < after {
                    return None;
                }
            }
            Some((modified, path))
        })
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

fn latest_screenlauncher_log_path(instance: &InstanceItem) -> Option<PathBuf> {
    newest_file_in_dir(
        launch_log_dir(instance),
        |path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with("screenlauncher-") && name.ends_with(".log"))
                .unwrap_or(false)
        },
        None,
    )
}

fn minecraft_latest_log_path(instance: &InstanceItem) -> Option<PathBuf> {
    let path = PathBuf::from(&instance.game_dir)
        .join("logs")
        .join("latest.log");
    path.exists().then_some(path)
}

fn latest_crash_report_path(
    instance: &InstanceItem,
    modified_after: Option<SystemTime>,
) -> Option<PathBuf> {
    newest_file_in_dir(
        PathBuf::from(&instance.game_dir).join("crash-reports"),
        |path| path.extension().and_then(|ext| ext.to_str()) == Some("txt"),
        modified_after,
    )
}

fn build_combined_log_tail(
    launch_log_path: Option<&PathBuf>,
    minecraft_log_path: Option<&PathBuf>,
) -> String {
    let mut sections = Vec::new();

    if let Some(path) = launch_log_path {
        let text = read_text_tail(path, LAUNCH_LOG_TAIL_LIMIT / 2)
            .unwrap_or_else(|e| format!("Unable to read ScreenLauncher log: {e}"));
        sections.push(format!("== ScreenLauncher JVM output ==\n{text}"));
    }

    if let Some(path) = minecraft_log_path {
        let text = read_text_tail(path, LAUNCH_LOG_TAIL_LIMIT / 2)
            .unwrap_or_else(|e| format!("Unable to read Minecraft latest.log: {e}"));
        sections.push(format!("== Minecraft latest.log ==\n{text}"));
    }

    if sections.is_empty() {
        "No launch log has been created yet.".to_string()
    } else {
        sections.join("\n\n")
    }
}

fn diagnose_launch_hint(log_tail: &str, crash_report_tail: Option<&str>) -> Option<String> {
    let combined = format!(
        "{}\n{}",
        log_tail.to_ascii_lowercase(),
        crash_report_tail.unwrap_or_default().to_ascii_lowercase()
    );

    if combined.contains("modsettingsentry")
        || (combined.contains("noclassdeffounderror") && combined.contains("net/vulkanmod"))
    {
        return Some(
            "Beryl needs a newer VulkanMod than the one installed. The net.vulkanmod.config.gui.ModSettingsEntry class was added in VulkanMod 0.6.4, so update VulkanMod to 0.6.4 or newer (for 1.21.1 use 0.6.7+1.21.1), then launch again."
                .to_string(),
        );
    }

    if combined.contains("beryl.mixins")
        && combined.contains("@mixin target")
        && combined.contains("was not found")
        && combined.contains("vulkanmod")
    {
        return Some(
            "Beryl loaded, but its mixins target VulkanMod classes that are missing in the installed VulkanMod build. Use a Beryl version that matches this VulkanMod version, or install the VulkanMod version Beryl was built for."
                .to_string(),
        );
    }

    if combined.contains("beryl") && combined.contains("vulkan") {
        return Some(
            "Beryl is mentioned together with Vulkan in the crash log. For this Vulkan build, remove Beryl or switch to a non-Vulkan shader path, then launch again."
                .to_string(),
        );
    }

    if combined.contains("mixin") && combined.contains("failed") {
        return Some(
            "The log points at a failed Mixin transform. This is usually a mod version conflict or a missing dependency."
                .to_string(),
        );
    }

    if combined.contains("unsupportedclassversionerror") {
        return Some(
            "Java rejected one of the classes. Check that this build uses the Java version required by the Minecraft/mod loader version."
                .to_string(),
        );
    }

    None
}

pub fn read_latest_launch_log(instance: &InstanceItem) -> LaunchLogSnapshot {
    let log_path = latest_screenlauncher_log_path(instance);
    let minecraft_log_path = minecraft_latest_log_path(instance);
    let crash_report_path = latest_crash_report_path(instance, None);
    let log_tail = build_combined_log_tail(log_path.as_ref(), minecraft_log_path.as_ref());
    let crash_report_tail = crash_report_path.as_ref().map(|path| {
        read_text_tail(path, LAUNCH_LOG_TAIL_LIMIT / 2)
            .unwrap_or_else(|e| format!("Unable to read crash report: {e}"))
    });
    let hint = diagnose_launch_hint(&log_tail, crash_report_tail.as_deref());

    LaunchLogSnapshot {
        instance_id: instance.id.clone(),
        instance_name: instance.name.clone(),
        log_path: log_path.map(|path| path.to_string_lossy().to_string()),
        minecraft_log_path: minecraft_log_path.map(|path| path.to_string_lossy().to_string()),
        crash_report_path: crash_report_path.map(|path| path.to_string_lossy().to_string()),
        log_tail,
        crash_report_tail,
        hint,
    }
}

pub async fn build_launch_command(
    app: &AppHandle,
    instance: &InstanceItem,
    nickname: &str,
    ms_account: Option<&MicrosoftAccount>,
    optimized_java_args_enabled: bool,
    extra_jvm_args: &[String],
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
    tokens.insert(
        "natives_directory",
        natives_dir.to_string_lossy().to_string(),
    );
    tokens.insert("launcher_name", "ScreenLauncher".to_string());
    tokens.insert("launcher_version", "0.1.0".to_string());
    tokens.insert("classpath", classpath);
    tokens.insert("classpath_separator", classpath_separator.to_string());
    tokens.insert(
        "library_directory",
        libraries_root()?.to_string_lossy().to_string(),
    );
    tokens.insert(
        "resolution_width",
        instance
            .window_width
            .unwrap_or(1280)
            .clamp(320, 7680)
            .to_string(),
    );
    tokens.insert(
        "resolution_height",
        instance
            .window_height
            .unwrap_or(720)
            .clamp(240, 4320)
            .to_string(),
    );
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

    let java_bin = instance
        .java_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| resolve_java_bin(&instance.version));
    let ram_gb = effective_ram_gb(&java_bin, normalized_ram(instance.ram));
    let custom_java_args = instance_java_args(instance);
    let optimized_heap =
        uses_optimized_heap(custom_java_args.as_ref(), optimized_java_args_enabled);

    let mut args = vec![
        format!("-Xmx{}G", ram_gb),
        if optimized_heap {
            format!("-Xms{}G", ram_gb)
        } else {
            "-Xms512M".to_string()
        },
        format!("-Dorg.lwjgl.system.stackSize={LWJGL_STACK_SIZE_KB}"),
        "-Djava.net.preferIPv4Stack=true".to_string(),
    ];
    if let Some(custom_java_args) = custom_java_args {
        args.extend(custom_java_args);
    } else if optimized_java_args_enabled {
        args.extend(optimized_minecraft_jvm_args(ram_gb));
    }
    args.extend(extra_jvm_args.iter().cloned());

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
    if instance.fullscreen && !args.iter().any(|arg| arg == "--fullscreen") {
        args.push("--fullscreen".to_string());
    }

    Ok((java_bin, args))
}

pub async fn spawn_minecraft_and_persist(
    app: AppHandle,
    instance: &InstanceItem,
    java_bin: String,
    args: Vec<String>,
) -> Result<u32, String> {
    let log_dir = launch_log_dir(instance);
    fs::create_dir_all(&log_dir).map_err(|e| format!("create launch log dir error: {e}"))?;

    let log_path = launch_log_path(instance);
    let mut header_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
        .map_err(|e| format!("create launch log error: {e}"))?;

    writeln!(header_file, "ScreenLauncher launch log")
        .and_then(|_| writeln!(header_file, "Instance: {} ({})", instance.name, instance.id))
        .and_then(|_| writeln!(header_file, "Game dir: {}", instance.game_dir))
        .and_then(|_| writeln!(header_file, "Java: {java_bin}"))
        .and_then(|_| writeln!(header_file, "Args: {}", args.join(" ")))
        .and_then(|_| writeln!(header_file, "\n== Process output =="))
        .map_err(|e| format!("write launch log header error: {e}"))?;
    drop(header_file);

    let stdout_log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("open stdout launch log error: {e}"))?;
    let stderr_log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("open stderr launch log error: {e}"))?;

    let mut command = Command::new(&java_bin);
    command
        .args(&args)
        .current_dir(&instance.game_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_log))
        .stderr(Stdio::from(stderr_log));

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|e| format!("launch error: {e}"))?;
    let pid = child.id();
    let started_at = Instant::now();
    let started_system_at = SystemTime::now();
    let watcher_instance = instance.clone();
    let watcher_log_path = log_path.clone();

    thread::spawn(move || {
        let status_result = child.wait();
        let runtime_secs = started_at.elapsed().as_secs();
        let (exit_code, crashed, reason) = match status_result {
            Ok(status) => {
                let exit_code = status.code();
                let crashed = !status.success() || runtime_secs < EARLY_EXIT_SECS;
                let reason = if status.success() && runtime_secs >= EARLY_EXIT_SECS {
                    "Minecraft closed normally.".to_string()
                } else if status.success() {
                    "Minecraft closed almost immediately after launch.".to_string()
                } else if let Some(code) = exit_code {
                    format!("Minecraft exited with code {code}.")
                } else {
                    "Minecraft was terminated by the system.".to_string()
                };
                (exit_code, crashed, reason)
            }
            Err(error) => (
                None,
                true,
                format!("ScreenLauncher could not read Minecraft exit status: {error}"),
            ),
        };

        if let Ok(mut footer_file) = OpenOptions::new().append(true).open(&watcher_log_path) {
            let _ = writeln!(
                footer_file,
                "\n== Process finished ==\nPID: {pid}\nRuntime: {runtime_secs}s\nExit code: {}\nReason: {reason}",
                exit_code
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            );
        }

        let minecraft_log_path = minecraft_latest_log_path(&watcher_instance);
        let crash_report_path =
            latest_crash_report_path(&watcher_instance, Some(started_system_at));
        let log_tail =
            build_combined_log_tail(Some(&watcher_log_path), minecraft_log_path.as_ref());
        let crash_report_tail = crash_report_path.as_ref().map(|path| {
            read_text_tail(path, LAUNCH_LOG_TAIL_LIMIT / 2)
                .unwrap_or_else(|e| format!("Unable to read crash report: {e}"))
        });
        let hint = diagnose_launch_hint(&log_tail, crash_report_tail.as_deref());

        let _ = app.emit(
            MINECRAFT_EXIT_EVENT,
            MinecraftExitPayload {
                instance_id: watcher_instance.id,
                instance_name: watcher_instance.name,
                pid,
                exit_code,
                runtime_secs,
                crashed,
                reason,
                log_path: Some(watcher_log_path.to_string_lossy().to_string()),
                minecraft_log_path: minecraft_log_path
                    .map(|path| path.to_string_lossy().to_string()),
                crash_report_path: crash_report_path.map(|path| path.to_string_lossy().to_string()),
                log_tail,
                crash_report_tail,
                hint,
            },
        );
    });

    let mut items = read_instances().await?;
    if let Some(index) = items.iter().position(|i| i.id == instance.id) {
        items[index].status = "READY".to_string();
        items[index].last_played = crate::paths::now_string();
        write_instances(&items).await?;
    }

    Ok(pid)
}
