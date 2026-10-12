import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import plan from "./gathering-plan.cjs";
import gathering from "./gathering.cjs";
import { scanMine, createMineIndex } from "./gathering-scan.cjs";
import commands from "./gathering-commands.cjs";
import worker from "./worker.cjs";

const require = createRequire(import.meta.url);
const { Vec3 } = require("vec3");
const mcData = require("minecraft-data");
const blockFactory = require("prismarine-block");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("ore index reuses sections, tracks edits and refreshes reloaded columns", async () => {
  const bot = new EventEmitter();
  const ore = new Map([["2,2,2", 1], ["12,2,2", 1]]);
  let reads = 0;
  const column = { getBlockStateId(pos) { reads++; return ore.get(`${pos.x},${pos.y},${pos.z}`) || 0; } };
  bot.registry = { blocksByName: { diamond_ore: { id: 1 } }, blocksByStateId: [{ id: 0 }, { id: 1 }], version: { ">=": () => true } };
  bot.game = { minY: 0 };
  bot.world = { getColumn: (x, z) => x === 0 && z === 0 ? column : undefined };
  bot.entity = { position: new Vec3(2, 2, 2) };
  bot.blockAt = (pos) => ({ type: ore.get(`${pos.x},${pos.y},${pos.z}`) || 0, position: pos });
  const task = { kind: "mine", origin: new Vec3(2, 2, 2), radius: 3, minY: 0, maxY: 15, names: ["diamond_ore"] };
  const index = createMineIndex(bot);
  const scan = (job = task) => scanMine(bot, job, { index, allowed: (b) => b.type === 1, yieldControl: async () => {} });
  try {
    assert.equal((await scan()).remaining, 1);
    assert.equal(reads, 4096);
    await scan();
    assert.equal(reads, 4096, "rescan does not read the section again");
    const replace = (pos, type) => {
      ore.set(`${pos.x},${pos.y},${pos.z}`, type);
      bot.emit("blockUpdate", null, { type, position: pos });
    };
    replace(new Vec3(2, 2, 2), 0);
    replace(new Vec3(3, 2, 2), 1);
    replace(new Vec3(1, 2, 2), 0); // Ordinary tunnel dig doesn't invalidate ores.
    const changed = await scan();
    assert.deepEqual(changed.candidates.map((b) => b.position.x), [3]);
    assert.equal(reads, 4096);
    assert.equal((await scan({ ...task, radius: 14 })).remaining, 2, "a wider task reuses the full section");
    assert.equal(reads, 4096);
    bot.emit("chunkColumnUnload", new Vec3(0, 0, 0));
    ore.set("4,2,2", 1);
    bot.emit("chunkColumnLoad", new Vec3(0, 0, 0));
    assert.equal((await scan()).remaining, 2);
    assert.equal(reads, 8192);
  } finally { index.dispose(); }
  assert.equal(bot.listenerCount("blockUpdate"), 0);
  assert.equal(bot.listenerCount("chunkColumnLoad"), 0);
});

function fixture(version = "26.1.2") {
  const bot = new EventEmitter();
  bot.registry = mcData(version);
  const Block = blockFactory(bot.registry);
  const blocks = new Map(),
    items = [],
    events = [],
    dug = [],
    equipped = [];
  bot.entity = { id: 1, position: new Vec3(0.5, 64, 0.5), yaw: 0, effects: {}, onGround: true };
  bot.health = 20;
  bot.isAlive = true;
  bot.game = { gameMode: "survival" };
  bot.entities = {};
  let slots = 30,
    dropId = 10;
  function block(name, pos) {
    const value = Block.fromStateId(bot.registry.blocksByName[name].defaultState);
    value.position = pos.clone();
    return value;
  }
  function put(name, x, y = 64, z = 0) {
    const value = block(name, new Vec3(x, y, z));
    blocks.set(plan.key(value.position), value);
    return value;
  }
  bot.blockAt = (pos) => blocks.get(plan.key(pos.floored())) || block("air", pos.floored());
  bot.findBlocks = (options) =>
    [...blocks.values()]
      .filter(
        (value) =>
          options.matching.includes(value.type) &&
          value.position.distanceTo(options.point) <= options.maxDistance &&
          (!options.useExtraInfo || options.useExtraInfo(value)),
      )
      .map((value) => value.position)
      .slice(0, options.count);
  bot.inventory = { items: () => items, emptySlotCount: () => slots };
  bot.equip = async (item) => {
    equipped.push(item.name);
    bot.heldItem = item;
  };
  bot.unequip = async () => {
    bot.heldItem = null;
  };
  bot.clearControlStates = () => {};
  bot.stopDigging = () => {};
  bot.canDigBlock = () => true;
  bot.dig = async (value) => {
    dug.push({ name: value.name, position: value.position, hand: bot.heldItem?.name });
    blocks.delete(plan.key(value.position));
    const dropName = value.name.includes("iron_ore") ? "raw_iron" : value.name;
    const entity = {
      id: dropId++,
      position: value.position.offset(0.5, 0.5, 0.5),
      isValid: true,
      getDroppedItem: () => ({
        name: dropName,
        type: bot.registry.itemsByName[dropName]?.id,
        count: 1,
      }),
    };
    bot.entities[entity.id] = entity;
    bot.emit("itemDrop", entity);
  };
  const originalSettings = {
    canDig: true,
    allowExcavatedDescent: false,
    canPlace: true,
    maxDropDown: 3,
    allowWaterDrop: true,
    exclusionAreasBreak: [],
    exclusionAreasPlace: [],
  };
  bot.pathfinder = {
    world: {},
    defaultMoveSettings: { ...originalSettings },
    setMoveOptions(value) {
      Object.assign(this.defaultMoveSettings, value);
    },
    stop: async () => {},
    goto: async (goal) => {
      if (goal.trackedEntity) {
        const entity = goal.trackedEntity;
        const drop = entity.getDroppedItem();
        items.push({ ...drop, count: drop.count });
        slots--;
        bot.emit("playerCollect", bot.entity, entity);
        entity.isValid = false;
        delete bot.entities[entity.id];
      } else if (goal.goals?.length) {
        const next = goal.goals[0];
        bot.entity.position = new Vec3(next.x + 0.5, next.y, next.z + 0.5);
      }
    },
  };
  const work = gathering.createGatheringController(
    bot,
    { dropWaitMs: 0, pickupTimeoutMs: 200, operationTimeoutMs: 500, reserveSlots: 2 },
    { onStatus: (message) => events.push(message) },
  );
  const item = (name, durabilityUsed = 0) => ({
    name,
    type: bot.registry.itemsByName[name].id,
    count: 1,
    durabilityUsed,
    enchants: [],
  });
  return {
    bot,
    work,
    blocks,
    items,
    events,
    dug,
    equipped,
    put,
    item,
    originalSettings,
    setSlots: (value) => {
      slots = value;
    },
  };
}
async function until(f, predicate, timeout = 3000) {
  const end = Date.now() + timeout;
  while (!predicate() && Date.now() < end) {
    f.bot.emit("physicsTick");
    await delay(5);
  }
  assert.ok(predicate(), JSON.stringify(f.work.snapshot));
}

