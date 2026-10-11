<div align="center">

<img src="docs/assets/readme-banner.svg" width="100%" alt="ScreenLauncher — Minecraft, the way you want it" />

<br />

**A Minecraft launcher that puts you in control.**

Create your own builds, find mods, customize the experience and jump into the game.

<br />

<a href="https://github.com/MakIcon/screen/releases/download/apperance/ScreenLauncher_0.1.0_x64-setup.exe">
  <img src="docs/assets/download-windows.svg" alt="Download ScreenLauncher for Windows (64-bit EXE installer)" width="320" />
</a>

<br />

<sub>Windows 64-bit · EXE installer · <a href="https://github.com/MakIcon/screen/releases/latest">Latest published release</a> · <a href="https://github.com/MakIcon/screen/releases">All releases</a></sub>

<br /><br />

<a href="#why-screenlauncher">Why ScreenLauncher?</a> &nbsp;·&nbsp;
<a href="#get-started">Get started</a> &nbsp;·&nbsp;
<a href="#features">Features</a> &nbsp;·&nbsp;
<a href="#for-developers">For developers</a>

</div>

---

## Why ScreenLauncher?

Minecraft should be about playing, not managing a maze of folders, mods and configurations.

ScreenLauncher keeps your Minecraft setups together while giving each one room to be its own. Whether you want a clean vanilla world, a carefully tuned modpack or a separate experimental build, you can switch without mixing everything up.

### One launcher. Every build.

Keep **Vanilla, Fabric, Quilt, Forge and NeoForge** installations in separate builds. Choose a version, adjust the settings and launch the one you want. Each build can have its own configuration and visual identity.

### Find the content you want.

Search **Modrinth** from inside the launcher to browse compatible mods, resource packs and shaders. When a mod requires other mods, ScreenLauncher can resolve and install its required dependencies.

### A launcher that feels like yours.

Customize the appearance of build cards, adjust Java and memory settings, and keep track of your play sessions. ScreenLauncher also supports optional integrations and extensions for more advanced workflows.

## Get started

**No Node.js, Rust or terminal required to install the published Windows release.**

1. **Download** the installer using the button at the top of this page.
2. **Run** `ScreenLauncher_0.1.0_x64-setup.exe` and follow the installer.
3. **Open ScreenLauncher** and create your first Minecraft build.
4. **Choose a Minecraft version**, select a loader if you want mods, then launch the game.

You can browse and install more content through Modrinth when your build is ready.

> [!NOTE]
> The latest published release is **v2.0**, with a Windows x64 installer named `ScreenLauncher_0.1.0_x64-setup.exe`. The release label and installer filename use different version numbers. It was published on August 24, 2026, so it may not include every change currently in the source code.
>
> The repository is currently **private**. GitHub downloads require access to this repository. Make the repository or a distribution channel accessible before sharing the download with the general public.

