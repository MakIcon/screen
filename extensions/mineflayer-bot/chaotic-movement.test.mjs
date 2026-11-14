import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createChaoticMovementController, safeStep } from "./chaotic-movement.cjs";

const require = createRequire(import.meta.url);
const { Vec3 } = require("vec3");
const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function fixture(random = Math.random) {
  const bot = new EventEmitter();
  bot.entity = { position: new Vec3(0.5, 64, 0.5), onGround: true, yaw: 0 };
  bot.health = 20;
  bot.controlState = {};
  bot.setControlState = (key, value) => {
    bot.controlState[key] = value;
  };
  bot.blockAt = (pos) =>
    Math.floor(pos.y) < 64
      ? { name: "stone", boundingBox: "block" }
      : { name: "air", boundingBox: "empty" };
  const turns = [],
    changes = [],
    errors = [];
  bot.look = async (yaw) => {
    bot.entity.yaw = yaw;
    turns.push(yaw);
  };
  let clock = 0;
  const controller = createChaoticMovementController(
    bot,
    { allowSprinting: true },
    {
      now: () => clock,
      random,
      onChange: (active) => changes.push(active),
      onError: (error) => errors.push(error),
    },
  );
  return {
    bot,
    controller,
    turns,
    changes,
    errors,
    tick(time) {
      clock = time;
      bot.emit("physicsTick");
    },
  };
}

test("chaos keeps changing direction and stops all movement on request", async (t) => {
  const values = [0, 0, 0.25, 0];
  const f = fixture(() => values.shift() ?? 0);
  t.after(() => f.controller.dispose());
  f.controller.start();
  await flush();
  assert.equal(f.bot.controlState.forward, true);
  assert.equal(f.bot.controlState.sprint, true);
  assert.equal(f.turns[0], 0);
  f.tick(700);
  await flush();
  assert.equal(f.turns[1], Math.PI / 2);
  f.controller.stop();
  f.tick(4000);
  await flush();
  assert.equal(f.controller.active, false);
  assert.equal(Object.values(f.bot.controlState).some(Boolean), false);
  assert.equal(f.turns.length, 2);
  assert.deepEqual(f.changes, [true, false]);
});

test("chooses another direction around an obstacle and waits in blocked terrain", async (t) => {
  const f = fixture(() => 0);
  t.after(() => f.controller.dispose());
  const flat = f.bot.blockAt;
  f.bot.blockAt = (pos) =>
    pos.z < 0 && pos.y >= 64 ? { name: "stone", boundingBox: "block" } : flat(pos);
  assert.equal(safeStep(f.bot, 0), false);
  f.controller.start();
  await flush();
  assert.equal(f.bot.controlState.forward, true);
  assert.notEqual(f.turns[0], 0);
  f.bot.blockAt = () => null;
  f.tick(100);
  await flush();
  assert.equal(f.bot.controlState.forward, false);
  assert.equal(f.controller.active, true);
});

test("rejects drops, unloaded blocks and hazardous terrain before moving", () => {
  const f = fixture();
  try {
    for (const name of ["lava", "water", "fire", "cactus", "magma_block", "powder_snow"]) {
      f.bot.blockAt = (pos) => ({ name, boundingBox: pos.y < 64 ? "block" : "empty" });
      assert.equal(safeStep(f.bot, 0), false, name);
    }
    f.bot.blockAt = () => ({ name: "air", boundingBox: "empty" });
    assert.equal(safeStep(f.bot, 0), false, "no ground");
    f.bot.blockAt = () => null;
    assert.equal(safeStep(f.bot, 0), false, "unloaded chunk");
  } finally {
    f.controller.dispose();
  }
});

test("a pending look cannot restart movement after stop or disconnect", async () => {
  for (const action of ["stop", "end"]) {
    const f = fixture(() => 0);
    let finish;
    f.bot.look = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    f.controller.start();
    if (action === "stop") f.controller.stop();
    else f.bot.emit("end");
    finish();
    await flush();
    assert.equal(Object.values(f.bot.controlState).some(Boolean), false);
    f.controller.dispose();
    assert.equal(f.bot.listenerCount("physicsTick"), 0);
    assert.equal(f.bot.listenerCount("death"), 0);
    assert.equal(f.bot.listenerCount("end"), 0);
  }
});

test("independent bots stop separately and death clears the mode", async (t) => {
  const first = fixture(),
    second = fixture();
  t.after(() => {
    first.controller.dispose();
    second.controller.dispose();
  });
  first.controller.start();
  second.controller.start();
  await flush();
  first.controller.stop();
  assert.equal(first.bot.controlState.forward, false);
  assert.equal(second.bot.controlState.forward, true);
  second.bot.emit("death");
  assert.equal(second.controller.active, false);
  assert.equal(second.bot.controlState.forward, false);
});

test("yields control to survival and resumes when it finishes", async (t) => {
  const f = fixture(() => 0);
  t.after(() => f.controller.dispose());
  f.controller.start();
  await flush();
  f.bot.launcherSurvival = { busy: true };
  f.bot.controlState.forward = false;
  f.tick(5000);
  await flush();
  assert.equal(f.bot.controlState.forward, false);
  assert.equal(f.turns.length, 1);
  f.bot.launcherSurvival.busy = false;
  f.tick(5050);
  await flush();
  assert.equal(f.bot.controlState.forward, true);
});

test("returns towards its starting area and reports a failed rotation without leaving movement enabled", async (t) => {
  const f = fixture(() => 0.5);
  t.after(() => f.controller.dispose());
  f.controller.start();
  await flush();
  f.bot.entity.position.x += 14;
  f.tick(2000);
  await flush();
  assert.equal(f.turns.at(-1), Math.PI / 2);
  f.bot.look = async () => {
    throw new Error("connection ended");
  };
  f.tick(4000);
  await flush();
  assert.equal(f.controller.active, false);
  assert.equal(f.bot.controlState.forward, false);
  assert.match(f.errors[0].message, /connection ended/);
});

const mineflayerRequire = createRequire(require.resolve("mineflayer"));
const { PlayerState } = mineflayerRequire("prismarine-physics");
const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");

for (const version of ["1.20.4", "26.1.2"])
  test(`chaotic inputs physically move a real Mineflayer bot on ${version}`, async (t) => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
    rig.stopPassivePhysics();
    const bot = rig.bot;
    let clock = 0,
      rolls = 0;
    const random = () => (++rolls % 2 ? ((rolls / 2) % 4) / 4 : 0);
    const controller = createChaoticMovementController(
      bot,
      { allowSprinting: true },
      { now: () => clock, random },
    );
    t.after(() => {
      controller.dispose();
      rig.stopPassivePhysics();
    });
    const start = bot.entity.position.clone();
    controller.start();
    await flush();
    for (let tick = 0; tick < 100; tick++) {
      clock += 50;
      bot.physics.simulatePlayer(new PlayerState(bot, bot.controlState), world).apply(bot);
      bot.emit("physicsTick");
      await flush();
    }
    assert.ok(bot.entity.position.distanceTo(start) > 0.5, "the player actually moves");
    assert.equal(bot.entity.position.y, 64, "the player stays on the floor");
    controller.stop();
    assert.equal(bot.controlState.forward, false);
    assert.equal(bot.controlState.sprint, false);
  });
