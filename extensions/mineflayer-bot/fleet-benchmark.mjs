import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { EventEmitter } from "node:events";

const require = createRequire(import.meta.url);
const argument = name => process.argv[process.argv.indexOf(name) + 1];
const baseline = process.argv.includes("--baseline") ? argument("--baseline") : null;
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] };
};
const point = (x, z = 0.5) => ({ x, y: 64, z });

function traffic(root, delta, dense) {
  const { createHub } = require(`${root}/fleet-crew.cjs`);
  let time = 1000;
  const hub = createHub({ now: () => time });
  const timings = [], bytes = [];
  const inputs = Array.from({ length: 100 }, (_, i) => {
    const origin = dense ? (i % 10) * 3 : i * 100;
    const z = dense ? Math.floor(i / 10) * 3 + 0.5 : 0.5;
    return { dim: "overworld", pos: point(origin + 0.5, z), route: Array.from({ length: 16 }, (_, j) => point(origin + j + 1.5, z)),
      corridor: Array.from({ length: 24 }, (_, j) => point(origin + j + 0.5, z)), storage: null };
  });
  let epoch;
  for (let round = 0; round < 20; round++) {
    for (let i = 0; i < inputs.length; i++) {
      const input = delta && round > 0 ? { delta: true, epoch, dim: inputs[i].dim, pos: inputs[i].pos } : inputs[i];
      const started = performance.now();
      const result = hub.handle(`bot-${i}`, "traffic", input);
      assert.equal(result.resync, undefined);
      epoch = result.epoch;
      if (round >= 5) { timings.push(performance.now() - started); bytes.push(Buffer.byteLength(JSON.stringify(input))); }
    }
    time += 180;
  }
  return { ms: stats(timings), requestBytes: stats(bytes) };
}

const runtime = createRequire(new URL("./pathfinding/package.json", import.meta.url));
runtime("ts-node").register({ project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)) });
const { Vec3 } = runtime("vec3");
const { createCacheWorld, createFlatWorld } = runtime("./tests/setup.ts");

async function publications(root) {
  const { createHub } = require(`${root}/fleet-crew.cjs`);
  const { createFleetNavigation } = require(`${root}/fleet-navigation.cjs`);
  let time = 1000, bytes = 0, reads = 0;
  const hub = createHub({ now: () => time });
  const navs = Array.from({ length: 100 }, (_, i) => {
    const bot = new EventEmitter();
    bot.username = `publisher-${i}`;
    bot.entity = { position: new Vec3(i * 100 + 0.5, 64, 0.5), onGround: true };
    bot.entities = {}; bot.game = { dimension: "overworld" };
    bot.blockAt = p => {
      reads++;
      const solid = p.y < 64 || Math.floor(p.z) !== 0;
      return { name: solid ? "stone" : "air", boundingBox: solid ? "block" : "empty",
        shapes: solid ? [[0, 0, 0, 1, 1, 1]] : [], getProperties: () => ({}) };
    };
    bot.setControlState = () => {};
    bot.pathfinder = { isPathing: true, currentIndex: 0,
      currentPath: Array.from({ length: 16 }, (_, j) => ({ exitPos: bot.entity.position.offset(j + 1, 0, 0) })) };
    const link = { request: async (op, input) => {
      const encoded = JSON.stringify(input); bytes += Buffer.byteLength(encoded);
      return JSON.parse(JSON.stringify(hub.handle(bot.username, op, JSON.parse(encoded))));
    } };
    return createFleetNavigation(bot, link, { now: () => time, pollMs: 10000000,
      workBudget: { delayMs: 0, sliceMs: 5, dispose() {} } });
  });
  const timings = [], payloads = [], blockReads = [];
  try {
    await new Promise(resolve => setImmediate(resolve));
    for (let i = 0; i < 12; i++) {
      const priorBytes = bytes, priorReads = reads, started = performance.now();
      navs.forEach(nav => nav.setStoragePhase("gathering", [point(0.5)]));
      await new Promise(resolve => setImmediate(resolve));
      if (i >= 3) { timings.push(performance.now() - started); payloads.push((bytes - priorBytes) / 100); blockReads.push(reads - priorReads); }
      time += 180;
    }
    return { roundOf100Ms: stats(timings), requestBytes: stats(payloads), terrainReadsPerRound: stats(blockReads) };
  } finally { navs.forEach(nav => nav.dispose()); }
}

