import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { Vec3 } from "vec3";
import fleet from "./fleet-navigation.cjs";
import crew from "./fleet-crew.cjs";
import pathfinder from "./pathfinder.cjs";

const p = (x, z = 0.5) => new Vec3(x, 64, z);
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, { enabled = true, peers = [], allowed = true, blocker = null, narrow = false } = {}) {
  let time = 1000;
  const bot = new EventEmitter();
  bot.entity = { position: p(0.5), onGround: true };
  bot.entities = {};
  bot.game = { dimension: "overworld" };
  bot.controls = {};
  bot.setControlState = (key, value) => { bot.controls[key] = value; };
  bot.look = async () => {};
  bot.blockAt = pos => {
    const solid = pos.y < 64 || (narrow && Math.floor(pos.z) !== 0);
    return { name: solid ? "stone" : "air", boundingBox: solid ? "block" : "empty",
      shapes: solid ? [[0, 0, 0, 1, 1, 1]] : [], getProperties: () => ({}) };
  };
  bot.pathfinder = { isPathing: true, currentIndex: 0, currentPath: [], reset: async () => {} };
  const requests = [];
  const link = { request: async (op, input) => { requests.push({ op, input }); return { peers, allowed, blocker }; } };
  const nav = fleet.createFleetNavigation(bot, link, { enabled, now: () => time, pollMs: 100000, cpuCount: 8 });
  t.after(() => nav.dispose());
  return { bot, nav, requests, advance: ms => { time += ms; } };
}

test("solo navigation preserves goals and never pauses", async t => {
  const { nav } = fixture(t);
  await flush();
  const goal = nav.adaptGoal(new pathfinder.goals.GoalNear(4.5, 64, 0.5, 1), "come");
  assert.equal(goal.isEnd({ exitPos: p(3.5) }), true);
  assert.equal(goal.isEnd({ exitPos: p(2.5) }), false);
  assert.equal(goal.distance, 1);
  assert.equal(nav.cost(p(0.5), p(1.5)), 0);
  assert.equal(nav.pause({ exitPos: p(1.5) }), false);
});

test("a healthy 100-bot fleet does not get an artificial search delay", async t => {
  const peers = Array.from({ length: 99 }, (_, i) => ({ name: `worker-${i}`, pos: p(i * 4), route: [] }));
  const { nav, advance } = fixture(t, { peers });
  await flush();
  assert.equal(nav.workDelayMs, 0);
  advance(2000);
  assert.equal(nav.workDelayMs, 0);
});

test("traffic sends deltas, retries a missing hub snapshot and republishes changes that arrive in flight", async t => {
  const { bot, nav } = fixture(t);
  await flush();
  const calls = [];
  let release, held = false;
  const hub = crew.createHub();
  const link = { request: async (op, input) => {
    calls.push(input);
    if (held) { held = false; await new Promise(resolve => { release = resolve; }); }
    return hub.handle("delta-worker", op, input);
  } };
  nav.dispose();
  const current = fleet.createFleetNavigation(bot, link, { pollMs: 100000 });
  t.after(() => current.dispose());
  await flush();
  current.setStoragePhase("gathering", [p(10)]);
  await flush();
  const bytes = JSON.stringify(calls.at(-1)).length;
  current.setStoragePhase("gathering", [p(10)]);
  await flush();
  assert.equal(calls.at(-1).delta, true);
  assert.equal(Object.hasOwn(calls.at(-1), "storage"), false);
  assert.ok(JSON.stringify(calls.at(-1)).length < bytes);
  hub.drop("delta-worker");
  current.setStoragePhase("gathering", [p(10)]);
  await flush();
  assert.equal(calls.at(-2).delta, true);
  assert.equal(calls.at(-1).delta, undefined, "resync immediately sends a full snapshot");
  held = true;
  current.setStoragePhase("gathering", [p(10)]);
  current.setStoragePhase("leaving", [p(10)]);
  release();
  await flush(); await flush();
  assert.equal(calls.at(-1).storage.phase, "leaving", "does not lose a new departure while an older request is in flight");
});