**Prefer the MSI installer?** An older Windows x64 MSI is available in the [v1.0 release](https://github.com/MakIcon/screen/releases/tag/first).

## Features

#### Builds without the clutter

Create, import, export and organize separate Minecraft installations. See which build you played last and how much time you've spent in-game.

#### Mods, resource packs and shaders

Browse Modrinth from the launcher, install content into the selected build and manage installed projects. Required mod dependencies are handled automatically where compatible.

#### Customize your experience

Choose how your launcher looks, customize build cards, set memory limits and tune Minecraft's Java settings.

#### Flexible accounts and launching

Work with Microsoft accounts and supported offline workflows. The launcher manages Minecraft game files, libraries, assets and installation tasks.

#### Extensions when you want more

Additional integrations include Discord Rich Presence, a Mineflayer bot extension and OBS telemetry support. These are optional: you don't need them just to launch Minecraft.

## Questions & answers

<details>
<summary><b>Do I need to install Java myself?</b></summary>
<br />
ScreenLauncher includes Java configuration and runtime management features. Depending on your chosen setup, you may need to select a suitable runtime. The launcher also has a Java settings test to help diagnose problems.
</details>

<details>
<summary><b>Does ScreenLauncher support mods?</b></summary>
<br />
Yes. It supports Vanilla, Fabric, Quilt, Forge and NeoForge builds. The built-in Modrinth browser helps you find compatible mods and resolve required dependencies.
</details>

<details>
<summary><b>Can I keep different Minecraft setups?</b></summary>
<br />
Yes. Each build is isolated, so you can keep different game versions, mod loaders, mods and settings separate.
</details>

<details>
<summary><b>Where can I get other versions?</b></summary>
<br />
Visit [GitHub Releases](https://github.com/MakIcon/screen/releases). The latest published release contains an EXE installer for 64-bit Windows, while an older release includes an MSI installer.
</details>

<details>
<summary><b>Is ScreenLauncher an official Minecraft product?</b></summary>
<br />
No. ScreenLauncher is an independent launcher and is not affiliated with or endorsed by Mojang Studios or Microsoft.
</details>

---

## For developers

ScreenLauncher is built using **Tauri 2**, with a **Rust** backend and a **React 19 + TypeScript** frontend powered by **Vite 7**.

<div align="center">

<img src="https://img.shields.io/badge/Tauri-2-FFC131?style=flat-square&logo=tauri&logoColor=24C8DB" alt="Tauri 2" />
<img src="https://img.shields.io/badge/Rust-Backend-252524?style=flat-square&logo=rust&logoColor=white" alt="Rust backend" />
<img src="https://img.shields.io/badge/React-TypeScript-252524?style=flat-square&logo=react&logoColor=61DAFB" alt="React and TypeScript" />

</div>

<details>
<summary><b>Run ScreenLauncher from source</b></summary>
<br />

You will need Node.js, pnpm, Rust and the [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/MakIcon/screen.git
cd screen
pnpm install
pnpm tauri dev
```

Build a native installer with:

```bash
pnpm tauri build
```

Other project commands:

```bash
pnpm build             # Frontend, Pathfinder and generated icons
pnpm check             # TypeScript and Rust checks
pnpm test              # Rust tests
pnpm test:web          # Frontend tests
pnpm test:pathfinder   # Pathfinder tests
pnpm test:worker       # Mineflayer worker tests
pnpm lint              # ESLint
```

The application icon is maintained in `public/launcher-icon.svg`. Run `pnpm icons` to regenerate platform assets.

</details>

<details>
<summary><b>Project structure</b></summary>
<br />

```text
src/                      React UI and launcher features
src-tauri/src/commands/   Native command handlers
src-tauri/src/minecraft/  Downloads, versions, Java and launching
src-tauri/src/plugins/    Desktop integrations
extensions/mineflayer-bot/ Optional Mineflayer worker
obs-telemetry-mod/        Client-side Fabric telemetry helper
scripts/                 Build scripts
```

</details>

<details>
<summary><b>Extensions & advanced configuration</b></summary>
<br />

The optional Mineflayer extension provides navigation, automation and combat tooling. Details are in its [combat](extensions/mineflayer-bot/COMBAT.md), [survival](extensions/mineflayer-bot/SURVIVAL.md) and [pathfinding](extensions/mineflayer-bot/pathfinding/README.md) documentation.

Java settings can be tested without starting Minecraft. Build-specific environment variables can be exported selectively when transferring builds in `.slbuild` and `.mrpack` formats.

On Windows, generate optional extension archives using `pnpm package:extensions`. Build the Fabric OBS telemetry helper with `./scripts/build_obs_telemetry.ps1` in PowerShell.

</details>

## Credits

Created by [MakIcon](https://github.com/MakIcon).

See [third-party notices](THIRD_PARTY_NOTICES.md) for licensing information about included components and [GitHub Releases](https://github.com/MakIcon/screen/releases) for published installers.

Minecraft and related trademarks belong to their respective owners.

<div align="center">

<br />

**Make it yours. Then press Play.**

<sub>ScreenLauncher · An independent Minecraft launcher</sub>

</div>
