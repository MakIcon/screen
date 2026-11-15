import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { createHub } from "./fleet-crew.cjs";
import { withStorageTurn, parkingCell, parkingCellAsync, outsideStorage } from "./fleet-storage.cjs";
const require = createRequire(import.meta.url);
const { Vec3 } = require("vec3");
const position = new Vec3(0, 64, 0);
const ticket = (token, positions = [position], dim = "overworld") => ({ token, positions, dim });

test("100 bots unload FIFO across neighbouring chests and higher shelves", () => {
  const hub = createHub();
  const input = i => ticket(`ticket-${i}`, [position.offset(i % 8, Math.floor(i / 8) % 5, 0)]);
  for (let i = 0; i < 100; i++) {
    const reply = hub.handle(`bot-${i}`, "storage", input(i));
    assert.equal(reply.allowed, i === 0);
    assert.equal(reply.ahead, i);
  }
  for (let i = 0; i < 100; i++) {
    assert.equal(hub.handle(`bot-${i}`, "storage", input(i)).allowed, true);
    if (i < 99) assert.equal(hub.handle(`bot-${i + 1}`, "storage", input(i + 1)).allowed, false);
    hub.handle(`bot-${i}`, "storage", { token: `ticket-${i}`, release: true });
  }
});

test("storage queues are isolated by warehouse and dimension, and stale releases cannot cancel a new ticket", () => {
  const hub = createHub();
  hub.handle("a", "storage", ticket("old"));
  assert.equal(hub.handle("b", "storage", ticket("b", [position.offset(50, 0, 0)])).allowed, true);
  assert.equal(hub.handle("c", "storage", ticket("c", [position], "the_nether")).allowed, true);
  hub.handle("a", "storage", ticket("new"));
  hub.handle("a", "storage", { token: "old", release: true });
  assert.equal(hub.handle("d", "storage", ticket("d")).allowed, false);
  hub.drop("a");
  assert.equal(hub.handle("d", "storage", ticket("d")).allowed, true);
});

test("a disconnected or expired warehouse owner does not block the queue", () => {
  let time = 1000;
  const hub = createHub({ now: () => time });
  hub.handle("a", "storage", ticket("a"));
  assert.equal(hub.handle("b", "storage", ticket("b")).allowed, false);
  time += 4000;
  hub.handle("b", "storage", ticket("b"));
  time += 1500;
  assert.equal(hub.handle("b", "storage", ticket("b")).allowed, true);
});

test("simultaneous waiters cannot reserve the same parking bay", () => {
  const hub = createHub(), parking = position.offset(-12, 0, 0);
  hub.handle("owner", "storage", ticket("owner"));
  assert.deepEqual(hub.handle("a", "storage", { ...ticket("a"), parking }).bay, { x: -12, y: 64, z: 0 });
  assert.equal(hub.handle("b", "storage", { ...ticket("b"), parking }).bay, null);
  assert.deepEqual(hub.handle("b", "storage", { ...ticket("b"), parking: parking.offset(0, 0, 3) }).bay, { x: -12, y: 64, z: 3 });
});

function botAt(p = new Vec3(-12.5, 64, 0.5)) {
  return { entity: { position: p }, entities: {}, game: { dimension: "overworld" },
    blockAt: p => ({ name: p.y === 63 ? "stone" : "air", boundingBox: p.y === 63 ? "block" : "empty" }) };
}

test("parking search services protocol callbacks and cancels before scanning a whole volume", async () => {
  const abort = new AbortController();
  let examined = 0, yields = 0;
  const bot = botAt();
  bot.blockAt = () => {
    examined++;
    // Deterministic costly block reads model loaded collision data.
    const until = performance.now() + 0.02;
    while (performance.now() < until) {}
    return null;
  };
  await assert.rejects(parkingCellAsync(bot, [position], [], { signal: abort.signal,
    wait: async () => { yields++; await new Promise(resolve => setImmediate(resolve)); abort.abort(); } }), /прерван/);
  assert.equal(yields, 1);
  assert.ok(examined > 0 && examined < 1000, `examined ${examined} blocks before cancel`);
});

