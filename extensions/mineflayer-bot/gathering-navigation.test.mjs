import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import worker from "./worker.cjs";
import gathering from "./gathering.cjs";
import commands from "./gathering-commands.cjs";

const require = createRequire(new URL("./pathfinding/package.json", import.meta.url));
require("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
});
const { createCacheWorld, createFlatWorld } = require("./tests/setup.ts");
const { Vec3 } = require("vec3");
const { createHub } = require("../fleet-crew.cjs");
const { createFleetNavigation } = require("../fleet-navigation.cjs");
const { withStorageTurn } = require("../fleet-storage.cjs");
const { blockingPlayers, containerClick, lidExit, leaveContainerTop, warehouseLayout, safeStand } = require("../warehouse-geometry.cjs");

async function waitForJob(controller, timeout = 12000) {
  const until = Date.now() + timeout;
  while (controller.busy && Date.now() < until && controller.snapshot.phase !== "paused")
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(controller.snapshot.phase === "paused", false, JSON.stringify(controller.snapshot));
  assert.equal(controller.busy, false, JSON.stringify(controller.snapshot));
}
function prepare(version, world, realDigging = false, position = new Vec3(0.5, 64, 0.5), movement = {}, hooks = {}) {
  const { rig } = createCacheWorld(version, position.y, position, { world });
  const bot = rig.bot;
  bot.health = 20;
  bot.inventory.emptySlotCount = () => 30;
  bot.canDigBlock = (block) =>
    block.position.offset(0.5, 0.5, 0.5).distanceTo(bot.entity.position.offset(0, 1.62, 0)) < 5;
  bot.canSeeBlock = (block) => {
    const eye = bot.entity.position.offset(0, 1.62, 0),
      destination = block.position.offset(0.5, 0.5, 0.5);
    const hit = world.raycast(eye, destination.minus(eye).normalize(), eye.distanceTo(destination));
    return hit?.position.equals(block.position) === true;
  };
  if (realDigging) {
    const runtime = createRequire(new URL("./package.json", import.meta.url));
    bot._updateBlockState = (position, state) => world.setBlock(position, state);
    bot.loadPlugin(runtime("mineflayer/lib/plugins/digging"));
  }
  worker.configurePathfinder(
    bot,
    { allowParkour: false, allowSprinting: false, canDig: false, maxDropDown: 2, ...movement },
    { stayOnWater: false },
  );
  const messages = [];
  const controller = gathering.createGatheringController(
    bot,
    { dropWaitMs: 0, operationTimeoutMs: 8000 },
    { onStatus: (message) => messages.push(message), ...hooks },
  );
  return { rig, bot, controller, messages };
}

test("a stalled departure is stopped and releases the wave without losing a completed transfer", { timeout: 3000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  const chest = world.setBlock(new Vec3(0, 64, 0), "chest");
  const { rig, bot, controller } = prepare("26.1.2", world);
  bot.physicsEnabled = false;
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const hub = createHub();
  let transferred = false, stopWalk = null, stopped = false;
  const result = await withStorageTurn(bot, { request: async (op, input) => hub.handle("departing", op, input) }, [chest.position], {
    signal: new AbortController().signal, status() {}, stallMs: 70,
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    walk: async position => {
      if (!transferred) { bot.entity.position = position.clone(); return; }
      await new Promise(resolve => { stopWalk = resolve; });
    },
    onStalled() { stopped = true; stopWalk?.(); },
  }, async leave => { transferred = true; await leave(); return "transferred"; });
  assert.equal(result, "transferred");
  assert.equal(stopped, true, "stops the underlying walk, not only its waiter");
  assert.equal(hub.handle("next", "storage", { token: "next", positions: [chest.position], dim: "overworld" }).allowed, true);
});

test("a service turn follows separate entrance and exit lanes and clicks nearby sorted chests without requeueing", { timeout: 5000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  const chests = [0, 2].map(x => world.setBlock(new Vec3(x, 64, 0), "chest").position);
  const { rig, bot, controller } = prepare("26.1.2", world, false, new Vec3(-10.5, 64, 0.5));
  bot.physicsEnabled = false;
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const hub = createHub(), walks = [];
  let service;
  await withStorageTurn(bot, { request: async (op, input) => hub.handle("flow", op, input) }, chests, {
    signal: new AbortController().signal, status() {}, wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    walk: async p => { walks.push(p.clone()); bot.entity.position = p.clone(); },
  }, async (leave, _signal, turn) => {
    await turn.enterChest(chests[0]); service = turn.service;
    assert.equal(service.inbound.length, 2); assert.equal(service.outbound.length, 2);
    const count = walks.length;
    await turn.enterChest({ ...chests[1] });
    assert.equal(walks.length, count, "a reachable neighbouring chest needs no extra lap");
    await leave();
  });
  const lane = [...service.inbound, service, ...service.outbound];
  assert.deepEqual(walks.slice(-lane.length).map(p => [p.x, p.y, p.z]), lane.map(p => [p.x, p.y, p.z]));
  assert.ok(new Vec3(service.inbound[0].x, 64, service.inbound[0].z).distanceTo(new Vec3(service.outbound[1].x, 64, service.outbound[1].z)) >= 3);
  assert.ok(chests.every(p => bot.entity.position.xzDistanceTo(p) >= 4.6));
  assert.equal(hub.handle("next", "storage", { token: "next", positions: chests, dim: "overworld" }).allowed, true);
});

test("the real movement executor completes a separate entrance and exit loop on a broad warehouse floor", { timeout: 15000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  const chest = world.setBlock(new Vec3(0, 64, 0), "chest");
  const { rig, bot, controller } = prepare("26.1.2", world, false, new Vec3(-5.5, 64, -5.5));
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const hub = createHub(), walks = [];
  await withStorageTurn(bot, { request: async (op, input) => hub.handle("walking-flow", op, input) }, [chest.position], {
    signal: t.signal, status() {}, wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    walk: async (p, _signal, radius = 0.22) => {
      walks.push(p.clone());
      const { goals } = require("../pathfinder.cjs");
      await bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, radius));
    },
  }, async (leave, _signal, turn) => {
    await turn.enterChest(chest.position);
    assert.equal(turn.service.inbound.length, 2, "uses the validated loop, not a fallback bay");
    assert.ok(containerClick(bot, chest));
    await leave();
  });
  assert.ok(walks.length >= 6, "stage, two entry points, service, two exit points");
  assert.ok(bot.entity.position.xzDistanceTo(chest.position) >= 4.3);
});

test("changing to a distant chest clears the old service point before waiting for the next one", { timeout: 5000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  const chests = [0, 10].map(x => world.setBlock(new Vec3(x, 64, 0), "chest").position);
  const { rig, bot, controller } = prepare("26.1.2", world, false, new Vec3(-10.5, 64, 0.5));
  bot.physicsEnabled = false;
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const hub = createHub(); let oldBay = null, changed = false;
  await withStorageTurn(bot, { request: async (op, input) => {
    if (oldBay && input.requeue) {
      assert.ok(bot.entity.position.xzDistanceTo(oldBay) > 2.2, "cannot surrender a bay while still standing there"); changed = true;
    }
    return hub.handle("sorting", op, input);
  } }, chests, {
    signal: new AbortController().signal, status() {}, wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    walk: async p => { bot.entity.position = p.clone(); },
  }, async (leave, _signal, turn) => {
    await turn.enterChest(chests[0]); oldBay = new Vec3(turn.service.x, turn.service.y, turn.service.z);
    await turn.enterChest({ ...chests[1] }); await leave();
  });
  assert.equal(changed, true);
});

test("correcting a push at the chest does not repeat the entrance loop", { timeout: 5000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  const chest = world.setBlock(new Vec3(0, 64, 0), "chest");
  const { rig, bot, controller } = prepare("26.1.2", world, false, new Vec3(-10.5, 64, 0.5));
  bot.physicsEnabled = false;
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const hub = createHub(), walks = [];
  await withStorageTurn(bot, { request: async (op, input) => hub.handle("pushed", op, input) }, [chest.position], {
    signal: t.signal, status() {}, wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    walk: async p => { walks.push(p.clone()); bot.entity.position = p.clone(); },
  }, async (_leave, _signal, turn) => {
    await turn.enterChest(chest.position);
    const count = walks.length, bay = bot.entity.position.clone();
    assert.equal(turn.service.inbound.length, 2);
    bot.entity.position.x += 0.5;
    await turn.enterChest(chest.position);
    assert.deepEqual(walks.slice(count), [bay], "correct directly to the assigned bay, without revisiting entry waypoints");
  });
});

test("53 workers reserve distinct safe waiting places on the actual warehouse floor", { timeout: 10000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 2 });
  const chests = [0, 3, 6, 9].map(x => world.setBlock(new Vec3(x, 64, 0), "chest").position);
  const { rig, bot, controller } = prepare("26.1.2", world, false, new Vec3(-15.5, 64, 0.5));
  bot.physicsEnabled = false;
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const layout = await warehouseLayout(bot, chests, { targets: [chests[0]] });
  const hub = createHub(), places = [];
  for (let i = 0; i < 53; i++) {
    const reply = hub.handle(`worker-${i}`, "storage", { token: `floor-${i}`, dim: "overworld", batch: true,
      positions: chests, pos: bot.entity.position, bays: layout.bays, stages: layout.stages, ready: false });
    assert.ok(reply.stage, `worker ${i + 1}/53 has a safe nearby place; candidates=${layout.stages.length}`);
    const point = new Vec3(reply.stage.x, reply.stage.y, reply.stage.z);
    assert.ok(safeStand(bot, point, true));
    assert.ok(places.every(other => point.distanceTo(other) >= 1.9));
    assert.ok(chests.every(chest => point.xzDistanceTo(chest) >= 5));
    places.push(point);
  }
});

test("a blocked service bay is cancelled and replaced before the warehouse ticket stalls", { timeout: 5000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  const chest = world.setBlock(new Vec3(0, 64, 0), "chest");
  const { rig, bot, controller } = prepare("26.1.2", world);
  bot.physicsEnabled = false;
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const hub = createHub(), parent = new AbortController(), approaches = [];
  const messages = [];
  let cancelled = false;
  const result = await withStorageTurn(bot, { request: async (op, input) => hub.handle("retrying", op, input) }, [chest.position], {
    signal: parent.signal, status: message => messages.push(message), stallMs: 2000, approachStallMs: 60,
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    walk: async (position, signal, radius) => {
      if (radius === 0.4 || radius === 0.3) { bot.entity.position = position.clone(); return; }
      approaches.push(position.clone());
      if (approaches.length === 1) {
        await new Promise((_, reject) => signal.addEventListener("abort", () => {
          cancelled = true; reject(new Error("occupied service bay"));
        }, { once: true }));
      }
      bot.entity.position = position.clone();
    },
    onStalled() { assert.fail("a local approach failure must not stall the entire ticket"); },
  }, async (_leave, _signal, turn) => { await turn.enterChest(chest.position); return "unloaded"; });
  assert.equal(result, "unloaded");
  assert.equal(cancelled, true, "cancels the original movement before starting another");
  assert.equal(approaches.length, 2);
  assert.ok(approaches[0].distanceTo(approaches[1]) > 0.5, "chooses another physical place");
  assert.ok(messages.some(message => message.includes("беру другое место")));
  assert.equal(hub.handle("next", "storage", { token: "next", positions: [chest.position], dim: "overworld" }).allowed, true);
});

