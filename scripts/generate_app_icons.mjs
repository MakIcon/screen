import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("@tauri-apps/cli")), "tauri.js");
const publicDirectory = join(root, "public");
const iconDirectory = join(root, "src-tauri", "icons");
const source = join(publicDirectory, "launcher-icon.svg");
const svg = readFileSync(source, "utf8");

if (!svg.includes("<svg") || /<image\b|data:image\//i.test(svg)) {
  throw new Error("public/launcher-icon.svg must contain vector artwork, without raster images");
}

function generate(...args) {
  execFileSync(process.execPath, [cli, "icon", source, ...args], {
    cwd: root,
    stdio: "inherit",
  });
}

generate("--output", iconDirectory);

const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 180, 192, 256, 384, 512, 1024];
generate("--output", iconDirectory, ...sizes.flatMap((size) => ["--png", String(size)]));

// Tauri 2's code generator decodes the FIRST ICO frame as the default window
// icon. Put 256 px first so taskbar and Alt+Tab icons never upscale a 16 px image.
// Windows Explorer can still select the matching DPI size from the other frames.
const icoSizes = [256, 128, 96, 64, 48, 40, 32, 24, 20, 16];
const frames = icoSizes.map((size) => readFileSync(join(iconDirectory, `${size}x${size}.png`)));
const directory = Buffer.alloc(6 + frames.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let frameOffset = directory.length;

for (let index = 0; index < frames.length; index++) {
  const entryOffset = 6 + index * 16;
  directory[entryOffset] = icoSizes[index] % 256;
  directory[entryOffset + 1] = icoSizes[index] % 256;
  directory.writeUInt16LE(1, entryOffset + 4);
  directory.writeUInt16LE(32, entryOffset + 6);
  directory.writeUInt32LE(frames[index].length, entryOffset + 8);
  directory.writeUInt32LE(frameOffset, entryOffset + 12);
  frameOffset += frames[index].length;
}

writeFileSync(join(iconDirectory, "icon.ico"), Buffer.concat([directory, ...frames]));

for (const size of [16, 32, 48, 64]) {
  copyFileSync(
    join(iconDirectory, `${size}x${size}.png`),
    join(publicDirectory, `favicon-${size}.png`),
  );
}

copyFileSync(join(iconDirectory, "180x180.png"), join(publicDirectory, "apple-touch-icon.png"));
copyFileSync(join(iconDirectory, "192x192.png"), join(publicDirectory, "icon-192.png"));
copyFileSync(join(iconDirectory, "512x512.png"), join(publicDirectory, "icon-512.png"));
copyFileSync(join(iconDirectory, "1024x1024.png"), join(publicDirectory, "launcher-icon.png"));
copyFileSync(join(iconDirectory, "icon.ico"), join(publicDirectory, "favicon.ico"));
