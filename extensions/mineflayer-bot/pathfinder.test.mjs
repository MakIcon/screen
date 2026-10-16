import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import worker from "./worker.cjs";
import pathfinder from "./pathfinder.cjs";

const require = createRequire(new URL("./pathfinding/package.json", import.meta.url));
require("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
});
const { createCacheWorld, createFlatWorld } = require("./tests/setup.ts");
const { Vec3 } = require("vec3");
const { PlayerState: LivePlayerState } = require("prismarine-physics");

function physicsStep(rig, world) {
  const controls = Object.fromEntries(["forward", "back", "left", "right", "jump", "sprint", "sneak"]
    .map(key => [key, rig.bot.getControlState(key)]));
  rig.bot.physics.simulatePlayer(new LivePlayerState(rig.bot, controls), world).apply(rig.bot);
  rig.bot.emit("physicsTick");
}

for (const version of ["1.20.4", "26.1.2"]) {
  test(`water entry keeps one dive despite competing PvP jump inputs on ${version}`, async () => {
    const world = createFlatWorld(version, 56, { renderDistance: 1 });
    for (let x = -3; x <= 25; x++) for (let z = -2; z <= 2; z++)
      for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 63.1, 0.5), { world });
    rig.bot.physicsEnabled = false;
    worker.configurePathfinder(rig.bot, { allowSprinting: true, allowParkour: false });
    let firstSwim, diveStarts = 0, previousSneak = false, swimTicks = 0;
    try {
      await rig.bot.look(-Math.PI / 2, 0, true);
      for (let tick = 0; tick < 85; tick++) {
        rig.bot.setControlState("forward", true);
        rig.bot.setControlState("jump", true);
        rig.bot.setControlState("sneak", false);
        rig.bot.setControlState("sprint", false);
        const sneak = rig.bot.getControlState("sneak");
        if (sneak && !previousSneak) diveStarts++;
        previousSneak = sneak;
        physicsStep(rig, world);
        if (rig.bot.entity.swimming) {
          firstSwim ??= { tick, x: rig.bot.entity.position.x };
          swimTicks++;
          assert.equal(rig.bot.getControlState("sneak"), false);
        }
      }
      assert.ok(firstSwim && firstSwim.tick <= 15, `first swim=${JSON.stringify(firstSwim)}`);
      assert.ok(firstSwim.x < 1.6, `entry distance=${firstSwim.x - 0.5}`);
      assert.equal(diveStarts, 1, "no crouch/stand oscillation before swimming");
      assert.ok(swimTicks >= 65, `swimming ticks=${swimTicks}`);
      assert.ok(rig.bot.entity.position.x > 10);
      rig.bot.clearControlStates();
      for (let tick = 0; tick < 25; tick++) physicsStep(rig, world);
      assert.equal(rig.bot.entity.swimming, false);
      assert.equal(rig.bot.getControlState("sprint"), false);
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics(); }
  });

  for (const roof of ["stone", "oak_leaves"]) {
    test(`low-ceiling jumps accelerate ${roof === "stone" ? "a mined tunnel" : "leaf canopy pursuit"} and honor the switch on ${version}`, async t => {
      const samples = [];
      for (const enabled of [false, true]) {
        const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), { renderDistance: 2 });
        rig.bot.physicsEnabled = false;
        for (let x = -2; x <= 40; x++) {
          for (let z = -1; z <= 1; z++) world.setBlock(new Vec3(x, 66, z), roof);
          if (roof === "stone") for (const z of [-1, 1]) for (const y of [64, 65])
            world.setBlock(new Vec3(x, y, z), "stone");
        }
        worker.configurePathfinder(rig.bot, {
          allowSprinting: true, allowParkour: false, allowLowCeilingJumps: enabled,
        });
        let takeoffs = 0, previousGround = true, lastTakeoff = -100, longestInterval = 0, top = 64;
        try {
          await rig.bot.look(-Math.PI / 2, 0, true);
          for (let tick = 0; tick < 70; tick++) {
            rig.bot.setControlState("forward", true);
            rig.bot.setControlState("sprint", true);
            rig.bot.setControlState("jump", false); // Navigator/combat retains its own input.
            physicsStep(rig, world);
            if (previousGround && !rig.bot.entity.onGround && rig.bot.entity.position.y > 64.01) {
              if (takeoffs) longestInterval = Math.max(longestInterval, tick - lastTakeoff);
              takeoffs++; lastTakeoff = tick;
            }
            previousGround = rig.bot.entity.onGround;
            top = Math.max(top, rig.bot.entity.position.y);
          }
          samples.push({ x: rig.bot.entity.position.x, takeoffs, longestInterval, top });
          rig.bot.clearControlStates();
          for (let tick = 0; tick < 20; tick++) physicsStep(rig, world);
          assert.equal(rig.bot.getControlState("jump"), false);
          assert.equal(rig.bot.getControlState("forward"), false);
          assert.ok(Math.hypot(rig.bot.entity.velocity.x, rig.bot.entity.velocity.z) < 0.01);
        } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics(); }
      }
      t.diagnostic(JSON.stringify(samples));
      assert.equal(samples[0].takeoffs, 0);
      assert.ok(samples[1].takeoffs >= 15, `takeoffs=${samples[1].takeoffs}`);
      assert.ok(samples[1].longestInterval <= 5, `jump interval=${samples[1].longestInterval}`);
      assert.ok(samples[1].top <= 64.201, `head collision height=${samples[1].top}`);
      assert.ok(samples[1].x > samples[0].x * 1.2, `distances=${samples.map(sample => sample.x)}`);
    });
  }
}

test("low-ceiling jumps yield to unsafe ground, eating, combat actions and disabled sprint", async () => {
  for (const condition of ["gap", "lava", "water", "wall", "open sky", "hunger", "sneak", "sprint off", "turn", "axe", "pearl", "survival", "item", "mining"]) {
    const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 });
    const bot = rig.bot;
    bot.physicsEnabled = false;
    for (let x = -1; x <= 5; x++) world.setBlock(new Vec3(x, 66, 0), "stone");
    if (condition === "gap") world.setBlock(new Vec3(1, 63, 0), "air");
    if (condition === "lava") world.setBlock(new Vec3(1, 63, 0), "lava");
    if (condition === "water") world.setBlock(new Vec3(1, 64, 0), "water");
    if (condition === "wall") world.setBlock(new Vec3(1, 65, 0), "stone");
    if (condition === "open sky") world.setBlock(new Vec3(0, 66, 0), "air");
    if (condition === "hunger") bot.food = 6;
    if (condition === "turn") bot.entity.velocity.z = 0.3;
    if (condition === "axe") bot.launcherAxeAttacking = true;
    if (condition === "pearl") bot.launcherPearling = true;
    if (condition === "survival") bot.launcherSurvival = { busy: true };
    if (condition === "item") bot.usingHeldItem = true;
    if (condition === "mining") bot.targetDigBlock = world.getBlock(new Vec3(1, 66, 0));
    worker.configurePathfinder(bot, { allowSprinting: condition !== "sprint off", allowParkour: false });
    try {
      await bot.look(-Math.PI / 2, 0, true);
      bot.setControlState("sneak", condition === "sneak");
      bot.setControlState("forward", true);
      bot.setControlState("sprint", true);
      bot.setControlState("jump", false);
      assert.equal(bot.getControlState("jump"), false, condition);
    } finally { await bot.pathfinder.destroy(); rig.stopPassivePhysics(); }
  }
});

test("low-ceiling jumps follow the actual forward/strafe corridor and dispose cleanly", async () => {
  const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 });
  const bot = rig.bot;
  bot.physicsEnabled = false;
  for (let x = -2; x <= 20; x++) for (let z = -15; z <= 3; z++) world.setBlock(new Vec3(x, 66, z), "oak_leaves");
  worker.configurePathfinder(bot, { allowSprinting: true, allowParkour: false, allowLowCeilingJumps: false });
  const original = bot.setControlState;
  const listeners = bot.listenerCount("physicsTick");
  bot.pathfinder.setMoveOptions({ allowLowCeilingJumps: true });
  const dispose = pathfinder.installLowCeilingJumps(bot);
  try {
    await bot.look(-Math.PI / 2, 0, true);
    bot.setControlState("forward", true);
    bot.setControlState("left", true);
    bot.setControlState("sprint", true);
    let hops = 0;
    for (let tick = 0; tick < 30; tick++) {
      bot.setControlState("jump", false);
      physicsStep(rig, world);
      if (bot.entity.position.y > 64.01) hops++;
    }
    assert.ok(hops >= 10, `diagonal hop ticks=${hops}`);
    assert.ok(bot.entity.position.x > 7 && bot.entity.position.z < -3);
    bot.clearControlStates();
    dispose(); dispose();
    assert.equal(bot.setControlState, original);
    assert.equal(bot.listenerCount("physicsTick"), listeners);
    bot.setControlState("jump", true);
    assert.equal(bot.getControlState("jump"), true, "manual jump remains available after disabling");
  } finally { dispose(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); }
});