for (const raised of [false, true]) test(`a paused worker autonomously clears a ${raised ? "raised" : "level"} warehouse landing`, { timeout: 12000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  if (raised) for (let x = 0; x <= 5; x++) for (let z = -3; z <= 3; z++)
    for (let y = 64; y < (x === 0 ? 65 : 66); y++) world.setBlock(new Vec3(x, y, z), "white_wool");
  const chest = world.setBlock(new Vec3(4, raised ? 66 : 64, 0), "chest");
  const { rig, bot, controller } = prepare("26.1.2", world, false, new Vec3(3.5, raised ? 66 : 64, 0.5));
  const hub = createHub();
  const nav = createFleetNavigation(bot, { request: async (op, input) => hub.handle("paused", op, input) });
  nav.setWarehouse([chest.position]);
  bot.launcherGathering = { busy: true, snapshot: { phase: "paused" } };
  t.after(async () => { nav.dispose(); await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const until = Date.now() + 9000;
  while (bot.entity.position.xzDistanceTo(chest.position) < 4.8 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(bot.entity.position.xzDistanceTo(chest.position) >= 4.8, JSON.stringify({ state: nav.warehouseState,
    position: bot.entity.position, onGround: bot.entity.onGround, pathing: bot.pathfinder.isPathing }));
});

test("warehouse waves pass a failed worker, stacked chest faces and a quarry edge under server collision pushes", { timeout: 120000 }, async t => {
  const world = createFlatWorld("26.1.2", 58, { renderDistance: 2 });
  world.setMaxListeners(64);
  for (let x = -20; x < 0; x++) for (let z = -20; z <= 20; z++)
    for (let y = 58; y < 64; y++) world.setBlock(new Vec3(x, y, z), "stone");
  for (let x = 0; x <= 5; x++) for (let z = -6; z <= 6; z++)
    for (let y = 58; y < (x === 0 ? 65 : 66); y++) world.setBlock(new Vec3(x, y, z), "white_wool");
  const resources = ["diamond", "iron_ingot", "gold_ingot"];
  const chests = [-3, 0, 3].map(z => world.setBlock(new Vec3(4, 66, z), "chest"));
  for (const chest of chests) for (const dy of [1, 2]) world.setBlock(chest.position.offset(0, dy, 0), "chest");
  const hub = createHub(), workers = [], navs = [], arrivals = [];
  let opened = 0, maximumOpened = 0, movedTogether = 0, edits = 0, lowest = 64, minDistance = Infinity;
  for (let i = 0; i < 7; i++) {
    const name = `wave-${i}`;
    const crew = { request: async (op, input) => hub.handle(name, op, input), setBeat() {} };
    const entry = prepare("26.1.2", world, false, new Vec3(-11.5, 64, -6.5 + i * 2), {}, { crew });
    workers.push(entry);
    const { bot, controller } = entry;
    bot.entity.username = name;
    navs.push(createFleetNavigation(bot, crew, { pollMs: 70 }));
    const Item = require("prismarine-item")(bot.registry);
    const item = new Item(bot.registry.itemsByName[resources[i % 3]].id, 5); item.slot = 36;
    bot.inventory.slots[36] = item; bot.updateHeldItem(); bot.pathingUtil.refresh();
    controller.configureStorage(chests.map((chest, index) => ({ id: `shelf-${index}`, name: resources[index],
      filters: [resources[index]], chests: [chest.position] })));
    bot.on("diggingCompleted", () => edits++); bot.on("blockPlaced", () => edits++);
    bot.activateBlock = undefined;
    bot.openContainer = async block => {
      if (i === 6) throw new Error("simulated server rejection before transfer");
      const eye = bot.entity.position.offset(0, 1.62, 0);
      assert.equal(blockingPlayers(bot, eye, block.position.offset(0.5, 0.5, 0.5)).length, 0, "no colleague in the click corridor");
      if (!arrivals.length) movedTogether = workers.slice(0, 6).filter(e => e.bot.entity.position.x > -9).length;
      arrivals.push(i); opened++; maximumOpened = Math.max(maximumOpened, opened);
      let closed = false;
      return { close() { if (!closed) { opened--; closed = true; } }, async deposit() {
        await new Promise(resolve => setTimeout(resolve, 1500));
        bot.inventory.slots[36] = null; bot.updateHeldItem();
      } };
    };
  }
  for (const { bot } of workers) workers.forEach(({ bot: other }, i) => { if (other !== bot) bot.entities[200 + i] = other.entity; });
  // Mineflayer's client physics does not receive player pushes in this rig.
  // Model server-side pushes explicitly when player bodies overlap, making
  // crowding on the two-block steps and at the cliff capable of causing falls.
  workers[0].bot.on("physicsTick", () => {
    for (let i = 0; i < workers.length; i++) {
      const a = workers[i].bot.entity;
      lowest = Math.min(lowest, a.position.y);
      for (let j = i + 1; j < workers.length; j++) {
        const b = workers[j].bot.entity;
        if (Math.abs(a.position.y - b.position.y) > 1.7) continue;
        const d = a.position.xzDistanceTo(b.position); minDistance = Math.min(minDistance, d);
        if (d > 0 && d < 0.62) {
          const dx = (a.position.x - b.position.x) / d * 0.05, dz = (a.position.z - b.position.z) / d * 0.05;
          a.velocity.x += dx; a.velocity.z += dz; b.velocity.x -= dx; b.velocity.z -= dz;
        }
      }
    }
  });
  t.signal.addEventListener("abort", () => workers.forEach(({ bot }) => { void bot.pathfinder.stop(); }), { once: true });
  t.after(async () => {
    navs.forEach(nav => nav.dispose());
    await Promise.all(workers.map(async ({ controller, bot, rig }) => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); }));
  });
  const failed = workers[6];
  failed.controller.enqueue({ kind: "deposit" });
  const until = Date.now() + 25000;
  while (failed.controller.snapshot.phase !== "paused" && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(failed.controller.snapshot.phase, "paused", "a rejected transfer remains an actionable error");
  // Reproduce an already failed bot left on the narrow approach, as in the
  // screenshot, before the other workers arrive at that landing.
  failed.bot.entity.position.set(3.5, 66, 0.5); failed.bot.entity.velocity.set(0, 0, 0);
  workers.slice(0, 6).forEach(({ controller }) => controller.enqueue({ kind: "deposit" }));
  await Promise.all(workers.slice(0, 6).map(({ controller }) => waitForJob(controller, 85000)));
  assert.equal(new Set(arrivals).size, 6);
  assert.ok(maximumOpened >= 2, `unloads concurrently, maximum=${maximumOpened}`);
  assert.ok(movedTogether >= 4, `${movedTogether}/6 approached before the first transfer`);
  t.diagnostic(`parallel=${maximumOpened}, together=${movedTogether}, separation=${minDistance}, lowest=${lowest}, failed=${failed.bot.entity.position}, phase=${failed.controller.snapshot.phase}`);
  assert.ok(failed.bot.entity.position.xzDistanceTo(chests[1].position) >= 4.8, `the failed worker vacates the approach: ${failed.bot.entity.position}; ${JSON.stringify(navs[6].warehouseState)}; ground=${failed.bot.entity.onGround}; path=${failed.bot.pathfinder.isPathing}`);
  assert.ok(lowest >= 63.99, `no worker is pushed into the quarry: lowest=${lowest}`);
  assert.ok(minDistance > 0.6, `player bodies stay separated: ${minDistance}`);
  assert.equal(edits, 0, "uses the prepared warehouse without altering it");
  t.diagnostic(`parallel unloaders=${maximumOpened}, simultaneous approaches=${movedTogether}, minimum separation=${minDistance.toFixed(2)}, lowest=${lowest}`);
});

// The warehouse of the screenshots: two rows of chests hanging over a pit, a
// two-block ledge in front of them and a single flight of steps up to it.
function chestWall(world) {
  for (let x = 1; x <= 9; x++) for (let z = -8; z <= 8; z++)
    for (let y = 57; y < 64; y++) world.setBlock(new Vec3(x, y, z), y === 57 ? "sand" : "air");
  for (let step = 0; step < 3; step++) for (let z = -1; z <= 1; z++)
    world.setBlock(new Vec3(step - 1, 64 + step, z), "white_wool");
  for (let x = 2; x <= 3; x++) for (let z = -5; z <= 5; z++) world.setBlock(new Vec3(x, 66, z), "white_wool");
  const chests = [];
  for (let z = -4; z <= 4; z++) for (const y of [67, 68]) chests.push(world.setBlock(new Vec3(4, y, z), "chest"));
  return chests;
}
function crewWorker(world, hub, name, position, navs) {
  const crew = { request: async (op, input) => hub.handle(name, op, input), setBeat() {} };
  const entry = prepare("26.1.2", world, false, position, {}, { crew });
  entry.bot.entity.username = name;
  entry.nav = createFleetNavigation(entry.bot, crew, { pollMs: 70 });
  navs.push(entry.nav);
  return entry;
}
function give(bot, name, count = 5) {
  const Item = require("prismarine-item")(bot.registry);
  const item = new Item(bot.registry.itemsByName[name].id, count); item.slot = 36;
  bot.inventory.slots[36] = item; bot.updateHeldItem(); bot.pathingUtil.refresh();
}
// Mineflayer's client physics receives no player pushes in this rig. Model
// the server's: overlapping bodies shove each other apart, also off a ledge.
function serverPushes(workers, stats) {
  workers[0].bot.on("physicsTick", () => {
    for (let i = 0; i < workers.length; i++) {
      const a = workers[i].bot.entity;
      for (let j = i + 1; j < workers.length; j++) {
        const b = workers[j].bot.entity;
        if (Math.abs(a.position.y - b.position.y) > 1.7) continue;
        const d = a.position.xzDistanceTo(b.position);
        stats.minDistance = Math.min(stats.minDistance, d);
        if (d > 0 && d < 0.62) {
          const dx = (a.position.x - b.position.x) / d * 0.05, dz = (a.position.z - b.position.z) / d * 0.05;
          a.velocity.x += dx; a.velocity.z += dz; b.velocity.x -= dx; b.velocity.z -= dz;
        }
      }
    }
  });
}

test("a worker standing on a chest lid steps down across the lids and unloads instead of failing every route", { timeout: 30000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  const chests = chestWall(world);
  // On the upper row, in the middle of the wall: lids on both sides, the pit
  // behind, the ledge two blocks down in front.
  const { rig, bot, controller } = prepare("26.1.2", world, false, new Vec3(4.5, 68.875, 0.5));
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(bot.entity.onGround && Math.abs(bot.entity.position.y - 68.875) < 0.01, `stands on the lid: ${bot.entity.position}`);
  const exit = lidExit(bot);
  assert.ok(exit?.length, "finds real footing next to the wall");
  assert.equal(exit[exit.length - 1].y, 67, "the ledge, not another lid");
  give(bot, "diamond");
  let opened = 0;
  bot.activateBlock = undefined;
  bot.openContainer = async () => { opened++; return { close() {}, async deposit() { bot.inventory.slots[36] = null; bot.updateHeldItem(); } }; };
  controller.configureStorage([{ id: "wall", name: "Склад", filters: ["#all"], chests: [chests[2].position] }]);
  controller.enqueue({ kind: "deposit" });
  await waitForJob(controller, 25000);
  assert.equal(opened, 1);
  assert.equal(controller.snapshot.history[0]?.deposited, 5);
  assert.ok(bot.entity.position.y >= 66.99 && bot.entity.position.y < 67.5, `unloads from the ledge: ${bot.entity.position}`);
});

test("leaving a lid crosses a row of chests over a pit and refuses a drop into it", { timeout: 15000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  for (let x = 1; x <= 9; x++) for (let z = -6; z <= 6; z++)
    for (let y = 58; y < 64; y++) world.setBlock(new Vec3(x, y, z), "air");
  // A row of chests bridging the pit from the bank at x=0; nothing beside it.
  for (let x = 1; x <= 5; x++) world.setBlock(new Vec3(x, 63, 0), "chest");
  const { rig, bot, controller } = prepare("26.1.2", world, false, new Vec3(4.5, 63.875, 0.5));
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  await new Promise(resolve => setTimeout(resolve, 300));
  let lowest = Infinity;
  bot.on("physicsTick", () => { lowest = Math.min(lowest, bot.entity.position.y); });
  assert.equal(await leaveContainerTop(bot), true);
  assert.ok(bot.entity.position.x < 1 && Math.abs(bot.entity.position.y - 64) < 0.01, `back on the bank: ${bot.entity.position}`);
  assert.ok(lowest >= 63.87, `never dropped into the pit: ${lowest}`);
  assert.equal(lidExit(bot), null, "ordinary ground needs no step-off");
});

test("a colleague in front of the chest blocks the straight click, and the click moves to a free part of the chest", { timeout: 10000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  const chest = world.setBlock(new Vec3(4, 64, 0), "chest");
  const { rig, bot, controller } = prepare("26.1.2", world, false, new Vec3(1.5, 64, 0.5));
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const colleague = { username: "blocker", position: new Vec3(2.9, 64, 0.5), width: 0.6, height: 1.8 };
  bot.entities[77] = colleague;
  const eye = bot.entity.position.offset(0, 1.62, 0);
  assert.equal(blockingPlayers(bot, eye, chest.position.offset(0.5, 0.5, 0.5)).length, 1);
  assert.equal(containerClick(bot, chest), null, "a body filling the whole approach leaves no click");
  // Half a block aside the same colleague only covers part of the chest.
  colleague.position.z = 0.95;
  const click = containerClick(bot, chest);
  assert.ok(click, "clicks past the colleague");
  assert.equal(blockingPlayers(bot, eye, chest.position.plus(click.cursor)).length, 0);
  delete bot.entities[77];
  assert.ok(containerClick(bot, chest));
});

test("a colleague entering a planned lid exit is waited for instead of being pushed into the pit", { timeout: 10000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  for (let x = 1; x <= 6; x++) for (let z = -3; z <= 3; z++)
    for (let y = 58; y < 64; y++) world.setBlock(new Vec3(x, y, z), "air");
  for (let x = 1; x <= 3; x++) world.setBlock(new Vec3(x, 63, 0), "chest");
  const { rig, bot, controller } = prepare("26.1.2", world, false, new Vec3(2.5, 63.875, 0.5));
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  await bot.waitForTicks(2);
  const look = bot.look.bind(bot);
  let injected = false, requests = 0, lowest = Infinity;
  bot.launcherTraffic = { requestClearance(names) { assert.deepEqual(names, ["crossing"]); requests++; } };
  bot.look = (...args) => {
    if (!injected) {
      injected = true;
      bot.entities[77] = { username: "crossing", position: new Vec3(1.5, 63.875, 0.5), width: 0.6, height: 1.8 };
    }
    return look(...args);
  };
  bot.on("physicsTick", () => { lowest = Math.min(lowest, bot.entity.position.y); });
  const walking = leaveContainerTop(bot);
  try {
    await new Promise(resolve => setTimeout(resolve, 160));
    assert.ok(requests > 0, "asks the colleague to clear the newly blocked step");
    assert.equal(bot.getControlState("forward"), false);
    assert.equal(bot.getControlState("sneak"), true);
  } finally { delete bot.entities[77]; }
  assert.equal(await walking, true);
  assert.ok(lowest >= 63.87, `no shove or fall into the pit: ${lowest}`);
});

test("a chest wall over a pit: waves unload from a narrow ledge while failed workers at the chest, on a lid and in the pit get out of the way", { timeout: 150000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 2 });
  world.setMaxListeners(64);
  const chests = chestWall(world);
  const resources = ["diamond", "iron_ingot", "gold_ingot"];
  const groups = resources.map((name, index) => ({ id: `row-${index}`, name, filters: [name],
    chests: chests.filter((_, i) => Math.floor(i / 6) === index).map(chest => chest.position) }));
  const hub = createHub(), navs = [], workers = [], arrivals = [];
  const stats = { minDistance: Infinity };
  let opened = 0, maximumOpened = 0, edits = 0, lowest = Infinity, waitedTogether = 0;
  for (let i = 0; i < 8; i++) {
    const entry = crewWorker(world, hub, `unloader-${i}`, new Vec3(-13.5, 64, -7 + i * 2 + 0.5), navs);
    workers.push(entry);
    const { bot, controller } = entry;
    give(bot, resources[i % 3]);
    controller.configureStorage(groups);
    bot.on("diggingCompleted", () => edits++); bot.on("blockPlaced", () => edits++);
    bot.activateBlock = undefined;
    bot.openContainer = async block => {
      const eye = bot.entity.position.offset(0, 1.62, 0);
      assert.equal(blockingPlayers(bot, eye, block.position.offset(0.5, 0.5, 0.5)).length, 0, "no colleague stands in the crosshair");
      assert.ok(bot.entity.position.y >= 66.99, "unloads from the ledge");
      if (!arrivals.length) waitedTogether = workers.filter(e => e.bot.entity.position.x > -12.5).length;
      arrivals.push(i); opened++; maximumOpened = Math.max(maximumOpened, opened);
      let closed = false;
      return { close() { if (!closed) { opened--; closed = true; } }, async deposit() {
        await new Promise(resolve => setTimeout(resolve, 1200));
        bot.inventory.slots[36] = null; bot.updateHeldItem();
      } };
    };
  }
  // Three workers whose unloading already failed, where the screenshots show
  // them: in front of a chest, on top of the wall, at the bottom of the pit.
  const stranded = [new Vec3(3.5, 67, 0.5), new Vec3(4.5, 68.875, -2.5), new Vec3(6.5, 58, 2.5)].map((position, i) => {
    const entry = crewWorker(world, hub, `failed-${i}`, position, navs);
    entry.bot.launcherGathering = { busy: true, snapshot: { phase: "paused" } };
    entry.nav.setWarehouse(chests.map(chest => chest.position));
    return entry;
  });
  const everyone = [...workers, ...stranded];
  for (const { bot } of everyone) everyone.forEach(({ bot: other }, i) => { if (other !== bot) bot.entities[300 + i] = other.entity; });
  serverPushes(everyone, stats);
  workers[0].bot.on("physicsTick", () => { for (const { bot } of workers) lowest = Math.min(lowest, bot.entity.position.y); });
  t.signal.addEventListener("abort", () => everyone.forEach(({ bot }) => { void bot.pathfinder.stop(); }), { once: true });
  t.after(async () => {
    navs.forEach(nav => nav.dispose());
    await Promise.all(everyone.map(async ({ controller, bot, rig }) => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); }));
  });
  workers.forEach(({ controller }) => controller.enqueue({ kind: "deposit" }));
  const snapshot = () => everyone.map(({ bot, controller, nav, messages }) => `${bot.entity.username}:${controller.snapshot.phase}/${nav.warehouseState.phase}@${bot.entity.position.floored()}${nav.waiting ? " waiting" : ""}${bot.pathfinder.isPathing ? ` to ${bot.pathfinder.currentPath?.at(-1)?.exitPos?.floored?.() ?? "?"}` : ""} ${String(messages[messages.length - 1] ?? "").split("; ").pop().slice(0, 48)}`).join(" | ");
  const trace = process.env.WAREHOUSE_TRACE && setInterval(() => console.log("T " + snapshot()), 2500);
  t.after(() => clearInterval(trace));
  try { await Promise.all(workers.map(({ controller }) => waitForJob(controller, 130000))); }
  catch (error) { t.diagnostic(snapshot()); throw error; }
  t.diagnostic(`open at once=${maximumOpened}, together=${waitedTogether}, separation=${stats.minDistance.toFixed(2)}, lowest=${lowest}, stranded=${stranded.map(e => e.bot.entity.position.floored())}`);
  assert.equal(new Set(arrivals).size, 8, "every worker unloads");
  assert.ok(workers.every(({ controller }) => controller.snapshot.history[0]?.deposited === 5));
  // How many chests are open at the same instant depends on walking times;
  // Every ready worker gets an independent service turn, without a group bell.
  assert.ok(workers.every(({ messages }) => messages.some(m => String(m).includes("Свободный подход"))));
  assert.ok(waitedTogether >= 7, `${waitedTogether}/8 were already walking up when the first chest opened, not waiting far away for a turn`);
  assert.ok(lowest >= 63.99, `nobody is pushed off the ledge or the steps: lowest=${lowest}`);
  assert.equal(edits, 0, "the warehouse is used as built");
  const [atChest, onLid, inPit] = stranded.map(e => e.bot.entity.position);
  assert.ok(inPit.y >= 57.99 && inPit.y < 64, `the worker in the pit is not dragged anywhere: ${inPit}`);
  assert.ok(chests.every(chest => atChest.xzDistanceTo(chest.position) >= 4.8), `the failed worker left the chests: ${atChest}`);
  assert.ok(onLid.y < 68 && chests.every(chest => onLid.xzDistanceTo(chest.position) >= 4.8), `the worker on the lid left the wall: ${onLid}`);
});

