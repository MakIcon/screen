import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import worker from "./worker.cjs";
import { createGatheringController } from "./gathering.cjs";

const require = createRequire(import.meta.url);
const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const { Vec3 } = require("vec3");
const native = createRequire(require.resolve("mineflayer"));

for (const version of ["1.20.4", "26.1.2"]) {
  test(
    `walks across planted farmland without jumping or breaking the beds on ${version}`,
    { timeout: 12000 },
    async (t) => {
      const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 63.9375, 0.5), {
        renderDistance: 1,
      });
      const bot = rig.bot;
      bot.health = 20;
      bot.supportFeature = bot.registry.supportFeature;
      for (const plugin of [
        "entities",
        "inventory",
        "simple_inventory",
        "generic_place",
        "place_block",
        "digging",
      ])
        bot.loadPlugin(require(`mineflayer/lib/plugins/${plugin}`), { hideErrors: false });
      const Item = native("prismarine-item")(bot.registry);
      const seeds = new Item(bot.registry.itemsByName.wheat_seeds.id, 16);
      seeds.slot = 36;
      bot.inventory.slots[36] = seeds;
      bot.setQuickBarSlot(0);
      bot.equip = async (item) => bot.setQuickBarSlot(item.slot - 36);
      bot.inventory.emptySlotCount = () => 30;
      const bed = new Vec3(10, 63, 0);
      for (let x = -1; x <= 11; x++) {
        world.setBlock(new Vec3(x, 63, 0), "farmland");
        if (x !== 10) world.setBlock(new Vec3(x, 64, 0), "wheat");
        for (const z of [-1, 1])
          for (const y of [64, 65]) world.setBlock(new Vec3(x, y, z), "stone");
      }
      bot.findBlocks = () => [bed];
      worker.configurePathfinder(
        bot,
        {
          allowParkour: true,
          allowSprinting: true,
          allowLowCeilingJumps: true,
          canDig: false,
          maxDropDown: 3,
        },
        { stayOnWater: false },
      );
      const original = { ...bot.pathfinder.defaultMoveSettings };
      const jumpInputs = [],
        paths = [],
        messages = [];
      const setControl = bot.setControlState.bind(bot);
      bot.setControlState = (control, value) => {
        if (control === "jump" && value) jumpInputs.push(bot.entity.position.clone());
        setControl(control, value);
      };
      let highest = bot.entity.position.y;
      bot.on("physicsTick", () => {
        highest = Math.max(highest, bot.entity.position.y);
      });
      bot.on("pathGenerated", (route) =>
        paths.push(route.path.map((move) => move.moveType.constructor.name)),
      );
      bot._client.write = (name, packet) => {
        if (name === "block_place") {
          assert.ok(packet.location.equals(bed));
          setImmediate(() => world.setBlock(bed.offset(0, 1, 0), "wheat"));
        }
      };
      const work = createGatheringController(
        bot,
        { dropWaitMs: 0, operationTimeoutMs: 5000 },
        { onStatus: (message) => messages.push(message) },
      );
      t.after(async () => {
        await work.dispose();
        await bot.pathfinder.destroy();
        rig.stopPassivePhysics();
      });
      work.enqueue({ kind: "plant", crop: "wheat", count: 1, radius: 16 });
      const deadline = Date.now() + 10000;
      while (work.busy && work.snapshot.phase !== "paused" && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(work.busy, false, messages.join("\n"));
      assert.equal(work.snapshot.history[0].outcome, "готово");
      assert.ok(bot.entity.position.x > 5.5, `must walk through the beds: ${bot.entity.position}`);
      assert.equal(jumpInputs.length, 0, `unexpected jumps: ${JSON.stringify(jumpInputs)}`);
      assert.ok(highest <= 64.01, `must not hop over farmland: max y=${highest}`);
      assert.ok(paths.length > 0);
      assert.ok(paths.flat().every((name) => ["Forward", "Diagonal"].includes(name)));
      for (let x = -1; x <= 11; x++)
        assert.equal(world.getBlock(new Vec3(x, 63, 0)).name, "farmland");
      assert.equal(bot.pathfinder.defaultMoveSettings.allowJumpSprint, original.allowJumpSprint);
      assert.equal(
        bot.pathfinder.defaultMoveSettings.allowLowCeilingJumps,
        original.allowLowCeilingJumps,
      );
      assert.equal(bot.pathfinder.defaultMoveSettings.walkOnly, original.walkOnly);
    },
  );
  test(
    `walks to a bed and sends native till, plant and harvest packets on ${version}`,
    { timeout: 15000 },
    async (t) => {
      const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), {
        renderDistance: 1,
      });
      const bot = rig.bot;
      bot.health = 20;
      bot.supportFeature = bot.registry.supportFeature;
      for (const plugin of [
        "entities",
        "inventory",
        "simple_inventory",
        "generic_place",
        "place_block",
        "digging",
      ])
        bot.loadPlugin(require(`mineflayer/lib/plugins/${plugin}`), { hideErrors: false });
      const Item = native("prismarine-item")(bot.registry);
      for (const [slot, name, count] of [
        [36, "iron_hoe", 1],
        [37, "wheat_seeds", 3],
      ]) {
        const item = new Item(bot.registry.itemsByName[name].id, count);
        item.slot = slot;
        bot.inventory.slots[slot] = item;
      }
      // All required items are on the hotbar; no inventory transactions are needed.
      bot.equip = async (item) => bot.setQuickBarSlot(item.slot - 36);
      bot.unequip = async () => bot.setQuickBarSlot(2);
      bot.inventory.emptySlotCount = () => 30;
      bot.setQuickBarSlot(0);
      const bed = new Vec3(6, 63, 0),
        crop = bed.offset(0, 1, 0);
      world.setBlock(bed, "dirt");
      world.setBlock(bed.offset(1, 0, 0), "water");
      bot.findBlocks = (options) =>
        [bed, crop].filter((pos) => {
          const block = world.getBlock(pos);
          return (
            options.matching.includes(block.type) &&
            pos.distanceTo(options.point) <= options.maxDistance &&
            (!options.useExtraInfo || options.useExtraInfo(block))
          );
        });
      bot.canDigBlock = (block) =>
        block.position.offset(0.5, 0.5, 0.5).distanceTo(bot.entity.position.offset(0, 1.62, 0)) <=
        4.5;
      bot._updateBlockState = (pos, state) => world.setBlock(pos, state);
      worker.configurePathfinder(
        bot,
        { allowParkour: false, allowSprinting: true, canDig: false, maxDropDown: 2 },
        { stayOnWater: false },
      );
      const actions = [],
        messages = [];
      const serializer = native("minecraft-protocol").createSerializer({
        state: "play",
        isServer: false,
        version,
      });
      bot._client.write = (name, packet) => {
        if (!["block_place", "block_dig"].includes(name)) return;
        serializer.createPacketBuffer({ name, params: packet });
        if (name === "block_place") {
          assert.ok(packet.location.equals(bed));
          assert.equal(packet.direction, 1);
          assert.ok(
            bot.entity.position.x > 1.5,
            "native physics moved the bot into interaction range",
          );
          if (bot.heldItem.name === "iron_hoe") {
            actions.push("till");
            setImmediate(() => world.setBlock(bed, "farmland"));
          } else {
            assert.equal(bot.heldItem.name, "wheat_seeds");
            actions.push("plant");
            setImmediate(() => world.setBlock(crop, bot.registry.blocksByName.wheat.maxStateId));
          }
        } else if (packet.status === 0) {
          assert.ok(packet.location.equals(crop));
          actions.push("harvest");
        }
      };
      const work = createGatheringController(
        bot,
        { dropWaitMs: 0, operationTimeoutMs: 8000 },
        { onStatus: (message) => messages.push(message) },
      );
      t.after(async () => {
        await work.dispose();
        await bot.pathfinder.destroy();
        rig.stopPassivePhysics();
      });
      for (const spec of [
        { kind: "till" },
        { kind: "plant", crop: "wheat" },
        { kind: "harvest", crop: "wheat", replant: false },
      ])
        work.enqueue({ ...spec, count: 1, radius: 8 });
      const deadline = Date.now() + 13000;
      while (work.busy && work.snapshot.phase !== "paused" && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(work.busy, false, messages.join("\n"));
      assert.deepEqual(actions, ["till", "plant", "harvest"]);
      assert.equal(world.getBlock(bed).name, "farmland");
      assert.equal(world.getBlock(crop).name, "air");
      assert.equal(work.snapshot.history.length, 3);
      assert.ok(work.snapshot.history.every((entry) => entry.outcome === "готово"));
      assert.equal(bot.pathfinder.defaultMoveSettings.allowSprinting, true);
    },
  );
}
