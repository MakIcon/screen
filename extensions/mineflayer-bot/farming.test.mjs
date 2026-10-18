import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import farming from "./farming.cjs";
import plan from "./gathering-plan.cjs";
import { createGatheringController } from "./gathering.cjs";
import { taskFromCommand, handleGatheringCommand } from "./gathering-commands.cjs";
import { validateWorkflow } from "./workflow.cjs";

const require = createRequire(import.meta.url);
const { Vec3 } = require("vec3");
const mcData = require("minecraft-data");
const blockFactory = require("prismarine-block");
const key = (p) => `${p.x},${p.y},${p.z}`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fixture(version = "26.1.2") {
  const bot = new EventEmitter();
  bot.registry = mcData(version);
  const Block = blockFactory(bot.registry);
  const blocks = new Map(),
    items = [],
    events = [];
  let nextDrop = 10;
  bot.entity = { id: 1, position: new Vec3(0.5, 64, 0.5), yaw: 0, effects: {}, onGround: true };
  bot.health = 20;
  bot.isAlive = true;
  bot.game = { gameMode: "survival" };
  bot.entities = {};
  function put(name, x, y = 63, z = 0, properties = {}) {
    const data = bot.registry.blocksByName[name];
    const block = Block.fromStateId(data.defaultState);
    block.position = new Vec3(x, y, z);
    const original = block.getProperties();
    block.getProperties = () => ({ ...original, ...properties });
    blocks.set(key(block.position), block);
    return block;
  }
  bot.blockAt = (pos) => {
    const value = blocks.get(key(pos.floored()));
    if (value) return value;
    const air = Block.fromStateId(bot.registry.blocksByName.air.defaultState);
    air.position = pos.floored();
    return air;
  };
  bot.findBlocks = (options) =>
    [...blocks.values()]
      .filter(
        (block) =>
          options.matching.includes(block.type) &&
          block.position.distanceTo(options.point) <= options.maxDistance &&
          (!options.useExtraInfo || options.useExtraInfo(block)),
      )
      .slice(0, options.count)
      .map((block) => block.position);
  const addItem = (name, count = 1, durabilityUsed = 0) => {
    let item = items.find((entry) => entry.name === name && entry.count > 0);
    if (item) item.count += count;
    else {
      item = { name, type: bot.registry.itemsByName[name].id, count, durabilityUsed };
      items.push(item);
    }
    return item;
  };
  bot.inventory = { items: () => items.filter((item) => item.count > 0), emptySlotCount: () => 30 };
  bot.equip = async (item) => {
    bot.heldItem = item;
    events.push(`equip:${item.name}`);
  };
  bot.unequip = async () => {
    bot.heldItem = null;
  };
  bot.canDigBlock = () => true;
  bot.canSeeBlock = () => true;
  bot.stopDigging = () => {};
  bot.clearControlStates = () => {};
  bot.activateBlock = async (block) => {
    events.push(`till:${key(block.position)}`);
    assert.match(bot.heldItem.name, /_hoe$/);
    put("farmland", block.position.x, block.position.y, block.position.z, { moisture: 7 });
  };
  bot.placeBlock = async (soil, face) => {
    assert.deepEqual(face, new Vec3(0, 1, 0));
    const crop = farming.CROPS.find((entry) => entry.seed === bot.heldItem?.name);
    assert.ok(crop);
    assert.equal(bot.blockAt(soil.position.offset(0, 1, 0)).name, "air");
    assert.equal(soil.name, crop.soil || "farmland");
    events.push(`plant:${crop.name}:${key(soil.position)}`);
    bot.heldItem.count--;
    put(crop.block, soil.position.x, soil.position.y + 1, soil.position.z, { age: 0 });
  };
  bot.dig = async (block) => {
    events.push(`harvest:${block.name}`);
    assert.equal(bot.heldItem ?? null, null);
    blocks.delete(key(block.position));
    const crop = farming.CROPS.find(
      (entry) => entry.block === block.name || entry.fruit === block.name,
    );
    const entity = {
      id: nextDrop++,
      position: block.position.offset(0.5, 0, 0.5),
      isValid: true,
      getDroppedItem: () => ({
        name: crop.seed,
        count: 3,
        type: bot.registry.itemsByName[crop.seed].id,
      }),
    };
    bot.entities[entity.id] = entity;
    bot.emit("itemDrop", entity);
  };
  bot.pathfinder = {
    world: {},
    defaultMoveSettings: {
      canDig: true,
      canPlace: true,
      allowSprinting: true,
      walkOnly: false,
      allowJumpSprint: true,
      allowLowCeilingJumps: true,
      maxDropDown: 3,
      exclusionAreasStep: [],
      exclusionAreasBreak: [],
      exclusionAreasPlace: [],
    },
    setMoveOptions(options) {
      Object.assign(this.defaultMoveSettings, options);
    },
    stop: async () => {},
    goto: async (goal) => {
      events.push("move");
      if (goal.trackedEntity) {
        const entity = goal.trackedEntity,
          item = entity.getDroppedItem();
        addItem(item.name, item.count);
        bot.emit("playerCollect", bot.entity, entity);
        entity.isValid = false;
        delete bot.entities[entity.id];
      } else if (goal.canInteractAt) {
        bot.entity.position = new Vec3(goal.x, goal.y + 1, goal.z);
      }
    },
  };
  const originalMovement = { ...bot.pathfinder.defaultMoveSettings };
  const work = createGatheringController(
    bot,
    { dropWaitMs: 0, pickupTimeoutMs: 100, operationTimeoutMs: 300 },
    {},
  );
  const until = async (predicate) => {
    const end = Date.now() + 4000;
    while (!predicate() && Date.now() < end) {
      bot.emit("physicsTick");
      await delay(2);
    }
    assert.ok(predicate(), `Timed out: ${work.status}; ${events.join(",")}`);
  };
  return {
    bot,
    work,
    blocks,
    items,
    events,
    put,
    addItem,
    until,
    originalMovement,
    finish: async () => {
      await until(() => !work.busy);
      return work.snapshot.history.at(-1);
    },
  };
}