test("only completed routes are shared, and received routes disappear after a terrain update", async t => {
  const hub = crew.createHub();
  const { bot, nav } = fixture(t);
  nav.dispose();
  bot.username = "route-worker";
  const current = fleet.createFleetNavigation(bot, { request: async (op, input) => hub.handle("route-worker", op, input) }, { pollMs: 100000 });
  t.after(() => current.dispose());
  await flush();
  const Forward = class Forward {};
  const path = Array.from({ length: 8 }, (_, i) => ({ entryPos: p(i + 0.5), exitPos: p(i + 1.5),
    toBreak: [], toPlace: [], moveType: new Forward() }));
  bot.emit("pathGenerated", { path });
  await flush();
  assert.equal(hub.handle("observer", "traffic", { dim: "overworld", pos: p(0.5) }).routes.length, 0);
  bot.emit("goalFinished", {});
  await flush();
  const seen = hub.handle("observer", "traffic", { dim: "overworld", pos: p(0.5) });
  assert.equal(seen.routes.length, 1);
  assert.ok(current.routeFrom(p(2.5), q => q.x === 8.5));
  bot.emit("blockUpdate", null, { position: p(5.5) });
  assert.equal(current.routeFrom(p(2.5), q => q.x === 8.5), null);
  current.setStoragePhase("gathering", []);
  await flush();
  assert.equal(hub.handle("late-observer", "traffic", { dim: "overworld", pos: p(0.5) }).routes.length, 0,
    "the terrain invalidation reaches the shared coordinator");
});

test("route costs index local workers instead of scanning the whole fleet for every node", async t => {
  let reads = 0;
  const peers = Array.from({ length: 100 }, (_, i) => ({ name: `worker-${i}`, pos: p(100 + i * 4),
    get route() { reads++; return [p(101 + i * 4)]; } }));
  peers.push({ name: "nearby", pos: p(1.5), route: [] });
  const { nav } = fixture(t, { peers });
  await flush();
  for (let i = 0; i < 5000; i++) assert.equal(nav.cost(p(0.5), p(1.5)), 60);
  assert.ok(reads <= 100, `distant route reads=${reads}`);
});

test("crossing workers brake before momentum carries them together at a tunnel exit", async t => {
  const peer = { name: "crossing", pos: p(1.5, 1.6), route: [], moving: true };
  const { bot, nav } = fixture(t, { peers: [peer] });
  bot.entity.velocity = new Vec3(0.22, 0, 0);
  bot.entities[1] = { username: "crossing", position: peer.pos, velocity: new Vec3(0, 0, -0.22) };
  await flush();
  assert.equal(nav.pause({ exitPos: p(5.5) }), true);
  assert.equal(bot.controls.forward, false);
});

test("merged routes publish the current exit ahead rather than a passed raw waypoint", async t => {
  const { bot, requests } = fixture(t);
  await flush();
  bot.pathfinder.currentPath = [{ exitPos: p(-0.5) }, { exitPos: p(5.5) }];
  bot.pathfinder.currentMove = { exitPos: p(5.5) };
  bot.emit("pathGenerated", { path: bot.pathfinder.currentPath });
  await flush();
  const input = requests.at(-1).input;
  assert.ok(input.route.length > 0);
  assert.ok(input.route.every(point => point.x > bot.entity.position.x));
});

test("narrow rising routes reserve stairs at their actual feet heights", async t => {
  const { bot, requests } = fixture(t, { narrow: true });
  await flush();
  bot.pathfinder.currentPath = [{ exitPos: new Vec3(1.5, 65, 0.5) }, { exitPos: new Vec3(2.5, 66, 0.5) }];
  bot.emit("pathGenerated", { path: bot.pathfinder.currentPath });
  await flush();
  assert.ok(requests.at(-1).input.corridor.some(point => point.y > 64));
});

