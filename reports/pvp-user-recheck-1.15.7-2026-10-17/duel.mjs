import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";

// Simulated melee duels: real Mineflayer player physics, Custom PvP, the
// launcher navigator and versioned packet serialization. The opponent is a
// scripted entity. A small vanilla server model scores every serialized attack
// (attack strength, critical/sprint state, shield delay, invulnerability and
// knockback). There is no network latency; the bot reports a 50 ms ping.
// SCREEN_COMBAT_RUNTIME points at another source snapshot for comparisons.
const extensionUrl = new URL("../../extensions/mineflayer-bot/package.json", import.meta.url);
const require = createRequire(extensionUrl);
const runtime = process.env.SCREEN_COMBAT_RUNTIME
  ? createRequire(path.resolve(process.env.SCREEN_COMBAT_RUNTIME, "package.json"))
  : require;
const combat = runtime("./combat.cjs");
const worker = runtime("./worker.cjs");
const { Vec3 } = require("vec3");
const mf = createRequire(runtime.resolve("mineflayer"));
const { PlayerState } = mf("prismarine-physics");
const protocol = mf("minecraft-protocol");
const rigRequire = createRequire(new URL("./pathfinding/package.json", extensionUrl));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", extensionUrl)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const flush = () => new Promise((resolve) => setImmediate(resolve));

const SPRINT = 0.2806; // vanilla ground sprint speed, blocks per tick
const WALK = 0.2158;
const SWORD_DAMAGE = 7; // diamond sword, no armour
const PING = 50; // reported round trip; shields block after 5 ticks (200 ms + sync)
const profiles = {
  default: {},
  aggressive: {
    adaptiveCombat: true,
    combatHealing: true,
    pearlEscape: true,
    pearlEnabled: true,
    crystalEnabled: true,
    style: "auto",
    engine: "custom",
    reactionMs: 0,
    meleeSkill: 100,
    cps: 20,
    smoothAimSpeed: 175,
    strafe: "intelligent",
    criticals: "hop",
    sprintTap: "sprintcancel",
    shield: true,
    shieldBreak: true,
  },
};

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const headingVector = (yaw, speed) => new Vec3(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed);

