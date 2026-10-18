import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const runtime = process.env.SCREEN_COMBAT_RUNTIME
  ? createRequire(path.resolve(process.env.SCREEN_COMBAT_RUNTIME, "package.json"))
  : require;
const { Vec3 } = require("vec3");
const { createMaceCombat } = runtime("./mace.cjs");
const { createCombatController, normalizeCombat, installCombatProtocol } = runtime("./combat.cjs");
const { createBowDefense, detectMaceThreat } = runtime("./bow-defense.cjs");
const { bestMeleeWeapon } = runtime("./combat-inventory.cjs");
const { installKnockback } = runtime("./knockback.cjs");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(patch = {}) {
  const bot = new EventEmitter(),
    calls = [],
    controls = {};
  let time = 0;
  const items = [{ name: "mace" }, { name: "wind_charge", count: 16 }, { name: "shield" }];
  const enemy = {
    id: 2,
    name: "player",
    username: "Enemy",
    isValid: true,
    position: new Vec3(2, 64, 0),
    velocity: new Vec3(0, 0, 0),
    width: 0.6,
    height: 1.8,
    equipment: [],
    metadata: [],
  };
  Object.assign(bot, {
    entity: {
      id: 1,
      position: new Vec3(0, 64, 0),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
      yaw: 0,
      pitch: 0,
      height: 1.8,
      width: 0.6,
    },
    username: "Bot",
    health: 20,
    heldItem: items[0],
    entities: { 2: enemy },
    inventory: { items: () => items, slots: [] },
    registry: {
      itemsByName: { mace: {} },
      entitiesByName: { player: { metadataKeys: ["living_entity_flags"] } },
    },
    supportFeature: () => false,
    _client: Object.assign(new EventEmitter(), {
      state: "play",
      write: (name, params) => calls.push([name, params]),
    }),
    blockAt: () => ({ name: "stone", boundingBox: "block" }),
    world: { raycast: () => null },
    setControlState: (name, value) => {
      controls[name] = value;
      calls.push(["control", name, value]);
    },
    clearControlStates: () => {
      for (const key of Object.keys(controls)) controls[key] = false;
    },
    lookAt: async (point) => {
      const delta = point.minus(bot.entity.position.offset(0, 1.62, 0));
      bot.entity.yaw = Math.atan2(-delta.x, -delta.z);
      bot.entity.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
      calls.push(["aim", point]);
    },
    equip: async (item, hand) => {
      calls.push(["equip", item.name, hand]);
      if (hand === "hand") bot.heldItem = item;
      else bot.inventory.slots[45] = item;
    },
    activateItem: (offhand) => {
      bot.usingHeldItem = true;
      calls.push(["use", bot.heldItem.name, offhand]);
    },
    deactivateItem: () => {
      bot.usingHeldItem = false;
      calls.push(["release"]);
    },
    attack: (entity) => calls.push(["hit", entity.id, bot.heldItem.name, bot.entity.position.y]),
    pathfinder: {
      stop: async () => calls.push(["stop"]),
      setGoal: (goal) => calls.push(["goal", goal]),
      goto: async () => calls.push(["goto"]),
    },
    swordpvp: {
      attack: async (entity) => {
        bot.swordpvp.target = entity;
        calls.push(["custom"]);
      },
      stop: () => {
        bot.swordpvp.target = null;
      },
    },
    pvp: {
      attack: async (entity) => {
        bot.pvp.target = entity;
        calls.push(["basic"]);
      },
      forceStop: () => {
        bot.pvp.target = null;
      },
    },
  });
  const settings = normalizeCombat({
    weapon: "mace",
    style: "melee",
    meleeSkill: 100,
    reactionMs: 0,
    maceDefense: false,
    ...patch,
  });
  const errors = [];
  const options = { now: () => time, random: () => 0, onError: (error) => errors.push(error) };
  const mace = createMaceCombat(bot, settings, options);
  async function tick(at, y, vy, onGround = false) {
    time = at;
    if (y !== undefined) {
      bot.entity.position.y = y;
      bot.entity.velocity.y = vy;
      bot.entity.onGround = onGround;
    }
    mace.tick();
    await mace.task;
    await flush();
  }
  return {
    bot,
    enemy,
    items,
    calls,
    controls,
    mace,
    settings,
    options,
    errors,
    tick,
    setTime: (at) => {
      time = at;
    },
  };
}

