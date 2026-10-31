import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
const runBuildJava = (args) => {
  const result = spawnSync(
    javaHome
      ? path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java")
      : "java",
    args,
    { cwd: root, stdio: "inherit", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build helper exited with ${result.status}`);
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
  const bootstrapClasses = path.join(temporary, "bootstrap");
  const testClasses = path.join(temporary, "test-classes");
  const buildClasses = path.join(temporary, "build-classes");
  const shaded = path.join(temporary, "shaded");
  await Promise.all([classes, bootstrapClasses, buildClasses, shaded].map((dir) => mkdir(dir)));
  const dependencies = JSON.parse(
    await readFile(path.join(root, "offline-lan-agent/lib/dependencies.json"), "utf8"),
  );
  const libraries = [];
  for (const dependency of dependencies) {
    const library = path.join(root, "offline-lan-agent/lib", dependency.name);
    const hash = createHash("sha256")
      .update(await readFile(library))
      .digest("hex");
    if (hash !== dependency.sha256)
      throw new Error(`Invalid dependency checksum: ${dependency.name}`);
    libraries.push(library);
  }
  const libraryClasspath = libraries.join(path.delimiter);
  const resources = path.join(root, "src-tauri/resources");
  const jar = path.join(resources, "offline-lan-agent.jar");
  const bootstrapJar = path.join(resources, "offline-lan-bootstrap.jar");
  const pack = (output, directory, manifest) =>
    run("jar", [
      "--create",
      "--file",
      output,
      ...(manifest ? ["--manifest", manifest] : []),
      "--date=2026-01-01T00:00:00Z",
      "-C",
      directory,
      ".",
    ]);
  run("javac", [
    "--release",
    "8",
    "-encoding",
    "UTF-8",
    "-d",
    bootstrapClasses,
    ...(await sources(path.join(root, "offline-lan-agent/bootstrap"))),
  ]);
  pack(bootstrapJar, bootstrapClasses);
  const agentSources = await sources(path.join(root, "offline-lan-agent", "src"));
  const compileClasspath = [bootstrapClasses, ...libraries].join(path.delimiter);
  run("javac", [
    "--release",
    "8",
    "-encoding",
    "UTF-8",
    "-cp",
    compileClasspath,
    "-d",
    classes,
    ...agentSources,
  ]);
  run("javac", [
    "--release",
    "8",
    "-encoding",
    "UTF-8",
    "-cp",
    libraryClasspath,
    "-d",
    buildClasses,
    ...(await sources(path.join(root, "offline-lan-agent/build"))),
  ]);
  const unshaded = path.join(temporary, "unshaded.jar");
  pack(unshaded, classes);
  runBuildJava([
    "-cp",
    [buildClasses, ...libraries].join(path.delimiter),
    "Shade",
    shaded,
    unshaded,
    ...libraries.filter((_, index) => dependencies[index].runtime),
  ]);
  await mkdir(path.join(shaded, "META-INF"), { recursive: true });
  await copyFile(
    path.join(root, "offline-lan-agent/LICENSE-ASM.txt"),
    path.join(shaded, "META-INF/LICENSE-ASM.txt"),
  );
  const manifest = path.join(temporary, "MANIFEST.MF");
  await writeFile(
    manifest,
    "Manifest-Version: 1.0\nPremain-Class: com.makicon.screen.lan.OfflineLanAgent\nBoot-Class-Path: offline-lan-bootstrap.jar\n\n",
  );
  pack(jar, shaded, manifest);
  if (process.argv.includes("--test")) {
    await mkdir(testClasses);
    run("javac", [
      "--release",
      "8",
      "-encoding",
      "UTF-8",
      "-cp",
      [classes, bootstrapClasses, ...libraries].join(path.delimiter),
      "-d",
      testClasses,
      ...(await sources(path.join(root, "offline-lan-agent", "test"))),
    ]);
    const classpath = [jar, bootstrapClasses, testClasses, ...libraries].join(path.delimiter);
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
  }
  console.log(`Built ${jar}`);
} finally {
  await cleanTemporary();
}
