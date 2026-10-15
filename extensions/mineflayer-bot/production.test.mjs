import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { planCraft, smeltingRecipe } from "./production-plan.cjs";
import { createProductionController } from "./production.cjs";
import { handleProductionCommand } from "./production-commands.cjs";
import worker from "./worker.cjs";

const require = createRequire(import.meta.url);
const native = createRequire(require.resolve("mineflayer"));
const { Vec3 } = require("vec3");
function fixture(inventory = {}, hooks = {}, version = "26.1.2") {
  const bot = new EventEmitter(),
    registry = require("minecraft-data")(version);
  const Recipe = native("prismarine-recipe")(registry).Recipe;
  const items = [],
    blocks = new Map(),
    crafted = [],
    transferred = [],
    packets = [],
    errors = [];
  const add = (name, count) => {
    const existing = items.find((item) => item.name === name);
    if (existing) existing.count += count;
    else items.push({ name, type: registry.itemsByName[name].id, count, metadata: 0 });
  };
  for (const [name, count] of Object.entries(inventory)) add(name, count);
  Object.assign(bot, {
    registry,
    health: 20,
    isAlive: true,
    game: { gameMode: "survival" },
    entities: {},
    entity: { position: new Vec3(0.5, 64, 0.5), eyeHeight: 1.62 },
    inventory: {
      items: () => items.filter((item) => item.count > 0),
      emptySlotCount: () => 10,
      slots: Array(46).fill(null),
    },
    recipesAll: (id, metadata, table) =>
      Recipe.find(id, metadata).filter((recipe) => table || !recipe.requiresTable),
    findBlocks: ({ matching }) =>
      [...blocks.values()]
        .filter((block) => matching.includes(block.type))
        .map((block) => block.position),
    blockAt: (position) =>
      blocks.get(position.floored().toString()) || { name: "air", position: position.floored() },
    clearControlStates() {},
    setControlState() {},
    waitForTicks: async () => {},
    equip: async () => {},
    pathfinder: {
      stop: async () => {},
      goto: async (goal) => {
        assert.equal(goal.isEnd({ exitPos: new Vec3(30, 64, 30) }), false);
        bot.entity.position = new Vec3(goal.x, goal.y, goal.z + 2);
      },
    },
    _client: Object.assign(new EventEmitter(), {
      write: (name, params) => packets.push({ name, params }),
    }),
    supportFeature: registry.supportFeature,
  });
  function block(name, x = 2, y = 64, z = 0) {
    const value = {
      name,
      type: registry.blocksByName[name].id,
      position: new Vec3(x, y, z),
      boundingBox: "block",
    };
    blocks.set(value.position.toString(), value);
    return value;
  }
  let window;
  bot.activateBlock = async (target) => {
    window = new EventEmitter();
    window.type = `minecraft:${target.name === "crafting_table" ? "crafting" : target.name}`;
    window.id = 1;
    window.inventoryStart =
      {
        crafting_table: 10,
        furnace: 3,
        smoker: 3,
        blast_furnace: 3,
        stonecutter: 2,
        enchanting_table: 2,
        anvil: 3,
        smithing_table: 4,
      }[target.name] || 5;
    window.slots = Array(window.inventoryStart + 36).fill(null);
    window.inventoryEnd = window.slots.length;
    window.close = () => {
      if (bot.currentWindow === window) bot.currentWindow = null;
      bot.emit("windowClose", window);
    };
    bot.currentWindow = window;
    bot.emit("windowOpen", window);
  };
  bot.transfer = async (options) => {
    transferred.push(options);
    const name = registry.items[options.itemType].name;
    const entry = items.find(
      (item) => item.type === options.itemType && item.count >= options.count,
    );
    assert.ok(entry);
    entry.count -= options.count;
    options.window.slots[options.destStart] = {
      name,
      type: options.itemType,
      count: options.count,
    };
  };
  bot.putAway = async (slot) => {
    const entry = window.slots[slot];
    assert.ok(entry);
    add(entry.name, entry.count);
    window.slots[slot] = null;
  };
  const craft = async (recipe, table) => {
    crafted.push({ name: registry.items[recipe.result.id].name, table: Boolean(table) });
    for (const delta of recipe.delta) {
      const name = registry.items[delta.id].name;
      if (delta.count > 0) add(name, delta.count);
      else {
        const item = items.find((item) => item.name === name);
        assert.ok(item && item.count >= -delta.count, `missing ${name}`);
        item.count += delta.count;
      }
    }
  };
  const production = createProductionController(bot, {
    craft,
    onError: (error) => errors.push(error),
    pollMs: 1,
    ...hooks,
  });
  return {
    bot,
    production,
    add,
    block,
    crafted,
    transferred,
    packets,
    errors,
    items,
    get window() {
      return window;
    },
  };
}

