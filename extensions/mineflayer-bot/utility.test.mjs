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
const { normalizeCombat, installCombatProtocol, createCombatController } = runtime("./combat.cjs");
const { pearlOrigin, simulatePearlFlight, simulatePearl, planPearl, createTravelController } =
  runtime("./pearls.cjs");
const { explosionDamage, createCrystalPlanner } = runtime("./crystals.cjs");
const { createBowDefense, detectBowThreat } = runtime("./bow-defense.cjs");
const { Vec3 } = require("vec3");
const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const mineflayerRequire = createRequire(runtime.resolve("mineflayer"));
const protocol = mineflayerRequire("minecraft-protocol");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function worldFixture(version = "26.1.2") {
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), {
    renderDistance: 4,
  });
  rig.bot.physicsEnabled = false;
  rig.bot.entity.onGround = true;
  rig.bot.health = 20;
  return { bot: rig.bot, world, dispose: () => rig.stopPassivePhysics() };
}

function assertCrystalClick(bot, packet) {
  const { yaw, pitch } = bot.entity;
  const origin = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0);
  const direction = new Vec3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
  const hit = bot.world.raycast(origin, direction, 4.5);
  assert.ok(hit?.position.equals(packet.location), "view ray reaches the clicked block");
  assert.equal(hit.face, packet.direction, "clicks the face visible under the crosshair");
  for (const axis of ["X", "Y", "Z"])
    assert.ok(
      Math.abs(
        packet[`cursor${axis}`] -
          (hit.intersect[axis.toLowerCase()] - packet.location[axis.toLowerCase()]),
      ) < 1e-5,
      "cursor agrees with view ray",
    );
}

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(`pearl trajectories reach safe terrain and serialize real use packets on ${version}`, async () => {
    const f = worldFixture(version),
      bot = f.bot;
    bot.supportFeature = bot.registry.supportFeature;
    const calls = [];
    bot.pathfinder = {
      stop: async () => {},
      goto: () => {
        calls.push("walk");
        return new Promise(() => {});
      },
    };
    bot.loadPlugin(runtime("mineflayer/lib/plugins/inventory"), { hideErrors: false });
    bot.loadPlugin(runtime("mineflayer/lib/plugins/simple_inventory"));
    bot.setQuickBarSlot(0);
    const Item = mineflayerRequire("prismarine-item")(bot.registry);
    const pearl = new Item(bot.registry.itemsByName.ender_pearl.id, 4);
    pearl.slot = 36;
    bot.inventory.slots[36] = pearl;
    const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
    bot._client.state = "play";
    bot._client.write = (name, params) => {
      serializer.createPacketBuffer({ name, params });
      calls.push({ name, params });
    };
    installCombatProtocol(bot);
    const settings = normalizeCombat({ enabled: false, pearlEnabled: true });
    const destination = new Vec3(60.5, 64, 0.5);
    const shot = planPearl(bot, destination, settings);
    assert.ok(shot);
    assert.ok(shot.landing.x > 30 && shot.landing.x <= 48.5);
    assert.equal(shot.landing.y, 64);
    assert.deepEqual(simulatePearl(bot, shot.yaw, shot.pitch)?.landing, shot.landing);
    const travel = createTravelController(bot, settings, {
      now: () => 0,
      onError: (error) => {
        throw error;
      },
    });
    try {
      travel.start({}, () => destination, "follow", "follow Owner", 3);
      await flush();
      bot.emit("physicsTick");
      await flush();
      await flush();
      assert.equal(travel.waiting, true);
      const use = calls.find((c) => c.name === (version === "1.8.8" ? "block_place" : "use_item"));
      assert.ok(use, "real Mineflayer throw");
      assert.equal(calls[calls.indexOf(use) - 1].name, "look");
      assert.equal(calls.filter((c) => c === "walk").length, 1);
      bot.entity.position = shot.landing.clone();
      bot.emit("physicsTick");
      await flush();
      assert.equal(travel.waiting, false);
      assert.equal(calls.filter((c) => c === "walk").length, 2);
    } finally {
      travel.dispose();
      f.dispose();
    }
  });
}

for (const version of ["1.20.4", "26.1.2"]) {
  test(`combat escape respects permissions, HP, one-flight ownership and arrival on ${version}`, async () => {
    const f = travelFixture({}, version);
    const destination = new Vec3(-20.5, 64, 0.5),
      results = [];
    try {
      f.bot.health = 5;
      assert.equal(
        f.travel.escape(
          () => destination,
          () => true,
        ),
        false,
      );
      f.bot.health = 10;
      const shot = planPearl(f.bot, destination, f.settings, 2.5, true);
      assert.ok(shot);
      assert.equal(
        f.travel.escape(
          () => destination,
          () => true,
          (result) => results.push(result),
        ),
        true,
      );
      await flush();
      await flush();
      assert.equal(f.travel.waiting, true);
      assert.equal(f.bot.launcherPearling, true);
      assert.equal(
        f.travel.escape(
          () => destination,
          () => true,
        ),
        false,
      );
      assert.equal(f.calls.filter((call) => call === "throw").length, 1);
      f.bot.entity.position = shot.landing.clone();
      await f.tick(500);
      assert.equal(f.travel.waiting, false);
      assert.equal(f.bot.launcherPearling, false);
      assert.deepEqual(results, [{ thrown: true, arrived: true }]);
      assert.equal(
        f.travel.escape(
          () => new Vec3(0.5, 64, 0.5),
          () => true,
        ),
        false,
        "cooldown survives arrival",
      );
    } finally {
      f.close();
    }
    for (const patch of [{ pearlEnabled: false }, { pearlEscape: false }, { pearlReserve: 4 }]) {
      const disabled = travelFixture(patch, version);
      try {
        assert.equal(
          disabled.travel.escape(
            () => destination,
            () => true,
          ),
          false,
        );
      } finally {
        disabled.close();
      }
    }
  });
}

test("escape cancelled during equip cannot throw after a new command", async () => {
  const f = travelFixture();
  let release;
  f.bot.equip = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  try {
    assert.equal(
      f.travel.escape(
        () => new Vec3(-20.5, 64, 0.5),
        () => true,
      ),
      true,
    );
    await flush();
    const task = f.travel.stop();
    release();
    await task;
    assert.equal(f.calls.includes("throw"), false);
    assert.equal(f.bot.launcherPearling, false);
  } finally {
    f.close();
  }
});

test("pearl solver rejects water, unloaded terrain, obstructed arcs and entity collisions", () => {
  const f = worldFixture(),
    settings = normalizeCombat({ pearlEnabled: true });
  try {
    const destination = new Vec3(60.5, 64, 0.5);
    const shot = planPearl(f.bot, destination, settings);
    assert.ok(shot);
    const blockAt = f.bot.blockAt;
    f.bot.blockAt = (p) => (p.x > 10 ? null : blockAt(p));
    assert.equal(planPearl(f.bot, destination, settings), null);
    f.bot.blockAt = blockAt;
    for (let x = 10; x <= 65; x++)
      for (let z = -4; z <= 4; z++) f.world.setBlock(new Vec3(x, 63, z), "water");
    assert.equal(planPearl(f.bot, destination, settings), null);
    for (let x = 10; x <= 65; x++)
      for (let z = -4; z <= 4; z++) f.world.setBlock(new Vec3(x, 63, z), "stone");
    for (let y = 64; y <= 130; y++)
      for (let z = -5; z <= 5; z++) f.world.setBlock(new Vec3(3, y, z), "stone");
    assert.equal(planPearl(f.bot, destination, settings), null);
    for (let y = 64; y <= 130; y++)
      for (let z = -5; z <= 5; z++) f.world.clearBlock(new Vec3(3, y, z));
    f.bot.entities[99] = { id: 99, position: new Vec3(2, 63, 0.5), width: 2, height: 5 };
    assert.equal(simulatePearl(f.bot, shot.yaw, shot.pitch), null);
  } finally {
    f.dispose();
  }
});

function travelFixture(patch = {}, version = "26.1.2") {
  const f = worldFixture(version),
    calls = [],
    items = [{ name: "ender_pearl", count: 4 }];
  let time = 0;
  const bot = f.bot;
  bot.inventory.items = () => items;
  bot.pathfinder = {
    stop: async () => calls.push("stop"),
    goto: () => {
      calls.push("walk");
      return new Promise(() => {});
    },
  };
  bot.equip = async (item) => {
    bot.inventory.slots[36] = item;
    calls.push("equip");
  };
  bot.activateItem = () => calls.push("throw");
  bot.deactivateItem = () => {};
  bot._client.state = "login";
  const destination = new Vec3(110.5, 64, 0.5);
  const settings = normalizeCombat({ pearlEnabled: true, ...patch });
  const travel = createTravelController(bot, settings, {
    now: () => time,
    onError: (error) => {
      throw error;
    },
  });
  return {
    ...f,
    calls,
    items,
    destination,
    settings,
    now: () => time,
    travel,
    tick: async (value) => {
      time = value;
      bot.emit("physicsTick");
      await flush();
      await flush();
    },
    start: async () => {
      travel.start({}, () => destination, "follow", "follow Owner", 3);
      await flush();
    },
    close: () => {
      travel.dispose();
      f.dispose();
    },
  };
}