test("native pathfinder options enable and disable low-ceiling jumps without the worker", async () => {
  const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 });
  const bot = rig.bot;
  bot.physicsEnabled = false;
  for (let x = -2; x <= 25; x++) world.setBlock(new Vec3(x, 66, 0), "stone");
  bot.loadPlugin(pathfinder.createPlugin({ moveSettings: { allowLowCeilingJumps: true, allowSprinting: true } }));
  try {
    await bot.look(-Math.PI / 2, 0, true);
    bot.setControlState("forward", true);
    bot.setControlState("sprint", true);
    let hops = 0;
    for (let tick = 0; tick < 18; tick++) { physicsStep(rig, world); if (bot.entity.position.y > 64.01) hops++; }
    assert.ok(hops >= 8, `native hop ticks=${hops}`);
    bot.pathfinder.setMoveOptions({ allowLowCeilingJumps: false });
    for (let tick = 0; tick < 12; tick++) physicsStep(rig, world);
    assert.equal(bot.entity.onGround, true);
    assert.equal(bot.getControlState("jump"), false);
    bot.pathfinder.setMoveOptions({ allowLowCeilingJumps: true });
    assert.equal(bot.getControlState("jump"), false);
    physicsStep(rig, world); physicsStep(rig, world);
    assert.ok(bot.entity.position.y > 64.01, "native option resumes hopping on the next grounded tick");
  } finally { bot.clearControlStates(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); }
});

test("low-ceiling jumps hand airborne control to a stair jump immediately", async () => {
  const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 });
  const bot = rig.bot;
  bot.physicsEnabled = false;
  for (let x = -2; x <= 5; x++) world.setBlock(new Vec3(x, 66, 0), "stone");
  bot.loadPlugin(pathfinder.createPlugin({ moveSettings: { allowLowCeilingJumps: true } }));
  try {
    await bot.look(-Math.PI / 2, 0, true);
    physicsStep(rig, world); physicsStep(rig, world);
    bot.setControlState("forward", true);
    bot.setControlState("sprint", true);
    physicsStep(rig, world);
    assert.equal(bot.entity.onGround, false);
    const provider = bot.pathfinder.movements.get(pathfinder.movementProviders.ForwardJump);
    bot.pathfinder.currentMove = { moveType: provider, toBreak: [], toPlace: [] };
    bot.setControlState("jump", true);
    assert.equal(bot.getControlState("jump"), true, "a stair takeoff must not inherit the hop's airborne release");
    bot.pathfinder.currentMove = undefined;
  } finally { bot.pathfinder.currentMove = undefined; bot.clearControlStates(); await bot.pathfinder.destroy(); rig.stopPassivePhysics(); }
});

test("native navigation switches between low-ceiling sprint jumps and mined stairs", { timeout: 12000 }, async t => {
  const world = createFlatWorld("26.1.2", 48, { renderDistance: 1 });
  const height = x => 64 + Math.max(0, Math.min(4, Math.floor((x - 5) / 2)));
  for (let x = -2; x <= 24; x++) for (let z = 0; z <= 1; z++) {
    for (let y = 48; y < height(x); y++) world.setBlock(new Vec3(x, y, z), "stone");
    world.setBlock(new Vec3(x, height(x) + (x < 4 || x >= 15 ? 2 : 3), z), "stone");
  }
  const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { world });
  const bot = rig.bot;
  const navigator = worker.configurePathfinder(bot, { allowSprinting: true, allowParkour: false, canDig: false, maxDropDown: 3 });
  navigator.setMoveOptions({ canPlace: false });
  const resets = [];
  bot.on("resetPath", reason => resets.push(reason));
  t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
  try {
    await navigator.goto(new pathfinder.goals.GoalNear(21.5, 68, 0.5, 0.7));
    assert.ok(bot.entity.position.distanceTo(new Vec3(21.5, 68, 0.5)) < 0.8);
    assert.equal(bot.entity.onGround, true);
    assert.equal(bot.getControlState("jump"), false);
    assert.deepEqual(resets, []);
  } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
});

for (const version of ["1.20.4", "26.1.2"]) {
  test(`navigation uses low-ceiling jumps through a mined tunnel and stops at its goal on ${version}`, { timeout: 10000 }, async t => {
    const results = [];
    for (const enabled of [false, true]) {
      const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 });
      for (let x = -2; x <= 22; x++) {
        world.setBlock(new Vec3(x, 66, 0), "stone");
        for (const z of [-1, 1]) for (const y of [64, 65]) world.setBlock(new Vec3(x, y, z), "stone");
      }
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: true, allowParkour: true, allowLowCeilingJumps: enabled, canDig: false, maxDropDown: 3,
      });
      navigator.setMoveOptions({ canPlace: false });
      let ticks = 0, hops = 0;
      const observe = () => { ticks++; if (rig.bot.entity.position.y > 64.01) hops++; };
      rig.bot.on("physicsTick", observe);
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      try {
        await navigator.goto(new pathfinder.goals.GoalNear(18.5, 64, 0.5, 0.6));
        results.push({ ticks, hops });
        assert.ok(rig.bot.entity.position.x > 17.9 && rig.bot.entity.position.x < 19.3);
        assert.equal(rig.bot.getControlState("forward"), false);
        assert.equal(rig.bot.getControlState("jump"), false);
        await rig.bot.waitForTicks(8);
        assert.equal(rig.bot.entity.onGround, true);
      } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
    }
    t.diagnostic(JSON.stringify(results));
    assert.equal(results[0].hops, 0, "the switch also disables optional navigator head-hit jumps");
    assert.ok(results[1].hops >= 12, `hops=${results[1].hops}`);
    assert.ok(results[1].ticks < results[0].ticks * 0.85, `ticks=${results.map(result => result.ticks)}`);
  });
}

test("managed bot reserves tick listeners for its controllers and preserves custom limits", async () => {
  for (const [initial, expected] of [[10, 32], [64, 64], [0, 0]]) {
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 });
    rig.bot.setMaxListeners(initial);
    try {
      worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: false });
      const listeners = rig.bot.listenerCount("physicsTick");
      worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: false });
      assert.equal(rig.bot.getMaxListeners(), expected);
      assert.equal(rig.bot.listenerCount("physicsTick"), listeners, "reconfiguration does not accumulate tick hooks");
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics(); }
  }
});

test("bundled worker keeps diagonal sprint-hop speed without crouching in the air", { timeout: 9000 }, async (t) => {
  const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 });
  const navigator = worker.configurePathfinder(rig.bot, { allowSprinting: true, allowParkour: true, canDig: false, maxDropDown: 3 });
  let samples = 0, airborne = 0, slow = 0, crouched = 0;
  rig.bot.on("physicsTick", () => {
    if (rig.bot.entity.position.x < 3 || rig.bot.entity.position.x > 12) return;
    samples++;
    if (!rig.bot.entity.onGround) airborne++;
    if (rig.bot.getControlState("sneak")) crouched++;
    if (Math.hypot(rig.bot.entity.velocity.x, rig.bot.entity.velocity.z) < 0.12) slow++;
  });
  t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
  try {
    await navigator.goto(new pathfinder.goals.GoalNear(15.5, 64, 15.5, 0.4));
    assert.ok(samples > 25 && airborne > 10);
    assert.equal(crouched, 0);
    assert.ok(slow <= 2, `${slow}/${samples} slow ticks`);
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(new Vec3(15.5, 64, 15.5)) < 0.5);
  } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
});

