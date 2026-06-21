# ScreenLauncher

Desktop Minecraft launcher built with React, TypeScript, Tauri and Rust. It manages isolated builds, Minecraft/loader installation, Modrinth content, Microsoft accounts, runtime settings, import/export and optional launcher plugins.

## Project layout

- `src/` — React UI, tabs, reusable controls and frontend hooks.
- `src-tauri/src/commands/` — Tauri command boundary for accounts, builds, settings and Modrinth.
- `src-tauri/src/minecraft/` — version resolution, downloads, Java selection and game launch.
- `src-tauri/src/plugins/` — Discord RPC, Mineflayer, BlueMap and OBS telemetry runtimes.
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

Build the OBS telemetry mod for every version listed in `obs-telemetry-mod/gradle.properties`:

```powershell
.\scripts\build_obs_telemetry.ps1
```

To build only selected versions, pass them explicitly:

```powershell
.\scripts\build_obs_telemetry.ps1 -MinecraftVersions 1.21.1,1.21.4
```