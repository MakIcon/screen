//! Download mirrors and proxy support.
//!
//! Some upstream hosts (Mojang, FabricMC, QuiltMC, Forge mavens) are unreliable
//! or blocked in certain regions. This module rewrites official URLs to a known
//! mirror (BMCLAPI) and exposes a shared HTTP client that honours an optional
//! user proxy, so blocked users can tunnel everything through one place.
//!
//! BMCLAPI does *not* mirror QuiltMC. For Quilt behind a regional block the only
//! way through is the proxy, which `build_client` applies to every request.

use crate::commands::errors::{CommandError, ErrorCode};
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
    pub proxy_bypass: String,
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
pub fn apply_from(mirror: &str, proxy: &str, proxy_bypass: &str) {
    let proxy = proxy.trim();
    apply_config(NetworkConfig {
        mirror: MirrorMode::parse(mirror),
        proxy: (!proxy.is_empty()).then(|| proxy.to_string()),
        proxy_bypass: normalize_proxy_bypass(proxy_bypass),
    });
}

pub fn normalize_proxy_bypass(value: &str) -> String {
    value
        .split([',', ';', '\n', '\r'])
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>()
        .join(",")
}

pub fn configured_proxy(proxy_url: &str, bypass: &str) -> Result<reqwest::Proxy, CommandError> {
    let mut proxy = reqwest::Proxy::all(proxy_url.trim())
        .map_err(|_| CommandError::new(ErrorCode::InvalidInput, "Invalid proxy URL or protocol"))?;
    let bypass = normalize_proxy_bypass(bypass);
    if !bypass.is_empty() {
        proxy = proxy.no_proxy(reqwest::NoProxy::from_string(&bypass));
    }
    Ok(proxy)
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
pub async fn get_with_fallback(
    client: &Client,
    url: &str,
) -> Result<reqwest::Response, CommandError> {
    let urls = candidates(url);
    let mut last_response: Option<reqwest::Response> = None;
    let mut last_error: Option<CommandError> = None;

    for candidate in &urls {
        match client.get(candidate).send().await {
            Ok(response) if response.status().is_success() => return Ok(response),
            Ok(response) => last_response = Some(response),
            Err(error) => last_error = Some(CommandError::from(error)),
        }
    }

    last_response.map(Ok).unwrap_or_else(|| {
        Err(last_error.unwrap_or_else(|| {
            CommandError::new(ErrorCode::Network, format!("request failed for {url}"))
        }))
    })
}

/// Cached HTTP client paired with the proxy string it was built for.
type CachedClient = (Option<String>, String, Client);

fn client_cache() -> &'static RwLock<Option<CachedClient>> {
    static CLIENT: OnceLock<RwLock<Option<CachedClient>>> = OnceLock::new();
    CLIENT.get_or_init(|| RwLock::new(None))
}

/// A reqwest client that honours the configured proxy. The client (and its
/// connection pool) is cached and reused for as long as the proxy is unchanged,
/// so the dozens of small Modrinth requests share keep-alive connections instead
/// of paying a fresh TLS handshake each time. A new proxy rebuilds it.
pub fn build_client() -> Result<Client, CommandError> {
    let config = current_config();
    let proxy = config
        .proxy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let proxy_bypass = config.proxy_bypass;

    if let Ok(guard) = client_cache().read() {
        if let Some((cached_proxy, cached_bypass, client)) = guard.as_ref() {
            if *cached_proxy == proxy && *cached_bypass == proxy_bypass {
                return Ok(client.clone());
            }
        }
    }

    let mut builder = Client::builder()
        .user_agent("ScreenLauncher/0.1.0")
        .timeout(Duration::from_secs(60));

    if let Some(proxy_url) = proxy.as_deref() {
        builder = builder.proxy(configured_proxy(proxy_url, &proxy_bypass)?);
    }

    let client = builder.build().map_err(|error| {
        let detail = format!("http client error: {error}");
        CommandError::from(error).context(detail)
    })?;

    if let Ok(mut guard) = client_cache().write() {
        *guard = Some((proxy, proxy_bypass, client.clone()));
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
            proxy_bypass: String::new(),
        });
        assert_eq!(
            candidates("https://piston-meta.mojang.com/x.json"),
            vec!["https://piston-meta.mojang.com/x.json".to_string()]
        );
        apply_config(NetworkConfig::default());
    }

    #[test]
    fn normalizes_proxy_bypass_entries() {
        assert_eq!(
            normalize_proxy_bypass(" localhost; .example.com\n10.0.0.0/8, localhost "),
            "localhost,.example.com,10.0.0.0/8,localhost"
        );
    }

    #[test]
    fn invalid_proxy_error_does_not_echo_credentials() {
        let error = configured_proxy("://user:very-secret@example.com", "")
            .unwrap_err()
            .detail;

        assert_eq!(error, "Invalid proxy URL or protocol");
        assert!(!error.contains("very-secret"));
    }
}