test("bundled come follows the corner blocks of a narrow G walkway with building enabled", { timeout: 14000 }, async (t) => {
  const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 84, 0.5), { renderDistance: 1 });
  for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 83, 0), "cobblestone");
  for (let z = 0; z <= 5; z++) world.setBlock(new Vec3(6, 83, z), "cobblestone");
  for (let x = 1; x <= 6; x++) world.setBlock(new Vec3(x, 83, 5), "cobblestone");
  for (let z = 2; z <= 5; z++) world.setBlock(new Vec3(1, 83, z), "cobblestone");
  for (let z = 1; z <= 4; z++) for (let y = 84; y <= 85; y++) world.setBlock(new Vec3(5, y, z), "cobblestone");
  const Item = require("prismarine-item")(rig.mcData);
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
  rig.bot.inventory.slots[9].slot = 9;
  const navigator = worker.configurePathfinder(rig.bot, { allowSprinting: true, allowParkour: false, canDig: false, maxDropDown: 3 });
  const bends = [new Vec3(6.5, 84, 0.5), new Vec3(6.5, 84, 5.5), new Vec3(1.5, 84, 5.5)];
  const distances = bends.map(() => Infinity);
  let lowest = 84, placements = 0;
  const place = rig.bot._placeBlockWithOptions;
  rig.bot._placeBlockWithOptions = (...args) => { placements++; return place(...args); };
  rig.bot.on("physicsTick", () => {
    lowest = Math.min(lowest, rig.bot.entity.position.y);
    for (let i = 0; i < bends.length; i++) distances[i] = Math.min(distances[i], rig.bot.entity.position.xzDistanceTo(bends[i]));
  });
  t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
  try {
    await navigator.goto(new pathfinder.goals.GoalNear(1.5, 84, 2.5, 0.35));
    assert.ok(lowest >= 83.99, `fell to ${lowest}`);
    assert.ok(distances.every(distance => distance < 0.3), `corner distances=${distances}`);
    assert.equal(placements, 0, "use the existing bend without filling it");
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(new Vec3(1.5, 84, 2.5)) < 0.45);
  } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
});

test("bundled come avoids a rejected forest placement and finishes the ascent with real confirmations", { timeout: 40000 }, async (t) => {
  const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 });
  for (let x = -3; x <= 5; x++) for (let z = -3; z <= 3; z++) world.setBlock(new Vec3(x, 67, z), "spruce_leaves");
  for (let y = 64; y <= 70; y++) world.setBlock(new Vec3(2, y, 1), "spruce_log");
  for (let x = 9; x <= 12; x++) for (let z = -1; z <= 1; z++) world.setBlock(new Vec3(x, 83, z), "stone");
  const Item = require("prismarine-item")(rig.mcData);
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
  rig.bot.inventory.slots[9].slot = 9;
  const navigator = worker.configurePathfinder(rig.bot, { allowSprinting: true, allowParkour: false, canDig: false, maxDropDown: 3 });
  const place = rig.bot._placeBlockWithOptions;
  let denied, rejections = 0, confirmations = 0;
  rig.bot._placeBlockWithOptions = async (block, face, ...args) => {
    const destination = block.position.plus(face);
    denied ??= destination.clone();
    const oldState = world.getBlockStateId(destination);
    await rig.bot.waitForTicks(2);
    assert.equal(world.getBlockStateId(destination), oldState, "the live world must contain only confirmed terrain");
    if (destination.equals(denied)) { rejections++; throw new Error("Server rejected the placement"); }
    confirmations++;
    return place(block, face, ...args);
  };
  t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
  try {
    await navigator.goto(new pathfinder.goals.GoalNear(10.5, 84, 0.5, 0.7));
    assert.equal(rejections, 1, "replan around the failed placement instead of repeating it");
    assert.ok(confirmations > 15);
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(new Vec3(10.5, 84, 0.5)) < 0.8);
  } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
});

test("bundled come prioritizes a ready ladder, Neo and gap over building with a full scaffold stack", { timeout: 16000 }, async (t) => {
  const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 84, 0.5), { renderDistance: 1 });
  for (let x = 0; x <= 3; x++) world.setBlock(new Vec3(x, 83, 0), "stone");
  const Block = require("prismarine-block")(rig.mcData);
  const ladder = rig.mcData.blocksByName.ladder;
  let ladderState;
  for (let state = ladder.minStateId; state <= ladder.maxStateId; state++) {
    const props = Block.fromStateId(state, 0).getProperties();
    if (props.facing === "west" && !props.waterlogged) { ladderState = state; break; }
  }
  for (let y = 84; y <= 87; y++) {
    world.setBlock(new Vec3(4, y, 0), "stone");
    world.setBlock(new Vec3(3, y, 0), ladderState);
  }
  for (const x of [4, 5, 6, 7, 10, 11, 12, 13]) world.setBlock(new Vec3(x, 87, 0), "stone");
  for (const y of [88, 89]) world.setBlock(new Vec3(6, y, 0), "stone");
  const Item = require("prismarine-item")(rig.mcData);
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
  rig.bot.inventory.slots[9].slot = 9;
  const navigator = worker.configurePathfinder(rig.bot, { allowSprinting: true, allowParkour: true, canDig: true, maxDropDown: 3 });
  const placed = [], dug = [], used = [];
  const place = rig.bot._placeBlockWithOptions, dig = rig.bot.dig;
  rig.bot._placeBlockWithOptions = (block, face, ...args) => { placed.push(block.position.plus(face)); return place(block, face, ...args); };
  rig.bot.dig = (block, ...args) => { dug.push(block.position); return dig(block, ...args); };
  rig.bot.on("pathGenerated", path => used.push(...path.path.map(move => move.moveType.constructor.name)));
  t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
  try {
    await navigator.goto(new pathfinder.goals.GoalNear(12.5, 88, 0.5, 0.7));
    assert.deepEqual(placed, []);
    assert.deepEqual(dug, []);
    for (const name of ["Climb", "NeoProvider", "ParkourForward"]) assert.ok(used.includes(name), used.join(","));
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(new Vec3(12.5, 88, 0.5)) < 0.8);
  } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
});

test("bundled come finishes a diagonal bridge to the owner's lower platform", { timeout: 35000 }, async (t) => {
  const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 84, 0.5), { renderDistance: 1 });
  for (let y = 64; y < 84; y++) world.setBlock(new Vec3(0, y, 0), "cobblestone");
  for (let x = 12; x <= 15; x++) for (let z = 3; z <= 5; z++) world.setBlock(new Vec3(x, 81, z), "stone");
  const Item = require("prismarine-item")(rig.mcData);
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
  rig.bot.inventory.slots[9].slot = 9;
  const navigator = worker.configurePathfinder(rig.bot, { allowSprinting: true, allowParkour: true, canDig: true, maxDropDown: 3 });
  const destination = new Vec3(14.5, 82, 4.5);
  let firstRoute, lowest = 84;
  const plans = [], resets = [], started = performance.now();
  rig.bot.on("pathGenerated", path => { firstRoute ??= performance.now() - started; plans.push(path); });
  rig.bot.on("resetPath", reason => resets.push(reason));
  rig.bot.on("physicsTick", () => { lowest = Math.min(lowest, rig.bot.entity.position.y); });
  t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
  try {
    await navigator.goto(pathfinder.goals.GoalNear.fromVec(destination, 0.7));
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(destination) < 0.8);
    assert.ok(firstRoute < 700, `first route=${firstRoute}ms`);
    assert.equal(plans.length, 1, "retain the plan through the bridge and its final descent");
    assert.deepEqual(resets, []);
    assert.ok(lowest >= 81.99, `lowest=${lowest}`);
  } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
});

test("bundled come plans an entire tall tower and retains its platform floor", async () => {
  const { rig, world } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 });
  for (let x = 1; x <= 5; x++) for (let z = -1; z <= 1; z++) world.setBlock(new Vec3(x, 83, z), "stone");
  const Item = require("prismarine-item")(rig.mcData);
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
  rig.bot.inventory.slots[9].slot = 9;
  const navigator = worker.configurePathfinder(rig.bot, { allowSprinting: true, allowParkour: false, canDig: true, maxDropDown: 3 });
  try {
    const started = performance.now();
    const path = await navigator.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity,
      new pathfinder.goals.GoalNear(2.5, 84, 0.5, 0.7));
    assert.ok(path != null, "one connected route reaches the overhead platform");
    assert.ok(performance.now() - started < 700, "the planner should not exhaust a ground search before towering");
    assert.ok(path.path.filter(move => move.moveType.constructor.name === "StraightUp").length >= 18);
    assert.ok(path.path.every(move => move.toBreak.length === 0 && move.remainingBlocks >= 0));
    assert.ok(path.path.at(-1).exitPos.distanceTo(new Vec3(2.5, 84, 0.5)) < 0.8);
    assert.equal(world.getBlock(new Vec3(2, 83, 0)).name, "stone");
  } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
});

