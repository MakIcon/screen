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
    type: bot.registry.itemsByName.spruce_log.id,
    name: "spruce_log",
    displayName: "Spruce Log",
    count: 12,
    slot: 9,
  };
  bot.inventory.slots[9] = original;
  return { bot, original };
}
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
