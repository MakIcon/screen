import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createProductionController } from "./production.cjs";
import { installCombatProtocol } from "./combat.cjs";

const require = createRequire(import.meta.url);
const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const { Vec3 } = require("vec3");
const native = createRequire(require.resolve("mineflayer"));
const protocol = native("minecraft-protocol");

function rigFor(t, version) {
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
  const bot = rig.bot;
  bot.physicsEnabled = false;
  bot.health = 20;
  bot.supportFeature = bot.registry.supportFeature;
  for (const name of ["entities", "inventory", "simple_inventory", "craft"])
    bot.loadPlugin(require(`mineflayer/lib/plugins/${name}`), { hideErrors: false });
  const Item = native("prismarine-item")(bot.registry),
    packets = [],
    errors = [];
  const add = (slot, name, count) => {
    const item = new Item(bot.registry.itemsByName[name].id, count);
    item.slot = slot;
    bot.inventory.slots[slot] = item;
  };
  bot.pathfinder = {
    stop: async () => {},
    goto: async () => {
      assert.fail("block should already be reachable");
    },
  };
  bot.waitForTicks = async () => {};
  const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
  bot._client.state = "play";
  let openTarget;
  bot._client.write = (name, params) => {
    serializer.createPacketBuffer({ name, params });
    packets.push({ name, params });
    if (name === "block_place" && openTarget) {
      setImmediate(() => {
        const windows = native("prismarine-windows")(version);
        const { type, inventoryStart, slots } =
          typeof openTarget === "function" ? openTarget(params.location) : openTarget;
        const definition = windows.windows[type];
        bot._client.emit("open_window", {
          windowId: 1,
          inventoryType: version === "1.8.8" ? type : definition.type,
          windowTitle: "Station",
          slotCount: inventoryStart,
        });
        const contents = Array(inventoryStart + 36).fill(null);
        for (let i = 0; i < inventoryStart; i++) contents[i] = slots?.[i] || null;
        for (let i = 9; i < 45; i++) contents[i + inventoryStart - 9] = bot.inventory.slots[i];
        bot._client.emit("window_items", {
          windowId: 1,
          stateId: 1,
          items: contents.map(Item.toNotch),
          carriedItem: Item.toNotch(null),
        });
      });
    } else if (name === "window_click") {
      if (bot.supportFeature("transactionPacketExists"))
        setImmediate(() =>
          bot._client.emit("transaction", {
            windowId: params.windowId,
            action: params.action,
            accepted: true,
          }),
        );
      else {
        const window = bot.currentWindow || bot.inventory;
        if (
          (window.type === "minecraft:inventory" && params.slot >= 1 && params.slot <= 4) ||
          (window.type === "minecraft:crafting" && params.slot >= 1 && params.slot <= 9)
        )
          setImmediate(() => window.emit("updateSlot:0", null, null));
      }
    }
  };
  installCombatProtocol(bot);
  const production = createProductionController(bot, {
    onError: (error) => errors.push(error),
    operationTimeoutMs: 1000,
    pollMs: 1,
  });
  t.after(async () => {
    await production.dispose();
    rig.stopPassivePhysics();
  });
  return {
    bot,
    world,
    Item,
    add,
    packets,
    errors,
    production,
    target(value) {
      openTarget = value;
    },
  };
}

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(
    `real inventory crafting uses 2x2 and preserves surplus ingredients on ${version}`,
    { timeout: 5000 },
    async (t) => {
      const f = rigFor(t, version);
      f.add(36, "coal", 2);
      f.add(37, "stick", 3);
      f.production.craft(f.production.prepareCraft("torch", 5, "inventory"));
      await f.production.task;
      assert.equal(f.errors.length, 0, f.errors[0]?.message);
      assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.torch.id), 8);
      assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.coal.id), 0);
      assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.stick.id), 1);
      assert.ok(!f.packets.some((packet) => packet.name === "block_place"));
      assert.equal(f.bot.currentWindow, null);
    },
  );

  test(
    `real table crafting opens the visible face and crafts 3x3 on ${version}`,
    { timeout: 5000 },
    async (t) => {
      const f = rigFor(t, version);
      f.add(36, "cobblestone", 3);
      f.add(37, "stick", 2);
      const block = f.world.setBlock(new Vec3(2, 64, 0), "crafting_table");
      f.bot.findBlocks = () => [block.position];
      f.target({
        type: version === "1.8.8" ? "minecraft:crafting_table" : "minecraft:crafting",
        inventoryStart: 10,
      });
      f.production.craft(f.production.prepareCraft("stone_pickaxe", 1, "table"));
      await f.production.task;
      assert.equal(f.errors.length, 0, f.errors[0]?.message);
      assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.stone_pickaxe.id), 1);
      assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.cobblestone.id), 0);
      assert.equal(f.bot.listenerCount("windowOpen"), 0);
      assert.equal(f.bot.currentWindow, null);
      assert.ok(
        f.packets.some((packet) => packet.name === "block_place" && packet.params.direction === 4),
      );
    },
  );
}