test("distant come advances through newly loaded chunks without waiting for an unavailable full route", { timeout: 42000 }, async (t) => {
  const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
  const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { world });
  const navigator = worker.configurePathfinder(rig.bot, { allowSprinting: true, allowParkour: false, canDig: false, maxDropDown: 3 });
  const goal = new pathfinder.goals.GoalNear(120.5, 64, 0.5, 0.7);
  const started = performance.now();
  let firstForward;
  const control = rig.bot.setControlState;
  rig.bot.setControlState = (name, value) => {
    if (name === "forward" && value) firstForward ??= performance.now() - started;
    control(name, value);
  };
  const prefixes = [], resets = [];
  rig.bot.on("pathGenerated", (path) => { if (path.status !== "success") prefixes.push(path.path.length); });
  rig.bot.on("resetPath", (reason) => resets.push(reason));
  t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
  try {
    assert.equal(world.getColumn(7, 0), undefined, "destination starts outside loaded terrain");
    await navigator.goto(goal);
    assert.ok(firstForward < 800, `first forward=${firstForward}ms`);
    assert.ok(prefixes.length >= 2 && prefixes.every(length => length >= 16), `prefixes=${prefixes}`);
    assert.ok(prefixes.length <= 8, `prefixes=${prefixes}`);
    assert.deepEqual(resets, []);
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(120.5, 64, 0.5)) < 0.8);
    t.diagnostic(`120-block come: start=${firstForward.toFixed(1)}ms, sections=${prefixes.join(",")}`);
  } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
});

test("come plans around an underground lava lake without unsafe drops", { timeout: 18000 }, async (t) => {
  const world = createFlatWorld("26.1.2", 32, { renderDistance: 2 });
  for (let x = 3; x <= 16; x++) for (let z = -5; z <= 5; z++) world.setBlock(new Vec3(x, 31, z), "lava");
  for (let x = -5; x <= 24; x++) for (let z = -9; z <= 9; z++) world.setBlock(new Vec3(x, 35, z), "stone");
  const { rig } = createCacheWorld("26.1.2", 32, new Vec3(0.5, 32, 0.5), { world });
  const navigator = worker.configurePathfinder(rig.bot, { allowSprinting: true, allowParkour: true, canDig: false, maxDropDown: 3 });
  navigator.setMoveOptions({ canPlace: false });
  const goal = new pathfinder.goals.GoalNear(20.5, 32, 0.5, 0.7);
  t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
  try {
    navigator.setOptions({ heuristicWeight: 1 });
    const baseline = await navigator.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, goal);
    navigator.setOptions({ heuristicWeight: 1.5 });
    let chosen;
    let searches = 0;
    rig.bot.on("pathGenerated", (path) => { chosen = path; searches++; });
    let lowest = 32;
    rig.bot.on("physicsTick", () => {
      lowest = Math.min(lowest, rig.bot.entity.position.y);
      assert.equal(rig.bot.entity.isInLava, false, `lava at ${rig.bot.entity.position}; move=${navigator.currentMove}; route=${chosen?.path.map(m => `${m.moveType.constructor.name}:${m.exitPos}`).join(';')}`);
    });
    await navigator.goto(goal);
    assert.equal(searches, 1);
    assert.ok(lowest >= 31.99, `lowest=${lowest}`);
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(20.5, 32, 0.5)) < 0.8);
    assert.ok(chosen.visitedNodes < baseline.visitedNodes, `weighted=${chosen.visitedNodes}, baseline=${baseline.visitedNodes}`);
    t.diagnostic(`lava detour: visited ${baseline.visitedNodes} -> ${chosen.visitedNodes}; planning ${chosen.calcTime.toFixed(1)}ms`);
  } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
});

test("come executes water exit, ladder, Neo and gap as a connected route", { timeout: 26000 }, async (t) => {
  const version = "26.1.2";
  const world = createFlatWorld(version, 56, { renderDistance: 2 });
  for (let x = -3; x <= 18; x++) for (let z = -3; z <= 3; z++)
    for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
  for (let x = 3; x <= 6; x++) world.setBlock(new Vec3(x, 63, 0), "cobblestone");
  const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 62, 0.5), { world });
  const Block = require("prismarine-block")(rig.mcData);
  const ladder = rig.mcData.blocksByName.ladder;
  let ladderState;
  for (let state = ladder.minStateId; state <= ladder.maxStateId; state++) {
    const props = Block.fromStateId(state, 0).getProperties();
    if (props.facing === "west" && !props.waterlogged) { ladderState = state; break; }
  }
  for (let y = 64; y <= 67; y++) {
    world.setBlock(new Vec3(6, y, 0), "cobblestone");
    world.setBlock(new Vec3(5, y, 0), ladderState);
  }
  for (const x of [7, 8, 9, 12, 13]) world.setBlock(new Vec3(x, 67, 0), "cobblestone");
  for (const y of [68, 69]) world.setBlock(new Vec3(8, y, 0), "cobblestone");
  const navigator = worker.configurePathfinder(rig.bot, { allowSprinting: true, allowParkour: true, canDig: false, maxDropDown: 3 });
  navigator.setMoveOptions({ canPlace: false });
  const used = [], resets = [];
  rig.bot.on("pathGenerated", (path) => used.push(...path.path.map((move) => move.moveType.constructor.name)));
  rig.bot.on("resetPath", (reason) => resets.push(reason));
  t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
  try {
    await navigator.goto(new pathfinder.goals.GoalNear(13.5, 68, 0.5, 0.7));
    assert.ok(used.includes("Climb"), used.join(","));
    assert.ok(used.includes("NeoProvider"), used.join(","));
    assert.ok(used.some((name) => /Parkour/.test(name)), used.join(","));
    assert.deepEqual(resets, []);
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(new Vec3(13.5, 68, 0.5)) < 0.8);
  } finally { await navigator.destroy(); rig.stopPassivePhysics(); }
});

test(
  "bundled worker maintains ocean sprint speed across route prefixes and releases it on stop",
  { timeout: 12000 },
  async (t) => {
    const world = createFlatWorld("26.1.2", 56, { renderDistance: 3 });
    for (let x = -4; x <= 40; x++)
      for (let z = -4; z <= 4; z++)
        for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 62, 0.5), { world });
    const navigator = worker.configurePathfinder(rig.bot, {
      allowSprinting: true,
      allowParkour: true,
      canDig: false,
      maxDropDown: 3,
    });
    Object.assign(navigator.pathfinderSettings, {
      tickTimeoutMs: 1,
      routePrefixMs: 1,
      routePrefixLength: 6,
    });
    const speeds = [];
    let interruptions = 0,
      prefixes = 0;
    rig.bot.on("pathGenerated", (path) => {
      if (path.status === "partial") prefixes++;
    });
    rig.bot.on("physicsTick", () => {
      const e = rig.bot.entity;
      if (e.position.x < 5 || e.position.x > 24) return;
      speeds.push(Math.hypot(e.velocity.x, e.velocity.z));
      if (
        !e.swimming ||
        !rig.bot.getControlState("forward") ||
        !rig.bot.getControlState("sprint") ||
        rig.bot.getControlState("sneak")
      )
        interruptions++;
    });
    t.signal.addEventListener(
      "abort",
      () => {
        void navigator.stop();
      },
      { once: true },
    );
    const running = navigator.goto(new pathfinder.goals.GoalBlock(32, 63, 0));
    try {
      while (rig.bot.entity.position.x < 24) await rig.bot.waitForTicks(1);
      await navigator.stop();
      await running;
      const mean = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
      assert.ok(prefixes >= 2);
      assert.ok(mean > 0.17 && mean < 0.178, `cruise speed=${mean}`);
      assert.equal(interruptions, 0);
      assert.equal(rig.bot.getControlState("forward"), false);
      assert.equal(rig.bot.getControlState("sprint"), false);
      const stopped = rig.bot.entity.position.clone();
      await rig.bot.waitForTicks(15);
      assert.ok(
        rig.bot.entity.position.xzDistanceTo(stopped) < 2,
        "no delayed route resumes after stop",
      );
      assert.equal(rig.bot.getControlState("forward"), false);
      assert.equal(rig.bot.getControlState("sprint"), false);
      assert.ok(Math.hypot(rig.bot.entity.velocity.x, rig.bot.entity.velocity.z) < 0.04);
    } finally {
      await navigator.stop();
      await running;
      await navigator.destroy();
      rig.stopPassivePhysics();
    }
  },
);