async function routeSearch(root, reuse) {
  const { createPlugin, goals } = require(`${root}/pathfinder.cjs`);
  const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5));
  const bot = rig.bot;
  bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowParkour: false },
    pathfinderSettings: { searchTimeoutMs: 3000, heuristicWeight: 1 } }));
  // The prepared route goes around a wall instead of following the heuristic.
  for (let z = -15; z <= 8; z++) for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(8, y, z), "stone");
  const goal = new goals.GoalBlock(16, 64, 0);
  const zero = new Vec3(0, 0, 0);
  const first = await bot.pathfinder.getPathFromToRaw(bot.entity.position, zero, goal);
  assert.ok(first);
  const hints = [{ ...bot.entity.position }, ...first.path.map(move => ({ ...move.exitPos, kind: move.moveType.constructor.name }))];
  if (reuse) bot.launcherTraffic = { cost: () => 0, pause: () => false, waiting: false, workSliceMs: 5, routeFrom: () => hints };
  const timings = [], visited = [];
  try {
    for (let i = 0; i < 15; i++) {
      const started = performance.now();
      const result = await bot.pathfinder.getPathFromToRaw(bot.entity.position, zero, goal);
      assert.ok(result && goal.isEnd(result.path.at(-1)));
      if (i >= 3) { timings.push(performance.now() - started); visited.push(result.visitedNodes); }
    }
    return { ms: stats(timings), visited: stats(visited), steps: first.path.length };
  } finally { await bot.pathfinder.destroy(); rig.stopPassivePhysics(); }
}

async function warehouse(root) {
  const { createPlugin, goals } = require(`${root}/pathfinder.cjs`);
  const { createHub } = require(`${root}/fleet-crew.cjs`);
  const { createFleetNavigation } = require(`${root}/fleet-navigation.cjs`);
  const { withStorageTurn } = require(`${root}/fleet-storage.cjs`);
  const { containerClick } = require(`${root}/warehouse-geometry.cjs`);
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  const chest = world.setBlock(new Vec3(0, 64, 0), "chest");
  const { rig } = createCacheWorld("26.1.2", 64, new Vec3(-5.5, 64, -5.5), { world });
  const bot = rig.bot;
  bot.username = bot.entity.username = "benchmark";
  bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowSprinting: false, allowParkour: false } }));
  const hub = createHub();
  const crew = { request: async (op, input) => hub.handle("benchmark", op, input) };
  const nav = createFleetNavigation(bot, crew);
  const phases = { approachTicks: 0, transferTicks: 0, departureTicks: 0 };
  let ticks = 0;
  bot.on("physicsTick", () => ticks++);
  const started = performance.now();
  const signal = AbortSignal.timeout(15000);
  signal.addEventListener("abort", () => void bot.pathfinder.stop(), { once: true });
  try {
    await withStorageTurn(bot, crew, [chest.position], { signal, status() {},
      wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
      walk: async (p, _signal, radius = 0.22) => bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, radius)),
    }, async (leave, _signal, turn) => {
      await turn.enterChest(chest.position);
      assert.ok(containerClick(bot, chest));
      phases.approachTicks = ticks;
      // A confirmed transfer costs two server ticks in both versions.
      await bot.waitForTicks(2);
      phases.transferTicks = ticks - phases.approachTicks;
      await leave();
      phases.departureTicks = ticks - phases.approachTicks - phases.transferTicks;
    });
    assert.ok(bot.entity.position.xzDistanceTo(chest.position) >= 4.3);
    return { elapsedMs: performance.now() - started, ...phases, totalTicks: ticks };
  } finally { nav.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); }
}

const result = { date: new Date().toISOString(), description: "100-member local coordinator; live planner; simulated 20 Hz Minecraft physics (not 100 connected server clients)", runs: {} };
const roots = [...(baseline ? [["before", baseline]] : []), ["after", "."]];
for (const [name, root] of roots) {
  const rows = { sparse: traffic(root, name === "after", false), dense: traffic(root, name === "after", true),
    publications: await publications(root) };
  if (!process.argv.includes("--coordinator-only")) {
    rows.search = await routeSearch(root, name === "after");
    rows.warehouse = [];
  }
  result.runs[name] = rows;
}
if (!process.argv.includes("--coordinator-only")) {
  const rounds = process.argv.includes("--warehouse-rounds") ? Math.max(1, Math.min(10, Number(argument("--warehouse-rounds")) || 3)) : 3;
  for (let i = 0; i < rounds; i++) for (const [name, root] of (i % 2 ? [...roots].reverse() : roots)) {
    const sample = await warehouse(root);
    result.runs[name].warehouse.push(sample);
    console.log(JSON.stringify({ name, round: i + 1, warehouse: sample }));
  }
}
for (const [name, rows] of Object.entries(result.runs)) console.log(JSON.stringify({ name, ...rows }));
if (process.argv.includes("--output")) await writeFile(argument("--output"), `${JSON.stringify(result, null, 2)}\n`);
