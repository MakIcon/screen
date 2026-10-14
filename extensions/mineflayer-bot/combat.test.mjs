import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import path from "node:path";

const require = createRequire(import.meta.url);
const runtimeRequire = process.env.SCREEN_COMBAT_RUNTIME
  ? createRequire(path.resolve(process.env.SCREEN_COMBAT_RUNTIME, "package.json"))
  : require;
const combat = runtimeRequire("./combat.cjs");
const worker = runtimeRequire("./worker.cjs");
const { Vec3 } = require("vec3");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(settings = {}, options = {}) {
  const bot = new EventEmitter();
  const calls = [];
  let time = 0;
  const enemy = {
    id: 2,
    username: "Enemy",
    type: "player",
    position: new Vec3(12, 64, 0),
    height: 1.8,
    width: 0.6,
    isValid: true,
  };
  const items = [{ name: "diamond_sword" }, { name: "bow" }, { name: "arrow" }];
  Object.assign(bot, {
    entity: { id: 1, username: "Bot", position: new Vec3(0, 64, 0), yaw: 0 },
    username: "Bot",
    _client: { state: "play", write: (name, packet) => calls.push(["packet", name, packet]) },
    health: 20,
    inventory: { items: () => items },
    supportFeature: () => false,
    pathfinder: {
      stop: async () => {
        calls.push(["stop"]);
      },
      goto: async (goal) => {
        calls.push(["goto", goal]);
      },
    },
    tracker: {
      trackEntity: () => {},
      stopTrackingEntity: () => {},
      getEntitySpeed: () => new Vec3(0.1, 0, 0),
    },
    equip: async (item, hand) => {
      calls.push(["equip", item.name, hand]);
    },
    clearControlStates: () => {},
    world: { raycast: () => null },
    activateItem: (offhand) => calls.push(["draw", offhand]),
    deactivateItem: () => calls.push(["release"]),
    look: async (yaw, pitch) => {
      calls.push(["look", yaw, pitch]);
    },
    nearestEntity: (predicate) => [enemy].find(predicate),
    swordpvp: {
      target: null,
      attack: async (entity) => {
        bot.swordpvp.target = entity;
        calls.push(["melee", entity]);
      },
      stop: () => {
        bot.swordpvp.target = null;
      },
    },
    pvp: {
      target: null,
      attack: async (entity) => {
        bot.pvp.target = entity;
        calls.push(["basic", entity]);
      },
      forceStop: () => {
        bot.pvp.target = null;
      },
    },
    bowpvp: {
      shotToEntity: (_entity, speed) => {
        calls.push(["customPlan", speed]);
        return { hit: true, yaw: 0.5, pitch: 0.2 };
      },
    },
    hawkEye: {
      getMasterGrade: (_entity, speed) => {
        calls.push(["hawkPlan", speed]);
        return { yaw: 0.5, pitch: 0.2 };
      },
    },
  });
  const controller = combat.createCombatController(
    bot,
    { reactionMs: 0, ...settings },
    {
      loadPlugins: false,
      now: () => time,
      random: () => 1,
      isOwner: (name) => name?.toLowerCase() === "owner",
      onError: (error) => {
        throw error;
      },
      ...options,
    },
  );
  return {
    bot,
    calls,
    controller,
    enemy,
    items,
    tick: async (value) => {
      time = value;
      bot.emit("physicsTick");
      await flush();
    },
  };
}

