# Offline LAN hosting

ScreenLauncher includes a small Java agent for **Vanilla 26.1, 26.1.1 and 26.1.2**.
The world host enables **Settings → Offline players in LAN** before starting
Minecraft, then opens a single-player world to LAN. Guests can use offline accounts
and must choose distinct nicknames. The host can use either an offline or Microsoft
account. A running game must be restarted after changing the setting.

The setting defaults to off. It only affects the integrated server in the host's
game process after `isPublished()` becomes true. It overrides
`IntegratedServer.usesAuthentication()` to return false while the world is shared;
private worlds delegate to the original superclass implementation. Vanilla's
integrated server already returns false for `enforceSecureProfile()`. Dedicated
servers, remote server connections, Microsoft sign-in, and the original Minecraft
JAR are unchanged. The agent does not open ports or change firewall settings.

Use a trusted LAN/VPN: offline player names are not authenticated. Enabling the
setting on a guest cannot change the authentication policy of a friend's host.
The friend must use this setting or configure equivalent offline hosting in their
own launcher/mod. Other versions and mod loaders retain their original behavior.

The agent uses Java 25's standard Class-File API, without external libraries.
Its JAR is embedded in the launcher; users do not need a compiler. At launch it is
extracted to a content-addressed file under `%APPDATA%\ScreenLauncher\agents`.

Rebuild with JDK 25 or newer on PATH (or set `JAVA_HOME`), and test:

```powershell
node scripts/build_offline_lan_agent.mjs --test
```

Pass real Minecraft client JAR paths after `--test` to verify their transformations
and preservation of every original method's bytecode. The fixture runs with full
JVM verification both with and without `-javaagent` and checks private worlds,
published worlds, closing LAN, and unchanged superclass behavior. With installed
Minecraft JARs, it also loads each real IntegratedServer class and executes its
authentication methods without creating a world or opening a window. Set
`SCREEN_LAN_TEST_JAVA` to test with a specific Java runtime executable. This does
not replace a two-computer LAN connection check.
