# ScreenLauncher

Desktop Minecraft launcher built with React, TypeScript, Tauri and Rust. It manages isolated builds, Minecraft/loader installation, Modrinth content, Microsoft accounts, runtime settings, import/export and optional launcher plugins.

Local builds, settings and accounts load independently of the Minecraft version service. The launcher displays a cached version manifest before refreshing it in the background, so a network failure does not hide installed builds.

Minecraft downloads stream into temporary files and verify the available size and SHA-1 metadata before replacing cached files. Existing files are verified on first use; unchanged files reuse the verification result for the current launcher session. Downloads use a bounded queue and stop all remaining workers when one fails. Build-index edits are serialized from reading through committing, and installation progress is throttled to 150 ms while always reporting phase changes and completion.

Installing a mod from Modrinth automatically installs its required dependencies, including nested dependencies and exact versions specified by the author. Compatible tracked dependencies are reused and disabled required mods are enabled. Optional and embedded dependencies are not downloaded. Dependency resolution and downloads must succeed before the mod files are installed; missing or conflicting requirements are reported as installation errors.

The mod details window previews required dependencies for the selected build before installation, showing each dependency's version and whether it will be downloaded, reused or enabled.

Each build's Settings → Build tab includes environment-variable overrides (name/value pairs). The game inherits the system environment and applies these overrides to its own process; values are passed literally and may be empty. Environment variables can be included in `.slbuild` and `.mrpack` transfers using their separate selection, which is off by default for exports.

Test Java Settings checks the current Java executable, memory limits, JVM arguments and environment without starting Minecraft or saving the draft. It displays JVM diagnostics and warns about a Java version different from the expected Minecraft runtime. A check is stopped after 20 seconds. Existing builds are checked from their Minecraft directory, so relative JVM paths work as they do at launch.

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

The PaintShot application icon is maintained in `public/paintshot.svg`. After editing it, run `pnpm icons` to regenerate desktop PNGs, the Windows ICO, the macOS ICNS, mobile assets and web icons. Tauri uses these assets for the executable, windows, Alt+Tab and taskbar. Restart the native application after rebuilding to see an updated icon.

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