test("validates cuboids, aliases, dimensions and exact block counts before execution", () => {
  const f = fixture();
  assert.equal(plan.bounds(new Vec3(2, -3, 4), new Vec3(0, -1, 3)).volume, 18);
  assert.deepEqual(plan.resolveBlocks(f.bot.registry, "iron"), ["iron_ore", "deepslate_iron_ore"]);
  assert.ok(plan.resolveBlocks(f.bot.registry, "ores").includes("ancient_debris"));
  assert.throws(() => f.work.enqueue({ kind: "mine", blocks: "unknown" }), /Неизвестный/);
  assert.throws(() => f.work.enqueue({ kind: "mine", count: "1.5" }), /целое число/);
  assert.throws(() => f.work.enqueue({ kind: "mine", blocks: "chest" }), /нельзя выбрать/);
  assert.throws(() => plan.bounds(new Vec3(0, 0, 0), new Vec3(100, 100, 100)), /большая/);
  assert.equal(f.work.busy, false);
  return f.work.dispose();
});

test("passage configuration is atomic, keeps stair headroom and reaches local commands", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  const before = plan.passageSettings(f.work.settings);
  assert.throws(() => f.work.configurePassages({ tunnelWidth: 3, stairHeight: 2 }), /Просвет/);
  assert.deepEqual(plan.passageSettings(f.work.settings), before);
  let prepares = 0;
  const replies = [];
  await commands.handleGatheringCommand(f.bot, f.work, "work",
    ["tunnels", "3", "2", "2", "4", "on", "12"],
    { prepare: async () => prepares++, reply: value => replies.push(value) });
  assert.equal(prepares, 0, "settings do not interrupt an active job");
  assert.equal(f.work.settings.stairHeight, 4);
  assert.equal(f.work.settings.placeTorches, true);
  assert.equal(f.work.settings.torchInterval, 12);
  assert.match(replies[0], /настроены/);
  const tunnel = commands.taskFromCommand(f.bot, f.work, "tunnel", ["10"]);
  assert.equal(tunnel.area.volume, 60, "manual tunnels use the saved 3x2 size");
});

for (const mode of ["on", "off", "empty", "rejected"]) test(`wall lighting ${mode} keeps equipment and gathering intact`, async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.work.configurePassages({ placeTorches: mode !== "off", torchInterval: 8 });
  const pick = f.item("iron_pickaxe");
  const torch = { ...f.item("torch"), count: 4 };
  f.items.push(pick);
  if (mode !== "empty") f.items.push(torch);
  for (const x of [2, 6, 10]) {
    f.put("iron_ore", x);
    f.put("stone", x - 1, 65, 2);
  }
  const wrappedDig = f.bot.dig;
  f.bot.dig = async (block, ...args) => {
    f.bot.entity.position = block.position.offset(-0.5, 0, 0.5);
    await wrappedDig(block, ...args);
  };
  const placements = [];
  f.bot.placeBlock = async (wall, face) => {
    assert.equal(f.bot.heldItem.name, "torch");
    assert.equal(Math.abs(face.y), 0, "lights attach to walls");
    assert.equal(wall.name, "stone");
    if (mode === "rejected") throw new Error("Server rejected placement");
    const pos = wall.position.plus(face);
    placements.push(pos);
    f.put("wall_torch", pos.x, pos.y, pos.z);
    torch.count--;
  };
  f.work.enqueue({ kind: "mine", blocks: "iron", count: 3, radius: 16 });
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.work.snapshot.history[0].mined, 3);
  assert.equal(f.bot.heldItem, pick, "the tool is restored after lighting");
  assert.equal(placements.length, mode === "on" ? 2 : 0);
  if (mode === "on") {
    assert.equal(placements[0].distanceTo(placements[1]), 8);
    assert.equal(torch.count, 2);
    assert.ok(plan.keepItem(f.bot, torch), "delivery retains lighting supplies");
  }
  if (mode === "rejected") assert.ok(f.events.some(value => value.includes("Факел не установлен")));
});