test("worker accepts legacy config and rejects malformed combat values", () => {
  const parsed = worker.parseConfig(
    JSON.stringify({
      server: { host: "localhost" },
      account: { username: "Bot" },
      combat: { cps: 100, bowIntervalMs: 2, engine: "unknown", enabled: "false", reactionMs: 10.5 },
    }),
  );
  assert.equal(parsed.combat.cps, 20);
  assert.equal(parsed.combat.bowIntervalMs, 1200);
  assert.equal(parsed.combat.engine, "custom");
  assert.equal(parsed.combat.enabled, true);
  assert.equal(parsed.combat.reactionMs, 11);
  assert.equal(combat.normalizeCombat(null).autoTarget, "manual");
  assert.equal(parsed.combat.smoothAimSpeed, 100);
  assert.equal(combat.normalizeCombat({ smoothAimSpeed: 0 }).smoothAimSpeed, 10);
  assert.equal(combat.normalizeCombat({ smoothAimSpeed: 500 }).smoothAimSpeed, 300);
  assert.equal(combat.normalizeCombat({ smoothAimSpeed: NaN }).smoothAimSpeed, 100);
});

test("explicit owner target, reaction delay and selected melee engine", async () => {
  const f = fixture({ style: "melee", reactionMs: 500, engine: "basic" });
  f.enemy.username = "Owner";
  assert.equal(f.controller.findTarget("oWnEr"), f.enemy);
  assert.throws(() => f.controller.findTarget("Bot"), /itself/);
  assert.throws(() => f.controller.select(f.bot.entity), /itself/);
  f.controller.select(f.enemy);
  await f.tick(499);
  assert.equal(
    f.calls.some((call) => call[0] === "basic"),
    false,
  );
  await f.tick(500);
  assert.equal(f.calls.filter((call) => call[0] === "basic").length, 1);
  f.controller.stop();
  assert.equal(f.bot.pvp.target, null);
  f.controller.dispose();
});

test("named targets behind cover remain selectable, nearest requires line of sight", () => {
  const f = fixture();
  f.enemy.name = "zombie";
  f.enemy.username = undefined;
  f.bot.world.raycast = () => ({ name: "stone" });
  assert.equal(f.controller.findTarget("nearest"), undefined);
  assert.equal(f.controller.findTarget("zombie"), f.enemy);
  f.enemy.position.x = 100;
  assert.equal(f.controller.findTarget("zombie"), f.enemy);
  assert.throws(() => f.controller.select(f.enemy), /too far/);
  f.controller.dispose();
});

test("cover blocks bow activation without a canSeeEntity method", async () => {
  const f = fixture({ style: "ranged" });
  f.bot.world.raycast = () => ({ name: "stone" });
  f.controller.select(f.enemy);
  await f.tick(0);
  await f.tick(50);
  assert.equal(
    f.calls.some((call) => call[0] === "draw"),
    false,
  );
  f.bot.world.raycast = () => null;
  await f.tick(100);
  assert.equal(
    f.calls.some((call) => call[0] === "draw"),
    true,
  );
  f.controller.dispose();
});

for (const bowEngine of ["custom", "hawkeye"]) {
  test(`${bowEngine} bow observes full charge, shot interval, prediction and accuracy`, async () => {
    const f = fixture({
      style: "ranged",
      bowEngine,
      bowAccuracy: 100,
      bowIntervalMs: 2000,
      bowPredict: false,
    });
    f.controller.select(f.enemy);
    await f.tick(0);
    await f.tick(50);
    assert.equal(f.calls.filter((call) => call[0] === "draw").length, 1);
    await f.tick(1249);
    assert.equal(f.calls.filter((call) => call[0] === "release").length, 0);
    await f.tick(1250);
    assert.equal(f.calls.filter((call) => call[0] === "release").length, 1);
    assert.deepEqual(f.calls.find((call) => call[0] === "look").slice(1), [0.5, 0.2]);
    assert.ok(
      f.calls
        .find((call) => call[0] === (bowEngine === "custom" ? "customPlan" : "hawkPlan"))[1]
        .equals(new Vec3(0, 0, 0)),
    );
    await f.tick(2049);
    assert.equal(f.calls.filter((call) => call[0] === "draw").length, 1);
    await f.tick(2050);
    assert.equal(f.calls.filter((call) => call[0] === "draw").length, 2);
    f.controller.dispose();
  });
}