for (const version of ["1.20.4", "26.1.2"]) {
  test(`logs become a complete weapon through a newly placed table on ${version}`, { timeout: 8000 }, async (t) => {
    const f = rigFor(t, version);
    f.add(36, "oak_log", 4);
    f.world.setBlock(new Vec3(1, 63, 0), "stone");
    let table;
    f.bot.findBlocks = () => table ? [table.position] : [];
    f.bot.placeBlock = async support => {
      const item = f.bot.inventory.findInventoryItem(f.bot.registry.itemsByName.crafting_table.id);
      assert.ok(item);
      f.bot.inventory.updateSlot(item.slot, null);
      table = f.world.setBlock(support.position.offset(0, 1, 0), "crafting_table");
    };
    f.target({ type: "minecraft:crafting", inventoryStart: 10 });
    const item = version === "26.1.2" ? "wooden_spear" : "wooden_sword";
    f.production.craft(f.production.prepareCraft(item, 1));
    await f.production.task;
    assert.equal(f.errors.length, 0, f.errors[0]?.message);
    assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName[item].id), 1);
    assert.equal(f.production.snapshot().outcome, "complete");
  });

  test(`stopping inventory crafting returns its cursor and grid on ${version}`, { timeout: 5000 }, async (t) => {
    const f = rigFor(t, version);
    f.add(36, "coal", 2);
    f.add(37, "stick", 3);
    const click = f.bot.clickWindow;
    let stopping;
    f.bot.clickWindow = async (...args) => {
      await click(...args);
      if (args[0] === 1 && !stopping) stopping = f.production.stop();
    };
    f.production.craft(f.production.prepareCraft("torch", 4, "inventory"));
    await f.production.task;
    await stopping;
    assert.equal(f.production.snapshot().outcome, "stopped");
    assert.equal(f.errors.length, 0, f.errors[0]?.message);
    assert.equal(f.bot.inventory.selectedItem, null);
    assert.ok(f.bot.inventory.slots.slice(1, 5).every(item => !item));
    assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.coal.id), 2);
    assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.stick.id), 3);
    assert.ok(!f.packets.some(packet => packet.name === "window_click" && packet.params.slot === -999));
  });

  test(`recursive table crafting uses newly made sticks on ${version}`, { timeout: 5000 }, async (t) => {
    const f = rigFor(t, version);
    f.add(36, "oak_log", 4);
    const block = f.world.setBlock(new Vec3(2, 64, 0), "crafting_table");
    f.bot.findBlocks = () => [block.position];
    f.target({ type: "minecraft:crafting", inventoryStart: 10 });
    const item = version === "26.1.2" ? "wooden_spear" : "wooden_sword";
    f.production.craft(f.production.prepareCraft(item, 1));
    await f.production.task;
    assert.equal(f.errors.length, 0, f.errors[0]?.message);
    assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName[item].id), 1);
    assert.equal(f.production.snapshot().outcome, "complete");
  });

  test(
    `chest scan reads actual window packets and never transfers stored items on ${version}`,
    { timeout: 5000 },
    async (t) => {
      const f = rigFor(t, version);
      f.add(36, "diamond", 64);
      const positions = [new Vec3(2, 64, 0), new Vec3(2, 64, 2), new Vec3(0, 64, 3)];
      for (const position of positions) f.world.setBlock(position, "chest");
      f.bot.findBlocks = () => positions;
      f.target((position) => ({
        type: "minecraft:generic_9x3",
        inventoryStart: 27,
        slots: position.equals(positions[0])
          ? [new f.Item(f.bot.registry.itemsByName.gold_ingot.id, 8)]
          : [],
      }));
      let groups;
      f.bot.launcherGathering = { settings: { storageGroups: [] } };
      f.bot.launcherConfigureStorage = (value) => {
        groups = value;
      };
      f.production.scanStorage(f.production.prepareStorageScan(16));
      await f.production.task;
      const scan = f.production.snapshot().storageScan;
      assert.equal(f.errors.length, 0, f.errors[0]?.message);
      assert.equal(scan.state, "complete");
      assert.equal(scan.added, 3);
      assert.equal(
        scan.records.find((record) => record.position.x === 2 && record.position.z === 0).category,
        "#valuable",
      );
      assert.equal(groups.find((group) => group.filters.includes("#bulk")).chests.length, 2);
      assert.ok(
        !f.packets.some((packet) => packet.name === "window_click"),
        "inspection must not click items",
      );
      assert.equal(
        f.bot.inventory.count(f.bot.registry.itemsByName.diamond.id),
        64,
        "player inventory must not become chest contents",
      );
      assert.equal(f.bot.currentWindow, null);
      assert.equal(f.bot.listenerCount("windowOpen"), 0);
    },
  );

  test(
    `furnace loads and collects real server output slots on ${version}`,
    { timeout: 5000 },
    async (t) => {
      const f = rigFor(t, version);
      f.add(36, "raw_iron", 2);
      f.add(37, "coal", 1);
      const block = f.world.setBlock(new Vec3(2, 64, 0), "furnace");
      f.bot.findBlocks = () => [block.position];
      f.target({ type: "minecraft:furnace", inventoryStart: 3 });
      const write = f.bot._client.write;
      let finished = false;
      f.bot._client.write = (name, params) => {
        write(name, params);
        if (!finished && name === "window_click" && f.bot.currentWindow?.slots[0]?.count === 2) {
          finished = true;
          setImmediate(() => {
            for (const [slot, item] of [
              [0, null],
              [1, null],
              [2, new f.Item(f.bot.registry.itemsByName.iron_ingot.id, 2)],
            ])
              f.bot._client.emit("set_slot", {
                windowId: 1,
                stateId: 2,
                slot,
                item: f.Item.toNotch(item),
              });
          });
        }
      };
      f.production.smelt(f.production.prepareSmelt("raw_iron", 2));
      await f.production.task;
      assert.equal(f.errors.length, 0, f.errors[0]?.message);
      assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.iron_ingot.id), 2);
      assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.raw_iron.id), 0);
      assert.equal(f.bot.currentWindow, null);
    },
  );

  test(`stonecutter selections serialize on protocol ${version}`, { timeout: 5000 }, async (t) => {
    const f = rigFor(t, version);
    f.add(36, "stone", 8);
    f.world.setBlock(new Vec3(2, 64, 0), "stonecutter");
    const block = f.bot.blockAt(new Vec3(2, 64, 0));
    f.bot.findBlocks = () => [block.position];
    f.target({ type: "minecraft:stonecutter", inventoryStart: 2 });
    f.production.station(f.production.prepareStation("stonecutter"));
    await f.production.task;
    f.production.stationAction("select", ["0"]);
    await f.production.task;
    f.production.stationAction("put", ["0", "stone", "5"]);
    await f.production.task;
    assert.throws(() => f.production.stationAction("put", ["0", "stone", "5"]), /Не хватает/);
    f.production.stationAction("take", ["0"]);
    await f.production.task;
    assert.equal(f.errors.length, 0, f.errors[0]?.message);
    assert.ok(
      f.packets.some((packet) => packet.name === "enchant_item" && packet.params.enchantment === 0),
    );
    await f.production.stop();
    assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.stone.id), 8);
  });

  test(
    `smithing and crafter retain all inventory slots on ${version}`,
    { timeout: 5000 },
    async (t) => {
      const f = rigFor(t, version);
      f.add(36, "diamond", 3);
      f.add(44, "iron_ingot", 8);
      for (const [name, type, inventoryStart] of [
        ["smithing_table", "minecraft:smithing", 4],
        ["crafter", "minecraft:crafter_3x3", 9],
      ]) {
        const block = f.world.setBlock(new Vec3(2, 64, 0), name);
        f.bot.findBlocks = () => [block.position];
        f.target({ type, inventoryStart });
        f.production.station(f.production.prepareStation(name));
        await f.production.task;
        assert.equal(f.errors.length, 0, f.errors[0]?.message);
        assert.equal(f.bot.currentWindow.inventoryStart, inventoryStart);
        assert.equal(f.production.snapshot().station.slots.length, inventoryStart);
        await f.production.stop();
        assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.diamond.id), 3);
        assert.equal(f.bot.inventory.count(f.bot.registry.itemsByName.iron_ingot.id), 8);
      }
    },
  );
}
