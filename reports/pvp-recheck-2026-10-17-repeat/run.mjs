import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const reportDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(reportDir, "../..");
const extension = path.join(root, "extensions/mineflayer-bot");
const scratch = path.join(extension, ".pvp-report-2026-10-17.local");
const rawDir = path.join(reportDir, "raw");
const saved = path.join(root, "dist-extensions/pvp-decision-1.15.6/mineflayer-bot");
const revision = "747ff486cdd9c227e0c601c08d86a23d212bd1ea";
const initialStatus = execFileSync(
  "git",
  ["status", "--short", "--", "extensions/mineflayer-bot"],
  { cwd: root, encoding: "utf8" },
);
const profiles = {
  before: { source: path.join(extension, ".decision-baseline.local") },
  optimized: { source: saved },
  current: { source: extension },
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const normalizedDigest = (value) => digest(value.toString().replaceAll("\r\n", "\n"));
const jsonWrite = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
await mkdir(rawDir, { recursive: true });
for (const [key, profile] of Object.entries(profiles)) {
  profile.snapshot = path.join(scratch, `repeat-${key}`);
  await mkdir(profile.snapshot, { recursive: true });
  profile.hashes = {};
  for (const entry of await readdir(profile.source, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(cjs|json)$/.test(entry.name)) continue;
    const source = path.join(profile.source, entry.name);
    const bytes = await readFile(source);
    await copyFile(source, path.join(profile.snapshot, entry.name));
    profile.hashes[entry.name] = digest(bytes);
  }
  profile.version = JSON.parse(
    await readFile(path.join(profile.snapshot, "package.json"), "utf8"),
  ).version;
}
const verifiedFiles = [
  "combat.cjs",
  "combat-brain.cjs",
  "combat-inventory.cjs",
  "combat-footwork.cjs",
  "crystal-movement.cjs",
  "crystals.cjs",
  "pearls.cjs",
  "combat-defaults.json",
];
for (const name of verifiedFiles) {
  const original = execFileSync("git", ["show", `${revision}:extensions/mineflayer-bot/${name}`], {
    cwd: root,
  });
  assert.equal(
    normalizedDigest(await readFile(path.join(profiles.before.snapshot, name))),
    normalizedDigest(original),
    `baseline differs: ${name}`,
  );
}

// Reuse the identical recovered CPU/serialized-controller harness from the
// previous run. Archive a copy alongside this report for exact reproduction.
await copyFile(path.join(scratch, "cpu.mjs"), path.join(reportDir, "cpu.mjs"));
await copyFile(path.join(scratch, "reaction.mjs"), path.join(reportDir, "reaction.mjs"));
await copyFile(path.join(scratch, "settings.json"), path.join(reportDir, "settings.json"));
const sharedSettings = JSON.parse(await readFile(path.join(reportDir, "settings.json"), "utf8"));
async function runChild(script, output, profile) {
  const child = spawn(
    process.execPath,
    ["--no-deprecation", path.join(reportDir, script), output],
    {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        SCREEN_COMBAT_RUNTIME: profile.snapshot,
        SCREEN_BENCH_SETTINGS: path.join(reportDir, "settings.json"),
        SCREEN_BENCH_SAMPLES: "100",
      },
    },
  );
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr.on("data", (chunk) => {
    log += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  await writeFile(`${output}.log`, log);
  assert.equal(code, 0, log);
  return JSON.parse(await readFile(output, "utf8"));
}
const cpuTrials = { before: [], optimized: [], current: [] };
const orders = [
  ["current", "optimized", "before"],
  ["before", "current", "optimized"],
  ["optimized", "before", "current"],
];
const startedAt = new Date().toISOString();
for (let trial = 1; trial <= 3; trial++) {
  for (const key of orders[trial - 1]) {
    console.log(`CPU ${trial}/3: ${key} (${profiles[key].version})`);
    cpuTrials[key].push(
      await runChild("cpu.mjs", path.join(rawDir, `${key}-cpu-${trial}.json`), profiles[key]),
    );
  }
}
const comparable = (trial) =>
  JSON.parse(JSON.stringify(trial.results.map(({ name, result }) => ({ name, result }))));
for (const trials of Object.values(cpuTrials))
  for (const trial of trials) {
    assert.deepEqual(trial.settings, sharedSettings);
    assert.deepEqual(
      comparable(trial),
      comparable(cpuTrials.before[0]),
      "measured signatures must match",
    );
  }
const reactions = {};
for (const [key, profile] of Object.entries(profiles)) {
  console.log(`Serialized controller simulations: ${key} (${profile.version})`);
  reactions[key] = await runChild(
    "reaction.mjs",
    path.join(rawDir, `${key}-reactions.json`),
    profile,
  );
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const cpu = ["movement-open-ground", "pearl-exact-pursuit", "crystal-continue-layout"].map(
  (name) => ({
    name,
    profiles: Object.fromEntries(
      Object.entries(cpuTrials).map(([key, trials]) => {
        const rows = trials.map((trial) => trial.results.find((row) => row.name === name));
        return [
          key,
          {
            medianMs: median(rows.map((row) => row.medianMs)),
            p95Ms: median(rows.map((row) => row.p95Ms)),
            trialMediansMs: rows.map((row) => row.medianMs),
            blockReads: rows[0].blockReads,
            raycasts: rows[0].raycasts,
            result: rows[0].result,
          },
        ];
      }),
    ),
  }),
);
const simulation = [
  "foundation-crystal-attack",
  "target-enters-range-placement",
  "confirmed-base-placement",
].map((name) => ({
  name,
  profiles: Object.fromEntries(
    Object.entries(reactions).map(([key, value]) => {
      const times = value.observations.filter((row) => row.name === name).map((row) => row.ms);
      assert.equal(new Set(times).size, 1, `nondeterministic simulation: ${key}/${name}`);
      return [key, { medianMs: median(times), timesMs: times }];
    }),
  ),
}));
const changedDuringRun = [];
for (const [name, hash] of Object.entries(profiles.current.hashes)) {
  if (digest(await readFile(path.join(extension, name))) !== hash) changedDuringRun.push(name);
}
const dependencyRequire = createRequire(path.join(extension, "package.json"));
const dependencies = Object.fromEntries(
  ["mineflayer", "minecraft-data", "prismarine-physics", "minecraft-protocol"].map((name) => [
    name,
    dependencyRequire(`${name}/package.json`).version,
  ]),
);
const currentMatchesBaseline = verifiedFiles.filter(
  (name) => profiles.current.hashes[name] === profiles.before.hashes[name],
);
const results = {
  startedAt,
  finishedAt: new Date().toISOString(),
  node: process.version,
  cpu: cpus()[0]?.model,
  baselineRevision: revision,
  verifiedFiles,
  currentMatchesBaseline,
  initialStatus,
  dependencies,
  minecraftVersion: "26.1.2",
  settings: sharedSettings,
  method: {
    trials: 3,
    samplesPerTrial: 100,
    warmupSamples: 20,
    movementBatch: 50,
    entities: 66,
    runOrders: orders,
    resultEquivalencePassed: true,
    serializedPacketValidationPassed: true,
    simulatedTickMs: 50,
    effectiveComboIntervalMs: reactions.before.effectiveComboIntervalMs,
  },
  profiles: Object.fromEntries(
    Object.entries(profiles).map(([key, profile]) => [
      key,
      {
        version: profile.version,
        source: path.relative(root, profile.source).replaceAll("\\", "/"),
        sha256: profile.hashes,
      },
    ]),
  ),
  changedDuringRun,
  cpuResults: cpu,
  simulationResults: simulation,
};
await jsonWrite(path.join(reportDir, "results.json"), results);
console.table(
  [...cpu, ...simulation].map((row) => ({
    scenario: row.name,
    before: row.profiles.before.medianMs,
    optimized: row.profiles.optimized.medianMs,
    current: row.profiles.current.medianMs,
  })),
);
console.log(
  `Current runtime matches baseline in ${currentMatchesBaseline.length}/${verifiedFiles.length} checked files.`,
);
