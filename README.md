<div align="center">

<img src="docs/assets/readme-banner.svg" alt="ScreenLauncher — Your Minecraft. Your builds. Your rules." width="100%" />

<br/>

[![CI](https://img.shields.io/github/actions/workflow/status/MakIcon/screen/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI&color=c94709)](https://github.com/MakIcon/screen/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/VERSION-0.1.0-c94709?style=for-the-badge&labelColor=252524)](https://github.com/MakIcon/screen)
[![Tauri](https://img.shields.io/badge/TAURI-2-252524?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/RUST-BACKEND-252524?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)

[![React](https://img.shields.io/badge/REACT-19-20211f?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TYPESCRIPT-5.8-20211f?style=flat-square&logo=typescript&logoColor=3178C6)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/VITE-7-20211f?style=flat-square&logo=vite&logoColor=646CFF)](https://vite.dev/)
[![pnpm](https://img.shields.io/badge/PNPM-WORKSPACE-20211f?style=flat-square&logo=pnpm&logoColor=F69220)](https://pnpm.io/)
[![Minecraft](https://img.shields.io/badge/MADE_FOR-MINECRAFT-20211f?style=flat-square&labelColor=c94709)](https://www.minecraft.net/)
[![Modrinth](https://img.shields.io/badge/CONTENT-MODRINTH-20211f?style=flat-square&labelColor=c94709)](https://modrinth.com/)

**A customizable desktop Minecraft launcher built with React, TypeScript, Tauri and Rust.**

Manage isolated builds, install your favorite content, personalize the interface and extend the experience — all from one place.

[**Features**](#-features) · [**Get started**](#-getting-started) · [**Tech stack**](#-tech-stack) · [**Extensions**](#-extensions) · [**Development**](#-development)

</div>

---

## ✦ A different way to launch Minecraft

ScreenLauncher brings your Minecraft versions, mod loaders, content and settings together in one desktop application. Instead of juggling folders and profiles, create independent **builds**, tune each one and get straight into the game.

<table>
<tr>
<td width="50%" valign="top">

### ◈ Your builds, your setup

Create and manage isolated Minecraft installations with support for **Vanilla, Fabric, Quilt, Forge and NeoForge**. Give each build its own configuration, Java settings and appearance.

</td>
<td width="50%" valign="top">

### ◈ Content without the hassle

Discover **mods, resource packs and shaders** with integrated Modrinth browsing. Compatible required mod dependencies are resolved automatically when you install a project.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### ◈ Make it yours

Personalize build cards, launcher appearance and settings. Track play sessions, switch between builds and keep your Minecraft setup organized.

</td>
<td width="50%" valign="top">

### ◈ More than a launcher

Optional extensions, including a **Mineflayer bot**, plus Discord Rich Presence and OBS telemetry integrations make ScreenLauncher an extensible desktop project.

</td>
</tr>
</table>

## ✨ Features

| | Feature | Details |
|:--:|---|---|
| 🎮 | **Build management** | Create, select, import, export and launch isolated builds. |
| 🧩 | **Mod loaders** | Vanilla, Fabric, Quilt, Forge and NeoForge. |
| 📦 | **Modrinth integration** | Browse and install compatible mods, resource packs and shaders. |
| 🔗 | **Dependency resolution** | Install required Modrinth mod dependencies, including nested dependencies. |
| 🎨 | **Customization** | Themes, configurable build cards and personalized appearance. |
| 👤 | **Accounts** | Microsoft account support and offline launch workflows. |
| ☕ | **Java control** | Configure memory, JVM arguments, Java runtime and per-build environment variables. |
| 🕹️ | **Play statistics** | Last-played information and time-in-game tracking. |
| 🧰 | **Optional extensions** | Mineflayer bot, OBS telemetry and other launcher integrations. |
| 🛡️ | **Download verification** | Cached file verification and SHA-1 checks where metadata is available. |

<details>
<summary><b>⚙️ More on downloads and build reliability</b></summary>
<br/>

- Locally stored builds, settings and accounts can load even when the Minecraft version service is unavailable.
- A cached version manifest is shown before a background refresh.
- Minecraft downloads use temporary files, bounded concurrency and integrity checks before replacing cached assets.
- Build-index writes are serialized to reduce conflicting modifications.
- Installation progress is throttled while still reporting phase changes and completion.
- Modrinth required dependencies are resolved before installation; missing or incompatible requirements are reported instead of silently skipped.

</details>

## 🧱 Tech stack

<div align="center">

| Frontend | Desktop & backend | Tooling & integrations |
|:---:|:---:|:---:|
| React 19 | Tauri 2 | pnpm |
| TypeScript | Rust | Vite 7 |
| HTML / CSS | Tokio | Modrinth |
| Three.js / WebGPU tooling | Reqwest | Mineflayer / Fabric |

</div>

## 🚀 Getting started

> [!NOTE]
> This repository is currently **private**. The instructions below are for developers with repository access, not a published end-user installer.

### Requirements

- [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/installation)
- [Rust toolchain](https://rustup.rs/)
- [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/)
- Windows PowerShell for the provided extension packaging and OBS build scripts

### Run locally

```bash
git clone https://github.com/MakIcon/screen.git
cd screen
pnpm install
pnpm tauri dev
```

Tauri launches the desktop application with the Vite development server. The launcher's icons are generated automatically as part of the development process.

### Build and verify

```bash
# Build the frontend (including Pathfinder and icon generation)
pnpm build

# TypeScript and Rust checks
pnpm check

# Rust tests
pnpm test

# Web tests
pnpm test:web

# Mineflayer Pathfinder and worker tests
pnpm test:pathfinder
pnpm test:worker

# Linting
pnpm lint
```

To create a native desktop bundle, run:

```bash
pnpm tauri build
```

> [!TIP]
> Use `pnpm icons` after editing `public/launcher-icon.svg`. This SVG is the source for the generated application icons, Windows ICO, macOS ICNS and web icons.

## 🧩 Extensions

ScreenLauncher includes optional components that live alongside the desktop app.

### Mineflayer Bot

An isolated Node.js worker for Minecraft automation, featuring a maintained pathfinding implementation and configurable combat capabilities. Its dependencies are installed on demand into the launcher's application data.

The extension includes PvP and bow settings such as tactics, shield behavior, reaction time, prediction and aiming speed.

```text
!attack Player    Attack a specific player
!bow Player       Use ranged combat against a player
!pvp auto         Target hostile mobs
!pvp stop         Stop combat
```

See [combat commands](extensions/mineflayer-bot/COMBAT.md), [survival documentation](extensions/mineflayer-bot/SURVIVAL.md) and [pathfinding details](extensions/mineflayer-bot/pathfinding/README.md).

### OBS telemetry

A client-side Fabric helper mod is maintained in [`obs-telemetry-mod/`](obs-telemetry-mod/). The repository currently lists Minecraft **1.21, 1.21.1 and 1.21.4** as supported build targets.

On Windows, build all configured versions:

```powershell
.\scripts\build_obs_telemetry.ps1
```

Or select versions explicitly:

```powershell
.\scripts\build_obs_telemetry.ps1 -MinecraftVersions 1.21.1,1.21.4
```

### Packaging optional extensions

```powershell
pnpm package:extensions
```

Mineflayer's dependencies are installed into `%APPDATA%/ScreenLauncher/extensions/mineflayer-bot` when needed. The optional BlueMap server package is also downloaded on demand to the launcher's data directory. Optional components can be removed separately from the launcher.

## 🗂️ Project structure

```text
screen/
├── src/                    # React interface, components, hooks and tabs
├── src-tauri/
│   └── src/
│       ├── commands/       # Frontend-to-native command handlers
│       ├── minecraft/      # Minecraft installation and launching
│       └── plugins/        # Launcher-side integrations and bridges
├── extensions/
│   └── mineflayer-bot/     # Optional Node.js bot and pathfinding
├── obs-telemetry-mod/      # Client-side Fabric helper
├── public/                 # Application icon and static assets
├── docs/assets/            # README artwork
├── scripts/                # Build and packaging scripts
└── .github/workflows/      # Continuous integration
```

## 🔧 Advanced configuration

<details>
<summary><b>Java settings and diagnostics</b></summary>
<br/>

Configure the Java executable, allocated memory, JVM arguments and build-specific environment variables. The **Test Java Settings** action validates the draft configuration without launching Minecraft or saving changes.

The test includes JVM diagnostics, runtime-version warnings and a 20-second timeout. Existing builds are tested from their Minecraft directory so relative JVM paths behave consistently with game launches.

</details>

<details>
<summary><b>Import, export and environment variables</b></summary>
<br/>

Builds can be transferred with `.slbuild` and `.mrpack` formats. Per-build environment-variable overrides are literal name/value pairs applied to the game process on top of the system environment.

Environment variables have a separate export selection that is disabled by default. Review exported settings carefully before sharing a build.

</details>

<details>
<summary><b>Icon generation and native packaging</b></summary>
<br/>

The single source of the launcher artwork is `public/launcher-icon.svg`. The `pnpm icons` script generates PNG variants, ICO, ICNS and other platform assets. Rebuild the native app to propagate icon changes into the taskbar, installer and application shortcuts.

To rebuild the bundled Mineflayer pathfinder:

```bash
pnpm build:pathfinder
pnpm test:pathfinder
```

</details>

## 🤝 Contributing

Issues, suggestions and pull requests can help improve the project when repository access is available. Before submitting changes, run the relevant checks and keep the code consistent with the existing TypeScript, Rust, ESLint and Prettier setup.

## 📜 Credits & notices

ScreenLauncher integrates open-source tools and components. Refer to [third-party notices](THIRD_PARTY_NOTICES.md) and the individual extension license files for attribution and applicable terms.

> [!IMPORTANT]
> ScreenLauncher is an independent project and is **not affiliated with or endorsed by Mojang Studios or Microsoft**. Minecraft and related trademarks belong to their respective owners.

---

<div align="center">

<img src="public/launcher-icon.svg" width="64" alt="ScreenLauncher icon" />

### SCREENLAUNCHER

**Craft your setup. Launch your world.**

[![View source](https://img.shields.io/badge/EXPLORE-THE_SOURCE-c94709?style=for-the-badge&logo=github&logoColor=white)](https://github.com/MakIcon/screen)
[![Issues](https://img.shields.io/badge/OPEN-ISSUES-252524?style=for-the-badge&logo=github&logoColor=white)](https://github.com/MakIcon/screen/issues)

<sub>Made by <a href="https://github.com/MakIcon">MakIcon</a> · Designed for the Minecraft experience</sub>

</div>