for (const depth of [4, 10]) test(`escapes a ${depth}-block quarry directly underneath the warehouse without digging its floor`, { timeout: 50000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 2 });
  for (let x = -16; x <= 16; x++) for (let z = -16; z <= 16; z++)
    if (Math.abs(x) > 3 || Math.abs(z) > 3)
      for (let y = 64; y < 64 + depth; y++) world.setBlock(new Vec3(x, y, z), "sandstone");
  const level = 64 + depth + 1;
  for (let x = -1; x <= 6; x++) for (let z = -1; z <= 1; z++)
    world.setBlock(new Vec3(x, level - 1, z), "white_wool");
  const chest = world.setBlock(new Vec3(0, level, 0), "chest");
  const { rig, bot, controller, messages } = prepare("26.1.2", world);
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  t.signal.addEventListener("abort", () => { void bot.pathfinder.stop(); }, { once: true });
  const Item = require("prismarine-item")(bot.registry);
  for (const [name, slot] of [["diamond", 36], ["diamond_pickaxe", 37]]) {
    const item = new Item(bot.registry.itemsByName[name].id, 1); item.slot = slot; bot.inventory.slots[slot] = item;
  }
  bot.updateHeldItem(); bot.pathingUtil.refresh();
  let dug = 0, opened = false;
  const dig = bot.dig;
  bot.dig = (block, ...args) => { dug++; assert.equal(block.name, "sandstone", "only excavates terrain, preserving the warehouse"); return dig(block, ...args); };
  bot.activateBlock = undefined;
  bot.openContainer = async () => {
    opened = true;
    assert.ok(bot.entity.position.y >= level - 3, `must climb to a genuinely reachable chest face: ${bot.entity.position}`);
    return { close() {}, async deposit() { bot.inventory.slots[36] = null; bot.updateHeldItem(); } };
  };
  controller.configureStorage([{ id: "overhead", name: "Склад над карьером", filters: ["#all"], chests: [chest.position] }]);
  controller.enqueue({ kind: "deposit" });
  await waitForJob(controller, 45000);
  assert.equal(opened, true, messages.join("\n"));
  assert.ok(dug > 0);
  assert.equal(world.getBlock(chest.position.offset(0, -1, 0)).name, "white_wool");
});

for (const supplies of [false, true]) test(`unloads from a closed three-block desert pit ${supplies ? "with building supplies" : "without building supplies"}`, { timeout: 35000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 2 });
  for (let x = -12; x <= 24; x++) for (let z = -12; z <= 12; z++)
    if (Math.abs(x) > 2 || Math.abs(z) > 2)
      for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(x, y, z), "sandstone");
  const chest = world.setBlock(new Vec3(18, 67, 0), "chest");
  const { rig, bot, controller, messages } = prepare("26.1.2", world);
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  t.signal.addEventListener("abort", () => { void bot.pathfinder.stop(); }, { once: true });
  const Item = require("prismarine-item")(bot.registry);
  const put = (name, count, slot) => { const item = new Item(bot.registry.itemsByName[name].id, count); item.slot = slot; bot.inventory.slots[slot] = item; };
  put("diamond", 5, 36);
  put("diamond_pickaxe", 1, 38);
  if (supplies) put("cobblestone", 32, 37);
  bot.updateHeldItem(); bot.pathingUtil.refresh();
  let edits = 0, opened = false;
  bot.on("diggingCompleted", block => {
    edits++;
    assert.ok(block.position.xzDistanceTo(chest.position) >= 9, "preserve the warehouse");
  });
  bot.on("blockPlaced", () => edits++);
  bot.activateBlock = undefined;
  bot.openContainer = async () => {
    opened = true;
    assert.ok(bot.entity.position.y >= 67, `must escape before opening: ${bot.entity.position}`);
    return { close() {}, async deposit(type) {
      for (let slot = 0; slot < bot.inventory.slots.length; slot++)
        if (bot.inventory.slots[slot]?.type === type) bot.inventory.slots[slot] = null;
      bot.updateHeldItem();
    } };
  };
  controller.configureStorage([{ id: "pit-store", name: "Склад", filters: ["#all"], chests: [chest.position] }]);
  controller.enqueue({ kind: "deposit" });
  await waitForJob(controller, 32000);
  assert.equal(opened, true, JSON.stringify({ messages, snapshot: controller.snapshot }));
  assert.ok(edits > 0, "actually digs or builds out of the closed pit");
  assert.ok(controller.snapshot.history[0]?.deposited >= 5);
});

for (const overhead of [false, true]) test(`four workers escape the same enclosed quarry and unload in turn${overhead ? " with the warehouse directly overhead" : ""}`, { timeout: 75000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 2 });
  world.setMaxListeners(32);
  for (let x = -12; x <= 24; x++) for (let z = -12; z <= 12; z++)
    if (Math.abs(x) > 3 || Math.abs(z) > 3)
      for (let y = 64; y <= 67; y++) world.setBlock(new Vec3(x, y, z), "sandstone");
  if (overhead) for (let x = -1; x <= 6; x++) for (let z = -1; z <= 1; z++)
    world.setBlock(new Vec3(x, 68, z), "white_wool");
  const chest = world.setBlock(new Vec3(overhead ? 0 : 18, overhead ? 69 : 68, 0), "chest");
  const hub = createHub(), workers = [], navs = [], arrivals = [];
  let opened = 0, digs = 0;
  for (let i = 0; i < 4; i++) {
    const name = `quarry-${i}`;
    const crew = { request: async (op, input) => hub.handle(name, op, input), setBeat() {} };
    const entry = prepare("26.1.2", world, false, new Vec3(-1.5, 64, -2.5 + i * 1.6), {}, { crew });
    workers.push(entry);
    const { bot, controller } = entry;
    bot.entity.username = name;
    navs.push(createFleetNavigation(bot, crew, { pollMs: 80 }));
    const Item = require("prismarine-item")(bot.registry);
    for (const [slot, name, count] of [[36, "diamond", 5], [37, "diamond_pickaxe", 1]]) {
      const item = new Item(bot.registry.itemsByName[name].id, count); item.slot = slot; bot.inventory.slots[slot] = item;
    }
    bot.updateHeldItem(); bot.pathingUtil.refresh();
    bot.on("diggingCompleted", () => digs++);
    bot.activateBlock = undefined;
    bot.openContainer = async () => {
      assert.ok(opened++ < 4, "one wave of workers accesses storage");
      assert.ok(bot.entity.position.y >= (overhead ? 66 : 68), "climbed to a reachable warehouse approach");
      arrivals.push(i);
      return { close() { opened--; }, async deposit() { bot.inventory.slots[36] = null; bot.updateHeldItem(); } };
    };
    controller.configureStorage([{ id: "quarry", name: "Склад", filters: ["#all"], chests: [chest.position] }]);
  }
  for (const { bot } of workers) workers.forEach(({ bot: other }, i) => { if (bot !== other) bot.entities[100 + i] = other.entity; });
  t.signal.addEventListener("abort", () => { for (const { bot } of workers) void bot.pathfinder.stop(); }, { once: true });
  t.after(async () => {
    navs.forEach(nav => nav.dispose());
    await Promise.all(workers.map(async ({ controller, bot, rig }) => {
      await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics();
    }));
  });
  workers.forEach(({ controller }) => controller.enqueue({ kind: "deposit" }));
  try { await Promise.all(workers.map(({ controller }) => waitForJob(controller, 70000))); }
  catch (error) {
    t.diagnostic(JSON.stringify(workers.map(({ bot, controller, messages }, i) => ({ name: bot.entity.username,
      pos: bot.entity.position, phase: controller.snapshot.phase, state: navs[i].warehouseState,
      move: bot.pathfinder.currentMove?.exitPos, waiting: navs[i].waiting, status: messages.slice(-2) }))));
    throw error;
  }
  assert.deepEqual([...arrivals].sort(), [0, 1, 2, 3]);
  assert.ok(digs > 0, "the first worker cuts an actual exit");
  assert.ok(workers.every(({ controller }) => controller.snapshot.history[0]?.deposited === 5));
});