test("arrival avoids a teammate and restores the exact original radius when disabled", async t => {
  const peers = [{ name: "b", pos: p(4.5), route: [], moving: false }];
  const { nav } = fixture(t, { peers });
  await flush();
  const goal = nav.adaptGoal(new pathfinder.goals.GoalNear(4.5, 64, 0.5, 1), "come");
  assert.equal(goal.isEnd({ exitPos: p(4.5) }), false);
  assert.equal(goal.isEnd({ exitPos: p(6) }), true);
  assert.equal(nav.cost(p(3.5), p(4.5)) >= 60, true);
  nav.setEnabled(false);
  assert.equal(goal.isEnd({ exitPos: p(4.5) }), true);
  assert.equal(goal.isEnd({ exitPos: p(6) }), false);
  assert.equal(goal.distance, 1);
  assert.equal(nav.cost(p(3.5), p(4.5)), 0);
  assert.equal(nav.pause({ exitPos: p(4.5) }), false);
});

test("dynamic follow expands a crowded arrival area without replacing entity tracking", async t => {
  const peers = Array.from({ length: 15 }, (_, i) => ({ name: `b${i}`, pos: p(15 + i), route: [] }));
  const { nav } = fixture(t, { peers });
  await flush();
  const entity = { position: p(5.5) };
  const goal = nav.adaptGoal(pathfinder.goals.GoalFollowEntity.fromEntity(entity, 1, { dynamic: true }), "follow");
  assert.equal(goal.isEnd({ exitPos: p(8) }), true);
  entity.position = p(6.5); goal.update();
  assert.equal(goal.x, 6.5);
  nav.setEnabled(false);
  assert.equal(goal.isEnd({ exitPos: p(8) }), false);
  assert.equal(goal.sqDist, 1);
});

test("a queued bot stops sprinting and releases the queue after stale IPC", async t => {
  const { nav, bot, advance } = fixture(t, { allowed: false, blocker: "b",
    peers: [{ name: "b", pos: p(2.5), route: [p(1.5)], moving: true }] });
  await flush();
  bot.controls.forward = true; bot.controls.sprint = true;
  assert.equal(nav.pause({ exitPos: p(1.5) }), true);
  assert.equal(bot.controls.forward, false);
  assert.equal(bot.controls.sprint, false);
  assert.equal(nav.waiting, true);
  advance(2000);
  assert.equal(nav.pause({ exitPos: p(1.5) }), false);
  assert.equal(nav.waiting, false);
});

test("the losing opposing bot retreats on safe ground instead of pushing", async t => {
  const { nav, bot, advance } = fixture(t, { allowed: false, blocker: "b", narrow: true,
    peers: [{ name: "b", pos: p(2.5), route: [p(1.5), p(0.5)], moving: true }] });
  await flush();
  assert.equal(nav.pause({ exitPos: p(1.5) }), true);
  advance(400);
  assert.equal(nav.pause({ exitPos: p(1.5) }), true);
  assert.equal(bot.controls.forward, true, "walks towards a safe refuge/back out of the lane");
  assert.equal(bot.controls.jump, false);
});

test("yielding never walks over lava or an unsupported edge", async t => {
  const { nav, bot, advance } = fixture(t, { allowed: false, blocker: "b",
    peers: [{ name: "b", pos: p(2.5), route: [p(1.5), p(0.5)], moving: true }] });
  await flush();
  bot.blockAt = pos => ({ name: pos.y < 64 ? "lava" : "air", boundingBox: "empty", shapes: [] });
  nav.pause({ exitPos: p(1.5) }); advance(400); nav.pause({ exitPos: p(1.5) });
  assert.equal(bot.controls.forward, false);
});

test("corridor reservations admit a convoy, queue opposing traffic and expire", () => {
  let time = 1000;
  const hub = crew.createHub({ now: () => time });
  const corridor = [p(1.5), p(2.5), p(3.5), p(4.5)];
  const a = { dim: "overworld", pos: p(0.5), route: [p(1.5), p(2.5)], corridor };
  const b = { dim: "overworld", pos: p(5.5), route: [p(4.5), p(3.5)], corridor };
  assert.equal(hub.handle("a", "traffic", a).allowed, true);
  assert.equal(hub.handle("b", "traffic", b).allowed, false);
  assert.equal(hub.handle("c", "traffic", { ...a, pos: p(-2.5), route: [p(-1.5)] }).allowed, true);
  hub.handle("a", "traffic", { enabled: false });
  hub.handle("c", "traffic", { enabled: false });
  assert.equal(hub.handle("b", "traffic", b).allowed, true);
  time += 2000;
  assert.equal(hub.handle("a", "traffic", a).allowed, true);
});

