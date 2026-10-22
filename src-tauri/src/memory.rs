use serde::Serialize;
use sysinfo::System;

pub const GIB: u64 = 1024 * 1024 * 1024;

/// Installed capacity, OS-usable physical memory, the whole-GiB heap limit,
/// and the initial allocation are distinct values.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMemoryInfo {
    pub installed_bytes: u64,
    /// Physical memory usable by the OS, after hardware reservations.
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub max_minecraft_ram_gb: u32,
    pub recommended_minecraft_ram_gb: u32,
}

impl SystemMemoryInfo {
    fn from_bytes(total_bytes: u64, available_bytes: u64) -> Self {
        let available_bytes = available_bytes.min(total_bytes);
        let whole_gb = |bytes: u64| (bytes / GIB).min(u32::MAX as u64) as u32;
        // The launcher supports integer heaps starting at 1 GiB. Do not round
        // usable physical RAM up to an installed DIMM capacity (e.g. 24 -> 32).
        let max_minecraft_ram_gb = whole_gb(total_bytes).max(1);
        // Keep the usual 4-GiB default when it fits. Leave 2 GiB of total RAM
        // for the system and at least 1 GiB of currently available RAM unused.
        // This is a recommendation; explicit allocations use the physical limit.
        let recommended_minecraft_ram_gb = 4
            .min(max_minecraft_ram_gb)
            .min(whole_gb(total_bytes.saturating_sub(2 * GIB)).max(1))
            .min(whole_gb(available_bytes.saturating_sub(GIB)).max(1));
        Self {
            installed_bytes: total_bytes,
            total_bytes,
            available_bytes,
            max_minecraft_ram_gb,
            recommended_minecraft_ram_gb,
        }
    }

    pub fn total_gb(&self) -> f64 {
        self.total_bytes as f64 / GIB as f64
    }

    fn with_installed_bytes(mut self, installed_bytes: Option<u64>) -> Self {
        self.installed_bytes = installed_bytes
            .filter(|bytes| *bytes >= self.total_bytes)
            .unwrap_or(self.total_bytes);
        // Explicit allocations may use the full installed capacity. OS-usable
        // memory remains a separate threshold for the UI warning and defaults.
        self.max_minecraft_ram_gb = (self.installed_bytes / GIB).min(u32::MAX as u64).max(1) as u32;
        self
    }

    pub fn installed_gb(&self) -> f64 {
        self.installed_bytes as f64 / GIB as f64
    }

    pub fn clamp_allocation(&self, ram: u32) -> u32 {
        ram.clamp(1, self.max_minecraft_ram_gb)
    }
}

pub fn detect_system_memory() -> SystemMemoryInfo {
    let mut system = System::new();
    system.refresh_memory();
    SystemMemoryInfo::from_bytes(system.total_memory(), system.available_memory())
        .with_installed_bytes(installed_memory_bytes())
}

pub fn detect_system_memory_gb() -> f64 {
    detect_system_memory().installed_gb()
}

#[cfg(windows)]
fn installed_memory_bytes() -> Option<u64> {
    let mut kilobytes = 0u64;
    // SAFETY: the API writes one u64 to this valid, exclusively borrowed slot.
    let success = unsafe {
        windows_sys::Win32::System::SystemInformation::GetPhysicallyInstalledSystemMemory(
            &mut kilobytes,
        )
    };
    if success == 0 {
        return None;
    }
    kilobytes.checked_mul(1024).filter(|bytes| *bytes > 0)
}

#[cfg(not(windows))]
fn installed_memory_bytes() -> Option<u64> {
    None
}

pub fn clamp_ram_to_system(ram: u32) -> u32 {
    detect_system_memory().clamp_allocation(ram)
}