for (const crowded of [false, true]) test(`three workers queue, use existing warehouse steps and leave without building bridges${crowded ? " from a crowded entrance" : ""}`, { timeout: 60000 }, async t => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 2 });
  for (let x = 0; x <= 6; x++) for (let z = -2; z <= 2; z++)
    for (let y = 64; y <= 64 + x; y++) world.setBlock(new Vec3(x, y, z), "white_wool");
  const chest = world.setBlock(new Vec3(6, 71, 0), "chest");
  const hub = createHub(), order = [], workers = [], navigators = [];
  let opened = 0, edits = 0;
  for (let i = 0; i < 3; i++) {
    const name = `worker-${i}`;
    const crew = { request: async (op, input) => hub.handle(name, op, input), setBeat() {} };
    const entry = prepare("26.1.2", world, false, new Vec3(crowded ? -0.5 : -12.5, 64, (i - 1) * (crowded ? 1 : 3) + 0.5), {}, { crew });
    workers.push(entry);
    const { bot, controller } = entry;
    bot.entity.username = name;
    navigators.push(createFleetNavigation(bot, crew, { pollMs: 80 }));
    const Item = require("prismarine-item")(bot.registry);
    const diamonds = new Item(bot.registry.itemsByName.diamond.id, 5);
    diamonds.slot = 36; bot.inventory.slots[36] = diamonds; bot.updateHeldItem();
    bot.pathingUtil.refresh();
    bot.on("blockPlaced", () => edits++);
    bot.on("diggingCompleted", () => edits++);
    bot.on("pathGenerated", path => {
      assert.ok(path.path.every(move => !move.toPlace.length && !move.toBreak.length), "uses the prepared stair route");
    });
    bot.activateBlock = undefined;
    bot.openContainer = async () => {
      assert.ok(opened < 4, "bounded group uses separate physical approaches");
      opened++; order.push(i);
      let closed = false;
      return { close() { if (!closed) { opened--; closed = true; } },
        async deposit() { bot.inventory.slots[36] = null; bot.updateHeldItem(); } };
    };
    controller.configureStorage([{ id: "gems", name: "Склад", filters: ["#all"], chests: [chest.position] }]);
  }
  for (const { bot } of workers) for (const [i, other] of workers.entries())
    if (bot !== other.bot) bot.entities[100 + i] = other.bot.entity;
  t.signal.addEventListener("abort", () => { for (const { bot } of workers) void bot.pathfinder.stop(); }, { once: true });
  t.after(async () => {
    navigators.forEach(nav => nav.dispose());
    await Promise.all(workers.map(async ({ controller, bot, rig }) => {
      await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics();
    }));
  });
  workers.forEach(({ controller }) => controller.enqueue({ kind: "deposit" }));
  await Promise.all(workers.map(({ controller }) => waitForJob(controller, 55000)));
  assert.deepEqual([...order].sort(), [0, 1, 2]);
  assert.equal(edits, 0);
  assert.ok(workers.every(({ controller }) => controller.snapshot.history[0]?.deposited === 5));
});

for (const version of ['1.20.4', '26.1.2'])
  test(`mining collects coal from a raised niche under a low ceiling on ${version}`, { timeout: 20000 }, async (t) => {
    const world = createFlatWorld(version, 64, { renderDistance: 1 });
    for (let x = -1; x <= 5; x++) {
      for (const z of [-1, 1]) for (let y = 64; y <= 67; y++) world.setBlock(new Vec3(x, y, z), 'stone');
      world.setBlock(new Vec3(x, 66, 0), 'stone');
    }
    world.setBlock(new Vec3(1, 64, 0), 'stone');
    world.setBlock(new Vec3(2, 64, 0), 'stone');
    world.setBlock(new Vec3(2, 65, 0), 'coal_ore');
    const { rig, bot, controller, messages } = prepare(version, world, false, new Vec3(0.69, 64, 0.5));
    t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
    t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
    const Item = createRequire(new URL('./package.json', import.meta.url))('prismarine-item')(bot.registry);
    const pickaxe = new Item(bot.registry.itemsByName.diamond_pickaxe.id, 1);
    pickaxe.slot = 36; bot.inventory.slots[36] = pickaxe;
    let drop, collected = false;
    const dig = bot.dig;
    bot.dig = async (block, ...args) => {
      await dig(block, ...args);
      if (block.name !== 'coal_ore') return;
      drop = { id: 991, position: new Vec3(2.5, 65.2, 0.5), isValid: true,
        getDroppedItem: () => ({ name: 'coal', count: 1 }) };
      bot.entities[drop.id] = drop;
      bot.emit('itemDrop', drop);
    };
    bot.on('physicsTick', () => {
      if (!drop?.isValid || bot.entity.position.xzDistanceTo(drop.position) >= 0.8 ||
          drop.position.y - bot.entity.position.y > 1.5) return;
      collected = true;
      bot.emit('playerCollect', bot.entity, drop);
      drop.isValid = false;
      delete bot.entities[drop.id];
      bot.emit('entityGone', drop);
    });
    controller.enqueue({ kind: 'mine', blocks: 'coal_ore', radius: 8, count: 1 });
    await waitForJob(controller, 17000);
    assert.equal(collected, true, JSON.stringify({ position: bot.entity.position, messages, history: controller.snapshot.history }));
    assert.equal(controller.snapshot.history[0].collected, 1);
    assert.equal(bot.pathfinder.isPathing, false);
  });

for (const version of ['1.20.4', '26.1.2']) for (const roof of [false, true])
  test(`loot recovery descends a step${roof ? ' and clears the remaining head block' : ''} on ${version}`, { timeout: 18000 }, async (t) => {
    const floor = roof ? 63 : 64;
    const feet = floor + 1;
    const world = createFlatWorld(version, floor, { renderDistance: 1 });
    for (let x = -1; x <= 2; x++) for (let y = floor; y <= feet + 3; y++) {
      for (const z of [-1, 1]) world.setBlock(new Vec3(x, y, z), 'bedrock');
      if (x === -1 || x === 2) world.setBlock(new Vec3(x, y, 0), 'bedrock');
    }
    world.setBlock(new Vec3(0, floor, 0), 'stone');
    if (roof) world.setBlock(new Vec3(1, feet, 0), 'stone');
    world.setBlock(new Vec3(1, feet + 1, 0), 'copper_ore');
    const { rig, bot, controller, messages } = prepare(version, world, true, new Vec3(0.5, feet, 0.5));
    t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
    t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
    controller.settings.pickupTimeoutMs = 1500;
    const Item = createRequire(new URL('./package.json', import.meta.url))('prismarine-item')(bot.registry);
    const pick = new Item(bot.registry.itemsByName.netherite_pickaxe.id, 1, 0);
    pick.slot = 36; bot.inventory.slots[36] = pick; bot.updateHeldItem(); bot.pathingUtil.refresh();
    const drop = { id: 992, position: new Vec3(1.125, floor + 0.125, 0.5), isValid: true,
      getDroppedItem: () => ({ name: 'raw_copper', count: 3 }) };
    let lowest = feet;
    bot.on('blockUpdate', (before, after) => {
      if (before?.name !== 'copper_ore' || after?.name !== 'air') return;
      bot.entities[drop.id] = drop; bot.emit('itemDrop', drop);
    });
    bot.on('physicsTick', () => {
      lowest = Math.min(lowest, bot.entity.position.y);
      if (!bot.entities[drop.id]) return;
      // Actual player/item pickup AABB overlap: no teleport-to-goal shortcut.
      const pos = bot.entity.position;
      if (Math.abs(pos.x - drop.position.x) < 1.425 && Math.abs(pos.z - drop.position.z) < 1.425 &&
          pos.y - 0.5 < drop.position.y + 0.25 && pos.y + 2.3 > drop.position.y) {
        bot.emit('playerCollect', bot.entity, drop); drop.isValid = false;
        delete bot.entities[drop.id]; bot.emit('entityGone', drop);
      }
    });
    controller.enqueue({ kind: 'mine', blocks: 'copper_ore', count: 1, radius: 6 });
    await waitForJob(controller, 14000);
    assert.equal(controller.snapshot.history[0].collected, 3, JSON.stringify({ lowest, messages, history: controller.snapshot.history }));
    assert.equal(controller.snapshot.history[0].missedDrops, 0);
    assert.ok(lowest < feet - 0.2, `must descend toward the loot: y=${lowest}`);
    if (roof) assert.equal(world.getBlock(new Vec3(1, feet, 0)).name, 'air');
  });

test('vein continuity walks and clears the near vein before mining a visible remote one', { timeout: 20000 }, async (t) => {
  const world = createFlatWorld('26.1.2', 64, { renderDistance: 1 });
  world.setBlock(new Vec3(1, 64, 0), 'stone');
  const ore = [new Vec3(2, 65, 0), new Vec3(2, 64, 0), new Vec3(0, 64, 3)];
  for (const pos of ore) world.setBlock(pos, 'copper_ore');
  const { rig, bot, controller, messages } = prepare('26.1.2', world, true);
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const Item = createRequire(new URL('./package.json', import.meta.url))('prismarine-item')(bot.registry);
  const pick = new Item(bot.registry.itemsByName.netherite_pickaxe.id, 1, 0);
  pick.slot = 36; bot.inventory.slots[36] = pick; bot.updateHeldItem(); bot.pathingUtil.refresh();
  const mined = [];
  bot.on('blockUpdate', (before, after) => {
    if (before?.name === 'copper_ore' && after?.name === 'air') mined.push(before.position.toString());
  });
  controller.enqueue({ kind: 'mine', blocks: 'copper_ore', count: 3, radius: 8 });
  await waitForJob(controller, 16000);
  assert.deepEqual(mined, ore.map(pos => pos.toString()), messages.join('\n'));
  assert.equal(controller.snapshot.history[0].mined, 3);
});

test('mining clears a falling gravel column beside the bot without getting trapped', { timeout: 20000 }, async (t) => {
  const world = createFlatWorld('26.1.2', 64, { renderDistance: 1 });
  for (let x = -1; x <= 8; x++) {
    for (const z of [-1, 1]) for (let y = 64; y <= 69; y++) world.setBlock(new Vec3(x, y, z), 'bedrock');
    world.setBlock(new Vec3(x, 66, 0), 'bedrock');
  }
  world.setBlock(new Vec3(-1, 64, 0), 'bedrock');
  world.setBlock(new Vec3(-1, 65, 0), 'bedrock');
  world.setBlock(new Vec3(1, 64, 0), 'stone');
  for (const y of [65, 66, 67]) world.setBlock(new Vec3(1, y, 0), 'gravel');
  world.setBlock(new Vec3(6, 64, 0), 'coal_ore');
  const { rig, bot, controller, messages } = prepare('26.1.2', world, true);
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
  const Item = createRequire(new URL('./package.json', import.meta.url))('prismarine-item')(bot.registry);
  for (const [slot, name] of [[36, 'diamond_pickaxe'], [37, 'diamond_shovel']]) {
    const item = new Item(bot.registry.itemsByName[name].id, 1);
    item.slot = slot; bot.inventory.slots[slot] = item;
  }
  let falling, gravel = 0;
  const update = (old, block) => {
    if (!block?.position.equals(new Vec3(1, 64, 0)) || block.name !== 'air') return;
    clearTimeout(falling);
    falling = setTimeout(() => {
      // Server block updates after the falling entities land, rather than
      // leaving the original static gravel arrangement in the test world.
      let count = 0;
      for (let y = 65; y <= 67; y++) if (world.getBlock(new Vec3(1, y, 0)).name === 'gravel') {
        world.setBlock(new Vec3(1, y, 0), 'air'); count++;
      }
      for (let y = 64; y < 64 + count; y++) world.setBlock(new Vec3(1, y, 0), 'gravel');
    }, 100);
  };
  // Count real mining starts, excluding block updates caused by gravity.
  bot._client.write = (name, packet) => {
    if (name === 'block_dig' && packet.status === 0 && bot.blockAt(packet.location)?.name === 'gravel') gravel++;
  };
  world.on('blockUpdate', update);
  t.after(() => { clearTimeout(falling); world.off('blockUpdate', update); });
  controller.enqueue({ kind: 'mine', blocks: 'coal_ore', radius: 8, count: 1 });
  await waitForJob(controller, 17000);
  assert.equal(controller.snapshot.history[0].mined, 1, JSON.stringify({ messages, history: controller.snapshot.history }));
  assert.equal(gravel, 3, `gravel cleared=${gravel}`);
  assert.ok(bot.entity.position.x >= 2, `position=${bot.entity.position}`);
});

