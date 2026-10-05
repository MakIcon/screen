pub mod commands;
pub mod minecraft;
pub mod models;
pub mod paths;
pub mod plugins;
pub mod progress;
pub mod secure_storage;
pub mod window_fx;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(plugins::blue_map::BlueMapState::default())
        .manage(plugins::discord_rpc::DiscordRpcState::default())
        .manage(plugins::mineflayer_bot::MineflayerBotState::default())
        .manage(plugins::obs_telemetry::ObsTelemetryState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            window_fx::start_gallery_unfold,
            window_fx::exit_launcher,
            commands::auth::start_microsoft_auth,
            commands::auth::list_microsoft_accounts,
            commands::auth::remove_microsoft_account,
            commands::auth::get_minecraft_profile,
            commands::auth::upload_minecraft_skin,
            commands::auth::reset_minecraft_skin,
            commands::auth::set_minecraft_cape,
            commands::auth::hide_minecraft_cape,
            commands::system::get_minecraft_manifest,
            commands::system::get_loader_versions,
            commands::instances::list_instances,
            commands::instances::create_instance,
            commands::instances::update_instance,
            commands::instances::delete_instance,
            commands::instances::list_deleted_instances,
            commands::instances::restore_instance,
            commands::instances::purge_deleted_instance,
            commands::backups::get_world_backup_state,
            commands::backups::load_world_preview,
            commands::backups::set_world_backup_selection,
            commands::backups::create_world_backup,
            commands::backups::list_world_backups,
            commands::backups::delete_world_backup,
            commands::backups::restore_world_backup,
            commands::instances::get_instance_export_data,
            commands::instances::import_instance,
            commands::import_progress::cancel_import,
            commands::instances::retry_import_content,
            commands::content::install_dropped_content,
            commands::mrpack::read_slbuild_file,
            commands::mrpack::inspect_mrpack,
            commands::mrpack::export_instance_mrpack,
            commands::mrpack::import_mrpack,
            commands::launcher::install_instance,
            commands::launcher::launch_instance,
            commands::launcher::stop_instance,
            commands::launcher::is_process_alive,
            commands::launcher::record_playtime,
            commands::launcher::get_playtime_sessions,
            commands::launcher::read_instance_launch_log,
            commands::launcher::open_instance_folder,
            commands::launcher::list_instance_screenshots,
            commands::launcher::load_instance_screenshot,
            commands::launcher::open_instance_screenshots_folder,
            commands::system::get_system_memory_gb,
            commands::system::test_java_settings,
            commands::system::scan_java_installations,
            commands::modrinth::get_modrinth_project_icons,
            commands::modrinth::resolve_modrinth_content_icons,
            commands::modrinth::get_modrinth_project_authors,
            commands::modrinth::get_modrinth_project_details,
            commands::modrinth::get_modrinth_mod_dependencies,
            commands::modrinth::search_modrinth_mods,
            commands::modrinth::install_modrinth_project,
            commands::modrinth::set_modrinth_download_paused,
            commands::modrinth::cancel_modrinth_download,
            commands::modrinth::list_installed_mods,
            commands::modrinth::uninstall_modrinth_mod,
            commands::modrinth::set_mod_enabled,
            commands::modrinth::search_modrinth_resourcepacks,
            commands::modrinth::install_modrinth_resourcepack,
            commands::modrinth::list_installed_resourcepacks,
            commands::modrinth::uninstall_modrinth_resourcepack,
            commands::modrinth::search_modrinth_shaders,
            commands::modrinth::install_modrinth_shader,
            commands::modrinth::list_installed_shaders,
            commands::modrinth::uninstall_modrinth_shader,
            commands::settings::get_launcher_settings,
            commands::settings::set_default_ram_gb,
            commands::settings::set_optimized_java_args,
            commands::settings::set_auto_download_java,
            commands::settings::set_mascot_enabled,
            commands::settings::set_mascot_settings,
            commands::settings::set_launcher_plugins,
            commands::settings::set_network_settings,
            commands::settings::test_proxy_connection,
            plugins::optional_extensions::install_optional_extension,
            plugins::optional_extensions::uninstall_optional_extension,
            plugins::runtime_monitor::get_runtime_monitor_snapshot,
            plugins::discord_rpc::start_discord_rpc_for_launcher,
            plugins::discord_rpc::start_discord_rpc_for_instance,
            plugins::discord_rpc::stop_discord_rpc_for_instance,
            plugins::mineflayer_bot::start_mineflayer_bot,
            plugins::mineflayer_bot::stop_mineflayer_bot,
            plugins::mineflayer_bot::get_mineflayer_bot_status,
            plugins::blue_map::prepare_bluemap,
            plugins::blue_map::start_bluemap,
            plugins::blue_map::stop_bluemap,
            plugins::blue_map::get_bluemap_status,
            plugins::blue_map::open_bluemap_browser,
            plugins::blue_map::open_bluemap_window,
            plugins::obs_telemetry::start_obs_telemetry,
            plugins::obs_telemetry::stop_obs_telemetry,
            plugins::obs_telemetry::get_obs_telemetry_status,
            plugins::obs_telemetry::open_obs_telemetry_overlay,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
