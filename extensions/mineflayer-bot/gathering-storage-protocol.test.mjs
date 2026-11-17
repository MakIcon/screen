import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import gathering from "./gathering.cjs";
import { installCombatProtocol } from "./combat.cjs";
import { activateContainer, containerClick } from "./warehouse-geometry.cjs";

const require = createRequire(import.meta.url);
const rigs = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigs("ts-node").register({ project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)), transpileOnly: true });
const { createCacheWorld } = rigs("./tests/setup.ts");
const { Vec3 } = require("vec3");
const native = createRequire(require.resolve("mineflayer"));

function setup(t, version, { rejectTransfers = 0, fullNear = false, pushOnAim = false, pushOnOpen = false } = {}) {
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
  const bot = rig.bot;
  bot.physicsEnabled = false; bot.health = 20;
  bot.supportFeature = bot.registry.supportFeature;
  for (const name of ["entities", "inventory", "simple_inventory"])
    bot.loadPlugin(require(`mineflayer/lib/plugins/${name}`), { hideErrors: false });
  const Item = native("prismarine-item")(bot.registry);
  const windows = native("prismarine-windows")(version);
  const type = version === "1.8.8" ? "minecraft:chest" : "minecraft:generic_9x3";
  const player = Array(36).fill(null);
  player[27] = new Item(bot.registry.itemsByName.diamond.id, 5);
  bot.inventory.updateSlot(36, Item.fromNotch(Item.toNotch(player[27])));
  const chests = [2, 9].map(x => world.setBlock(new Vec3(x, 64, 0), "chest"));
  const stores = new Map(chests.map(chest => [chest.position.x, Array(27).fill(null)]));
  if (fullNear) stores.set(2, Array.from({ length: 27 }, () => new Item(bot.registry.itemsByName.stone.id, 64)));
  const packets = [], aims = [], routes = [], opened = [];
  let publishedAim;
  let serverWindow, serverX, id = 0, transferRound = 0, roundStarted = false, pushed = false;
  const serialize = native("minecraft-protocol").createSerializer({ state: "play", isServer: false, version });
  bot._client.state = "play";
  bot._client.write = (name, params) => {
    serialize.createPacketBuffer({ name, params });
    packets.push({ name, params });
    if (name === "block_place") {
      assert.equal(publishedAim, aims.at(-1), "rotation is published before the interaction packet");
      assert.ok(containerClick(bot, bot.blockAt(params.location)), "request must still be reachable");
      const targetX = params.location.x;
      setImmediate(() => {
        serverX = targetX; roundStarted = false;
        serverWindow = windows.createWindow(++id, type, "Chest", 27);
        [...stores.get(serverX), ...player].forEach((item, slot) => serverWindow.updateSlot(slot, item && Item.fromNotch(Item.toNotch(item))));
        opened.push(serverX);
        bot._client.emit("open_window", { windowId: id, inventoryType: version === "1.8.8" ? type : windows.windows[type].type,
          windowTitle: "Chest", slotCount: 27 });
        bot._client.emit("window_items", { windowId: id, stateId: id,
          items: serverWindow.slots.map(Item.toNotch), carriedItem: Item.toNotch(null) });
        if (pushOnOpen && !pushed) { pushed = true; bot.entity.position.x -= 5; }
      });
    } else if (name === "window_click") {
      if (!roundStarted) { roundStarted = true; transferRound++; }
      if (transferRound <= rejectTransfers) return; // modern client predicts success, server ignores the click
      serverWindow.acceptClick({ slot: params.slot, mouseButton: params.mouseButton, mode: params.mode, item: serverWindow.slots[params.slot] });
      stores.set(serverX, serverWindow.slots.slice(0, 27));
      player.splice(0, player.length, ...serverWindow.slots.slice(27, 63));
      if (bot.supportFeature("transactionPacketExists")) setImmediate(() => bot._client.emit("transaction", {
        windowId: params.windowId, action: params.action, accepted: true,
      }));
    }
  };
  installCombatProtocol(bot);
  bot.lookAt = async point => {
    aims.push(point.clone());
    if (pushOnAim && !pushed) { pushed = true; bot.entity.position.x -= 5; }
  };
  bot.waitForTicks = async () => { publishedAim = aims.at(-1); };
  bot.pathfinder = { isPathing: false, defaultMoveSettings: {}, setMoveOptions(settings) { Object.assign(this.defaultMoveSettings, settings); },
    stop: async () => {}, goto: async goal => { routes.push(goal.x); bot.entity.position = new Vec3(goal.x - 1.5, 64, 0.5); } };
  const work = gathering.createGatheringController(bot, { operationTimeoutMs: 800, dropWaitMs: 0 });
  work.configureStorage([{ id: "all", name: "Склад", filters: ["#all"], chests: chests.map(c => c.position) }]);
  t.after(async () => { await work.dispose(); rig.stopPassivePhysics(); });
  return { bot, work, player, stores, packets, aims, opened, routes, chests };
}