async function launch(f) {
  f.mace.start(f.enemy);
  await f.tick(0);
  assert.equal(f.controls.jump, true);
  assert.equal(
    f.calls.some(([name]) => name === "use"),
    false,
    "jump precedes throwing",
  );
  await f.tick(50, 64.42, 0.33);
  assert.equal(f.controls.jump, false);
  assert.deepEqual(
    f.calls.find(([name]) => name === "use"),
    ["use", "wind_charge", false],
  );
  const useIndex = f.calls.findIndex(([name]) => name === "use");
  assert.equal(
    f.calls[useIndex - 1][0],
    "position_look",
    "publishes jump and downward rotation before use",
  );
  assert.ok(f.calls[useIndex - 1][1].y > 64);
  assert.equal(f.bot.heldItem.name, "mace");
}

test("wind launch brakes sprint momentum before jumping and re-aims at the current feet", async () => {
  const f = fixture();
  try {
    f.bot.entity.velocity.x = 0.28;
    f.controls.forward = f.controls.sprint = true;
    f.mace.start(f.enemy);
    await f.tick(0);
    assert.equal(f.mace.airborne, true, "the launch owns movement while braking");
    assert.equal(f.controls.jump, false, "does not jump with residual sprint velocity");
    f.bot.entity.position.x = 0.3;
    f.bot.entity.velocity.x = 0.08;
    await f.tick(100);
    assert.equal(f.controls.jump, false);
    f.bot.entity.velocity.x = 0.02;
    await f.tick(200);
    assert.equal(f.controls.jump, true);
    f.bot.entity.position.x = 0.32;
    await f.tick(250, 64.42, 0.33);
    const useIndex = f.calls.findIndex(([name]) => name === "use");
    const aim = f.calls.slice(0, useIndex).findLast(([name]) => name === "aim")[1];
    assert.equal(aim.x, f.bot.entity.position.x);
    assert.equal(aim.z, f.bot.entity.position.z);
    assert.ok(aim.y < f.bot.entity.position.y);
    assert.equal(f.calls[useIndex - 1][1].pitch, 90, "throws straight down");
    assert.ok(Object.values(f.controls).every((value) => value === false));
  } finally {
    f.mace.dispose();
  }
});

test("wind launch holds its blast position through delayed boost then pursues a moving target", async () => {
  const f = fixture();
  try {
    await launch(f);
    f.enemy.position.x = 3;
    f.enemy.velocity.x = 0.1;
    for (const [at, y, vy] of [
      [100, 64.75, 0.248],
      [150, 65, 0.165],
      [200, 65.16, 0.083],
    ]) {
      await f.tick(at, y, vy);
      assert.ok(
        Object.values(f.controls).every((value) => value === false),
        "no pursuit before boost",
      );
    }
    await f.tick(250, 66.2, 0.95);
    assert.equal(f.controls.forward, true, "starts tracking as soon as upward impulse is observed");
    assert.equal(f.calls.filter(([name]) => name === "use").length, 1);
  } finally {
    f.mace.dispose();
  }
});

