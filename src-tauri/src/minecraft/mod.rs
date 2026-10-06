mod assets;
mod downloader;
mod environment;
mod install;
mod java;
mod java_install;
mod launch;
mod loaders;
mod manifest;
pub mod mirrors;
mod version;

pub use environment::normalize_environment_variables;
pub use install::{install_instance_files, update_instance_status};
pub use java::{scan_java_installations, JavaInstallation};
pub use java_install::ensure_java_for_instance;
pub use launch::{
    build_launch_command, normalized_ram, read_latest_launch_log, spawn_minecraft_and_persist,
    test_java_settings,
};
pub use loaders::{
    effective_version_id_for_instance, ensure_loader_profile, fetch_loader_versions,
    normalized_loader_and_version, LoaderKind,
};
pub use manifest::{fetch_manifest_network, read_cached_manifest};
