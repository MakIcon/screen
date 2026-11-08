import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const runtime = process.env.SCREEN_COMBAT_RUNTIME
  ? createRequire(path.resolve(process.env.SCREEN_COMBAT_RUNTIME, "package.json"))
  : require;
const { Vec3 } = require("vec3");
const { createCombatUtilities, touchingWebs } = runtime("./combat-utilities.cjs");
const { createCombatController, normalizeCombat, installCombatProtocol } = runtime("./combat.cjs");
const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const mineflayerRequire = createRequire(runtime.resolve("mineflayer"));
const protocol = mineflayerRequire("minecraft-protocol");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(version = "1.20.4", settings = {}) {
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
  const bot = rig.bot;
  bot.physicsEnabled = false;
  bot.supportFeature = bot.registry.supportFeature;
  bot.health = 20;
  bot.food = 20;
  bot.entity.onGround = true;
  bot.game = { dimension: "overworld", gameMode: "survival" };
  for (const plugin of ["entities", "inventory", "simple_inventory", "generic_place", "digging"])
    bot.loadPlugin(runtime(`mineflayer/lib/plugins/${plugin}`), { hideErrors: false });
  const Item = mineflayerRequire("prismarine-item")(bot.registry);
  function item(slot, name, count = 1) {
    const entry = new Item(bot.registry.itemsByName[name].id, count);
    entry.slot = slot;
    const old = bot.inventory.slots[slot];
    bot.inventory.slots[slot] = entry;
    bot.inventory.emit("updateSlot", slot, old, entry);
    return entry;
  }
  bot.setQuickBarSlot(0);
  const packets = [],
    statuses = [],
    equips = [];
  const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
  bot._client.state = "play";
  bot._client.write = (name, params) => {
    serializer.createPacketBuffer({ name, params });
    packets.push({ name, params, held: bot.heldItem?.name, at: time });
  };
  installCombatProtocol(bot);
  bot.equip = async (entry, destination) => {
    const from = entry.slot,
      to = bot.getEquipmentDestSlot(destination);
    const old = bot.inventory.slots[to];
    bot.inventory.slots[from] = old;
    if (old) old.slot = from;
    bot.inventory.slots[to] = entry;
    entry.slot = to;
    equips.push(entry.name);
  };
  bot.pathfinder = { stop: async () => {}, goto: () => new Promise(() => {}) };
  const enemy = {
    id: 2,
    username: "Enemy",
    name: "player",
    type: "player",
    isValid: true,
    position: new Vec3(2.5, 64, 0.5),
    width: 0.6,
    height: 1.8,
    equipment: [],
    metadata: [],
  };
  bot.entities[2] = enemy;
  let time = 0;
  const controller = createCombatUtilities(bot, normalizeCombat(settings), {
    now: () => time,
    isOwner: (name) => name === "Owner",
    onStatus: (status) => statuses.push(status),
    beforeStart: async () => {
      await bot.pathfinder.stop();
    },
  });
  const webName = bot.registry.blocksByName.cobweb ? "cobweb" : "web";
  const uses = () =>
    packets.filter(
      (p) => p.name === "use_item" || (p.name === "block_place" && p.params.direction === -1),
    );
  const placements = () =>
    packets.filter((p) => p.name === "block_place" && p.params.direction !== -1);
  const step = async (at = time + 50, target = enemy, options = {}) => {
    time = at;
    const busy = controller.tick(target, options);
    await flush();
    await flush();
    return busy;
  };
  function block(pos, name) {
    const old = world.getBlock(pos);
    const next = world.setBlock(pos, name);
    bot.emit("blockUpdate", old, next);
    bot.emit(`blockUpdate:${pos.floored()}`, old, next);
    return next;
  }
  function acknowledgeFluid(pos, kind) {
    block(pos, kind);
    item(bot.getEquipmentDestSlot("hand"), "bucket");
  }
  function acknowledgePickup(pos, kind) {
    block(pos, "air");
    item(bot.getEquipmentDestSlot("hand"), `${kind}_bucket`);
  }
  return {
    rig,
    world,
    bot,
    enemy,
    controller,
    packets,
    statuses,
    equips,
    item,
    block,
    webName,
    uses,
    placements,
    step,
    acknowledgeFluid,
    acknowledgePickup,
    setTime: (at) => {
      time = at;
    },
    dispose() {
      controller.dispose();
      rig.stopPassivePhysics();
    },
  };
}

export { fixture, flush, Vec3, runtime, createCombatController, touchingWebs };
