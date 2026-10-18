import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
const require = createRequire(import.meta.url);
const { Vec3 } = require("vec3");
const { AutoBuff } = require("./auto-buff.cjs");
const { potionData, activeEffect } = require("./potion-data.cjs");
const { createSurvivalController } = require("./survival.cjs");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function potion(registry, name = "healing", splash = false, slot = 9) {
  const Item = require("prismarine-item")(registry);
  const legacy = !registry.isNewerOrEqualTo("1.9");
  const item = new Item(registry.itemsByName[splash && !legacy ? "splash_potion" : "potion"].id, 1,
    legacy ? (name === "strong_healing" ? 8229 : 8197) | (splash ? 0x4000 : 0) : 0);
  item.slot = slot;
  if (registry.isNewerOrEqualTo("1.20.5")) {
    const ids = { healing: 24, strong_healing: 25, regeneration: 31, strength: 34, strong_strength: 36, swiftness: 13 };
    const data = { potionId: ids[name], customColor: undefined, customEffects: [] };
    item.components.push({ type: "potion_contents", data });
    item.componentMap.set("potion_contents", item.components[0]);
  } else if (!legacy) item.nbt = { type: "compound", value: { Potion: { type: "string", value: `minecraft:${name}` } } };
  return item;
}
function fixture(version = "26.1.2", splash = false) {
  const bot = new EventEmitter(), registry = require("prismarine-registry")(version);
  const Item = require("prismarine-item")(registry);
  const sword = new Item(registry.itemsByName.diamond_sword.id, 1);
  sword.slot = 36;
  const heal = potion(registry, "strong_healing", splash);
  const items = [sword, heal], calls = [];
  let time = 0;
  Object.assign(bot, {
    registry, health: 8, food: 20, heldItem: sword, entities: {},
    entity: { id: 1, position: new Vec3(0, 64, 0), velocity: new Vec3(0, 0, 0), effects: {}, onGround: true, yaw: 0 },
    inventory: Object.assign(new EventEmitter(), { items: () => items }),
    _client: Object.assign(new EventEmitter(), { state: "play", write: (name, params) => calls.push([name, params]) }),
    equip: async (item) => { bot.heldItem = item; calls.push(["equip", item.name]); },
    look: async (yaw, pitch) => { bot.entity.yaw = yaw; bot.entity.pitch = pitch; },
    clearControlStates() {},
    deactivateItem() { bot.usingHeldItem = false; },
    activateItem() { bot.usingHeldItem = true; calls.push(["use", bot.heldItem]); },
    pathfinder: { stop: async () => {} },
  });
  const buff = new AutoBuff(bot, { now: () => time });
  return { bot, buff, heal, sword, items, calls, time: (value) => { time = value; } };
}

for (const version of ["1.8.8", "1.20.4", "1.20.5", "26.1.2"]) {
  test(`recognizes real strong healing potion items and restores the weapon on ${version}`, async () => {
    const f = fixture(version);
    try {
      const Item = require("prismarine-item")(f.bot.registry);
      const decoded = Item.fromNotch(Item.toNotch(f.heal));
      assert.deepEqual(potionData(f.bot, decoded).effects, [{ name: "instant_health", amplifier: 1 }]);
      f.bot.activateItem = () => f.bot._client.emit("entity_status", { entityId: 1, entityStatus: 9 });
      assert.equal(await f.buff.applyItemToSelf(f.heal), true);
      assert.equal(f.bot.heldItem, f.sword);
      assert.equal(f.bot._client.listenerCount("entity_status"), 0);
      assert.equal(f.bot.listenerCount("entityEffect"), 0);
      assert.equal(f.buff.isDrinking, false);
    } finally { f.buff.dispose(); }
  });
}

test("recognition handles long/strong NBT and refuses mixed harmful, unknown and turtle potions", () => {
  const f = fixture("1.20.4");
  try {
    const item = potion(f.bot.registry, "long_strength");
    assert.equal(potionData(f.bot, item).effects[0].name, "strength");
    item.nbt.value.CustomPotionEffects = { type: "list", value: { type: "compound", value: [
      { Id: { type: "byte", value: f.bot.registry.effectsByName.Poison.id }, Amplifier: { type: "byte", value: 1 } },
    ] } };
    assert.equal(potionData(f.bot, item), null, "a beneficial base cannot hide a harmful custom effect");
    for (const name of ["turtle_master", "harming", "poison", "water", "unknown"]) {
      assert.equal(potionData(f.bot, potion(f.bot.registry, name)), null, name);
    }
  } finally { f.buff.dispose(); }
});

