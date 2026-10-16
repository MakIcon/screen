import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const runtime = process.env.SCREEN_COMBAT_RUNTIME
  ? createRequire(path.resolve(process.env.SCREEN_COMBAT_RUNTIME, "package.json"))
  : require;
const { createCombatController, installCombatProtocol } = runtime("./combat.cjs");
const { createCrystalMovement } = runtime("./crystal-movement.cjs");
const { explosionDamage, createCrystalPlanner } = runtime("./crystals.cjs");
const { normalizeCombat } = runtime("./combat.cjs");
const { Vec3 } = require("vec3");
const mf = createRequire(runtime.resolve("mineflayer"));
const { PlayerState } = mf("prismarine-physics");
const protocol = mf("minecraft-protocol");
const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const faces = [
  new Vec3(0, -1, 0),
  new Vec3(0, 1, 0),
  new Vec3(0, 0, -1),
  new Vec3(0, 0, 1),
  new Vec3(-1, 0, 0),
  new Vec3(1, 0, 0),
];

function fixture(version, settings = {}, onCrystal = () => {}) {
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
  rig.stopPassivePhysics();
  const bot = rig.bot,
    packets = [],
    errors = [],
    statuses = [],
    routes = [];
  bot.physicsEnabled = false;
  bot.supportFeature = bot.registry.supportFeature;
  bot.health = 20;
  for (const plugin of ["entities", "inventory", "simple_inventory", "generic_place"])
    bot.loadPlugin(runtime(`mineflayer/lib/plugins/${plugin}`), { hideErrors: false });
  bot.setQuickBarSlot(0);
  const Item = mf("prismarine-item")(bot.registry);
  for (const [slot, name] of [
    [36, "end_crystal"],
    [37, "obsidian"],
    [5, "netherite_helmet"],
    [6, "netherite_chestplate"],
    [7, "netherite_leggings"],
    [8, "netherite_boots"],
  ]) {
    const item = new Item(bot.registry.itemsByName[name].id, slot < 9 ? 1 : 64);
    item.slot = slot;
    bot.inventory.slots[slot] = item;
  }
  bot.equip = async (item) => {
    const from = item.slot,
      previous = bot.inventory.slots[36];
    bot.inventory.slots[36] = item;
    item.slot = 36;
    bot.inventory.slots[from] = previous;
    if (previous) previous.slot = from;
  };
  bot.pathfinder = {
    stop: async () => bot.clearControlStates(),
    goto: (goal) => {
      routes.push(goal);
      return new Promise(() => {});
    },
  };
  bot.swordpvp = {
    target: null,
    attack: async (entity) => {
      bot.swordpvp.target = entity;
    },
    stop: () => {
      bot.swordpvp.target = null;
    },
  };
  const enemy = {
    id: 2,
    username: "Enemy",
    type: "player",
    isValid: true,
    width: 0.6,
    height: 1.8,
    position: new Vec3(5.5, 64, 0.5),
    velocity: new Vec3(0, 0, 0),
  };
  bot.entities[2] = enemy;
  let time = 0,
    entityId = 100;
  const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
  bot._client.state = "play";
  bot._client.write = (name, params) => {
    serializer.createPacketBuffer({ name, params });
    const held = bot.heldItem?.name;
    packets.push({ name, params, held, time });
    if (name === "block_place") {
      setImmediate(() => {
        if (held === "end_crystal") {
          const crystal = {
            id: entityId++,
            name: "end_crystal",
            type: "other",
            isValid: true,
            width: 2,
            height: 2,
            position: params.location.offset(0.5, 1, 0.5),
          };
          bot.entities[crystal.id] = crystal;
          onCrystal({ bot, enemy, crystal, time });
          bot.emit("entitySpawn", crystal);
        } else {
          const position = params.location.plus(faces[params.direction]);
          const before = bot.blockAt(position);
          world.setBlock(position, held);
          bot.emit(`blockUpdate:${position}`, before, bot.blockAt(position));
        }
      });
    }
    if (name === "attack" || (name === "use_entity" && params.mouse === 1)) {
      const id = params.entityId ?? params.target;
      setImmediate(() => {
        const crystal = bot.entities[id];
        delete bot.entities[id];
        if (crystal) bot.emit("entityGone", crystal);
      });
    }
  };
  installCombatProtocol(bot);
  const controller = createCombatController(
    bot,
    { style: "crystal", reactionMs: 0, crystalEnabled: true, ...settings },
    {
      loadPlugins: false,
      now: () => time,
      onError: (error) => errors.push(error),
      onStatus: (status) => statuses.push(status),
    },
  );
  return {
    bot,
    enemy,
    world,
    packets,
    errors,
    statuses,
    routes,
    controller,
    async tick(at, physics = false) {
      time = at;
      bot.emit("physicsTick");
      await controller.idleTask;
      await flush();
      if (physics)
        bot.physics.simulatePlayer(new PlayerState(bot, bot.controlState), world).apply(bot);
    },
    close() {
      controller.dispose();
      rig.stopPassivePhysics();
    },
  };
}

