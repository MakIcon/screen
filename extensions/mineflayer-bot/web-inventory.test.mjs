import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";
import viewer from "./web-inventory.cjs";
const require = createRequire(import.meta.url);
const mcData = require("minecraft-data");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function botFixture(version) {
  const bot = new EventEmitter();
  bot.version = version;
  bot.registry = mcData(version);
  bot.inventory = new EventEmitter();
  Object.assign(bot.inventory, { id: 0, type: "minecraft:inventory", slots: Array(46).fill(null) });
  const original = {
    type: (bot.registry.itemsByName.spruce_log || bot.registry.itemsByName.log).id,
    name: "spruce_log",
    displayName: "Spruce Log",
    count: 12,
    slot: 9,
  };
  bot.inventory.slots[9] = original;
  return { bot, original };
}

test("telemetry shows current workstation inventory and production without mutating the base window", async t => {
  const { bot, original } = botFixture("26.1.2");
  const slots = Array(39).fill(null);
  slots[3] = { ...original, count: 4 };
  bot.currentWindow = { inventoryStart: 3, inventoryEnd: 39, slots };
  const production = { busy: true, phase: "smelt", message: "Переплавляю", station: { name: "furnace" } };
  bot.launcherProduction = { snapshot: () => production };
  const updates = [];
  const controller = viewer.startInventoryTelemetry(bot, { onUpdate: value => updates.push(value) });
  t.after(() => controller.stop());
  assert.equal(updates[0].slots[9].count, 4);
  assert.equal(updates[0].production, production);
  assert.equal(bot.inventory.slots[9].count, 12);
  bot.currentWindow.slots[3] = null; bot.emit("health"); await sleep(100);
  assert.equal(updates.at(-1).slots[9], null);
  assert.equal(original.count, 12);
});
async function connect(url) {
  const path = url + "socket.io/?EIO=4&transport=polling";
  const handshake = await (await fetch(path, { signal: AbortSignal.timeout(3000) })).text();
  const sid = JSON.parse(handshake.slice(1)).sid;
  const endpoint = path + "&sid=" + sid;
  async function post(body) {
    return fetch(endpoint, {
      method: "POST",
      body,
      headers: { "content-type": "text/plain" },
      signal: AbortSignal.timeout(3000),
    });
  }
  async function next() {
    return (await (await fetch(endpoint, { signal: AbortSignal.timeout(3000) })).text())
      .split("\x1e")
      .filter((frame) => frame.startsWith("42"))
      .map((frame) => JSON.parse(frame.slice(2)));
  }
  await post("40");
  return {
    next,
    close: async () => {
      await post("41");
      await post("1");
    },
  };
}
for (const version of ["1.8.8", "1.20.4", "26.1.2"])
  test(`search catalog includes the full live block/item registry and supported groups on ${version}`, () => {
    const { bot } = botFixture(version);
    let catalog;
    const controller = viewer.startInventoryTelemetry(bot, { onCatalog: value => catalog = value });
    try {
      assert.equal(catalog.version, version);
      const normal = catalog.entries.filter(entry => entry.kind !== "group");
      assert.equal(normal.length, new Set([
        ...Object.keys(bot.registry.blocksByName), ...Object.keys(bot.registry.itemsByName),
      ]).size);
      for (const name of ["diamond", "diamond_ore", "diamond_block", "diamond_pickaxe"])
        assert.ok(normal.find(entry => entry.name === name)?.texture.startsWith("data:image/"));
      assert.equal(normal.find(entry => entry.name === "diamond_pickaxe").mineable, false);
      assert.equal(normal.find(entry => entry.name === "chest").mineable, false);
      assert.equal(normal.find(entry => entry.name === "diamond_ore").mineable, true);
      const diamond = catalog.entries.find(entry => entry.name === "diamond" && entry.kind === "group");
      assert.ok(diamond.blocks.includes("diamond_ore"));
      assert.equal(diamond.section, "resources");
      assert.equal(diamond.displayName, "Алмазы");
      assert.equal(diamond.description, "все руды");
      assert.equal(catalog.entries.find(entry => entry.name === "ores" && entry.kind === "group").section, "collections");
      assert.equal(diamond.blocks.includes("deepslate_diamond_ore"), version !== "1.8.8");
      if (version === "26.1.2") assert.ok(normal.find(entry => entry.name === "pale_oak_log"));
    } finally { controller.stop(); }
  });
