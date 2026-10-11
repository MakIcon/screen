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

The application icon's single source is `public/launcher-icon.svg`: vector paths and rectangles, without embedded raster images or fonts. Run `pnpm icons` to regenerate the desktop PNGs (16–1024 px), Windows ICO, macOS ICNS, Windows Store/mobile assets and web icons. The PNG is a generated preview of the SVG. The ICO stores its 256 px frame first because Tauri uses the first frame for the default window icon; the other frames cover smaller Windows DPI sizes. Both `pnpm build` and `pnpm tauri dev` regenerate the assets automatically. The executable, main and secondary windows, Alt+Tab, taskbar, installers, uninstaller and application shortcuts use this artwork. Rebuild and restart the native application to display it; previously installed copies need the new executable or installer.

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

Mineflayer Bot uses the supplied Minecraft pathfinding rewrite, maintained in `extensions/mineflayer-bot/pathfinding`. `pnpm build:pathfinder` rebuilds the bundled `pathfinder.cjs` that Tauri and standalone extension archives ship. Run `pnpm test:pathfinder` and `pnpm test:worker` to check the planner, simulated movement and worker integration. Integration details and limits are documented in `extensions/mineflayer-bot/pathfinding/README.md`.

Mineflayer Bot 1.7.2 also includes Custom PvP, Mineflayer PvP and Minecraft HawkEye. The **PvP / Лук** settings tab controls difficulty, tactics, shields, reaction, bow prediction, accuracy and shot interval. Smooth aiming speed is adjustable from 10% to 300% for melee and bow combat. Owners can use `!attack Player`, `!bow Player`, `!pvp auto` (hostile mobs) and `!pvp stop`; explicit targets can include the owner, and movement commands also stop combat. See [combat configuration and commands](extensions/mineflayer-bot/COMBAT.md). Existing installations need an extension update from a launcher built with this source.

Build the OBS telemetry mod for every version listed in `obs-telemetry-mod/gradle.properties`:

```powershell
.\scripts\build_obs_telemetry.ps1
```

To build only selected versions, pass them explicitly:

```powershell
.\scripts\build_obs_telemetry.ps1 -MinecraftVersions 1.21.1,1.21.4
```