test('26.1.2 command-enchanted axe and shovel load after login and dig with Efficiency 20', { timeout: 8000 }, async (t) => {
  const world = createFlatWorld('26.1.2', 64, { renderDistance: 1 });
  const target = world.setBlock(new Vec3(1, 64, 0), 'dirt');
  const { rig, bot, controller, messages } = prepare('26.1.2', world, true);
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const runtime = createRequire(new URL('./package.json', import.meta.url));
  const Item = runtime('prismarine-item')(bot.registry);
  for (const [slot, name] of [[36, 'netherite_axe'], [37, 'netherite_shovel']]) {
    const item = Item.fromNotch({ itemCount: 1, itemId: bot.registry.itemsByName[name].id,
      components: [{ type: 'enchantments', data: { enchantments: [
        { id: bot.registry.enchantmentsByName.efficiency.id, level: 20 },
        { id: bot.registry.enchantmentsByName.unbreaking.id, level: 100 },
      ] } }], removeComponents: [] });
    item.slot = slot;
    bot.inventory.slots[slot] = item;
    bot.inventory.emit('updateSlot', slot, null, item);
  }
  bot.updateHeldItem(); bot.pathingUtil.refresh();
  let usedTool, duration;
  bot._client.write = (name, packet) => {
    if (name === 'block_dig' && packet.status === 0) {
      usedTool = bot.heldItem.name;
      duration = bot.digTime(target);
    }
  };
  controller.enqueue({ kind: 'quarry', area: { min: target.position, max: target.position } });
  await waitForJob(controller, 6000);
  assert.equal(usedTool, 'netherite_shovel', messages.join('\n'));
  assert.ok(duration <= 50, `native dig duration=${duration}ms`);
  assert.equal(world.getBlock(target.position).name, 'air');
  assert.equal(controller.snapshot.history[0].mined, 1);
  assert.deepEqual(bot.inventory.slots[37].enchants, [{ name: 'efficiency', lvl: 20 }, { name: 'unbreaking', lvl: 100 }]);
});

for (const version of ["1.20.4", "26.1.2"])
  test(`pickup physically reaches a moved diamond drop above the feet on ${version}`, { timeout: 12000 }, async (t) => {
    const world = createFlatWorld(version, 64, { renderDistance: 1 });
    const { rig, bot, controller } = prepare(version, world);
    t.after(async () => {
      await controller.dispose();
      await bot.pathfinder.destroy();
      rig.stopPassivePhysics();
    });
    const drop = { id: 990, position: new Vec3(4.5, 65.4, 0.5), isValid: true,
      getDroppedItem: () => ({ name: "diamond", count: 3 }) };
    bot.entities[drop.id] = drop;
    let moved = false, collectedAt;
    bot.on("physicsTick", () => {
      if (!drop.isValid) return;
      const feet = bot.entity.position;
      if (!moved && feet.x > 1.5) {
        moved = true;
        drop.position.x = version === "26.1.2" ? 6.001 : 6.5;
        drop.position.z = version === "26.1.2" ? 0.001 : 0.5;
        bot.emit("entityMoved", drop);
      }
      if (Math.hypot(feet.x - drop.position.x, feet.z - drop.position.z) < 0.8 &&
          drop.position.y - feet.y < 1.5) {
        collectedAt = feet.clone();
        bot.emit("playerCollect", bot.entity, drop);
        drop.isValid = false;
        delete bot.entities[drop.id];
        bot.emit("entityGone", drop);
      }
    });
    controller.enqueue({ kind: "collect", item: "diamond", radius: 8 });
    await waitForJob(controller, 10000);
    assert.equal(moved, true);
    assert.ok(collectedAt?.x > 5.2, `position=${collectedAt}`);
    assert.ok(Math.hypot(collectedAt.x - drop.position.x, collectedAt.z - drop.position.z) < 0.8);
    assert.equal(controller.snapshot.history[0].collected, 3);
    assert.equal(controller.snapshot.history[0].outcome, "готово");
  });

test(
  "ore mining lands before Mineflayer fixes the dig duration",
  { timeout: 6000 },
  async (t) => {
    const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
    const ore = world.setBlock(new Vec3(1, 64, 0), "diamond_ore");
    const { rig, bot, controller } = prepare("26.1.2", world, true, new Vec3(0.5, 64.9, 0.5));
    t.after(async () => {
      await controller.dispose();
      await bot.pathfinder.destroy();
      rig.stopPassivePhysics();
    });
    const runtime = createRequire(new URL("./package.json", import.meta.url));
    const Item = createRequire(runtime.resolve("mineflayer"))("prismarine-item")(bot.registry);
    const pick = new Item(bot.registry.itemsByName.iron_pickaxe.id, 1, 0);
    pick.slot = 36; bot.inventory.slots[36] = pick;
    bot.updateHeldItem(); bot.pathingUtil.refresh();
    bot.entity.onGround = false;
    bot.entity.velocity.y = -0.1;
    bot.setControlState("jump", true);
    let started = 0, duration = 0, grounded = false, jumping = true;
    bot._client.write = (name, packet) => {
      if (name !== "block_dig") return;
      if (packet.status === 0) {
        started = performance.now();
        grounded = bot.entity.onGround;
        jumping = bot.getControlState("jump");
      } else if (packet.status === 2) duration = performance.now() - started;
    };
    bot.findBlocks = () => bot.blockAt(ore.position).name === "diamond_ore" ? [ore.position] : [];
    controller.enqueue({ kind: "mine", blocks: "diamond", count: 1, radius: 8 });
    await waitForJob(controller, 5000);
    assert.equal(controller.snapshot.history[0].mined, 1);
    assert.equal(grounded, true, "start the dig after the actual landing");
    assert.equal(jumping, false, "hold jump released during mining");
    assert.ok(duration >= 500 && duration < 1100, `ore dig took ${duration}ms instead of the grounded duration`);
  },
);

test(
  "an adjacent spruce trunk is chopped through its visible face without a detour",
  { timeout: 12000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 64, { renderDistance: 2 });
    for (let y = 64; y <= 67; y++) world.setBlock(new Vec3(1, y, 0), "spruce_log");
    const { rig, bot, controller } = prepare(version, world, true);
    t.after(async () => {
      await controller.dispose();
      await bot.pathfinder.destroy();
      rig.stopPassivePhysics();
    });
    const runtime = createRequire(new URL("./package.json", import.meta.url));
    const Item = createRequire(runtime.resolve("mineflayer"))("prismarine-item")(bot.registry);
    const axe = new Item(bot.registry.itemsByName.iron_axe.id, 1, 0);
    axe.slot = 36;
    bot.inventory.slots[36] = axe;
    bot.updateHeldItem();
    bot.pathingUtil.refresh();
    let detours = 0;
    bot.on("goalSet", () => detours++);
    const packets = [];
    bot._client.write = (name, payload) => {
      if (name === "block_dig") packets.push(payload);
    };
    bot.findBlocks = (options) =>
      [new Vec3(1, 64, 0)].filter((position) =>
        options.matching.includes(bot.blockAt(position).type),
      );
    assert.equal(
      bot.canSeeBlock(bot.blockAt(new Vec3(1, 64, 0))),
      false,
      "the upper log hides the lower log's center, but its side is exposed",
    );
    controller.enqueue({ kind: "forest", radius: 8, count: 1, scaffold: false });
    await waitForJob(controller, 8000);
    assert.equal(controller.snapshot.history[0].mined, 1);
    assert.equal(detours, 0, "start chopping from the current position");
    assert.deepEqual(
      packets.map((packet) => [packet.status, packet.face]),
      [
        [0, 4],
        [2, 4],
      ],
      "Mineflayer sends start and finish digging against the exposed west face",
    );
  },
);

for (const version of ["1.20.4", "26.1.2"])
  test(
    `quarry really walks, aims and digs through the bundled navigator on ${version}`,
    { timeout: 16000 },
    async (t) => {
      const world = createFlatWorld(version, 64, { renderDistance: 2 });
      for (const x of [8, 9]) for (const y of [64, 65]) world.setBlock(new Vec3(x, y, 0), "dirt");
      const { rig, bot, controller } = prepare(version, world);
      t.after(async () => {
        await controller.dispose();
        await bot.pathfinder.destroy();
        rig.stopPassivePhysics();
      });
      controller.enqueue({
        kind: "quarry",
        area: { min: new Vec3(8, 64, 0), max: new Vec3(9, 65, 0) },
      });
      await waitForJob(controller);
      assert.equal(controller.snapshot.history[0].mined, 4);
      assert.equal(controller.snapshot.history[0].outcome, "готово");
      assert.ok(bot.entity.position.x > 3);
      for (const x of [8, 9])
        for (const y of [64, 65]) assert.equal(world.getBlock(new Vec3(x, y, 0)).name, "air");
      assert.equal(bot.pathfinder.defaultMoveSettings.canDig, false);
    },
  );

test(
  "ore approach actually digs blockers and counts only the selected ore",
  { timeout: 30000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 64, { renderDistance: 2 });
    for (let x = 3; x <= 5; x++)
      for (let y = 64; y <= 66; y++)
        for (let z = -1; z <= 1; z++) world.setBlock(new Vec3(x, y, z), "stone");
    const ore = world.setBlock(new Vec3(4, 64, 0), "diamond_ore");
    const { rig, bot, controller, messages } = prepare(version, world);
    t.after(async () => {
      await controller.dispose();
      await bot.pathfinder.destroy();
      rig.stopPassivePhysics();
    });
    const runtime = createRequire(new URL("./package.json", import.meta.url));
    const mineflayerRequire = createRequire(runtime.resolve("mineflayer"));
    const Item = mineflayerRequire("prismarine-item")(bot.registry);
    const pick = new Item(bot.registry.itemsByName.iron_pickaxe.id, 1, 0);
    bot.inventory.slots[36] = pick;
    pick.slot = 36;
    bot.updateHeldItem();
    bot.pathingUtil.refresh();
    controller.settings.operationTimeoutMs = 20000;
    bot.findBlocks = (options) => {
      const current = bot.blockAt(ore.position);
      return options.matching.includes(current.type) &&
        (!options.useExtraInfo || options.useExtraInfo(current))
        ? [ore.position]
        : [];
    };
    const digNames = [];
    bot.on("diggingCompleted", (block) => digNames.push(`${block.name}:${block.position}`));
    controller.enqueue({ kind: "mine", blocks: "diamond", count: 1, radius: 16 });
    await waitForJob(controller, 24000);
    assert.equal(
      controller.snapshot.history[0].mined,
      1,
      JSON.stringify({
        snapshot: controller.snapshot,
        messages,
        digNames,
        position: bot.entity.position,
      }),
    );
    assert.equal(world.getBlock(ore.position).name, "air");
    assert.ok(digNames.length > 1, JSON.stringify(digNames));
  },
);

test('a full inventory interrupts a real excavation route for storage without losing its ore task', { timeout: 25000 }, async (t) => {
  const version = '26.1.2';
  const world = createFlatWorld(version, 64, { renderDistance: 1 });
  for (let x = 3; x <= 5; x++) for (let y = 64; y <= 66; y++)
    for (let z = -1; z <= 1; z++) world.setBlock(new Vec3(x, y, z), 'stone');
  world.setBlock(new Vec3(4, 64, 0), 'diamond_ore');
  world.setBlock(new Vec3(-2, 64, 0), 'chest');
  const { rig, bot, controller, messages } = prepare(version, world);
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const Item = require('prismarine-item')(bot.registry);
  const pick = new Item(bot.registry.itemsByName.netherite_pickaxe.id, 1, 0);
  Object.defineProperty(pick, 'enchants', { value: [{ name: 'efficiency', lvl: 5 }] });
  pick.slot = 36; bot.inventory.slots[36] = pick;
  bot.updateHeldItem(); bot.pathingUtil.refresh();
  let filled = false, full = false, deposited = 0;
  bot.inventory.emptySlotCount = () => full ? 2 : 30;
  bot.on('pathGenerated', (path) => {
    if (filled || controller.snapshot.phase !== 'move' || !path.path.some(move => move.toBreak.length)) return;
    filled = full = true;
    const stone = new Item(bot.registry.itemsByName.cobblestone.id, 64, 0);
    stone.slot = 37; bot.inventory.slots[37] = stone;
  });
  bot.activateBlock = undefined;
  bot.openContainer = async () => ({ close() {}, async deposit(_type, _metadata, count) {
    deposited += count; full = false; bot.inventory.slots[37] = null;
  } });
  controller.configureStorage([{ id: 'all', name: 'Склад', filters: ['#all'], chests: [{ x: -2, y: 64, z: 0 }] }]);
  controller.enqueue({ kind: 'mine', blocks: 'diamond', count: 1, radius: 8 });
  await waitForJob(controller, 20000);
  assert.equal(filled, true);
  assert.equal(deposited, 64);
  assert.equal(controller.snapshot.history[0].mined, 1, messages.join('\n'));
  assert.equal(controller.snapshot.history[0].outcome, 'готово', messages.join('\n'));
  assert.equal(messages.some(message => message.includes('пропуск цели')), false, messages.join('\n'));
});

