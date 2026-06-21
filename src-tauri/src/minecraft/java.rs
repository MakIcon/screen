use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// A Java runtime discovered on the system, offered to the user for per-build override.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaInstallation {
    pub path: String,
    pub version: String,
    pub vendor: String,
    pub major: u32,
}

fn parse_mc_version(version: &str) -> Option<(u32, u32, u32)> {
    let clean = version.split('-').next().unwrap_or(version);
    let mut parts = clean.split('.').filter_map(|p| p.parse::<u32>().ok());

    let major = parts.next()?;
    let minor = parts.next().unwrap_or(0);
    let patch = parts.next().unwrap_or(0);

    Some((major, minor, patch))
}

fn java_bin_from_env(var_name: &str) -> Option<String> {
    let home = std::env::var(var_name).ok()?;
    let javaw = PathBuf::from(home).join("bin").join("javaw.exe");
    if javaw.exists() {
        Some(javaw.to_string_lossy().to_string())
    } else {
        None
    }
}

pub fn required_java_major(mc_version: &str) -> u32 {
    let id = mc_version.trim().to_ascii_lowercase();

    if id.starts_with('b')
        || id.starts_with('a')
        || id.starts_with('c')
        || id.starts_with("rd-")
        || id.starts_with("inf-")
    {
        return 8;
    }

    match parse_mc_version(mc_version) {
        Some((1, 0..=16, _)) => 8,
        Some((1, 17, _)) => 17,
        Some((1, 18..=19, _)) => 17,
        Some((1, 20, 0..=4)) => 17,
        Some((1, 20, _)) => 21,
        Some((1, minor, _)) if minor >= 21 => 21,
        Some((major, _, _)) if major >= 26 => 25,
        _ => 8,
    }
}

fn dir_matches_java_major(name: &str, major: u32) -> bool {
    match major {
        8 => {
            name.contains("1.8")
                || name.contains("jre8")
                || name.contains("jdk8")
                || name.contains("jre-8")
                || name.contains("jdk-8")
                || (name.ends_with('8') && !name.contains("18") && !name.contains("28"))
        }
        16 => name.contains("16"),
        17 => name.contains("17"),
        21 => name.contains("21"),
        25 => name.contains("25"),
        _ => false,
    }
}

fn scan_java_root(root: &str, major: u32) -> Option<String> {
    let root_path = Path::new(root);
    if !root_path.exists() {
        return None;
    }

    let mut found: Vec<String> = Vec::new();

    let entries = match std::fs::read_dir(root_path) {
        Ok(e) => e,
        Err(_) => return None,
    };

    for entry in entries.flatten() {
        let dir_name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if !dir_matches_java_major(&dir_name, major) {
            continue;
        }

        let base = entry.path();
        let candidates = [
            base.join("bin").join("javaw.exe"),
            base.join("jre").join("bin").join("javaw.exe"),
        ];
        for c in &candidates {
            if c.exists() {
                found.push(c.to_string_lossy().into_owned());
            }
        }
    }

    found.sort_by(|a, b| b.cmp(a));
    found.into_iter().next()
}

fn java_search_roots() -> &'static [&'static str] {
    &[
        r"C:\Program Files\Java",
        r"C:\Program Files\Eclipse Adoptium",
        r"C:\Program Files\Eclipse Foundation",
        r"C:\Program Files\Microsoft",
        r"C:\Program Files\Azul Systems\Zulu",
        r"C:\Program Files\Amazon Corretto",
        r"C:\Program Files\BellSoft\LibericaJDK",
        r"C:\Program Files\IBM Semeru Runtime Open Edition",
        r"C:\Program Files\SapMachine",
        r"C:\Program Files (x86)\Java",
    ]
}

fn find_java_on_system(major: u32) -> Option<String> {
    for root in java_search_roots() {
        if let Some(bin) = scan_java_root(root, major) {
            return Some(bin);
        }
    }
    None
}

/// Read `version` and `vendor` from a Java home's `release` file, when present.
fn read_java_release(home: &Path) -> (Option<String>, Option<String>) {
    let Ok(content) = std::fs::read_to_string(home.join("release")) else {
        return (None, None);
    };

    let mut version = None;
    let mut vendor = None;
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("JAVA_VERSION=") {
            version = Some(rest.trim().trim_matches('"').to_string());
        } else if let Some(rest) = line.strip_prefix("IMPLEMENTOR=") {
            vendor = Some(rest.trim().trim_matches('"').to_string());
        }
    }
    (version, vendor)
}

fn major_from_version(version: &str) -> u32 {
    let v = version.trim();
    // Legacy "1.8.0_xxx" encodes the major after the leading "1.".
    if let Some(rest) = v.strip_prefix("1.") {
        return rest.split('.').next().and_then(|s| s.parse().ok()).unwrap_or(0);
    }
    v.split(|c: char| c == '.' || c == '_' || c == '-')
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

fn push_java_installation(
    bin: PathBuf,
    home: &Path,
    seen: &mut HashSet<String>,
    out: &mut Vec<JavaInstallation>,
) {
    if !bin.exists() {
        return;
    }
    let path = bin.to_string_lossy().to_string();
    if !seen.insert(path.to_ascii_lowercase()) {
        return;
    }

    let (version, vendor) = read_java_release(home);
    let version = version.unwrap_or_else(|| {
        home.file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string())
    });
    let major = major_from_version(&version);
    let vendor = vendor.unwrap_or_else(|| "Unknown".to_string());

    out.push(JavaInstallation {
        path,
        version,
        vendor,
        major,
    });
}

