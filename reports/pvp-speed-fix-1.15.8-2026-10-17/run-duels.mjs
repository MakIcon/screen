import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import console from "node:console";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Before: the preserved uncommitted 1.15.7 sources captured before optimization.
// After: the current working files. Both run the
// same pvp-duel-benchmark.mjs, world fixtures, seeds and installed dependencies.
const reportDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(reportDir, "../..");
const extension = path.join(root, "extensions/mineflayer-bot");
const scratch = path.join(extension, ".pvp-speed-fix-1.15.8.local/duel-measurement");
const rawDir = path.join(reportDir, "duel-raw");
const baselineRevision = null; // The preserved, uncommitted 1.15.7 source is the baseline.
const repeats = Number(process.env.SCREEN_REPEATS ?? 3);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const profiles = { before: { sha256: {} }, after: { sha256: {} } };
const startedAt = new Date().toISOString();
await mkdir(rawDir, { recursive: true });
for (const [key, profile] of Object.entries(profiles)) {
  profile.snapshot = path.join(scratch, key);
  await mkdir(profile.snapshot, { recursive: true });
}
const beforeSource = path.join(extension, ".pvp-speed-fix-1.15.8.local/before");
for (const entry of await readdir(beforeSource, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(cjs|json)$/.test(entry.name)) continue;
  const bytes = await readFile(path.join(beforeSource, entry.name));
  await writeFile(path.join(profiles.before.snapshot, entry.name), bytes);
  profiles.before.sha256[entry.name] = digest(bytes);
}
for (const entry of await readdir(extension, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(cjs|json)$/.test(entry.name)) continue;
  const bytes = await readFile(path.join(extension, entry.name));
  await writeFile(path.join(profiles.after.snapshot, entry.name), bytes);
  profiles.after.sha256[entry.name] = digest(bytes);
}
for (const profile of Object.values(profiles))
  profile.version = JSON.parse(
    await readFile(path.join(profile.snapshot, "package.json"), "utf8"),
  ).version;

async function run(profile, output) {
  const child = spawn(
    process.execPath,
    ["--no-deprecation", path.join(reportDir, "duel.mjs"), output],
    {
      cwd: root,
      windowsHide: true,
      env: { ...process.env, SCREEN_COMBAT_RUNTIME: profile.snapshot },
    },
  );
  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  await writeFile(`${output}.log`, log);
  if (code !== 0) throw new Error(`${path.basename(output)} exited with ${code}\n${log}`);
  return JSON.parse(await readFile(output, "utf8"));
}

// Alternate the order so CPU warmup or background load affects both versions.
const runs = { before: [], after: [] };
for (let trial = 1; trial <= repeats; trial++)
  for (const key of trial % 2 ? ["before", "after"] : ["after", "before"]) {
    console.log(`Duel trial ${trial}/${repeats}: ${key} (${profiles[key].version})`);
    runs[key].push(await run(profiles[key], path.join(rawDir, `${key}-${trial}.json`)));
  }

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const keys = runs.before[0].results.map(({ version, profile, scenario }) => ({
  version,
  profile,
  scenario,
}));
const pick = (key, trial, field) =>
  trial.results.find(
    (entry) =>
      entry.version === key.version &&
      entry.profile === key.profile &&
      entry.scenario === key.scenario,
  )[field];
const fields = [
  "attacks",
  "outOfReach",
  "routedTicks",
  "landed",
  "damage",
  "critical",
  "sprintHits",
  "blocked",
  "firstHitMs",
  "meanIntervalMs",
  "meanDistance",
];
const comparison = keys.map((key) => {
  const entry = { ...key };
  for (const side of ["before", "after"]) {
    entry[side] = {};
    for (const field of fields) {
      const values = runs[side].map((trial) => pick(key, trial, field));
      entry[side][field] = values[0];
      // Simulation outcomes must not depend on the run; CPU time may.
      entry[side][`${field}Deterministic`] = values.every(
        (value) => JSON.stringify(value) === JSON.stringify(values[0]),
      );
    }
    entry[side].tickCpuMedianMs = median(
      runs[side].map((trial) => pick(key, trial, "tickCpuMedianMs")),
    );
    entry[side].tickCpuP95Ms = median(runs[side].map((trial) => pick(key, trial, "tickCpuP95Ms")));
    entry[side].errors = runs[side].flatMap((trial) => pick(key, trial, "errors"));
  }
  return entry;
});
for (const entry of comparison) {
  for (const field of fields)
    assert.deepEqual(
      entry.after[field],
      entry.before[field],
      `${entry.version}/${entry.profile}/${entry.scenario}/${field}: behavior changed`,
    );
  for (const side of ["before", "after"]) {
    assert.deepEqual(
      entry[side].errors,
      [],
      `${entry.version}/${entry.profile}/${entry.scenario}/${side}`,
    );
    for (const field of fields)
      assert.equal(
        entry[side][`${field}Deterministic`],
        true,
        `${entry.scenario}/${side}/${field}`,
      );
  }
}
const changedDuringRun = [];
for (const [name, sha256] of Object.entries(profiles.after.sha256)) {
  if (digest(await readFile(path.join(extension, name))) !== sha256) changedDuringRun.push(name);
}
assert.deepEqual(changedDuringRun, [], "working runtime changed during duel measurements");
await writeFile(
  path.join(reportDir, "duel-results.json"),
  `${JSON.stringify(
    {
      startedAt,
      date: new Date().toISOString(),
      changedDuringRun,
      resultDeterminismPassed: true,
      node: process.version,
      cpu: cpus()[0]?.model,
      baselineRevision,
      repeats,
      profiles: Object.fromEntries(
        Object.entries(profiles).map(([key, value]) => [
          key,
          { version: value.version, sha256: value.sha256 },
        ]),
      ),
      scenarios: runs.after[0].scenarios,
      comparison,
    },
    null,
    2,
  )}\n`,
);
for (const entry of comparison)
  console.log(
    `${entry.version} ${entry.profile.padEnd(10)} ${entry.scenario.padEnd(10)} ` +
      `hits ${entry.before.landed}→${entry.after.landed}  dmg ${entry.before.damage}→${entry.after.damage}  ` +
      `first ${entry.before.firstHitMs ?? "-"}→${entry.after.firstHitMs ?? "-"} ms  ` +
      `cpu ${entry.before.tickCpuMedianMs}→${entry.after.tickCpuMedianMs} ms`,
  );