const attacks = (f) =>
  f.packets.filter((p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1));
const placements = (f) =>
  f.packets.filter((p) => p.name === "block_place" && p.held === "end_crystal");
const readControls = (bot) =>
  Object.fromEntries(
    ["forward", "back", "left", "right", "jump", "sprint"].map((name) => [
      name,
      bot.getControlState(name),
    ]),
  );

test("crystal planning never snaps live player coordinates to block corners", () => {
  const f = fixture("26.1.2");
  const planner = createCrystalPlanner(f.bot, normalizeCombat({ crystalEnabled: true }));
  try {
    f.bot.entity.position.set(0.72, 64.25, -0.35);
    const own = f.bot.entity.position.clone();
    const enemy = f.enemy.position.clone();
    const velocity = f.bot.entity.velocity.clone();
    const action = planner.plan(f.enemy, 0);
    assert.deepEqual(
      f.bot.entity.position,
      own,
      "planning is a read of live physics, not a teleport",
    );
    if (action) planner.verify(f.enemy, action, 50);
    planner.reposition(f.enemy, 100, true);
    assert.deepEqual(f.bot.entity.position, own);
    assert.deepEqual(f.enemy.position, enemy);
    assert.deepEqual(f.bot.entity.velocity, velocity);
  } finally {
    f.close();
  }
});

test("crystal movement holds an already reached position even with a wall ahead", async () => {
  const f = fixture("26.1.2");
  const movement = createCrystalMovement(f.bot);
  try {
    f.enemy.position.set(2.5, 64, 0.5);
    f.world.setBlock(new Vec3(1, 64, 0), "stone");
    f.world.setBlock(new Vec3(1, 65, 0), "stone");
    await movement.setGoal(f.enemy, 3);
    assert.equal(f.routes.length, 0, "arrival is checked before routing around obstacles");
    assert.ok(Object.values(readControls(f.bot)).every((value) => !value));
  } finally {
    movement.cancel();
    f.close();
  }
});

test("auto starts a crystal setup immediately and keeps it ahead of wind/mace selection", async () => {
  const f = fixture("26.1.2", { style: "auto", crystalIntervalMs: 50 });
  const Item = mf("prismarine-item")(f.bot.registry);
  for (const [slot, name] of [
    [38, "mace"],
    [39, "wind_charge"],
    [40, "diamond_axe"],
  ]) {
    const item = new Item(f.bot.registry.itemsByName[name].id, 1);
    item.slot = slot;
    f.bot.inventory.slots[slot] = item;
  }
  const equips = [],
    equip = f.bot.equip;
  f.bot.equip = async (item) => {
    equips.push(item.name);
    await equip(item);
  };
  // Starting with a weapon exposes redundant crystal -> obsidian swaps.
  await equip(f.bot.inventory.slots[38]);
  try {
    f.controller.select(f.enemy);
    await f.tick(0);
    assert.equal(
      f.packets.filter((p) => p.name === "block_place").length,
      1,
      "first action on selection tick",
    );
    assert.equal(equips[0], "obsidian", "equip the actual next construction item");
    for (let tick = 1; tick < 16 && !attacks(f).length; tick++) {
      await f.tick(tick * 50);
      assert.match(f.controller.status, /^crystal /);
    }
    assert.equal(placements(f).length, 1);
    assert.equal(attacks(f).length, 1);
    assert.ok(
      attacks(f)[0].time <= 300,
      `confirmed chain has no extra planner waits: ${attacks(f)[0].time}`,
    );
    assert.equal(
      f.packets.some((p) => p.held === "wind_charge" && p.name === "use_item"),
      false,
    );
    assert.deepEqual(f.errors, []);
  } finally {
    f.close();
  }
});