for (const version of ["1.20.4", "26.1.2"]) {
  test(`uses actual growth states and keeps immature crops on ${version}`, async () => {
    const f = fixture(version);
    try {
      const task = f.work.validate({ kind: "harvest" });
      for (const crop of farming.CROPS.filter((entry) => !entry.fruit)) {
        const block = f.put(crop.block, 1, 64, 0, { age: crop.age - 1 });
        assert.equal(farming.matureCrop(f.bot, task, block), null);
        block.getProperties = () => ({ age: String(crop.age) });
        assert.equal(farming.matureCrop(f.bot, task, block).name, crop.name);
      }
    } finally {
      await f.work.dispose();
    }
  });

  test(`tills hydrated land then plants through the gathering state machine on ${version}`, async () => {
    const f = fixture(version);
    try {
      f.put("dirt", 1);
      f.put("dirt", -7);
      f.put("water", 3);
      f.addItem("iron_hoe");
      f.addItem("wheat_seeds", 8);
      f.work.enqueue({ kind: "farm", crop: "wheat", radius: 8 });
      const result = await f.finish();
      assert.equal(result.outcome, "готово");
      assert.equal(result.tilled, 1);
      assert.equal(result.planted, 1);
      assert.equal(f.bot.blockAt(new Vec3(1, 64, 0)).name, "wheat");
      assert.equal(f.bot.blockAt(new Vec3(-7, 63, 0)).name, "dirt", "dry land remains intact");
      assert.deepEqual(
        f.events.filter((event) => /^(till|plant):/.test(event)),
        ["till:1,63,0", "plant:wheat:1,63,0"],
      );
      assert.deepEqual(
        f.bot.pathfinder.defaultMoveSettings.allowSprinting,
        f.originalMovement.allowSprinting,
      );
    } finally {
      await f.work.dispose();
    }
  });

  test(`harvests once, picks up seeds and replants after reaching its limit on ${version}`, async () => {
    const f = fixture(version);
    try {
      f.put("farmland", 1);
      f.put("wheat", 1, 64, 0, { age: 7 });
      f.put("farmland", 2);
      f.put("wheat", 2, 64, 0, { age: 6 });
      f.work.enqueue({ kind: "harvest", crop: "wheat", count: 1 });
      const result = await f.finish();
      assert.equal(result.outcome, "готово");
      assert.equal(result.harvested, 1);
      assert.equal(result.planted, 1);
      assert.equal(result.mined, 1, "replacement does not count twice");
      assert.equal(result.collected, 3);
      assert.equal(f.bot.blockAt(new Vec3(1, 64, 0)).getProperties().age, 0);
      assert.equal(f.bot.blockAt(new Vec3(2, 64, 0)).getProperties().age, 6);
    } finally {
      await f.work.dispose();
    }
  });
}