test("delivery and return search existing passages before allowing construction", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.items.push(f.item("diamond"));
  const start = f.bot.entity.position.clone();
  const owner = { position: new Vec3(10, 64, 0.5), isValid: true };
  const routes = [];
  f.bot.lookAt = async () => {};
  f.bot.tossStack = async () => {};
  f.bot.pathfinder.goto = async goal => {
    routes.push(goal);
    assert.equal(f.bot.pathfinder.defaultMoveSettings.canDig, false);
    assert.equal(f.bot.pathfinder.defaultMoveSettings.canPlace, false);
    assert.equal(f.bot.pathfinder.defaultMoveSettings.excavationWidth, 0);
    f.bot.entity.position = goal.trackedEntity ? owner.position.clone() : start.clone();
  };
  await f.work.deliver(() => owner);
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(routes.length, 2);
  assert.equal(f.dug.length, 0);
  assert.equal(f.work.snapshot.history[0].delivered, 1);
});

test("manual tunnel clearance keeps its own torches and still finishes the area", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.work.configurePassages({ placeTorches: true });
  f.items.push(f.item("iron_pickaxe"), { ...f.item("torch"), count: 4 });
  for (const x of [1, 2]) for (const y of [64, 65]) f.put("stone", x, y, 0);
  f.put("stone", 1, 65, 1);
  const original = f.bot.dig;
  f.bot.dig = async (block, ...args) => {
    f.bot.entity.position = new Vec3(block.position.x - 0.5, 64, 0.5);
    await original(block, ...args);
  };
  f.bot.placeBlock = async (wall, face) => {
    const pos = wall.position.plus(face);
    f.put("wall_torch", pos.x, pos.y, pos.z);
  };
  f.work.enqueue({ kind: "quarry", area: { min: new Vec3(1, 64, 0), max: new Vec3(2, 65, 0) } });
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.work.snapshot.history[0].outcome, "готово");
  assert.equal(f.work.snapshot.history[0].mined, 4);
  assert.equal(f.bot.blockAt(new Vec3(1, 65, 0)).name, "wall_torch");
  assert.equal(f.dug.some(value => value.name === "wall_torch"), false);
});

for (const version of ["1.20.4", "26.1.2"])
  test(`harvests ore with a suitable tool, collects actual drops, restores movement on ${version}`, async (t) => {
    const f = fixture(version);
    t.after(() => f.work.dispose());
    f.items.push(f.item("golden_pickaxe"), f.item("iron_pickaxe"));
    f.put("diamond_ore", 2);
    f.put("diamond_ore", 3);
    const id = f.work.enqueue({ kind: "mine", blocks: "diamond", count: 1 });
    await until(f, () => f.work.snapshot.history.length === 1);
    assert.equal(f.dug.length, 1);
    assert.equal(f.dug[0].hand, "iron_pickaxe");
    assert.equal(f.work.snapshot.history[0].id, id);
    assert.equal(f.work.snapshot.history[0].mined, 1);
    assert.equal(f.work.snapshot.history[0].collected, 1);
    assert.equal(f.bot.pathfinder.defaultMoveSettings.canDig, true);
    assert.equal(f.bot.pathfinder.defaultMoveSettings.allowExcavatedDescent, false);
    assert.deepEqual(f.bot.pathfinder.defaultMoveSettings.exclusionAreasBreak, []);
  });

test("route digging respects the target count even for an already planned path", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.items.push(f.item("iron_pickaxe"));
  const first = f.put("diamond_ore", 2),
    second = f.put("diamond_ore", 3);
  const goto = f.bot.pathfinder.goto;
  f.bot.canSeeBlock = () => false;
  f.bot.pathfinder.goto = async (goal) => {
    if (goal.trackedEntity) return goto(goal);
    // Navigation may have planned both breaks before the first count changed.
    await f.bot.dig(first, true, "raycast");
    await f.bot.dig(second, true, "raycast");
  };
  f.work.enqueue({ kind: "mine", blocks: "diamond", count: 1 });
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.work.snapshot.history[0].mined, 1);
  assert.equal(f.work.snapshot.history[0].outcome, "готово");
  assert.equal(f.dug.length, 1);
  assert.equal(f.bot.blockAt(second.position).name, "diamond_ore");
});

test("pauses for a missing harvesting tool and resumes after it is supplied", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("diamond_ore", 2);
  f.items.push(f.item("golden_pickaxe"));
  f.work.enqueue({ kind: "mine", blocks: "diamond", count: 1 });
  await until(f, () => f.work.snapshot.phase === "paused");
  assert.match(f.work.snapshot.reason, /инструмента/);
  assert.equal(f.dug.length, 0);
  f.items.push(f.item("iron_pickaxe"));
  f.work.resume();
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.dug.length, 1);
});

