import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";
import { performance } from "node:perf_hooks";
const require = createRequire(import.meta.url);
const { Vec3 } = require("vec3");
const { chooseCombatAction, observedHealth, createCombatBrain } = require("./combat-brain.cjs");
const { crystalOpportunity } = require("./combat-brain.cjs");
const { createCombatFootwork } = require("./combat-footwork.cjs");
const { walkSegment } = require("./crystal-movement.cjs");
const defaults = require("./combat-defaults.json");

const situation = {
  health: 20,
  enemyHealth: null,
  distance: 3,
  reach: 3,
  damage: 0,
  visible: true,
  airborne: false,
  blocking: false,
  axe: true,
  heal: {},
  canRecover: true,
  pearlEscape: true,
  pearlMinHealth: 8,
};
test("director prioritizes survival, reachable finishes, shield breaks and pressure", () => {
  const action = (patch) => chooseCombatAction({ ...situation, ...patch }).action;
  assert.equal(action({ distance: 9 }), "push");
  assert.equal(action({}), "pressure");
  assert.equal(action({ health: 10, enemyHealth: 3 }), "finish");
  assert.equal(action({ health: 5, enemyHealth: 3 }), "retreat", "do not gamble a lethal trade");
  assert.equal(action({ health: 10, blocking: true, enemyHealth: 3 }), "escape");
  assert.equal(action({ health: 20, blocking: true }), "break_shield");
  assert.equal(action({ enemyUsingItem: true }), "punish");
  assert.equal(action({ health: 8 }), "escape");
  assert.equal(action({ health: 6 }), "retreat", "pearl damage is not affordable");
  assert.equal(action({ health: 8, distance: 7 }), "heal");
  assert.equal(action({ health: 8, visible: false }), "heal");
  assert.equal(action({ health: 8, airborne: true }), "pressure", "finish airborne manoeuvre");
  assert.equal(action({ health: 8, heal: null }), "pressure", "no empty healing loop");
  assert.equal(action({ health: 8, canRecover: false }), "pressure", "bounded failed retreat");
  assert.equal(action({ food: 4, needsFood: true, pearlEscape: false }), "retreat");
});

function fixture() {
  const bot = new EventEmitter();
  let time = 0,
    scans = 0;
  const items = [
    { name: "diamond_sword" },
    { name: "golden_apple" },
    { name: "ender_pearl", count: 2 },
  ];
  bot.entity = { position: new Vec3(0, 64, 0) };
  bot.health = 20;
  bot.food = 20;
  bot.registry = {
    entitiesByName: {
      player: { metadataKeys: ["health", "player_absorption", "living_entity_flags"] },
    },
  };
  bot.inventory = Object.assign(new EventEmitter(), {
    items: () => {
      scans++;
      return items;
    },
  });
  bot.launcherSurvival = { requestCombatHeal() {} };
  const target = { name: "player", position: new Vec3(3, 64, 0), metadata: [], equipment: [] };
  const brain = createCombatBrain(bot, { ...defaults, pearlEnabled: true }, { now: () => time });
  return {
    bot,
    target,
    brain,
    items,
    scans: () => scans,
    time: (value) => {
      time = value;
    },
  };
}

test("reported health is version mapped, includes absorption and never invented", () => {
  const f = fixture();
  try {
    assert.equal(observedHealth(f.bot, f.target).effective, null);
    f.target.metadata = [3, 8, 0];
    assert.equal(f.brain.evaluate(f.target, { visible: true }).action, "pressure");
    assert.equal(observedHealth(f.bot, f.target).effective, 11);
    f.target.metadata[1] = 0;
    assert.equal(f.brain.evaluate(f.target, { visible: true }).action, "finish");
    f.target.metadata[0] = NaN;
    assert.equal(observedHealth(f.bot, f.target).effective, null);
    f.target.metadata[0] = "3";
    assert.equal(observedHealth(f.bot, f.target).effective, null);
  } finally {
    f.brain.dispose();
  }
});

test("health reacts immediately, inventory is cached, updates invalidate it, apples have a recovery window", () => {
  const f = fixture();
  try {
    f.brain.evaluate(f.target, { visible: true });
    for (let n = 0; n < 30; n++) f.brain.evaluate(f.target, { visible: true });
    assert.equal(f.scans(), 1);
    f.bot.health = 9;
    f.bot.emit("health");
    const decision = f.brain.evaluate(f.target, { visible: true });
    assert.equal(decision.action, "escape");
    assert.equal(decision.damage, 11);
    f.items.pop();
    f.bot.inventory.emit("updateSlot");
    assert.equal(f.brain.evaluate(f.target, { visible: true }).action, "retreat");
    assert.equal(f.scans(), 2);
    f.brain.recovered(decision.heal, true);
    f.time(1500);
    assert.equal(f.brain.evaluate(f.target, { visible: true }).heal, null);
    f.time(6000);
    assert.equal(f.brain.evaluate(f.target, { visible: true }).action, "retreat");
    assert.equal(f.brain.decision.damage, 0);
  } finally {
    f.brain.dispose();
  }
  assert.equal(f.bot.listenerCount("health"), 0);
  assert.equal(f.bot.inventory.listenerCount("updateSlot"), 0);
});