// Opponent scripts. `move` returns the intended horizontal displacement for
// this tick; knockback and gravity are applied by the duel model.
const scenarios = {
  cadence: {
    title: "Standing opponent in reach, takes full knockback",
    ticks: 200,
    start: new Vec3(3.1, 64, 0.5),
    move: () => new Vec3(0, 0, 0),
  },
  wall: {
    title: "Opponent pinned against a wall (no knockback travel)",
    ticks: 200,
    start: new Vec3(3.65, 64, 0.5),
    setup: ({ world }) => {
      for (let z = -3; z <= 3; z++)
        for (const y of [64, 65, 66]) world.setBlock(new Vec3(4, y, z), "stone");
    },
    move: ({ enemy, bot }) => {
      enemy.yaw = yawTo(enemy.position, bot.entity.position);
      return new Vec3(0, 0, 0);
    },
  },
  approach: {
    title: "Standing opponent 12 blocks away",
    ticks: 120,
    start: new Vec3(12.5, 64, 0.5),
    move: () => new Vec3(0, 0, 0),
  },
  runner: {
    title: "Opponent sprints away from 5 blocks",
    ticks: 200,
    start: new Vec3(5.5, 64, 0.5),
    move: ({ enemy }) => {
      enemy.yaw = -Math.PI / 2;
      return new Vec3(SPRINT, 0, 0);
    },
  },
  zigzag: {
    title: "Opponent zigzags away (sprint, ±55° every 0.75 s)",
    ticks: 200,
    start: new Vec3(4.5, 64, 0.5),
    move: ({ tick, enemy }) => {
      const angle = (Math.floor(tick / 15) % 2 ? 1 : -1) * 0.96;
      enemy.yaw = -Math.PI / 2 + angle;
      return headingVector(enemy.yaw, SPRINT);
    },
  },
  strafer: {
    title: "Opponent circle-strafes at 3 blocks",
    ticks: 200,
    start: new Vec3(3.3, 64, 0.5),
    move: ({ tick, enemy, bot }) => {
      // Sprint sideways around the bot, reverse every 1.2 s, hold 3.2 blocks.
      const away = enemy.position.minus(bot.entity.position);
      const length = Math.hypot(away.x, away.z) || 1;
      const side = Math.floor(tick / 24) % 2 ? 1 : -1;
      const radial = Math.max(-0.12, Math.min(0.12, 3.2 - length));
      enemy.yaw = yawTo(enemy.position, bot.entity.position);
      return new Vec3(
        ((-away.z * side) / length) * SPRINT * 0.8 + (away.x / length) * radial,
        0,
        ((away.x * side) / length) * SPRINT * 0.8 + (away.z / length) * radial,
      );
    },
  },
  shield: {
    title: "Shield user: up 16 ticks, lowers 4 ticks to swing",
    ticks: 300,
    start: new Vec3(3.1, 64, 0.5),
    shield: true,
    move: ({ tick, enemy, bot, setUsing, emit }) => {
      enemy.yaw = yawTo(enemy.position, bot.entity.position);
      const phase = tick % 20;
      if (phase === 0) setUsing("shield");
      if (phase === 16) setUsing(null);
      if (phase === 17) emit("entitySwingArm", enemy);
      return new Vec3(0, 0, 0);
    },
  },
  shieldLate: {
    title: "Shield raised 1 tick before the bot's hit is ready, held 0.6 s",
    ticks: 300,
    start: new Vec3(3.1, 64, 0.5),
    shield: true,
    move: ({ tick, enemy, bot, setUsing, emit, lastAttack, shieldSince }) => {
      enemy.yaw = yawTo(enemy.position, bot.entity.position);
      if (shieldSince === null && tick - lastAttack === 12) setUsing("shield");
      else if (shieldSince !== null && tick - shieldSince >= 12) {
        setUsing(null);
        emit("entitySwingArm", enemy);
      }
      return new Vec3(0, 0, 0);
    },
  },
  eating: {
    title: "Opponent eats a golden apple 8 blocks away",
    ticks: 100,
    start: new Vec3(8.5, 64, 0.5),
    move: ({ tick, enemy, setUsing }) => {
      if (tick === 0) setUsing("golden_apple");
      if (tick === 32) setUsing(null);
      enemy.yaw = Math.PI / 2;
      // Item use slows to 20%; afterwards the opponent sprints away again.
      return new Vec3(tick < 32 ? WALK * 0.2 : SPRINT, 0, 0);
    },
  },
  pillar: {
    title: "Opponent on a 2-block pillar 4 blocks away",
    ticks: 120,
    start: new Vec3(4.5, 66, 0.5),
    setup: ({ world }) => {
      for (const y of [64, 65]) world.setBlock(new Vec3(4, y, 0), "stone");
    },
    move: ({ enemy, bot }) => {
      enemy.yaw = yawTo(enemy.position, bot.entity.position);
      return new Vec3(0, 0, 0);
    },
  },
};

