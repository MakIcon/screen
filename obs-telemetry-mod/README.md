# OBS Telemetry Fabric Mod

Client-only helper mod for ScreenLauncher's OBS Telemetry extension.

It reads the local human-controlled client player and posts telemetry to the
launcher through `http://127.0.0.1:<port>/api/telemetry`. The launcher injects
the required JVM properties at launch:

- `screen.obs.port`
- `screen.obs.token`

Install **OBS TELEMETRY** from the launcher's Extensions page before enabling it.
The package (Fabric jars, Monocraft font and license) is downloaded separately
into `%APPDATA%\ScreenLauncher\extensions\obs-telemetry`. It is not included
in the launcher installer. Update and remove it from the same page.
Supported Minecraft Fabric versions: **1.21, 1.21.1 and 1.21.4**.

Build all supported jars from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_obs_telemetry.ps1
```

`pnpm package:obs` creates `dist-extensions/screenlauncher-obs-telemetry.zip`.
`pnpm package:extensions` packages both Mineflayer Bot and OBS Telemetry.
When publishing changed mod assets, update `extensions/obs-telemetry/extension.json`
with their version, sizes, SHA-256 hashes and URLs pinned to the commit containing
the published files. Packaging checks the local files against this catalog.