test("does not use a nearly broken tool when a fresh one is available", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("diamond_ore", 2);
  f.items.push(
    f.item("diamond_pickaxe", f.bot.registry.itemsByName.diamond_pickaxe.maxDurability - 3),
    f.item("iron_pickaxe"),
  );
  f.work.enqueue({ kind: "mine", blocks: "diamond", count: 1 });
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.deepEqual(f.equipped, ["iron_pickaxe"]);
});

test("quarry clears upper layers first and pauses with protected blocks remaining", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("dirt", 2, 64);
  f.put("dirt", 2, 65);
  f.put("chest", 2, 66);
  f.work.enqueue({ kind: "quarry", area: { min: new Vec3(2, 64, 0), max: new Vec3(2, 66, 0) } });
  await until(f, () => f.work.snapshot.phase === "paused");
  assert.deepEqual(
    f.dug.map((v) => v.position.y),
    [65, 64],
  );
  assert.match(f.work.snapshot.reason, /не закончена/);
  assert.equal(f.work.snapshot.history.length, 0);
});

test("quarry does not claim success for unloaded chunks", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.bot.blockAt = () => null;
  f.work.enqueue({ kind: "quarry", area: { min: new Vec3(2, 64, 0), max: new Vec3(3, 64, 0) } });
  await until(f, () => f.work.snapshot.phase === "paused");
  assert.match(f.work.snapshot.reason, /не загружено 2/);
});

test("never digs blocks next to lava or removes the floor while standing on it", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("dirt", 2);
  f.put("lava", 3);
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.dug.length, 0);
  assert.equal(f.work.snapshot.history[0].outcome, "частично");
  f.put("dirt", 0, 63);
  f.put("dirt", 1, 63);
  f.work.enqueue({ kind: "quarry", area: plan.bounds(new Vec3(0, 63, 0), new Vec3(0, 63, 0)) });
  await until(f, () => f.work.snapshot.history.length === 2);
  assert.equal(f.bot.entity.position.x, 1.5);
  assert.equal(f.dug.length, 1);
});

test("forest stays anchored, includes modern logs, and leaves are optional", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("oak_log", 2);
  f.put("oak_leaves", 3);
  f.put("oak_log", 20);
  f.work.enqueue({ kind: "forest", radius: 8, count: 0, scaffold: false });
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.deepEqual(
    f.dug.map((v) => v.name),
    ["oak_log"],
  );
  assert.ok(f.blocks.has("20,64,0"));
  assert.ok(f.blocks.has("3,64,0"));
  if (f.bot.registry.blocksByName.pale_oak_log)
    assert.ok(f.work.validate({ kind: "forest" }).names.includes("pale_oak_log"));
});

test("failed targets are bounded and do not prevent the next queued job", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("dirt", 2);
  f.put("oak_log", 3);
  let failures = 0;
  f.bot.canDigBlock = (block) => block.name !== "dirt";
  const goto = f.bot.pathfinder.goto;
  f.bot.pathfinder.goto = async (goal) => {
    if (goal.x === 2.5) {
      failures++;
      throw new Error("no path");
    }
    return goto(goal);
  };
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  f.work.enqueue({ kind: "forest", count: 1, scaffold: false });
  await until(f, () => f.work.snapshot.history.length === 2);
  assert.equal(failures, 2);
  assert.equal(f.work.snapshot.history[0].outcome, "частично");
  assert.equal(f.work.snapshot.history[1].outcome, "готово");
});

test("inventory pause survives, then auto-deposit preserves food, tools, equipment and pearls", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("dirt", 2);
  const chest = f.put("chest", 5);
  f.items.push(f.item("iron_pickaxe"), f.item("bread"), f.item("ender_pearl"), {
    ...f.item("cobblestone"),
    count: 64,
  });
  f.setSlots(2);
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  await until(f, () => f.work.snapshot.phase === "paused");
  assert.match(f.work.snapshot.reason, /Инвентарь/);
  const transferred = [];
  f.bot.openContainer = async () => ({
    close() {},
    async deposit(type) {
      const index = f.items.findIndex((v) => v.type === type);
      transferred.push(f.items[index].name);
      f.items.splice(index, 1);
      f.setSlots(8);
    },
  });
  f.work.setChest(chest.position);
  f.work.resume();
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.deepEqual(transferred, ["cobblestone"]);
  assert.equal(f.work.snapshot.history[0].deposited, 64);
  assert.ok(f.items.some((v) => v.name === "bread"));
  assert.ok(f.items.some((v) => v.name === "iron_pickaxe"));
});

test("paused or stopped equipment settles before any following dig can start", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("dirt", 2);
  f.items.push(f.item("diamond_shovel"));
  let release,
    equipStarted = false;
  f.bot.equip = async (item) => {
    equipStarted = true;
    await new Promise((resolve) => {
      release = resolve;
    });
    f.bot.heldItem = item;
  };
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  await until(f, () => equipStarted);
  f.work.pause();
  assert.throws(() => f.work.resume(), /Дождитесь/);
  let stopped = false;
  const stopping = f.work.stop().then(() => {
    stopped = true;
  });
  await delay(15);
  assert.equal(stopped, false);
  assert.equal(f.dug.length, 0);
  release();
  await stopping;
  assert.equal(f.dug.length, 0);
  assert.equal(f.work.snapshot.active, null);
  assert.equal(f.work.snapshot.queue.length, 0);
  assert.equal(f.bot.pathfinder.defaultMoveSettings.canDig, true);
  assert.equal(f.bot.pathfinder.defaultMoveSettings.allowExcavatedDescent, false);
  assert.deepEqual(f.bot.pathfinder.defaultMoveSettings.exclusionAreasBreak, []);
  assert.deepEqual(f.bot.pathfinder.defaultMoveSettings.exclusionAreasPlace, []);
});

