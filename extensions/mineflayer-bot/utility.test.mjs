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
const { simulatePearl, planPearl, createTravelController } = runtime("./pearls.cjs");
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

function travelFixture(patch = {}) {
  const f = worldFixture(),
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
      controller.stop();
      time = 3000;
      const count = packets.length;
      bot.emit("physicsTick");
      await flush();
      assert.equal(packets.length, count, "stop cancels all crystal actions");
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
            enemy.heldItem = delayedSpawn ? { name: "bow" } : null;
            enemy.yaw = Math.PI / 2;
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