test("traffic stays in its dimension and does not block the only exit permanently", () => {
  const hub = crew.createHub();
  const input = { pos: p(0.5), route: [p(1.5)], corridor: [p(1.5)], dim: "overworld" };
  hub.handle("a", "traffic", input);
  assert.equal(hub.handle("b", "traffic", { ...input, dim: "the_nether" }).allowed, true);
  hub.drop("a");
  assert.equal(hub.handle("c", "traffic", input).allowed, true);
});

test("escape and warehouse departure outrank entry, but an occupied passage drains first", () => {
  let time = 1000;
  const hub = crew.createHub({ now: () => time });
  const corridor = [p(1.5), p(2.5), p(3.5)];
  const incoming = { dim: "overworld", pos: p(0.5), route: [p(1.5)], corridor };
  const outgoing = { dim: "overworld", pos: p(4.5), route: [p(3.5)], corridor,
    storage: { phase: "leaving", positions: [p(5.5)] } };
  assert.equal(hub.handle("entry", "traffic", incoming).allowed, true);
  assert.equal(hub.handle("exit", "traffic", outgoing).allowed, true);
  assert.equal(hub.handle("entry", "traffic", incoming).allowed, false);
  const escape = { ...incoming, urgency: "escape" };
  assert.equal(hub.handle("entry", "traffic", escape).allowed, true);
  assert.equal(hub.handle("exit", "traffic", outgoing).allowed, false);
  hub.handle("entry", "traffic", { ...escape, pos: p(1.5), route: [p(2.5)] });
  time += 100;
  assert.equal(hub.handle("exit", "traffic", { ...outgoing, urgency: "escape" }).allowed, false,
    "priority never reverses a lane through an admitted occupant");
});

test("three-member waves close to new arrivals and retain the opposing wait across heartbeats", () => {
  let time = 0;
  const hub = crew.createHub({ now: () => time });
  const corridor = [p(1.5), p(2.5), p(3.5)];
  const east = x => ({ dim: "overworld", pos: p(x), route: [p(x + 1)], corridor });
  const west = { dim: "overworld", pos: p(5.5), route: [p(4.5)], corridor };
  assert.equal(hub.handle("a", "traffic", east(0.5)).allowed, true);
  assert.equal(hub.handle("west", "traffic", west).allowed, false);
  time = 100;
  assert.equal(hub.handle("b", "traffic", east(-1.5)).allowed, true);
  assert.equal(hub.handle("c", "traffic", east(-3.5)).allowed, true);
  assert.equal(hub.handle("d", "traffic", east(-5.5)).allowed, false);
  for (time = 200; time <= 3200; time += 100) {
    hub.handle("a", "traffic", east(0.5));
    hub.handle("b", "traffic", east(-1.5));
    hub.handle("c", "traffic", east(-3.5));
    hub.handle("west", "traffic", west);
  }
  assert.equal(hub.handle("west", "traffic", west).allowed, true);
  assert.equal(hub.handle("late", "traffic", east(-7.5)).allowed, false);
  assert.equal(hub.handle("a", "traffic", east(0.5)).allowed, false);
});