test("survival interruption resumes the same job, but an owner pause does not auto-resume", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("dirt", 2);
  f.bot.launcherSurvival = { busy: true };
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  await until(f, () => f.work.snapshot.phase === "paused");
  f.work.pause("Пауза владельца");
  f.bot.launcherSurvival.busy = false;
  for (let i = 0; i < 10; i++) {
    f.bot.emit("physicsTick");
    await delay(2);
  }
  assert.equal(f.dug.length, 0);
  assert.equal(f.work.snapshot.phase, "paused");
  f.work.resume();
  await until(f, () => f.work.snapshot.history.length === 1);
});

test("collect only credits this bot picking up the selected item; competitors do not count", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  const drop = {
    id: 10,
    position: new Vec3(2, 64, 0),
    isValid: true,
    getDroppedItem: () => ({ name: "raw_iron", count: 4 }),
  };
  f.bot.entities[10] = drop;
  f.work.enqueue({ kind: "collect", radius: 8, item: "raw_iron" });
  f.bot.emit("playerCollect", { id: 99 }, drop);
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.work.snapshot.history[0].collected, 4);
});

test("local launcher commands are routed privately, regular text still uses bot chat, errors reach the UI", async () => {
  const chat = [],
    received = [],
    results = [];
  const bot = {
    launcherCommandPrefix: "!",
    chat: (message) => chat.push(message),
    launcherCommand: async (message) => {
      received.push(message);
      if (message === "!invalid") throw new Error("invalid task");
    },
  };
  async function* lines() {
    for (const message of ["!work pause", "hello", "!invalid"])
      yield JSON.stringify({ type: "chat", requestId: message, message });
  }
  await worker.handleLauncherMessages(
    lines(),
    () => bot,
    (type, payload) => results.push({ type, ...payload }),
  );
  assert.deepEqual(chat, ["hello"]);
  assert.deepEqual(received, ["!work pause", "!invalid"]);
  assert.equal(results[2].error, "invalid task");
});

test("named areas and tunnel direction are validated before stopping active movement", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  const replies = [];
  let preparations = 0;
  const hooks = {
    prepare: async () => {
      preparations++;
    },
    reply: (value) => replies.push(value),
  };
  await assert.rejects(
    commands.handleGatheringCommand(f.bot, f.work, "mine", ["unknown"], hooks),
    /Неизвестный/,
  );
  assert.equal(preparations, 0);
  f.work.setCorner("arena", 1, new Vec3(2, 64, 0));
  f.work.setCorner("arena", 2, new Vec3(4, 66, 2));
  assert.equal(commands.taskFromCommand(f.bot, f.work, "quarry", ["arena"]).area.volume, 27);
  const tunnel = commands.taskFromCommand(f.bot, f.work, "tunnel", ["10", "2", "3"]);
  assert.equal(tunnel.area.min.z, -10);
  assert.equal(tunnel.area.max.z, -1);
  assert.equal(tunnel.area.min.y, 64);
  assert.equal(tunnel.area.max.y, 66);
  assert.equal(tunnel.area.volume, 60);
});

test("explicit local commands use the running prefix and can never fall through to public chat", async () => {
  const commands = [],
    chat = [],
    results = [];
  const bot = {
    launcherCommandPrefix: "$",
    launcherCommand: (message) => commands.push(message),
    chat: (message) => chat.push(message),
  };
  async function* lines() {
    yield JSON.stringify({ type: "command", requestId: "task", message: "forest 16 0" });
  }
  await worker.handleLauncherMessages(
    lines(),
    () => bot,
    (type, result) => results.push({ type, ...result }),
  );
  assert.deepEqual(commands, ["$forest 16 0"]);
  assert.deepEqual(chat, []);
  delete bot.launcherCommand;
  await worker.handleLauncherMessages(
    lines(),
    () => bot,
    (type, result) => results.push({ type, ...result }),
  );
  assert.match(results[1].error, /ещё не готовы/);
  assert.deepEqual(chat, []);
});

test("owner commands execute in order, and a rejection does not disable later commands", async () => {
  let release;
  const events = [];
  const handler = worker.createCommandQueue(async (action) => {
    events.push(`${action}:start`);
    if (action === "stop")
      await new Promise((resolve) => {
        release = resolve;
      });
    if (action === "invalid") throw new Error("invalid");
    events.push(`${action}:end`);
  });
  const stopping = handler("stop");
  const starting = handler("mine");
  await delay(10);
  assert.deepEqual(events, ["stop:start"]);
  release();
  await stopping;
  await starting;
  await assert.rejects(handler("invalid"), /invalid/);
  await handler("resume");
  assert.deepEqual(events, [
    "stop:start",
    "stop:end",
    "mine:start",
    "mine:end",
    "invalid:start",
    "resume:start",
    "resume:end",
  ]);
});

