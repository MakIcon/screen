import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const dir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(
  readFileSync(
    path.join(dir, "../pvp-full-recheck-1.15.8-2026-10-17/duel-raw/after-1.json"),
    "utf8",
  ),
);
const after = JSON.parse(readFileSync(path.join(dir, "duels.json"), "utf8"));
const fields = [
  "attacks",
  "landed",
  "damage",
  "critical",
  "sprintHits",
  "blocked",
  "outOfReach",
  "firstHitMs",
  "meanIntervalMs",
  "meanDistance",
  "routedTicks",
];
assert.equal(after.results.length, before.results.length);
const changes = [];
for (const row of after.results) {
  const old = before.results.find(
    (r) => r.version === row.version && r.profile === row.profile && r.scenario === row.scenario,
  );
  assert.ok(old);
  assert.deepEqual(row.errors, []);
  for (const field of fields)
    if (row[field] !== old[field])
      changes.push({
        version: row.version,
        profile: row.profile,
        scenario: row.scenario,
        field,
        before: old[field],
        after: row[field],
      });
}
writeFileSync(
  path.join(dir, "duel-comparison.json"),
  `${JSON.stringify({ beforeVersion: "1.15.8", afterVersion: "1.15.9", scenarios: after.results.length, fields, changes }, null, 2)}\n`,
);
console.log({ scenarios: after.results.length, changes });
assert.deepEqual(changes, [], "PvP simulation outcomes changed");