test("bow skill produces scatter and offhand draw", async () => {
  const f = fixture({ style: "ranged", bowAccuracy: 0, bowOffhand: true });
  f.controller.select(f.enemy);
  await f.tick(0);
  await f.tick(50);
  assert.deepEqual(f.calls.find((call) => call[0] === "look").slice(1), [0.56, 0.26]);
  assert.deepEqual(
    f.calls.find((call) => call[0] === "draw"),
    ["draw", true],
  );
  f.controller.dispose();
});

test("auto picks only hostile mobs; stop suspends auto until resumed", async () => {
  const f = fixture({ autoTarget: "hostile", style: "melee" });
  const zombie = {
    ...f.enemy,
    id: 3,
    username: undefined,
    type: "mob",
    name: "zombie",
    position: new Vec3(2, 64, 0),
  };
  f.bot.nearestEntity = (predicate) => [f.enemy, zombie].find(predicate);
  await f.tick(0);
  assert.equal(f.bot.swordpvp.target, zombie);
  assert.equal(f.controller.findTarget("nearest"), zombie);
  f.controller.stop();
  await f.tick(1000);
  assert.equal(f.controller.status, "idle");
  f.controller.auto(true);
  await f.tick(2000);
  assert.equal(f.bot.swordpvp.target, zombie);
  f.controller.dispose();
});

test("missing arrows fall back to melee only when configured", async () => {
  for (const meleeFallback of [false, true]) {
    const f = fixture({ style: "ranged", meleeFallback });
    f.items.pop();
    f.controller.select(f.enemy);
    await f.tick(0);
    assert.equal(
      f.calls.some((call) => call[0] === "melee"),
      meleeFallback,
    );
    f.controller.dispose();
  }
});

test("auto crystal approaches directly without starting melee strafing", async () => {
  const f = fixture({ style: "auto", crystalEnabled: true });
  f.items.push({ name: "end_crystal" }, { name: "obsidian" });
  try {
    f.controller.select(f.enemy);
    await f.tick(0);
    await f.tick(50);
    assert.match(f.controller.status, /^crystal /);
    assert.equal(
      f.calls.some(([name]) => name === "melee" || name === "basic"),
      false,
    );
    assert.equal(f.calls.filter(([name]) => name === "goto").length, 1);
    await f.tick(500);
    assert.equal(
      f.calls.filter(([name]) => name === "goto").length,
      1,
      "keeps the same approach route",
    );
  } finally {
    f.controller.dispose();
  }
});

test("target loss cancels bow toward the ground and dispose removes controller listeners", async () => {
  const f = fixture({ style: "ranged" });
  f.controller.select(f.enemy);
  await f.tick(0);
  await f.tick(50);
  f.bot.emit("entityGone", f.enemy);
  assert.equal(f.controller.status, "idle");
  assert.equal(f.calls.at(-2)[0], "release");
  assert.ok(f.calls.some((call) => call[0] === "look" && call[2] === -Math.PI / 2));
  const cancelPacket = f.calls.find((call) => call[0] === "packet" && call[2].pitch === 90);
  assert.ok(cancelPacket);
  assert.ok(f.calls.indexOf(cancelPacket) < f.calls.findIndex((call) => call[0] === "release"));
  f.controller.dispose();
  assert.equal(f.bot.listenerCount("physicsTick"), 0);
  assert.equal(f.bot.listenerCount("entityGone"), 0);
});

test("stop during asynchronous equip prevents a later attack", async () => {
  const f = fixture({ style: "melee" });
  let release;
  f.bot.equip = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  f.controller.select(f.enemy);
  await f.tick(0);
  f.controller.stop();
  release();
  await flush();
  assert.equal(
    f.calls.some((call) => call[0] === "melee"),
    false,
  );
  assert.equal(f.controller.status, "idle");
  f.controller.dispose();
});

