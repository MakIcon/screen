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

async function waitForJob(controller, timeout = 12000) {
  const until = Date.now() + timeout;
  while (controller.busy && Date.now() < until && controller.snapshot.phase !== "paused")
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(controller.snapshot.phase === "paused", false, JSON.stringify(controller.snapshot));
  assert.equal(controller.busy, false, JSON.stringify(controller.snapshot));
}
function prepare(version, world, realDigging = false, position = new Vec3(0.5, 64, 0.5), movement = {}) {
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
    { onStatus: (message) => messages.push(message) },
  );
  return { rig, bot, controller, messages };
}

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