for (const version of ["1.20.4", "26.1.2"]) {
  test(`recursive crafting reserves ingredients and rounds output batches on ${version}`, async (t) => {
    const f = fixture({ oak_log: 2 }, {}, version);
    t.after(() => f.production.dispose());
    const initial = structuredClone(f.items);
    const steps = planCraft(f.bot, [{ item: "stick", count: 5 }], "inventory");
    assert.deepEqual(
      steps.map((step) => [step.name, step.times]),
      [
        ["oak_planks", 1],
        ["stick", 2],
      ],
    );
    assert.deepEqual(f.items, initial, "planning never consumes inventory");
    f.production.craft(f.production.prepareCraft("stick", 5, "inventory"));
    await f.production.task;
    assert.equal(f.items.find((item) => item.name === "stick").count, 8);
    assert.ok(f.crafted.every((step) => !step.table));
    assert.equal(f.errors.length, 0);
  });
}

test("plans alternate wood recipes and fails before replacing a job when resources are missing", async (t) => {
  const f = fixture({ birch_log: 1, cobblestone: 3 });
  t.after(() => f.production.dispose());
  const steps = planCraft(f.bot, [{ item: "stone_pickaxe", count: 1 }]);
  assert.equal(steps[0].name, "birch_planks");
  let prepared = 0;
  await assert.rejects(
    handleProductionCommand(f.production, "craft", ["diamond_pickaxe"], {
      prepare: () => prepared++,
      reply() {},
    }),
  );
  assert.equal(prepared, 0);
  assert.equal(f.crafted.length, 0);
  assert.throws(() => f.production.prepareCraft("stone_pickaxe", 1, "inventory"));
});

test("crafts and places a missing table before using the 3x3 recipe", async (t) => {
  const f = fixture({ oak_log: 3, cobblestone: 3 });
  t.after(() => f.production.dispose());
  f.block("stone", 1, 63, 0);
  f.bot.placeBlock = async (support) => {
    f.items.find((item) => item.name === "crafting_table").count--;
    f.block("crafting_table", support.position.x, support.position.y + 1, support.position.z);
  };
  f.production.craft(f.production.prepareCraft("stone_pickaxe", 1, "table"));
  await f.production.task;
  assert.equal(f.errors.length, 0, f.errors[0]?.message);
  assert.ok(f.crafted.some((step) => step.name === "crafting_table" && !step.table));
  assert.ok(f.crafted.some((step) => step.name === "stone_pickaxe" && step.table));
  assert.equal(f.items.find((item) => item.name === "stone_pickaxe").count, 1);
  assert.equal(f.production.busy, false);
});

test("shared ingredients cannot be counted twice across recursive branches", () => {
  const f = fixture({ oak_log: 1 });
  assert.throws(() =>
    planCraft(f.bot, [
      { item: "crafting_table", count: 1, reserve: true },
      { item: "wooden_pickaxe", count: 1 },
    ]),
  );
  return f.production.dispose();
});

test("a carried table reserved for placement cannot also become a crafter ingredient", async (t) => {
  const f = fixture({ crafting_table: 1, iron_ingot: 5, redstone: 2, dropper: 1 });
  t.after(() => f.production.dispose());
  assert.throws(() => f.production.prepareCraft("crafter", 1));
  f.add("oak_planks", 4);
  const plan = f.production.prepareCraft("crafter", 1);
  assert.deepEqual(
    plan.steps.map((step) => step.name),
    ["crafting_table", "crafter"],
  );
});

test("reuses a nearby table and preserves the original material counts during preview", async (t) => {
  const f = fixture({ cobblestone: 3, stick: 2 });
  t.after(() => f.production.dispose());
  f.block("crafting_table");
  const plan = f.production.prepareCraft("stone_pickaxe", 1, "auto");
  assert.equal(plan.steps.length, 1);
  f.production.craft(plan);
  await f.production.task;
  assert.deepEqual(f.crafted, [{ name: "stone_pickaxe", table: true }]);
  assert.equal(f.bot.listenerCount("windowOpen"), 0);
});

