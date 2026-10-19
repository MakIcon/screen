#!/usr/bin/env node
// Builds a signed ScreenLauncher release for the in-app updater.
//
//   pnpm release --version 0.2.0 --notes-file notes.md [--publish]
//
// 1. Optionally bumps the version in tauri.conf.json, package.json and Cargo.toml.
// 2. Builds the NSIS installer plus its updater signature (.sig).
// 3. Writes latest.json — the manifest every installed launcher polls on start.
// 4. Collects everything in dist-release/v<version>/ and, with --publish and the
//    GitHub CLI installed, creates the GitHub release with the installer and
//    latest.json attached.
//
// The private key comes from TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PATH
// or %USERPROFILE%\.tauri\screenlauncher-updater.key. Never commit it: without
// it no installed launcher will accept another update.

import { spawnSync } from "node:child_process";
import { error, log } from "node:console";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");
const DEFAULT_KEY_PATH = path.join(os.homedir(), ".tauri", "screenlauncher-updater.key");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const { values: args } = parseArgs({
  options: {
    version: { type: "string" },
    notes: { type: "string" },
    "notes-file": { type: "string" },
    repo: { type: "string", default: "MakIcon/screen" },
    publish: { type: "boolean", default: false },
    "skip-build": { type: "boolean", default: false },
  },
});

function fail(message) {
  error(`\n✖ ${message}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  // pnpm and gh are .cmd shims on Windows, which Node only spawns through a shell.
  const quoted = commandArgs.map((arg) => (/[\s"]/.test(arg) ? `"${arg}"` : arg));
  const result = spawnSync(command, quoted, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  return result.status ?? 1;
}

function replaceFirst(filePath, pattern, replacement) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!pattern.test(text)) fail(`No version field found in ${path.relative(root, filePath)}`);
  fs.writeFileSync(filePath, text.replace(pattern, replacement));
}

function bumpVersion(version) {
  replaceFirst(tauriConfPath, /"version":\s*"[^"]*"/, `"version": "${version}"`);
  replaceFirst(path.join(root, "package.json"), /"version":\s*"[^"]*"/, `"version": "${version}"`);
  replaceFirst(
    path.join(root, "src-tauri", "Cargo.toml"),
    /^version = "[^"]*"/m,
    `version = "${version}"`,
  );
  log(`• Version set to ${version}`);
}

function loadSigningEnv() {
  const env = { ...process.env };
  if (!env.TAURI_SIGNING_PRIVATE_KEY) {
    const keyPath = env.TAURI_SIGNING_PRIVATE_KEY_PATH || DEFAULT_KEY_PATH;
    if (!fs.existsSync(keyPath)) {
      fail(
        `Updater signing key not found at ${keyPath}.\n` +
          "  Restore it from your backup or point TAURI_SIGNING_PRIVATE_KEY_PATH at it.",
      );
    }
    env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyPath, "utf8").trim();
  }
  // The key was generated without a password. An unset variable makes the
  // CLI wait for one on stdin, an empty one signs straight away.
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";
  return env;
}

function readNotes() {
  if (args["notes-file"]) return fs.readFileSync(path.resolve(args["notes-file"]), "utf8").trim();
  return (args.notes ?? "").trim();
}

if (process.platform !== "win32") fail("Releases are built on Windows (NSIS installer).");

if (args.version) {
  if (!SEMVER.test(args.version)) fail(`"${args.version}" is not a semver version like 0.2.0`);
  bumpVersion(args.version);
}

const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
const { productName, version } = tauriConf;
const installerName = `${productName}_${version}_x64-setup.exe`;
const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
const installerPath = path.join(bundleDir, installerName);

if (!args["skip-build"]) {
  const overridePath = path.join(os.tmpdir(), `screenlauncher-release-${process.pid}.json`);
  fs.writeFileSync(overridePath, JSON.stringify({ bundle: { createUpdaterArtifacts: true } }));
  log(`• Building ${productName} ${version} with updater artifacts…\n`);
  const status = run("pnpm", ["tauri", "build", "--bundles", "nsis", "--config", overridePath], {
    env: loadSigningEnv(),
  });
  fs.rmSync(overridePath, { force: true });
  if (status !== 0) fail("tauri build failed");
}

if (!fs.existsSync(installerPath)) fail(`Installer not found: ${installerPath}`);
if (!fs.existsSync(`${installerPath}.sig`)) {
  fail(`Signature not found next to the installer. Was it built with updater artifacts?`);
}

const tag = `v${version}`;
const notes = readNotes();
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: fs.readFileSync(`${installerPath}.sig`, "utf8").trim(),
      url: `https://github.com/${args.repo}/releases/download/${tag}/${encodeURIComponent(installerName)}`,
    },
  },
};

const outDir = path.join(root, "dist-release", tag);
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(installerPath, path.join(outDir, installerName));
fs.copyFileSync(`${installerPath}.sig`, path.join(outDir, `${installerName}.sig`));
const manifestPath = path.join(outDir, "latest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
log(`\n• Release files ready in ${path.relative(root, outDir)}`);

if (!args.publish) {
  log(
    `\nNext: create the GitHub release ${tag} in ${args.repo} and attach\n` +
      `  ${installerName}\n  latest.json\n` +
      "or rerun with --publish (needs the GitHub CLI, gh).",
  );
  process.exit(0);
}

if (run("gh", ["--version"], { stdio: "ignore" }) !== 0) {
  fail("GitHub CLI (gh) is not installed. Upload the files from dist-release by hand.");
}

const notesPath = path.join(outDir, "notes.md");
fs.writeFileSync(notesPath, notes || `${productName} ${version}`);
const status = run("gh", [
  "release",
  "create",
  tag,
  path.join(outDir, installerName),
  manifestPath,
  "--repo",
  args.repo,
  "--title",
  `${productName} ${version}`,
  "--notes-file",
  notesPath,
]);
if (status !== 0) fail("gh release create failed");
log(`\n✔ Published ${tag}. Installed launchers will pick it up on their next start.`);
