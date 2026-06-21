//! Download mirrors and proxy support.
//!
//! Some upstream hosts (Mojang, FabricMC, QuiltMC, Forge mavens) are unreliable
//! or blocked in certain regions. This module rewrites official URLs to a known
//! mirror (BMCLAPI) and exposes a shared HTTP client that honours an optional
//! user proxy, so blocked users can tunnel everything through one place.
//!
//! BMCLAPI does *not* mirror QuiltMC. For Quilt behind a regional block the only
//! way through is the proxy, which `build_client` applies to every request.

use std::{
    sync::{OnceLock, RwLock},
    time::Duration,
};

use reqwest::Client;

const BMCLAPI_BASE: &str = "https://bmclapi2.bangbang93.com";

/// Where downloads should be fetched from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MirrorMode {
    /// Only ever talk to the official hosts.
    Official,
    /// Official first, fall back to the BMCLAPI mirror on failure. (default)
    #[default]
    Auto,
    /// BMCLAPI mirror first, fall back to official. Best when official is blocked.
    Mirror,
}

impl MirrorMode {
    pub fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "official" => Self::Official,
            "mirror" | "bmclapi" => Self::Mirror,
            _ => Self::Auto,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Official => "official",
            Self::Auto => "auto",
            Self::Mirror => "mirror",
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct NetworkConfig {
    pub mirror: MirrorMode,
    /// e.g. `http://127.0.0.1:8080` or `socks5://127.0.0.1:1080`.
    pub proxy: Option<String>,
}

fn cell() -> &'static RwLock<NetworkConfig> {
    static NETWORK: OnceLock<RwLock<NetworkConfig>> = OnceLock::new();
    NETWORK.get_or_init(|| RwLock::new(NetworkConfig::default()))
}

/// Update the process-wide network config. Called whenever settings change.
pub fn apply_config(config: NetworkConfig) {
    if let Ok(mut guard) = cell().write() {
        *guard = config;
    }
}

pub fn current_config() -> NetworkConfig {
    cell().read().map(|guard| guard.clone()).unwrap_or_default()
}

/// Convenience wrapper for the string-typed fields stored in settings.
pub fn apply_from(mirror: &str, proxy: &str) {
    let proxy = proxy.trim();
    apply_config(NetworkConfig {
        mirror: MirrorMode::parse(mirror),
        proxy: (!proxy.is_empty()).then(|| proxy.to_string()),
    });
}

/// Prefix rewrites from an official host to the BMCLAPI equivalent.
/// Quilt is intentionally absent — BMCLAPI does not mirror it.
const MAPPINGS: &[(&str, &str)] = &[
    ("https://piston-meta.mojang.com/", BMCLAPI_BASE),
    ("https://launchermeta.mojang.com/", BMCLAPI_BASE),
    ("https://piston-data.mojang.com/", BMCLAPI_BASE),
    (
        "https://resources.download.minecraft.net/",
        "https://bmclapi2.bangbang93.com/assets/",
    ),
    (
        "https://libraries.minecraft.net/",
        "https://bmclapi2.bangbang93.com/maven/",
    ),
    (
        "https://meta.fabricmc.net/",
        "https://bmclapi2.bangbang93.com/fabric-meta/",
    ),
    (
        "https://maven.fabricmc.net/",
        "https://bmclapi2.bangbang93.com/maven/",
    ),
    (
        "https://maven.neoforged.net/releases/",
        "https://bmclapi2.bangbang93.com/maven/",
    ),
    (
        "https://maven.minecraftforge.net/",
        "https://bmclapi2.bangbang93.com/maven/",
    ),
];

/// The BMCLAPI URL for an official URL, if a mapping exists.
pub fn bmclapi_equivalent(url: &str) -> Option<String> {
    for (from, to) in MAPPINGS {
        if let Some(rest) = url.strip_prefix(from) {
            let base = to.trim_end_matches('/');
            return Some(format!("{base}/{rest}"));
        }
    }
    None
}

