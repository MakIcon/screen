<div align="center">

<a href="https://github.com/MakIcon/screen/releases">
  <img src="docs/assets/readme-banner.svg" alt="ScreenLauncher — Minecraft, the way you want it. View releases." width="100%" />
</a>

<br />

**Your Minecraft. Your builds. Your rules.**

A desktop Minecraft launcher that brings your builds, mods and settings together.

<br />

<a href="https://github.com/MakIcon/screen/releases/download/apperance/ScreenLauncher_0.1.0_x64-setup.exe">
  <img src="docs/assets/download-windows.svg" alt="Download ScreenLauncher for Windows (64-bit EXE installer)" width="320" />
</a>

<br />

<sub>Windows x64 · EXE installer · <a href="https://github.com/MakIcon/screen/releases">All releases</a></sub>

<br /><br />

</div>

## Your Minecraft, all in one place

ScreenLauncher makes it easier to organize different Minecraft setups without having to manage their files by hand. Create a build for the way you want to play, install content from Modrinth and launch it from one place.

- **Separate builds, no compromises.** Set up Vanilla, Fabric, Quilt, Forge or NeoForge installations independently. Each build keeps its own configuration.
- **Mods without leaving the launcher.** Discover mods, resource packs and shaders through Modrinth. Required mod dependencies are resolved when installing compatible projects.
- **A look that feels like yours.** Customize the launcher appearance and build cards instead of settling for the same layout everywhere.
- **Control over your game.** Choose Java settings, allocated memory and other options for individual builds.
- **Pick up where you left off.** See your recent build and playtime information, then get back into the game.

## Download & installation

Getting started doesn't require any development tools.

1. **Download** the Windows installer using the button above.
2. **Install** ScreenLauncher by running the downloaded `.exe` file.
3. **Open the launcher**, create a build, choose your Minecraft version and press Play.

Want to add mods? Open the **Modrinth** section after creating a compatible build.

> [!NOTE]
> The repository is currently **private**, so GitHub downloads require repository access. The latest published release is labeled **v2.0**, although its Windows installer is named `ScreenLauncher_0.1.0_x64-setup.exe`. That published installer may not include every change on the `main` branch.

## More than just a Play button

- **Build import & export** — move or back up build configurations using supported transfer formats.
- **Microsoft and offline account workflows** — manage supported ways to start the game.
- **Flexible runtime settings** — configure Java, JVM arguments and per-build environment variables.
- **Safer downloads** — verify downloaded Minecraft files using available checksums and reuse valid cached files.
- **Optional integrations** — Discord Rich Presence, OBS telemetry and a Mineflayer bot extension for more advanced setups.

These extras are available when you need them; you can also keep things simple and just play.

## Frequently asked questions

<details>
<summary><b>Do I need to install Java myself?</b></summary>

ScreenLauncher includes Java runtime selection and management. Depending on your Minecraft version and setup, a compatible runtime may need to be selected or downloaded. A Java settings test can help diagnose problems.

</details>

<details>
<summary><b>Does it support Fabric, Forge and other mod loaders?</b></summary>

Yes. You can create builds for Vanilla, Fabric, Quilt, Forge and NeoForge. The Modrinth browser can help you find content compatible with your build.

</details>

<details>
<summary><b>Where can I download another version?</b></summary>

See [GitHub Releases](https://github.com/MakIcon/screen/releases). The most recent published release provides a Windows x64 EXE installer, and an [older release](https://github.com/MakIcon/screen/releases/tag/first) includes an MSI installer.

</details>

<details>
<summary><b>Is there a macOS or Linux download?</b></summary>

There is no published macOS or Linux installer listed in the repository's current releases. The project is based on Tauri, but that does not mean builds for every platform are already available.

</details>

---

<div align="center">

### Built with

<a href="https://tauri.app"><img src="docs/assets/badge-tauri.svg" alt="Built with Tauri 2" height="28" /></a>&nbsp;
<a href="https://www.rust-lang.org"><img src="docs/assets/badge-rust.svg" alt="Powered by Rust" height="28" /></a>&nbsp;
<a href="https://react.dev"><img src="docs/assets/badge-react.svg" alt="React and TypeScript frontend" height="28" /></a>

<sub>React 19 · TypeScript · Vite 7 · Tauri 2 · Rust</sub>

</div>

## Activity snake

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/github-contribution-snake-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/github-contribution-snake.svg" />
  <img src="docs/assets/github-contribution-snake.svg" alt="Animated snake moving across MakIcon's GitHub contribution graph" width="100%" />
</picture>

<br />

<sub>Generated with <a href="https://github.com/Platane/snk">Platane/snk</a> · Updated daily</sub>

</div>

<details>
<summary><b>Development & building from source</b></summary>

ScreenLauncher uses React and TypeScript for its frontend, with Tauri 2 and Rust for its desktop backend.

**Requirements:** Node.js, pnpm, Rust and the [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/MakIcon/screen.git
cd screen
pnpm install
pnpm tauri dev
```

To create a native application bundle or installer for your development platform:

```bash
pnpm tauri build
```

Useful checks:

```bash
pnpm check             # TypeScript and Rust
pnpm test              # Rust tests
pnpm test:web          # Frontend tests
pnpm test:pathfinder   # Pathfinder tests
pnpm test:worker       # Mineflayer worker tests
pnpm lint              # Lint frontend code
```

**Project structure**

```text
src/                       React frontend, components and hooks
src-tauri/src/             Tauri commands and Minecraft backend
extensions/mineflayer-bot/ Optional bot worker and pathfinding
obs-telemetry-mod/         Fabric client-side telemetry helper
public/                    App icon and web assets
scripts/                   Build and packaging tools
```

The main application icon is maintained in `public/launcher-icon.svg`. Use `pnpm icons` to regenerate platform icons.

For the bot extension, see the [combat guide](extensions/mineflayer-bot/COMBAT.md), [survival guide](extensions/mineflayer-bot/SURVIVAL.md) and [pathfinding documentation](extensions/mineflayer-bot/pathfinding/README.md).

</details>

<div align="center">

<sub>Made by <a href="https://github.com/MakIcon">MakIcon</a> · <a href="THIRD_PARTY_NOTICES.md">Third-party notices</a> · <a href="https://github.com/MakIcon/screen/issues">Issues</a></sub>

<br />

<sub>ScreenLauncher is an independent project and is not affiliated with or endorsed by Mojang Studios or Microsoft.</sub>

</div>