test("hunger uses ordinary food instead of spending a golden apple", () => {
  const f = fixture();
  const food = { name: "cooked_beef" };
  f.bot.autoEat = { needsFood: () => true, bestFood: () => food };
  f.bot.food = 5;
  assert.equal(f.brain.evaluate(f.target, { visible: true }).heal, food);
  f.brain.dispose();
});

test("direct pursuit closes distance; strafe is bounded and rejects cliffs and unknown terrain", () => {
  const f = fixture(),
    controls = {};
  Object.assign(f.bot.entity, { yaw: -Math.PI / 2, width: 0.6, onGround: true });
  f.bot.setControlState = (key, value) => {
    controls[key] = value;
  };
  f.bot.pathfinder = { goal: null, defaultMoveSettings: {} };
  const flat = (p) => ({
    name: p.y < 64 ? "stone" : "air",
    boundingBox: p.y < 64 ? "block" : "empty",
  });
  f.bot.blockAt = flat;
  let time = 0;
  const movement = createCombatFootwork(f.bot, defaults, { now: () => time });
  f.target.position.x = 10;
  assert.equal(movement.tick(f.target, { action: "push" }), true);
  assert.equal(controls.forward, true);
  assert.equal(controls.sprint, true);
  assert.equal(controls.left || controls.right, false, "no sideways approach dance");
  f.target.position.x = 2.8;
  movement.tick(f.target, { action: "pressure" });
  assert.equal(controls.forward, true);
  assert.equal(controls.left || controls.right, true);
  const side = controls.left;
  time = 200;
  movement.tick(f.target, { action: "pressure" });
  assert.equal(controls.left, side, "do not alternate every tick");
  f.bot.blockAt = (p) => (Math.abs(p.z) > 0.5 ? { name: "air", boundingBox: "empty" } : flat(p));
  movement.tick(f.target, { action: "pressure" });
  assert.equal(controls.left || controls.right, false, "do not strafe into a drop");
  f.bot.blockAt = () => null;
  assert.equal(movement.tick(f.target, { action: "push" }), false);
  assert.equal(controls.forward, false);
  f.brain.dispose();
});

test("director decision cost stays comfortably below a physics tick", (t) => {
  const f = fixture();
  try {
    const start = performance.now();
    for (let i = 0; i < 20000; i++) f.brain.evaluate(f.target, { visible: true });
    const elapsed = performance.now() - start;
    t.diagnostic(
      `20000 decisions: ${elapsed.toFixed(1)} ms (${(elapsed / 20000).toFixed(4)} ms/decision); ${f.scans()} inventory scan`,
    );
    assert.ok(elapsed < 3000, `decision work unexpectedly slow: ${elapsed} ms`);
    assert.equal(f.scans(), 1);
  } finally {
    f.brain.dispose();
  }
});

test("pursuit checks its full initial corridor and sees changed terrain on the next tick", () => {
  const f = fixture(),
    controls = {};
  Object.assign(f.bot.entity, { yaw: -Math.PI / 2, width: 0.6, onGround: true });
  f.bot.setControlState = (name, value) => {
    controls[name] = value;
  };
  f.bot.pathfinder = { defaultMoveSettings: {} };
  f.target.position.x = 12;
  let wall = 4,
    missingFloor = false;
  f.bot.blockAt = (point) => {
    const x = Math.floor(point.x),
      y = Math.floor(point.y);
    const solid = (y < 64 && !(missingFloor && x === 1)) || (x === wall && y < 67);
    return { name: solid ? "stone" : "air", boundingBox: solid ? "block" : "empty" };
  };
  const movement = createCombatFootwork(f.bot, defaults);
  try {
    assert.equal(
      movement.tick(f.target),
      false,
      "a short clear lead cannot replace the initial six-block check",
    );
    wall = null;
    movement.reset();
    assert.equal(movement.tick(f.target), true);
    wall = 1;
    assert.equal(movement.tick(f.target), false, "a new wall is visible immediately");
    assert.equal(controls.forward, false);
    wall = null;
    movement.reset();
    assert.equal(movement.tick(f.target), true);
    missingFloor = true;
    assert.equal(movement.tick(f.target), false, "a removed floor is visible immediately");
  } finally {
    f.brain.dispose();
  }
});