for (const patch of [
  { pearlEnabled: false },
  { pearlFollow: false },
  { pearlReserve: 4 },
  { pearlMinHealth: 20 },
]) {
  test(`travel falls back to walking when ${JSON.stringify(patch)}`, async () => {
    const f = travelFixture(patch);
    f.bot.health = 19;
    try {
      await f.start();
      await f.tick(0);
      assert.equal(f.calls.includes("walk"), true);
      assert.equal(f.calls.includes("throw"), false);
    } finally {
      f.close();
    }
  });
}

for (const pearlChain of [false, true]) {
  test(`travel waits for teleport, observes cooldown and pearlChain=${pearlChain}`, async () => {
    const f = travelFixture({ pearlChain });
    try {
      await f.start();
      const first = planPearl(f.bot, f.destination, f.settings);
      await f.tick(0);
      await f.tick(1600);
      assert.equal(f.calls.filter((c) => c === "throw").length, 1, "one pearl in flight");
      f.bot.entity.position = first.landing;
      await f.tick(1650);
      await f.tick(1700);
      assert.equal(f.calls.filter((c) => c === "throw").length, pearlChain ? 2 : 1);
    } finally {
      f.close();
    }
  });
}

test("look-only server corrections and ordinary movement cannot confirm pearl arrival", async () => {
  const f = travelFixture();
  try {
    await f.start(); await f.tick(0);
    assert.equal(f.travel.waiting, true);
    f.bot.emit("forcedMove");
    assert.equal(f.travel.waiting, true);
    f.bot.entity.position.x += .2; f.bot.emit("forcedMove");
    assert.equal(f.travel.waiting, true);
    f.bot.entity.position.x += 4; await f.tick(50);
    f.bot.emit("forcedMove");
    assert.equal(f.travel.waiting, true, "a later look-only packet cannot turn earlier walking into a teleport");
    const listeners = f.bot.listenerCount("forcedMove");
    f.travel.dispose();
    assert.equal(f.bot.listenerCount("forcedMove"), listeners - 1);
  } finally { f.close(); }
});

test("a missing teleport resumes walking; stop/death/dispose cancel an in-progress equip", async () => {
  const f = travelFixture();
  try {
    await f.start();
    await f.tick(0);
    await f.tick(10000);
    assert.equal(f.travel.waiting, false);
    assert.equal(f.calls.filter((c) => c === "walk").length, 2);
  } finally {
    f.close();
  }
  for (const cancel of ["stop", "death", "dispose"]) {
    const g = travelFixture();
    let finish;
    g.bot.equip = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    try {
      await g.start();
      await g.tick(0);
      assert.ok(finish);
      if (cancel === "death") g.bot.emit("death");
      else g.travel[cancel]();
      finish();
      await flush();
      await flush();
      assert.equal(g.calls.includes("throw"), false);
    } finally {
      g.close();
    }
  }
});

function chaseFixture(patch = {}, version = "26.1.2") {
  const f = travelFixture({ pearlChase: true, ...patch }, version);
  const enemy = {
    id: 99,
    username: "Enemy",
    uuid: "00000000-0000-0000-0000-000000000099",
    type: "player",
    height: 1.8,
    width: 0.6,
    eyeHeight: 1.62,
    position: new Vec3(6.5, 64, 0.5),
    isValid: true,
  };
  f.bot.username = "Bot";
  f.bot.supportFeature = f.bot.registry.supportFeature;
  f.bot.entities[enemy.id] = enemy;
  f.bot.swordpvp = {
    target: null,
    attack: async (entity) => {
      f.bot.swordpvp.target = entity;
      f.calls.push(["attack", entity]);
    },
    stop: () => {
      f.bot.swordpvp.target = null;
    },
  };
  const combat = createCombatController(
    f.bot,
    {
      ...f.settings,
      style: "melee",
      reactionMs: 0,
      ...patch,
    },
    {
      loadPlugins: false,
      now: f.now,
      onError: (error) => {
        throw error;
      },
    },
  );
  f.bot.launcherTravel = f.travel;
  f.bot.launcherCombat = combat;
  const close = f.close;
  f.close = () => {
    combat.dispose();
    close();
  };
  function spawn(ownerId = enemy.id, velocity = new Vec3(1.45, 0.35, 0)) {
    const origin = pearlOrigin(enemy, f.bot.registry);
    const modern = f.bot.registry.version[">="]("1.21.9");
    const fixed = version === "1.8.8" ? 32 : 1;
    const packet = {
      entityId: 101,
      type: f.bot.registry.entitiesArray.find((e) => /pearl/i.test(e.name)).internalId,
      objectUUID: "00000000-0000-0000-0000-000000000101",
      x: fixed === 32 ? Math.floor(origin.x * fixed) : origin.x,
      y: fixed === 32 ? Math.floor(origin.y * fixed) : origin.y,
      z: fixed === 32 ? Math.floor(origin.z * fixed) : origin.z,
      pitch: 0,
      yaw: 0,
      headPitch: 0,
      objectData: version === "1.8.8" ? 0 : ownerId,
      velocity: velocity.scaled(modern ? 1 : 8000),
    };
    const serializer = protocol.createSerializer({ state: "play", isServer: true, version });
    const parser = protocol.createDeserializer({ state: "play", isServer: false, version });
    const decoded = parser.parsePacketBuffer(
      serializer.createPacketBuffer({ name: "spawn_entity", params: packet }),
    ).data.params;
    f.bot._client.emit("spawn_entity", decoded);
    if (version === "1.8.8")
      f.bot._client.emit("entity_velocity", { entityId: 101, velocity: velocity.scaled(8000) });
    return simulatePearlFlight(f.bot, origin, velocity, undefined, enemy.id)?.landing;
  }
  const teleport = (position) => {
    enemy.position = position.clone();
    f.bot.emit("entityMoved", enemy);
  };
  return { ...f, enemy, combat, spawn, teleport };
}

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(`real custom PvP strikes promptly after a server-corrected pearl teleport on ${version}`, async () => {
    const f = worldFixture(version), bot = f.bot;
    const errors = [], packets = [];
    let time = 0;
    bot.username = "Bot";
    bot.supportFeature = bot.registry.supportFeature;
    bot.loadPlugin(runtime("mineflayer/lib/plugins/entities"));
    bot.loadPlugin(runtime("mineflayer/lib/plugins/time"));
    bot.loadPlugin(runtime("mineflayer/lib/plugins/inventory"), { hideErrors: false });
    bot.loadPlugin(runtime("mineflayer/lib/plugins/simple_inventory"));
    bot.setQuickBarSlot(0);
    const Item = mineflayerRequire("prismarine-item")(bot.registry);
    for (const [slot, name] of [[36, "diamond_sword"], [37, "ender_pearl"]]) {
      const item = new Item(bot.registry.itemsByName[name].id, 4);
      item.slot = slot; bot.inventory.slots[slot] = item;
    }
    const enemy = { id: 99, name: "player", username: "Enemy", type: "player", isValid: true,
      position: new Vec3(30.5, 64, .5), velocity: new Vec3(0, 0, 0), width: .6, height: 1.8,
      metadata: [], equipment: [], yaw: 0, pitch: 0 };
    bot.entities[enemy.id] = enemy;
    const outgoing = protocol.createSerializer({ state: "play", isServer: false, version });
    bot._client.state = "play";
    bot._client.write = (name, params) => {
      outgoing.createPacketBuffer({ name, params });
      packets.push({ name, params, at: time });
    };
    runtime("./worker.cjs").configurePathfinder(bot, { canDig: false, allowSprinting: true });
    const settings = normalizeCombat({ style: "melee", pearlChase: true, smoothAim: false, criticals: "off", shield: false, shieldBreak: false });
    const combat = createCombatController(bot, settings, { now: () => time, onError: (error) => errors.push(error) });
    const travel = createTravelController(bot, settings, { now: () => time, onError: (error) => errors.push(error) });
    bot.launcherCombat = combat; bot.launcherTravel = travel;
    try {
      combat.select(enemy);
      bot.emit("physicsTick"); await flush(); await flush();
      assert.equal(travel.waiting, true);
      // Exercise Mineflayer's position handler, including teleport_confirm and
      // onGround=false, instead of directly faking a successful landing.
      const actual = new Vec3(30.5, 64, 5.5);
      enemy.position = actual.offset(2, 0, 0);
      const incoming = protocol.createSerializer({ state: "play", isServer: true, version });
      const parser = protocol.createDeserializer({ state: "play", isServer: false, version });
      const decoded = parser.parsePacketBuffer(incoming.createPacketBuffer({ name: "position", params: {
        x: actual.x, y: actual.y, z: actual.z, dx: 0, dy: 0, dz: 0,
        yaw: -90, pitch: 0, flags: version === "26.1.2" ? {} : 0, teleportId: 1,
      } })).data;
      time = 100;
      bot._client.emit(decoded.name, decoded.params);
      await flush(); await flush();
      assert.equal(travel.waiting, false);
      assert.equal(bot.swordpvp.target, enemy);
      for (let tick = 0; tick < 3; tick++) {
        time += 50; bot.emit("physicsTick"); await flush();
      }
      const hit = packets.find((packet) => packet.name === "attack" || (packet.name === "use_entity" && packet.params.mouse === 1));
      assert.ok(hit, `attack within 150ms of server teleport; errors=${errors.map((error) => error.message)}`);
      assert.ok(hit.at - 100 <= 150);
      assert.deepEqual(errors, []);
    } finally { combat.dispose(); travel.dispose(); await bot.pathfinder.destroy(); f.dispose(); }
  });

  test(`server teleport outside the predicted pearl landing resumes melee immediately on ${version}`, async () => {
    const f = chaseFixture({}, version);
    try {
      f.enemy.position.x = 30.5;
      f.combat.select(f.enemy);
      await f.tick(0);
      assert.equal(f.travel.waiting, true);
      // A server/plugin may correct the collision point. Do not wait for the
      // predicted flight deadline while already standing next to the enemy.
      const actual = f.enemy.position.offset(0, 0, 5);
      f.enemy.position = actual.offset(2, 0, 0);
      f.bot.entity.position = actual;
      f.bot.emit("forcedMove");
      await flush();
      await flush();
      assert.equal(f.travel.waiting, false, "server confirmation releases the flight lock without a physics tick");
      assert.equal(f.bot.launcherPearling, false);
      assert.equal(f.bot.swordpvp.target, f.enemy, "same target resumes without another reaction delay");
      assert.equal(f.calls.filter((call) => call === "throw").length, 1);
    } finally {
      f.close();
    }
  });

  test(`distant enemy without a pearl triggers proactive pursuit and resumes melee on ${version}`, async () => {
    const f = chaseFixture({ pearlEnabled: false }, version);
    try {
      f.enemy.position.x = 30.5;
      const shot = planPearl(f.bot, f.enemy.position, f.settings, 2.5, true);
      assert.ok(shot);
      f.combat.select(f.enemy);
      await f.tick(0);
      assert.equal(f.calls.filter((c) => c === "throw").length, 1);
      assert.equal(f.travel.chasing, true);
      await f.tick(100);
      assert.equal(f.calls.filter((c) => c === "throw").length, 1, "only one active throw");
      f.bot.entity.position = shot.landing.clone();
      await f.tick(150);
      await f.tick(200);
      assert.equal(f.travel.chasing, false);
      assert.equal(f.bot.swordpvp.target, f.enemy);
      assert.equal(f.calls.filter((c) => c === "throw").length, 1);
    } finally {
      f.close();
    }
  });

  test(`enemy pearl is chased to its landing and melee resumes on ${version}`, async () => {
    const f = chaseFixture({}, version);
    try {
      f.combat.select(f.enemy);
      await f.tick(0);
      assert.equal(f.bot.swordpvp.target, f.enemy);
      const landing = f.spawn();
      assert.ok(landing.distanceTo(f.bot.entity.position) > f.settings.targetRange);
      const ownShot = planPearl(f.bot, landing, f.settings, 2.5, true);
      assert.ok(ownShot);
      await f.tick(50);
      assert.equal(f.calls.includes("throw"), false, "wait for the enemy's actual teleport");
      assert.equal(f.bot.swordpvp.target, f.enemy);
      f.teleport(landing);
      await f.tick(100);
      assert.equal(f.bot.swordpvp.target, null);
      assert.equal(f.travel.chasing, true);
      assert.match(f.combat.status, /Enemy/);
      assert.equal(f.calls.filter((call) => call === "throw").length, 1);
      f.bot.entity.position = ownShot.landing.clone();
      await f.tick(150);
      assert.equal(f.travel.chasing, false);
      assert.equal(f.bot.swordpvp.target, f.enemy);
      assert.equal(f.calls.filter((call) => call[0] === "attack").length, 2);
    } finally {
      f.close();
    }
  });
}