test("classic follow goals use the native planner and repeated goals do not restart it", async () => {
  const f = fixture();
  f.bot.pathfinder.setGoal({ entity: f.enemy, rangeSq: 4 });
  f.bot.pathfinder.setGoal({ entity: f.enemy, rangeSq: 4 });
  assert.equal(f.calls.filter((call) => call[0] === "goto").length, 1);
  const goal = f.calls.find((call) => call[0] === "goto")[1];
  assert.equal(goal.dynamic, true);
  assert.equal(goal.neverfinish, true);
  await f.bot.pathfinder.stop();
  assert.equal(f.bot.pathfinder.goal, null);
  f.controller.dispose();
});

const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const mineflayerRequire = createRequire(runtimeRequire.resolve("mineflayer"));
const protocol = mineflayerRequire("minecraft-protocol");

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(`real plugins, visibility, melee and bow packets serialize on ${version}`, async () => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
    const bot = rig.bot;
    bot.physicsEnabled = false;
    bot.supportFeature = bot.registry.supportFeature;
    // Use Mineflayer's actual entity, inventory, equipment and look APIs.
    bot.loadPlugin(runtimeRequire("mineflayer/lib/plugins/entities"));
    bot.loadPlugin(runtimeRequire("mineflayer/lib/plugins/time"));
    bot.loadPlugin(runtimeRequire("mineflayer/lib/plugins/inventory"), { hideErrors: false });
    bot.loadPlugin(runtimeRequire("mineflayer/lib/plugins/simple_inventory"));
    bot.setQuickBarSlot(0);
    const Item = mineflayerRequire("prismarine-item")(bot.registry);
    for (const [slot, name] of [
      [36, "diamond_sword"],
      [37, "bow"],
      [38, "arrow"],
    ]) {
      const item = new Item(bot.registry.itemsByName[name].id, 1);
      item.slot = slot;
      bot.inventory.slots[slot] = item;
    }
    const packets = [];
    const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
    bot._client.state = "play";
    bot._client.write = (name, params) => {
      assert.doesNotThrow(
        () => serializer.createPacketBuffer({ name, params }),
        `${version} ${name}`,
      );
      packets.push({ name, params });
    };
    let controller;
    try {
      worker.configurePathfinder(bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        maxDropDown: 3,
      });
      let time = 0;
      const settings = {
        cps: 5,
        meleeSkill: 100,
        reactionMs: 0,
        criticals: "off",
        strafe: "off",
        sprintTap: "off",
        shield: false,
        bowPredict: false,
        smoothAim: false,
        style: "melee",
      };
      const options = {
        now: () => time,
        isOwner: (name) => name === "Owner",
        onError: (error) => {
          throw error;
        },
      };
      controller = combat.createCombatController(bot, settings, options);
      assert.ok(bot.swordpvp && bot.pvp && bot.bowpvp && bot.hawkEye, version);
      assert.equal(bot.canSeeEntity, undefined);
      assert.equal(bot.listenerCount("physicTick"), 0);
      assert.ok(bot.swordpvp.meleeAttackRate.getTicks(null) >= 4, version);
      const target = {
        id: 2,
        username: "Owner",
        name: "player",
        type: "player",
        position: new Vec3(12.5, 64, 0.5),
        velocity: new Vec3(0, 0, 0),
        width: 0.6,
        height: 1.8,
        isValid: true,
        metadata: [],
        equipment: Array(6).fill(null),
        yaw: 0,
        pitch: 0,
      };
      bot.entities[target.id] = target;
      bot.players.Owner = { username: "Owner", entity: target };
      assert.equal(controller.findTarget("oWnEr"), target);
      // The bot starts facing away from the target; visibility must still work.
      assert.ok(combat.canSeeTarget(bot, target));
      world.setBlock(new Vec3(6, 64, 0), "stone");
      world.setBlock(new Vec3(6, 65, 0), "stone");
      assert.equal(combat.canSeeTarget(bot, target), false);
      world.clearBlock(new Vec3(6, 65, 0));
      assert.ok(combat.canSeeTarget(bot, target), "head exposed above partial cover");
      world.clearBlock(new Vec3(6, 64, 0));
      assert.ok(bot.bowpvp.shotToEntity(target, new Vec3(0, 0, 0))?.hit, `Custom bow ${version}`);
      assert.ok(
        bot.hawkEye.getMasterGrade(target, new Vec3(0, 0, 0), "bow"),
        `HawkEye bow ${version}`,
      );
      for (const engine of ["custom", "basic"]) for (const enabled of [true, false]) {
        controller.dispose();
        controller = combat.createCombatController(bot, { ...settings, engine, enabled }, options);
        target.position.x = 2.5;
        target.username = enabled ? "Owner" : "Enemy";
        if (enabled) controller.select(target);
        else {
          assert.throws(() => controller.select(target), /disabled/);
          controller.defend(target);
        }
        bot.emit("physicsTick");
        await flush();
        const before = packets.length;
        bot.emit("physicsTick");
        await flush();
        const attack = packets
          .slice(before)
          .find((packet) =>
            version === "26.1.2"
              ? packet.name === "attack"
              : packet.name === "use_entity" && packet.params.mouse === 1,
          );
        assert.ok(attack, `${engine} sent an actual attack with PvP ${enabled ? "on" : "off"}`);
        assert.equal(attack.params.entityId ?? attack.params.target, target.id);
        assert.equal(
          packets[packets.indexOf(attack) - 1].name,
          "look",
          "server receives aim before hit",
        );
        controller.stop();
      }
      target.username = "Owner";
      for (const bowEngine of ["custom", "hawkeye"]) {
        controller.dispose();
        controller = combat.createCombatController(
          bot,
          { ...settings, style: "ranged", bowEngine },
          options,
        );
        target.position.x = 12.5;
        controller.select(target);
        bot.emit("physicsTick");
        await flush();
        const before = packets.length;
        time += 50;
        bot.emit("physicsTick");
        await flush();
        assert.ok(
          packets
            .slice(before)
            .some((packet) => packet.name === (version === "1.8.8" ? "block_place" : "use_item")),
          `${bowEngine} draw`,
        );
        time += 1200;
        bot.emit("physicsTick");
        await flush();
        assert.ok(
          packets.slice(before).some((packet) => packet.name === "look"),
          `${bowEngine} aim`,
        );
        assert.ok(
          packets
            .slice(before)
            .some((packet) => packet.name === "block_dig" && packet.params.status === 5),
          `${bowEngine} release`,
        );
        controller.stop();
      }
      // An older plugin movement writer must also serialize with modern flags.
      bot._client.write("position", { x: 0.5, y: 64, z: 0.5, onGround: false });
    } finally {
      controller?.dispose();
      await bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  });
}