test("a pickup that invalidates a dynamic navigation goal is still counted as success", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  const drop = {
    id: 11,
    position: new Vec3(2, 64, 0),
    isValid: true,
    getDroppedItem: () => ({ name: "raw_iron", count: 3 }),
  };
  f.bot.entities[11] = drop;
  const goto = f.bot.pathfinder.goto;
  f.bot.pathfinder.goto = async (goal) => {
    await goto(goal);
    if (goal.trackedEntity) throw new Error("Goal invalidated: entityGone");
  };
  f.work.enqueue({ kind: "collect" });
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.work.snapshot.history[0].collected, 3);
  assert.equal(f.work.snapshot.history[0].outcome, "готово");
});

test("bow defense temporarily pauses gathering and resumes without cancelling its queue", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("dirt", 2);
  f.bot.launcherDefendingBow = true;
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  await until(f, () => f.work.snapshot.phase === "paused");
  assert.match(f.work.snapshot.reason, /стрел/);
  assert.equal(f.dug.length, 0);
  f.bot.launcherDefendingBow = false;
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.dug.length, 1);
});

test("delivery preempts an inventory pause, tosses loot beside the owner and returns to the saved work", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.items.push({ ...f.item("spruce_log"), count: 24 }, f.item("iron_axe"), f.item("bread"));
  f.put("dirt", 2);
  f.setSlots(2);
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  await until(f, () => f.work.snapshot.phase === "paused");
  const origin = f.bot.entity.position.clone();
  const owner = { id: 2, position: new Vec3(8, 64, 0), isValid: true };
  const tossed = [];
  f.bot.lookAt = async () => {};
  const goto = f.bot.pathfinder.goto;
  f.bot.pathfinder.goto = async (goal) => {
    if (goal.trackedEntity === owner) f.bot.entity.position = owner.position.offset(-1, 0, 0);
    else if (goal.distance != null) f.bot.entity.position = origin.clone();
    else return goto(goal);
  };
  f.bot.tossStack = async (item) => {
    assert.ok(f.bot.entity.position.distanceTo(owner.position) <= 3.5);
    tossed.push(item.name);
    f.items.splice(f.items.indexOf(item), 1);
    f.setSlots(30);
  };
  await f.work.deliver(() => owner);
  await until(f, () => f.work.snapshot.history.length === 2);
  assert.deepEqual(tossed, ["spruce_log"]);
  assert.equal(f.work.snapshot.history[0].delivered, 24);
  assert.equal(f.work.snapshot.history[1].mined, 1);
  assert.ok(f.items.some((item) => item.name === "iron_axe"));
  assert.ok(f.items.some((item) => item.name === "bread"));
  assert.equal(f.bot.entity.position.distanceTo(origin), 0);
});

test("delivery retains an explicit owner pause and never tosses when the owner is absent", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("dirt", 2);
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  f.work.pause();
  await f.work.task;
  f.items.push(f.item("spruce_log"));
  await assert.rejects(
    f.work.deliver(() => null),
    /Владелец/,
  );
  let tossed = false;
  f.bot.tossStack = async () => {
    tossed = true;
  };
  f.bot.lookAt = async () => {};
  const owner = { position: f.bot.entity.position.clone(), isValid: true };
  f.bot.pathfinder.goto = async () => {};
  await f.work.deliver(() => owner);
  await until(f, () => f.work.snapshot.history.length === 1 && f.work.snapshot.phase === "paused");
  assert.equal(tossed, true);
  assert.equal(f.work.snapshot.active.kind, "mine");
  assert.match(f.work.snapshot.reason, /владельца/);
  assert.equal(f.dug.length, 0);
});

test("delivery builds outside the mining radius, retains construction blocks and restores movement", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.items.push({ ...f.item("cobbled_deepslate"), count: 64 }, { ...f.item("cobblestone"), count: 20 }, { ...f.item("diamond"), count: 7 }, f.item("iron_pickaxe"));
  const origin = f.bot.entity.position.clone();
  const owner = { position: new Vec3(50, 70, 0), isValid: true };
  const obstacle = f.put("stone", 49, 68);
  const chest = f.put("chest", 49, 69);
  f.setSlots(0);
  f.bot.lookAt = async () => {};
  const tossed = [];
  f.bot.tossStack = async item => { tossed.push([item.name, item.count]); f.items.splice(f.items.indexOf(item), 1); };
  f.bot.pathfinder.goto = async (goal, options) => {
    const movement = f.bot.pathfinder.defaultMoveSettings;
    if (!movement.canDig) {
      assert.equal(movement.canPlace, false);
      assert.equal(movement.allow1by1towers, false);
      throw new Error("Pathfinding failed: noPath");
    }
    assert.equal(movement.canDig, true);
    assert.equal(movement.canPlace, true);
    assert.equal(movement.allow1by1towers, true);
    assert.equal(options.allowMiningPrefix, true);
    assert.equal(movement.exclusionAreasPlace.at(-1)(obstacle), 0);
    assert.equal(movement.exclusionAreasBreak.at(-1)(chest), 1000000);
    if (goal.trackedEntity === owner) {
      assert.equal(movement.exclusionAreasBreak.at(-1)(obstacle), 0);
      await f.bot.dig(obstacle, true, "raycast");
      f.bot.entity.position = owner.position.offset(-1, 0, 0);
    } else f.bot.entity.position = origin.clone();
  };
  await f.work.deliver(() => owner);
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.deepEqual(tossed, [["cobblestone", 20], ["diamond", 7]]);
  assert.equal(f.items.find(item => item.name === "cobbled_deepslate").count, 64);
  assert.equal(f.work.snapshot.history[0].delivered, 27);
  assert.deepEqual(f.bot.pathfinder.defaultMoveSettings.exclusionAreasPlace, []);
  assert.equal(f.bot.pathfinder.defaultMoveSettings.maxDropDown, 3);
});