test('storage uses the same configured three-block descent as a successful come route', { timeout: 25000 }, async (t) => {
  const world = createFlatWorld('26.1.2', 61, { renderDistance: 2 });
  const start = new Vec3(0.5, 64, 0.5);
  for (let x = -1; x <= 0; x++) for (let z = -1; z <= 1; z++)
    world.setBlock(new Vec3(x, 63, z), 'bedrock');
  for (let x = 4; x <= 15; x++) for (let z = -1; z <= 1; z++)
    for (let y = 61; y < Math.min(69, 58 + x); y++) world.setBlock(new Vec3(x, y, z), 'bedrock');
  world.setBlock(new Vec3(14, 69, 0), 'chest');
  const { rig, bot, controller, messages } = prepare('26.1.2', world, false, start, { maxDropDown: 3 });
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const { goals } = require('../pathfinder.cjs');
  await bot.pathfinder.goto(new goals.GoalNear(14.5, 69, 0.5, 3));
  assert.ok(bot.entity.position.y >= 68, `come reached ${bot.entity.position}`);
  bot.entity.position.set(start.x, start.y, start.z); bot.entity.velocity.set(0, 0, 0);
  await bot.waitForTicks(2);
  const Item = require('prismarine-item')(bot.registry);
  const diamonds = new Item(bot.registry.itemsByName.diamond.id, 5, 0);
  diamonds.slot = 36; bot.inventory.slots[36] = diamonds; bot.updateHeldItem();
  let deposited = 0;
  bot.activateBlock = undefined;
  bot.openContainer = async () => ({ close() {}, async deposit(_type, _metadata, count) {
    deposited += count; bot.inventory.slots[36] = null; bot.updateHeldItem();
  } });
  controller.configureStorage([{ id: 'all', name: 'Склад', filters: ['#all'], chests: [{ x: 14, y: 69, z: 0 }] }]);
  controller.enqueue({ kind: 'deposit' });
  await waitForJob(controller, 15000);
  assert.equal(deposited, 5, messages.join('\n'));
  assert.equal(bot.pathfinder.defaultMoveSettings.maxDropDown, 3);
});

for (const automatic of [false, true]) test(`storage replans its original destination after exhausted movement recovery${automatic ? ' during automatic unloading beyond 32 blocks' : ''}`, { timeout: automatic ? 30000 : 15000 }, async (t) => {
  const chestX = automatic ? 80 : 18;
  const world = createFlatWorld('26.1.2', 64, { renderDistance: 1 });
  world.setBlock(new Vec3(chestX, 64, 0), 'chest');
  // The fake world's chunk generator only persists loaded columns. Model the
  // server supplying the saved chest when its distant column arrives.
  const loadChest = (point) => {
    if (point.x === chestX && point.z === 0) world.setBlock(new Vec3(chestX, 64, 0), 'chest');
  };
  if (automatic) world.on('chunkColumnLoad', loadChest);
  t.after(() => world.off('chunkColumnLoad', loadChest));
  const { rig, bot, controller, messages } = prepare('26.1.2', world, false, new Vec3(0.5, 64, 0.5), { allowSprinting: true });
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const Item = require('prismarine-item')(bot.registry);
  const diamonds = new Item(bot.registry.itemsByName.diamond.id, 5, 0);
  diamonds.slot = 36; bot.inventory.slots[36] = diamonds; bot.updateHeldItem();
  let full = automatic, deposited = 0, executions = 0;
  bot.inventory.emptySlotCount = () => full ? 2 : 30;
  const perform = bot.pathfinder.perform.bind(bot.pathfinder);
  bot.pathfinder.perform = async (path, goal, entry, ...rest) =>
    perform(path, goal, ++executions <= 3 ? 3 : entry, ...rest);
  bot.activateBlock = undefined;
  bot.openContainer = async () => ({ close() {}, async deposit(_type, _metadata, count) {
    deposited += count; full = false; bot.inventory.slots[36] = null; bot.updateHeldItem();
  } });
  controller.configureStorage([{ id: 'all', name: 'Все остальное', filters: ['#all'], chests: [{ x: chestX, y: 64, z: 0 }] }]);
  controller.enqueue(automatic ? { kind: 'mine', blocks: 'diamond', radius: 2 } : { kind: 'deposit' });
  await waitForJob(controller, automatic ? 25000 : 10000);
  assert.equal(deposited, 5, messages.join('\n'));
  assert.ok(executions > 3);
  assert.equal(controller.snapshot.history[0].deposited, 5);
  if (automatic) assert.ok(bot.entity.position.x > 75, 'unloading is independent of the two-block mining radius');
});

test("forest reaches a tall trunk using inventory scaffolding", { timeout: 35000 }, async (t) => {
  const version = "26.1.2";
  const world = createFlatWorld(version, 64, { renderDistance: 2 });
  for (let y = 64; y <= 71; y++) world.setBlock(new Vec3(5, y, 0), "oak_log");
  const { rig, bot, controller, messages } = prepare(version, world);
  t.after(async () => {
    await controller.dispose();
    await bot.pathfinder.destroy();
    rig.stopPassivePhysics();
  });
  controller.settings.operationTimeoutMs = 25000;
  const runtime = createRequire(new URL("./package.json", import.meta.url));
  const mineflayerRequire = createRequire(runtime.resolve("mineflayer"));
  const Item = mineflayerRequire("prismarine-item")(bot.registry);
  for (const [name, count, slot] of [
    ["iron_axe", 1, 36],
    ["dirt", 32, 37],
  ]) {
    const item = new Item(bot.registry.itemsByName[name].id, count, 0);
    item.slot = slot;
    bot.inventory.slots[slot] = item;
  }
  bot.updateHeldItem();
  bot.pathingUtil.refresh();
  bot.findBlocks = (options) =>
    Array.from({ length: 8 }, (_, i) => new Vec3(5, 64 + i, 0)).filter((pos) => {
      const block = bot.blockAt(pos);
      return (
        options.matching.includes(block.type) &&
        (!options.useExtraInfo || options.useExtraInfo(block))
      );
    });
  let placements = 0;
  bot.on("blockPlaced", () => {
    placements++;
  });
  controller.enqueue({ kind: "forest", radius: 16, count: 0, scaffold: true });
  await waitForJob(controller, 30000);
  assert.equal(
    controller.snapshot.history[0].mined,
    8,
    JSON.stringify({ snapshot: controller.snapshot, messages, position: bot.entity.position }),
  );
  assert.ok(placements > 0);
  assert.ok(bot.entity.position.y <= 64.1, `return to ground: ${bot.entity.position}`);
  assert.equal(bot.entity.onGround, true);
});

test(
  "spruce forest starts at the reachable trunk without requiring scaffold blocks",
  { timeout: 20000 },
  async (t) => {
    const version = "26.1.2",
      world = createFlatWorld(version, 64, { renderDistance: 2 });
    const positions = [];
    for (let y = 64; y <= 71; y++) {
      const pos = new Vec3(5, y, 0);
      world.setBlock(pos, "spruce_log");
      positions.push(pos);
    }
    for (let x = 4; x <= 6; x++)
      for (let z = -1; z <= 1; z++)
        if (x !== 5 || z !== 0) world.setBlock(new Vec3(x, 70, z), "spruce_leaves");
    const { rig, bot, controller, messages } = prepare(version, world);
    t.after(async () => {
      await controller.dispose();
      await bot.pathfinder.destroy();
      rig.stopPassivePhysics();
    });
    const runtime = createRequire(new URL("./package.json", import.meta.url));
    const Item = createRequire(runtime.resolve("mineflayer"))("prismarine-item")(bot.registry);
    const axe = new Item(bot.registry.itemsByName.iron_axe.id, 1, 0);
    axe.slot = 36;
    bot.inventory.slots[36] = axe;
    bot.updateHeldItem();
    bot.pathingUtil.refresh();
    bot.findBlocks = (options) =>
      positions.filter((pos) => {
        const block = bot.blockAt(pos);
        return (
          options.matching.includes(block.type) &&
          (!options.useExtraInfo || options.useExtraInfo(block))
        );
      });
    controller.enqueue({ kind: "forest", radius: 16, count: 1 });
    await waitForJob(controller, 16000);
    assert.equal(
      controller.snapshot.history[0].mined,
      1,
      JSON.stringify({ snapshot: controller.snapshot, messages }),
    );
    assert.ok(
      [64, 65].some((y) => world.getBlock(new Vec3(5, y, 0)).name === "air"),
      "clear the reachable lower trunk",
    );
    assert.equal(world.getBlock(new Vec3(5, 71, 0)).name, "spruce_log");
  },
);

test(
  "deep mining restores movement and leaves reversible stairs with headroom",
  { timeout: 300000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 24, { renderDistance: 1 });
    for (let x = -9; x <= 9; x++)
      for (let z = -9; z <= 9; z++)
        for (let y = 24; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "stone");
    world.setBlock(new Vec3(2, 27, 0), "diamond_ore");
    const { rig, bot, controller, messages } = prepare(version, world, false, new Vec3(0.5, 64, 0.5), { canDig: true });
    t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
    t.after(async () => {
      await controller.dispose();
      await bot.pathfinder.destroy();
      rig.stopPassivePhysics();
    });
    const runtime = createRequire(new URL("./package.json", import.meta.url));
    const Item = createRequire(runtime.resolve("mineflayer"))("prismarine-item")(bot.registry);
    const pick = new Item(bot.registry.itemsByName.netherite_pickaxe.id, 1, 0);
    pick.slot = 36;
    Object.defineProperty(pick, "enchants", { value: [{ name: "efficiency", lvl: 5 }] });
    bot.inventory.slots[36] = pick;
    bot.updateHeldItem();
    bot.pathingUtil.refresh();
    let dug = 0,
      firstDig;
    const start = Date.now();
    const dig = bot.dig;
    bot.dig = async (...args) => {
      firstDig ??= Date.now() - start;
      dug++;
      return dig(...args);
    };
    controller.enqueue({ kind: "mine", blocks: "diamond", count: 1, radius: 8 });
    // A full-width reversible descent removes substantially more stone than
    // the former one-wide shaft. Bound useful work separately from return.
    await waitForJob(controller, 200000);
    assert.equal(controller.snapshot.history[0].mined, 1, messages.join("\n"));
    assert.ok(bot.entity.position.y < 32, `position=${bot.entity.position}`);
    assert.ok(dug > 30, `dug=${dug}`);
    assert.ok(firstDig < 5000, `firstDig=${firstDig}`);
    assert.equal(world.getBlock(new Vec3(2, 27, 0)).name, "air");
    await controller.stop();
    assert.equal(bot.pathfinder.defaultMoveSettings.canDig, true);
    assert.equal(bot.pathfinder.defaultMoveSettings.allowExcavatedDescent, false);
    assert.deepEqual(bot.pathfinder.defaultMoveSettings.exclusionAreasBreak, []);
    assert.deepEqual(bot.pathfinder.defaultMoveSettings.exclusionAreasPlace, []);
    const scaffold = new Item(bot.registry.itemsByName.cobblestone.id, 64, 0);
    scaffold.slot = 37; bot.inventory.slots[37] = scaffold; bot.pathingUtil.refresh();
    const beforeCome = dug;
    const comeStarted = Date.now();
    let comeSearches = 0, searchMs = 0;
    const resets = [], results = [];
    bot.on('resetPath', reason => resets.push(reason));
    const getPathTo = bot.pathfinder.getPathTo.bind(bot.pathfinder);
    bot.pathfinder.getPathTo = async function * (...args) {
      comeSearches++;
      const started = Date.now();
      try {
        for await (const result of getPathTo(...args)) {
          if (!['partial', 'partialSuccess'].includes(result.result.status)) results.push({ status: result.result.status, steps: result.result.path.length });
          yield result;
        }
      }
      finally { searchMs += Date.now() - started; }
    };
    // Use the bundled goal class, just as the worker's come command does.
    const bundled = runtime('./pathfinder.cjs');
    bot.pathfinder.setMoveOptions({ canDig: false, canPlace: false });
    await bot.pathfinder.goto(new bundled.goals.GoalNear(0.5, 64, 0.5, 1));
    assert.ok(bot.entity.position.distanceTo(new Vec3(0.5, 64, 0.5)) <= 1.1, `position=${bot.entity.position}`);
    assert.equal(dug, beforeCome, 'ordinary search climbs the excavated stairs without digging or building');
    t.diagnostic(`come: searches=${comeSearches}, planning=${searchMs}ms, travel=${Date.now() - comeStarted}ms, dug=${dug - beforeCome}, resets=${JSON.stringify(resets)}, results=${JSON.stringify(results)}`);
    assert.ok(comeSearches <= 4, 'terrain confirmation and final centering may refresh the route, without a new search per stair');
    assert.ok(searchMs < 3000, `planning=${searchMs}ms`);
    // Thirty-seven physical jumps still take time;
    // the planner must not add a timeout and a new search to every stair.
    assert.ok(Date.now() - comeStarted < 90000, `come duration=${Date.now() - comeStarted}`);
  },
);

