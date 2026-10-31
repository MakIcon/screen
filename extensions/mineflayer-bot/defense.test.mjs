import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const runtime = process.env.SCREEN_COMBAT_RUNTIME
  ? createRequire(path.resolve(process.env.SCREEN_COMBAT_RUNTIME, "package.json"))
  : require;
const { Vec3 } = require("vec3");
const { createCombatController, normalizeCombat, installCombatProtocol } = runtime("./combat.cjs");
const { createBowDefense } = runtime("./bow-defense.cjs");
const { installArmorManager } = runtime("./armor-manager.cjs");
const { equipCombatItem } = runtime("./combat-inventory.cjs");
const { targetBlocking } = runtime("./melee-shield.cjs");
const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const mineflayerRequire = createRequire(runtime.resolve("mineflayer"));
const { PlayerState } = mineflayerRequire("prismarine-physics");
const protocol = mineflayerRequire("minecraft-protocol");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(version) {
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
  const bot = rig.bot;
  bot.physicsEnabled = false;
  bot.supportFeature = bot.registry.supportFeature;
  bot.health = 20;
  bot.entity.onGround = true;
  for (const plugin of ["entities", "inventory", "simple_inventory"])
    bot.loadPlugin(runtime(`mineflayer/lib/plugins/${plugin}`), { hideErrors: false });
  const Item = mineflayerRequire("prismarine-item")(bot.registry);
  function item(slot, name) {
    const entry = new Item(bot.registry.itemsByName[name].id, 1);
    entry.slot = slot;
    bot.inventory.slots[slot] = entry;
    return entry;
  }
  bot.setQuickBarSlot(0);
  const packets = [];
  const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
  bot._client.state = "play";
  bot._client.write = (name, params) => {
    serializer.createPacketBuffer({ name, params });
    packets.push({
      name,
      params,
      held: bot.heldItem?.name,
      onGround: bot.entity.onGround,
      vy: bot.entity.velocity.y,
      sprint: bot.getControlState("sprint"),
      yaw: bot.entity.yaw,
      pitch: bot.entity.pitch,
      usingItem: bot.usingHeldItem,
      aimHit:
        (name === "attack" || (name === "use_entity" && params.mouse === 1)) &&
        Number.isFinite(bot.entity.yaw) &&
        Number.isFinite(bot.entity.pitch) &&
        bot.util?.raytrace?.entityRaytrace(
          bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0),
          bot.util.getViewDir(),
          3,
          (entity) => entity.id === 2,
        )?.id === 2,
      tick: bot.defenseTestTick,
    });
  };
  installCombatProtocol(bot);
  bot.pathfinder = { stop: async () => {}, goto: () => new Promise(() => {}) };
  const equips = [];
  bot.equip = async (entry, destination) => {
    const from = entry.slot,
      to = bot.getEquipmentDestSlot(destination);
    const old = bot.inventory.slots[to];
    bot.inventory.slots[from] = old;
    if (old) old.slot = from;
    bot.inventory.slots[to] = entry;
    entry.slot = to;
    equips.push({ held: entry.name, hand: destination, tick: bot.defenseTestTick });
  };
  const flagsIndex =
    bot.registry.entitiesByName.player?.metadataKeys?.indexOf("living_entity_flags") ?? -1;
  const enemy = {
    id: 2,
    name: "player",
    username: "Enemy",
    type: "player",
    position: new Vec3(2.5, 64, 0.5),
    velocity: new Vec3(0, 0, 0),
    width: 0.6,
    height: 1.8,
    isValid: true,
    yaw: Math.PI / 2,
    pitch: 0,
    equipment: Array(6).fill(null),
    metadata: [],
  };
  bot.entities[2] = enemy;
  return { rig, world, bot, packets, equips, item, enemy, flagsIndex };
}

