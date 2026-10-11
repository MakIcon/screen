import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import worker from "./worker.cjs";
import gathering from "./gathering.cjs";

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
function prepare(version, world, realDigging = false) {
  const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), { world });
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
    { allowParkour: false, allowSprinting: false, canDig: false, maxDropDown: 2 },
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