for (const version of ["1.20.4", "26.1.2"])
  for (const diagonal of [false, true]) {
    test(
      `bundled worker completes ${diagonal ? "four-by-four diagonal" : "four-empty-block"} parkour on ${version}`,
      { timeout: 7000 },
      async () => {
        const world = createFlatWorld(version, -64, { renderDistance: 1 });
        for (let x = -5; x <= 0; x++)
          for (let z = -5; z <= (diagonal ? 0 : 2); z++)
            world.setBlock(new Vec3(x, 63, z), "stone");
        const landing = new Vec3(diagonal ? 4 : 5, 64, diagonal ? 4 : 0);
        world.setBlock(landing.offset(0, -1, 0), "stone");
        const { rig } = createCacheWorld(version, 64, new Vec3(-2.5, 64, diagonal ? -2.2 : 0.2), {
          world,
        });
        const navigator = worker.configurePathfinder(rig.bot, {
          allowSprinting: true,
          allowParkour: true,
          canDig: false,
          maxDropDown: 3,
        });
        let lowest = 64;
        rig.bot.on("physicsTick", () => {
          lowest = Math.min(lowest, rig.bot.entity.position.y);
        });
        try {
          await navigator.goto(pathfinder.goals.GoalBlock.fromVec(landing));
          assert.ok(lowest >= 63.99, `fell to ${lowest}`);
          assert.equal(rig.bot.entity.onGround, true);
          assert.ok(rig.bot.entity.position.floored().equals(landing));
        } finally {
          await navigator.destroy();
          rig.stopPassivePhysics();
        }
      },
    );
  }

test(
  "bundled worker swims to shore before building to a floating platform",
  { timeout: 26000 },
  async (t) => {
    const world = createFlatWorld("26.1.2", 56, { renderDistance: 2 });
    for (let x = -16; x <= 20; x++)
      for (let z = -6; z <= 6; z++)
        for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    for (let x = 8; x <= 13; x++)
      for (let z = -2; z <= 2; z++) world.setBlock(new Vec3(x, 63, z), "stone");
    for (let x = 0; x <= 2; x++) world.setBlock(new Vec3(x, 71, 0), "stone");
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 62, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    let shore = false;
    rig.bot.on("physicsTick", () => {
      if (
        rig.bot.entity.onGround &&
        rig.bot.entity.position.x >= 7.7 &&
        rig.bot.entity.position.y >= 64
      )
        shore = true;
    });
    const place = rig.bot._placeBlockWithOptions;
    rig.bot._placeBlockWithOptions = (...args) => {
      assert.ok(shore);
      return place(...args);
    };
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: false });
      t.signal.addEventListener(
        "abort",
        () => {
          void navigator.stop();
        },
        { once: true },
      );
      await navigator.goto(new pathfinder.goals.GoalFollowEntity(new Vec3(1.5, 72, 0.5), 0.7));
      assert.equal(shore, true);
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(rig.bot.entity.position.distanceTo(new Vec3(1.5, 72, 0.5)) < 0.8);
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "bundled worker builds a nearby wall exit instead of swimming around to a distant slope",
  { timeout: 16000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 2 });
    for (let x = -8; x <= 14; x++)
      for (let z = -16; z <= 16; z++)
        for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    for (let x = 5; x <= 14; x++)
      for (let z = -16; z <= 16; z++)
        for (let y = 56; y <= Math.min(69, 63 + Math.abs(z - 10)); y++)
          world.setBlock(new Vec3(x, y, z), "stone");
    const { rig } = createCacheWorld(version, 64, new Vec3(3.5, 62, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    const placed = [];
    const place = rig.bot._placeBlockWithOptions;
    rig.bot._placeBlockWithOptions = (reference, face, ...args) => {
      assert.ok(reference.shapes.length > 0, "Placement must have a solid anchor");
      placed.push(reference.position.plus(face));
      return place(reference, face, ...args);
    };
    let maxDetour = 0;
    rig.bot.on("physicsTick", () => { maxDetour = Math.max(maxDetour, Math.abs(rig.bot.entity.position.z - 0.5)); });
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: false });
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      const owner = { position: new Vec3(5.5, 70, 0.5) };
      await navigator.goto(pathfinder.goals.GoalFollowEntity.fromEntity(owner, 0.8, { neverfinish: false }));
      assert.ok(rig.bot.entity.position.distanceTo(owner.position) <= 0.85, String(rig.bot.entity.position));
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(placed.some(pos => pos.y <= 63 && pos.x === 4), "Build the first step against the wall in water");
      assert.ok(maxDetour < 4, `Unnecessary detour: ${maxDetour}`);
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "bundled worker keeps its water exit across partial routes and climbs back onto an offshore bridge",
  { timeout: 30000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 2 });
    for (let x = -8; x <= 30; x++)
      for (let z = -16; z <= 16; z++)
        for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    for (let x = 21; x <= 30; x++)
      for (let z = -16; z <= 16; z++)
        for (let y = 56; y <= Math.min(67, 63 + Math.abs(z - 12)); y++)
          world.setBlock(new Vec3(x, y, z), "stone");
    for (let x = 1; x <= 22; x++) world.setBlock(new Vec3(x, 71, 0), "stone");
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 62, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    const placed = [];
    const place = rig.bot._placeBlockWithOptions;
    rig.bot._placeBlockWithOptions = (reference, face, ...args) => {
      assert.ok(reference.shapes.length > 0, "Placement must have a solid anchor");
      placed.push(reference.position.plus(face));
      return place(reference, face, ...args);
    };
    let maxDetour = 0;
    rig.bot.on("physicsTick", () => { maxDetour = Math.max(maxDetour, Math.abs(rig.bot.entity.position.z - 0.5)); });
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: false });
      // Force short route prefixes to cover shore selection while swimming.
      navigator.pathfinderSettings.routePrefixMs = 1;
      navigator.pathfinderSettings.routePrefixLength = 5;
      navigator.pathfinderSettings.tickTimeoutMs = 0.25;
      const exits = [];
      const getPathTo = navigator.getPathTo.bind(navigator);
      navigator.getPathTo = (goal, ...args) => {
        if (goal instanceof pathfinder.goals.GoalCompositeAny) exits.push(goal);
        return getPathTo(goal, ...args);
      };
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      const owner = { position: new Vec3(1.5, 72, 0.5) };
      await navigator.goto(pathfinder.goals.GoalFollowEntity.fromEntity(owner, 0.8, { neverfinish: false }));
      assert.ok(rig.bot.entity.position.distanceTo(owner.position) <= 0.85, String(rig.bot.entity.position));
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(exits.length >= 2, "Exercise multiple swimming prefixes");
      assert.ok(exits.every(exit => exit === exits[0]), "Keep the same exit until reaching dry ground");
      assert.ok(placed.some(pos => pos.y === 63 && pos.x === 20), "Attach the water exit to the nearby wall");
      assert.ok(maxDetour < 4, `Unnecessary detour: ${maxDetour}`);
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "bundled worker steps out from a shore overhang and towers instead of mining into it",
  { timeout: 16000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 1 });
    for (let x = -4; x <= 12; x++) for (let z = -4; z <= 4; z++)
      for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    for (let x = 5; x <= 12; x++) for (let z = -4; z <= 4; z++)
      for (let y = 56; y <= 67; y++) world.setBlock(new Vec3(x, y, z), "stone");
    for (let z = -4; z <= 4; z++) for (let y = 66; y <= 67; y++)
      world.setBlock(new Vec3(4, y, z), "stone");
    const { rig } = createCacheWorld(version, 64, new Vec3(3.5, 62, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    const digs = [];
    const dig = rig.bot.dig;
    rig.bot.dig = (block, ...args) => { digs.push(block.position.clone()); return dig(block, ...args); };
    const placed = [];
    const place = rig.bot._placeBlockWithOptions;
    rig.bot._placeBlockWithOptions = (reference, face, ...args) => {
      assert.ok(reference.shapes.length > 0);
      placed.push(reference.position.plus(face));
      return place(reference, face, ...args);
    };
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: true });
      navigator.pathfinderSettings.routePrefixMs = 1;
      navigator.pathfinderSettings.tickTimeoutMs = 0.25;
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      const owner = { position: new Vec3(10.5, 68, 0.5) };
      await navigator.goto(pathfinder.goals.GoalFollowEntity.fromEntity(owner, 0.8, { neverfinish: false }));
      assert.ok(rig.bot.entity.position.distanceTo(owner.position) <= 0.85, String(rig.bot.entity.position));
      assert.equal(rig.bot.entity.onGround, true);
      assert.deepEqual(digs, [], "The supported tower outside the overhang is cheaper than mining stone by hand");
      assert.ok(placed.some(pos => pos.y === 63 && pos.x === 4));
      assert.ok(placed.some(pos => pos.x < 4 && pos.y >= 64), "Move out of the low ceiling before towering");
    } finally { await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics(); }
  },
);