test("an aged waiter closes entry while admitted workers finish crossing", () => {
  let time = 0;
  const hub = crew.createHub({ now: () => time });
  const corridor = [p(1.5), p(2.5), p(3.5)];
  const east = { dim: "overworld", pos: p(1.5), route: [p(2.5)], corridor };
  const west = { dim: "overworld", pos: p(5.5), route: [p(4.5)], corridor };
  hub.handle("inside", "traffic", east);
  for (; time <= 3200; time += 100) {
    assert.equal(hub.handle("west", "traffic", west).allowed, false);
    east.pos = p(1.5 + time / 2000);
    east.route = [p(east.pos.x + 1)];
    assert.equal(hub.handle("inside", "traffic", east).allowed, true);
  }
  assert.equal(hub.handle("late", "traffic", { ...east, pos: p(-1.5), route: [p(-0.5)] }).allowed, false);
  hub.handle("inside", "traffic", { ...east, pos: p(4.5), route: [p(6.5)], corridor: [] });
  assert.equal(hub.handle("west", "traffic", west).allowed, true);
});

test("a motionless occupant cannot renew its right of way indefinitely", () => {
  let time = 0;
  const hub = crew.createHub({ now: () => time });
  const corridor = [p(1.5), p(2.5), p(3.5)];
  const stopped = { dim: "overworld", pos: p(1.5), route: [p(2.5)], corridor };
  const west = { dim: "overworld", pos: p(5.5), route: [p(4.5)], corridor };
  hub.handle("stopped", "traffic", stopped);
  for (; time <= 3200; time += 100) {
    hub.handle("west", "traffic", west);
    hub.handle("stopped", "traffic", stopped);
  }
  assert.equal(hub.handle("west", "traffic", west).allowed, true);
  assert.equal(hub.handle("stopped", "traffic", stopped).allowed, false);
});

test("a blocked walker promptly goes around the whole crowd and resumes its goal", async t => {
  const peers = [2.5, 4.5, 6.5].map((x, i) => ({ name: `crowd${i}`, pos: p(x), route: [p(x - 1), p(x - 2)], moving: true }));
  const { bot, nav, advance, requests } = fixture(t, { peers });
  let yaw = 0, resets = 0, widest = 0;
  bot.look = async value => { yaw = value; };
  bot.pathfinder.reset = async () => { resets++; };
  bot.pathfinder.currentPath = [{ exitPos: p(8.5) }];
  await flush();
  assert.equal(nav.pause({ exitPos: p(8.5) }), true);
  advance(150);
  assert.equal(nav.pause({ exitPos: p(8.5) }), true);
  assert.equal(bot.controls.forward, true, "starts the detour within 150ms");
  for (let step = 0; step < 55 && !resets; step++) {
    if (bot.controls.forward) bot.entity.position = bot.entity.position.offset(-Math.sin(yaw) * 0.14, 0, -Math.cos(yaw) * 0.14);
    widest = Math.max(widest, Math.abs(bot.entity.position.z - 0.5));
    assert.ok(peers.every(peer => bot.entity.position.distanceTo(peer.pos) > 0.9));
    advance(50);
    bot.emit("pathGenerated", { path: bot.pathfinder.currentPath });
    await flush();
    nav.pause({ exitPos: p(8.5) });
  }
  assert.ok(widest > 1.5, `uses the free shoulder: ${widest}`);
  assert.ok(bot.entity.position.x > 3.5, "advances alongside the crowd");
  assert.ok(resets > 0, "replans from the detour endpoint toward the existing goal");
  assert.ok(requests.some(r => r.input.motion?.some(point => point.z > 1.5)), "publishes its real maneuver to peers");
});

test("waiting storage workers temporarily step out of an exit lane", async t => {
  const peer = { name: "leaving", pos: p(2.5), route: [p(1.5), p(0.5)], moving: true };
  const { bot, nav } = fixture(t, { peers: [peer] });
  await flush();
  bot.pathfinder.isPathing = false;
  nav.setStoragePhase("gathering", [p(5.5)]);
  bot.emit("physicsTick");
  assert.equal(bot.controls.forward, true);
  assert.equal(nav.warehouseState.phase, "gathering", "the waiting storage operation is retained");
  bot.entity.position = p(0.5, 2.5);
  bot.emit("physicsTick");
  assert.equal(nav.clearing, true, "stays aside while the original waiting place is on the exit route");
  peer.pos = p(-3.5); peer.route = [p(-4.5)];
  bot.emit("physicsTick");
  assert.equal(nav.clearing, false, "the storage task can rejoin once the exiting bot has passed");
});