async function finish(f) {
  f.work.enqueue({ kind: "deposit" });
  const end = Date.now() + 5000;
  while (!f.work.snapshot.history.length && f.work.snapshot.phase !== "paused" && Date.now() < end) {
    f.bot.emit("physicsTick");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(f.work.snapshot.phase === "paused", false, JSON.stringify({ state: f.work.snapshot,
    clicks: f.packets.filter(p => p.name === "window_click"), player: f.player, opened: f.opened }));
  assert.equal(f.work.snapshot.history.length, 1, JSON.stringify(f.work.snapshot));
  assert.equal(f.work.snapshot.history[0].deposited, 5);
  assert.equal(f.player.filter(Boolean).length, 0, "server inventory really lost the loot");
  assert.equal(f.bot.listenerCount("windowOpen"), 0);
}

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(`real storage packets reach the farther chest after a full near chest on ${version}`, { timeout: 8000 }, async t => {
    const f = setup(t, version, { fullNear: true });
    await finish(f);
    assert.equal(f.stores.get(9)[0]?.count, 5);
    assert.ok(f.routes.includes(9));
    assert.deepEqual(f.opened, version === "1.8.8" ? [2, 9] : [2, 9, 9], "modern transfer is verified before leaving");
    assert.ok(f.aims.every(p => Math.abs(p.x - Math.round(p.x)) < 0.1), "aims at an actual face, not the hidden centre");
  });
}

test("ignored modern clicks are detected from a fresh server window and the same turn retries the loot", { timeout: 8000 }, async t => {
  const f = setup(t, "26.1.2", { rejectTransfers: 1 });
  await finish(f);
  assert.deepEqual(f.opened, [2, 2, 2, 2]);
  assert.equal(f.stores.get(2)[0]?.count, 5);
});

test("persistent server rejection does not count optimistic items and falls through to the next chest", { timeout: 8000 }, async t => {
  const f = setup(t, "1.20.4", { rejectTransfers: 2 });
  await finish(f);
  assert.equal(f.stores.get(2).filter(Boolean).length, 0);
  assert.equal(f.stores.get(9)[0]?.count, 5);
  assert.equal(f.work.snapshot.selection.storageStatus["all:2,64,0"].state, "unavailable");
});

test("a push while aiming cancels the stale interaction and approaches again before sending", { timeout: 8000 }, async t => {
  const f = setup(t, "26.1.2", { pushOnAim: true });
  await finish(f);
  assert.equal(f.opened.length, 2, "no click is sent from the pushed out-of-reach position");
  assert.equal(f.routes.length, 1, "walks back after the push; verification does not restart an already reachable route");
});

test("a player crossing the chosen face during aim prevents the click", async t => {
  const f = setup(t, "26.1.2");
  const block = f.chests[0], click = containerClick(f.bot, block);
  f.bot.lookAt = async () => { f.bot.entities[42] = { username: "crossing", position: new Vec3(1.6, 64, 0.5) }; };
  await assert.rejects(activateContainer(f.bot, block, click), /Позиция у сундука изменилась/);
  assert.equal(f.packets.some(p => p.name === "block_place"), false);
});

test("a push after the window opens is checked before any inventory clicks", { timeout: 8000 }, async t => {
  const f = setup(t, "26.1.2", { pushOnOpen: true });
  await finish(f);
  assert.equal(f.packets.some(p => p.name === "window_click" && p.params.windowId === 1), false);
  assert.deepEqual(f.opened, [2, 2, 2]);
});