/// Ordered list of URLs to try for an official `url`, based on the current mode.
/// Always contains at least the input URL.
pub fn candidates(url: &str) -> Vec<String> {
    let mode = current_config().mirror;
    match (mode, bmclapi_equivalent(url)) {
        (MirrorMode::Official, _) | (_, None) => vec![url.to_string()],
        (MirrorMode::Auto, Some(mirror)) => vec![url.to_string(), mirror],
        (MirrorMode::Mirror, Some(mirror)) => vec![mirror, url.to_string()],
    }
}

/// GET a URL, trying each mirror candidate in order. Returns the first
/// successful (2xx) response; if none succeed, returns the last HTTP response
/// (so the caller can report the status) or the last transport error.
pub async fn get_with_fallback(client: &Client, url: &str) -> Result<reqwest::Response, String> {
    let urls = candidates(url);
    let mut last_response: Option<reqwest::Response> = None;
    let mut last_error: Option<String> = None;

    for candidate in &urls {
        match client.get(candidate).send().await {
            Ok(response) if response.status().is_success() => return Ok(response),
            Ok(response) => last_response = Some(response),
            Err(error) => last_error = Some(error.to_string()),
        }
    }

    last_response
        .map(Ok)
        .unwrap_or_else(|| Err(last_error.unwrap_or_else(|| format!("request failed for {url}"))))
}

/// Cached HTTP client paired with the proxy string it was built for.
type CachedClient = (Option<String>, Client);

fn client_cache() -> &'static RwLock<Option<CachedClient>> {
    static CLIENT: OnceLock<RwLock<Option<CachedClient>>> = OnceLock::new();
    CLIENT.get_or_init(|| RwLock::new(None))
}

/// A reqwest client that honours the configured proxy. The client (and its
/// connection pool) is cached and reused for as long as the proxy is unchanged,
/// so the dozens of small Modrinth requests share keep-alive connections instead
/// of paying a fresh TLS handshake each time. A new proxy rebuilds it.
pub fn build_client() -> Result<Client, String> {
    let proxy = current_config()
        .proxy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if let Ok(guard) = client_cache().read() {
        if let Some((cached_proxy, client)) = guard.as_ref() {
            if *cached_proxy == proxy {
                return Ok(client.clone());
            }
        }
    }

    let mut builder = Client::builder()
        .user_agent("ScreenLauncher/0.1.0")
        .timeout(Duration::from_secs(60));

    if let Some(proxy_url) = proxy.as_deref() {
        match reqwest::Proxy::all(proxy_url) {
            Ok(configured) => builder = builder.proxy(configured),
            Err(error) => return Err(format!("invalid proxy '{proxy_url}': {error}")),
        }
    }

    let client = builder
        .build()
        .map_err(|error| format!("http client error: {error}"))?;

    if let Ok(mut guard) = client_cache().write() {
        *guard = Some((proxy, client.clone()));
    }

    Ok(client)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_known_hosts_to_bmclapi() {
        assert_eq!(
            bmclapi_equivalent("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
                .as_deref(),
            Some("https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json")
        );
        assert_eq!(
            bmclapi_equivalent("https://libraries.minecraft.net/foo/bar.jar").as_deref(),
            Some("https://bmclapi2.bangbang93.com/maven/foo/bar.jar")
        );
        assert_eq!(
            bmclapi_equivalent("https://resources.download.minecraft.net/ab/abcdef").as_deref(),
            Some("https://bmclapi2.bangbang93.com/assets/ab/abcdef")
        );
    }

    #[test]
    fn quilt_is_never_mirrored() {
        assert_eq!(
            bmclapi_equivalent("https://meta.quiltmc.org/v3/versions/loader/1.21.1"),
            None
        );
        assert_eq!(
            bmclapi_equivalent("https://maven.quiltmc.org/repository/release/x.jar"),
            None
        );
    }

    #[test]
    fn official_mode_never_adds_mirror() {
        apply_config(NetworkConfig {
            mirror: MirrorMode::Official,
            proxy: None,
        });
        assert_eq!(
            candidates("https://piston-meta.mojang.com/x.json"),
            vec!["https://piston-meta.mojang.com/x.json".to_string()]
        );
        apply_config(NetworkConfig::default());
    }
}