test("an ordinary jump without a wind impulse never becomes a smash and retries are bounded", async () => {
  const f = fixture();
  try {
    await launch(f);
    for (const [at, y, vy] of [
      [100, 64.75, 0.248],
      [150, 65, 0.165],
      [250, 65.25, 0],
      [400, 64.4, -0.3],
    ]) {
      await f.tick(at, y, vy);
      assert.equal(f.mace.imminentSmash, false);
      assert.ok(Object.values(f.controls).every((value) => value === false));
    }
    await f.tick(500, 64, 0, true);
    assert.equal(f.mace.airborne, false);
    await f.tick(1000);
    assert.equal(f.controls.jump, false);
    assert.equal(f.calls.filter(([name]) => name === "use").length, 1);
    assert.equal(f.calls.filter(([name]) => name === "hit").length, 0);
  } finally {
    f.mace.dispose();
  }
});

test("braking is bounded and launch clearance is checked again after equipping", async () => {
  for (const reason of ["sliding", "falling", "roof"]) {
    const f = fixture();
    try {
      f.bot.entity.velocity.x = 0.28;
      f.mace.start(f.enemy);
      await f.tick(0);
      if (reason === "falling") f.bot.entity.onGround = false;
      if (reason === "roof")
        f.bot.world.raycast = (_origin, direction) => (direction.y > 0.9 ? {} : null);
      await f.tick(reason === "sliding" ? 1100 : 100);
      assert.equal(f.mace.airborne, false, reason);
      assert.equal(f.controls.jump, false, reason);
      assert.equal(
        f.calls.some(([name]) => name === "use"),
        false,
        reason,
      );
    } finally {
      f.mace.dispose();
    }
  }
});

test("launch owns movement during slow equip and stop cancels a delayed downward aim", async () => {
  const f = fixture();
  let release;
  const equip = f.bot.equip;
  f.bot.equip = async (...args) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    await equip(...args);
  };
  try {
    f.mace.start(f.enemy);
    f.mace.tick();
    await flush();
    assert.equal(f.mace.airborne, true);
    assert.ok(Object.values(f.controls).every((value) => value === false));
    release();
    await f.mace.task;
    f.bot.equip = equip;
    assert.equal(f.controls.jump, true);
    const look = f.bot.lookAt;
    f.bot.lookAt = async (...args) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      await look(...args);
    };
    const jumping = f.tick(50, 64.42, 0.33);
    await flush();
    f.mace.stop();
    release();
    await jumping;
    assert.equal(f.mace.airborne, false);
    assert.equal(
      f.calls.some(([name]) => name === "use"),
      false,
    );
    assert.ok(Object.values(f.controls).every((value) => value === false));
  } finally {
    f.mace.dispose();
  }
});

test("wind jump waits for real descent, fall distance, hitbox reach and confirmed Wind Burst", async () => {
  const f = fixture();
  try {
    await launch(f);
    await f.tick(100, 68, 0.7);
    await f.tick(150, 70, 0);
    await f.tick(200, 69, -0.2);
    assert.equal(
      f.calls.some(([name]) => name === "hit"),
      false,
    );
    await f.tick(250, 68, -0.5);
    assert.equal(
      f.calls.some(([name]) => name === "hit"),
      false,
      "still outside real reach",
    );
    await f.tick(300, 65.5, -0.9);
    assert.equal(f.calls.filter(([name]) => name === "hit").length, 1);
    f.bot.emit("entityHurt", f.enemy);
    await f.tick(350, 67, 0.8);
    await f.tick(400, 71, 0.1);
    await f.tick(450, 65.5, -1);
    assert.equal(f.calls.filter(([name]) => name === "hit").length, 2, "chains a confirmed bounce");
    assert.equal(f.calls.filter(([name]) => name === "use").length, 1, "bounce consumes no charge");
    assert.deepEqual(f.errors, []);
  } finally {
    f.mace.dispose();
  }
});

test("unconfirmed or shielded hits do not start a Wind Burst combo", async () => {
  for (const blocked of [false, true]) {
    const f = fixture();
    try {
      await launch(f);
      await f.tick(100, 70, 0);
      await f.tick(300, 65.5, -1);
      if (blocked) {
        f.enemy.metadata[0] = 3;
        f.enemy.equipment[1] = { name: "shield" };
        f.bot.emit("entityHurt", f.enemy);
      }
      await f.tick(350, 68, 1);
      await f.tick(450, 72, 0);
      await f.tick(600, 65.5, -1);
      assert.equal(f.calls.filter(([name]) => name === "hit").length, 1);
    } finally {
      f.mace.dispose();
    }
  }
});