export async function duel(version, profileName, scenarioName) {
  const scenario = scenarios[scenarioName];
  const random = seeded(0x5eed ^ scenarioName.length ^ (profileName.length << 8));
  const nativeRandom = Math.random;
  Math.random = random;
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), {
    renderDistance: 2,
  });
  const bot = rig.bot;
  bot.physicsEnabled = false;
  bot.health = 20;
  bot.food = 20;
  bot.supportFeature = bot.registry.supportFeature;
  bot.player = { username: bot.username, ping: PING };
  for (const plugin of ["entities", "time", "inventory", "simple_inventory"])
    bot.loadPlugin(runtime(`mineflayer/lib/plugins/${plugin}`), { hideErrors: false });
  bot.setQuickBarSlot(0);
  const Item = mf("prismarine-item")(bot.registry);
  for (const [slot, name] of [
    [36, "diamond_sword"],
    [45, "shield"],
  ]) {
    const item = new Item(bot.registry.itemsByName[name].id, 1);
    item.slot = slot;
    bot.inventory.slots[slot] = item;
  }
  bot.equip = async (entry, destination) => {
    const from = entry.slot,
      to = bot.getEquipmentDestSlot(destination);
    const old = bot.inventory.slots[to];
    bot.inventory.slots[from] = old;
    if (old) old.slot = from;
    bot.inventory.slots[to] = entry;
    entry.slot = to;
  };
  const flagsIndex = bot.registry.entitiesByName.player.metadataKeys.indexOf("living_entity_flags");
  // Highest supporting block top under the opponent's hitbox.
  const groundAt = (position) => {
    let top = -Infinity;
    for (const [dx, dz] of [
      [-0.29, -0.29],
      [-0.29, 0.29],
      [0.29, -0.29],
      [0.29, 0.29],
    ])
      for (let y = Math.floor(position.y + 0.01); y >= Math.floor(position.y) - 6; y--) {
        const block = world.getBlock(new Vec3(position.x + dx, y, position.z + dz));
        if (block?.boundingBox === "block") {
          top = Math.max(top, y + 1);
          break;
        }
      }
    return top;
  };
  const enemy = {
    id: 2,
    name: "player",
    username: "Enemy",
    type: "player",
    isValid: true,
    width: 0.6,
    height: 1.8,
    position: scenario.start.clone(),
    velocity: new Vec3(0, 0, 0),
    yaw: Math.PI / 2,
    pitch: 0,
    onGround: true,
    metadata: [],
    equipment: Array(6).fill(null),
    heldItem: { name: "diamond_sword" },
  };
  enemy.equipment[0] = enemy.heldItem;
  if (scenario.shield) enemy.equipment[1] = { name: "shield" };
  bot.entities[enemy.id] = enemy;
  scenario.setup?.({ world, bot, enemy });

  let tick = -1;
  const server = {
    sprinting: false,
    lastAttack: -Infinity,
    lastHeld: null,
    switchedAt: -Infinity,
    hurtAt: -Infinity,
    lastDamage: 0,
    shieldSince: null,
    knockback: new Vec3(0, 0, 0),
    vy: 0,
  };
  const hits = [];
  const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
  bot._client.state = "play";
  bot._client.write = (name, params) => {
    serializer.createPacketBuffer({ name, params });
    if (name === "entity_action") {
      if ([3, "start_sprinting"].includes(params.actionId)) server.sprinting = true;
      if ([4, "stop_sprinting"].includes(params.actionId)) server.sprinting = false;
    }
    if (name === "attack" || (name === "use_entity" && params.mouse === 1)) score();
  };
  function score() {
    const eyes = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0);
    const box = {
      min: enemy.position.offset(-0.3, 0, -0.3),
      max: enemy.position.offset(0.3, 1.8, 0.3),
    };
    const dx = Math.max(box.min.x - eyes.x, 0, eyes.x - box.max.x);
    const dy = Math.max(box.min.y - eyes.y, 0, eyes.y - box.max.y);
    const dz = Math.max(box.min.z - eyes.z, 0, eyes.z - box.max.z);
    const reach = Math.hypot(dx, dy, dz);
    const ticker = tick - Math.max(server.lastAttack, server.switchedAt);
    const strength = Math.min(1, Math.max(0, (ticker + 0.5) / 12.5));
    server.lastAttack = tick;
    const charged = strength > 0.9;
    const sprintHit = charged && server.sprinting;
    const critical =
      charged && !bot.entity.onGround && bot.entity.velocity.y < 0 && !server.sprinting;
    const view = headingVector(enemy.yaw, 1);
    const toEnemy = enemy.position.minus(bot.entity.position);
    // The bot sees the raise one sync tick and half a round trip after it
    // started; its hit arrives another half round trip later. Vanilla blocks
    // once the shield has been used for 5 ticks, i.e. after the fourth tick.
    const blocked =
      server.shieldSince !== null &&
      (tick - server.shieldSince) * 50 + 50 + PING >= 200 &&
      toEnemy.x * view.x + toEnemy.z * view.z < 0;
    const hit = { tick, reach, strength, critical, sprintHit, blocked, damage: 0 };
    if (sprintHit) server.sprinting = false;
    if (reach <= 3.0001 && !blocked) {
      let damage = SWORD_DAMAGE * (0.2 + strength * strength * 0.8) * (critical ? 1.5 : 1);
      const invulnerable = tick - server.hurtAt < 10;
      if (invulnerable) damage = Math.max(0, damage - server.lastDamage);
      else {
        server.hurtAt = tick;
        server.lastDamage = damage;
      }
      hit.damage = damage;
      if (!invulnerable) {
        const yaw = bot.entity.yaw;
        const push = (strength) => {
          const length = Math.hypot(Math.sin(yaw), Math.cos(yaw));
          server.knockback = server.knockback
            .scaled(0.5)
            .plus(
              new Vec3(
                (-Math.sin(yaw) / length) * strength,
                0,
                (-Math.cos(yaw) / length) * strength,
              ),
            );
          if (enemy.onGround) server.vy = Math.min(0.4, server.vy / 2 + strength);
        };
        push(0.4);
        if (sprintHit) push(0.5);
        enemy.onGround = false;
      }
    }
    hits.push(hit);
  }
  function setUsing(item) {
    if (item === "shield") {
      enemy.metadata[flagsIndex] = 3;
      server.shieldSince = tick;
    } else if (item) {
      enemy.heldItem = { name: item };
      enemy.equipment[0] = enemy.heldItem;
      enemy.metadata[flagsIndex] = 1;
      server.shieldSince = null;
    } else {
      enemy.metadata[flagsIndex] = 0;
      enemy.heldItem = { name: "diamond_sword" };
      enemy.equipment[0] = enemy.heldItem;
      server.shieldSince = null;
    }
    bot.emit("entityUpdate", enemy);
  }

  // The worker's default movement settings.
  worker.configurePathfinder(bot, {
    allowSprinting: true,
    allowLowCeilingJumps: true,
    allowParkour: true,
    allowAirStrafe: false,
    canDig: false,
    maxDropDown: 3,
    allowWaterDrop: true,
    allowBucketWaterDrop: true,
  });
  const errors = [];
  let time = 0;
  const controller = combat.createCombatController(bot, profiles[profileName], {
    now: () => time,
    random,
    onError: (error) => errors.push(String(error?.stack ?? error)),
  });
  const cpu = [];
  const distances = [];
  let routedTicks = 0;
  try {
    controller.select(enemy);
    for (tick = 0; tick < scenario.ticks; tick++) {
      time += 50;
      // Opponent movement (packets arrive between ticks).
      const intent = scenario.move({
        tick,
        enemy,
        bot,
        setUsing,
        emit: (...args) => bot.emit(...args),
        lastAttack: server.lastAttack,
        shieldSince: server.shieldSince,
      });
      const airborne = !enemy.onGround;
      const before = enemy.position.clone();
      enemy.position = enemy.position
        .plus(intent.scaled(airborne ? 0.3 : 1))
        .plus(server.knockback);
      // Walls stop horizontal movement and knockback.
      const solid = (position) =>
        [0.1, 1.0, 1.7].some((dy) =>
          [
            [-0.3, -0.3],
            [-0.3, 0.3],
            [0.3, -0.3],
            [0.3, 0.3],
          ].some(
            ([dx, dz]) =>
              world.getBlock(new Vec3(position.x + dx, position.y + dy, position.z + dz))
                ?.boundingBox === "block",
          ),
        );
      if (solid(enemy.position)) {
        enemy.position = new Vec3(before.x, enemy.position.y, before.z);
        server.knockback = new Vec3(0, 0, 0);
      }
      enemy.position.y += server.vy;
      server.vy = (server.vy - 0.08) * 0.98;
      if (enemy.position.y > groundAt(enemy.position) + 1e-6) enemy.onGround = false;
      server.knockback = server.knockback.scaled(airborne ? 0.91 : 0.546);
      const ground = groundAt(enemy.position);
      if (enemy.position.y <= ground) {
        enemy.position.y = ground;
        server.vy = 0;
        enemy.onGround = true;
      }
      enemy.velocity = enemy.position.minus(before);
      if (!enemy.position.equals(before)) bot.emit("entityMoved", enemy);
      // Player physics, then the physics tick listeners (Mineflayer order).
      bot.physics.simulatePlayer(new PlayerState(bot, bot.controlState), world).apply(bot);
      const held = bot.heldItem?.name ?? null;
      if (held !== server.lastHeld) {
        if (server.lastHeld !== null) server.switchedAt = tick;
        server.lastHeld = held;
      }
      const started = performance.now();
      bot.emit("physicsTick");
      cpu.push(performance.now() - started);
      await flush();
      await flush();
      const delta = enemy.position.minus(bot.entity.position);
      distances.push(Math.hypot(delta.x, delta.z));
      if (bot.pathfinder.goal) routedTicks++;
      if (process.env.SCREEN_DUEL_TRACE === scenarioName) {
        const controls = ["forward", "back", "left", "right", "sprint", "jump"]
          .filter((key) => bot.controlState[key])
          .join("+");
        const last = hits.at(-1);
        console.log(
          `${String(tick).padStart(3)} d=${Math.hypot(delta.x, delta.z).toFixed(2)} y=${bot.entity.position.y.toFixed(2)}` +
            ` cd=${bot.swordpvp?.ticksToNextAttack} ${controls || "-"} use=${Boolean(bot.usingHeldItem)}` +
            ` goal=${Boolean(bot.pathfinder.goal)} ${controller.decision?.action ?? ""}` +
            `${last?.tick === tick ? ` HIT dmg=${last.damage.toFixed(1)} r=${last.reach.toFixed(2)}${last.critical ? " crit" : ""}${last.sprintHit ? " sprint" : ""}${last.blocked ? " blocked" : ""}` : ""}`,
        );
      }
    }
  } finally {
    controller.dispose();
    await bot.pathfinder.destroy?.();
    rig.stopPassivePhysics();
    Math.random = nativeRandom;
  }
  const landed = hits.filter((hit) => hit.damage > 0);
  const sorted = [...cpu].sort((a, b) => a - b);
  const quantile = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const intervals = landed.slice(1).map((hit, index) => (hit.tick - landed[index].tick) * 50);
  return {
    version,
    profile: profileName,
    scenario: scenarioName,
    seconds: (scenario.ticks * 50) / 1000,
    attacks: hits.length,
    landed: landed.length,
    blocked: hits.filter((hit) => hit.blocked).length,
    outOfReach: hits.filter((hit) => hit.reach > 3.0001).length,
    critical: landed.filter((hit) => hit.critical).length,
    sprintHits: landed.filter((hit) => hit.sprintHit).length,
    damage: Number(landed.reduce((total, hit) => total + hit.damage, 0).toFixed(2)),
    firstHitMs: landed.length ? (landed[0].tick + 1) * 50 : null,
    meanIntervalMs: intervals.length
      ? Number((intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1))
      : null,
    routedTicks,
    meanDistance: Number((distances.reduce((a, b) => a + b, 0) / distances.length).toFixed(3)),
    tickCpuMedianMs: Number(quantile(0.5).toFixed(4)),
    tickCpuP95Ms: Number(quantile(0.95).toFixed(4)),
    errors,
  };
}

