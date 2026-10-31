# Offline LAN hosting

ScreenLauncher loads this agent automatically for every Minecraft launch, with
no version/loader allowlist and no settings toggle. It runs on Java 8 and newer.
The host launches the game through ScreenLauncher and opens a world to LAN;
guests use distinct nicknames. Offline and Microsoft host accounts are supported.

The transformer recognizes integrated servers by their vanilla startup log marker
and superclass, and recognizes the login hello handler by its invariant protocol
validation message. It preserves the original authentication getter and routes
its result through a bootstrap-visible helper. Only recognized integrated server
instances accept offline logins; dedicated servers retain their original decision.
Obfuscated, named and remapped class names are detected rather than hardcoded.
Legacy pre-Netty LAN versions already disable authentication themselves and need
no login patch. Versions without integrated LAN hosting are left unchanged.

Use a trusted LAN/VPN: offline player names are not authenticated. The friend must
run the updated launcher on the host, or configure equivalent offline hosting.
A guest launcher cannot change remote server policy. Servers requiring Microsoft
authentication still require a valid Microsoft account and session. The original
Minecraft JAR, firewall and port forwarding are unchanged. Unknown or ambiguous
modded login layouts retain the original behavior and are logged for diagnosis;
there is no claim that every third-party networking replacement is compatible.

ASM core and tree are shaded into an isolated package to avoid mod-loader library
conflicts. A separate JDK-only bootstrap JAR makes the helper visible even to game
class loaders with no application parent. Both JARs are embedded and extracted
together under a content-addressed directory in `%APPDATA%\ScreenLauncher\agents`.
Dependency checksums and the BSD license are included in this directory's sources.

Rebuild with JDK 17 or newer on PATH (or set `JAVA_HOME`), and test:

```powershell
node scripts/build_offline_lan_agent.mjs --test
```

Pass real Minecraft client JAR paths after `--test`. The test parses each real
host/login class, verifies the transformed method and the original authentication
getter, then executes equivalent obfuscated calls in an isolated loader with full
JVM verification. It checks unchanged dedicated-server decisions and recognizes
native offline LAN in older releases. Set `SCREEN_LAN_TEST_JAVA` to test a specific
Java runtime executable. These are bytecode/VM checks, not a two-computer LAN test.
