# ScreenLauncher

Desktop Minecraft launcher built with React, TypeScript, Tauri and Rust. It manages isolated builds, Minecraft/loader installation, Modrinth content, Microsoft accounts, runtime settings, import/export and optional launcher plugins.

Installing a mod from Modrinth automatically installs its required dependencies, including nested dependencies and exact versions specified by the author. Compatible tracked dependencies are reused and disabled required mods are enabled. Optional and embedded dependencies are not downloaded. Dependency resolution and downloads must succeed before the mod files are installed; missing or conflicting requirements are reported as installation errors.

The mod details window previews required dependencies for the selected build before installation, showing each dependency's version and whether it will be downloaded, reused or enabled.

## Project layout

- `src/` — React UI, tabs, reusable controls and frontend hooks.
- `src-tauri/src/commands/` — Tauri command boundary for accounts, builds, settings and Modrinth.
- `src-tauri/src/minecraft/` — version resolution, downloads, Java selection and game launch.
- `src-tauri/src/plugins/` — launcher-side bridges for Discord RPC, optional packages and OBS telemetry.
- `extensions/mineflayer-bot/` — isolated Mineflayer worker and locked Node dependency manifest. Its dependencies are installed on demand into the launcher's data directory.
- `obs-telemetry-mod/` — client-only Fabric helper mod bundled with the launcher.
- `scripts/` — maintained project build scripts.

## Development

Requirements: Node.js, pnpm, the Rust toolchain and the platform prerequisites for Tauri 2.

```powershell
pnpm install
pnpm tauri dev
```

Useful checks:

```powershell
pnpm build
pnpm check
pnpm test
```

Build a standalone optional-extension archive when one is needed for manual distribution:

```powershell
pnpm package:extensions
```

The Extensions screen installs Mineflayer's locked dependencies from the npm registry on demand into `%APPDATA%/ScreenLauncher/extensions/mineflayer-bot`. BlueMap's CLI/server package is downloaded on demand into `%APPDATA%/ScreenLauncher/extensions/blue-map-server`. Both packages can be removed independently from the launcher.

Build the OBS telemetry mod for every version listed in `obs-telemetry-mod/gradle.properties`:

```powershell
.\scripts\build_obs_telemetry.ps1
```

To build only selected versions, pass them explicitly:

```powershell
.\scripts\build_obs_telemetry.ps1 -MinecraftVersions 1.21.1,1.21.4
```
