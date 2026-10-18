import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { createHash } from "node:crypto";
import console from "node:console";
import process from "node:process";
import path from "node:path";

// Run the same workload against a source snapshot using SCREEN_COMBAT_RUNTIME.
// World setup, module loading and warmup are excluded from the measured time.
const extensionUrl = new URL(
  "../../extensions/mineflayer-bot/decision-benchmark.mjs",
  import.meta.url,
);
const require = createRequire(extensionUrl);
const { Vec3 } = require("vec3");
const rigRequire = createRequire(new URL("./pathfinding/package.json", extensionUrl));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", extensionUrl)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const reportDir = path.dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(readFileSync(path.join(reportDir, "results.json"), "utf8"));
const settings = source.settings;
const samples = 100,
  repeats = 3,
  warmup = 20;
const keys = ["reference", "before", "after"];
const modules = Object.fromEntries(
  keys.map((key) => {
    const folder = fileURLToPath(
      new URL(`./.pvp-speed-fix-1.15.8.local/measurement/${key}/`, extensionUrl),
    );
    for (const [name, expected] of Object.entries(source.profiles[key].sha256)) {
      const actual = createHash("sha256")
        .update(readFileSync(path.join(folder, name)))
        .digest("hex");
      assert.equal(actual, expected, `${key}/${name}: source changed`);
    }
    const rt = createRequire(path.join(folder, "package.json"));
    rt("./combat.cjs");
    return [
      key,
      {
        ...rt("./combat-brain.cjs"),
        ...rt("./combat-footwork.cjs"),
        ...rt("./crystals.cjs"),
        ...rt("./pearls.cjs"),
      },
    ];
  }),
);

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

// Same fixtures as cpu.mjs, but alternate versions for every timed sample.
// This reduces background-load and process/JIT differences in tiny operations.
function makeCase(name, api) {
  const f = fixture();
  let operation,
    dispose = () => {},
    batch = 1;
  if (name === "action-and-item") {
    const brain = api.createCombatBrain(f.bot, settings, { now: () => 1000 });
    operation = () => brain.evaluate(f.target, { visible: true });
    dispose = () => brain.dispose();
    batch = 1000;
  } else if (name === "movement-open-ground") {
    f.target.position.set(15.5, 64, 0.5);
    f.bot.entity.yaw = -Math.PI / 2;
    const movement = api.createCombatFootwork(f.bot, settings, { now: () => 1000 });
    operation = () => movement.tick(f.target);
    batch = 50;
  } else if (name.startsWith("crystal-")) {
    if (name === "crystal-existing-base") f.world.setBlock(new Vec3(3, 64, 0), "obsidian");
    const planner = api.createCrystalPlanner(f.bot, settings);
    const continuation = name === "crystal-continue-layout";
    if (continuation) {
      const action = planner.plan(f.target, 0);
      assert.ok(action);
      planner.commit(action, 0);
      if (action.type === "cover" || action.type === "build")
        f.world.setBlock(action.position, action.item.name);
    }
    operation = () => planner.plan(f.target, continuation ? 250 : 0);
  } else if (name === "pearl-travel") {
    operation = () => api.planPearl(f.bot, new Vec3(60.5, 64, 0.5), settings);
  } else if (name === "pearl-exact-pursuit") {
    operation = () => api.planPearl(f.bot, new Vec3(24.5, 64, 0.5), settings, 2.5, true);
  } else throw new Error(`Unknown scenario: ${name}`);
  return { ...f, operation, dispose, batch };
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const orderAt = (index) => {
  const order = keys.map((_, j) => keys[(index + j) % keys.length]);
  return Math.floor(index / keys.length) % 2 ? order.reverse() : order;
};
const startedAt = new Date().toISOString();
const rows = [];
for (const { name } of source.cpuResults) {
  const trials = [];
  for (let trial = 0; trial < repeats; trial++) {
    console.log(`Paired ${trial + 1}/${repeats}: ${name}`);
    const cases = Object.fromEntries(
      orderAt(trial).map((key) => [key, makeCase(name, modules[key])]),
    );
    const timed = {};
    let expected;
    for (let i = 0; i < warmup; i++) {
      for (const key of orderAt(i + trial)) {
        const c = cases[key];
        for (let j = 0; j < c.batch; j++) c.operation();
      }
    }
    for (const key of keys) {
      const c = cases[key];
      const value = JSON.parse(JSON.stringify(signature(c.operation())));
      expected ??= value;
      assert.deepEqual(value, expected, `${name}/${key} result differs`);
      assert.deepEqual(
        value,
        source.cpuResults.find((row) => row.name === name).profiles[key].result,
      );
      c.counts.blockAt = c.counts.raycast = 0;
      timed[key] = { durations: [], result: value };
    }
    for (let i = 0; i < samples; i++) {
      for (const key of orderAt(i + trial)) {
        const c = cases[key];
        const start = performance.now();
        for (let j = 0; j < c.batch; j++) c.operation();
        timed[key].durations.push((performance.now() - start) / c.batch);
      }
    }
    for (const key of keys) {
      const c = cases[key],
        t = timed[key];
      t.medianMs = median(t.durations);
      t.p95Ms = [...t.durations].sort((a, b) => a - b)[Math.ceil(samples * 0.95) - 1];
      t.blockReads = c.counts.blockAt / (samples * c.batch);
      t.raycasts = c.counts.raycast / (samples * c.batch);
      c.dispose();
    }
    trials.push(timed);
  }
  rows.push({
    name,
    trials,
    profiles: Object.fromEntries(
      keys.map((key) => [
        key,
        {
          medianMs: median(trials.map((t) => t[key].medianMs)),
          p95Ms: median(trials.map((t) => t[key].p95Ms)),
          trialMediansMs: trials.map((t) => t[key].medianMs),
          blockReads: trials[0][key].blockReads,
          raycasts: trials[0][key].raycasts,
        },
      ]),
    ),
  });
}
const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  node: process.version,
  cpu: cpus()[0]?.model,
  samples,
  repeats,
  warmup,
  method: "Rotate and reverse the three versions for each sample within one process",
  sources: source.profiles,
  signaturesMatchSeparateProcessRun: true,
  rows,
};
writeFileSync(
  path.join(reportDir, "paired-cpu-results.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.table(
  rows.map((row) => ({
    name: row.name,
    reference: row.profiles.reference.medianMs,
    before: row.profiles.before.medianMs,
    after: row.profiles.after.medianMs,
  })),
);