test("mace combat disables a shield before resuming wind jumps", async () => {
  const f = fixture("26.1.2");
  const { bot, enemy, packets } = f;
  f.item(36, "mace");
  f.item(37, "wind_charge");
  f.item(38, "diamond_axe");
  f.item(39, "diamond_sword");
  f.item(45, "shield");
  enemy.equipment[1] = { name: "shield" };
  enemy.metadata[f.flagsIndex] = 3;
  let time = 0;
  const errors = [];
  const controller = createCombatController(
    bot,
    {
      weapon: "mace",
      style: "melee",
      reactionMs: 0,
      meleeSkill: 100,
      smoothAim: false,
      strafe: "off",
      sprintTap: "off",
      criticals: "off",
      maceDefense: false,
      shieldBreak: true,
    },
    { now: () => time, onError: (error) => errors.push(error) },
  );
  try {
    controller.select(enemy);
    for (let tick = 0; tick < 40; tick++) {
      bot.physics
        .simulatePlayer(new PlayerState(bot, bot.controlState), { getBlock: bot.blockAt })
        .apply(bot);
      bot.emit("physicsTick");
      await controller.idleTask;
      await flush();
      time += 50;
    }
    const hits = packets.filter((packet) => packet.name === "attack");
    assert.ok(hits.length > 0, "mode selection retains the shield-disable sequence");
    assert.ok(hits.every((hit) => hit.held === "diamond_axe"));
    assert.equal(hits[0].onGround, true, "the fast disable does not need a wind jump or crit");
    enemy.metadata[f.flagsIndex] = 0;
    for (let tick = 0; tick < 20; tick++) {
      bot.physics
        .simulatePlayer(new PlayerState(bot, bot.controlState), { getBlock: bot.blockAt })
        .apply(bot);
      bot.emit("physicsTick");
      await controller.idleTask;
      await flush();
      time += 50;
      if (packets.some((packet) => packet.name === "use_item" && packet.held === "wind_charge"))
        break;
    }
    assert.match(controller.status, /^mace /);
    assert.ok(
      packets.some((packet) => packet.name === "use_item" && packet.held === "wind_charge"),
    );
    assert.deepEqual(errors, []);
  } finally {
    controller.dispose();
    f.rig.stopPassivePhysics();
  }
});

