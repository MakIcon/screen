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

function warehouse(count, time = { now: 1000 }) {
  const hub = createHub({ now: () => time.now });
  const positions = [position, position.offset(3, 0, 0), position.offset(6, 0, 0), position.offset(9, 0, 0)];
  const bays = positions.map(p => ({ ...p.offset(0.5, 0, -1.5), chest: p }));
  const stages = Array.from({ length: count }, (_, i) => position.offset(i * 2 + 0.5, 0, 8.5));
  const input = (i, extra = {}) => ({ token: `wave-${i}`, dim: "overworld", positions, batch: true, bays, stages,
    pos: stages[i], ready: true, ...extra });
  const ask = (i, extra) => hub.handle(`worker-${i}`, "storage", input(i, extra));
  const leave = i => hub.handle(`worker-${i}`, "storage", { token: `wave-${i}`, release: true });
  return { hub, time, positions, bays, stages, ask, leave };
}

test("53 workers continuously refill independent bays while a slow customer stays at its chest", () => {
  const { time, bays, ask, leave } = warehouse(53);
  for (let i = 0; i < 53; i++) ask(i, { ready: false });
  for (let i = 0; i < 53; i++) ask(i);
  const first = Array.from({ length: 53 }, (_, i) => ask(i));
  assert.deepEqual(first.map((r, i) => r.allowed ? i : -1).filter(i => i >= 0), [0, 1, 2, 3], "four physical places are available");
  assert.equal(new Set(first.filter(r => r.allowed).map(r => `${r.service.x},${r.service.z}`)).size, 4);
  assert.equal(new Set(first.map(r => `${r.stage.x},${r.stage.z}`)).size, 53, "everyone else waits at a place of its own");
  time.now += 1000;
  // Transferring items alone must not put a replacement inside the old body.
  for (let i = 0; i < 4; i++) ask(i, { done: true, pos: bays[i] });
  assert.equal(ask(4).allowed, false, "all four places still have a body");
  ask(0, { done: true });
  assert.equal(ask(4).allowed, true);
  assert.equal(ask(5).allowed, false, "only the one free bay was refilled");
  // Three slow workers keep their places while the other fifty finish FIFO.
  for (let i = 4; i < 53; i++) {
    assert.equal(ask(i).allowed, true, `worker ${i} takes the independently freed bay`);
    assert.deepEqual(ask(i).service, first[0].service);
    leave(i);
  }
  for (let i = 0; i < 4; i++) leave(i);
});

test("an early worker and later arrivals use free bays without a bell or a batch deadline", () => {
  const { time, ask } = warehouse(6);
  for (let i = 0; i < 6; i++) ask(i, { ready: false });
  assert.equal(ask(0).allowed, true, "the first ready worker starts immediately");
  time.now += 1000;
  assert.equal(ask(2).allowed, true);
  time.now += 1600;
  assert.equal(ask(1, { ready: false }).allowed, false);
  time.now += 300;
  assert.equal(ask(1).allowed, true);
  time.now += 1000;
  assert.equal(ask(3).allowed, true, "the fourth place still works after the old wave deadline");
});

test("walking along the chest wall frees the old bay but keeps the body at another chest reserved", () => {
  const { time, ask, bays, positions } = warehouse(8);
  for (let i = 0; i < 8; i++) ask(i, { ready: i < 4 });
  time.now += 1000;
  for (let i = 1; i < 4; i++) ask(i, { done: true });
  ask(0, { done: true, pos: bays[2] });
  const replies = [ask(4), ask(5), ask(6), ask(7)];
  assert.equal(replies.filter(r => r.allowed).length, 3);
  assert.ok(replies.filter(r => r.allowed).every(r => Math.hypot(r.service.x - bays[2].x, r.service.z - bays[2].z) >= 1.3));
  ask(0, { done: true, pos: positions[2].offset(0, 0, 6) });
  assert.equal(ask(7).allowed, true, "the last place opens when its body is clear");
});

test("a failed or disconnected customer releases only its own bay", () => {
  const { time, ask, leave, bays } = warehouse(8);
  for (let i = 0; i < 8; i++) ask(i);
  time.now += 1000;
  leave(0); // error: the ticket is released from the chest itself
  for (let i = 1; i < 3; i++) ask(i, { done: true });
  ask(3, { pos: bays[3] }); // stops answering while still unloading
  for (let i = 4; i < 7; i++) assert.equal(ask(i).allowed, true, "one slow colleague cannot hold other bays");
  assert.equal(ask(7).allowed, false);
  time.now += 5100;
  // Its own ticket lapsed as well: it lines up again and goes.
  assert.equal(ask(7, { pos: ask(7).stage }).allowed, true, "an expired ticket frees its bay");
});

test("waiting places skip a paused colleague standing there without a ticket", () => {
  const { hub, stages, ask } = warehouse(4);
  hub.handle("failed", "traffic", { enabled: true, dim: "overworld", pos: stages[0], route: [] });
  hub.handle("passing", "traffic", { enabled: true, dim: "overworld", pos: stages[1], route: [stages[2]] });
  const reply = ask(0, { ready: false, pos: stages[3] });
  assert.deepEqual([reply.stage.x, reply.stage.z], [stages[1].x, stages[1].z], "a bot merely walking past does not reserve the place");
});

test("crossing entrance/exit corridors cannot be assigned to two workers at once", () => {
  const { ask, leave, bays } = warehouse(3);
  const horizontal = { ...bays[0], inbound: [position.offset(-4, 0, -1.5)], outbound: [position.offset(6, 0, -1.5)] };
  const vertical = { ...bays[2], inbound: [position.offset(3, 0, -5)], outbound: [position.offset(3, 0, 4)] };
  assert.equal(ask(0, { bays: [horizontal] }).allowed, true);
  assert.equal(ask(1, { bays: [vertical] }).allowed, false, "the corridors cross between their endpoints");
  leave(0);
  assert.equal(ask(1, { bays: [vertical] }).allowed, true);
});

test("a paused body still blocks its bay after its expired ticket is removed", () => {
  const { hub, time, ask, bays } = warehouse(2);
  ask(0, { bays: [bays[0]] });
  time.now += 5100;
  hub.handle("worker-0", "traffic", { enabled: true, dim: "overworld", pos: bays[0], route: [] });
  const stage = ask(1, { bays: [bays[0]], ready: false }).stage;
  assert.equal(ask(1, { bays: [bays[0]], pos: stage }).allowed, false);
  hub.handle("worker-0", "traffic", { enabled: true, dim: "overworld", pos: position.offset(0, 0, 7), route: [] });
  assert.equal(ask(1, { bays: [bays[0]], pos: stage }).allowed, true);
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