/// Discover every Java runtime under the well-known install roots and `JAVA*_HOME`
/// env vars, so the user can pick a specific one for a build.
pub fn scan_java_installations() -> Vec<JavaInstallation> {
    let mut out: Vec<JavaInstallation> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let env_vars = [
        "JAVA_HOME",
        "JAVA8_HOME",
        "JAVA16_HOME",
        "JAVA17_HOME",
        "JAVA21_HOME",
        "JAVA25_HOME",
    ];
    for var in env_vars {
        if let Ok(home) = std::env::var(var) {
            let home_path = PathBuf::from(&home);
            push_java_installation(
                home_path.join("bin").join("javaw.exe"),
                &home_path,
                &mut seen,
                &mut out,
            );
        }
    }

    for root in java_search_roots() {
        let root_path = Path::new(root);
        let Ok(entries) = std::fs::read_dir(root_path) else {
            continue;
        };
        for entry in entries.flatten() {
            let base = entry.path();
            if !base.is_dir() {
                continue;
            }
            push_java_installation(
                base.join("bin").join("javaw.exe"),
                &base,
                &mut seen,
                &mut out,
            );
            let jre = base.join("jre");
            push_java_installation(jre.join("bin").join("javaw.exe"), &jre, &mut seen, &mut out);
        }
    }

    // Newest major first, then by path for stable ordering.
    out.sort_by(|a, b| b.major.cmp(&a.major).then_with(|| a.path.cmp(&b.path)));
    out
}

/// javaw.exe of an auto-downloaded runtime for `major`, if one is present.
/// The Adoptium archive extracts to a single top-level folder, so check both the
/// runtime root and one level down.
pub fn managed_java_bin(major: u32) -> Option<String> {
    let dir = crate::paths::java_runtimes_root().ok()?.join(major.to_string());

    let direct = dir.join("bin").join("javaw.exe");
    if direct.exists() {
        return Some(direct.to_string_lossy().into_owned());
    }

    for entry in std::fs::read_dir(&dir).ok()?.flatten() {
        let candidate = entry.path().join("bin").join("javaw.exe");
        if candidate.exists() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

/// Find a Java of the given major version: an explicit `JAVA<major>_HOME`, then a
/// system install, then an auto-downloaded managed runtime. `None` if none exist.
pub fn locate_java(major: u32) -> Option<String> {
    let env_var = match major {
        8 => "JAVA8_HOME",
        16 => "JAVA16_HOME",
        17 => "JAVA17_HOME",
        21 => "JAVA21_HOME",
        25 => "JAVA25_HOME",
        _ => "JAVA_HOME",
    };

    java_bin_from_env(env_var)
        .or_else(|| find_java_on_system(major))
        .or_else(|| managed_java_bin(major))
}

pub fn resolve_java_bin(mc_version: &str) -> String {
    let major = required_java_major(mc_version);

    if let Some(bin) = locate_java(major) {
        return bin;
    }

    if let Some(bin) = java_bin_from_env("JAVA_HOME") {
        if major == 8 {
            println!(
                "[WARN] Java {major} not found for MC {mc_version}, falling back to JAVA_HOME — may crash!"
            );
        }
        return bin;
    }

    println!("[WARN] No Java {major} found for MC {mc_version}, using 'javaw.exe' from PATH");
    "javaw.exe".to_string()
}

fn is_probably_32bit_java(java_bin: &str) -> bool {
    let lower = java_bin.to_ascii_lowercase();
    lower.contains("program files (x86)") || lower.contains("\\x86\\")
}

pub fn effective_ram_gb(java_bin: &str, requested_ram: u32) -> u32 {
    if is_probably_32bit_java(java_bin) {
        1
    } else {
        requested_ram.max(1)
    }
}

pub fn is_modern_mc(version: &str) -> bool {
    matches!(
        parse_mc_version(version),
        Some((1, minor, _)) if minor >= 17
    ) || matches!(parse_mc_version(version), Some((major, _, _)) if major >= 26)
}

fn g1_heap_region_size_mb(ram_gb: u32) -> u32 {
    match ram_gb {
        0..=4 => 4,
        5..=12 => 8,
        _ => 16,
    }
}

pub fn optimized_minecraft_jvm_args(ram_gb: u32) -> Vec<String> {
    let region_size = g1_heap_region_size_mb(ram_gb);

    vec![
        "-XX:+UseG1GC".to_string(),
        "-XX:+ParallelRefProcEnabled".to_string(),
        "-XX:MaxGCPauseMillis=200".to_string(),
        "-XX:+UnlockExperimentalVMOptions".to_string(),
        "-XX:+DisableExplicitGC".to_string(),
        "-XX:+AlwaysPreTouch".to_string(),
        "-XX:+UseStringDeduplication".to_string(),
        "-XX:G1NewSizePercent=30".to_string(),
        "-XX:G1MaxNewSizePercent=40".to_string(),
        format!("-XX:G1HeapRegionSize={region_size}M"),
        "-XX:G1ReservePercent=20".to_string(),
        "-XX:G1HeapWastePercent=5".to_string(),
        "-XX:G1MixedGCCountTarget=4".to_string(),
        "-XX:InitiatingHeapOccupancyPercent=15".to_string(),
        "-XX:G1MixedGCLiveThresholdPercent=90".to_string(),
        "-XX:G1RSetUpdatingPauseTimePercent=5".to_string(),
        "-XX:SurvivorRatio=32".to_string(),
        "-XX:+PerfDisableSharedMem".to_string(),
        "-XX:MaxTenuringThreshold=1".to_string(),
        "-Dsun.rmi.dgc.server.gcInterval=2147483646".to_string(),
        "-Dsun.rmi.dgc.client.gcInterval=2147483646".to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_java_25_calendar_versions() {
        assert_eq!(required_java_major("26.1"), 25);
        assert_eq!(required_java_major("26.1.2"), 25);
        assert!(is_modern_mc("26.1"));
    }
}