test(
  "bundled worker continues from the shore and connects a low offshore bridge",
  { timeout: 22000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 2 });
    for (let x = -5; x <= 20; x++) for (let z = -4; z <= 4; z++)
      for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    for (let x = 14; x <= 20; x++) for (let z = -2; z <= 2; z++) world.setBlock(new Vec3(x, 63, z), "stone");
    for (let x = 0; x <= 7; x++) world.setBlock(new Vec3(x, 66, 0), "stone");
    const { rig } = createCacheWorld(version, 64, new Vec3(10.5, 62, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    let onShore = false;
    const placed = [];
    rig.bot.on("physicsTick", () => { if (rig.bot.entity.onGround && rig.bot.entity.position.x >= 13.7) onShore = true; });
    const place = rig.bot._placeBlockWithOptions;
    rig.bot._placeBlockWithOptions = (reference, face, ...args) => {
      assert.ok(reference.shapes.length > 0, "Bridge blocks need an existing anchor");
      placed.push(reference.position.plus(face));
      return place(reference, face, ...args);
    };
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: true });
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      const owner = { position: new Vec3(1.5, 67, 0.5) };
      await navigator.goto(pathfinder.goals.GoalFollowEntity.fromEntity(owner, 0.8, { neverfinish: false }));
      assert.equal(onShore, true);
      assert.ok(rig.bot.entity.position.distanceTo(owner.position) <= 0.85, String(rig.bot.entity.position));
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(placed.some(pos => pos.x > 7 && pos.x < 14 && pos.y >= 63), "Build a supported connection from shore to the bridge");
    } finally { await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics(); }
  },
);

test(
  "bundled worker can mine a necessary stone ceiling longer than the movement timeout",
  { timeout: 14000 },
  async (t) => {
    const { world, rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5));
    world.setBlock(new Vec3(1, 65, 0), "stone");
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: true });
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      assert.ok(rig.bot.digTime(world.getBlock(new Vec3(1, 65, 0))) > navigator.defaultMoveSettings.movementTimeoutMs);
      await navigator.goto(new pathfinder.goals.GoalBlock(1, 64, 0));
      assert.equal(world.getBlock(new Vec3(1, 65, 0)).name, "air");
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(1, 64, 0)));
      assert.equal(rig.bot.targetDigBlock, null);
    } finally { await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics(); }
  },
);

test(
  "bundled worker builds a horizontal connection above deep water without falling off the shore",
  { timeout: 14000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 1 });
    for (let x = -4; x <= 14; x++) for (let z = -3; z <= 3; z++)
      for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    for (let x = 10; x <= 14; x++) for (let z = -1; z <= 1; z++) world.setBlock(new Vec3(x, 66, z), "stone");
    for (let x = 0; x <= 3; x++) world.setBlock(new Vec3(x, 66, 0), "stone");
    const { rig } = createCacheWorld(version, 67, new Vec3(10.5, 67, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 16);
    rig.bot.inventory.slots[9].slot = 9;
    let lowest = 67;
    rig.bot.on("physicsTick", () => { lowest = Math.min(lowest, rig.bot.entity.position.y); });
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: true, maxDropDown: 3 });
      navigator.pathfinderSettings.routePrefixMs = 1;
      navigator.pathfinderSettings.tickTimeoutMs = 0.25;
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      await navigator.goto(new pathfinder.goals.GoalBlock(1, 67, 0));
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(1, 67, 0)));
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(lowest >= 66.9, `Fell while bridging: ${lowest}`);
      for (let x = 4; x <= 9; x++) assert.equal(world.getBlock(new Vec3(x, 66, 0)).name, "cobblestone");
    } finally { await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics(); }
  },
);

test(
  "bundled worker bounds a stalled mining action and cancels it before reporting failure",
  { timeout: 3000 },
  async (t) => {
    const { world, rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5));
    world.setBlock(new Vec3(1, 65, 0), "stone");
    let cancelDig;
    rig.bot.digTime = () => 100;
    rig.bot.dig = (block) => {
      rig.bot.targetDigBlock = block;
      return new Promise((resolve, reject) => { cancelDig = reject; });
    };
    rig.bot.stopDigging = () => {
      rig.bot.targetDigBlock = null;
      cancelDig?.(new Error("Digging aborted"));
    };
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: true });
      navigator.setMoveOptions({ movementTimeoutMs: 200 });
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      await assert.rejects(navigator.goto(new pathfinder.goals.GoalBlock(1, 64, 0)), /Movement stalled: mining/);
      assert.equal(rig.bot.targetDigBlock, null, "A failed movement must not leave the old miner running");
      assert.equal(navigator.isPathing, false);
      assert.equal(rig.bot.getControlState("forward"), false);
    } finally { rig.bot.stopDigging(); await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics(); }
  },
);

for (const fromRest of [false, true]) test(
  `bundled worker ${fromRest ? "builds ice momentum from rest" : "preserves incoming ice momentum"} instead of extending a five-block gap`,
  { timeout: 7000 },
  async () => {
    const edge = fromRest ? 14 : 6;
    const world = createFlatWorld("26.1.2", -64, { renderDistance: 2 });
    for (let x = 0; x <= edge; x++) world.setBlock(new Vec3(x, 63, 0), x >= edge - 1 ? "blue_ice" : "stone");
    for (let x = edge + 6; x <= edge + 9; x++) world.setBlock(new Vec3(x, 63, 0), "stone");
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(fromRest ? 0.5 : 5.5, 64, 0.5), { world });
    if (!fromRest) rig.bot.entity.velocity = new Vec3(0.38, -0.0784, 0);
    rig.bot.entity.onGround = true;
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    const routes = [];
    rig.bot.on("pathGenerated", (result) => routes.push(...result.path));
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowParkour: true,
        allowSprinting: true,
        canDig: false,
      });
      await navigator.goto(new pathfinder.goals.GoalBlock(edge + 7, 64, 0));
      assert.ok(routes.some((move) => move.moveType.constructor.name === "MomentumJump"));
      assert.ok(routes.every((move) => move.toPlace.length === 0));
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(edge + 7, 64, 0)));
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "bundled worker backs up from one ice block and rebounds from its rim without stopping",
  { timeout: 10000 },
  async (t) => {
    const world = createFlatWorld("26.1.2", -64, { renderDistance: 2 });
    for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 63, 0), x === 6 ? "ice" : "stone");
    for (const x of [11, 12]) world.setBlock(new Vec3(x, 63, 0), "stone");
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(6.5, 64, 0.5), { world });
    rig.bot.entity.onGround = true;
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    const routes = [];
    let previousGround = true;
    let contact;
    let rebound = false;
    rig.bot.on("pathGenerated", result => routes.push(...result.path));
    rig.bot.on("physicsTick", () => {
      const entity = rig.bot.entity;
      if (!entity.onGround && previousGround && contact) rebound = true;
      contact = entity.onGround && !previousGround && entity.position.x >= 6.7 && entity.position.x < 7.7 ? entity.position.clone() : undefined;
      previousGround = entity.onGround;
    });
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: true, allowSprinting: true, canDig: false });
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      await navigator.goto(new pathfinder.goals.GoalBlock(11, 64, 0));
      assert.ok(routes.some(move => move.metadata?.momentumRebound === true));
      assert.ok(routes.every(move => move.toPlace.length === 0 && move.toBreak.length === 0));
      assert.equal(rebound, true);
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(11, 64, 0)));
    } finally { await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics(); }
  },
);

test(
  "bundled worker preserves the ice rebound when its followed player moves on the contact tick",
  { timeout: 10000 },
  async (t) => {
    const world = createFlatWorld("26.1.2", -64, { renderDistance: 2 });
    for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 63, 0), x === 6 ? "ice" : "stone");
    for (const x of [11, 12]) world.setBlock(new Vec3(x, 63, 0), "stone");
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { world });
    rig.bot.entity.onGround = true;
    const owner = { position: new Vec3(11.5, 64, 0.5) };
    let previousGround = true, contactTick = -1, reboundTick = -1, tick = 0;
    rig.bot.on("physicsTick", () => {
      tick++;
      const entity = rig.bot.entity;
      if (contactTick < 0 && entity.onGround && !previousGround && entity.position.x >= 6.7 && entity.position.x < 7.7) {
        contactTick = tick;
        owner.position.x = 12.7;
        rig.bot.emit("entityMoved", owner);
      }
      if (contactTick >= 0 && reboundTick < 0 && !entity.onGround) reboundTick = tick;
      previousGround = entity.onGround;
    });
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: true, allowSprinting: true, canDig: false });
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      await navigator.goto(pathfinder.goals.GoalFollowEntity.fromEntity(owner, 0.8, { neverfinish: false }));
      assert.ok(contactTick >= 0);
      assert.equal(reboundTick, contactTick + 1);
      assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(owner.position) <= 0.85);
    } finally { await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics(); }
  },
);