test("validates compatible smelting stations and rejects unsuitable inputs", () => {
  const f = fixture();
  assert.deepEqual(smeltingRecipe(f.bot, "beef").stations, ["furnace", "smoker"]);
  assert.equal(smeltingRecipe(f.bot, "raw_iron", "blast_furnace").output.name, "iron_ingot");
  assert.throws(() => smeltingRecipe(f.bot, "sand", "blast_furnace"), /не подходит/);
  assert.throws(() => smeltingRecipe(f.bot, "raw_iron", "smoker"), /не подходит/);
  assert.throws(() => smeltingRecipe(f.bot, "diamond"), /рецепта/);
  return f.production.dispose();
});

test("loads fuel and input, waits for actual output, and recovers unused fuel", async (t) => {
  const f = fixture({ raw_iron: 2, coal: 2 });
  t.after(() => f.production.dispose());
  f.block("furnace");
  const original = f.bot.transfer;
  f.bot.transfer = async (options) => {
    await original(options);
    if (options.destStart === 0)
      setImmediate(() => {
        options.window.slots[0] = null;
        options.window.slots[2] = {
          name: "iron_ingot",
          type: f.bot.registry.itemsByName.iron_ingot.id,
          count: 2,
        };
      });
  };
  f.production.smelt(f.production.prepareSmelt("raw_iron", 2));
  await f.production.task;
  assert.deepEqual(
    f.transferred.map((entry) => [entry.destStart, entry.count]),
    [
      [1, 1],
      [0, 2],
    ],
  );
  assert.equal(f.items.find((item) => item.name === "iron_ingot").count, 2);
  assert.equal(f.items.find((item) => item.name === "coal").count, 2);
  assert.equal(f.errors.length, 0);
  assert.equal(f.bot.currentWindow, null);
});

test("does not overwrite an occupied furnace or start with insufficient fuel", async (t) => {
  const f = fixture({ raw_iron: 16, coal: 1 });
  t.after(() => f.production.dispose());
  f.block("furnace");
  assert.throws(() => f.production.prepareSmelt("raw_iron", 16), /топлива/);
  const activate = f.bot.activateBlock;
  f.bot.activateBlock = async (block) => {
    await activate(block);
    f.window.slots[0] = { name: "sand", count: 5 };
  };
  f.production.smelt(f.production.prepareSmelt("raw_iron", 1));
  await f.production.task;
  assert.equal(f.transferred.length, 0);
  assert.match(f.errors[0].message, /занята/);
});

test("stop cancels smelting promptly and leaves loaded resources in the furnace", async (t) => {
  const f = fixture({ raw_iron: 3, coal: 1 });
  t.after(() => f.production.dispose());
  f.block("furnace");
  f.production.smelt(f.production.prepareSmelt("raw_iron", 3));
  while (f.transferred.length < 2) await new Promise((resolve) => setImmediate(resolve));
  await f.production.stop();
  assert.equal(f.window.slots[0].count, 3);
  assert.equal(f.production.busy, false);
  assert.equal(f.errors.length, 0);
  assert.equal(f.bot.currentWindow, null);
});

test("opening timeout and cancellation clean up listeners and never write into a later window", async (t) => {
  const f = fixture({ stone: 8 }, { operationTimeoutMs: 10 });
  t.after(() => f.production.dispose());
  f.block("stonecutter");
  f.bot.activateBlock = async () => {};
  f.production.station(f.production.prepareStation("stonecutter"));
  await f.production.task;
  assert.equal(f.bot.listenerCount("windowOpen"), 0);
  assert.match(f.errors[0].message, /не открылся/);
  f.production.station(f.production.prepareStation("stonecutter"));
  await new Promise((resolve) => setImmediate(resolve));
  await f.production.stop();
  assert.equal(f.bot.listenerCount("windowOpen"), 0);
  const unrelated = {
    type: "minecraft:anvil",
    close() {
      assert.fail("late window was adopted");
    },
  };
  f.bot.currentWindow = unrelated;
  f.bot.emit("windowOpen", unrelated);
  assert.equal(f.production.snapshot().station, null);
});