for (const engine of ["custom", "basic"]) {
  test(`${engine} smooth aiming turns before hitting and stops on cancellation`, async () => {
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5));
    const bot = rig.bot;
    bot.physicsEnabled = false;
    bot.supportFeature = bot.registry.supportFeature;
    bot.loadPlugin(runtimeRequire("mineflayer/lib/plugins/entities"));
    const target = {
      id: 2,
      username: "Owner",
      type: "player",
      name: "player",
      position: new Vec3(0.5, 64, 2.5),
      velocity: new Vec3(0, 0, 0),
      width: 0.6,
      height: 1.8,
      isValid: true,
      yaw: 0,
      pitch: 0,
      metadata: [],
      equipment: Array(6).fill(null),
    };
    bot.entities[target.id] = target;
    bot._client.state = "play";
    const packets = [];
    const serializer = protocol.createSerializer({
      state: "play",
      isServer: false,
      version: "26.1.2",
    });
    bot._client.write = (name, params) => {
      serializer.createPacketBuffer({ name, params });
      packets.push({ name, params });
    };
    let controller;
    try {
      worker.configurePathfinder(bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        maxDropDown: 3,
      });
      controller = combat.createCombatController(
        bot,
        {
          engine,
          smoothAim: true,
          style: "melee",
          reactionMs: 0,
          meleeSkill: 100,
          criticals: "off",
          strafe: "off",
          sprintTap: "off",
          shield: false,
        },
        {
          onError: (error) => {
            throw error;
          },
        },
      );
      const customRequire = createRequire(runtimeRequire.resolve("@nxg-org/mineflayer-custom-pvp"));
      const smoothRequire = createRequire(customRequire.resolve("@nxg-org/mineflayer-smooth-look"));
      const tween = smoothRequire("@tweenjs/tween.js");
      await bot.look(0, 0, true);
      controller.select(target);
      bot.emit("physicsTick");
      await flush();
      const startYaw = bot.entity.yaw;
      bot.emit("physicsTick");
      await flush();
      assert.equal(
        packets.some((packet) => packet.name === "attack"),
        false,
        "no strike while facing away",
      );
      assert.notEqual(bot.entity.yaw, startYaw, "head starts turning");
      assert.ok(
        Math.abs(bot.entity.yaw - startYaw) < Math.PI - 0.2,
        "turn has intermediate angles",
      );
      tween.update(tween.now() + 1000);
      bot.emit("physicsTick");
      await flush();
      bot.emit("physicsTick");
      await flush();
      assert.ok(
        packets.some((packet) => packet.name === "attack"),
        "strike after facing enemy",
      );
      target.position = new Vec3(2.5, 64, 0.5);
      bot.emit("physicsTick");
      await flush();
      controller.stop();
      const stoppedYaw = bot.entity.yaw;
      const attackCount = packets.filter((packet) => packet.name === "attack").length;
      tween.update(tween.now() + 2000);
      bot.emit("physicsTick");
      await flush();
      assert.equal(bot.entity.yaw, stoppedYaw, "no late head turn after stop");
      assert.equal(packets.filter((packet) => packet.name === "attack").length, attackCount);
    } finally {
      controller?.dispose();
      await bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  });
}

