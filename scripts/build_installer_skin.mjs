// Build the small x86 NSIS drawing plugin with the existing Tauri MSVC tools.
import { execFileSync, execSync } from "node:child_process";
import { log } from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

if (process.platform === "win32") {
  const test = process.argv.includes("--test");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const vswhere = path.join(
    process.env["ProgramFiles(x86)"],
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  const installation = execFileSync(
    vswhere,
    [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property",
      "installationPath",
    ],
    { encoding: "utf8" },
  ).trim();
  if (!installation)
    throw new Error(
      "The Windows installer needs MSVC x86 build tools (Visual Studio C++ workload).",
    );
  const developerShell = path.join(installation, "Common7", "Tools", "VsDevCmd.bat");
  const environment = execSync(
    `call "${developerShell}" -no_logo -arch=x86 -host_arch=x64 >nul && set`,
    { encoding: "utf8", windowsHide: true },
  );
  const env = { ...process.env };
  for (const line of environment.split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals > 0) env[line.slice(0, equals)] = line.slice(equals + 1);
  }
  const compiler = execFileSync("where.exe", ["cl.exe"], {
    env,
    encoding: "utf8",
    windowsHide: true,
  })
    .trim()
    .split(/\r?\n/)[0];
  const output = path.join(root, "src-tauri", "target", "nsis-skin");
  fs.mkdirSync(output, { recursive: true });
  execFileSync(
    compiler,
    [
      "/nologo",
      ...(test ? [] : ["/LD"]),
      "/O2",
      "/MT",
      "/W4",
      "/WX",
      "/EHsc",
      "/std:c++17",
      "/utf-8",
      "/D_WIN32_WINNT=0x0A00",
      path.join(root, "src-tauri", "nsis", test ? "skin.test.cpp" : "skin.cpp"),
      `/Fo${path.join(output, test ? "ScreenSkinTest.obj" : "ScreenSkin.obj")}`,
      ...(test ? [`/Fe${path.join(output, "ScreenSkinTest.exe")}`] : []),
      "/link",
      "/NOLOGO",
      "/MACHINE:X86",
      "/DYNAMICBASE",
      "/NXCOMPAT",
      "user32.lib",
      "gdi32.lib",
      "gdiplus.lib",
      "dwmapi.lib",
      "comctl32.lib",
      "uxtheme.lib",
      `/OUT:${path.join(output, test ? "ScreenSkinTest.exe" : "ScreenSkin.dll")}`,
    ],
    { env, cwd: output, stdio: "inherit", windowsHide: true },
  );
  if (test) {
    execFileSync(path.join(output, "ScreenSkinTest.exe"), [], {
      stdio: "inherit",
      windowsHide: true,
    });
  } else {
    log("ScreenLauncher installer skin built (x86 NSIS plugin).");
  }
}