test("station transfers are bounded to block slots; selects recipes and renames items", async (t) => {
  const f = fixture({ stone: 8 });
  t.after(() => f.production.dispose());
  f.block("stonecutter");
  f.production.station(f.production.prepareStation("stonecutter"));
  await f.production.task;
  f.production.stationAction("put", ["0", "stone", "4"]);
  await f.production.task;
  assert.equal(f.window.slots[0].count, 4);
  assert.throws(() => f.production.stationAction("put", ["1", "stone"]), /результата/);
  assert.throws(() => f.production.stationAction("take", ["2"]), /Слот/);
  f.production.stationAction("select", ["0"]);
  await f.production.task;
  assert.deepEqual(f.packets.at(-1), {
    name: "enchant_item",
    params: { windowId: 1, enchantment: 0 },
  });
  f.production.stationAction("take", ["0"]);
  await f.production.task;
  assert.equal(f.items.find((item) => item.name === "stone").count, 8);
  f.block("anvil", 1);
  await f.production.stop();
  f.production.station(f.production.prepareStation("anvil"));
  await f.production.task;
  f.production.stationAction("rename", ["Моя", "кирка"]);
  await f.production.task;
  assert.deepEqual(f.packets.at(-1), { name: "name_item", params: { name: "Моя кирка" } });
});

test("enchanting requires real server offers, experience and lapis", async (t) => {
  const f = fixture();
  t.after(() => f.production.dispose());
  f.block("enchanting_table");
  f.production.station(f.production.prepareStation("enchanting_table"));
  await f.production.task;
  assert.throws(() => f.production.stationAction("select", ["0"]), /Положите/);
  f.window.slots[0] = { name: "diamond_pickaxe", count: 1 };
  f.window.slots[1] = { name: "lapis_lazuli", count: 3 };
  f.bot._client.emit("craft_progress_bar", { windowId: 1, property: 2, value: 30 });
  f.bot.experience = { level: 5 };
  assert.throws(() => f.production.stationAction("select", ["2"]), /Не хватает/);
  f.bot.experience.level = 30;
  f.production.stationAction("select", ["2"]);
  await f.production.task;
  assert.equal(f.packets.at(-1).params.enchantment, 2);
});

test("survival interrupts a station session and disposal removes owned listeners", async () => {
  const f = fixture();
  f.block("brewing_stand");
  f.production.station(f.production.prepareStation("brewing_stand"));
  await f.production.task;
  f.production.pauseForSurvival();
  await f.production.task;
  await Promise.resolve();
  assert.equal(f.bot.currentWindow, null);
  await f.production.dispose();
  for (const name of ["death", "end", "windowOpen", "windowClose"])
    assert.equal(f.bot.listenerCount(name), 0);
  assert.equal(f.bot._client.listenerCount("craft_progress_bar"), 0);
});

test(
  "stop cancels an approach even when the navigator's old promise is still pending",
  { timeout: 1000 },
  async (t) => {
    const f = fixture();
    t.after(() => f.production.dispose());
    f.block("stonecutter", 20);
    f.bot.pathfinder.goto = () => new Promise(() => {});
    f.production.station(f.production.prepareStation("stonecutter"));
    await new Promise((resolve) => setImmediate(resolve));
    await f.production.stop();
    assert.equal(f.production.busy, false);
    assert.equal(f.errors.length, 0);
    assert.equal(f.bot.listenerCount("windowOpen"), 0);
  },
);

test("a foreign open window cannot receive inventory crafting clicks", async (t) => {
  const f = fixture({ coal: 2, stick: 2 });
  t.after(() => f.production.dispose());
  f.bot.currentWindow = { type: "minecraft:chest" };
  f.production.craft(f.production.prepareCraft("torch", 4));
  await f.production.task;
  assert.equal(f.crafted.length, 0);
  assert.match(f.errors[0].message, /другое открытое окно/);
});

test("launcher recognizes bare production commands and keeps normal chat", async () => {
  const commands = [],
    sent = [],
    events = [];
  const bot = {
    launcherBareCommands: new Set(["craft", "recipes", "smelt", "station"]),
    launcherCommandPrefix: "!",
    launcherCommand: async (value) => commands.push(value),
    chat: (value) => sent.push(value),
  };
  await worker.handleLauncherMessages(
    ["craft stick 5", "smelt raw_iron 2", "station status", "Привет"].map((message, index) =>
      JSON.stringify({ type: "chat", requestId: String(index), message }),
    ),
    () => bot,
    (type, payload) => events.push({ type, ...payload }),
  );
  assert.deepEqual(commands, ["!craft stick 5", "!smelt raw_iron 2", "!station status"]);
  assert.deepEqual(sent, ["Привет"]);
  assert.ok(events.every((event) => !event.error));
});