test("corridor checks keep fractional heights, player width and hazardous edge checks", () => {
  const bot = {
    entity: { position: new Vec3(-3.5, 64.5, -0.5), width: 0.6 },
    setControlState() {},
  };
  let obstacle = null;
  bot.blockAt = (point) => {
    const x = Math.floor(point.x),
      y = Math.floor(point.y),
      z = Math.floor(point.z);
    if (obstacle && x === -2 && z === 0 && y === 63) {
      if (obstacle === "unknown") return null;
      if (obstacle === "gap") return { name: "air", boundingBox: "empty" };
      return { name: "lava", boundingBox: "empty" };
    }
    if (y < 63) return { name: "air", boundingBox: "empty" };
    if (y === 63) return { name: "stone", boundingBox: "block", shapes: [[0, 0, 0, 1, 1, 1]] };
    return { name: "air", boundingBox: "empty" };
  };
  // The player's positive-Z edge crosses into column Z=0.
  bot.entity.position.z = -0.2;
  const destination = new Vec3(0.5, 64.5, -0.2);
  assert.deepEqual(walkSegment(bot, destination), { jump: false });
  for (obstacle of ["unknown", "gap", "lava"])
    assert.equal(walkSegment(bot, destination), null, obstacle);
});

test("a committed crystal setup survives score fluctuations but still obeys safety and pressure", () => {
  const action = { type: "cover", damage: 5, selfDamage: 2, nextCover: {}, committed: true };
  assert.equal(crystalOpportunity(situation, { ...action, committed: false }, defaults).use, false);
  assert.equal(crystalOpportunity(situation, action, defaults).use, true);
  for (const [snapshot, blast] of [
    [{ health: 8 }, {}],
    [{ damage: 6 }, {}],
    [{ action: "finish" }, {}],
    [{}, { selfDamage: 7 }],
    [{}, { damage: 2 }],
  ])
    assert.equal(
      crystalOpportunity({ ...situation, ...snapshot }, { ...action, ...blast }, defaults).use,
      false,
    );
});

test("stalled direct pursuit yields to a route long enough to clear the obstacle", () => {
  const f = fixture(),
    controls = {};
  let time = 0;
  Object.assign(f.bot.entity, { yaw: -Math.PI / 2, width: 0.6, onGround: true });
  f.bot.setControlState = (key, value) => {
    controls[key] = value;
  };
  f.bot.pathfinder = { defaultMoveSettings: {} };
  f.bot.blockAt = (p) => ({
    name: p.y < 64 ? "stone" : "air",
    boundingBox: p.y < 64 ? "block" : "empty",
  });
  f.target.position.x = 30;
  const movement = createCombatFootwork(f.bot, defaults, { now: () => time });
  try {
    assert.equal(movement.tick(f.target), true, "distant flat targets use continuous sprint");
    assert.equal(controls.sprint, true);
    time = 700;
    assert.equal(movement.tick(f.target), false, "collision without progress triggers routing");
    assert.equal(controls.forward, false);
    f.bot.entity.position.x += 1;
    time = 1500;
    assert.equal(movement.tick(f.target), false, "one clear metre does not cancel the bypass");
    time = 2600;
    assert.equal(movement.tick(f.target), true);
    assert.equal(controls.forward, true);
  } finally {
    f.brain.dispose();
  }
});

test("crystals compete with weapon pressure by damage, health, setup time and known lethal damage", () => {
  const assess = (snapshot = {}, action = {}) =>
    crystalOpportunity(
      { ...situation, ...snapshot },
      { type: "place", damage: 10, selfDamage: 2, ...action },
      defaults,
    );
  assert.equal(assess().use, true);
  assert.equal(assess({}, { damage: 5, selfDamage: 5 }).use, false, "poor trade");
  assert.equal(
    assess({ health: 12 }, { type: "build" }).use,
    false,
    "do not build under pressure at low HP",
  );
  assert.equal(
    assess({ health: 18, damage: 6 }, { type: "cover" }).use,
    false,
    "burst damage preempts construction",
  );
  assert.equal(
    assess({ enemyHealth: 4 }, { type: "break", damage: 6, selfDamage: 5 }).use,
    true,
    "safe lethal burst can justify a worse trade",
  );
  assert.equal(
    assess({ health: 10, enemyHealth: 4 }, { type: "break", damage: 6, selfDamage: 5 }).use,
    false,
    "a lethal opportunity never bypasses minimum remaining HP",
  );
  assert.equal(
    assess({ action: "finish", enemyHealth: 3 }).use,
    false,
    "prefer an immediate weapon finish over setup",
  );
  assert.equal(
    assess({}, { type: "break", damage: 0, selfDamage: 1, finish: true }).use,
    true,
    "finish a confirmed owned crystal safely even when the enemy flees",
  );
  assert.equal(assess({}, { damage: NaN }).use, false);
  assert.equal(assess({}, { selfDamage: 7 }).use, false);
  assert.ok(
    assess({}, { type: "break" }).score > assess({}, { type: "build" }).score,
    "an immediate blast outranks equal damage after construction",
  );
});
