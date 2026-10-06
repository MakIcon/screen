import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("@tauri-apps/cli")), "tauri.js");
const source = join(root, "public", "paintshot.svg");
const temporary = mkdtempSync(join(tmpdir(), "paintshot-icons-"));

function generate(...args) {
  execFileSync(process.execPath, [cli, "icon", source, ...args], {
    cwd: root,
    stdio: "inherit",
  });
}

try {
  generate("--output", join(root, "src-tauri", "icons"));
  generate("--output", temporary, "--png", "32", "--png", "180");
  copyFileSync(join(temporary, "32x32.png"), join(root, "public", "favicon-32.png"));
  copyFileSync(join(temporary, "180x180.png"), join(root, "public", "apple-touch-icon.png"));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