test("proactive pearls keep walking when disabled, too close, unsafe or reserved", async () => {
  for (const patch of [
    { pearlChase: false },
    { pearlMinDistance: 24 },
    { pearlReserve: 4 },
    { pearlMinHealth: 20 },
    { pearlMaxDistance: 12 },
  ]) {
    const f = chaseFixture(patch);
    try {
      f.bot.health = 19;
      f.enemy.position.x = 20.5;
      f.combat.select(f.enemy);
      await f.tick(0);
      await f.tick(1000);
      assert.equal(f.calls.includes("throw"), false, JSON.stringify(patch));
      assert.equal(f.bot.swordpvp.target, f.enemy);
    } finally {
      f.close();
    }
  }
  const f = chaseFixture();
  try {
    f.enemy.position.x = 20.5;
    for (let x = 16; x < 25; x++)
      for (let z = -4; z <= 4; z++) f.world.setBlock(new Vec3(x, 63, z), "lava");
    f.combat.select(f.enemy);
    await f.tick(0);
    assert.equal(f.calls.includes("throw"), false, "no safe landing near the enemy");
    assert.equal(f.bot.swordpvp.target, f.enemy);
  } finally {
    f.close();
  }
});

test("proactive pearl aim is revalidated and a new target cancels the old throw", async () => {
  for (const cancel of ["move", "stop"]) {
    const f = chaseFixture();
    let release;
    const look = f.bot.look.bind(f.bot);
    f.bot.look = async (...args) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      await look(...args);
    };
    try {
      f.enemy.position.x = 20.5;
      f.combat.select(f.enemy);
      await f.tick(0);
      assert.ok(release);
      if (cancel === "move") f.enemy.position.z += 8;
      else f.combat.stop();
      release();
      await flush();
      await flush();
      assert.equal(f.calls.includes("throw"), false);
      assert.equal(f.travel.chasing, false);
    } finally {
      f.close();
    }
  }
});

for (const patch of [{ pearlChase: false }, { pearlReserve: 4 }, { pearlMinHealth: 20 }]) {
  test(`combat does not throw when ${JSON.stringify(patch)}`, async () => {
    const f = chaseFixture(patch);
    f.bot.health = 19;
    try {
      f.combat.select(f.enemy);
      await f.tick(0);
      f.spawn();
      f.teleport(new Vec3(20.5, 64, 0.5));
      await f.tick(50);
      assert.equal(f.calls.includes("throw"), false);
      assert.equal(f.bot.swordpvp.target, f.enemy);
    } finally {
      f.close();
    }
  });
}

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(`held pearl and confirmed teleport trigger melee pursuit through real packets on ${version}`, async () => {
    const f = chaseFixture({ pearlEnabled: false, pearlFollow: false }, version);
    try {
      f.bot.loadPlugin(runtime("mineflayer/lib/plugins/entities"));
      const Entity = mineflayerRequire("prismarine-entity")(f.bot.registry);
      const Item = mineflayerRequire("prismarine-item")(f.bot.registry);
      const enemy = Object.assign(new Entity(f.enemy.id), f.enemy);
      enemy.position = new Vec3(2.5, 64, 0.5);
      f.bot.entities[enemy.id] = enemy;
      const serializer = protocol.createSerializer({ state: "play", isServer: true, version });
      const parser = protocol.createDeserializer({ state: "play", isServer: false, version });
      const receive = (name, params) => {
        const decoded = parser.parsePacketBuffer(
          serializer.createPacketBuffer({ name, params }),
        ).data;
        f.bot._client.emit(decoded.name, decoded.params);
      };
      const modern = f.bot.registry.version[">="]("1.9");
      const hand = modern ? 1 : 0;
      const equip = (item) =>
        receive(
          "entity_equipment",
          modern
            ? { entityId: enemy.id, equipments: [{ slot: hand, item: Item.toNotch(item) }] }
            : { entityId: enemy.id, slot: hand, item: Item.toNotch(item) },
        );
      f.combat.select(enemy);
      await f.tick(0);
      equip(new Item(f.bot.registry.itemsByName.ender_pearl.id, 1));
      await f.tick(50);
      assert.equal(f.calls.includes("throw"), false, "holding a pearl never throws on its own");
      // Some servers hide the projectile; equipment and the actual teleport remain visible.
      equip(null);
      enemy.position.x += 0.5;
      f.bot.emit("entityMoved", enemy);
      await f.tick(100);
      assert.equal(
        f.calls.includes("throw"),
        false,
        "switching items and walking do not trigger pursuit",
      );
      const landing = new Vec3(30.5, 64, 0.5);
      const fixed = f.bot.supportFeature("fixedPointPosition") ? 32 : 1;
      const name = f.bot.registry.version[">="]("1.21.3")
        ? "sync_entity_position"
        : "entity_teleport";
      receive(name, {
        entityId: enemy.id,
        x: landing.x * fixed,
        y: landing.y * fixed,
        z: landing.z * fixed,
        dx: 0,
        dy: 0,
        dz: 0,
        yaw: 0,
        pitch: 0,
        onGround: true,
      });
      const shot = planPearl(f.bot, landing, f.settings, 2.5, true);
      assert.ok(shot);
      await f.tick(150);
      assert.equal(f.calls.filter((call) => call === "throw").length, 1);
      assert.equal(f.travel.chasing, true, "melee pursuit does not require travel pearl toggles");
      f.bot.entity.position = shot.landing.clone();
      await f.tick(200);
      assert.equal(f.bot.swordpvp.target, enemy);
    } finally {
      f.close();
    }
  });
}