test("crystal movement serializes turns and stopping waits for an outstanding aim", async () => {
  const f = fixture("26.1.2");
  const movement = createCrystalMovement(f.bot);
  const look = f.bot.look;
  const releases = [];
  f.bot.look = async (...args) => {
    await new Promise((resolve) => releases.push(resolve));
    return look(...args);
  };
  try {
    const first = movement.setGoal(f.enemy, 2);
    const second = movement.tick();
    assert.equal(releases.length, 1, "only one movement turn may be in flight");
    let stopped = false;
    const stopping = movement.stop().then(() => {
      stopped = true;
    });
    await flush();
    assert.equal(stopped, false, "placement cannot aim until the old movement aim is done");
    for (const release of releases) release();
    await Promise.all([first, second, stopping]);
    assert.ok(Object.values(readControls(f.bot)).every((value) => !value));
  } finally {
    for (const release of releases) release();
    movement.cancel();
    f.close();
  }
});

test("crystal movement detects walking in place and gives the route time to bypass it", async () => {
  const f = fixture("26.1.2");
  let time = 0;
  const movement = createCrystalMovement(f.bot, { now: () => time });
  try {
    f.enemy.position.x = 8.5;
    f.bot.entity.yaw = -Math.PI / 2;
    await movement.setGoal(f.enemy, 3);
    assert.equal(f.bot.controlState.forward, true);
    for (time = 50; time <= 900; time += 50) await movement.tick();
    assert.equal(f.routes.length, 1, "stalled direct walking hands off to the terrain planner");
    assert.equal(f.bot.controlState.forward, false);
    for (; time <= 1600; time += 50) await movement.tick();
    assert.equal(f.routes.length, 1, "does not cancel/restart the route every tick");
    assert.equal(f.bot.controlState.forward, false);
  } finally {
    movement.cancel();
    f.close();
  }
});

test("crystal reposition requires a usable action instead of an endless retreat", () => {
  const f = fixture("26.1.2");
  const planner = createCrystalPlanner(
    f.bot,
    normalizeCombat({
      crystalEnabled: true,
      crystalMaxSelfDamage: 0,
      crystalCover: false,
    }),
  );
  try {
    f.enemy.position.x = 1.8;
    assert.equal(planner.plan(f.enemy, 0), null);
    assert.equal(
      planner.reposition(f.enemy, 0, true),
      null,
      "unsafe layouts do not create blind movement goals",
    );
  } finally {
    f.close();
  }
});

for (const version of ["1.20.4", "26.1.2"]) {
  test(`crystal approach reaches a complete physical combo without snapping or shuffle on ${version}`, async () => {
    const f = fixture(version, { crystalBuildBase: false });
    try {
      f.world.setBlock(new Vec3(8, 64, 0), "obsidian");
      f.enemy.position.x = 10.5;
      f.controller.select(f.enemy);
      const start = f.bot.entity.position.clone();
      const controls = [];
      for (let tick = 0; tick < 120 && !attacks(f).length; tick++) {
        const before = f.bot.entity.position.clone();
        await f.tick(tick * 50);
        assert.deepEqual(
          f.bot.entity.position,
          before,
          "only movement physics can advance position",
        );
        controls.push(readControls(f.bot));
        f.bot.physics
          .simulatePlayer(new PlayerState(f.bot, f.bot.controlState), f.world)
          .apply(f.bot);
      }
      assert.ok(f.bot.entity.position.x - start.x > 2, "walks toward a useful crystal position");
      assert.equal(placements(f).length, 1, f.statuses.join("; "));
      assert.equal(attacks(f).length, 1, "finishes the approached crystal cycle");
      assert.equal(
        controls.some((c) => c.back || c.left || c.right),
        false,
      );
      assert.equal(f.routes.length, 0, "flat approach needs no repeated pathfinding");
      assert.deepEqual(f.errors, []);
    } finally {
      f.close();
    }
  });

  test(`auto director commits a profitable crystal combo and finishes after the target flees on ${version}`, async () => {
    const f = fixture(version, { style: "auto" }, ({ enemy }) => {
      enemy.position.x = 13;
    });
    try {
      f.controller.select(f.enemy);
      for (let tick = 0; tick < 35 && !attacks(f).length; tick++) await f.tick(tick * 50);
      assert.deepEqual(f.errors, []);
      assert.equal(placements(f).length, 1, f.statuses.join("; "));
      assert.equal(attacks(f).length, 1, "complete the confirmed explosion before chasing");
      assert.ok(attacks(f)[0].time - placements(f)[0].time <= 100);
    } finally {
      f.close();
    }
  });

  test(`auto director keeps melee when crystals have no profitable safe setup on ${version}`, async () => {
    const f = fixture(version, { style: "auto", crystalMaxSelfDamage: 0, crystalCover: false });
    try {
      f.controller.select(f.enemy);
      await f.tick(0);
      await f.tick(50);
      assert.deepEqual(f.errors, []);
      assert.equal(f.bot.swordpvp.target, f.enemy);
      assert.equal(placements(f).length, 0);
      assert.equal(f.packets.filter((p) => p.name === "block_place").length, 0);
      assert.equal(f.controller.decision.crystal.use, false);
    } finally {
      f.close();
    }
  });

  test(`auto director refuses setup during close pressure and checks HP again after equip on ${version}`, async () => {
    const f = fixture(version, { style: "auto" });
    try {
      f.bot.health = 12;
      f.enemy.position.x = 3.4;
      f.controller.select(f.enemy);
      await f.tick(0);
      assert.equal(f.bot.swordpvp.target, f.enemy);
      assert.equal(placements(f).length, 0);
      f.bot.health = 20;
      f.enemy.position.x = 5.5;
      const equip = f.bot.equip;
      f.bot.equip = async (item) => {
        await equip(item);
        f.bot.health = 5;
      };
      for (let tick = 1; tick <= 12; tick++) await f.tick(tick * 50);
      assert.deepEqual(f.errors, []);
      assert.equal(placements(f).length, 0, "health loss invalidates the prepared explosion");
      assert.equal(f.bot.swordpvp.target, f.enemy);
    } finally {
      f.close();
    }
  });
}