test("delivery reserves a partial stack and reports missing building material on noPath", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.items.push({ ...f.item("cobblestone"), count: 50 }, { ...f.item("cobbled_deepslate"), count: 50 }, f.item("diamond"));
  const owner = { position: f.bot.entity.position.clone(), isValid: true };
  f.bot.pathfinder.goto = async () => {};
  f.bot.lookAt = async () => {};
  const partial = [];
  f.bot.toss = async (type, metadata, count) => { partial.push([type, count]); };
  f.bot.tossStack = async () => {};
  await f.work.deliver(() => owner);
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.deepEqual(partial, [[f.bot.registry.itemsByName.cobbled_deepslate.id, 36]]);
  f.items.splice(0, 2);
  f.bot.pathfinder.goto = async () => { throw new Error("Pathfinding failed: noPath"); };
  await f.work.deliver(() => owner);
  await until(f, () => f.work.snapshot.phase === "paused");
  assert.match(f.work.snapshot.reason, /строительные блоки/);
});

test("typing forest without a prefix in the launcher runs locally instead of public chat", async () => {
  const sent = [],
    local = [],
    events = [];
  const bot = {
    launcherCommandPrefix: "!",
    launcherBareCommands: commands.COMMANDS,
    launcherCommand: async (message) => local.push(message),
    chat: async (message) => sent.push(message),
  };
  const messages = [
    JSON.stringify({ type: "chat", requestId: "f", message: "forest" }),
    JSON.stringify({ type: "chat", requestId: "s", message: "привет" }),
  ];
  await worker.handleLauncherMessages(
    messages,
    () => bot,
    (type, payload) => events.push({ type, ...payload }),
  );
  assert.deepEqual(local, ["!forest"]);
  assert.deepEqual(sent, ["привет"]);
  assert.ok(events.every((event) => !event.error));
});

test("a scan failure becomes an actionable pause instead of getting stuck at zero", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.bot.findBlocks = () => {
    throw new Error("Сервер ещё не прислал чанки");
  };
  f.work.enqueue({ kind: "forest" });
  await until(f, () => f.work.snapshot.phase === "paused");
  assert.match(f.work.snapshot.reason, /не прислал чанки/);
});

test("health recovery resumes delivery and the interrupted work without a second command", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.bot.health = 6;
  f.put("dirt", 2);
  f.items.push({ ...f.item("spruce_log"), count: 12 }, f.item("bread"));
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  await until(f, () => f.work.snapshot.phase === "paused");
  const owner = { position: f.bot.entity.position.clone(), isValid: true };
  const tossed = [];
  f.bot.pathfinder.goto = async () => {};
  f.bot.lookAt = async () => {};
  f.bot.tossStack = async (item) => {
    tossed.push(item.name);
    f.items.splice(f.items.indexOf(item), 1);
  };
  const id = await f.work.deliver(() => owner);
  await until(f, () => f.work.snapshot.phase === "paused");
  assert.deepEqual(tossed, []);
  assert.equal(await f.work.deliver(() => owner), id, "repeated delivery keeps the same job");
  f.bot.health = 10;
  await until(f, () => f.work.snapshot.history.length === 2);
  assert.deepEqual(tossed, ["spruce_log"]);
  assert.equal(f.work.snapshot.history[0].delivered, 12);
  assert.equal(f.work.snapshot.history[1].mined, 1);
});

test("reachable tree logs are chopped together with one axe selection before chasing drops", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.items.push(f.item("iron_axe"));
  for (let y = 64; y <= 66; y++) f.put("spruce_log", 2, y);
  let scans = 0;
  const find = f.bot.findBlocks;
  f.bot.findBlocks = (options) => {
    scans++;
    return find(options);
  };
  const goto = f.bot.pathfinder.goto;
  f.bot.pathfinder.goto = async (goal) => {
    if (goal.trackedEntity) assert.equal(f.dug.length, 3, "finish nearby logs before collecting");
    return goto(goal);
  };
  f.work.enqueue({ kind: "forest", count: 3, scaffold: false });
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.work.snapshot.history[0].collected, 3);
  assert.deepEqual(f.equipped, ["iron_axe"]);
  assert.equal(scans, 1, "reuse the loaded targets while chopping the tree");
});

test("a stalled approach is stopped and skipped, and the next queued task still runs", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.work.settings.moveTimeoutMs = 30;
  f.put("dirt", 2);
  f.put("oak_log", 3);
  f.bot.canDigBlock = (block) => block.name !== "dirt";
  const goto = f.bot.pathfinder.goto;
  let stopPath,
    attempts = 0;
  f.bot.pathfinder.goto = async (goal) => {
    if (goal.x !== 2.5) return goto(goal);
    attempts++;
    await new Promise((resolve) => {
      stopPath = resolve;
    });
  };
  f.bot.pathfinder.stop = async () => stopPath?.();
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  f.work.enqueue({ kind: "forest", count: 1 });
  await until(f, () => f.work.snapshot.history.length === 2);
  assert.equal(attempts, 2);
  assert.equal(f.work.snapshot.history[0].outcome, "частично");
  assert.match(f.work.snapshot.history[0].reason, /подойти/);
  assert.equal(f.work.snapshot.history[1].mined, 1);
});

