import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import crew from "./fleet-crew.cjs";

const { createHub, createCrewLink, groupSites, siteSummary } = crew;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const at = (x, y, z) => ({ x, y, z });
const sites = (kind, positions, from) =>
  [...groupSites({ kind }, positions, from, "overworld").values()].map(siteSummary);

test("bots starting together lease different ore cells and caves stay at two miners", () => {
  const hub = createHub();
  const start = at(0, 40, 0);
  // Four small veins in one 16-block cave cube, one vein in the next cave.
  const ore = [at(1, 40, 1), at(9, 40, 1), at(1, 40, 9), at(9, 40, 9), at(20, 40, 1)];
  const request = { scope: "mine:iron", dim: "overworld", zone: "cube", zoneCap: 2 };
  const leased = ["a", "b", "c"].map((name) => {
    hub.handle(name, "beat", { pos: start, dim: "overworld" });
    return hub.handle(name, "claim", { ...request, pos: start, sites: sites("mine", ore, start) })
      .key;
  });
  assert.equal(new Set(leased).size, 3, "every bot works its own vein");
  assert.deepEqual(leased.slice(0, 2), ["overworld:0:5:0", "overworld:1:5:0"]);
  assert.equal(
    leased[2],
    "overworld:2:5:0",
    "the third miner goes to the other cave instead of crowding",
  );
});

test("trees take a team up to their size; a forced claim adds only one helper", () => {
  const hub = createHub();
  const from = at(0, 64, 0);
  const logs = Array.from({ length: 10 }, (_, index) => at(1, 64 + index, 1));
  const tree = sites("forest", logs, from);
  assert.equal(tree[0].cap, 2);
  const claim = (name, force = false) =>
    hub.handle(name, "claim", {
      scope: "forest:oak",
      dim: "overworld",
      pos: from,
      sites: tree,
      force,
      zone: "column",
      zoneCap: 3,
    });
  assert.equal(claim("a").team, 1);
  assert.equal(claim("b").team, 2, "a second bot joins the big tree");
  assert.equal(claim("c").key, null, "the tree is fully staffed");
  assert.equal(claim("c", true).team, 3, "an idle bot may help as one extra");
  assert.equal(claim("d", true).key, null);
});

test("scouting sends bots in different directions and skips scanned chunks", () => {
  const hub = createHub();
  const start = at(0, 64, 0);
  const targets = ["a", "b", "c", "d"].map((name) => {
    hub.handle(name, "beat", { pos: start, dim: "overworld" });
    return hub.handle(name, "explore", {
      scope: "forest:oak",
      dim: "overworld",
      pos: start,
      origin: start,
      radius: 128,
    });
  });
  assert.ok(targets.every((target) => target.type === "chunk"));
  assert.equal(new Set(targets.map((target) => target.chunk)).size, 4);
  for (let i = 0; i < targets.length; i++)
    for (let j = i + 1; j < targets.length; j++)
      assert.ok(
        Math.hypot(targets[i].x - targets[j].x, targets[i].z - targets[j].z) >= 32,
        "scouts spread out",
      );
  // A chunk reported as scanned is not scouted again.
  const scanned = [];
  for (let cx = -9; cx <= 8; cx++)
    for (let cz = -9; cz <= 8; cz++) scanned.push(`overworld:${cx}:${cz}`);
  hub.handle("e", "claim", {
    scope: "forest:oak",
    dim: "overworld",
    pos: start,
    sites: [],
    chunks: scanned,
  });
  assert.equal(
    hub.handle("e", "explore", {
      scope: "forest:oak",
      dim: "overworld",
      pos: start,
      origin: start,
      radius: 128,
    }).type,
    null,
  );
});

test("a site seen by one bot is offered to an idle bot elsewhere", () => {
  const hub = createHub();
  const here = at(0, 64, 0);
  const seen = sites("forest", [at(1, 64, 1), at(60, 64, 60)], here);
  assert.equal(
    hub.handle("a", "claim", { scope: "forest:oak", dim: "overworld", pos: here, sites: seen }).key,
    "overworld:0:0",
  );
  const far = at(100, 64, 100);
  const reply = hub.handle("b", "explore", {
    scope: "forest:oak",
    dim: "overworld",
    pos: far,
    origin: here,
    radius: 200,
  });
  assert.equal(reply.type, "site");
  assert.equal(reply.key, "overworld:15:15");
  // The far site is now reserved for b while it travels.
  assert.equal(
    hub.handle("c", "explore", {
      scope: "forest:oak",
      dim: "overworld",
      pos: far,
      origin: here,
      radius: 200,
    }).type,
    "chunk",
  );
});

test("a silent bot loses its lease", () => {
  let time = 0;
  const hub = createHub({ now: () => time });
  const site = sites("mine", [at(1, 10, 1)], at(0, 10, 0));
  const claim = (name) =>
    hub.handle(name, "claim", {
      scope: "mine:x",
      dim: "",
      pos: at(0, 10, 0),
      sites: site,
      zone: "cube",
    });
  assert.ok(claim("a").key);
  assert.equal(claim("b").key, null);
  time += 11000;
  assert.ok(claim("b").key, "the lease expired with the bot's heartbeat");
});

test("crew links elect one coordinator and fail over when it exits", async (t) => {
  const key = `test-${randomUUID()}`;
  const first = createCrewLink({ key, name: "a", beatMs: 50 });
  t.after(() => first.dispose());
  await delay(150);
  const second = createCrewLink({ key, name: "b", beatMs: 50 });
  t.after(() => second.dispose());
  for (let i = 0; i < 40 && second.role !== "member"; i++) await delay(25);
  assert.equal(first.role, "leader");
  assert.equal(second.role, "member");
  const site = sites("mine", [at(1, 10, 1)], at(0, 10, 0));
  const input = { scope: "mine:x", dim: "", pos: at(0, 10, 0), sites: site, zone: "cube" };
  assert.ok((await first.request("claim", input)).key);
  assert.equal(
    (await second.request("claim", input)).key,
    null,
    "the member sees the leader's lease",
  );
  first.dispose();
  for (let i = 0; i < 80 && second.role !== "leader"; i++) await delay(25);
  assert.equal(second.role, "leader");
  assert.ok((await second.request("claim", input)).key);
});