test(
  "bundled worker crosses the saved eight-block runway and single ice across five air columns",
  { timeout: 15000 },
  async (t) => {
    const world = createFlatWorld("26.1.2", -64, { renderDistance: 2 });
    for (let x = 0; x <= 7; x++) world.setBlock(new Vec3(x, 70, 0), x === 7 ? "ice" : "cobblestone");
    for (const x of [13, 14]) world.setBlock(new Vec3(x, 70, 0), "cobblestone");
    const { rig } = createCacheWorld("26.1.2", 71, new Vec3(0.5, 71, 0.53), { world });
    rig.bot.entity.onGround = true;
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    let tick = 0, contactTick = -1, reboundTick = -1, lowest = 71, previousGround = true;
    const moves = [];
    let wireLooks = 0, wireYawErrors = 0;
    const write = rig.bot._client.write;
    rig.bot._client.write = (packet, data) => {
      if (data.yaw != null && rig.bot.pathfinder?.currentExecutor?.canInterrupt === false) {
        wireLooks++;
        if (Math.cos(Math.PI - data.yaw * Math.PI / 180 - rig.bot.entity.yaw) < 0.999999) wireYawErrors++;
      }
      write(packet, data);
    };
    rig.bot.on("pathGenerated", path => moves.push(...path.path));
    rig.bot.on("physicsTick", () => {
      tick++;
      const e = rig.bot.entity;
      lowest = Math.min(lowest, e.position.y);
      if (e.onGround && !previousGround && e.position.x >= 7.7 && e.position.x < 8.7) contactTick = tick;
      if (contactTick >= 0 && reboundTick < 0 && !e.onGround) reboundTick = tick;
      previousGround = e.onGround;
    });
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: true, allowSprinting: true, canDig: false });
      t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
      await navigator.goto(new pathfinder.goals.GoalNear(13.5, 71, 0.5, 2));
      assert.ok(moves.some(move => move.metadata?.momentumRebound === true));
      assert.ok(moves.every(move => move.metadata?.momentumAirStrafe !== true));
      assert.ok(moves.every(move => move.toPlace.length === 0 && move.toBreak.length === 0));
      assert.equal(reboundTick, contactTick + 1);
      assert.ok(lowest >= 70.99);
      assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.x >= 13 && rig.bot.entity.position.x < 15);
      assert.ok(wireLooks > 0);
      assert.equal(wireYawErrors, 0, "transmitted look follows the verified flight without lag");
      assert.ok(-Math.sin(rig.bot.entity.yaw) > 0.9999, "look forward after landing");
    } finally { await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics(); }
  },
);

test("bundled worker follows across consecutive ice jumps with head turns disabled by default", { timeout: 14000 }, async (t) => {
  const world = createFlatWorld("26.1.2", -64, { renderDistance: 3 });
  for (const [start, length] of [[0, 8], [13, 6], [24, 5]]) {
    for (let x = start; x < start + length; x++) world.setBlock(new Vec3(x, 70, 0),
      start !== 24 && x === start + length - 1 ? "blue_ice" : "cobblestone");
  }
  const { rig } = createCacheWorld("26.1.2", 71, new Vec3(0.5, 71, 0.5), { world });
  rig.bot.entity.onGround = true;
  const routes = [];
  const owner = { position: new Vec3(25.5, 71, 0.5) };
  let moved = false, badLook = 0, lowest = 71;
  rig.bot.on("pathGenerated", result => routes.push(...result.path));
  rig.bot.on("physicsTick", () => {
    const entity = rig.bot.entity;
    lowest = Math.min(lowest, entity.position.y);
    if (rig.bot.pathfinder?.currentExecutor?.canInterrupt === false &&
        (-Math.sin(entity.yaw) < 0.999999 || rig.bot.getControlState("right"))) badLook++;
    if (!moved && entity.onGround && Math.floor(entity.position.x) === 13) {
      moved = true; owner.position.x = 27.5; rig.bot.emit("entityMoved", owner);
    }
  });
  try {
    const navigator = worker.configurePathfinder(rig.bot, { allowParkour: true, allowSprinting: true, canDig: false });
    assert.equal(navigator.defaultMoveSettings.allowAirStrafe, false);
    t.signal.addEventListener("abort", () => { void navigator.stop(); }, { once: true });
    await navigator.goto(pathfinder.goals.GoalFollowEntity.fromEntity(owner, 0.8, { neverfinish: false }));
    assert.ok(routes.some(move => move.metadata?.momentumSegments?.length === 2));
    assert.ok(routes.every(move => move.toPlace.length === 0 && move.toBreak.length === 0));
    assert.equal(moved, true);
    assert.equal(badLook, 0);
    assert.ok(lowest >= 70.99);
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(owner.position) <= 0.85);
    const turned = createCacheWorld("26.1.2", 71, new Vec3(0.5, 71, 0.5), { world });
    try {
      worker.configurePathfinder(turned.rig.bot, { allowAirStrafe: true, allowParkour: true, allowSprinting: true });
      assert.equal(turned.rig.bot.pathfinder.defaultMoveSettings.allowAirStrafe, true);
    } finally { await turned.rig.bot.pathfinder?.destroy(); turned.rig.stopPassivePhysics(); }
  } finally { await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics(); }
});

test(
  "bundled worker checks the continuation before running onto a blocked ice rim",
  { timeout: 8000 },
  async () => {
    const world = createFlatWorld("26.1.2", -64, { renderDistance: 2 });
    for (let x = 0; x <= 7; x++) world.setBlock(new Vec3(x, 70, 0), x === 7 ? "ice" : "cobblestone");
    for (const x of [13, 14]) world.setBlock(new Vec3(x, 70, 0), "cobblestone");
    for (let x = 7; x <= 9; x++) world.setBlock(new Vec3(x, 73, 0), "stone");
    const start = new Vec3(0.5, 71, 0.5);
    const { rig } = createCacheWorld("26.1.2", 71, start, { world });
    rig.bot.entity.onGround = true;
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: true, allowSprinting: true, canDig: false });
      navigator.pathfinderSettings.routePrefixMs = 1;
      navigator.pathfinderSettings.tickTimeoutMs = 0.1;
      await assert.rejects(navigator.goto(new pathfinder.goals.GoalNear(13.5, 71, 0.5, 1)), /Pathfinding failed: (noPath|timeout)/);
      assert.ok(rig.bot.entity.position.xzDistanceTo(start) < 0.01);
    } finally { await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics(); }
  },
);