test("a pearl aim interrupted by water movement is retried after the enemy teleport", async () => {
  const f = chaseFixture();
  try {
    f.combat.select(f.enemy);
    await f.tick(0);
    const landing = f.spawn();
    const look = f.bot.look;
    f.bot.look = async (...args) => {
      await look(...args);
      f.bot.entity.position.z += 8;
    };
    f.teleport(landing);
    await f.tick(50);
    assert.equal(f.calls.includes("throw"), false);
    assert.equal(f.travel.chasing, false, "a cancelled aim releases the chase task");
    f.bot.look = look;
    await f.tick(400);
    assert.equal(f.calls.filter((call) => call === "throw").length, 1);
    assert.equal(f.travel.chasing, true);
  } finally {
    f.close();
  }
});

test("combat can pursue with pearls carried only in the offhand", async () => {
  const f = chaseFixture();
  try {
    f.bot.inventory.slots[45] = f.items.pop();
    f.combat.select(f.enemy);
    await f.tick(0);
    f.teleport(f.spawn());
    await f.tick(50);
    assert.equal(f.calls.includes("throw"), true);
  } finally {
    f.close();
  }
});

test("combat ignores other players' pearls and refuses an unreachable landing", async () => {
  const f = chaseFixture({ pearlMaxDistance: 12 });
  try {
    f.combat.select(f.enemy);
    await f.tick(0);
    f.spawn(123);
    await f.tick(50);
    assert.equal(f.calls.includes("throw"), false);
    const landing = f.spawn();
    f.teleport(landing);
    await f.tick(300);
    assert.equal(f.calls.includes("throw"), false, "never substitute a partial travel throw");
    await f.tick(10000);
    assert.equal(f.bot.swordpvp.target, null, "unreachable pursuit eventually expires");
  } finally {
    f.close();
  }
});

test("separate enemy pearls obey the shared cooldown even when travel chaining is disabled", async () => {
  const f = chaseFixture({ pearlChain: false });
  try {
    f.combat.select(f.enemy);
    await f.tick(0);
    const landing = f.spawn();
    const shot = planPearl(f.bot, landing, f.settings, 2.5, true);
    f.teleport(landing);
    await f.tick(50);
    f.bot.entity.position = shot.landing.offset(0, 0, 2);
    await f.tick(100);
    const secondLanding = f.spawn(f.enemy.id, new Vec3(-1.45, 0.35, 0));
    f.teleport(secondLanding);
    await f.tick(200);
    assert.equal(f.calls.filter((call) => call === "throw").length, 1);
    await f.tick(1600);
    assert.equal(f.calls.filter((call) => call === "throw").length, 2);
    await f.tick(10000);
    assert.equal(f.travel.chasing, false, "flight timeout releases combat");
    await f.tick(12000);
    assert.equal(
      f.bot.swordpvp.target,
      f.enemy,
      "a failed teleport resumes pursuit of a loaded enemy within pearl range",
    );
  } finally {
    f.close();
  }
});

test("a missing pearl keeps melee active and walking is not mistaken for teleportation", async () => {
  const f = chaseFixture();
  try {
    f.items.length = 0;
    f.combat.select(f.enemy);
    await f.tick(0);
    f.spawn();
    for (let tick = 1; tick <= 12; tick++) {
      f.enemy.position.x += 0.5;
      f.bot.emit("entityMoved", f.enemy);
      await f.tick(tick * 50);
    }
    assert.equal(f.calls.includes("throw"), false);
    assert.equal(f.bot.swordpvp.target, f.enemy);
  } finally {
    f.close();
  }
});

test("legacy ownerless pearls with two possible throwers are ignored", async () => {
  const f = chaseFixture({}, "1.8.8");
  try {
    f.bot.entities[98] = {
      ...f.enemy,
      id: 98,
      username: "Other",
      position: f.enemy.position.offset(0.2, 0, 0),
    };
    f.combat.select(f.enemy);
    await f.tick(0);
    f.spawn();
    f.teleport(new Vec3(20.5, 64, 0.5));
    await f.tick(50);
    assert.equal(f.calls.includes("throw"), false);
    assert.equal(f.bot.swordpvp.target, f.enemy);
  } finally {
    f.close();
  }
});

test("an unknown flight can be chased after the actual enemy teleport confirms loaded terrain", async () => {
  const f = chaseFixture();
  try {
    f.combat.select(f.enemy);
    await f.tick(0);
    const blockAt = f.bot.blockAt;
    f.bot.blockAt = (point) => (point.x > 15 ? null : blockAt(point));
    assert.equal(f.spawn(), undefined);
    await f.tick(50);
    assert.equal(f.calls.includes("throw"), false);
    f.bot.blockAt = blockAt;
    f.enemy.position = new Vec3(30.5, 64, 0.5);
    f.bot.emit("entityMoved", f.enemy);
    await f.tick(100);
    assert.equal(f.calls.includes("throw"), true);
    assert.equal(f.travel.chasing, true);
  } finally {
    f.close();
  }
});

test("pearl chase interrupts a bow draw before equipping its projectile", async () => {
  const f = chaseFixture({ style: "ranged" });
  try {
    f.items.push({ name: "bow" }, { name: "arrow" });
    f.bot.bowpvp = { shotToEntity: () => ({ hit: true, yaw: 0.5, pitch: 0.2 }) };
    const activate = f.bot.activateItem;
    f.bot.activateItem = () => {
      f.bot.usingHeldItem = true;
      activate();
    };
    f.bot.deactivateItem = () => {
      f.bot.usingHeldItem = false;
    };
    f.combat.select(f.enemy, "ranged");
    await f.tick(0);
    await f.tick(50);
    assert.equal(f.bot.usingHeldItem, true);
    f.calls.length = 0;
    const landing = f.spawn();
    f.teleport(landing);
    await f.tick(100);
    assert.equal(f.calls.filter((call) => call === "throw").length, 1);
    assert.equal(f.travel.chasing, true);
    assert.equal(f.bot.usingHeldItem, false);
  } finally {
    f.close();
  }
});

test("combat preserves a teleporting target across despawn and cancels chase on stop/death/dispose", async () => {
  const f = chaseFixture();
  try {
    f.combat.select(f.enemy);
    await f.tick(0);
    const landing = f.spawn();
    const ownShot = planPearl(f.bot, landing, f.settings, 2.5, true);
    await f.tick(50);
    f.bot.emit("entityGone", f.enemy);
    f.enemy.isValid = false;
    delete f.bot.entities[f.enemy.id];
    await f.tick(100);
    assert.match(f.combat.status, /Enemy/);
    const replacement = { ...f.enemy, id: 102, position: landing, isValid: true };
    f.bot.entities[replacement.id] = replacement;
    await f.tick(150);
    assert.equal(f.travel.chasing, true);
    f.bot.entity.position = ownShot.landing.clone();
    await f.tick(200);
    assert.equal(f.bot.swordpvp.target, replacement);
  } finally {
    f.close();
  }
  for (const cancel of ["stop", "death", "dispose", "targetDeath", "newTarget"]) {
    const g = chaseFixture();
    let finish;
    try {
      g.combat.select(g.enemy);
      await g.tick(0);
      g.bot.equip = () =>
        new Promise((resolve) => {
          finish = resolve;
        });
      g.teleport(g.spawn());
      await g.tick(50);
      assert.ok(finish);
      if (cancel === "death") g.bot.emit("death");
      else if (cancel === "targetDeath") g.bot.emit("entityDead", g.enemy);
      else if (cancel === "newTarget")
        g.combat.select({
          ...g.enemy,
          id: 103,
          username: "Other",
          position: new Vec3(8.5, 64, 0.5),
        });
      else g.combat[cancel]();
      finish();
      await flush();
      await flush();
      assert.equal(g.calls.includes("throw"), false);
      assert.equal(g.travel.chasing, false);
    } finally {
      g.close();
    }
  }
});

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(`water launch uses liquid drag and the correct tick order on ${version}`, () => {
    const f = worldFixture(version);
    try {
      const origin = new Vec3(0.5, 65.5, 0.5),
        velocity = new Vec3(1.5, 0.6, 0);
      const steps = [];
      f.bot.world.raycast = (position, direction, length) => {
        steps.push(direction.scaled(length));
        return steps.length === 1 ? null : { face: 1, intersect: position.plus(steps[1]) };
      };
      const water = { name: "water", boundingBox: "empty" };
      const shot = simulatePearlFlight(f.bot, origin, velocity, () => water, 1);
      assert.ok(shot);
      const expected =
        version === "26.1.2" ? new Vec3(1.5, 0.57, 0).scaled(Math.fround(0.8)) : velocity;
      assert.ok(steps[0].distanceTo(expected) < 1e-8);
      const second =
        version === "26.1.2"
          ? expected.offset(0, -0.03, 0).scaled(Math.fround(0.8))
          : velocity.scaled(Math.fround(0.8)).offset(0, -0.03, 0);
      assert.ok(steps[1].distanceTo(second) < 1e-8, "water drag also applies on legacy versions");
    } finally {
      f.dispose();
    }
  });
}