for (const version of ["1.20.4", "26.1.2"]) {
  test(
    `default shield/axe combat stays focused and follows a fast disable with a charged sword on ${version}`,
    { timeout: 5000 },
    async () => {
      const f = fixture(version),
        { bot, enemy, packets } = f;
      f.item(36, "diamond_sword");
      f.item(37, "diamond_axe");
      f.item(45, "shield");
      enemy.position.set(0.51, 64, 2.5);
      enemy.equipment[1] = { name: "shield" };
      enemy.metadata[f.flagsIndex] = 3;
      let time = 0,
        routes = 0;
      bot.pathfinder.goto = () => {
        routes++;
        return new Promise(() => {});
      };
      const errors = [],
        frames = [];
      const controller = createCombatController(
        bot,
        {
          style: "melee",
          reactionMs: 0,
          meleeSkill: 100,
          maceDefense: false,
        },
        { now: () => time, onError: (error) => errors.push(error) },
      );
      try {
        await bot.look(Math.PI - 0.02, 0, true);
        controller.select(enemy);
        for (let tick = 0; tick < 55; tick++) {
          time = tick * 50;
          bot.defenseTestTick = tick;
          enemy.position.x = 0.5 + Math.sin(tick * 0.35) * 0.06;
          if (
            packets.some(
              (p) =>
                (p.held === "diamond_axe" && p.name === "attack") ||
                (p.held === "diamond_axe" && p.name === "use_entity" && p.params.mouse === 1),
            )
          )
            enemy.metadata[f.flagsIndex] = 0;
          bot.physics
            .simulatePlayer(new PlayerState(bot, bot.controlState), { getBlock: bot.blockAt })
            .apply(bot);
          bot.emit("physicsTick");
          await controller.idleTask;
          await flush();
          frames.push({
            yaw: bot.entity.yaw,
            airborne: !bot.entity.onGround,
            left: bot.getControlState("left"),
            right: bot.getControlState("right"),
            axe: bot.launcherAxeAttacking,
          });
        }
        const hits = packets.filter(
          (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
        );
        const axeHits = hits.filter((p) => p.held === "diamond_axe");
        assert.equal(
          axeHits.length,
          1,
          "the first server-confirmed shield break completes the axe cycle",
        );
        assert.equal(hits[0], axeHits[0], "do not waste a sword hit against the shield");
        assert.equal(axeHits[0].onGround, true, "disable without a critical jump");
        assert.equal(
          axeHits[0].aimHit,
          true,
          "the actual view ray hits the enemy at attack publication",
        );
        assert.equal(axeHits[0].usingItem, false, "release our shield before striking");
        assert.ok(
          axeHits[0].tick <= 4,
          `disable before a full axe charge, tick=${axeHits[0].tick}`,
        );
        assert.equal(
          frames.some((frame) => frame.axe && (frame.left || frame.right)),
          false,
        );
        assert.equal(
          frames.some((frame) => frame.axe && frame.airborne),
          false,
        );
        assert.equal(routes, 0, "the close-range disable does not start pathfinding");
        for (let tick = 1; tick < frames.length; tick++) {
          if (tick > axeHits[0].tick) break;
          assert.ok(
            Math.abs(frames[tick].yaw - frames[tick - 1].yaw) < 0.2,
            "no seam snap or full spin",
          );
        }
        assert.ok(
          hits.some((p) => p.held === "diamond_sword"),
          "resume sword attacks after the shield drops",
        );
        const restored = f.equips.find(
          (equip) => equip.held === "diamond_sword" && equip.tick > axeHits[0].tick,
        );
        const swordHit = hits.find((hit) => hit.held === "diamond_sword");
        assert.equal(restored.tick, axeHits[0].tick + 1, "swap back on the next observed tick");
        assert.ok(
          swordHit.tick - restored.tick >= 13 && swordHit.tick - restored.tick <= 14,
          "charge the sword without inheriting the axe cooldown",
        );
        assert.deepEqual(errors, []);
      } finally {
        controller.dispose();
        f.rig.stopPassivePhysics();
      }
    },
  );

  test(
    `holding our shield keeps focus and cancels cleanly without a delayed re-raise on ${version}`,
    { timeout: 5000 },
    async () => {
      const f = fixture(version),
        { bot, enemy, packets } = f;
      f.item(36, "diamond_sword");
      f.item(45, "shield");
      enemy.equipment[1] = { name: "shield" };
      enemy.metadata[f.flagsIndex] = 3;
      const errors = [];
      let time = 0;
      const controller = createCombatController(
        bot,
        {
          style: "melee",
          reactionMs: 0,
          meleeSkill: 100,
          shieldBreak: false,
        },
        { now: () => time, onError: (error) => errors.push(error) },
      );
      try {
        controller.select(enemy);
        for (let tick = 0; tick < 25; tick++) {
          time = tick * 50;
          bot.physics
            .simulatePlayer(new PlayerState(bot, bot.controlState), { getBlock: bot.blockAt })
            .apply(bot);
          bot.emit("physicsTick");
          await controller.idleTask;
          await flush();
          if (tick > 4) {
            assert.equal(bot.usingHeldItem, true);
            assert.equal(bot.getControlState("left") || bot.getControlState("right"), false);
            assert.equal(
              bot.entity.onGround,
              true,
              "wait behind the shield without critical jumps",
            );
            assert.ok(
              Math.abs(
                Math.atan2(
                  Math.sin(bot.entity.yaw + Math.PI / 2),
                  Math.cos(bot.entity.yaw + Math.PI / 2),
                ),
              ) < 0.03,
            );
          }
        }
        assert.equal(
          packets.some(
            (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
          ),
          false,
        );
        assert.equal(
          packets.filter((p) => p.name === "use_item" && p.params.hand === 1).length,
          1,
          "hold the shield instead of toggling every tick",
        );
        enemy.metadata[f.flagsIndex] = 0;
        bot.emit("physicsTick");
        await controller.idleTask;
        await flush();
        assert.ok(
          packets.some(
            (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
          ),
        );
        controller.stop();
        const stopped = packets.length;
        await new Promise((resolve) => setTimeout(resolve, 180));
        bot.emit("physicsTick");
        await flush();
        assert.equal(bot.usingHeldItem, false);
        assert.equal(
          packets.slice(stopped).some((p) => p.name === "use_item"),
          false,
        );
        assert.deepEqual(errors, []);
      } finally {
        controller.dispose();
        f.rig.stopPassivePhysics();
      }
    },
  );

  test(`shield survives bow release, delayed arrow updates and actual impact on ${version}`, async () => {
    const f = fixture(version),
      { bot, enemy, packets } = f;
    f.item(45, "shield");
    enemy.position.x = 30.5;
    enemy.heldItem = { name: "bow" };
    enemy.metadata[f.flagsIndex] = 1;
    let time = 0;
    const defense = createBowDefense(
      bot,
      normalizeCombat({ bowDefense: true, bowDefenseHoldMs: 100, bowDefenseCheckMs: 500 }),
      { now: () => time },
    );
    async function tick(value) {
      time = value;
      defense.tick(true, true);
      await defense.task;
    }
    try {
      await tick(0);
      assert.equal(bot.launcherDefendingBow, true);
      enemy.metadata[f.flagsIndex] = 0;
      time = 50;
      bot.emit("entityUpdate", enemy);
      await defense.task;
      await tick(400);
      assert.equal(bot.launcherDefendingBow, true, "release does not clear a shot still in flight");
      assert.equal(
        packets.some((p) => p.name === "block_dig"),
        false,
      );
      const arrow = {
        id: 3,
        name: "arrow",
        position: new Vec3(6.5, 65.5, 0.5),
        velocity: new Vec3(0, 0, 0),
        isValid: true,
      };
      bot.entities[3] = arrow;
      time = 450;
      bot.emit("entitySpawn", arrow);
      await defense.task;
      await tick(500);
      assert.equal(
        bot.launcherDefendingBow,
        true,
        "zero spawn velocity does not create a defense gap",
      );
      // The Mineflayer listener updates velocity before our packet callback.
      time = 550;
      bot._client.emit("entity_velocity", { entityId: 3, velocity: { x: -16000, y: 0, z: 0 } });
      await defense.task;
      assert.equal(defense.threat.id, 3, "tracks the released arrow rather than the archer");
      for (let i = 0; i < 3; i++) {
        time += 50;
        arrow.position.x -= 2;
        arrow.position.y -= i * 0.05;
        bot.emit("entityMoved", arrow);
        await defense.task;
        assert.equal(bot.launcherDefendingBow, true);
      }
      bot.emit("entityGone", arrow);
      delete bot.entities[3];
      await defense.task;
      const impactAt = time;
      await tick(impactAt + 50);
      assert.equal(bot.launcherDefendingBow, true, "impact grace keeps the shield raised");
      await tick(impactAt + 150);
      assert.equal(bot.launcherDefendingBow, false);
      assert.equal(packets.filter((p) => p.name === "block_dig").length, 1);
      await tick(impactAt + 500);
      assert.equal(bot.launcherDefendingBow, false, "gone arrows cannot keep renewing the hold");
    } finally {
      defense.dispose();
      f.rig.stopPassivePhysics();
    }
  });

  test(`lowering the enemy shield cancels the axe setup and charges the restored sword on ${version}`, async () => {
    const f = fixture(version),
      { bot, enemy, packets } = f;
    f.item(36, "diamond_sword");
    f.item(37, "diamond_axe");
    f.item(45, "shield");
    enemy.equipment[1] = { name: "shield" };
    enemy.metadata[f.flagsIndex] = 3;
    const equip = bot.equip;
    bot.equip = async (entry, hand) => {
      await equip(entry, hand);
      if (entry.name === "diamond_axe") enemy.metadata[f.flagsIndex] = 0;
    };
    let time = 0;
    const errors = [];
    const controller = createCombatController(
      bot,
      {
        style: "melee",
        reactionMs: 0,
        meleeSkill: 100,
        criticals: "off",
      },
      { now: () => time, onError: (error) => errors.push(error) },
    );
    try {
      controller.select(enemy);
      for (let tick = 0; tick < 35; tick++) {
        time = tick * 50;
        bot.defenseTestTick = tick;
        bot.physics
          .simulatePlayer(new PlayerState(bot, bot.controlState), { getBlock: bot.blockAt })
          .apply(bot);
        bot.emit("physicsTick");
        await controller.idleTask;
        await flush();
      }
      const hits = packets.filter(
        (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
      );
      assert.ok(hits.length > 0);
      assert.ok(hits.every((hit) => hit.held === "diamond_sword"));
      const restored = f.equips.find((entry) => entry.held === "diamond_sword" && entry.tick > 0);
      assert.ok(hits[0].tick - restored.tick >= 13, "charge the sword after its equip");
      assert.equal(hits[0].usingItem, false);
      assert.equal(hits[0].aimHit, true);
      assert.deepEqual(errors, []);
    } finally {
      controller.dispose();
      f.rig.stopPassivePhysics();
    }
  });

  test(`arrow movement replaces stale launch velocity and missing updates time out on ${version}`, async () => {
    const f = fixture(version),
      { bot } = f;
    f.item(45, "shield");
    delete bot.entities[2];
    const arrow = {
      id: 3,
      name: "spectral_arrow",
      position: new Vec3(7.5, 67.8, 0.5),
      velocity: new Vec3(-2, 1, 0),
      isValid: true,
    };
    bot.entities[3] = arrow;
    let time = 0;
    const defense = createBowDefense(
      bot,
      normalizeCombat({ bowDefense: true, bowDefenseHoldMs: 100, bowDefenseCheckMs: 0 }),
      { now: () => time },
    );
    try {
      defense.tick(true);
      await defense.task;
      assert.equal(
        Boolean(bot.launcherDefendingBow),
        false,
        "stale upward velocity initially misses",
      );
      time = 50;
      arrow.position = new Vec3(5.5, 67, 0.5);
      bot.emit("entityMoved", arrow);
      await defense.task;
      assert.equal(bot.launcherDefendingBow, true, "observed falling trajectory hits the bot");
      for (time = 100; time <= 1500; time += 50) {
        defense.tick(true);
        await defense.task;
      }
      assert.equal(bot.launcherDefendingBow, false, "stale entity has a bounded flight hold");
    } finally {
      defense.dispose();
      f.rig.stopPassivePhysics();
    }
  });

  for (const { ping, delay, cps } of [
    { ping: 50, delay: 4, cps: 20 },
    { ping: 600, delay: 10, cps: 1 },
  ]) {
    test(`shield confirmation waits ${delay} ticks at ping=${ping}, cps=${cps} on ${version}`, async () => {
      const f = fixture(version),
        { bot, enemy, packets } = f;
      f.item(36, "diamond_sword");
      f.item(37, "diamond_axe");
      f.item(45, "shield");
      bot.player = { ping };
      enemy.equipment[1] = { name: "shield" };
      enemy.metadata[f.flagsIndex] = 0;
      let tick = 0;
      const errors = [];
      const controller = createCombatController(
        bot,
        { style: "melee", criticals: "off", smoothAim: false, strafe: "off", cps },
        { now: () => tick * 50, onError: (error) => errors.push(error) },
      );
      try {
        controller.select(enemy);
        for (; tick < 65; tick++) {
          bot.defenseTestTick = tick;
          const first = packets.find(
            (p) =>
              p.held === "diamond_axe" &&
              (p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1)),
          );
          if (first && tick >= first.tick + delay) enemy.metadata[f.flagsIndex] = 0;
          else if (packets.some((p) => p.held === "diamond_sword" && p.aimHit))
            enemy.metadata[f.flagsIndex] = 3;
          bot.physics
            .simulatePlayer(new PlayerState(bot, bot.controlState), { getBlock: bot.blockAt })
            .apply(bot);
          bot.emit("physicsTick");
          await controller.idleTask;
          await flush();
        }
        const hits = packets.filter(
          (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
        );
        const axeHits = hits.filter((hit) => hit.held === "diamond_axe");
        assert.equal(axeHits.length, 1, "no duplicate disable during delayed confirmation");
        assert.ok(
          axeHits[0].tick - hits[0].tick >= Math.ceil(20 / cps),
          "the quick disable also respects the CPS limit after a sword hit",
        );
        const restored = f.equips.find(
          (entry) => entry.held === "diamond_sword" && entry.tick > axeHits[0].tick,
        );
        assert.equal(restored.tick, axeHits[0].tick + delay);
        const swordHits = hits.filter(
          (hit) => hit.held === "diamond_sword" && hit.tick > restored.tick,
        );
        assert.ok(swordHits.length > 0);
        const interval = Math.max(13, Math.ceil(20 / cps));
        assert.ok(swordHits[0].tick - restored.tick >= interval);
        for (let index = 1; index < swordHits.length; index++)
          assert.ok(swordHits[index].tick - swordHits[index - 1].tick >= interval);
        assert.deepEqual(errors, []);
      } finally {
        controller.dispose();
        f.rig.stopPassivePhysics();
      }
    });
  }

  for (const change of ["shield lowered", "out of reach", "occluded"]) {
    test(`fast disable rechecks ${change} after turning on ${version}`, async () => {
      const f = fixture(version),
        { bot, enemy, packets, world } = f;
      f.item(36, "diamond_sword");
      f.item(37, "diamond_axe");
      f.item(45, "shield");
      enemy.equipment[1] = { name: "shield" };
      enemy.metadata[f.flagsIndex] = 3;
      const look = bot.look.bind(bot);
      let changed = false;
      bot.look = (...args) => {
        if (!changed && bot.heldItem?.name === "diamond_axe") {
          changed = true;
          if (change === "shield lowered") enemy.metadata[f.flagsIndex] = 0;
          else if (change === "out of reach") enemy.position.x = 8.5;
          else {
            world.setBlock(new Vec3(1, 64, 0), "stone");
            world.setBlock(new Vec3(1, 65, 0), "stone");
          }
        }
        return look(...args);
      };
      const errors = [];
      const controller = createCombatController(
        bot,
        { style: "melee", criticals: "off", smoothAim: false, strafe: "off" },
        { onError: (error) => errors.push(error) },
      );
      try {
        controller.select(enemy);
        for (let tick = 0; tick < 5; tick++) {
          bot.emit("physicsTick");
          await controller.idleTask;
          await flush();
        }
        assert.equal(changed, true);
        assert.equal(
          packets.some(
            (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
          ),
          false,
          "a changed target cannot receive the queued uncharged axe hit",
        );
        assert.deepEqual(errors, []);
      } finally {
        controller.dispose();
        f.rig.stopPassivePhysics();
      }
    });
  }

  for (const criticals of ["hop", "shorthop", "off"]) {
    test(`fast shield disables fall back to charged attacks if unconfirmed, criticals=${criticals} on ${version}`, async () => {
      const f = fixture(version),
        { bot, enemy, packets } = f;
      const axeName = criticals === "shorthop" ? "netherite_axe" : "diamond_axe";
      const weapon = criticals === "shorthop" ? "axe" : "sword";
      f.item(36, "diamond_sword");
      f.item(37, axeName);
      f.item(45, "shield");
      enemy.equipment[1] = { name: "shield" };
      enemy.metadata[f.flagsIndex] = 3;
      assert.equal(targetBlocking(bot, enemy), true);
      enemy.metadata[f.flagsIndex] = 2;
      assert.equal(
        targetBlocking(bot, enemy),
        false,
        "offhand flag without using item is not blocking",
      );
      enemy.metadata[f.flagsIndex] = 3;
      let time = 0;
      const errors = [];
      const controller = createCombatController(
        bot,
        {
          style: "melee",
          reactionMs: 0,
          meleeSkill: 100,
          smoothAim: false,
          strafe: "off",
          sprintTap: "off",
          criticals,
          weapon,
        },
        { now: () => time, onError: (error) => errors.push(error) },
      );
      try {
        controller.select(enemy);
        for (let i = 0; i < 65; i++) {
          bot.defenseTestTick = i;
          bot.physics
            .simulatePlayer(new PlayerState(bot, bot.controlState), { getBlock: bot.blockAt })
            .apply(bot);
          bot.emit("physicsTick");
          await controller.idleTask;
          await bot.swordpvp.launcherShieldBreak.task;
          await flush();
          time += 50;
        }
        assert.deepEqual(errors, []);
        const hits = packets.filter(
          (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
        );
        assert.ok(hits.length >= 3, "unconfirmed disables eventually use charged attacks");
        assert.ok(
          hits.every((p) => p.held === axeName),
          `all shield attacks use the axe: ${JSON.stringify(hits)}`,
        );
        assert.ok(hits[0].tick <= 4, `first disable tick=${hits[0].tick}`);
        assert.ok(hits[1].tick - hits[0].tick < 20, "one bounded quick retry before fallback");
        assert.ok(
          hits.slice(0, 2).every((hit) => hit.onGround),
          "quick attempts do not jump",
        );
        for (let i = 2; i < hits.length; i++)
          assert.ok(hits[i].tick - hits[i - 1].tick >= 20, "respects the real axe attack cooldown");
        for (const hit of hits.slice(2)) {
          assert.equal(hit.sprint, false);
          assert.equal(hit.onGround, false, "the charged server-rule fallback uses criticals");
          assert.ok(hit.vy < 0, "attack lands while falling");
        }
        enemy.metadata[f.flagsIndex] = 0;
        for (let tick = 0; tick < 20 && !bot.entity.onGround; tick++) {
          bot.physics
            .simulatePlayer(new PlayerState(bot, bot.controlState), { getBlock: bot.blockAt })
            .apply(bot);
          bot.emit("physicsTick");
          await controller.idleTask;
          await flush();
          time += 50;
        }
        bot.emit("physicsTick");
        await bot.swordpvp.launcherShieldBreak.task;
        assert.equal(
          bot.heldItem.name,
          weapon === "axe" ? axeName : "diamond_sword",
          "restores the preferred weapon",
        );
        controller.stop();
        assert.equal(bot.launcherBreakingShield, false);
        const stoppedHits = packets.filter(
          (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
        ).length;
        for (let i = 0; i < 15; i++) {
          bot.emit("physicsTick");
          await flush();
        }
        assert.equal(
          packets.filter(
            (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
          ).length,
          stoppedHits,
          "stop prevents pending axe attacks",
        );
      } finally {
        controller.dispose();
        f.rig.stopPassivePhysics();
      }
    });
  }
  for (const variant of [
    { onlyAxe: true, weapon: "sword", criticals: "off", shieldBreak: false },
    { onlyAxe: true, weapon: "sword", criticals: "off", shieldBreak: true },
    { onlyAxe: false, weapon: "axe", criticals: "hop", shieldBreak: false },
    { onlyAxe: false, weapon: "axe", criticals: "off", shieldBreak: false },
    { onlyAxe: false, weapon: "sword", criticals: "off", shieldBreak: false },
  ]) {
    test(`ordinary axe combat and weapon fallback on ${version}: ${JSON.stringify(variant)}`, async () => {
      const f = fixture(version),
        { bot, enemy, packets } = f;
      const axeName = "netherite_axe";
      f.item(36, "bow");
      f.item(37, axeName);
      f.item(45, "shield");
      if (!variant.onlyAxe) f.item(38, "diamond_sword");
      if (variant.shieldBreak) {
        enemy.equipment[1] = { name: "shield" };
        enemy.metadata[f.flagsIndex] = 3;
      }
      const errors = [],
        reasons = [];
      let time = 0;
      const controller = createCombatController(
        bot,
        {
          ...variant,
          style: "melee",
          reactionMs: 0,
          meleeSkill: 100,
          smoothAim: false,
          strafe: "off",
          sprintTap: "off",
        },
        { now: () => time, onError: (error) => errors.push(error) },
      );
      const attacked = (_entity, reason) => {
        reasons.push(reason);
        if (variant.shieldBreak) enemy.metadata[f.flagsIndex] = 0;
      };
      bot.swordpvp.on("attackedTarget", attacked);
      try {
        controller.select(enemy);
        for (let i = 0; i < 100; i++) {
          bot.defenseTestTick = i;
          bot.physics
            .simulatePlayer(new PlayerState(bot, bot.controlState), { getBlock: bot.blockAt })
            .apply(bot);
          bot.emit("physicsTick");
          await controller.idleTask;
          await flush();
          time += 50;
        }
        assert.deepEqual(errors, []);
        const hits = packets.filter(
          (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
        );
        assert.ok(
          hits.length >= 3,
          "continues fighting rather than making just one critical attack",
        );
        const axe = variant.onlyAxe || variant.weapon === "axe";
        assert.ok(
          hits.every((hit) => hit.held === (axe ? axeName : "diamond_sword")),
          "equips the available melee weapon even when initially holding a bow",
        );
        const critical = variant.onlyAxe || variant.criticals !== "off";
        if (critical) {
          const chargedHits = variant.shieldBreak ? hits.slice(1) : hits;
          assert.ok(
            chargedHits.every((hit) => !hit.onGround && hit.vy < 0 && !hit.sprint),
            "ordinary axe strikes are falling hits without sprint",
          );
          if (variant.shieldBreak)
            assert.ok(hits[0].tick <= 4 && hits[0].onGround, "fast initial shield disable");
          else assert.ok(hits[0].tick >= 20, "initial axe strike is charged");
          for (let i = 1; i < hits.length; i++)
            assert.ok(hits[i].tick - hits[i - 1].tick >= 20, "each axe strike respects cooldown");
          if (variant.shieldBreak) {
            assert.equal(reasons[0], "disableshield");
            assert.ok(
              reasons.slice(1).every((reason) => reason === "axecritical"),
              "continues critical axe attacks after the shield is lowered",
            );
          } else assert.ok(reasons.every((reason) => reason === "axecritical"));
        } else {
          assert.ok(
            hits.some((hit) => hit.onGround),
            "mixed inventory respects criticals off in ordinary combat",
          );
          assert.ok(reasons.every((reason) => reason === "normal"));
        }
        controller.stop();
        assert.equal(bot.launcherAxeAttacking, false);
        const count = hits.length;
        for (let i = 0; i < 15; i++) {
          bot.emit("physicsTick");
          await controller.idleTask;
        }
        assert.equal(
          packets.filter(
            (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
          ).length,
          count,
        );
      } finally {
        bot.swordpvp.off("attackedTarget", attacked);
        controller.dispose();
        f.rig.stopPassivePhysics();
      }
    });
  }
  for (const cancellation of ["stop", "target loss", "bow defense", "survival", "death"]) {
    test(`shield-break equip is cancelled by ${cancellation} on ${version}`, async () => {
      const f = fixture(version),
        { bot, enemy, packets } = f;
      f.item(36, "diamond_sword");
      f.item(37, "diamond_axe");
      f.item(45, "shield");
      enemy.equipment[1] = { name: "shield" };
      enemy.metadata[f.flagsIndex] = 3;
      let finish;
      const equip = bot.equip;
      bot.equip = async (entry, hand) => {
        if (entry.name === "diamond_axe")
          await new Promise((resolve) => {
            finish = resolve;
          });
        await equip(entry, hand);
      };
      const errors = [];
      const controller = createCombatController(
        bot,
        { style: "melee", reactionMs: 0, meleeSkill: 100, smoothAim: false, bowDefense: true },
        { onError: (error) => errors.push(error) },
      );
      try {
        controller.select(enemy);
        bot.emit("physicsTick");
        await controller.idleTask;
        bot.emit("physicsTick");
        await flush();
        assert.equal(typeof finish, "function", "axe equip is pending");
        if (cancellation === "stop") controller.stop();
        else if (cancellation === "target loss") bot.emit("entityGone", enemy);
        else if (cancellation === "survival") bot.launcherSurvival = { busy: true };
        else if (cancellation === "death") {
          bot.health = 0;
          bot.emit("death");
        } else {
          const archer = {
            ...enemy,
            id: 4,
            position: new Vec3(10.5, 64, 0.5),
            metadata: [],
            equipment: [],
            heldItem: { name: "bow" },
          };
          archer.metadata[f.flagsIndex] = 1;
          bot.entities[4] = archer;
          bot.emit("entityUpdate", archer);
        }
        finish();
        await controller.idleTask;
        for (let i = 0; i < 20; i++) {
          bot.emit("physicsTick");
          await controller.idleTask;
        }
        assert.equal(bot.launcherBreakingShield, false);
        assert.equal(
          packets.some(
            (p) => p.name === "attack" || (p.name === "use_entity" && p.params.mouse === 1),
          ),
          false,
        );
        if (cancellation === "bow defense") assert.equal(bot.launcherDefendingBow, true);
        assert.deepEqual(errors, []);
      } finally {
        controller.dispose();
        f.rig.stopPassivePhysics();
      }
    });
  }
}

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(`ArmorManager equips armour on spawn/pickup, serializes swaps and preserves the offhand on ${version}`, async () => {
    const f = fixture(version),
      { bot } = f;
    f.item(36, "diamond_sword");
    const helmet = f.item(10, "diamond_helmet");
    f.item(11, "iron_chestplate");
    f.item(12, "diamond_chestplate");
    const shield = version === "1.8.8" ? null : f.item(45, "shield");
    if (shield) f.item(13, "totem_of_undying");
    const errors = [];
    const armor = installArmorManager(bot, (error) => errors.push(error));
    try {
      await armor.task;
      assert.equal(bot.inventory.slots[5], helmet);
      assert.equal(bot.inventory.slots[6].name, "diamond_chestplate");
      if (shield) assert.equal(bot.inventory.slots[45], shield);
      const pickup = f.item(14, "diamond_boots");
      bot.emit("playerCollect", { username: bot.username }, { getDroppedItem: () => pickup });
      await new Promise((resolve) => setTimeout(resolve, 130));
      assert.equal(bot.inventory.slots[8], pickup, "published plugin handles armour pickup");
      const respawnHelmet = f.item(15, "diamond_helmet");
      bot.inventory.slots[5] = null;
      bot.emit("spawn");
      await armor.task;
      assert.equal(bot.inventory.slots[5], respawnHelmet);
      let finish,
        equipping = 0,
        peak = 0;
      const originalEquip = bot.equip;
      bot.equip = async (...args) => {
        equipping++;
        peak = Math.max(peak, equipping);
        if (args[1] === "hand")
          await new Promise((resolve) => {
            finish = resolve;
          });
        await originalEquip(...args);
        equipping--;
      };
      const axe = f.item(16, "diamond_axe");
      const weaponTask = equipCombatItem(bot, axe, "hand");
      await flush();
      bot.inventory.slots[7] = null;
      f.item(17, "diamond_leggings");
      const armorTask = bot.armorManager.equipAll();
      await flush();
      finish();
      await Promise.all([weaponTask, armorTask]);
      assert.equal(peak, 1, "armour and combat share one inventory queue");
      assert.deepEqual(errors, []);
      armor.dispose();
      assert.equal(bot.listenerCount("playerCollect"), 0);
    } finally {
      armor.dispose();
      f.rig.stopPassivePhysics();
    }
  });
}
