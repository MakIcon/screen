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
Supported Minecraft Fabric releases: **1.21–1.21.11, 26.1, 26.1.1, 26.1.2,
26.2 and 26.3** (17 exact-version builds). Snapshots, Forge and NeoForge are not
included. Minecraft 1.21.x uses Java 21; Minecraft 26.x uses Java 25.

The client samples the player on the game thread at most four times per second.
Only one sample may be queued and one HTTP request may be in flight. Failed
connections back off to five seconds and retry automatically. Stale telemetry
is hidden after three seconds, so leaving a world cannot leave old health and
coordinates visible on stream. Stopping and restarting the service preserves
the session token, allowing a running game to reconnect.

Build all supported jars from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_obs_telemetry.ps1
powershell -ExecutionPolicy Bypass -File scripts\update_obs_telemetry_catalog.ps1
```

Use JDK 25 or later to build the full matrix. Loom uses its remapping plugin for
1.21.x and its unobfuscated plugin for 26.x; Minecraft 1.21.11 also needs the
renamed dimension accessor. Generated adapters live under `build/`, keeping the
client implementation shared. Each mod declares an exact Minecraft version.

`pnpm package:obs` creates `dist-extensions/screenlauncher-obs-telemetry.zip`.
Install this ZIP from the OBS Telemetry card in Extensions. The importer checks
each file's size and SHA-256 before atomically replacing the previous package.
Incomplete/corrupt archives leave the installed package intact. Restart the
Minecraft instance after updating the helper mod.
`pnpm package:extensions` packages both Mineflayer Bot and OBS Telemetry.
For unpublished local builds the catalog intentionally leaves JAR download URLs
empty, and the launcher offers ZIP installation. After publishing the assets,
run `scripts/update_obs_telemetry_catalog.ps1 -DownloadBaseUrl <immutable-asset-directory-url>`
to enable online installs. Use a URL pinned to the actual commit or release;
the script never invents remote locations. Packaging verifies all asset hashes.

Add `http://127.0.0.1:18991/overlay` as an OBS Browser source, or open `/settings`
to copy individual widget URLs. Read the actual port shown by the launcher if
18991 was busy. `?scale=8` fixes the pixel scale, `?bg=1` shows a preview
background and connection status, and `?lang=ru` selects Russian. The default
stream overlay remains transparent. `/overlay.json` returns only the data the
overlay needs; `/state.json` retains the full diagnostic response.