test("passage floors are shared with the other bots of the same dimension", () => {
  const hub = createHub();
  const beat = (name, input = {}) =>
    hub.handle(name, "beat", { pos: at(0, 40, 0), dim: "overworld", ...input });
  const first = beat("a", { floors: ["1,39,0", "2,38,0"] });
  assert.deepEqual(first.floors, [], "a bot does not get its own floors back");
  const seen = beat("b");
  assert.deepEqual(seen.floors, ["1,39,0", "2,38,0"]);
  beat("a", { floors: ["3,37,0"], floorSeq: first.floorSeq, floorEpoch: first.floorEpoch });
  const next = beat("b", { floorSeq: seen.floorSeq, floorEpoch: seen.floorEpoch });
  assert.deepEqual(next.floors, ["3,37,0"], "only new floors are sent");
  assert.deepEqual(
    beat("c", { dim: "the_nether" }).floors,
    [],
    "floors of another dimension are not mixed in",
  );
  // After a failover the new hub has another epoch and the bot rereads everything.
  const stale = beat("b", { floorSeq: 999, floorEpoch: "old" });
  assert.equal(stale.floors.length, 3);
});

test("traffic deltas retain geometry, resync after failover and expire normally", () => {
  let time = 1000;
  const hub = createHub({ now: () => time });
  const input = { dim: "overworld", pos: at(0.5, 64, 0.5), route: [at(1.5, 64, 0.5)],
    corridor: [at(1.5, 64, 0.5)], motion: [at(1.5, 64, 0.5)], storage: null };
  const initial = hub.handle("a", "traffic", input);
  const update = { delta: true, epoch: initial.epoch, dim: input.dim, pos: at(0.7, 64, 0.5) };
  assert.equal(hub.handle("a", "traffic", update).resync, undefined);
  const other = hub.handle("b", "traffic", { ...input, pos: at(5, 64, 0.5) });
  assert.deepEqual(other.peers.find(p => p.name === "a").route, input.route);
  assert.equal(createHub().handle("a", "traffic", update).resync, true);
  time += 2000;
  assert.equal(hub.handle("a", "traffic", update).resync, true);
  assert.equal(hub.handle("a", "traffic", input).resync, undefined);
  assert.equal(hub.handle("a", "traffic", { ...update, dim: "nether" }).resync, true);
});

test("completed routes use cursors, retain movement kinds and stay in their dimension", () => {
  const hub = createHub();
  const input = { dim: "overworld", pos: at(0, 64, 0) };
  const path = Array.from({ length: 9 }, (_, x) => ({ ...at(x + 0.5, 64, 0.5), kind: "Forward" }));
  hub.handle("a", "traffic", { ...input, routes: [path] });
  const seen = hub.handle("b", "traffic", input);
  assert.deepEqual(seen.routes, [path]);
  assert.equal(hub.handle("c", "traffic", { ...input, dim: "nether" }).routes.length, 0);
  assert.equal(hub.handle("b", "traffic", { ...input, routeSeq: seen.routeSeq, routeEpoch: seen.epoch }).routes.length, 0);
  assert.equal(hub.handle("b", "traffic", { ...input, routeSeq: seen.routeSeq, routeEpoch: "stale" }).routes.length, 1);
  const id = "overworld|0,64,0|8,64,0";
  hub.handle("a", "traffic", { ...input, invalidRoutes: [id] });
  const removed = hub.handle("b", "traffic", { ...input, routeSeq: seen.routeSeq, routeEpoch: seen.epoch });
  assert.deepEqual(removed.invalidRoutes, [id], "existing members receive invalidations too");
  assert.equal(hub.handle("new", "traffic", input).routes.length, 0, "new members cannot fetch a stale detour");
  assert.equal(hub.handle("b", "traffic", { ...input, routeEpoch: seen.epoch, invalidRouteSeq: removed.invalidRouteSeq }).invalidRoutes.length, 0);
});

test("100 independent crew channels drain simultaneous requests without losing replies or reservations", { timeout: 10000 }, async t => {
  const key = `hundred-${randomUUID()}`;
  const links = [];
  t.after(() => links.forEach(link => link.dispose()));
  links.push(createCrewLink({ key, name: "worker-0", beatMs: 100000 }));
  for (let i = 0; i < 40 && links[0].role !== "leader"; i++) await delay(25);
  assert.equal(links[0].role, "leader");
  for (let i = 1; i < 100; i++) links.push(createCrewLink({ key, name: `worker-${i}`, beatMs: 100000 }));
  for (let i = 0; i < 120 && links.some(link => !["leader", "member"].includes(link.role)); i++) await delay(25);
  assert.ok(links.every(link => ["leader", "member"].includes(link.role)));
  const positions = Array.from({ length: 100 }, (_, i) => at(i, 64, 0));
  const replies = await Promise.all(links.map(link => link.request("target", { dim: "overworld", positions })));
  assert.equal(new Set(replies.map(reply => reply.pos.x)).size, 100);
  // More than one parser slice over the same connection, preserving order.
  const burst = await Promise.all(Array.from({ length: 100 }, () => links[1].request("beat", { dim: "overworld", pos: at(1, 64, 0) })));
  assert.equal(burst.length, 100);
  assert.ok(burst.every(reply => reply.floorEpoch));
});