test("parking leaves the whole warehouse clear and reserves different safe places", () => {
  const bot = botAt(new Vec3(0.5, 64, 0.5));
  const chests = [position, position.offset(6, 4, 0)];
  const first = parkingCell(bot, chests);
  const second = parkingCell(bot, chests, [first]);
  assert.ok(first && second);
  assert.ok(outsideStorage(first, chests) && outsideStorage(second, chests));
  assert.ok(first.distanceTo(second) >= 2);
  bot.blockAt = () => null;
  assert.equal(parkingCell(bot, chests), null, "never parks on unloaded or missing floors");
});

test("a cancelled waiter releases its ticket without approaching the chests", async () => {
  const hub = createHub(), abort = new AbortController();
  hub.handle("owner", "storage", ticket("owner"));
  const crew = { request: async (op, input) => hub.handle("waiter", op, input) };
  await assert.rejects(withStorageTurn(botAt(), crew, [position], {
    signal: abort.signal, status() {}, walk() { assert.fail("waiter must stay away"); },
    wait: async () => { abort.abort(); throw new Error("cancelled"); },
  }, () => assert.fail("must not unload before its turn")), /cancelled|прервана/);
  hub.drop("owner");
  assert.equal(hub.handle("next", "storage", ticket("next")).allowed, true);
});

test("an unresponsive warehouse owner aborts and frees the next of 53 queued workers", { timeout: 2000 }, async () => {
  const hub = createHub(), parent = new AbortController();
  const keepAlive = setInterval(() => {}, 20);
  let actionSignal, cancelled = false;
  try {
    await assert.rejects(withStorageTurn(botAt(), { request: async (op, input) => hub.handle("stuck", op, input) }, [position], {
      signal: parent.signal, wait: ms => new Promise(resolve => setTimeout(resolve, ms)), walk: async () => {},
      status() {}, stallMs: 60, onStalled() { cancelled = true; },
    }, async (_leave, signal) => {
      actionSignal = signal;
      for (let i = 0; i < 52; i++) assert.equal(hub.handle(`waiting-${i}`, "storage", ticket(`waiting-${i}`)).allowed, false);
      await new Promise(() => {});
    }), /очередь освобождена/);
    assert.equal(cancelled, true);
    assert.equal(actionSignal.aborted, true);
    assert.equal(hub.handle("waiting-0", "storage", ticket("waiting-0")).allowed, true);
  } finally { clearInterval(keepAlive); }
});

test("confirmed transfers keep a long warehouse operation alive and listeners are removed", { timeout: 2000 }, async () => {
  const hub = createHub();
  const bot = Object.assign(new EventEmitter(), botAt());
  bot.inventory = new EventEmitter();
  const updates = setInterval(() => bot.inventory.emit("updateSlot", 9, null, {}), 15);
  try {
    const result = await withStorageTurn(bot, { request: async (op, input) => hub.handle("active", op, input) }, [position], {
      signal: new AbortController().signal, wait: async () => {}, walk: async () => {}, status() {}, stallMs: 50,
    }, async () => { await new Promise(resolve => setTimeout(resolve, 160)); return "done"; });
    assert.equal(result, "done");
    assert.equal(bot.inventory.listenerCount("updateSlot"), 0);
    assert.equal(bot.listenerCount("diggingCompleted"), 0);
  } finally { clearInterval(updates); }
});

test("the storage turn is held through departure and released on transfer failure", async () => {
  const hub = createHub();
  const crew = { request: async (op, input) => hub.handle("owner", op, input) };
  let left = false;
  await assert.rejects(withStorageTurn(botAt(new Vec3(1.5, 64, 0.5)), crew, [position], {
    signal: new AbortController().signal, status() {}, wait: async () => {},
    walk: async p => {
      assert.ok(outsideStorage(p, [position]));
      assert.equal(hub.handle("next", "storage", ticket("next")).allowed, false);
      left = true;
    },
  }, async leave => {
    await leave();
    throw new Error("transfer failed");
  }), /transfer failed/);
  assert.equal(left, true);
  assert.equal(hub.handle("next", "storage", ticket("next")).allowed, true);
});