test("swimming pearls leave water for a safe shore; water landings remain forbidden", async () => {
  const f = travelFixture({ pearlMinDistance: 4 });
  try {
    f.bot.entity.metadata[6] = 3;
    f.bot.entity.isInWater = true;
    f.bot.entity.onGround = false;
    f.bot.entity.velocity = new Vec3(0.08, -0.02, 0);
    assert.equal(pearlOrigin(f.bot.entity, f.bot.registry).y, 64.3);
    for (let x = -1; x <= 1; x++)
      for (let z = -2; z <= 2; z++) f.world.setBlock(new Vec3(x, 64, z), "water");
    const destination = new Vec3(30.5, 64, 0.5);
    const shot = planPearl(f.bot, destination, f.settings, 2.5, true);
    assert.ok(shot);
    assert.ok(shot.landing.distanceTo(destination) < 2.5);
    await f.start();
    await f.tick(0);
    assert.equal(f.calls.includes("throw"), true);
  } finally {
    f.close();
  }
});

test("legacy health metadata is not interpreted as a swimming pose", () => {
  const f = worldFixture("1.8.8");
  try {
    f.bot.entity.metadata[6] = 3;
    assert.equal(pearlOrigin(f.bot.entity, f.bot.registry).y, 65.52);
  } finally {
    f.dispose();
  }
});

test("a current in water during aiming invalidates the old throw", async () => {
  const f = travelFixture();
  try {
    f.bot.look = async () => {
      f.bot.entity.velocity = new Vec3(0, -1.5, 0);
    };
    await f.start();
    await f.tick(0);
    assert.equal(f.calls.includes("throw"), false);
    assert.equal(f.travel.waiting, false);
    assert.equal(f.calls.filter((call) => call === "walk").length, 2);
  } finally {
    f.close();
  }
});

test("explosion estimate accounts for range and cover and refuses unknown terrain", () => {
  const f = worldFixture();
  try {
    const source = new Vec3(3.5, 64, 0.5);
    assert.ok(explosionDamage(f.bot, f.bot.entity, source) > 20);
    assert.equal(explosionDamage(f.bot, f.bot.entity, new Vec3(20, 64, 0)), 0);
    for (let y = 64; y <= 67; y++)
      for (let z = -2; z <= 2; z++) f.world.setBlock(new Vec3(1, y, z), "obsidian");
    assert.ok(explosionDamage(f.bot, f.bot.entity, source) <= 1);
    f.bot.blockAt = () => null;
    assert.equal(explosionDamage(f.bot, f.bot.entity, source), Infinity);
  } finally {
    f.dispose();
  }
});

test("crystal planner respects self/owner safety, occupied bases and server confirmation", () => {
  const f = worldFixture(),
    bot = f.bot;
  const target = {
    id: 2,
    username: "Enemy",
    position: new Vec3(5.5, 64, 0.5),
    width: 0.6,
    height: 1.8,
  };
  bot.entities[2] = target;
  bot.inventory.items = () => [{ name: "end_crystal" }];
  f.world.setBlock(new Vec3(3, 64, 0), "obsidian");
  const base = bot.blockAt(new Vec3(3, 64, 0));
  try {
    const safe = createCrystalPlanner(bot, normalizeCombat({ crystalEnabled: true }));
    assert.equal(safe.placement(target, base, 0), null, "unsafe self damage");
    // Isolate action validation from damage: still use real blocks/raycast/entities.
    const planner = createCrystalPlanner(bot, normalizeCombat({ crystalEnabled: true }));
    let choice = planner.placement(target, base, 0, false);
    assert.ok(choice, "reachable base");
    planner.commit(choice, 0);
    assert.equal(
      planner.placement(target, base, 500, false),
      null,
      "no duplicate before confirmation",
    );
    assert.ok(
      planner.placement(target, base, 1600, false),
      "bounded retry if server rejected placement",
    );
    bot.entities[3] = { id: 3, position: new Vec3(3.5, 65, 0.5), width: 0.6, height: 1.8 };
    assert.equal(planner.placement(target, base, 1700, false), null, "occupied base");
    delete bot.entities[3];
    f.world.setBlock(new Vec3(3, 66, 0), "stone");
    assert.equal(planner.placement(target, base, 1700, false), null, "two blocks of clearance");
    f.world.clearBlock(new Vec3(3, 66, 0));
    // Cover the bot for a safe explosion; owners near the target still prevent it.
    for (let y = 64; y <= 67; y++)
      for (let z = -2; z <= 2; z++) f.world.setBlock(new Vec3(1, y, z), "obsidian");
    assert.ok(safe.evaluate(target, new Vec3(3.5, 65, 0.5)));
    bot.entities[4] = { ...target, id: 4, username: "Owner" };
    const protectedPlanner = createCrystalPlanner(
      bot,
      normalizeCombat({ crystalEnabled: true }),
      (n) => n === "Owner",
    );
    assert.equal(protectedPlanner.evaluate(target, new Vec3(3.5, 65, 0.5)), null);
  } finally {
    f.dispose();
  }
});

for (const obstruction of ["view changed", "wall appeared"]) {
  test(`crystal click is cancelled when ${obstruction} during aiming`, async () => {
    const f = worldFixture(),
      bot = f.bot,
      packets = [],
      errors = [];
    bot.supportFeature = bot.registry.supportFeature;
    for (const plugin of ["entities", "inventory", "simple_inventory", "generic_place"])
      bot.loadPlugin(runtime(`mineflayer/lib/plugins/${plugin}`), { hideErrors: false });
    bot.setQuickBarSlot(0);
    const Item = mineflayerRequire("prismarine-item")(bot.registry);
    const item = new Item(bot.registry.itemsByName.end_crystal.id, 4);
    item.slot = 36;
    bot.inventory.slots[36] = item;
    bot._client.write = (name, params) => packets.push({ name, params });
    bot.pathfinder = { stop: async () => {}, goto: () => new Promise(() => {}) };
    bot.swordpvp = { stop() {} };
    bot.pvp = { forceStop() {} };
    const target = {
      id: 2,
      username: "Enemy",
      position: new Vec3(5.5, 65, 0.5),
      width: 0.6,
      height: 1.8,
    };
    bot.entities[2] = target;
    f.world.setBlock(new Vec3(3, 64, 0), "obsidian");
    const look = bot.lookAt.bind(bot);
    let turns = 0;
    bot.lookAt = async (point, force) => {
      turns++;
      await look(point, force);
      if (obstruction === "view changed") await bot.look(0, 0, true);
      else
        for (let y = 64; y <= 67; y++)
          for (let z = -2; z <= 2; z++) f.world.setBlock(new Vec3(1, y, z), "stone");
    };
    const controller = createCombatController(
      bot,
      {
        style: "crystal",
        reactionMs: 0,
        crystalEnabled: true,
        crystalPredict: false,
        crystalMaxSelfDamage: 20,
        crystalMinHealth: 1,
        smoothAim: false,
      },
      { loadPlugins: false, now: () => 0, onError: (error) => errors.push(error) },
    );
    try {
      controller.select(target);
      bot.emit("physicsTick");
      await controller.idleTask;
      bot.emit("physicsTick");
      await controller.idleTask;
      assert.deepEqual(errors, []);
      assert.ok(turns > 0, "attempted aiming before the obstruction cancelled placement");
      assert.equal(
        packets.some((p) => p.name === "block_place"),
        false,
      );
    } finally {
      controller.dispose();
      f.dispose();
    }
  });
}

test("bow defense detects aiming/incoming arrows, releases its shield and cancels delayed equip", async () => {
  const bot = new EventEmitter(),
    calls = [];
  const enemy = {
    id: 2,
    username: "Enemy",
    position: new Vec3(10, 64, 0),
    height: 1.8,
    heldItem: { name: "bow" },
  };
  let time = 0,
    incoming = false;
  Object.assign(bot, {
    health: 20,
    entity: { yaw: 0, pitch: 0, equipment: [], position: new Vec3(0, 64, 0) },
    inventory: { items: () => [{ name: "shield" }] },
    supportFeature: () => false,
    projectiles: {
      get isAimedAt() {
        return incoming ? { entity: enemy } : null;
      },
      projectileAtMe: null,
    },
    equip: async () => calls.push("equip"),
    lookAt: async () => calls.push("look"),
    activateItem: () => calls.push("shield"),
    deactivateItem: () => calls.push("release"),
  });
  const defense = createBowDefense(bot, normalizeCombat({ bowDefense: true }), { now: () => time });
  assert.equal(defense.tick(true), false);
  incoming = true;
  time = 200;
  assert.equal(defense.tick(true), true);
  await defense.task;
  assert.equal(calls.at(-1), "shield");
  incoming = false;
  time = 600;
  assert.equal(defense.tick(true), false);
  assert.equal(calls.at(-1), "release");
  bot.projectiles.projectileAtMe = { entity: { ...enemy, name: "arrow", heldItem: null } };
  time = 800;
  defense.tick(true);
  await defense.task;
  assert.equal(calls.at(-1), "shield");
  defense.stop();
  let finish;
  bot.equip = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  time = 1000;
  const before = calls.filter((c) => c === "shield").length;
  defense.tick(true);
  await flush();
  defense.stop();
  finish();
  await defense.task;
  assert.equal(calls.filter((c) => c === "shield").length, before);
  const off = createBowDefense(bot, normalizeCombat({ bowDefense: false }));
  assert.equal(off.tick(true), false);
});

