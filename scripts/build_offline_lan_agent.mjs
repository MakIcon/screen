import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const javaHome = process.env.JAVA_HOME;
const exe = (name) =>
  name === "java" && process.env.SCREEN_LAN_TEST_JAVA
    ? process.env.SCREEN_LAN_TEST_JAVA
    : javaHome
      ? path.join(javaHome, "bin", name + (process.platform === "win32" ? ".exe" : ""))
      : name;
const run = (name, args) => {
  const result = spawnSync(exe(name), args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name} exited with ${result.status}`);
};
const sources = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? sources(full) : entry.name.endsWith(".java") ? [full] : [];
    }),
  );
  return nested.flat().sort();
};

const temporaryRoot = path.resolve(tmpdir());
const temporary = await mkdtemp(path.join(temporaryRoot, "screen-offline-lan-"));
const cleanTemporary = async () => {
  if (
    path.dirname(path.resolve(temporary)) !== temporaryRoot ||
    !path.basename(temporary).startsWith("screen-offline-lan-")
  ) {
    throw new Error("Refusing to remove an unexpected temporary directory");
  }
  await rm(temporary, { recursive: true, force: true });
};
try {
  const classes = path.join(temporary, "classes");
  const testClasses = path.join(temporary, "test-classes");
  await mkdir(classes);
  const agentSources = await sources(path.join(root, "offline-lan-agent", "src"));
  run("javac", ["--release", "25", "-encoding", "UTF-8", "-d", classes, ...agentSources]);
  const manifest = path.join(temporary, "MANIFEST.MF");
  await writeFile(
    manifest,
    "Manifest-Version: 1.0\nPremain-Class: com.makicon.screen.lan.OfflineLanAgent\n\n",
  );
  const jar = path.join(root, "src-tauri", "resources", "offline-lan-agent.jar");
  run("jar", [
    "--create",
    "--file",
    jar,
    "--manifest",
    manifest,
    "--date=2026-01-01T00:00:00Z",
    "-C",
    classes,
    ".",
  ]);
  if (process.argv.includes("--test")) {
    await mkdir(testClasses);
    run("javac", [
      "--release",
      "25",
      "-encoding",
      "UTF-8",
      "-cp",
      classes,
      "-d",
      testClasses,
      ...(await sources(path.join(root, "offline-lan-agent", "test"))),
    ]);
    const classpath = [classes, testClasses].join(path.delimiter);
    const minecraftJars = process.argv.filter((arg, index) => index > 1 && arg !== "--test");
    const main = "com.makicon.screen.lan.OfflineLanAgentTest";
    run("java", ["-Xverify:all", "-cp", classpath, main, "false", ...minecraftJars]);
    run("java", [
      "-Xverify:all",
      `-javaagent:${jar}`,
      "-cp",
      classpath,
      main,
      "true",
      ...minecraftJars,
    ]);
    for (const minecraftJar of minecraftJars) {
      const metadata = JSON.parse(await readFile(minecraftJar.replace(/\.jar$/, ".json"), "utf8"));
      const librariesRoot = path.resolve(path.dirname(minecraftJar), "..", "..", "libraries");
      const libraries = metadata.libraries.flatMap((library) =>
        library.downloads?.artifact?.path
          ? [path.join(librariesRoot, library.downloads.artifact.path)]
          : [],
      );
      const realClasspath = [minecraftJar, ...libraries, classes, testClasses].join(path.delimiter);
      const realMain = "com.makicon.screen.lan.RealMinecraftLanTest";
      run("java", ["-Xverify:all", "-cp", realClasspath, realMain, "false"]);
      run("java", ["-Xverify:all", `-javaagent:${jar}`, "-cp", realClasspath, realMain, "true"]);
    }
  }
  console.log(`Built ${jar}`);
} finally {
  await cleanTemporary();
}