test("plants every supported seed on its required soil", async () => {
  for (const crop of farming.CROPS) {
    const f = fixture();
    try {
      f.put(crop.soil || "farmland", 1);
      f.addItem(crop.seed, 2);
      if (crop.fruit) f.put("dirt", 2);
      f.work.enqueue({ kind: "plant", crop: crop.name, count: 1 });
      assert.equal((await f.finish()).outcome, "готово");
      assert.equal(f.bot.blockAt(new Vec3(1, 64, 0)).name, crop.block);
    } finally {
      await f.work.dispose();
    }
  }
});

test("missing seeds pause the job; adding seeds and resuming completes it", async () => {
  const f = fixture();
  try {
    f.put("farmland", 1);
    f.work.enqueue({ kind: "plant", crop: "carrot", count: 1 });
    assert.equal(f.bot.pathfinder.defaultMoveSettings.walkOnly, true);
    await f.until(() => f.work.snapshot.phase === "paused");
    assert.equal(f.bot.pathfinder.defaultMoveSettings.walkOnly, false);
    assert.match(f.work.snapshot.reason, /Нет carrot/);
    assert.equal(f.events.includes("move"), false);
    f.addItem("carrot", 3);
    await f.until(() => f.work.snapshot.phase === "paused");
    f.work.resume();
    assert.equal(f.bot.pathfinder.defaultMoveSettings.walkOnly, true);
    assert.equal((await f.finish()).planted, 1);
    assert.equal(f.bot.pathfinder.defaultMoveSettings.walkOnly, false);
  } finally {
    await f.work.dispose();
  }
});

test("reserves fruit cells beside stems instead of filling them with other plants", async () => {
  const f = fixture();
  try {
    f.put("farmland", 1);
    f.put("farmland", 2);
    f.put("dirt", 3);
    f.addItem("pumpkin_seeds", 4);
    f.addItem("wheat_seeds", 4);
    f.work.enqueue({ kind: "plant", crop: "pumpkin" });
    const result = await f.finish();
    assert.equal(result.planted, 1);
    assert.equal(f.bot.blockAt(new Vec3(2, 64, 0)).name, "air");
    f.work.enqueue({ kind: "plant", crop: "wheat" });
    assert.equal((await f.finish()).planted, 0);
    assert.equal(f.bot.blockAt(new Vec3(2, 64, 0)).name, "air");
  } finally {
    await f.work.dispose();
  }
});

test("a server refusing tilling is reported as partial work without a false counter", async () => {
  const f = fixture();
  try {
    f.put("dirt", 1);
    f.put("water", 2);
    f.addItem("iron_hoe");
    f.bot.activateBlock = async () => {};
    f.work.enqueue({ kind: "till", count: 1 });
    const result = await f.finish();
    assert.equal(result.outcome, "частично");
    assert.equal(result.tilled, 0);
    assert.match(result.reason, /Сервер не подтвердил вспашку/);
    assert.equal(f.bot.blockAt(new Vec3(1, 63, 0)).name, "dirt");
  } finally {
    await f.work.dispose();
  }
});

test("a worn-out or missing hoe pauses without changing terrain", async () => {
  const f = fixture();
  try {
    f.put("grass_block", 1);
    f.put("water", 2);
    f.addItem("wooden_hoe", 1, f.bot.registry.itemsByName.wooden_hoe.maxDurability - 2);
    f.work.enqueue({ kind: "till" });
    await f.until(() => f.work.snapshot.phase === "paused");
    assert.match(f.work.snapshot.reason, /мотыга/);
    assert.equal(f.bot.blockAt(new Vec3(1, 63, 0)).name, "grass_block");
  } finally {
    await f.work.dispose();
  }
});

