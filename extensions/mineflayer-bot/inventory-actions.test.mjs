import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";
import {
  createInventoryActions,
  inventoryItemFingerprint,
  playerInventorySlots,
} from "./inventory-actions.cjs";
import { queueInventoryTask } from "./combat-inventory.cjs";

const require = createRequire(import.meta.url);
const mineflayerRequire = createRequire(require.resolve("mineflayer"));
const protocol = mineflayerRequire("minecraft-protocol");

function fixture(version = "26.1.2", options = {}) {
  const bot = new EventEmitter();
  bot.version = version;
  bot.registry = require("minecraft-data")(version);
  bot.supportFeature = (feature) => bot.registry.supportFeature(feature);
  bot.health = 20;
  bot.game = { gameMode: "survival" };
  bot._client = new EventEmitter();
  bot._client.state = "play";
  const packets = [];
  bot._client.write = (name, params) => {
    packets.push({ name, params });
    if (name === "window_click" && bot.supportFeature("transactionPacketExists"))
      queueMicrotask(() =>
        bot._client.emit("transaction", {
          windowId: params.windowId,
          action: params.action,
          accepted: true,
        }),
      );
  };
  require("mineflayer/lib/plugins/inventory")(bot, { hideErrors: true });
  require("mineflayer/lib/plugins/simple_inventory")(bot);
  bot.quickBarSlot = 0;
  const Item = mineflayerRequire("prismarine-item")(bot.registry);
  function put(slot, name, count = 1) {
    const item = new Item(bot.registry.itemsByName[name].id, count);
    bot.inventory.updateSlot(slot, item);
    return item;
  }
  function request(slot, count = bot.inventory.slots[slot]?.count) {
    return { slot, count, fingerprint: inventoryItemFingerprint(bot.inventory.slots[slot]) };
  }
  let prepared = 0;
  const controller = createInventoryActions(bot, {
    prepare: async () => {
      prepared++;
      return true;
    },
    ...options,
  });
  bot.launcherInventoryActions = controller;
  return {
    bot,
    controller,
    packets,
    put,
    request,
    get prepared() {
      return prepared;
    },
  };
}

for (const version of ["1.8.8", "1.20.4", "26.1.2"])
  test(`drops the exact stack, individual item and worn armor using real inventory clicks on ${version}`, async (t) => {
    const f = fixture(version);
    t.after(() => f.controller.dispose());
    f.put(9, "diamond", 64);
    f.put(10, "diamond", 12);
    f.put(5, "diamond_helmet");
    await f.controller.drop([f.request(9, 1)]);
    assert.equal(f.bot.inventory.slots[9].count, 63);
    assert.equal(f.bot.inventory.slots[10].count, 12);
    await f.controller.drop([f.request(9), f.request(5)]);
    assert.equal(f.bot.inventory.slots[9], null);
    assert.equal(f.bot.inventory.slots[5], null);
    assert.equal(f.bot.inventory.slots[10].count, 12);
    assert.equal(f.bot.inventory.selectedItem, null);
    assert.equal(f.controller.busy, false);
    const clicks = f.packets.filter((p) => p.name === "window_click");
    assert.deepEqual(
      clicks.map((p) => [p.params.slot, p.params.mouseButton, p.params.mode]),
      [
        [9, 0, 4],
        [9, 1, 4],
        [5, 0, 4],
      ],
    );
    const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
    const parser = protocol.createDeserializer({ state: "play", isServer: true, version });
    for (const packet of clicks) {
      const parsed = parser.parsePacketBuffer(serializer.createPacketBuffer(packet)).data;
      assert.equal(parsed.name, "window_click");
      assert.equal(parsed.params.windowId, 0);
      assert.equal(parsed.params.slot, packet.params.slot);
      assert.equal(parsed.params.mode, 4);
    }
  });

test("bulk drop includes all armor and offhand without touching crafting or newly arriving items", async (t) => {
  const f = fixture();
  t.after(() => f.controller.dispose());
  f.put(0, "diamond");
  for (const slot of [5, 6, 7, 8, 9, 36, 45])
    f.put(
      slot,
      slot < 9
        ? ["diamond_helmet", "diamond_chestplate", "diamond_leggings", "diamond_boots"][slot - 5]
        : "diamond",
      slot < 9 ? 1 : 16,
    );
  const items = [5, 6, 7, 8, 9, 36, 45].map((slot) => f.request(slot));
  const click = f.bot.clickWindow;
  f.bot.clickWindow = async (...args) => {
    await click(...args);
    f.put(20, "emerald", 4);
  };
  await f.controller.drop(items);
  for (const item of items) assert.equal(f.bot.inventory.slots[item.slot], null);
  assert.equal(f.bot.inventory.slots[0].name, "diamond");
  assert.equal(f.bot.inventory.slots[20].count, 4);
});