test("successful smash on the ground starts another jump after the wind cooldown", async () => {
  const f = fixture();
  try {
    await launch(f);
    await f.tick(100, 70, 0);
    await f.tick(300, 65.5, -1);
    f.bot.emit("entityHurt", f.enemy);
    await f.tick(350, 64, 0, true);
    await f.tick(550);
    assert.equal(f.controls.jump, true);
    await f.tick(600, 64.42, 0.33);
    assert.equal(f.calls.filter(([name]) => name === "use").length, 2);
  } finally {
    f.mace.dispose();
  }
});

test("miss, roof and absent charges use bounded retries and the grounded mace cooldown", async () => {
  const f = fixture();
  f.items.splice(1, 1);
  try {
    f.mace.start(f.enemy);
    await f.tick(0);
    await f.tick(100);
    await f.tick(1600);
    await f.tick(1700);
    assert.equal(f.calls.filter(([name]) => name === "hit").length, 2);
    assert.equal(
      f.calls.some(([name]) => name === "use"),
      false,
    );
    assert.equal(f.controls.jump, false);
  } finally {
    f.mace.dispose();
  }
  const roof = fixture();
  roof.bot.world.raycast = (_origin, direction) => (direction.y > 0.9 ? {} : null);
  try {
    roof.mace.start(roof.enemy);
    await roof.tick(0);
    assert.equal(
      roof.calls.some(([name]) => name === "use"),
      false,
    );
    assert.equal(roof.calls.filter(([name]) => name === "hit").length, 1);
  } finally {
    roof.mace.dispose();
  }
});

test("switching to a grounded mace charges it before the first ordinary attack", async () => {
  const f = fixture();
  f.items.splice(1, 1);
  f.bot.heldItem = { name: "diamond_sword" };
  try {
    f.mace.start(f.enemy);
    await f.tick(0);
    await f.tick(1600);
    assert.equal(
      f.calls.some(([name]) => name === "hit"),
      false,
    );
    await f.tick(1700);
    assert.equal(f.calls.filter(([name]) => name === "hit").length, 1);
  } finally {
    f.mace.dispose();
  }
});

test("stop, target loss and survival invalidate an in-flight inventory operation", async () => {
  for (const reason of ["stop", "gone", "survival", "defense"]) {
    const f = fixture();
    let release;
    f.bot.equip = async () =>
      new Promise((resolve) => {
        release = resolve;
      });
    try {
      f.mace.start(f.enemy);
      f.mace.tick();
      await flush();
      if (reason === "stop") f.mace.stop();
      if (reason === "gone") f.enemy.isValid = false;
      if (reason === "survival") f.bot.launcherSurvival = { busy: true };
      if (reason === "defense") f.bot.launcherDefendingBow = true;
      release();
      await f.mace.task;
      await f.tick(500);
      assert.equal(
        f.calls.some(([name]) => name === "hit" || name === "use"),
        false,
        reason,
      );
      assert.equal(f.controls.jump, false, reason);
    } finally {
      f.mace.dispose();
    }
  }
});

test("walls, moving targets, zero skill and raised shields prevent a falling hit", async () => {
  for (const reason of ["wall", "moving", "skill", "shield"]) {
    const f = fixture(reason === "skill" ? { meleeSkill: 0 } : {});
    try {
      await launch(f);
      await f.tick(100, 70, 0);
      if (reason === "wall") f.bot.world.raycast = () => ({});
      if (reason === "moving") f.enemy.position.x = 12;
      if (reason === "shield") {
        f.enemy.metadata[0] = 3;
        f.enemy.equipment[1] = { name: "shield" };
      }
      await f.tick(300, 65.5, -1);
      assert.equal(
        f.calls.some(([name]) => name === "hit"),
        false,
        reason,
      );
      assert.equal(f.mace.imminentSmash, false, "rescue may handle an unsafe miss");
    } finally {
      f.mace.dispose();
    }
  }
});