export { profiles, scenarios };

// Run all scenarios when executed directly; tests import duel().
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = process.argv[2];
  const compare = process.argv[3];
  const versions = (process.env.SCREEN_DUEL_VERSIONS ?? "1.20.4,26.1.2").split(",");
  const only = process.env.SCREEN_DUEL_SCENARIOS?.split(",");
  const results = [];
  for (const version of versions)
    for (const profile of Object.keys(profiles))
      for (const scenario of Object.keys(scenarios)) {
        if (only && !only.includes(scenario)) continue;
        const result = await duel(version, profile, scenario);
        results.push(result);
        console.log(
          `${version} ${profile.padEnd(10)} ${scenario.padEnd(9)} landed ${String(result.landed).padStart(2)}` +
            ` dmg ${result.damage.toFixed(1).padStart(6)} first ${String(result.firstHitMs ?? "-").padStart(5)} ms` +
            ` crit ${result.critical} sprint ${result.sprintHits} blocked ${result.blocked}` +
            ` dist ${result.meanDistance.toFixed(2)} cpu ${result.tickCpuMedianMs} ms${result.errors.length ? ` errors ${result.errors.length}` : ""}`,
        );
      }
  const report = {
    date: new Date().toISOString(),
    node: process.version,
    cpu: cpus()[0]?.model,
    runtime: process.env.SCREEN_COMBAT_RUNTIME ?? ".",
    scenarios: Object.fromEntries(
      Object.entries(scenarios).map(([key, value]) => [
        key,
        { title: value.title, ticks: value.ticks },
      ]),
    ),
    results,
  };
  if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  if (compare) {
    const before = JSON.parse(readFileSync(compare, "utf8")).results;
    console.log(
      "\nscenario                        before → after (landed hits, damage, first hit)",
    );
    for (const result of results) {
      const old = before.find(
        (entry) =>
          entry.version === result.version &&
          entry.profile === result.profile &&
          entry.scenario === result.scenario,
      );
      if (!old) continue;
      console.log(
        `${result.version} ${result.profile.padEnd(10)} ${result.scenario.padEnd(9)} ` +
          `${old.landed} → ${result.landed}; ${old.damage.toFixed(1)} → ${result.damage.toFixed(1)}; ` +
          `${old.firstHitMs ?? "-"} → ${result.firstHitMs ?? "-"} ms`,
      );
    }
  }
}
