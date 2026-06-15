pub mod commands;
pub mod minecraft;
pub mod models;
pub mod paths;
pub mod plugins;
pub mod progress;
pub mod window_fx;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(plugins::blue_map::BlueMapState::default())
        .manage(plugins::discord_rpc::DiscordRpcState::default())
        .manage(plugins::mineflayer_bot::MineflayerBotState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            window_fx::start_gallery_unfold,
            commands::auth::start_microsoft_auth,
            commands::auth::list_microsoft_accounts,
            commands::auth::remove_microsoft_account,
            commands::auth::get_minecraft_profile,
            commands::auth::upload_minecraft_skin,
            commands::auth::reset_minecraft_skin,
            commands::auth::set_minecraft_cape,
            commands::auth::hide_minecraft_cape,
            commands::system::get_minecraft_manifest,
            commands::system::get_fabric_loader_versions,
            commands::instances::list_instances,
            commands::instances::create_instance,
            commands::instances::update_instance,
            commands::instances::delete_instance,
            commands::instances::get_instance_export_data,
            commands::instances::import_instance,
            commands::launcher::install_instance,
            commands::launcher::launch_instance,
            commands::launcher::kill_instance,
            commands::launcher::is_process_alive,
            commands::launcher::record_playtime,
            commands::launcher::read_instance_launch_log,
            commands::launcher::open_instance_folder,
            commands::launcher::list_instance_screenshots,
            commands::launcher::load_instance_screenshot,
            commands::launcher::open_instance_screenshots_folder,
            commands::system::get_system_memory_gb,
            commands::modrinth::get_modrinth_fabric_versions,
            commands::modrinth::get_modrinth_project_icons,
            commands::modrinth::search_modrinth_mods,
            commands::modrinth::install_modrinth_project,
            commands::modrinth::list_installed_mods,
            commands::modrinth::uninstall_modrinth_mod,
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
            commands::settings::set_launcher_plugins,
            plugins::discord_rpc::start_discord_rpc_for_launcher_command,
            plugins::discord_rpc::start_discord_rpc_for_instance_command,
            plugins::discord_rpc::stop_discord_rpc_for_instance_command,
            plugins::mineflayer_bot::start_mineflayer_bot,
            plugins::mineflayer_bot::stop_mineflayer_bot,
            plugins::mineflayer_bot::get_mineflayer_bot_status,
            plugins::blue_map::prepare_bluemap,
            plugins::blue_map::start_bluemap,
            plugins::blue_map::stop_bluemap,
            plugins::blue_map::get_bluemap_status,
            plugins::blue_map::open_bluemap_browser,
            plugins::blue_map::open_bluemap_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