for (const version of ["1.20.4", "26.1.2"]) {
  test(`crystal finishes its explosion when the target flees during spawn on ${version}`, async () => {
    let lowDamage = null;
    const f = fixture(version, { crystalMinDamage: 8 }, ({ bot, enemy, crystal }) => {
      enemy.position.x = 13.5;
      enemy.velocity.x = 2;
      lowDamage = explosionDamage(bot, enemy, crystal.position);
    });
    try {
      f.controller.select(f.enemy);
      for (let tick = 0; tick < 20 && !attacks(f).length; tick++) await f.tick(tick * 50);
      assert.ok(lowDamage > 0 && lowDamage < 8, `fled target takes a small amount: ${lowDamage}`);
      assert.equal(
        placements(f).length,
        1,
        "finishes the existing crystal before another foundation",
      );
      assert.equal(attacks(f).length, 1, `finishes after fleeing: ${f.statuses.join("; ")}`);
      assert.deepEqual(f.errors, []);
      assert.equal(f.routes.length, 0, "does not leave to chase before the explosion");
      assert.ok(
        attacks(f)[0].time - placements(f)[0].time <= 100,
        "breaks promptly after confirmed spawn",
      );
    } finally {
      f.close();
    }
  });

  test(`crystal keeps placing and exploding under close melee pressure on ${version}`, async () => {
    const f = fixture(version, { crystalMaxSelfDamage: 3 });
    const controls = [];
    try {
      f.enemy.position = f.bot.entity.position.offset(1.3, 0, 0);
      f.controller.select(f.enemy);
      for (let tick = 0; tick < 70; tick++) {
        f.enemy.position.update(f.bot.entity.position.offset(1.3, 0, 0));
        if (tick % 5 === 0) {
          f.bot.emit("entityHurt", f.bot.entity, f.enemy);
          f.bot.entity.velocity.x += 0.04;
        }
        await f.tick(tick * 50, true);
        controls.push(readControls(f.bot));
      }
      assert.ok(placements(f).length >= 2, `places while attacked: ${f.statuses.join("; ")}`);
      assert.ok(attacks(f).length >= 2, "completes repeated explosions at close range");
      assert.equal(
        controls.some((c) => c.back || c.left || c.right),
        false,
        "does not oscillate controls",
      );
      assert.deepEqual(f.errors, []);
      f.controller.stop();
      assert.equal(f.bot.controlState.forward, false);
    } finally {
      f.close();
    }
  });

  test(`crystal moves out of an occupied layout instead of holding blocks forever on ${version}`, async () => {
    const f = fixture(version);
    try {
      f.enemy.position.update(f.bot.entity.position.offset(0.1, 0, 0));
      f.controller.select(f.enemy);
      const start = f.bot.entity.position.clone();
      for (let tick = 0; tick < 50; tick++) await f.tick(tick * 50, true);
      assert.ok(
        placements(f).length || f.bot.entity.position.distanceTo(start) > 0.7,
        `acts or makes room: ${f.statuses.join("; ")}`,
      );
      assert.ok(attacks(f).length, "finds a usable attack after overlapping bodies");
      assert.deepEqual(f.errors, []);
    } finally {
      f.close();
    }
  });

  test(`crystal movement crosses a stepped approach without reverse/strafe braking on ${version}`, async () => {
    const f = fixture(version);
    const movement = createCrystalMovement(f.bot);
    try {
      for (let x = 4; x <= 15; x++)
        for (let z = -1; z <= 1; z++) {
          f.world.setBlock(new Vec3(x, 64, z), "stone");
          if (x >= 8) f.world.setBlock(new Vec3(x, 65, z), "stone");
        }
      f.enemy.position.set(12.5, 66, 0.5);
      const controls = [];
      await movement.setGoal(f.enemy, 3);
      for (let tick = 0; tick < 130; tick++) {
        await movement.tick();
        controls.push(readControls(f.bot));
        f.bot.physics
          .simulatePlayer(new PlayerState(f.bot, f.bot.controlState), f.world)
          .apply(f.bot);
      }
      assert.ok(
        f.bot.entity.position.x > 8.5 && f.bot.entity.position.y >= 66,
        `reaches the upper terrace: ${f.bot.entity.position}`,
      );
      assert.equal(f.routes.length, 0, "does not repeatedly hand stairs to precision routing");
      assert.equal(
        controls.some((c) => c.back || c.left || c.right),
        false,
      );
      assert.ok(
        controls.some((c) => c.jump),
        "steps up with a normal jump",
      );
      await movement.stop();
      assert.equal(f.bot.controlState.forward, false);
    } finally {
      movement.cancel();
      f.close();
    }
  });
}