for (const version of ["1.20.4", "26.1.2"]) {
  test(`crystal controller places/breaks through real Mineflayer APIs on ${version}`, async () => {
    const f = worldFixture(version),
      bot = f.bot,
      packets = [];
    bot.supportFeature = bot.registry.supportFeature;
    bot.loadPlugin(runtime("mineflayer/lib/plugins/entities"));
    bot.loadPlugin(runtime("mineflayer/lib/plugins/inventory"), { hideErrors: false });
    bot.loadPlugin(runtime("mineflayer/lib/plugins/simple_inventory"));
    bot.loadPlugin(runtime("mineflayer/lib/plugins/generic_place"));
    bot.setQuickBarSlot(0);
    const Item = mineflayerRequire("prismarine-item")(bot.registry);
    const item = new Item(bot.registry.itemsByName.end_crystal.id, 4);
    item.slot = 36;
    bot.inventory.slots[36] = item;
    const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
    bot._client.state = "play";
    bot._client.write = (name, params) => {
      serializer.createPacketBuffer({ name, params });
      if (name === "block_place") assertCrystalClick(bot, params);
      packets.push({ name, params });
    };
    bot.pathfinder = { stop: async () => {}, goto: () => new Promise(() => {}) };
    bot.swordpvp = { stop() {} };
    bot.pvp = { forceStop() {} };
    const target = {
      id: 2,
      username: "Enemy",
      type: "player",
      position: new Vec3(5.5, 65, 0.5),
      width: 0.6,
      height: 1.8,
      isValid: true,
      velocity: new Vec3(0, 0, 0),
    };
    bot.entities[2] = target;
    f.world.setBlock(new Vec3(3, 64, 0), "obsidian");
    let time = 0;
    installCombatProtocol(bot);
    const controller = createCombatController(
      bot,
      {
        style: "crystal",
        reactionMs: 0,
        crystalEnabled: true,
        crystalPredict: false,
        crystalMaxSelfDamage: 20,
        crystalMinHealth: 1,
        smoothAim: false,
      },
      {
        loadPlugins: false,
        now: () => time,
        onError: (error) => {
          throw error;
        },
      },
    );
    try {
      controller.select(target);
      bot.emit("physicsTick");
      await flush();
      bot.emit("physicsTick");
      await flush();
      const place = packets.find((p) => p.name === "block_place");
      assert.ok(place, "actual crystal placement");
      assert.deepEqual(place.params.location, new Vec3(3, 64, 0));
      assert.ok(
        packets.slice(0, packets.indexOf(place)).some((p) => p.name === "look"),
        "publishes rotation before clicking",
      );
      time = 260;
      bot.emit("physicsTick");
      await flush();
      assert.equal(packets.filter((p) => p.name === "block_place").length, 1);
      const crystal = {
        id: 3,
        name: "end_crystal",
        position: new Vec3(3.5, 65, 0.5),
        width: 2,
        height: 2,
        isValid: true,
      };
      bot.entities[3] = crystal;
      time = 600;
      bot.emit("physicsTick");
      await flush();
      const hit = packets.find(
        (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
      );
      assert.ok(hit, "breaks server-confirmed entity");
      assert.equal(hit.params.entityId ?? hit.params.target, 3);
      assert.equal(packets[packets.indexOf(hit) - 1].name, "look");
      delete bot.entities[3];
      for (let cycle = 0; cycle < 3; cycle++) {
        time += 300;
        bot.emit("physicsTick");
        await controller.idleTask;
        assert.equal(
          packets.filter((p) => p.name === "block_place").length,
          cycle + 2,
          "immediately reuses the confirmed base after each explosion",
        );
        bot.entities[cycle + 4] = { ...crystal, id: cycle + 4 };
        time += 300;
        bot.emit("physicsTick");
        await controller.idleTask;
        const attacks = packets.filter(
          (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
        );
        assert.equal(attacks.length, cycle + 2, "breaks each new confirmed crystal");
        delete bot.entities[cycle + 4];
      }
      controller.stop();
      time = 3000;
      // Mineflayer can flush its last look packet on a timer after stop.
      // Count crystal clicks, attacks and swings independently of that flush.
      const actionPackets = () =>
        packets.filter((packet) =>
          ["block_place", "attack", "use_entity", "arm_animation"].includes(packet.name),
        );
      const count = actionPackets().length;
      bot.emit("physicsTick");
      await new Promise((resolve) => setTimeout(resolve, 65));
      await flush();
      assert.equal(actionPackets().length, count, "stop cancels all crystal actions");
    } finally {
      controller.dispose();
      f.dispose();
    }
  });
}

for (const version of ["1.20.4", "26.1.2"]) {
  test(`bow defense uses an already equipped offhand shield on ${version} and preempts a charged bow`, async () => {
    const f = worldFixture(version),
      bot = f.bot,
      packets = [];
    bot.supportFeature = bot.registry.supportFeature;
    bot.loadPlugin(runtime("mineflayer/lib/plugins/inventory"), { hideErrors: false });
    bot.loadPlugin(runtime("mineflayer/lib/plugins/simple_inventory"));
    bot.setQuickBarSlot(0);
    const Item = mineflayerRequire("prismarine-item")(bot.registry);
    const shield = new Item(bot.registry.itemsByName.shield.id, 1);
    shield.slot = 45;
    bot.inventory.slots[45] = shield;
    for (const [slot, name] of [
      [36, "bow"],
      [37, "arrow"],
    ]) {
      const item = new Item(bot.registry.itemsByName[name].id, 16);
      item.slot = slot;
      bot.inventory.slots[slot] = item;
    }
    assert.equal(
      bot.inventory.items().some((i) => i.name === "shield"),
      false,
    );
    const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
    bot._client.state = "play";
    bot._client.write = (name, params) => {
      serializer.createPacketBuffer({ name, params });
      packets.push({ name, params });
    };
    const enemy = {
      id: 2,
      username: "Archer",
      position: new Vec3(8, 64, 0),
      height: 1.8,
      heldItem: { name: "bow" },
    };
    let aimed = false,
      time = 0;
    bot.projectiles = {
      get isAimedAt() {
        return aimed ? { entity: enemy } : null;
      },
      projectileAtMe: null,
    };
    bot.pathfinder = { stop: async () => {}, goto: () => new Promise(() => {}) };
    bot.swordpvp = { stop() {} };
    bot.pvp = { forceStop() {} };
    bot.bowpvp = { shotToEntity: () => ({ hit: true, yaw: 1, pitch: 0.1 }) };
    let equipping = 0;
    bot.equip = async () => {
      equipping++;
    };
    const controller = createCombatController(
      bot,
      { style: "ranged", reactionMs: 0, bowDefense: true, smoothAim: false },
      { loadPlugins: false, now: () => time },
    );
    try {
      controller.select(enemy);
      bot.emit("physicsTick");
      await controller.idleTask;
      bot.emit("physicsTick");
      await controller.idleTask;
      assert.ok(
        packets.some((p) => p.name === "use_item" && p.params.hand === 0),
        "bow is charging",
      );
      aimed = true;
      time = 200;
      bot.emit("physicsTick");
      await controller.idleTask;
      const raise = packets.findLastIndex((p) => p.name === "use_item" && p.params.hand === 1);
      assert.ok(raise >= 0, "offhand shield is raised");
      assert.equal(packets[raise - 1].name, "look", "faces the threat before raising the shield");
      assert.equal(equipping, 0, "shield in slot 45 is reused");
      assert.equal(bot.launcherDefendingBow, true);
      assert.equal(
        packets.slice(raise + 1).some((p) => p.name === "block_dig"),
        false,
      );
      bot.deactivateItem();
      time = 400;
      bot.emit("physicsTick");
      await controller.idleTask;
      assert.equal(
        packets.at(-1).params.hand,
        1,
        "recovers when another action lowered the shield",
      );
      aimed = false;
      time = 800;
      bot.emit("physicsTick");
      await controller.idleTask;
      assert.equal(bot.launcherDefendingBow, false);
      controller.dispose();
      const defense = createBowDefense(
        bot,
        normalizeCombat({ bowDefense: true, bowOffhand: true }),
      );
      aimed = true;
      defense.tick(true);
      await defense.task;
      assert.equal(
        packets.at(-1).params.hand,
        1,
        "offhand bow preference does not disable protection",
      );
      defense.stop();
    } finally {
      controller.dispose();
      f.dispose();
    }
  });

  for (const variant of [
    { crystalCoverBlock: "planks", smoothAim: false },
    {
      crystalCoverBlock: "auto",
      smoothAim: true,
      style: "auto",
      spawnDelayTicks: 2,
      bowDefense: true,
    },
    { crystalCoverBlock: "auto", smoothAim: true, crystalFastAim: false },
  ]) {
    test(`crystals finish the build/cover/place/break cycle on ${version}: ${JSON.stringify(variant)}`, async () => {
      const f = worldFixture(version),
        bot = f.bot,
        packets = [],
        errors = [],
        statuses = [];
      bot.supportFeature = bot.registry.supportFeature;
      for (const plugin of [
        "entities",
        "inventory",
        "simple_inventory",
        "generic_place",
        "place_block",
      ])
        bot.loadPlugin(runtime(`mineflayer/lib/plugins/${plugin}`), { hideErrors: false });
      bot.setQuickBarSlot(0);
      const Item = mineflayerRequire("prismarine-item")(bot.registry);
      for (const [slot, name] of [
        [36, "end_crystal"],
        [37, "obsidian"],
        [38, "oak_planks"],
        [45, "shield"],
        [5, "netherite_helmet"],
        [6, "netherite_chestplate"],
        [7, "netherite_leggings"],
        [8, "netherite_boots"],
      ]) {
        const item = new Item(bot.registry.itemsByName[name].id, slot < 9 ? 1 : 16);
        item.slot = slot;
        bot.inventory.slots[slot] = item;
      }
      bot.equip = async (item, hand) => {
        assert.equal(hand, "hand");
        const old = bot.inventory.slots[36],
          from = item.slot;
        bot.inventory.slots[36] = item;
        item.slot = 36;
        bot.inventory.slots[from] = old;
        if (old) old.slot = from;
      };
      const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
      bot._client.state = "play";
      const faceOffsets = [
        new Vec3(0, -1, 0),
        new Vec3(0, 1, 0),
        new Vec3(0, 0, -1),
        new Vec3(0, 0, 1),
        new Vec3(-1, 0, 0),
        new Vec3(1, 0, 0),
      ];
      let delayedSpawn = null;
      bot._client.write = (name, params) => {
        serializer.createPacketBuffer({ name, params });
        if (name === "block_place") assertCrystalClick(bot, params);
        packets.push({ name, params, held: bot.heldItem?.name });
        if (name !== "block_place") return;
        const held = bot.heldItem?.name,
          destination = params.location.plus(faceOffsets[params.direction]);
        setImmediate(() => {
          if (held === "end_crystal") {
            const entity = {
              id: 3,
              name: "end_crystal",
              position: params.location.offset(0.5, 1, 0.5),
              width: 2,
              height: 2,
              isValid: true,
            };
            if (variant.spawnDelayTicks)
              delayedSpawn = { entity, at: time + variant.spawnDelayTicks * 300 };
            else bot.entities[3] = entity;
          } else {
            const before = bot.blockAt(destination);
            f.world.setBlock(destination, held);
            bot.emit(`blockUpdate:${destination}`, before, bot.blockAt(destination));
          }
        });
      };
      bot.pathfinder = { stop: async () => {}, goto: () => new Promise(() => {}) };
      bot.swordpvp = { stop() {} };
      bot.pvp = { forceStop() {} };
      const enemy = {
        id: 2,
        username: "Enemy",
        type: "player",
        position: new Vec3(5.5, 64, 0.5),
        width: 0.6,
        height: 1.8,
        isValid: true,
        velocity: new Vec3(0, 0, 0),
      };
      bot.entities[2] = enemy;
      let time = 0;
      installCombatProtocol(bot);
      const settings = normalizeCombat({
        style: "crystal",
        reactionMs: 0,
        crystalEnabled: true,
        crystalMaxSelfDamage: 3,
        ...variant,
      });
      const controller = createCombatController(bot, settings, {
        loadPlugins: variant.smoothAim,
        now: () => time,
        onError: (error) => errors.push(error),
        onStatus: (message) => statuses.push(message),
      });
      try {
        controller.select(enemy);
        for (let i = 0; i < 12; i++) {
          if (delayedSpawn && time >= delayedSpawn.at) {
            bot.entities[3] = delayedSpawn.entity;
            delayedSpawn = null;
          }
          if (variant.bowDefense) {
            enemy.position.z = delayedSpawn ? 6.5 : 0.5;
            enemy.heldItem = delayedSpawn ? { name: "bow" } : null;
            enemy.yaw = Math.atan2(
              enemy.position.x - bot.entity.position.x,
              enemy.position.z - bot.entity.position.z,
            );
            enemy.pitch = 0;
            enemy.metadata = [];
            enemy.metadata[
              bot.registry.entitiesByName.player.metadataKeys.indexOf("living_entity_flags")
            ] = delayedSpawn ? 1 : 0;
          }
          bot.emit("physicsTick");
          let timeout;
          try {
            await Promise.race([
              controller.idleTask,
              new Promise((_, reject) => {
                timeout = setTimeout(
                  () => reject(new Error(`crystal action stuck: ${statuses.join("; ")}`)),
                  2000,
                );
              }),
            ]);
          } finally {
            clearTimeout(timeout);
          }
          await flush();
          if (delayedSpawn && !bot.launcherDefendingBow)
            assert.match(
              controller.status,
              /^crystal /,
              "auto stays in crystal mode while awaiting delayed spawn",
            );
          time += 300;
        }
        assert.deepEqual(errors, []);
        if (variant.bowDefense) {
          assert.ok(
            statuses.some((message) => message.startsWith("bow threat:")),
            "shield defense interrupts the pending crystal cycle",
          );
          assert.ok(
            packets.some((p) => p.name === "use_item" && p.params.hand === 1),
            "the interruption actually raises a shield",
          );
        }
        const places = packets.filter((p) => p.name === "block_place");
        assert.ok(
          places.some((p) => p.held === "obsidian"),
          `automatically builds obsidian foundation: ${statuses.join("; ")}; ${JSON.stringify(places)}`,
        );
        assert.ok(
          places.some(
            (p) => p.held === (variant.crystalCoverBlock === "auto" ? "obsidian" : "oak_planks"),
          ) && statuses.some((message) => message.startsWith("crystal cover:")),
          `places protective block: ${statuses.join("; ")}; ${JSON.stringify(places)}`,
        );
        const crystal = places.find((p) => p.held === "end_crystal");
        assert.ok(crystal, "places crystal after server block confirmation");
        const attack = packets.find(
          (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
        );
        assert.ok(attack, "breaks the confirmed crystal");
        assert.ok(
          statuses.findIndex((message) => message.startsWith("crystal cover:")) <
            statuses.findIndex((message) => message.startsWith("crystal break:")),
          "cover is built before the explosion",
        );
        assert.ok(
          places.filter((p) => p.held === "obsidian" || p.held === "oak_planks").length <= 3,
          "one foundation and at most two cover blocks, without construction loops",
        );
        assert.ok(
          packets.some(
            (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
          ),
          "breaks crystal",
        );
        const self = explosionDamage(bot, bot.entity, crystal.params.location.offset(0.5, 1, 0.5));
        assert.ok(
          self <= settings.crystalMaxSelfDamage,
          `default self-damage limit respected: ${self}`,
        );
        for (const place of places.filter(
          (p) => p.held === "oak_planks" || p.held === "obsidian",
        )) {
          const position = place.params.location.plus(faceOffsets[place.params.direction]);
          if (!position.equals(crystal.params.location)) f.world.clearBlock(position);
        }
        assert.ok(
          explosionDamage(bot, bot.entity, crystal.params.location.offset(0.5, 1, 0.5)) >
            self + 0.25,
          "placed cover actually reduces explosion exposure",
        );
      } finally {
        controller.dispose();
        f.dispose();
      }
    });
  }
}

for (const version of ["1.20.4", "26.1.2"]) {
  test(`bow recognition reads draw metadata, reacts on player updates, rejects walls and respects settings on ${version}`, async () => {
    const f = worldFixture(version),
      bot = f.bot;
    const flagsIndex =
      bot.registry.entitiesByName.player.metadataKeys.indexOf("living_entity_flags");
    const archer = {
      id: 2,
      type: "player",
      name: "player",
      position: new Vec3(10.5, 64, 0.5),
      height: 1.8,
      yaw: Math.PI / 2,
      pitch: 0,
      heldItem: { name: "bow" },
      metadata: [],
    };
    archer.metadata[flagsIndex] = 0;
    bot.entities[2] = archer;
    const settings = normalizeCombat({ bowDefense: true, bowDefenseCheckMs: 500 });
    bot.inventory.slots[45] = { name: "shield" };
    bot.supportFeature = bot.registry.supportFeature;
    let raised = 0,
      time = 0;
    bot.activateItem = () => {
      raised++;
      bot.usingHeldItem = true;
    };
    bot.deactivateItem = () => {
      bot.usingHeldItem = false;
    };
    const defense = createBowDefense(bot, settings, { now: () => time });
    try {
      assert.equal(detectBowThreat(bot, settings), null, "idle bow is not a draw");
      assert.equal(defense.tick(true), false);
      archer.metadata[flagsIndex] = 1;
      time = 10;
      bot.emit("entityUpdate", archer);
      await defense.task;
      assert.equal(raised, 1, "metadata update preempts the long configured poll interval");
      assert.ok(
        detectBowThreat(bot, { ...settings, bowDefenseMode: "trajectory" }),
        "strict mode predicts a drawn bow hitting the bot",
      );
      archer.yaw += 0.06;
      assert.equal(
        detectBowThreat(bot, { ...settings, bowDefenseMode: "trajectory", bowDefenseMargin: 0 }),
        null,
        "strict narrow bounds reject a near miss",
      );
      assert.ok(
        detectBowThreat(bot, { ...settings, bowDefenseMode: "trajectory", bowDefenseMargin: 1 }),
        "expanded sensitivity recognizes a near miss early",
      );
      archer.yaw = Math.PI / 2;
      archer.metadata[flagsIndex] = 3;
      archer.heldItem = { name: "diamond_sword" };
      archer.equipment = [archer.heldItem, { name: "bow" }];
      assert.ok(detectBowThreat(bot, settings), "drawing from the offhand is recognized");
      defense.stop();
      time = 20;
      bot.emit("entityUpdate", archer);
      await defense.task;
      assert.equal(raised, 2, "offhand draw also triggers immediate recognition");
      archer.metadata[flagsIndex] = 1;
      archer.heldItem = { name: "bow" };
      assert.equal(detectBowThreat(bot, { ...settings, bowDefenseRange: 4 }), null);
      archer.yaw = -Math.PI / 2;
      assert.equal(detectBowThreat(bot, settings), null, "aiming away");
      archer.yaw = Math.PI / 2;
      for (let y = 64; y < 70; y++)
        for (let z = -1; z <= 1; z++) f.world.setBlock(new Vec3(5, y, z), "stone");
      assert.equal(detectBowThreat(bot, settings), null, "wall blocks the threat");
      for (let y = 64; y < 70; y++)
        for (let z = -1; z <= 1; z++) f.world.clearBlock(new Vec3(5, y, z));
      archer.metadata[flagsIndex] = 0;
      assert.ok(
        detectBowThreat(bot, { ...settings, bowDefenseRequireDraw: false }),
        "optional anticipation before draw",
      );
      delete bot.entities[2];
      bot.entities[3] = {
        id: 3,
        name: "arrow",
        position: new Vec3(3.5, 65.2, 0.5),
        velocity: new Vec3(-1, 0, 0),
      };
      assert.equal(
        detectBowThreat(bot, { ...settings, bowDefenseMode: "trajectory" })?.entity.id,
        3,
        "incoming arrow trajectory",
      );
      defense.dispose();
      assert.equal(bot.listenerCount("entityUpdate"), 0, "perception callbacks are removed");
    } finally {
      defense.dispose();
      f.dispose();
    }
  });
}

for (const version of ["1.20.4", "26.1.2"]) {
  test(`crystal approach walks smoothly through real physics on ${version}`, async () => {
    const f = worldFixture(version),
      bot = f.bot;
    const { PlayerState } = mineflayerRequire("prismarine-physics");
    const routes = [];
    bot.supportFeature = bot.registry.supportFeature;
    bot.inventory.slots[36] = { name: "end_crystal", slot: 36 };
    bot.pathfinder = {
      stop: async () => bot.clearControlStates(),
      goto: (goal) => {
        routes.push(goal);
        return new Promise(() => {});
      },
    };
    const enemy = {
      id: 2,
      username: "Enemy",
      type: "player",
      isValid: true,
      position: new Vec3(12.5, 64, 0.5),
      width: 0.6,
      height: 1.8,
    };
    bot.entities[2] = enemy;
    let time = 0;
    const controller = createCombatController(
      bot,
      { style: "crystal", reactionMs: 0, crystalEnabled: true },
      { loadPlugins: false, now: () => time },
    );
    const controls = [];
    try {
      controller.select(enemy);
      for (let i = 0; i < 100; i++) {
        time = i * 50;
        bot.emit("physicsTick");
        await controller.idleTask;
        await flush();
        controls.push(
          Object.fromEntries(
            ["forward", "back", "left", "right", "jump", "sprint"].map((name) => [
              name,
              bot.getControlState(name),
            ]),
          ),
        );
        bot.physics.simulatePlayer(new PlayerState(bot, bot.controlState), f.world).apply(bot);
      }
      assert.ok(bot.entity.position.x > 8.5, "reaches placement distance by walking forward");
      assert.equal(routes.length, 0, "flat pursuit avoids precise block-centering routes");
      assert.equal(
        controls.some((c) => c.left || c.right || c.back || c.jump),
        false,
        "no strafing, reverse braking or critical jumps",
      );
      assert.ok(enemy.position.distanceTo(bot.entity.position) > 2, "stops before body contact");
      enemy.position.x = 16.5;
      time += 300;
      bot.emit("physicsTick");
      await controller.idleTask;
      assert.equal(bot.controlState.forward, true, "resumes when the opponent moves away");
      const wallX = Math.floor(bot.entity.position.x) + 1;
      const wallZ = Math.floor(bot.entity.position.z);
      f.world.setBlock(new Vec3(wallX, 64, wallZ), "stone");
      f.world.setBlock(new Vec3(wallX, 65, wallZ), "stone");
      time += 300;
      bot.emit("physicsTick");
      await controller.idleTask;
      assert.equal(routes.length, 1, "an obstacle hands movement back to pathfinding");
      assert.equal(bot.controlState.forward, false, "releases direct controls before routing");
      controller.stop();
      await flush();
      assert.equal(bot.controlState.forward, false);
    } finally {
      controller.dispose();
      f.dispose();
    }
  });

  test(`rejected crystal foundations retry without blocking for 5000ms on ${version}`, async () => {
    const f = worldFixture(version),
      bot = f.bot,
      clicks = [],
      errors = [];
    bot.supportFeature = bot.registry.supportFeature;
    bot.loadPlugin(runtime("mineflayer/lib/plugins/entities"));
    bot.loadPlugin(runtime("mineflayer/lib/plugins/inventory"), { hideErrors: false });
    bot.loadPlugin(runtime("mineflayer/lib/plugins/generic_place"));
    bot.loadPlugin(runtime("mineflayer/lib/plugins/place_block"));
    bot.setQuickBarSlot(0);
    const Item = mineflayerRequire("prismarine-item")(bot.registry);
    for (const [slot, name] of [
      [36, "end_crystal"],
      [37, "obsidian"],
    ]) {
      const item = new Item(bot.registry.itemsByName[name].id, 16);
      item.slot = slot;
      bot.inventory.slots[slot] = item;
    }
    bot.equip = async (item) => {
      const from = item.slot,
        old = bot.inventory.slots[36];
      bot.inventory.slots[36] = item;
      item.slot = 36;
      bot.inventory.slots[from] = old;
      if (old) old.slot = from;
    };
    bot.pathfinder = { stop: async () => {}, goto: () => new Promise(() => {}) };
    const enemy = {
      id: 2,
      username: "Enemy",
      type: "player",
      isValid: true,
      position: new Vec3(5.5, 64, 0.5),
      width: 0.6,
      height: 1.8,
    };
    bot.entities[2] = enemy;
    const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
    bot._client.state = "play";
    bot._client.write = (name, params) => {
      serializer.createPacketBuffer({ name, params });
      if (name === "block_place") {
        assertCrystalClick(bot, params);
        clicks.push({ params, held: bot.heldItem.name }); // Server rejects every click.
      }
    };
    installCombatProtocol(bot);
    let time = 0;
    const controller = createCombatController(
      bot,
      {
        style: "crystal",
        reactionMs: 0,
        crystalEnabled: true,
        crystalSpawnTimeoutMs: 300,
        crystalIntervalMs: 100,
        crystalCover: false,
        crystalMaxSelfDamage: 20,
        crystalMinHealth: 1,
      },
      {
        loadPlugins: false,
        now: () => time,
        onError: (error) => errors.push(error),
      },
    );
    async function tick(at) {
      time = at;
      bot.emit("physicsTick");
      let timer;
      try {
        await Promise.race([
          controller.idleTask,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("block placement locked the combat loop")),
              100,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      await flush();
    }
    try {
      controller.select(enemy);
      await tick(0);
      await tick(50);
      assert.equal(clicks.length, 1);
      await tick(150);
      assert.equal(clicks.length, 1, "does not duplicate an unconfirmed block");
      await tick(350);
      assert.equal(clicks.length, 2, "retries at the configured confirmation deadline");
      await tick(650);
      await tick(950);
      assert.equal(clicks.length, 3, "tries another layout after bounded rejection");
      assert.equal(
        clicks.every((click) => click.held === "obsidian"),
        true,
        "never places a crystal on an unconfirmed foundation",
      );
      assert.deepEqual(errors, []);
      assert.match(controller.status, /^crystal /, "server rejection keeps the cycle running");
      controller.stop();
      await tick(2000);
      assert.equal(clicks.length, 3, "stop cancels retries");
    } finally {
      controller.dispose();
      f.dispose();
    }
  });
}

test("crystal placement waits for spawn and bounds retries instead of constructing more bases", () => {
  const f = worldFixture(),
    bot = f.bot;
  const target = { id: 2, position: new Vec3(5.5, 64, 0.5), width: 0.6, height: 1.8 };
  bot.entities[2] = target;
  bot.inventory.items = () => [
    { name: "end_crystal", count: 16 },
    { name: "obsidian", count: 16 },
  ];
  const planner = createCrystalPlanner(
    bot,
    normalizeCombat({
      crystalEnabled: true,
      crystalCover: false,
      crystalMinHealth: 1,
      crystalMaxSelfDamage: 20,
      crystalRetries: 2,
    }),
  );
  f.world.setBlock(new Vec3(3, 64, 0), "obsidian");
  try {
    const action = planner.plan(target, 0);
    assert.equal(action.type, "place");
    planner.commit(action, 0);
    assert.equal(planner.plan(target, 250), null);
    assert.match(planner.reason, /waiting for server crystal spawn/);
    const retry = planner.plan(target, 1600);
    assert.equal(retry.type, "place");
    assert.ok(retry.base.position.equals(action.base.position));
    planner.commit(retry, 1600);
    assert.equal(planner.plan(target, 3200), null);
    assert.match(planner.reason, /retries exhausted/);
  } finally {
    f.dispose();
  }
});
