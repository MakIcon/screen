use std::path::{Path, PathBuf};

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

fn find_java_on_system(major: u32) -> Option<String> {
    let roots: &[&str] = &[
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
    ];

    for root in roots {
        if let Some(bin) = scan_java_root(root, major) {
            return Some(bin);
        }
    }
    None
}

pub fn resolve_java_bin(mc_version: &str) -> String {
    let major = required_java_major(mc_version);

    let env_var = match major {
        8 => "JAVA8_HOME",
        16 => "JAVA16_HOME",
        17 => "JAVA17_HOME",
        21 => "JAVA21_HOME",
        _ => "JAVA_HOME",
    };

    if let Some(bin) = java_bin_from_env(env_var) {
        return bin;
    }

    if let Some(bin) = find_java_on_system(major) {
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

    println!(
        "[WARN] No Java {major} found for MC {mc_version}, using 'javaw.exe' from PATH"
    );
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
    matches!(parse_mc_version(version), Some((1, minor, _)) if minor >= 17)
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