test("an entity obstructing the crystal attack triggers a usable reposition", () => {
  const f = fixture("26.1.2", { crystalCover: false });
  const settings = normalizeCombat({ crystalEnabled: true, crystalCover: false });
  const planner = createCrystalPlanner(f.bot, settings);
  try {
    f.world.setBlock(new Vec3(3, 64, 0), "obsidian");
    const action = planner.plan(f.enemy, 0);
    assert.equal(action.type, "place");
    planner.commit(action, 0);
    const crystal = {
      id: 100,
      name: "end_crystal",
      isValid: true,
      width: 2,
      height: 2,
      position: action.source,
    };
    f.bot.entities[100] = crystal;
    f.bot.entities[10] = {
      id: 10,
      isValid: true,
      width: 0.8,
      height: 4,
      position: new Vec3(1.5, 64, 0.5),
    };
    assert.equal(
      planner.plan(f.enemy, 50),
      null,
      "does not select an attack intercepted by another entity",
    );
    const move = planner.reposition(f.enemy, 50);
    assert.ok(move, "chooses a different attack angle");
    f.bot.entity.position.update(move.position);
    const next = planner.plan(f.enemy, 100);
    assert.equal(next?.type, "break", "the new position gives a usable crystal attack");
  } finally {
    f.close();
  }
});

test("finishing a placed crystal still respects self damage and nearby owners", () => {
  const f = fixture("26.1.2", { crystalCover: false });
  const settings = normalizeCombat({
    crystalEnabled: true,
    crystalCover: false,
    crystalMinDamage: 8,
  });
  const planner = createCrystalPlanner(f.bot, settings, (name) => name === "Owner");
  try {
    f.world.setBlock(new Vec3(3, 64, 0), "obsidian");
    const action = planner.plan(f.enemy, 0);
    assert.equal(action.type, "place");
    planner.commit(action, 0);
    const crystal = {
      id: 100,
      name: "end_crystal",
      isValid: true,
      width: 2,
      height: 2,
      position: action.source,
    };
    f.bot.entities[100] = crystal;
    f.enemy.position.x = 13.5;
    f.bot.entities[10] = {
      id: 10,
      username: "Owner",
      isValid: true,
      width: 0.6,
      height: 1.8,
      position: new Vec3(6.5, 64, 0.5),
    };
    assert.equal(planner.plan(f.enemy, 50), null, "does not explode into another owner");
    delete f.bot.entities[10];
    f.bot.health = 8;
    assert.equal(planner.plan(f.enemy, 100), null, "does not finish with unsafe remaining health");
    f.bot.health = 20;
    assert.equal(planner.plan(f.enemy, 150).type, "break", "finishes once those constraints clear");
  } finally {
    f.close();
  }
});