test("a reachable high descent keeps the mace until its future hit window, then yields on a miss", async () => {
  const f = fixture();
  try {
    await launch(f);
    await f.tick(100, 73, 0);
    await f.tick(150, 72.8, -0.2);
    assert.equal(
      f.mace.imminentSmash,
      true,
      "MLG must not acquire the hand before reaching the target",
    );
    f.enemy.position.x = 15;
    assert.equal(f.mace.imminentSmash, false, "an unreachable target permits rescue immediately");
  } finally {
    f.mace.dispose();
  }
});

test("mace preference uses its controller with both engines and falls back on older versions", async () => {
  for (const engine of ["custom", "basic"]) {
    const f = fixture({ engine });
    f.mace.dispose();
    const controller = createCombatController(f.bot, f.settings, {
      ...f.options,
      loadPlugins: false,
    });
    try {
      controller.select(f.enemy);
      f.bot.emit("physicsTick");
      await controller.idleTask;
      assert.match(controller.status, /^mace /);
      f.bot.emit("physicsTick");
      await controller.idleTask;
      assert.equal(f.controls.jump, true);
      assert.equal(
        f.calls.some(([name]) => name === "custom" || name === "basic"),
        false,
      );
      controller.stop();
      assert.equal(f.controls.jump, false);
      delete f.bot.registry.itemsByName.mace;
      f.items.push({ name: "diamond_sword" });
      assert.equal(bestMeleeWeapon(f.bot, "mace").name, "diamond_sword");
      controller.select(f.enemy);
      f.bot.emit("physicsTick");
      await controller.idleTask;
      assert.match(controller.status, /^melee /);
      assert.ok(f.calls.some(([name]) => name === engine));
    } finally {
      controller.dispose();
    }
  }
});

test("mace defense predicts interception and ignores a pass, grounded carrier, wall and stale motion", () => {
  const f = fixture();
  f.enemy.heldItem = { name: "mace" };
  f.enemy.position = new Vec3(3, 73, 0);
  f.enemy.velocity = new Vec3(-0.12, -0.5, 0);
  try {
    assert.ok(detectMaceThreat(f.bot)?.ticks >= 5, "raises shield before the activation delay");
    f.enemy.velocity.x = 1;
    assert.equal(detectMaceThreat(f.bot), null);
    f.enemy.velocity.x = -0.12;
    f.enemy.onGround = true;
    assert.equal(detectMaceThreat(f.bot), null);
    f.enemy.onGround = false;
    f.bot.world.raycast = () => ({});
    assert.equal(detectMaceThreat(f.bot), null);
    f.bot.world.raycast = () => null;
    assert.equal(
      detectMaceThreat(f.bot, new Map([[2, { at: 0, velocity: f.enemy.velocity }]]), 1200),
      null,
    );
  } finally {
    f.mace.dispose();
  }
});