test("modern custom effect IDs resolve against the current version and unknown potion IDs fail closed", () => {
  const f = fixture();
  try {
    const data = f.heal.componentMap.get("potion_contents").data;
    data.potionId = null;
    data.customEffects = [{ id: f.bot.registry.effectsByName.InstantHealth.id, details: { amplifier: 2 } }];
    assert.deepEqual(potionData(f.bot, f.heal).effects, [{ name: "instant_health", amplifier: 2 }]);
    data.customEffects.push({ id: f.bot.registry.effectsByName.Poison.id, details: { amplifier: 0 } });
    assert.equal(potionData(f.bot, f.heal), null);
    data.customEffects = [];
    data.potionId = 9999;
    assert.equal(potionData(f.bot, f.heal), null);
  } finally { f.buff.dispose(); }
});

test("buff selection skips active effects, supports upgrades and invalidates changed potion slots", () => {
  const f = fixture();
  try {
    const strength = potion(f.bot.registry, "strength", false, 10);
    f.items.push(strength);
    assert.equal(f.buff.best(false), strength);
    const id = f.bot.registry.effectsByName.Strength.id;
    f.bot.entity.effects[id] = { id, amplifier: 0, duration: 600 };
    assert.equal(activeEffect(f.bot, "strength"), true);
    assert.equal(f.buff.best(false), null);
    const strong = potion(f.bot.registry, "strong_strength", false, 11);
    f.items.push(strong);
    f.bot.inventory.emit("updateSlot", 11, null, strong);
    assert.equal(f.buff.best(false), strong);
    f.bot.entity.effects[id].amplifier = 1;
    assert.equal(f.buff.best(false), null);
  } finally { f.buff.dispose(); }
});

test("splash aims and sends look before use, waits for self healing and restores the sword", async () => {
  const f = fixture("26.1.2", true);
  try {
    const operation = f.buff.applyItemToSelf(f.heal);
    await flush();
    assert.equal(f.calls.at(-2)[0], "look");
    assert.equal(f.calls.at(-1)[0], "use");
    assert.equal(f.calls.at(-2)[1].pitch, 90);
    f.bot._client.emit("entity_status", { entityId: 1, entityStatus: 9 });
    assert.equal(f.buff.isDrinking, true, "a splash throw is not a drinking acknowledgement");
    f.bot.health = 16; f.bot.emit("health");
    assert.equal(await operation, true);
    assert.equal(f.bot.heldItem, f.sword);
    assert.equal(f.bot.listenerCount("health"), 0);
  } finally { f.buff.dispose(); }
});

test("self splash never heals an adjacent opponent and lingering potions are preserved", async () => {
  const f = fixture("26.1.2", true);
  try {
    f.bot.entities[2] = { id: 2, username: "Enemy", position: new Vec3(3, 64, 0) };
    assert.equal(await f.buff.applyItemToSelf(f.heal), false);
    assert.equal(f.calls.length, 0);
    f.heal.name = "lingering_potion";
    assert.equal(await f.buff.applyItemToSelf(f.heal), false);
  } finally { f.buff.dispose(); }
});

for (const event of ["death", "end", "cancel", "timeout", "equip failure"]) {
  test(`potion ${event} cleans listeners and releases the hand`, async () => {
    const f = fixture();
    try {
      if (event === "timeout") f.buff.timeout = 10;
      if (event === "equip failure") f.bot.equip = async () => { throw new Error("equip failure"); };
      const operation = f.buff.applyItemToSelf(f.heal);
      const rejected = assert.rejects(operation);
      await flush();
      if (event === "cancel") f.buff.cancelDrinking();
      else if (["death", "end"].includes(event)) f.bot.emit(event);
      await rejected;
      assert.equal(f.buff.isDrinking, false);
      for (const name of ["health", "entityEffect", "death", "end"]) assert.equal(f.bot.listenerCount(name), 0);
      assert.equal(f.bot._client.listenerCount("entity_status"), 0);
    } finally { f.buff.dispose(); }
  });
}

test("MLG cancellation cannot restore a weapon over an emergency bucket", async () => {
  const f = fixture();
  let current = true;
  try {
    const operation = f.buff.applyItemToSelf(f.heal, { current: () => current });
    const rejected = assert.rejects(operation, /cancelled/);
    await flush();
    current = false;
    f.buff.cancelDrinking();
    const bucket = { name: "water_bucket" };
    f.bot.heldItem = bucket;
    await rejected;
    assert.equal(f.bot.heldItem, bucket);
  } finally { f.buff.dispose(); }
});