test("station scan identifies nearby types without opening blocks or interrupting movement", async (t) => {
  const f = fixture();
  t.after(() => f.production.dispose());
  f.block("crafting_table", 2);
  f.block("furnace", 3);
  f.block("barrel", 5);
  f.block("stone", 4);
  f.block("anvil", 40);
  f.bot.activateBlock = () => assert.fail("discovery must not open a block");
  f.bot.pathfinder.stop = () => assert.fail("discovery must not stop movement");
  let prepared = false;
  await handleProductionCommand(f.production, "station", ["scan", "16"], {
    prepare: () => (prepared = true),
    reply() {},
  });
  assert.equal(prepared, false);
  assert.deepEqual(
    f.production.snapshot().nearbyScan.blocks.map((block) => block.name),
    ["crafting_table", "furnace", "barrel"],
  );
  assert.equal(f.production.busy, false);
});

function scanContainerWindows(f, contents, inaccessible = new Set()) {
  f.bot.activateBlock = async (block) => {
    if (inaccessible.has(block.position.x)) throw new Error("Нет доступа к сундуку");
    const window = Object.assign(new EventEmitter(), {
      id: 1,
      type: "minecraft:generic_9x3",
      inventoryStart: 27,
      inventoryEnd: 63,
      slots: [
        ...(contents[block.position.x] || []),
        ...Array(63 - (contents[block.position.x]?.length || 0)).fill(null),
      ],
      close() {
        f.bot.currentWindow = null;
        f.bot.emit("windowClose", window);
      },
    });
    f.bot.currentWindow = window;
    f.bot.emit("windowOpen", window);
  };
  f.bot.transfer = () => assert.fail("scanning must not move items");
  f.bot.putAway = () => assert.fail("scanning must not take items");
}

test("storage scan reads contents, skips inaccessible chests and applies groups only after completion", async (t) => {
  const f = fixture();
  t.after(() => f.production.dispose());
  for (const x of [1, 2, 3, 4, 5]) f.block("chest", x);
  const configured = {
    id: "manual",
    name: "Старый склад",
    enabled: true,
    filters: ["#wood"],
    chests: [{ x: 1, y: 64, z: 0 }],
  };
  f.bot.launcherGathering = { settings: { storageGroups: [configured] } };
  const applied = [];
  f.bot.launcherConfigureStorage = (groups) => applied.push(groups);
  scanContainerWindows(f, { 2: [{ name: "diamond", count: 12 }] }, new Set([5]));
  await handleProductionCommand(f.production, "stash", ["scan", "16"], {
    prepare: async () => true,
    reply() {},
  });
  assert.equal(applied.length, 0);
  await f.production.task;
  const scan = f.production.snapshot().storageScan;
  assert.equal(scan.state, "complete");
  assert.equal(scan.total, 5);
  assert.equal(scan.added, 3);
  assert.equal(scan.records[0].configured, true);
  assert.equal(scan.records[1].category, "#valuable");
  assert.match(scan.records.at(-1).error, /Нет доступа/);
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0][0], configured);
  assert.equal(f.bot.currentWindow, null);
  assert.equal(f.bot.listenerCount("windowOpen"), 0);
  assert.equal(f.errors.length, 0);
  await handleProductionCommand(f.production, "stash", ["scan", "saved", String(scan.id)], {
    reply() {},
  });
  assert.equal(scan.saved, true);
});

test("cancelling a chest scan leaves existing groups intact and marks a partial result", async (t) => {
  const f = fixture();
  t.after(() => f.production.dispose());
  f.block("chest", 2);
  f.bot.activateBlock = async () => {};
  f.bot.launcherConfigureStorage = () => assert.fail("cancelled scans must not apply groups");
  f.production.scanStorage(f.production.prepareStorageScan(16));
  await new Promise((resolve) => setImmediate(resolve));
  await f.production.stop();
  assert.equal(f.production.snapshot().storageScan.state, "cancelled");
  assert.equal(f.bot.listenerCount("windowOpen"), 0);
  assert.equal(f.production.busy, false);
});

test("invalid scan requests keep the active task and ordinary stash commands keep their handler", async (t) => {
  const f = fixture();
  t.after(() => f.production.dispose());
  let preparations = 0;
  const hooks = { prepare: () => preparations++, reply() {} };
  await assert.rejects(
    handleProductionCommand(f.production, "stash", ["scan", "500"], hooks),
    /Радиус/,
  );
  assert.equal(preparations, 0);
  assert.equal(await handleProductionCommand(f.production, "stash", ["pick"], hooks), false);
});
