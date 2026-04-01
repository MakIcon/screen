mod assets;
mod downloader;
mod fabric;
mod install;
mod java;
mod launch;
mod manifest;
mod version;

pub use fabric::{
    effective_version_id_for_instance, ensure_fabric_version_json, fetch_fabric_loader_versions,
    is_fabric_loader,
};
pub use install::{install_instance_files, update_instance_status};
pub use launch::{build_launch_command, normalized_ram, spawn_minecraft_and_persist};
pub use manifest::fetch_manifest_network;