test("aim speed changes actual smooth turns without changing navigation physics", async () => {
  const customRequire = createRequire(runtimeRequire.resolve("@nxg-org/mineflayer-custom-pvp"));
  const smoothRequire = createRequire(customRequire.resolve("@nxg-org/mineflayer-smooth-look"));
  const tween = smoothRequire("@tweenjs/tween.js");
  const angles = [];
  for (const speed of [10, 100, 300]) {
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5));
    const bot = rig.bot;
    bot.physicsEnabled = false;
    bot.supportFeature = bot.registry.supportFeature;
    const yawSpeed = bot.physics.yawSpeed;
    const pitchSpeed = bot.physics.pitchSpeed;
    try {
      worker.configurePathfinder(bot, { canDig: false });
      const settings = combat.normalizeCombat({ smoothAimSpeed: speed });
      combat.configureCombatPlugins(bot, settings);
      // Reconfiguration must not multiply the speed again.
      combat.configureCombatPlugins(bot, settings);
      await bot.look(0, 0, true);
      const turning = bot.smoothLook.look(Math.PI, 0, true);
      tween.update(tween.now() + 50);
      angles.push(Math.abs(bot.entity.yaw));
      assert.equal(bot.physics.yawSpeed, yawSpeed);
      assert.equal(bot.physics.pitchSpeed, pitchSpeed);
      bot.smoothLook._cleanupTasks(true);
      await turning;
    } finally {
      bot.smoothLook?._cleanupTasks(true);
      await bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  }
  assert.ok(angles[0] < angles[1], `10% turns slower than 100%: ${angles}`);
  assert.ok(angles[1] < angles[2], `300% turns faster than 100%: ${angles}`);
});
