import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import { setImmediate } from "node:timers";

const extensionUrl = new URL(
  "../../extensions/mineflayer-bot/decision-benchmark.mjs",
  import.meta.url,
);
const require = createRequire(extensionUrl);
const runtime = process.env.SCREEN_COMBAT_RUNTIME
  ? createRequire(path.resolve(process.env.SCREEN_COMBAT_RUNTIME, "package.json"))
  : require;
const { createCombatController, installCombatProtocol } = runtime("./combat.cjs");
const { normalizeCombat } = runtime("./combat.cjs");
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

const shared = JSON.parse(
  require("node:fs").readFileSync(process.env.SCREEN_BENCH_SETTINGS, "utf8"),
);
const observations = [];
for (let trial = 1; trial <= 3; trial++) {
  {
    const f = fixture("26.1.2", { ...shared, style: "auto", crystalIntervalMs: 50 });
    try {
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
      await f.bot.equip(f.bot.inventory.slots[38]);
      f.controller.select(f.enemy);
      for (let time = 0; time <= 1500 && !attacks(f).length; time += 50) await f.tick(time);
      const foundation = f.packets.find((p) => p.name === "block_place" && p.held === "obsidian");
      const crystal = placements(f)[0],
        attack = attacks(f)[0];
      assert.ok(foundation && crystal && attack, "the physical combo must complete");
      assert.ok(foundation.time <= crystal.time && crystal.time <= attack.time);
      assert.equal(placements(f).length, 1);
      assert.equal(attacks(f).length, 1);
      assert.equal(
        f.packets.some((p) => p.held === "wind_charge" && p.name === "use_item"),
        false,
      );
      assert.deepEqual(f.errors, []);
      observations.push({
        trial,
        name: "foundation-crystal-attack",
        ms: attack.time - foundation.time,
        packets: [foundation, crystal, attack],
      });
    } finally {
      f.close();
    }
  }
  {
    const f = fixture("26.1.2", {
      ...shared,
      style: "crystal",
      crystalBuildBase: false,
      crystalCover: false,
    });
    try {
      f.controller.select(f.enemy);
      await f.tick(0);
      assert.equal(placements(f).length, 0);
      const position = new Vec3(3, 64, 0),
        previous = f.bot.blockAt(position);
      f.world.setBlock(position, "obsidian");
      f.bot.emit("blockUpdate", previous, f.bot.blockAt(position));
      for (let time = 50; time <= 1500 && !placements(f).length; time += 50) await f.tick(time);
      const crystal = placements(f)[0];
      assert.ok(crystal, "confirmed base must lead to a real placement packet");
      assert.deepEqual(f.errors, []);
      observations.push({
        trial,
        name: "confirmed-base-placement",
        ms: crystal.time,
        packets: [crystal],
      });
    } finally {
      f.close();
    }
  }
  {
    const f = fixture("26.1.2", {
      ...shared,
      style: "crystal",
      crystalBuildBase: false,
      crystalCover: false,
    });
    try {
      f.world.setBlock(new Vec3(3, 64, 0), "obsidian");
      f.enemy.position.x = 17.5;
      f.controller.select(f.enemy);
      await f.tick(0);
      assert.equal(placements(f).length, 0);
      f.enemy.position.x = 5.5;
      for (let time = 50; time <= 1500 && !placements(f).length; time += 50) await f.tick(time);
      const crystal = placements(f)[0];
      assert.ok(crystal, "moving into range must lead to a real placement packet");
      assert.deepEqual(f.errors, []);
      observations.push({
        trial,
        name: "target-enters-range-placement",
        ms: crystal.time,
        packets: [crystal],
      });
    } finally {
      f.close();
    }
  }
}
require("node:fs").writeFileSync(
  process.argv[2],
  JSON.stringify(
    {
      minecraftVersion: "26.1.2",
      tickMs: 50,
      trials: 3,
      effectiveComboIntervalMs: normalizeCombat({ ...shared, crystalIntervalMs: 50 })
        .crystalIntervalMs,
      settings: shared,
      observations,
    },
    null,
    2,
  ) + "\n",
);
console.log(observations.map(({ trial, name, ms }) => ({ trial, name, ms })));
