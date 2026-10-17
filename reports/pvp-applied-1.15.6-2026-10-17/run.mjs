import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const reportDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(reportDir, "../..");
const extension = path.join(root, "extensions/mineflayer-bot");
const scratch = path.join(extension, ".pvp-applied-1.15.6-2026-10-17.local");
const rawDir = path.join(reportDir, "raw");
const baselineRevision = "747ff486cdd9c227e0c601c08d86a23d212bd1ea";
const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const digest = (value) => createHash("sha256").update(value).digest("hex");
const jsonWrite = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const profiles = { before: { sha256: {} }, after: { sha256: {} } };
const initialStatus = git("status", "--short", "--", "extensions/mineflayer-bot").toString();
await mkdir(rawDir, { recursive: true });
for (const [key, profile] of Object.entries(profiles)) {
  profile.snapshot = path.join(scratch, key);
  await mkdir(profile.snapshot, { recursive: true });
}

// Reconstruct the original code from Git, without switching the working tree.
const originalNames = git("ls-tree", "--name-only", `${baselineRevision}:extensions/mineflayer-bot`)
  .toString()
  .trim()
  .split("\n")
  .filter((name) => /\.(cjs|json)$/.test(name));
for (const name of originalNames) {
  const bytes = git("show", `${baselineRevision}:extensions/mineflayer-bot/${name}`);
  await writeFile(path.join(profiles.before.snapshot, name), bytes);
  profiles.before.sha256[name] = digest(bytes);
}
for (const entry of await readdir(extension, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(cjs|json)$/.test(entry.name)) continue;
  const bytes = await readFile(path.join(extension, entry.name));
  await writeFile(path.join(profiles.after.snapshot, entry.name), bytes);
  profiles.after.sha256[entry.name] = digest(bytes);
}
for (const profile of Object.values(profiles)) {
  profile.version = JSON.parse(
    await readFile(path.join(profile.snapshot, "package.json"), "utf8"),
  ).version;
}
assert.equal(profiles.before.version, "1.15.5");
assert.equal(profiles.after.version, "1.15.6");

// Keep the same settings, fixtures, samples and warmup as the preceding report.
const settings = JSON.parse(await readFile(path.join(reportDir, "settings.json"), "utf8"));
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
const startedAt = new Date().toISOString();
const orders = [
  ["before", "after"],
  ["after", "before"],
  ["before", "after"],
];
const trials = { before: [], after: [] };
for (let trial = 1; trial <= orders.length; trial++) {
  for (const key of orders[trial - 1]) {
    console.log(`CPU ${trial}/3: ${key} (${profiles[key].version})`);
    trials[key].push(
      await runChild("cpu.mjs", path.join(rawDir, `${key}-cpu-${trial}.json`), profiles[key]),
    );
  }
}
const comparable = (trial) =>
  JSON.parse(JSON.stringify(trial.results.map(({ name, result }) => ({ name, result }))));
for (const series of Object.values(trials)) {
  for (const trial of series) {
    assert.deepEqual(trial.settings, settings);
    assert.deepEqual(
      comparable(trial),
      comparable(trials.before[0]),
      "measured decision signatures must match",
    );
  }
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
const cpuResults = ["movement-open-ground", "pearl-exact-pursuit", "crystal-continue-layout"].map(
  (name) => ({
    name,
    profiles: Object.fromEntries(
      Object.entries(trials).map(([key, series]) => {
        const rows = series.map((trial) => trial.results.find((row) => row.name === name));
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
const simulationResults = [
  "foundation-crystal-attack",
  "target-enters-range-placement",
  "confirmed-base-placement",
].map((name) => ({
  name,
  profiles: Object.fromEntries(
    Object.entries(reactions).map(([key, value]) => {
      const times = value.observations.filter((row) => row.name === name).map((row) => row.ms);
      assert.equal(times.length, 3);
      assert.equal(new Set(times).size, 1, `nondeterministic simulation: ${key}/${name}`);
      return [key, { medianMs: median(times), timesMs: times }];
    }),
  ),
}));
assert.deepEqual(
  simulationResults.map((row) => row.profiles.after.medianMs),
  [150, 50, 50],
);
const changedDuringRun = [];
for (const [name, hash] of Object.entries(profiles.after.sha256)) {
  if (digest(await readFile(path.join(extension, name))) !== hash) changedDuringRun.push(name);
}
assert.deepEqual(changedDuringRun, [], "working runtime changed during measurement");
const dependencyRequire = createRequire(path.join(extension, "package.json"));
const dependencies = Object.fromEntries(
  ["mineflayer", "minecraft-data", "prismarine-physics", "minecraft-protocol"].map((name) => [
    name,
    dependencyRequire(`${name}/package.json`).version,
  ]),
);
const results = {
  startedAt,
  finishedAt: new Date().toISOString(),
  node: process.version,
  cpu: cpus()[0]?.model,
  baselineRevision,
  workingTreeHead: git("rev-parse", "HEAD").toString().trim(),
  initialStatus,
  dependencies,
  minecraftVersion: "26.1.2",
  settings,
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
      { version: profile.version, sha256: profile.sha256 },
    ]),
  ),
  changedDuringRun,
  cpuResults,
  simulationResults,
};
await jsonWrite(path.join(reportDir, "results.json"), results);
console.table(
  [...cpuResults, ...simulationResults].map((row) => ({
    scenario: row.name,
    before: row.profiles.before.medianMs,
    after: row.profiles.after.medianMs,
  })),
);
console.log(
  "Working runtime remained unchanged; all measured signatures and reaction deadlines passed.",
);
