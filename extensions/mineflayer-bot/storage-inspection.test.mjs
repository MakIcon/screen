import assert from "node:assert/strict";
import test from "node:test";
import { Vec3 } from "vec3";
import { createStorageInspection } from "./storage-inspection.cjs";
import worker from "./worker.cjs";

function fixture() {
  let finish;
  const events = [];
  const player = { username: "Owner", position: new Vec3(10, 64, 0) };
  const bot = { launcherOwnerName: "Owner", players: { Owner: { entity: player } }, health: 20,
    entity: { position: new Vec3(0, 64, 0) }, game: { dimension: "overworld" } };
  const gathering = { busy: true, async suspendForStorageInspection() {
    events.push("pause"); return () => events.push("resume");
  } };
  const scan = { id: 1, state: "complete", groups: [], records: [] };
  const production = { busy: false,
    prepareStorageScan(radius, owner, token, options) { return { radius, owner, token, ...options }; },
    scanStorage(plan) { events.push("scan"); this.plan = plan; this.busy = true;
      this.task = new Promise(resolve => { finish = () => { this.busy = false; resolve(); }; }); },
    snapshot: () => ({ storageScan: scan }),
    async stop() { scan.state = "cancelled"; finish?.(); },
  };
  const controller = createStorageInspection(bot, { gathering, production, stopMovement: async () => events.push("move") });
  return { bot, controller, events, production, player, finish: () => finish() };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("discovery holds the borrowed worker until its assigned section is inspected", async () => {
  const f = fixture();
  const discovery = f.controller.run(24, "team", { phase: "discover" });
  await flush(); f.finish(); await discovery;
  assert.equal(f.controller.busy, true);
  assert.equal(f.controller.probe().eligible, false);
  assert.equal(f.events.includes("resume"), false);
  const assignment = [{ name: "barrel", position: { x: 12, y: 64, z: 0 } }];
  const inspection = f.controller.run(24, "team", { phase: "inspect", blocks: assignment, teamSize: 3 });
  await flush();
  assert.equal(f.production.plan.owner, null);
  assert.equal(f.production.plan.blocks, assignment);
  assert.equal(f.production.plan.teamSize, 3);
  f.finish(); await inspection;
  assert.equal(f.events.filter(event => event === "pause").length, 1);
  assert.equal(f.events.filter(event => event === "resume").length, 1);
  assert.equal(f.controller.busy, false);
});

test("team cancellation releases a discovery reservation and rejects a queued helper assignment", async () => {
  const leader = fixture(), helper = fixture();
  const discovery = leader.controller.run(24, "cancel-team", { phase: "discover" });
  await flush(); leader.finish(); await discovery;
  await leader.controller.stop("cancel-team");
  await helper.controller.stop("cancel-team");
  await assert.rejects(helper.controller.run(24, "cancel-team", { phase: "inspect" }), /остановлен/);
  assert.equal(leader.controller.busy, false);
  assert.equal(leader.events.filter(event => event === "resume").length, 1);
  assert.deepEqual(helper.events, []);
});

test("a delayed cancellation cannot interrupt another scan token", async () => {
  const f = fixture();
  const operation = f.controller.run(24, "new-team");
  await flush(); await f.controller.stop("old-team");
  assert.equal(f.controller.busy, true);
  f.finish(); await operation;
  assert.equal(f.events.filter(event => event === "resume").length, 1);
});

test("inspection measures live owner distance without interrupting work", () => {
  const f = fixture();
  assert.equal(f.controller.probe().distance, 10);
  f.player.position.x = 3;
  assert.equal(f.controller.probe().distance, 3);
  assert.equal(f.controller.probe().eligible, true);
  assert.deepEqual(f.events, []);
  f.production.busy = true;
  assert.equal(f.controller.probe().eligible, false);
  f.player.isValid = false;
  assert.throws(() => f.controller.probe(), /не виден/);
});

test("scanning borrows a gathering worker, inspects near the owner and returns control", async () => {
  const f = fixture();
  const operation = f.controller.run(24, "request-one");
  await flush();
  assert.equal(f.controller.busy, true);
  assert.deepEqual(f.events, ["pause", "move", "scan"]);
  assert.equal(f.production.plan.owner(), f.player);
  assert.equal(f.production.plan.token, "request-one");
  f.finish();
  assert.equal((await operation).state, "complete");
  assert.deepEqual(f.events, ["pause", "move", "scan", "resume"]);
  assert.equal(f.controller.busy, false);
});

test("cancelling an inspection restores paused gathering without saving partial storage", async () => {
  const f = fixture();
  const operation = f.controller.run(16, "cancel");
  const rejected = assert.rejects(operation, /остановлен/);
  await flush();
  await f.controller.stop();
  await rejected;
  assert.equal(f.events.at(-1), "resume");
  assert.equal(f.controller.busy, false);
});

test("launcher keeps accepting stop while a chest inspection is running", async () => {
  const f = fixture(), results = [];
  await worker.handleLauncherMessages([
    JSON.stringify({ type: "storage_probe", requestId: "probe" }),
    JSON.stringify({ type: "storage_scan", action: "start", radius: 16, token: "cancel", requestId: "start" }),
    JSON.stringify({ type: "storage_scan", action: "stop", requestId: "stop" }),
  ], () => f.bot, (type, value) => results.push({ type, ...value }));
  assert.equal(results.find(result => result.requestId === "probe").result.distance, 10);
  assert.match(results.find(result => result.requestId === "start").error, /остановлен/);
  assert.equal(results.find(result => result.requestId === "stop").error, undefined);
  assert.equal(f.controller.busy, false);
});

test("launcher classifies results from all sections together without editing the worker's own storage", async () => {
  const f = fixture(), results = [];
  f.bot.launcherConfigureStorage = () => assert.fail("classification must be read-only");
  const records = Array.from({ length: 4 }, (_, x) => ({
    name: "barrel", position: { x, y: 64, z: 0 }, positions: [{ x, y: 64, z: 0 }],
    distance: x, totalSlots: 27, freeSlots: x === 0 ? 26 : 27,
    contents: x === 0 ? [{ name: "diamond", count: 2 }] : [], category: x === 0 ? "#valuable" : null,
  }));
  await worker.handleLauncherMessages([
    JSON.stringify({ type: "storage_assign", records, requestId: "assign-team" }),
  ], () => f.bot, (_type, value) => results.push(value));
  const assigned = results[0].result;
  assert.equal(assigned.records.length, 4);
  assert.equal(assigned.added, 4);
  assert.equal(assigned.groups.filter(group => group.filters.includes("#valuable")).flatMap(group => group.chests).length, 1);
  assert.equal(assigned.records.filter(record => record.category === "#bulk").length, 3);
  assert.deepEqual(f.events, []);
});

test("launcher can recover an interrupted section's checked records without resuming work", async () => {
  const f = fixture(), results = [];
  const scan = f.production.snapshot().storageScan;
  Object.assign(scan, { token: "interrupted", state: "cancelled", records: Array.from({ length: 55 }, (_, x) => ({ position: { x, y:64, z:0 }, contents: [] })) });
  await worker.handleLauncherMessages([JSON.stringify({ type:"storage_scan", action:"snapshot", requestId:"snapshot" })], () => f.bot, (_type, value) => results.push(value));
  assert.equal(results[0].result.state, "cancelled");
  assert.equal(results[0].result.records.length, 55);
  assert.deepEqual(f.events, []);
});
