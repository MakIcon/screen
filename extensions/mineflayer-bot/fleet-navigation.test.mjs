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

test("fleet planning yields more CPU as workers join and ignores stale load", async t => {
  const peers = Array.from({ length: 99 }, (_, i) => ({ name: `worker-${i}`, pos: p(i * 4), route: [] }));
  const { nav, advance } = fixture(t, { peers });
  await flush();
  assert.ok(nav.workDelayMs > 0 && nav.workDelayMs <= 80);
  advance(2000);
  assert.equal(nav.workDelayMs, 0);
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