test('mined drops below a head-height obstruction are reached without a manual push', { timeout: 15000 }, async (t) => {
  const world = createFlatWorld('26.1.2', 62, { renderDistance: 1 });
  for (let x = -1; x <= 3; x++) for (let z = -1; z <= 1; z++) {
    for (let y = 62; y <= 66; y++) world.setBlock(new Vec3(x, y, z), 'stone');
    if (z === 0) for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(x, y, z), 'air');
  }
  world.setBlock(new Vec3(1, 65, 0), 'stone');
  world.setBlock(new Vec3(1, 63, 0), 'diamond_ore');
  const { rig, bot, controller, messages } = prepare('26.1.2', world);
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const Item = require('prismarine-item')(bot.registry);
  const pick = new Item(bot.registry.itemsByName.netherite_pickaxe.id, 1, 0);
  pick.slot = 36; bot.inventory.slots[36] = pick; bot.updateHeldItem(); bot.pathingUtil.refresh();
  const drop = { id: 991, position: new Vec3(1.5, 63.15, 0.5), isValid: true,
    getDroppedItem: () => ({ name: 'diamond', count: 1 }) };
  bot.on('blockUpdate', (before, after) => {
    if (before?.name !== 'diamond_ore' || after?.name !== 'air') return;
    bot.entities[drop.id] = drop; bot.emit('itemDrop', drop);
  });
  bot.on('physicsTick', () => {
    if (!bot.entities[drop.id]) return;
    const feet = bot.entity.position;
    if (feet.xzDistanceTo(drop.position) < 0.8 && Math.abs(feet.y - drop.position.y) < 0.6) {
      bot.emit('playerCollect', bot.entity, drop); drop.isValid = false;
      delete bot.entities[drop.id]; bot.emit('entityGone', drop);
    }
  });
  controller.enqueue({ kind: 'mine', blocks: 'diamond', count: 1, radius: 6 });
  await waitForJob(controller, 12000);
  assert.equal(controller.snapshot.history[0].collected, 1, messages.join('\n'));
  assert.equal(controller.snapshot.history[0].missedDrops, 0);
  assert.equal(world.getBlock(new Vec3(1, 65, 0)).name, 'air', 'clear the head obstruction before descending');
});

test('forest recovers from a terrain fall and continues to the trunk', { timeout: 25000 }, async (t) => {
  const version = '26.1.2';
  const world = createFlatWorld(version, 64, { renderDistance: 2 });
  for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(9, y, 0), 'spruce_log');
  const { rig, bot, controller, messages } = prepare(version, world);
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  bot.findBlocks = options => [64, 65, 66].map(y => new Vec3(9, y, 0)).filter(position =>
    options.matching.includes(bot.blockAt(position).type) && (!options.useExtraInfo || options.useExtraInfo(bot.blockAt(position))));
  const runtime = createRequire(new URL('./package.json', import.meta.url));
  const Item = createRequire(runtime.resolve('mineflayer'))('prismarine-item')(bot.registry);
  const axe = new Item(bot.registry.itemsByName.iron_axe.id, 1, 0);
  axe.slot = 36; bot.inventory.slots[36] = axe; bot.updateHeldItem(); bot.pathingUtil.refresh();
  let fell = false;
  bot.on('physicsTick', () => {
    if (fell || !bot.pathfinder.isPathing || bot.entity.position.x < 0.8) return;
    fell = true;
    for (let x = 0; x <= 2; x++) for (let z = -1; z <= 1; z++) {
      world.clearBlock(new Vec3(x, 63, z));
      world.setBlock(new Vec3(x, 61, z), 'stone');
    }
    for (let z = -1; z <= 1; z++) {
      world.clearBlock(new Vec3(3, 63, z));
      world.setBlock(new Vec3(3, 62, z), 'stone');
    }
  });
  controller.enqueue({ kind: 'forest', count: 1, radius: 16, scaffold: false });
  await waitForJob(controller, 22000);
  assert.equal(fell, true);
  assert.equal(controller.snapshot.history[0].mined, 1, messages.join('\n'));
  assert.equal(bot.pathfinder.isPathing, false);
});

for (const { version, underground = false } of [{ version: '1.20.4' }, { version: '26.1.2' }, { version: '26.1.2', underground: true }]) test(`iron vein approach keeps its plan with real digging packets ${underground ? 'below ground' : 'in a level tunnel'} on ${version}`, { timeout: 40000 }, async (t) => {
  const world = createFlatWorld(version, underground ? 59 : 64, { renderDistance: 2 });
  if (underground) {
    for (let x = -4; x <= 10; x++) for (let z = -4; z <= 4; z++) for (let y = 59; y <= 63; y++) world.setBlock(new Vec3(x, y, z), 'stone');
  } else for (let x = -1; x <= 12; x++) {
    for (const z of [-1, 1]) for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(x, y, z), 'bedrock');
    world.setBlock(new Vec3(x, 66, 0), 'bedrock');
    if (x >= 1 && x <= 7) for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(x, y, 0), x <= 2 ? 'dirt' : 'stone');
  }
  if (!underground) for (const y of [64, 65]) world.setBlock(new Vec3(-1, y, 0), 'bedrock');
  const oreX = underground ? 5 : 8, oreY = underground ? 60 : 64;
  for (const pos of [new Vec3(oreX, oreY, 0), new Vec3(oreX, oreY + 1, 0), new Vec3(oreX + 1, oreY, 0)]) world.setBlock(pos, 'iron_ore');
  const { rig, bot, controller, messages } = prepare(version, world, true);
  if (!underground) controller.configurePassages({ tunnelWidth: 1 });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const runtime = createRequire(new URL('./package.json', import.meta.url));
  const Item = createRequire(runtime.resolve('mineflayer'))('prismarine-item')(bot.registry);
  const pick = new Item(bot.registry.itemsByName.iron_pickaxe.id, 1, 0);
  pick.slot = 36; bot.inventory.slots[36] = pick; bot.updateHeldItem(); bot.pathingUtil.refresh();
  let searches = 0, starts = 0, sneaks = 0;
  const resets = [], violations = [];
  const getPathTo = bot.pathfinder.getPathTo.bind(bot.pathfinder);
  bot.pathfinder.getPathTo = (...args) => { searches++; return getPathTo(...args); };
  bot.on('resetPath', reason => resets.push(reason));
  const control = bot.setControlState;
  bot.setControlState = (name, value) => {
    if (name === 'sneak' && value && !bot.getControlState('sneak')) sneaks++;
    // The server normally confirms this through pose metadata. Model the
    // crouched eye height too, rather than raycasting from a standing camera.
    if (name === 'sneak') bot.entity.eyeHeight = value ? 1.27 : 1.62;
    control(name, value);
  };
  const write = bot._client.write;
  bot._client.write = (name, payload) => {
    if (name === 'block_dig' && payload.status === 0) {
      starts++;
      const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
      const pos = payload.location;
      const distance = Math.hypot(...['x', 'y', 'z'].map(axis => Math.max(pos[axis] - eye[axis], eye[axis] - pos[axis] - 1, 0)));
      const direction = new Vec3(-Math.sin(bot.entity.yaw) * Math.cos(bot.entity.pitch), Math.sin(bot.entity.pitch), -Math.cos(bot.entity.yaw) * Math.cos(bot.entity.pitch));
      const hit = world.raycast(eye, direction, 4.5);
      if (distance > 4.5 || !hit?.position.equals(pos)) violations.push({ pos, distance, hit: hit?.position });
    }
    if (name === 'block_dig' && payload.status === 2) world.setBlock(new Vec3(1, 64, 24), starts % 2 ? 'stone' : 'dirt');
    write(name, payload);
  };
  controller.enqueue({ kind: 'mine', blocks: 'iron', count: 3, radius: 16, minY: underground ? 59 : 64, maxY: 65 });
  await waitForJob(controller, 35000);
  assert.equal(controller.snapshot.history[0].mined, 3, messages.join('\n'));
  assert.ok(starts >= (underground ? 6 : 15), `dig starts=${starts}`);
  if (underground) assert.ok(bot.entity.position.y <= 62.1, `approach must descend: position=${bot.entity.position}`);
  assert.deepEqual(violations, [], 'all server dig requests are in reach and aimed at the requested block');
  assert.ok(underground ? sneaks <= 6 : sneaks === 0, `unnecessary sneak taps=${sneaks}`);
  assert.deepEqual(resets, []);
  assert.ok(searches <= 2, `searches=${searches}, dig starts=${starts}`);
  t.diagnostic(`iron vein: dig requests=${starts}, approach searches=${searches}, sneak taps=${sneaks}`);
});

test('excavation executes several tunnel steps without replanning after each broken block', { timeout: 30000 }, async (t) => {
  const version = '26.1.2';
  const world = createFlatWorld(version, 64, { renderDistance: 2 });
  for (let x = -1; x <= 16; x++) {
    for (let y = 64; y <= 66; y++) {
      world.setBlock(new Vec3(x, y, -1), 'bedrock');
      world.setBlock(new Vec3(x, y, 1), 'bedrock');
    }
    world.setBlock(new Vec3(x, 66, 0), 'bedrock');
    if (x >= 1 && x <= 12) for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(x, y, 0), 'stone');
  }
  // Keep this a sealed excavation fixture. An open rear entrance lets the
  // cave-first approach walk around the entire corridor instead of mining it.
  for (const y of [64, 65]) world.setBlock(new Vec3(-1, y, 0), 'bedrock');
  world.setBlock(new Vec3(14, 64, 0), 'diamond_ore');
  const { rig, bot, controller, messages } = prepare(version, world);
  bot.pathfinder.setOptions({ tickTimeoutMs: 1, routePrefixMs: 1, routePrefixLength: 4 });
  controller.configurePassages({ tunnelWidth: 1 });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const runtime = createRequire(new URL('./package.json', import.meta.url));
  const Item = createRequire(runtime.resolve('mineflayer'))('prismarine-item')(bot.registry);
  const pick = new Item(bot.registry.itemsByName.netherite_pickaxe.id, 1, 0);
  Object.defineProperty(pick, 'enchants', { value: [{ name: 'efficiency', lvl: 5 }] });
  pick.slot = 36; bot.inventory.slots[36] = pick; bot.updateHeldItem(); bot.pathingUtil.refresh();
  let searches = 0, dug = 0, maximumMiningSteps = 0, blockResets = 0;
  const getPathTo = bot.pathfinder.getPathTo.bind(bot.pathfinder);
  bot.pathfinder.getPathTo = (...args) => { searches++; return getPathTo(...args); };
  const dig = bot.dig;
  bot.dig = async (...args) => { dug++; return dig(...args); };
  bot.on('pathGenerated', path => { maximumMiningSteps = Math.max(maximumMiningSteps, path.path.filter(move => move.toBreak.length).length); });
  bot.on('resetPath', reason => { if (reason === 'blockUpdate') blockResets++; });
  controller.enqueue({ kind: 'mine', blocks: 'diamond', count: 1, radius: 20, minY: 64, maxY: 65 });
  await waitForJob(controller, 26000);
  assert.equal(controller.snapshot.history[0].mined, 1, messages.join('\n'));
  assert.ok(dug >= 24, `dug=${dug}`);
  assert.ok(maximumMiningSteps >= 3, `miningSteps=${maximumMiningSteps}`);
  assert.ok(searches < dug / 4, `searches=${searches}, dug=${dug}`);
  assert.equal(blockResets, 0);
  t.diagnostic(`tunnel: searches=${searches}, broken=${dug}, longest excavation=${maximumMiningSteps}, block resets=${blockResets}`);
});

test('a 2x2 ore approach places sparse wall torches using Mineflayer placement packets', { timeout: 35000 }, async (t) => {
  const version = '26.1.2';
  const world = createFlatWorld(version, 64, { renderDistance: 1 });
  for (let x = -1; x <= 14; x++) {
    for (const z of [-1, 2]) for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(x, y, z), 'bedrock');
    for (const z of [0, 1]) {
      world.setBlock(new Vec3(x, 66, z), 'bedrock');
      if (x >= 1 && x <= 11) for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(x, y, z), 'stone');
    }
  }
  for (const z of [0, 1]) for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(-1, y, z), 'bedrock');
  world.setBlock(new Vec3(12, 64, 0), 'diamond_ore');
  const { rig, bot, controller, messages } = prepare(version, world);
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const runtime = createRequire(new URL('./package.json', import.meta.url));
  const Item = createRequire(runtime.resolve('mineflayer'))('prismarine-item')(bot.registry);
  const pick = new Item(bot.registry.itemsByName.netherite_pickaxe.id, 1);
  Object.defineProperty(pick, 'enchants', { value: [{ name: 'efficiency', lvl: 5 }] });
  const torches = new Item(bot.registry.itemsByName.torch.id, 16);
  pick.slot = 36; torches.slot = 37;
  bot.inventory.slots[36] = pick; bot.inventory.slots[37] = torches;
  bot.updateHeldItem(); bot.pathingUtil.refresh();
  const supportFeature = bot.supportFeature;
  bot.supportFeature = feature => feature === 'blockPlaceHasInsideBlock' || supportFeature(feature);
  bot.loadPlugin(runtime('mineflayer/lib/plugins/generic_place'));
  bot.loadPlugin(runtime('mineflayer/lib/plugins/place_block'));
  const lights = [], resets = [];
  const faces = { 2: new Vec3(0, 0, -1), 3: new Vec3(0, 0, 1),
    4: new Vec3(-1, 0, 0), 5: new Vec3(1, 0, 0) };
  const write = bot._client.write;
  bot._client.write = (name, packet) => {
    if (name === 'block_place' && bot.heldItem?.name === 'torch') {
      assert.ok(faces[packet.direction], 'the real placement packet targets a wall face');
      const destination = new Vec3(packet.location.x, packet.location.y, packet.location.z).plus(faces[packet.direction]);
      assert.equal(bot.blockAt(destination).name, 'air');
      lights.push({ destination, feet: bot.entity.position.floored() });
      world.setBlock(destination, 'wall_torch');
      torches.count--;
    }
    write(name, packet);
  };
  bot.on('resetPath', reason => resets.push(reason));
  controller.configurePassages({ placeTorches: true, torchInterval: 8 });
  controller.enqueue({ kind: 'mine', blocks: 'diamond', count: 1, radius: 16, minY: 64, maxY: 65 });
  await waitForJob(controller, 30000);
  assert.equal(controller.snapshot.history[0].mined, 1, messages.join('\n'));
  assert.ok(lights.length >= 2 && lights.length <= 3, `torches=${lights.length}`);
  for (let i = 1; i < lights.length; i++) assert.ok(lights[i].feet.distanceTo(lights[i - 1].feet) >= 8);
  assert.equal(torches.count, 16 - lights.length);
  assert.equal(bot.heldItem.name, 'netherite_pickaxe');
  assert.deepEqual(resets, [], 'lighting does not cancel the committed excavation');
});