test("auto keeps its mace after the hit confirmation expires until landing, even against a raised shield", async () => {
  const f = fixture({ style: "auto", weapon: "sword", pearlChase: true });
  f.items.push({ name: "diamond_sword" }, { name: "diamond_axe" });
  f.mace.dispose();
  const controller = createCombatController(f.bot, f.settings, {
    ...f.options,
    loadPlugins: false,
  });
  let pearlAttempts = 0;
  f.bot.launcherTravel = {
    chase: () => {
      pearlAttempts++;
      return false;
    },
    stopChase() {},
  };
  const step = async (time, y, vy, onGround = false) => {
    f.setTime(time);
    Object.assign(f.bot.entity, { onGround });
    f.bot.entity.position.y = y;
    f.bot.entity.velocity.y = vy;
    f.bot.emit("physicsTick");
    await controller.idleTask;
    await flush();
  };
  try {
    controller.select(f.enemy);
    await step(0, 64, 0, true);
    await step(50, 64.42, 0.33);
    await step(100, 71, 0);
    await step(200, 65.5, -0.9);
    assert.equal(f.calls.filter(([name]) => name === "hit").length, 1);
    f.enemy.equipment[1] = { name: "shield" };
    f.enemy.metadata[0] = 3;
    await step(900, 65.4, -0.3);
    await step(950, 65.2, -0.4);
    assert.match(controller.status, /^mace /);
    assert.equal(f.bot.heldItem.name, "mace");
    f.enemy.position.x = 20;
    await step(1000, 65, -0.5);
    assert.equal(pearlAttempts, 0, "pearl pursuit cannot replace the airborne sequence");
    f.enemy.position.x = 2;
    await step(1050, 64, 0, true);
    await step(1100, 64, 0, true);
    assert.match(controller.status, /^melee /, "shield breaking may take over after landing");
    assert.deepEqual(f.errors, []);
  } finally {
    controller.dispose();
  }
});

test("mace shield works with arrow defense off, samples motion and resumes after the landing", async () => {
  const f = fixture({ maceDefense: true, bowDefense: false });
  f.mace.dispose();
  f.enemy.heldItem = { name: "mace" };
  f.enemy.position = new Vec3(3, 73, 0);
  f.enemy.velocity = new Vec3(0, 0, 0);
  let before = 0,
    after = 0;
  const defense = createBowDefense(f.bot, f.settings, {
    ...f.options,
    beforeDefend: () => {
      before++;
    },
    afterDefend: () => {
      after++;
    },
  });
  try {
    defense.tick(true);
    await defense.task;
    assert.equal(Boolean(f.bot.launcherDefendingBow), false);
    f.setTime(50);
    f.enemy.position = new Vec3(2.8, 72.4, 0);
    f.bot.emit("entityMoved", f.enemy);
    await defense.task;
    assert.equal(f.bot.launcherDefendingBow, true);
    assert.equal(before, 1);
    assert.equal(f.bot.inventory.slots[45].name, "shield");
    assert.ok(f.bot.entity.pitch > 0, "looks up at the attacker");
    f.setTime(100);
    f.enemy.position = new Vec3(2, 71, 1);
    f.bot.emit("entityMoved", f.enemy);
    await defense.task;
    assert.equal(before, 1, "keeps the same defense active while tracking");
    f.enemy.onGround = true;
    f.enemy.position.y = 64;
    f.setTime(200);
    f.bot.emit("entityMoved", f.enemy);
    await defense.task;
    f.setTime(2000);
    defense.tick(true);
    await defense.task;
    assert.equal(f.bot.launcherDefendingBow, false);
    assert.equal(after, 1);
    assert.deepEqual(f.errors, []);
  } finally {
    defense.dispose();
  }
});

// Actual Mineflayer use/attack APIs and versioned packet serializers, with
// server knockback delivered through decoded explosion packets and real physics.
const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const mineflayerRequire = createRequire(runtime.resolve("mineflayer"));
const protocol = mineflayerRequire("minecraft-protocol");
const { PlayerState } = mineflayerRequire("prismarine-physics");