test("batch chopping stops as soon as the inventory fills", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  for (let y = 64; y <= 66; y++) f.put("spruce_log", 2, y);
  const dig = f.bot.dig;
  f.bot.dig = async (...args) => {
    await dig(...args);
    f.setSlots(2);
  };
  f.work.enqueue({ kind: "forest", count: 3 });
  await until(f, () => f.work.snapshot.phase === "paused");
  assert.match(f.work.snapshot.reason, /Инвентарь/);
  assert.equal(f.work.snapshot.active.mined, 1);
  assert.equal(f.dug.length, 1);
});

test("batched digging still tracks a delayed drop from an earlier block", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("oak_log", 2);
  f.put("oak_log", 6);
  const emit = f.bot.emit.bind(f.bot);
  f.bot.emit = (name, ...args) => {
    if (name === "itemDrop" && args[0].position.x === 2.5) {
      setTimeout(() => emit(name, ...args), 5);
      return true;
    }
    return emit(name, ...args);
  };
  const dig = f.bot.dig;
  f.bot.dig = async (...args) => {
    await dig(...args);
    if (args[0].position.x === 6) await delay(15);
  };
  f.work.enqueue({ kind: "forest", count: 2 });
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.work.snapshot.history[0].collected, 2);
});

test("health interruption on the way back resumes the return, without delivering twice", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.items.push(f.item("spruce_log"));
  const owner = { position: f.bot.entity.position.clone(), isValid: true };
  let approaches = 0,
    returns = 0,
    tosses = 0;
  f.bot.lookAt = async () => {};
  f.bot.tossStack = async () => {
    tosses++;
  };
  f.bot.pathfinder.goto = async (goal) => {
    if (goal.trackedEntity === owner) approaches++;
    else if (++returns === 1) {
      f.bot.health = 6;
      f.bot.emit("physicsTick");
    }
  };
  await f.work.deliver(() => owner);
  await until(f, () => f.work.snapshot.phase === "paused");
  assert.equal(tosses, 1);
  f.bot.health = 10;
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(approaches, 1);
  assert.equal(returns, 2);
  assert.equal(tosses, 1);
});

test("an explicit owner pause remains after health recovers", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.bot.health = 6;
  f.put("dirt", 2);
  f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  await until(f, () => f.work.snapshot.phase === "paused");
  f.work.pause();
  f.bot.health = 20;
  for (let i = 0; i < 10; i++) {
    f.bot.emit("physicsTick");
    await delay(2);
  }
  assert.equal(f.dug.length, 0);
  assert.equal(f.work.snapshot.phase, "paused");
  assert.match(f.work.snapshot.reason, /владельца/);
});

test("mining scans deep below its horizontal radius and honours explicit heights", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.items.push(f.item("iron_pickaxe"));
  f.put("diamond_ore", 2, -40);
  f.put("diamond_ore", 20, -40);
  f.put("diamond_ore", 2, 50);
  f.work.enqueue({ kind: "mine", blocks: "diamond", radius: 8, count: 1, minY: -50, maxY: -30 });
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.dug.length, 1);
  assert.equal(f.dug[0].position.y, -40);
  assert.equal(f.dug[0].position.x, 2);
});

test("a survival interruption between physics ticks cannot leave an inactive move state", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.items.push(f.item("iron_axe"));
  f.put("spruce_log", 2);
  const dig = f.bot.dig;
  let attempts = 0;
  f.bot.dig = async (...args) => {
    if (++attempts === 1) {
      f.bot.launcherSurvival = { busy: true };
      await Promise.resolve();
      throw new gathering.Interrupted();
    }
    return dig(...args);
  };
  f.work.enqueue({ kind: "forest", count: 1 });
  await until(f, () => f.work.snapshot.phase === "paused");
  f.bot.launcherSurvival.busy = false;
  await until(f, () => f.work.snapshot.history.length === 1);
  assert.equal(f.work.snapshot.history[0].mined, 1);
});

test("queue edits preserve the active job and cancelling it runs the reordered queue", async (t) => {
  const f = fixture();
  t.after(() => f.work.dispose());
  f.put("dirt", 2);
  f.put("oak_log", 3);
  f.work.pause();
  f.bot.health = 6;
  const first = f.work.enqueue({ kind: "mine", blocks: "dirt", count: 1 });
  await until(f, () => f.work.snapshot.phase === "paused");
  const second = f.work.enqueue({ kind: "forest", count: 1 });
  const third = f.work.enqueue({ kind: "collect" });
  const fourth = f.work.enqueue({ kind: "collect" });
  f.work.reorder(third, "up");
  f.work.remove(fourth);
  assert.equal(f.work.snapshot.active.id, first);
  assert.deepEqual(
    f.work.snapshot.queue.map((task) => task.id),
    [third, second],
  );
  assert.ok(f.work.snapshot.queue[1].names.includes("oak_log"));
  f.bot.health = 20;
  await f.work.cancel(first);
  await until(f, () => f.work.snapshot.history.length === 3);
  assert.deepEqual(
    f.work.snapshot.history.map((task) => task.id),
    [first, third, second],
  );
  assert.equal(f.work.snapshot.history[0].outcome, "отменено");
  assert.equal(f.work.snapshot.history[2].mined, 1);
});