test('the manual tunnel command clears a long 2x2 passage under a solid ceiling', { timeout: 35000 }, async (t) => {
  const version = '26.1.2';
  const world = createFlatWorld(version, 64, { renderDistance: 1 });
  for (let x = -1; x <= 12; x++) for (let z = -1; z <= 2; z++)
    for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(x, y, z), 'stone');
  for (const z of [0, 1]) for (const y of [64, 65]) world.clearBlock(new Vec3(0, y, z));
  const { rig, bot, controller, messages } = prepare(version, world);
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const runtime = createRequire(new URL('./package.json', import.meta.url));
  const Item = createRequire(runtime.resolve('mineflayer'))('prismarine-item')(bot.registry);
  const pick = new Item(bot.registry.itemsByName.netherite_pickaxe.id, 1);
  Object.defineProperty(pick, 'enchants', { value: [{ name: 'efficiency', lvl: 5 }] });
  pick.slot = 36; bot.inventory.slots[36] = pick; bot.updateHeldItem(); bot.pathingUtil.refresh();
  bot.entity.yaw = -Math.PI / 2;
  const spec = commands.taskFromCommand(bot, controller, 'tunnel', ['10', '2', '2']);
  controller.enqueue(spec);
  await waitForJob(controller, 30000);
  assert.equal(controller.snapshot.history[0].outcome, 'готово', messages.join('\n'));
  assert.equal(controller.snapshot.history[0].mined, 40);
  for (let x = 1; x <= 10; x++) for (const z of [0, 1]) {
    for (const y of [64, 65]) assert.equal(bot.blockAt(new Vec3(x, y, z)).name, 'air', `${x},${y},${z}`);
    for (const y of [63, 66]) assert.equal(bot.blockAt(new Vec3(x, y, z)).name, 'stone', `${x},${y},${z}`);
  }
});

for (const scaffold of [false, true]) test(`ordinary come escapes a roofed shaft ${scaffold ? 'by building a pillar' : 'by digging stairs without building blocks'}`, { timeout: 25000 }, async (t) => {
  const version = '26.1.2';
  const world = createFlatWorld(version, 64, { renderDistance: 2 });
  for (let x = -3; x <= 6; x++) for (let z = -3; z <= 3; z++) {
    world.setBlock(new Vec3(x, 57, z), 'bedrock');
    for (let y = 58; y <= 63; y++) world.setBlock(new Vec3(x, y, z), scaffold ? 'bedrock' : 'stone');
  }
  for (let y = 58; y <= 63; y++) world.setBlock(new Vec3(0, y, 0), y >= 60 ? 'stone' : 'air');
  const { rig, bot, controller } = prepare(version, world, false, new Vec3(0.5, 58, 0.5), { canDig: true });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const runtime = createRequire(new URL('./package.json', import.meta.url));
  const Item = createRequire(runtime.resolve('mineflayer'))('prismarine-item')(bot.registry);
  const pick = new Item(bot.registry.itemsByName.netherite_pickaxe.id, 1, 0);
  pick.slot = 36; Object.defineProperty(pick, 'enchants', { value: [{ name: 'efficiency', lvl: 5 }] });
  bot.inventory.slots[36] = pick;
  if (scaffold) {
    const blocks = new Item(bot.registry.itemsByName.cobbled_deepslate.id, 32, 0);
    blocks.slot = 37; bot.inventory.slots[37] = blocks;
  }
  bot.updateHeldItem(); bot.pathingUtil.refresh();
  let placed = 0, dug = 0;
  bot.on('blockPlaced', () => placed++);
  bot.on('diggingCompleted', () => dug++);
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
  const goal = new (runtime('./pathfinder.cjs').goals.GoalNear)(3.5, 64, 0.5, 0.7);
  try { await bot.pathfinder.goto(goal); }
  catch (error) {
    t.diagnostic(JSON.stringify({ position: bot.entity.position, dug, placed, canDig: bot.pathfinder.defaultMoveSettings.canDig, items: bot.inventory.items().map(item => item.name) }));
    throw error;
  }
  assert.ok(bot.entity.onGround && bot.entity.position.distanceTo(new Vec3(3.5, 64, 0.5)) <= 0.8, `position=${bot.entity.position}`);
  assert.ok(dug >= 4, `headroom cleared=${dug}`);
  assert.equal(world.getBlock(new Vec3(3, 63, 0)).name, scaffold ? 'bedrock' : 'stone', 'keep the owner’s footing');
  if (scaffold) assert.ok(placed >= 5, `pillar blocks=${placed}`);
  else assert.equal(placed, 0);
});

for (const roof of [false, true]) test(`delivery escapes a shaft using deepslate blocks${roof ? ' and clears the ceiling' : ''}, then returns`, { timeout: 40000 }, async (t) => {
  const version = '26.1.2';
  const world = createFlatWorld(version, 64, { renderDistance: 2 });
  for (let x = -3; x <= 6; x++) for (let z = -3; z <= 3; z++) {
    world.setBlock(new Vec3(x, 57, z), 'bedrock');
    for (let y = 58; y <= 63; y++) world.setBlock(new Vec3(x, y, z), 'bedrock');
  }
  for (let y = 58; y <= 63; y++) world.setBlock(new Vec3(0, y, 0), roof && y >= 60 ? 'stone' : 'air');
  const { rig, bot, controller, messages } = prepare(version, world, false, new Vec3(0.5, 58, 0.5));
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const runtime = createRequire(new URL('./package.json', import.meta.url));
  const Item = createRequire(runtime.resolve('mineflayer'))('prismarine-item')(bot.registry);
  for (const [slot, name, count] of [[36, 'netherite_pickaxe', 1], [37, 'cobbled_deepslate', 64], [38, 'cobbled_deepslate', 32], [39, 'diamond', 7]]) {
    const item = new Item(bot.registry.itemsByName[name].id, count, 0);
    item.slot = slot;
    if (name.endsWith('pickaxe')) Object.defineProperty(item, 'enchants', { value: [{ name: 'efficiency', lvl: 5 }] });
    bot.inventory.slots[slot] = item;
  }
  bot.updateHeldItem(); bot.pathingUtil.refresh();
  bot.inventory.emptySlotCount = () => 0;
  const origin = bot.entity.position.clone();
  const owner = { id: 2, position: new Vec3(3.5, 64, 0.5), isValid: true };
  let placed = 0, headroom = 0, tossedDiamonds = 0, reachedOwner = false;
  bot.on('blockPlaced', () => { placed++; });
  const dig = bot.dig;
  bot.dig = async (block, ...args) => { if (block.name === 'stone') headroom++; return dig(block, ...args); };
  bot.toss = async (type, metadata, count) => {
    assert.ok(bot.entity.position.distanceTo(owner.position) <= 3.5);
    assert.ok(bot.entity.position.y >= 63);
    reachedOwner = true;
    let remaining = count;
    for (const item of bot.inventory.items().filter(item => item.type === type)) {
      const amount = Math.min(item.count, remaining);
      item.count -= amount; remaining -= amount;
      if (!item.count) bot.inventory.slots[item.slot] = null;
      if (item.name === 'diamond') tossedDiamonds += amount;
      if (!remaining) break;
    }
    bot.updateHeldItem();
  };
  bot.tossStack = item => bot.toss(item.type, item.metadata, item.count);
  await controller.deliver(() => owner);
  try { await waitForJob(controller, 36000); }
  catch (error) { throw new Error(JSON.stringify({ snapshot: controller.snapshot, position: bot.entity.position, placed, headroom, messages }), { cause: error }); }
  assert.equal(reachedOwner, true, messages.join('\n'));
  assert.equal(tossedDiamonds, 7);
  assert.ok(placed >= 5, `placed=${placed}`);
  if (roof) assert.ok(headroom >= 4, `dug=${headroom}`);
  assert.ok(bot.entity.position.distanceTo(origin) <= 0.8, `position=${bot.entity.position}`);
  assert.equal(bot.pathfinder.defaultMoveSettings.canDig, false);
  assert.equal(bot.pathfinder.isPathing, false);
});

for (const storageTrip of [false, true]) test(storageTrip ? 'storage climbs remembered cave stairs to an already loaded surface chest' : 'delivery crosses a broad cave through its remembered stairs and returns to the mining site', { timeout: 80000 }, async (t) => {
  const version = '26.1.2';
  const world = createFlatWorld(version, 64, { renderDistance: 2 });
  for (let x = -30; x <= 8; x++) for (let z = -24; z <= 24; z++) {
    for (let y = 64; y <= 74; y++) world.setBlock(new Vec3(x, y, z), 'stone');
    if (x >= -27 && x <= 5 && Math.abs(z) <= 21)
      for (let y = 64; y <= 67; y++) world.setBlock(new Vec3(x, y, z), 'cave_air');
  }
  for (let step = 0; step <= 11; step++) {
    const x = -26 + step;
    world.setBlock(new Vec3(x, 63 + step, -20), 'stone');
    for (let y = 64 + step; y <= 67 + step; y++) world.setBlock(new Vec3(x, y, -20), 'air');
  }
  const { rig, bot, controller, messages } = prepare(version, world, false, new Vec3(0.5, 75, 0.5));
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop(); }, { once: true });
  t.after(async () => { await controller.dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); });
  const runtime = createRequire(new URL('./package.json', import.meta.url));
  const { goals } = runtime('./pathfinder.cjs');
  bot.pathfinder.setMoveOptions({ canDig: false, canPlace: false });
  await bot.pathfinder.goto(new goals.GoalBlock(-15, 75, -20));
  await bot.pathfinder.goto(new goals.GoalBlock(-26, 64, -20));
  await bot.pathfinder.goto(new goals.GoalBlock(0, 64, 0));
  bot.pathfinder.setOptions({ searchTimeoutMs: 300, maxVisitedNodes: 1000, routePrefixMs: 0 });
  const Item = createRequire(runtime.resolve('mineflayer'))('prismarine-item')(bot.registry);
  const diamonds = new Item(bot.registry.itemsByName.diamond.id, 7, 0);
  diamonds.slot = 36; bot.inventory.slots[36] = diamonds;
  bot.updateHeldItem();
  const origin = bot.entity.position.clone();
  const owner = { id: 2, position: new Vec3(0.5, 75, 0.5), isValid: true };
  let delivered = 0, edits = 0;
  const routes = [];
  bot.on('pathGenerated', (route) => {
    routes.push(route.path.map(move => [move.x, move.y, move.z, move.moveType.constructor.name]));
    if (routes.length > 6) routes.shift();
  });
  const dig = bot.dig;
  bot.dig = (...args) => { edits++; return dig(...args); };
  bot.on('blockPlaced', () => { edits++; });
  bot.tossStack = async (item) => {
    assert.ok(bot.entity.position.distanceTo(owner.position) <= 3.5);
    assert.ok(Math.abs(bot.entity.position.y - owner.position.y) <= 1);
    delivered += item.count;
    bot.inventory.slots[item.slot] = null;
    bot.updateHeldItem();
  };
  if (storageTrip) {
    world.setBlock(new Vec3(0, 75, 0), 'chest');
    bot.activateBlock = undefined;
    bot.openContainer = async () => ({ close() {}, async deposit(_type, _metadata, count) {
      assert.ok(bot.entity.position.y >= 73, `chest must be reached before depositing: ${bot.entity.position}`);
      delivered += count; bot.inventory.slots[diamonds.slot] = null; bot.updateHeldItem();
    } });
    controller.configureStorage([{ id: 'gems', name: 'Руда', filters: ['#ores'], chests: [{ x: 0, y: 75, z: 0 }] }]);
    controller.enqueue({ kind: 'deposit' });
  } else await controller.deliver(() => owner);
  try { await waitForJob(controller, 60000); }
  catch (error) {
    throw new Error(JSON.stringify({ snapshot: controller.snapshot, position: bot.entity.position,
      move: bot.pathfinder.currentMove?.exitPos, index: bot.pathfinder.currentIndex, routes,
      messages: messages.slice(-6) }), { cause: error });
  }
  assert.equal(delivered, 7, messages.join('\n'));
  assert.equal(edits, 0, 'both delivery legs reuse the cave and stairs without changing terrain');
  if (!storageTrip) assert.ok(bot.entity.position.distanceTo(origin) <= 0.8, `position=${bot.entity.position}`);
  assert.equal(controller.snapshot.history[0].outcome, 'готово');
});