test(
  "bundled worker leaves water and builds up to the owner on a bridge with parkour and digging off",
  { timeout: 15000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 1 });
    for (let x = -3; x <= 12; x++)
      for (let z = -3; z <= 3; z++)
        for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    for (let y = 56; y <= 67; y++) world.setBlock(new Vec3(5, y, 0), "stone");
    for (let x = 3; x <= 8; x++) world.setBlock(new Vec3(x, 67, 0), "stone");
    const { rig } = createCacheWorld(version, 64, new Vec3(3.5, 62, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    const placed = [];
    const place = rig.bot._placeBlockWithOptions;
    rig.bot._placeBlockWithOptions = (reference, face, ...args) => {
      assert.ok(reference.shapes.length > 0, "Placement must have a real solid anchor");
      placed.push(reference.position.plus(face));
      return place(reference, face, ...args);
    };
    const routes = [];
    rig.bot.on("pathGenerated", (result) => routes.push(...result.path));
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: true,
        allowParkour: false,
        canDig: false,
        maxDropDown: 3,
      });
      t.signal.addEventListener(
        "abort",
        () => {
          void navigator.stop();
        },
        { once: true },
      );
      const owner = { position: new Vec3(5.5, 68, 0.5) };
      await navigator.goto(
        pathfinder.goals.GoalFollowEntity.fromEntity(owner, 0.8, { neverfinish: false }),
      );
      assert.ok(
        rig.bot.entity.position.distanceTo(owner.position) <= 0.85,
        String(rig.bot.entity.position),
      );
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(placed.length > 0);
      assert.ok(
        routes.some(
          (move) => move.moveType.constructor.name === "ForwardJump" && move.toPlace.length > 0,
        ),
      );
      assert.ok(routes.every((move) => move.toBreak.length === 0));
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "worker defaults to floating after a high water drop from an existing bridge with digging off",
  { timeout: 14000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 1 });
    for (let x = -3; x <= 12; x++)
      for (let z = -3; z <= 3; z++) {
        for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
      }
    for (let x = 0; x <= 4; x++) world.setBlock(new Vec3(x, 83, 0), "stone");
    const { rig } = createCacheWorld(version, 84, new Vec3(3.5, 84, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    const routes = [];
    rig.bot.on("pathGenerated", (result) =>
      routes.push(
        result.path.map((m) => ({
          waterLanding: m.metadata?.waterLanding === true,
          breaks: m.toBreak.length,
          places: m.toPlace.length,
        })),
      ),
    );
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        maxDropDown: 3,
      });
      t.signal.addEventListener(
        "abort",
        () => {
          void navigator.stop();
        },
        { once: true },
      );
      await navigator.goto(
        new pathfinder.goals.GoalFollowEntity(new Vec3(8.5, 63, 0.5), 1, { neverfinish: false }),
      );
      assert.ok(routes.flat().some((m) => m.waterLanding));
      assert.ok(
        routes.flat().every((m) => m.breaks === 0 && m.places === 0),
        "Use the ocean instead of extending the bridge",
      );
      await rig.bot.waitForTicks(20);
      assert.equal(world.getBlock(rig.bot.entity.position.offset(0, 1.62, 0))?.name, "air");
      assert.ok(rig.bot.entity.position.y > 62.7, String(rig.bot.entity.position));
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "worker honors disabled STAY ON WATER and disconnect removes the overlay",
  { timeout: 2500 },
  async () => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 1 });
    for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(0, y, 0), "water");
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 61, 0.5), { world });
    const originalSet = rig.bot.setControlState;
    try {
      worker.configurePathfinder(
        rig.bot,
        {
          allowSprinting: false,
          allowParkour: false,
          canDig: false,
          maxDropDown: 3,
        },
        { stayOnWater: false },
      );
      assert.equal(rig.bot.setControlState, originalSet);
      await rig.bot.waitForTicks(20);
      assert.equal(rig.bot.getControlState("jump"), false);
      assert.ok(rig.bot.entity.position.y < 61);
      pathfinder.installSurfaceSwimming(rig.bot);
      assert.notEqual(rig.bot.setControlState, originalSet);
      rig.bot.emit("end");
      assert.equal(rig.bot.setControlState, originalSet);
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "bundled worker climbs a short ladder beside azalea with digging and building enabled",
  { timeout: 10000 },
  async () => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 64, { renderDistance: 1 });
    const { mcData, Block } = require("./tests/setup/mc-data.ts").loadMcData(version);
    const data = mcData.blocksByName.ladder;
    let state;
    for (let id = data.minStateId; id <= data.maxStateId; id++) {
      const props = Block.fromStateId(id, 0).getProperties();
      if (props.facing === "west" && !props.waterlogged) {
        state = id;
        break;
      }
    }
    assert.ok(state != null);
    for (let y = 64; y <= 67; y++) {
      world.setBlock(new Vec3(2, y, 0), "cobblestone");
      if (y === 65 || y === 66) world.setBlock(new Vec3(1, y, 0), state);
    }
    world.setBlock(new Vec3(0, 64, 1), "azalea");
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 64, -0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 32);
    rig.bot.inventory.slots[9].slot = 9;
    const routes = [];
    rig.bot.on("pathGenerated", (result) =>
      routes.push(
        result.path.map((m) => ({
          provider: m.moveType.constructor.name,
          breaks: m.toBreak.length,
          places: m.toPlace.length,
        })),
      ),
    );
    const digs = [];
    const dig = rig.bot.dig;
    rig.bot.dig = (block, ...args) => {
      digs.push(block.position.clone());
      return dig(block, ...args);
    };
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: true,
        maxDropDown: 3,
      });
      await navigator.goto(new pathfinder.goals.GoalBlock(2, 68, 0));
      assert.ok(
        rig.bot.entity.position.floored().equals(new Vec3(2, 68, 0)),
        String(rig.bot.entity.position),
      );
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(routes.flat().some((m) => m.provider === "Climb"));
      assert.ok(routes.flat().every((m) => m.breaks === 0 && m.places === 0));
      assert.deepEqual(digs, []);
      assert.equal(world.getBlock(new Vec3(0, 64, 1))?.name, "azalea");
      assert.equal(world.getBlock(new Vec3(1, 66, 0))?.name, "ladder");
      assert.equal(world.getBlock(new Vec3(2, 67, 0))?.name, "cobblestone");
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

for (const version of ["1.20.4", "26.1.2"]) {
  test(
    `worker uses the bundled rewrite and honors movement settings on ${version}`,
    { timeout: 6000 },
    async () => {
      const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
      const sprintRequests = [];
      const setControl = rig.bot.setControlState;
      rig.bot.setControlState = (name, value) => {
        if (name === "sprint" && value) sprintRequests.push(value);
        setControl(name, value);
      };
      try {
        const navigator = worker.configurePathfinder(rig.bot, {
          allowSprinting: false,
          allowParkour: false,
          canDig: false,
          maxDropDown: 2,
        });
        assert.equal(navigator.movements.has(pathfinder.movementProviders.ParkourForward), false);
        assert.equal(navigator.movements.has(pathfinder.movementProviders.ParkourDiagonal), false);
        for (const name of [
          "NeoProvider",
          "MomentumJump",
          "LadderForward",
          "LadderDiagonal",
          "LadderLandingForward",
          "LadderLandingDiagonal",
          "AroundCornerDiagonal",
        ]) {
          assert.equal(navigator.movements.has(pathfinder.movementProviders[name]), false, name);
        }
        assert.equal(navigator.defaultMoveSettings.canDig, false);
        assert.equal(navigator.defaultMoveSettings.canPlace, true);
        assert.equal(navigator.defaultMoveSettings.allow1by1towers, true);
        assert.equal(navigator.defaultMoveSettings.maxDropDown, 2);
        await navigator.goto(new pathfinder.goals.GoalNear(5, 64, 0, 1));
        assert.ok(rig.bot.entity.position.distanceTo(new Vec3(5, 64, 0)) <= 1.1);
        assert.equal(navigator.currentGoal, undefined);
        assert.deepEqual(sprintRequests, []);
      } finally {
        await rig.bot.pathfinder?.destroy();
        rig.stopPassivePhysics();
      }
    },
  );
}

test(
  "bundled worker executes a Neo facing the landing on Minecraft 26.1.2",
  { timeout: 8000 },
  async () => {
    const world = createFlatWorld("26.1.2", -64, { renderDistance: 1 });
    for (let x = 0; x < 10; x++) world.setBlock(new Vec3(x, 63, 0), "stone");
    for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(3, y, 0), "stone");
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { world });
    const used = [];
    const facing = [];
    const pitches = [];
    rig.bot.on("physicsTick", () => {
      const move = rig.bot.pathfinder?.currentMove;
      if (move?.moveType.constructor.name !== "NeoProvider" || rig.bot.entity.onGround) return;
      const delta = move.exitPos.minus(rig.bot.entity.position);
      delta.y = 0;
      const yaw = rig.bot.entity.yaw;
      facing.push(new Vec3(-Math.sin(yaw), 0, -Math.cos(yaw)).dot(delta.normalize()));
      pitches.push(rig.bot.entity.pitch);
    });
    rig.bot.on("pathGenerated", (result) =>
      used.push(...result.path.map((move) => move.moveType.constructor.name)),
    );
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        maxDropDown: 3,
      });
      await navigator.goto(new pathfinder.goals.GoalBlock(7, 64, 0));
      assert.ok(used.includes("NeoProvider"));
      assert.ok(
        facing.length > 5 && facing.every((dot) => dot > 0.45),
        `Look direction: ${facing}`,
      );
      assert.ok(
        pitches.every((pitch) => pitch < 0),
        "Look down at the landing floor",
      );
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(7, 64, 0)));
      assert.ok(rig.bot.listenerCount("blockUpdate") <= 3);
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "bundled worker climbs twisting vines with parkour disabled on 26.1.2",
  { timeout: 9000 },
  async () => {
    const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
    for (let y = 64; y <= 67; y++) {
      world.setBlock(new Vec3(2, y, 0), "stone");
      world.setBlock(new Vec3(1, y, 0), y === 67 ? "twisting_vines" : "twisting_vines_plant");
    }
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { world });
    const used = [];
    rig.bot.on("pathGenerated", (result) =>
      used.push(...result.path.map((move) => move.moveType.constructor.name)),
    );
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: false,
        allowParkour: false,
        canDig: false,
        maxDropDown: 2,
      });
      assert.ok(navigator.movements.has(pathfinder.movementProviders.Climb));
      await navigator.goto(new pathfinder.goals.GoalBlock(2, 68, 0));
      assert.ok(used.includes("Climb"), used.join(","));
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(2, 68, 0)));
      assert.equal(rig.bot.entity.onGround, true);
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);