test("validates every fingerprint before any drop, including count changes and different NBT", async (t) => {
  const f = fixture();
  t.after(() => f.controller.dispose());
  f.put(9, "diamond", 16);
  f.put(10, "diamond", 8);
  const items = [f.request(9), f.request(10)];
  f.put(10, "emerald", 8);
  await assert.rejects(f.controller.drop(items), /Инвентарь изменился/);
  assert.equal(f.packets.length, 0);
  f.put(10, "diamond", 7);
  await assert.rejects(f.controller.drop(items), /Инвентарь изменился/);
  assert.equal(f.bot.inventory.slots[9].count, 16);
  const armor = f.put(5, "diamond_helmet");
  const fingerprint = inventoryItemFingerprint(armor);
  armor.nbt = { type: "compound", value: { test: { type: "long", value: 123456789123456789n } } };
  assert.notEqual(inventoryItemFingerprint(armor), fingerprint);
  await assert.rejects(
    f.controller.drop([{ slot: 5, count: 1, fingerprint }]),
    /Инвентарь изменился/,
  );
});

test("rejects cursor items, invalid slots, duplicates, concurrent actions and disconnection", async (t) => {
  const f = fixture();
  t.after(() => f.controller.dispose());
  f.put(9, "diamond", 16);
  for (const items of [
    [],
    [{ ...f.request(9), slot: 0 }],
    [f.request(9), f.request(9)],
    [{ ...f.request(9), count: 0 }],
    [{ ...f.request(9), count: 2 }],
  ])
    await assert.rejects(f.controller.drop(items));
  f.bot.inventory.selectedItem = f.bot.inventory.slots[9];
  await assert.rejects(f.controller.drop([f.request(9)]), /перенос предмета/);
  f.bot.inventory.selectedItem = null;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const blocker = queueInventoryTask(f.bot, () => gate);
  const pending = f.controller.drop([f.request(9)]);
  await assert.rejects(f.controller.drop([f.request(9)]), /уже выбрасывает/);
  f.bot.emit("end");
  release();
  await blocker;
  await assert.rejects(pending, /отключился/);
  assert.equal(f.bot.inventory.slots[9].count, 16);
  assert.equal(f.controller.busy, false);
});

test("reads player slots in a chest and closes it before dropping, leaving chest contents intact", async (t) => {
  const f = fixture();
  t.after(() => f.controller.dispose());
  const windows = mineflayerRequire("prismarine-windows")(f.bot.version);
  f.put(9, "diamond", 1);
  const chestItem = f.put(10, "emerald", 32);
  const window = windows.createWindow(7, "minecraft:generic_9x3", "Chest");
  window.updateSlot(0, chestItem);
  window.updateSlot(window.inventoryStart, f.bot.inventory.slots[9]);
  f.bot.currentWindow = window;
  assert.equal(playerInventorySlots(f.bot)[9].name, "diamond");
  const item = playerInventorySlots(f.bot)[9];
  await f.controller.drop([{ slot: 9, count: 1, fingerprint: inventoryItemFingerprint(item) }]);
  assert.equal(window.slots[0].count, 32);
  assert.equal(f.bot.currentWindow, null);
  assert.equal(f.bot.inventory.slots[9], null);
  assert.equal(f.packets.find((p) => p.name === "window_click").params.windowId, 0);
});

test("stops on a server rejection and reports a partial drop without retrying another slot", async (t) => {
  const f = fixture();
  t.after(() => f.controller.dispose());
  f.put(9, "diamond", 16);
  f.put(10, "emerald", 8);
  f.put(11, "iron_ingot", 4);
  const click = f.bot.clickWindow;
  f.bot.clickWindow = async (...args) => {
    if (args[0] === 10) throw new Error("server rejected");
    await click(...args);
  };
  await assert.rejects(
    f.controller.drop([f.request(9), f.request(10), f.request(11)]),
    /server rejected.*Уже выброшено: 16/,
  );
  assert.equal(f.bot.inventory.slots[9], null);
  assert.equal(f.bot.inventory.slots[10].count, 8);
  assert.equal(f.bot.inventory.slots[11].count, 4);
  assert.equal(f.controller.busy, false);
});

test("cancels a running batch after the current click and leaves remaining slots untouched", async (t) => {
  const f = fixture();
  t.after(() => f.controller.dispose());
  f.put(9, "diamond", 16);
  f.put(10, "emerald", 8);
  let entered, release;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const click = f.bot.clickWindow;
  f.bot.clickWindow = async (...args) => {
    await click(...args);
    entered();
    await gate;
  };
  const operation = f.controller.drop([f.request(9), f.request(10)]);
  await started;
  f.controller.cancel();
  release();
  await assert.rejects(operation, /отменено.*Уже выброшено: 16/);
  assert.equal(f.bot.inventory.slots[9], null);
  assert.equal(f.bot.inventory.slots[10].count, 8);
  assert.equal(f.controller.busy, false);
  f.bot.clickWindow = click;
  await f.controller.drop([f.request(10)]);
  assert.equal(f.bot.inventory.slots[10], null);
});

test("ends a slow batch before its IPC deadline without continuing to drop later items", async (t) => {
  let clock = 0;
  const f = fixture("26.1.2", { now: () => clock });
  t.after(() => f.controller.dispose());
  f.put(9, "diamond", 16);
  f.put(10, "emerald", 8);
  const click = f.bot.clickWindow;
  f.bot.clickWindow = async (...args) => {
    await click(...args);
    clock = 45001;
  };
  await assert.rejects(
    f.controller.drop([f.request(9), f.request(10)]),
    /Истекло время.*Уже выброшено: 16/,
  );
  assert.equal(f.bot.inventory.slots[10].count, 8);
  assert.equal(f.controller.busy, false);
});