for (const version of ["1.21.1", "26.1.2"]) {
  test(`real wind-charge, mace and shield packets serialize on ${version}`, async () => {
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
    const bot = rig.bot;
    rig.stopPassivePhysics();
    bot.physicsEnabled = true;
    bot.health = 20;
    bot.supportFeature = bot.registry.supportFeature;
    bot.entity.onGround = true;
    for (const plugin of ["entities", "inventory", "simple_inventory"])
      bot.loadPlugin(runtime(`mineflayer/lib/plugins/${plugin}`), { hideErrors: false });
    bot.setQuickBarSlot(0);
    const Item = mineflayerRequire("prismarine-item")(bot.registry);
    for (const [slot, name] of [
      [36, "mace"],
      [37, "wind_charge"],
      [45, "shield"],
    ]) {
      const entry = new Item(bot.registry.itemsByName[name].id, 8);
      entry.slot = slot;
      bot.inventory.slots[slot] = entry;
    }
    bot.equip = async (entry, hand) => {
      const from = entry.slot,
        to = bot.getEquipmentDestSlot(hand),
        old = bot.inventory.slots[to];
      bot.inventory.slots[from] = old;
      if (old) old.slot = from;
      bot.inventory.slots[to] = entry;
      entry.slot = to;
    };
    const packets = [],
      errors = [];
    const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
    bot._client.state = "play";
    bot._client.write = (name, params) => {
      serializer.createPacketBuffer({ name, params });
      packets.push({ name, params, held: bot.heldItem?.name, y: bot.entity.position.y });
    };
    installCombatProtocol(bot);
    bot.pathfinder = { stop: async () => {}, setGoal: () => {} };
    const enemy = {
      id: 2,
      name: "player",
      type: "player",
      username: "Enemy",
      isValid: true,
      position: new Vec3(2, 64, 0.5),
      width: 0.6,
      height: 1.8,
      velocity: new Vec3(0, 0, 0),
    };
    bot.entities[2] = enemy;
    let time = 0;
    const settings = normalizeCombat({ weapon: "mace", meleeSkill: 100, maceDefense: true });
    const mace = createMaceCombat(bot, settings, {
      now: () => time,
      onError: (error) => errors.push(error),
    });
    const knockback = installKnockback(bot);
    const serverSerializer = protocol.createSerializer({ state: "play", isServer: true, version });
    const clientParser = protocol.createDeserializer({ state: "play", isServer: false, version });
    const explode = (center, lift) => {
      const particle = { type: "gust_emitter_small" };
      const params = {
        ...center, center, radius: 1.2, affectedBlockOffsets: [],
        playerMotionX: 0, playerMotionY: lift, playerMotionZ: 0,
        playerKnockback: { x: 0, y: lift, z: 0 }, block_interaction_type: 3,
        small_explosion_particle: particle, large_explosion_particle: particle,
        explosionParticle: particle, blockCount: 0, blockParticles: [],
        sound: { soundId: bot.registry.soundsByName["entity.wind_charge.wind_burst"].id },
      };
      const packet = serverSerializer.createPacketBuffer({ name: "explosion", params });
      bot._client.emit("explosion", clientParser.parsePacketBuffer(packet).data.params);
    };
    async function step(at, y, vy, onGround) {
      time = at;
      bot.entity.position.y = y;
      bot.entity.velocity.y = vy;
      bot.entity.onGround = onGround;
      mace.tick();
      await mace.task;
    }
    try {
      mace.start(enemy);
      await step(0, 64, 0, true);
      await step(50, 64.42, 0.33, false);
      const use = packets.find((packet) => packet.name === "use_item");
      assert.equal(use?.held, "wind_charge");
      assert.ok(use.y > 64);
      assert.equal(packets[packets.indexOf(use) - 1].name, "position_look");
      assert.ok(packets[packets.indexOf(use) - 1].params.y > 64);
      await step(100, 71, 0, false);
      await step(300, 65.5, -0.9, false);
      const attack = packets.find(
        (packet) =>
          packet.name === "attack" || (packet.name === "use_entity" && packet.params.mouse === 1),
      );
      assert.equal(attack?.held, "mace");
      assert.equal(attack.params.entityId ?? attack.params.target, 2);
      mace.stop();

      // Real movement physics with residual sprint momentum and delayed server
      // impulses, with anti-knockback both disabled and enabled. The server
      // burst only reaches a bot still above its impact; assigning local upward
      // velocity would hide the anti-knockback filter swallowing this packet.
      for (const antiKnockback of [false, true]) for (const [delayTicks, momentum] of [
        [1, 0],
        [3, 0.28],
        [5, -0.28],
      ]) {
        knockback.setEnabled(antiKnockback);
        bot.entity.position.set(0.5, 64, 0.5);
        bot.entity.velocity.set(momentum, 0, 0);
        bot.entity.onGround = true;
        enemy.position.x = 3.5;
        const beforeFlight = packets.length;
        let boosted = false,
          physicsHit = false,
          thrownAt = null,
          impact = null;
        const started = 2000 + (antiKnockback ? 30000 : 0) + delayTicks * 5000;
        time = started;
        mace.start(enemy);
        for (let tick = 0; tick < 80; tick++) {
          time = started + tick * 50;
          bot.physics
            .simulatePlayer(new PlayerState(bot, bot.controlState), { getBlock: bot.blockAt })
            .apply(bot);
          mace.tick();
          await mace.task;
          const flightPackets = packets.slice(beforeFlight);
          if (thrownAt === null && flightPackets.some((packet) => packet.name === "use_item")) {
            thrownAt = tick;
            impact = bot.entity.position.clone();
            const useIndex = flightPackets.findIndex((packet) => packet.name === "use_item");
            assert.equal(flightPackets[useIndex - 1].params.pitch, 90);
            assert.ok(Math.hypot(bot.entity.velocity.x, bot.entity.velocity.z) < 0.025);
          }
          if (thrownAt !== null && !boosted) {
            assert.ok(
              Object.values(bot.controlState).every((value) => value === false),
              "holds for the server burst",
            );
            if (tick === thrownAt + delayTicks) {
              const drift = Math.hypot(
                bot.entity.position.x - impact.x,
                bot.entity.position.z - impact.z,
              );
              assert.ok(
                drift < 0.15,
                `stays above impact during ${delayTicks * 50} ms delay: ${drift}`,
              );
              if (drift < 0.3) {
                explode({ x: impact.x, y: 64.1, z: impact.z }, 1.05 - bot.entity.velocity.y);
                boosted = bot.entity.velocity.y > 1;
              }
            }
          }
          if (
            flightPackets.some(
              (packet) =>
                packet.name === "attack" ||
                (packet.name === "use_entity" && packet.params.mouse === 1),
            )
          ) {
            physicsHit = true;
            assert.equal(bot.entity.onGround, false);
            assert.ok(bot.entity.velocity.y < 0);
            assert.ok(bot.entity.position.x > 0.5, "moves toward the enemy after the burst");
            bot.emit("entityHurt", enemy);
            explode(bot.entity.position, 1.05 - bot.entity.velocity.y);
            assert.ok(bot.entity.velocity.y > 1, "confirmed Wind Burst also survives anti-knockback");
            break;
          }
        }
        assert.notEqual(thrownAt, null, "the bot actually throws a charge in this run");
        assert.ok(boosted, `a delayed server burst lifts the bot; antiKnockback=${antiKnockback}`);
        assert.ok(physicsHit, "the complete physical wind jump reaches a smash opportunity");
        assert.equal(
          packets.slice(beforeFlight).filter((packet) => packet.name === "use_item").length,
          1,
        );
        mace.stop();
      }
      enemy.heldItem = { name: "mace" };
      enemy.position.y = 74;
      enemy.velocity.y = -0.6;
      bot.entity.position.y = 64;
      bot.entity.velocity.y = 0;
      bot.entity.onGround = true;
      const defense = createBowDefense(bot, settings, {
        now: () => time,
        onError: (error) => errors.push(error),
      });
      try {
        defense.tick(true);
        await defense.task;
        assert.equal(bot.launcherDefendingBow, true);
        assert.ok(packets.some((packet) => packet.name === "use_item" && packet.params.hand === 1));
      } finally {
        defense.dispose();
      }
      assert.deepEqual(errors, []);
    } finally {
      mace.dispose();
      knockback.dispose();
      rig.stopPassivePhysics();
    }
  });
}
