import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";

// Run the same workload against a source snapshot using SCREEN_COMBAT_RUNTIME.
// World setup, module loading and warmup are excluded from the measured time.
const extensionUrl = new URL(
  "../../extensions/mineflayer-bot/decision-benchmark.mjs",
  import.meta.url,
);
const require = createRequire(extensionUrl);
const runtime = process.env.SCREEN_COMBAT_RUNTIME
  ? createRequire(path.resolve(process.env.SCREEN_COMBAT_RUNTIME, "package.json"))
  : require;
const { Vec3 } = require("vec3");
runtime("./combat.cjs");
const { createCombatBrain } = runtime("./combat-brain.cjs");
const { createCombatFootwork } = runtime("./combat-footwork.cjs");
const { createCrystalPlanner } = runtime("./crystals.cjs");
const { planPearl } = runtime("./pearls.cjs");
const rigRequire = createRequire(new URL("./pathfinding/package.json", extensionUrl));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", extensionUrl)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const samples = Number(process.env.SCREEN_BENCH_SAMPLES ?? 40);
assert.ok(Number.isInteger(samples) && samples >= 5);
const settings = JSON.parse(readFileSync(process.env.SCREEN_BENCH_SETTINGS, "utf8"));
const results = [];

function fixture() {
  const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), {
    renderDistance: 4,
  });
  rig.stopPassivePhysics();
  const bot = rig.bot;
  bot.physicsEnabled = false;
  bot.entity.onGround = true;
  bot.health = bot.food = 20;
  const slots = Array(46).fill(null);
  for (const [slot, name] of [
    [5, "netherite_helmet"],
    [6, "netherite_chestplate"],
    [7, "netherite_leggings"],
    [8, "netherite_boots"],
    [36, "diamond_sword"],
    [37, "obsidian"],
    [38, "end_crystal"],
    [39, "ender_pearl"],
    [40, "golden_apple"],
    [41, "diamond_axe"],
    [42, "mace"],
    [43, "wind_charge"],
    [45, "shield"],
  ])
    slots[slot] = { name, count: slot < 9 ? 1 : 64, slot };
  for (let slot = 9; slot < 36; slot++) slots[slot] = { name: "stone", count: 64, slot };
  bot.inventory = Object.assign(new (require("node:events").EventEmitter)(), {
    slots,
    items: () => slots.slice(9, 45).filter(Boolean),
  });
  bot.pathfinder = { defaultMoveSettings: {} };
  const target = {
    id: 2,
    name: "player",
    username: "Enemy",
    type: "player",
    isValid: true,
    width: 0.6,
    height: 1.8,
    position: new Vec3(5.5, 64, 0.5),
    velocity: new Vec3(0, 0, 0),
    equipment: [],
    metadata: [],
  };
  bot.entities[2] = target;
  // A populated arena, with spectators outside the actual attack corridor.
  for (let i = 0; i < 64; i++)
    bot.entities[100 + i] = {
      ...target,
      id: 100 + i,
      username: `Spectator${i}`,
      position: new Vec3((i % 8) * 3 - 10, 64, 12 + Math.floor(i / 8) * 3),
    };
  const counts = { blockAt: 0, raycast: 0 };
  const blockAt = bot.blockAt.bind(bot),
    raycast = bot.world.raycast.bind(bot.world);
  bot.blockAt = (...args) => {
    counts.blockAt++;
    return blockAt(...args);
  };
  bot.world.raycast = (...args) => {
    counts.raycast++;
    return raycast(...args);
  };
  return { bot, world, target, counts };
}

function signature(value) {
  if (!value) return null;
  if (value.landing)
    return { landing: value.landing, ticks: value.ticks, yaw: value.yaw, pitch: value.pitch };
  if (value.type)
    return {
      type: value.type,
      position: value.position ?? value.base?.position ?? value.source,
      damage: value.damage,
      selfDamage: value.selfDamage,
    };
  return value.action ?? value;
}

function measure(name, f, operation, batch = 1) {
  if (!["movement-open-ground", "pearl-exact-pursuit", "crystal-continue-layout"].includes(name))
    return;
  let value;
  for (let i = 0; i < 20; i++) for (let j = 0; j < batch; j++) value = operation();
  f.counts.blockAt = f.counts.raycast = 0;
  const durations = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    for (let j = 0; j < batch; j++) value = operation();
    durations.push((performance.now() - start) / batch);
  }
  durations.sort((a, b) => a - b);
  results.push({
    name,
    samples,
    batch,
    medianMs: durations[Math.floor(samples / 2)],
    p95Ms: durations[Math.ceil(samples * 0.95) - 1],
    meanMs: durations.reduce((sum, ms) => sum + ms, 0) / samples,
    blockReads: f.counts.blockAt / (samples * batch),
    raycasts: f.counts.raycast / (samples * batch),
    result: signature(value),
  });
}

{
  const f = fixture(),
    brain = createCombatBrain(f.bot, settings, { now: () => 1000 });
  measure("action-and-item", f, () => brain.evaluate(f.target, { visible: true }), 1000);
  brain.dispose();
  f.target.position.set(15.5, 64, 0.5);
  f.bot.entity.yaw = -Math.PI / 2;
  const movement = createCombatFootwork(f.bot, settings, { now: () => 1000 });
  measure("movement-open-ground", f, () => movement.tick(f.target), 50);
}
{
  const f = fixture(),
    planner = createCrystalPlanner(f.bot, settings);
  measure("crystal-new-layout", f, () => planner.plan(f.target, 0));
  const action = planner.plan(f.target, 0);
  assert.ok(action, "benchmark arena must have a feasible crystal layout");
  planner.commit(action, 0);
  if (action.type === "cover" || action.type === "build")
    f.world.setBlock(action.position, action.item.name);
  measure("crystal-continue-layout", f, () => planner.plan(f.target, 250));
}
{
  const f = fixture();
  f.world.setBlock(new Vec3(3, 64, 0), "obsidian");
  const planner = createCrystalPlanner(f.bot, settings);
  measure("crystal-existing-base", f, () => planner.plan(f.target, 0));
}
{
  const f = fixture();
  measure("pearl-travel", f, () => planPearl(f.bot, new Vec3(60.5, 64, 0.5), settings));
  measure("pearl-exact-pursuit", f, () =>
    planPearl(f.bot, new Vec3(24.5, 64, 0.5), settings, 2.5, true),
  );
}

const report = {
  node: process.version,
  cpu: cpus()[0]?.model,
  version: "26.1.2",
  entities: 66,
  settings,
  results,
};
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
if (process.argv[3]) {
  const baseline = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const comparable = (rows) =>
    JSON.parse(JSON.stringify(rows.map(({ name, result }) => ({ name, result }))));
  assert.deepEqual(report.settings, baseline.settings, "comparison requires the same settings");
  assert.deepEqual(
    comparable(report.results),
    comparable(baseline.results),
    "faster planning must preserve actions, damage estimates and pearl landings",
  );
  console.table(
    results.map((result, i) => ({
      scenario: result.name,
      beforeMs: +baseline.results[i].medianMs.toFixed(4),
      afterMs: +result.medianMs.toFixed(4),
      speedup: +(baseline.results[i].medianMs / result.medianMs).toFixed(2),
    })),
  );
}
console.table(
  results.map(({ name, medianMs, p95Ms, blockReads, raycasts }) => ({
    scenario: name,
    medianMs: +medianMs.toFixed(4),
    p95Ms: +p95Ms.toFixed(4),
    blockReads,
    raycasts,
  })),
);