test("a changed potion slot cannot substitute poison for healing while equip is queued", async () => {
  const f = fixture();
  try {
    const { queueInventoryTask } = require("./combat-inventory.cjs");
    let release;
    const pending = queueInventoryTask(f.bot, () => new Promise((resolve) => { release = resolve; }));
    await flush();
    const operation = f.buff.applyItemToSelf(f.heal);
    const rejected = assert.rejects(operation, /no longer/);
    f.items.splice(1, 1, potion(f.bot.registry, "strength"));
    release(); await pending; await rejected;
    assert.equal(f.calls.some((call) => call[0] === "use"), false);
  } finally { f.buff.dispose(); }
});

test("survival coordinates potion healing with combat and resumes the same controller", async () => {
  const f = fixture();
  f.buff.dispose();
  const calls = [];
  f.bot.launcherCombat = { pauseForSurvival: () => calls.push("pause"), resumeAfterSurvival: () => calls.push("resume") };
  const survival = createSurvivalController(f.bot, { emergencyMlg: false }, { now: () => 0 });
  try {
    assert.equal(survival.healingPotion(), f.heal);
    assert.equal(survival.requestCombatHeal(f.heal, () => true), true);
    assert.equal(survival.kind, "buff");
    await flush();
    f.bot._client.emit("entity_status", { entityId: 1, entityStatus: 9 });
    await survival.task;
    assert.equal(survival.busy, false);
    assert.equal(f.bot.heldItem, f.sword);
    assert.deepEqual(calls, ["pause", "resume"]);
  } finally { survival.dispose(); }
});

test("stopping combat potion use releases paused travel for the next command", async () => {
  const f = fixture(); f.buff.dispose();
  let paused = false;
  f.bot.launcherTravel = {
    pauseForSurvival() { paused = true; },
    resumeAfterSurvival() { paused = false; },
  };
  const survival = createSurvivalController(f.bot, { emergencyMlg: false });
  try {
    assert.equal(survival.requestCombatHeal(f.heal, () => true), true);
    await flush();
    assert.equal(paused, true);
    survival.cancelCombatHeal();
    await survival.task;
    assert.equal(paused, false);
    assert.equal(survival.busy, false);
    assert.equal(f.bot._client.listenerCount("entity_status"), 0);
  } finally { survival.dispose(); }
});

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(`splash potion uses real Mineflayer inventory and versioned packets on ${version}`, async () => {
    const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
    rigRequire("ts-node").register({ project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)), transpileOnly: true });
    const { createCacheWorld } = rigRequire("./tests/setup.ts");
    const f = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
    const bot = f.rig.bot;
    bot.physicsEnabled = false;
    bot.health = 8; bot.food = 20; bot.entity.onGround = true;
    bot.supportFeature = bot.registry.supportFeature;
    bot.loadPlugin(require("mineflayer/lib/plugins/inventory"), { hideErrors: false });
    bot.loadPlugin(require("mineflayer/lib/plugins/simple_inventory"));
    bot.setQuickBarSlot(0);
    const Item = require("prismarine-item")(bot.registry);
    const sword = new Item(bot.registry.itemsByName.diamond_sword.id, 1);
    sword.slot = 36; bot.inventory.slots[36] = sword;
    const heal = potion(bot.registry, "strong_healing", true, 37);
    bot.inventory.slots[37] = heal;
    const protocol = createRequire(require.resolve("mineflayer"))("minecraft-protocol");
    const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
    const packets = [];
    bot._client.state = "play";
    bot._client.write = (name, params) => {
      serializer.createPacketBuffer({ name, params });
      packets.push({ name, params });
    };
    require("./combat.cjs").installCombatProtocol(bot);
    const buff = new AutoBuff(bot);
    let operation;
    try {
      operation = buff.applyItemToSelf(heal);
      void operation.catch(() => {});
      await flush();
      const index = packets.findIndex((packet) => packet.name === (version === "1.8.8" ? "block_place" : "use_item"));
      assert.ok(index > 0, "real potion activation serializes");
      assert.equal(packets[index - 1].name, "look");
      assert.equal(packets[index - 1].params.pitch, 90);
      bot.health = 16; bot.emit("health");
      assert.equal(await operation, true);
      assert.equal(bot.heldItem.name, "diamond_sword");
    } finally { buff.dispose(); await operation?.catch(() => {}); f.cacheWorld.dispose(); f.rig.stopPassivePhysics(); }
  });
}