for (const version of ["1.20.4", "26.1.2"])
  test(`web inventory actually serves, streams items, updates and cleans reconnect listeners on ${version}`, async (t) => {
    const { bot, original } = botFixture(version);
    const urls = [];
    const controller = await viewer.startWebInventory(bot, { onReady: (url) => urls.push(url) });
    t.after(() => controller.stop());
    assert.match(controller.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await (await fetch(controller.url)).text();
    assert.match(page, /Инвентарь бота/);
    const clientScript = await fetch(controller.url + "socket.io/socket.io.js");
    assert.equal(clientScript.status, 200);
    const baseline = bot.inventory.listenerCount("updateSlot");
    for (let attempt = 0; attempt < 2; attempt++) {
      const connection = await connect(controller.url);
      const events = await connection.next();
      const window = events.find(([name]) => name === "window")?.[1];
      assert.equal(window.slots[9].count, attempt ? 18 : 12);
      assert.ok(window.slots[9].texture.startsWith("data:"));
      assert.equal(original.texture, undefined, "viewer must not mutate Mineflayer items");
      if (!attempt) {
        const changed = { ...original, count: 18 };
        bot.inventory.slots[9] = changed;
        bot.inventory.emit("updateSlot", 9, original, changed);
        const updates = await connection.next();
        assert.equal(updates.find(([name]) => name === "windowUpdate")?.[1].slots[9].count, 18);
      }
      await connection.close();
      await sleep(30);
      assert.equal(bot.inventory.listenerCount("updateSlot"), baseline);
    }
    await controller.stop();
    await controller.stop();
    assert.equal(bot.webInventory.isRunning, false);
    assert.equal(urls.at(-1), null);
    assert.equal(bot.listenerCount("end"), 0);
  });

test("launcher inventory snapshots include live survival stats, all slots and equipment armor", async (t) => {
  const { bot, original } = botFixture("26.1.2");
  bot.username = "SCREEN_BOT";
  bot.health = 6;
  bot.food = 18;
  bot.foodSaturation = 4.5;
  bot.quickBarSlot = 2;
  bot.entity = { attributes: { "minecraft:max_health": { value: 20, modifiers: [] } } };
  const updates = [];
  for (const [slot, name] of [
    [5, "iron_helmet"],
    [6, "diamond_chestplate"],
    [8, "iron_boots"],
  ])
    bot.inventory.slots[slot] = {
      name,
      type: bot.registry.itemsByName[name].id,
      count: 1,
      durabilityUsed: 3,
    };
  const controller = viewer.startInventoryTelemetry(bot, {
    onUpdate: (snapshot) => updates.push(snapshot),
  });
  t.after(() => controller.stop());
  assert.equal(updates[0].health, 6);
  assert.equal(updates[0].food, 18);
  assert.equal(updates[0].armor, 12);
  assert.equal(updates[0].selectedSlot, 38);
  assert.equal(updates[0].slots[9].count, 12);
  assert.ok(updates[0].slots[9].texture.startsWith("data:"));
  assert.equal(original.texture, undefined);
  bot.health = 15;
  bot.food = 20;
  bot.entity.attributes["minecraft:armor"] = {
    value: 14,
    modifiers: [{ operation: 0, amount: 1 }],
  };
  bot.emit("health");
  bot.inventory.slots[9] = null;
  bot.inventory.emit("updateSlot", 9, original, null);
  await sleep(100);
  assert.equal(updates.at(-1).health, 15);
  assert.equal(updates.at(-1).food, 20);
  assert.equal(updates.at(-1).armor, 15);
  assert.equal(updates.at(-1).slots[9], null);
  assert.equal(updates.at(-1).occupied, 0);
  bot.emit("end");
  assert.equal(updates.at(-1), null);
  assert.equal(bot.inventory.listenerCount("updateSlot"), 0);
  assert.equal(bot.listenerCount("health"), 0);
});

test("launcher starts with real 26.1.2 enchanted command items and keeps high levels", async (t) => {
  const { bot } = botFixture("26.1.2");
  const Item = require("prismarine-item")(bot.registry);
  const expected = [{ name: "efficiency", level: 20 }, { name: "unbreaking", level: 100 }];
  for (const [slot, name] of [[36, "netherite_axe"], [37, "netherite_shovel"]]) {
    bot.inventory.slots[slot] = Item.fromNotch({ itemCount: 1, itemId: bot.registry.itemsByName[name].id,
      components: [{ type: "enchantments", data: { enchantments: expected.map(({ name, level }) =>
        ({ id: bot.registry.enchantmentsByName[name].id, level })) } }], removeComponents: [] });
  }
  const wire = structuredClone(Item.toNotch(bot.inventory.slots[37]));
  const updates = [];
  const controller = viewer.startInventoryTelemetry(bot, { onUpdate: snapshot => updates.push(snapshot) });
  t.after(() => controller.stop());
  assert.equal(updates.length, 1, "initial telemetry succeeds instead of aborting plugin initialization");
  assert.deepEqual(updates[0].slots[36].enchants, expected);
  assert.deepEqual(updates[0].slots[37].enchants, expected);
  bot.inventory.slots[36] = null;
  bot.inventory.emit("updateSlot", 36, null, null);
  await sleep(100);
  assert.equal(updates.at(-1).slots[36], null);
  assert.deepEqual(updates.at(-1).slots[37].enchants, expected);
  assert.deepEqual(Item.toNotch(bot.inventory.slots[37]), wire,
    "inventory telemetry retains the shovel's original enchantment component");
});