test("a storage service handoff releases an idle yielding worker's movement immediately", async t => {
  const peer = { name: "leaving", pos: p(2.5), route: [p(1.5), p(0.5)], moving: true };
  const { bot, nav } = fixture(t, { peers: [peer] });
  await flush();
  bot.pathfinder.isPathing = false;
  nav.setStoragePhase("gathering", [p(5.5)]);
  bot.emit("physicsTick");
  assert.equal(bot.controls.forward, true, "yielding has started");
  nav.setStoragePhase("service", [p(5.5)], p(0.5));
  assert.equal(bot.controls.forward, false, "opening a chest must not inherit W from yielding");
  assert.equal(nav.clearing, false);
  bot.emit("physicsTick");
  assert.equal(bot.controls.forward, false);
});

test("a detour stops immediately when its floor is removed", async t => {
  const { bot, nav, advance } = fixture(t, { peers: [{ name: "crowd", pos: p(2.5), route: [p(1.5)], moving: true }] });
  await flush();
  nav.pause({ exitPos: p(8.5) }); advance(150); nav.pause({ exitPos: p(8.5) });
  assert.equal(bot.controls.forward, true);
  bot.blockAt = () => ({ name: "air", boundingBox: "empty", shapes: [] });
  nav.pause({ exitPos: p(8.5) });
  assert.equal(bot.controls.forward, false);
});

test("one hundred traffic participants keep arbitration local and bounded", t => {
  let time = 0;
  const hub = crew.createHub({ now: () => time });
  const corridor = Array.from({ length: 20 }, (_, i) => p(i + 0.5));
  const started = performance.now();
  for (let round = 0; round < 10; round++, time += 180) for (let i = 0; i < 100; i++) {
    const direction = i % 2 ? 1 : -1, x = direction > 0 ? -1.5 - i : 22.5 + i;
    const reply = hub.handle(`worker${i}`, "traffic", { dim: "overworld", pos: p(x), route: [p(x + direction)], corridor });
    assert.equal(typeof reply.allowed, "boolean");
    assert.ok(reply.peers.length <= 99);
  }
  t.diagnostic(`1000 traffic publications: ${Math.round(performance.now() - started)}ms`);
});

test("traffic publishes structured escape and departure intent", async t => {
  const { bot, nav, requests } = fixture(t);
  await flush();
  bot.launcherGathering = { retreating: true };
  nav.setStoragePhase("leaving", [p(5.5)]);
  await flush();
  assert.equal(requests.at(-1).input.urgency, "escape");
  assert.equal(requests.at(-1).input.storage.phase, "leaving");
});

test("helpers reserve different physical blocks even for different resources", () => {
  const hub = crew.createHub();
  const positions = [p(1), p(2)];
  assert.deepEqual(hub.handle("a", "target", { dim: "overworld", positions }).pos, { x: 1, y: 64, z: 0.5 });
  assert.deepEqual(hub.handle("b", "target", { dim: "overworld", positions }).pos, { x: 2, y: 64, z: 0.5 });
  assert.equal(hub.handle("c", "target", { dim: "overworld", positions }).pos, null);
  hub.drop("a");
  assert.deepEqual(hub.handle("c", "target", { dim: "overworld", positions }).pos, { x: 1, y: 64, z: 0.5 });
});

test("one hundred workers get distinct blocks and abandoned work becomes available", () => {
  let time = 1000;
  const hub = crew.createHub({ now: () => time });
  const positions = Array.from({ length: 100 }, (_, i) => p(i));
  const taken = positions.map((_, i) => hub.handle(`bot${i}`, "target", { dim: "overworld", positions }).pos);
  assert.equal(new Set(taken.map(point => point.x)).size, 100);
  assert.equal(hub.handle("waiting", "target", { dim: "overworld", positions }).pos, null);
  time += 31000;
  assert.ok(hub.handle("waiting", "target", { dim: "overworld", positions }).pos);
});