test("fruit harvesting preserves stems and decorative pumpkins", async () => {
  const f = fixture();
  try {
    f.put("pumpkin", 1, 64);
    f.put("attached_pumpkin_stem", 2, 64);
    f.put("pumpkin", -2, 64);
    f.work.enqueue({ kind: "harvest", crop: "pumpkin" });
    const result = await f.finish();
    assert.equal(result.harvested, 1);
    assert.equal(result.planted, 0);
    assert.equal(f.bot.blockAt(new Vec3(2, 64, 0)).name, "attached_pumpkin_stem");
    assert.equal(f.bot.blockAt(new Vec3(-2, 64, 0)).name, "pumpkin");
  } finally {
    await f.work.dispose();
  }
});

test("leave mode collects mature crops without planting", async () => {
  const f = fixture();
  try {
    f.put("farmland", 1);
    f.put("potatoes", 1, 64, 0, { age: 7 });
    f.work.enqueue({ kind: "harvest", crop: "potato", replant: false });
    const result = await f.finish();
    assert.equal(result.harvested, 1);
    assert.equal(result.planted, 0);
    assert.equal(f.bot.blockAt(new Vec3(1, 64, 0)).name, "air");
  } finally {
    await f.work.dispose();
  }
});

test("cancelling while equipment is pending prevents late planting", async () => {
  const f = fixture();
  try {
    f.put("farmland", 1);
    f.addItem("wheat_seeds", 3);
    let release,
      entered = false;
    f.bot.equip = () => {
      entered = true;
      return new Promise((resolve) => {
        release = resolve;
      });
    };
    f.work.enqueue({ kind: "plant", crop: "wheat" });
    await f.until(() => entered);
    const stopped = f.work.stop();
    release();
    await stopped;
    assert.equal(f.bot.blockAt(new Vec3(1, 64, 0)).name, "air");
    assert.equal(
      f.events.some((event) => event.startsWith("plant:")),
      false,
    );
  } finally {
    await f.work.dispose();
  }
});

test("rereads the bed after navigation so another player's crop is preserved", async () => {
  const f = fixture();
  try {
    f.put("farmland", 6);
    f.addItem("wheat_seeds", 3);
    f.bot.pathfinder.goto = async () => {
      f.bot.entity.position = new Vec3(6, 64, 0);
      f.put("carrots", 6, 64, 0, { age: 2 });
    };
    f.work.enqueue({ kind: "plant", crop: "wheat" });
    await f.finish();
    assert.equal(f.bot.blockAt(new Vec3(6, 64, 0)).name, "carrots");
    assert.equal(
      f.events.some((event) => event.startsWith("plant:")),
      false,
    );
  } finally {
    await f.work.dispose();
  }
});

test("commands and workflow preserve crop selection and validate before preparing movement", async () => {
  const f = fixture();
  try {
    const spec = taskFromCommand(f.bot, f.work, "harvest", ["beetroot_seeds", "12", "8", "leave"]);
    assert.equal(f.work.validate(spec).crop, "beetroot");
    assert.equal(spec.replant, false);
    const steps = validateWorkflow(
      [
        { kind: "till", count: 0, radius: 8 },
        { kind: "plant", item: "carrot", count: 0, radius: 8 },
        { kind: "harvest", item: "auto", count: 0, radius: 8, replant: false },
      ],
      { bot: f.bot, gathering: f.work },
    );
    assert.equal(steps[2].replant, false);
    let prepared = false;
    await assert.rejects(
      handleGatheringCommand(f.bot, f.work, "plant", ["diamond"], {
        prepare: async () => {
          prepared = true;
        },
        reply: () => {},
      }),
      /Неизвестная культура/,
    );
    assert.equal(prepared, false);
    for (const spec of [
      { kind: "plant", crop: "wheat", radius: 0 },
      { kind: "plant", count: -1 },
      { kind: "harvest", replant: "yes" },
    ])
      assert.throws(() => f.work.validate(spec));
    assert.equal(
      plan.normalizeTask(f.bot, { kind: "plant", crop: "minecraft:wheat_seeds" }).crop,
      "wheat",
    );
  } finally {
    await f.work.dispose();
  }
});