/// One decimal for display, without overstating the measured capacity.
pub fn format_system_memory_gb(gb: f64) -> String {
    let displayed = (gb * 10.0).floor() / 10.0;
    format!("{displayed:.1}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_all_installed_ram_without_losing_the_usable_memory_threshold() {
        for (installed_gb, reserved_bytes) in [(64, 2_511_634_432), (24, 128 * 1024 * 1024)] {
            let installed = installed_gb * GIB;
            let usable = installed - reserved_bytes;
            let memory = SystemMemoryInfo::from_bytes(usable, usable / 2)
                .with_installed_bytes(Some(installed));
            assert_eq!(memory.installed_gb(), installed_gb as f64);
            assert_eq!(
                format_system_memory_gb(memory.installed_gb()),
                installed_gb.to_string()
            );
            assert_eq!(memory.total_bytes, usable);
            assert_eq!(memory.max_minecraft_ram_gb, installed_gb as u32);
            assert_eq!(
                memory.clamp_allocation(installed_gb as u32),
                installed_gb as u32
            );
            assert_eq!(memory.clamp_allocation(256), installed_gb as u32);
            assert!(memory.clamp_allocation(256) as u64 * GIB > usable);
            assert!(memory.recommended_minecraft_ram_gb as u64 * GIB < usable);
        }
    }

    #[test]
    fn falls_back_to_measured_ram_when_firmware_capacity_is_missing_or_invalid() {
        let memory = SystemMemoryInfo::from_bytes(24 * GIB, 12 * GIB);
        assert_eq!(
            memory.clone().with_installed_bytes(None).installed_gb(),
            24.0
        );
        assert_eq!(
            memory.with_installed_bytes(Some(16 * GIB)).installed_gb(),
            24.0
        );
    }

    #[test]
    fn irregular_memory_capacities_are_never_rounded_up() {
        for gb in [2, 3, 6, 12, 24, 48, 96] {
            let memory = SystemMemoryInfo::from_bytes(gb * GIB, gb * GIB);
            assert_eq!(memory.total_bytes, gb * GIB);
            assert_eq!(memory.total_gb(), gb as f64);
            assert_eq!(memory.max_minecraft_ram_gb, gb as u32);
            assert_eq!(memory.clamp_allocation(256), gb as u32);
        }
    }

    #[test]
    fn heap_limit_falls_back_to_usable_bytes_when_installed_capacity_is_unknown() {
        let total = 24 * GIB - 128 * 1024 * 1024;
        let memory = SystemMemoryInfo::from_bytes(total, 20 * GIB);
        assert_eq!(memory.total_bytes, total);
        assert_eq!(memory.max_minecraft_ram_gb, 23);
        assert_eq!(memory.clamp_allocation(32), 23);
        assert_eq!(memory.clamp_allocation(0), 1);
        assert_eq!(format_system_memory_gb(memory.total_gb()), "23.8");
    }

    #[test]
    fn recommendation_leaves_headroom_without_changing_the_physical_limit() {
        let idle = SystemMemoryInfo::from_bytes(24 * GIB, 20 * GIB);
        let busy = SystemMemoryInfo::from_bytes(24 * GIB, 3 * GIB);
        assert_eq!(idle.max_minecraft_ram_gb, busy.max_minecraft_ram_gb);
        assert_eq!(idle.recommended_minecraft_ram_gb, 4);
        assert_eq!(busy.recommended_minecraft_ram_gb, 2);
        assert_eq!(busy.clamp_allocation(8), 8);
        let small = SystemMemoryInfo::from_bytes(4 * GIB, 4 * GIB);
        assert_eq!(small.recommended_minecraft_ram_gb, 2);
    }

    #[test]
    fn missing_or_inconsistent_measurements_do_not_underflow_or_panic() {
        let missing = SystemMemoryInfo::from_bytes(0, 0);
        assert_eq!(missing.clamp_allocation(0), 1);
        assert_eq!(missing.recommended_minecraft_ram_gb, 1);
        let inconsistent = SystemMemoryInfo::from_bytes(2 * GIB, 8 * GIB);
        assert_eq!(inconsistent.available_bytes, 2 * GIB);
        assert_eq!(inconsistent.recommended_minecraft_ram_gb, 1);
    }
}
