# OBS Telemetry Fabric Mod

Client-only helper mod for ScreenLauncher's OBS Telemetry extension.

It reads the local human-controlled client player and posts telemetry to the
launcher through `http://127.0.0.1:<port>/api/telemetry`. The launcher injects
the required JVM properties at launch:

- `screen.obs.port`
- `screen.obs.token`

Build all supported bundled jars from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_obs_telemetry.ps1
```
