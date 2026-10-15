import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import {
  isStorage,
  discoverBlocks,
  inspectContents,
  assignStorage,
  chestPartner,
} from "./storage-scan.cjs";
import { matchesFilter, storageGroupForItem } from "./gathering-storage.cjs";

const require = createRequire(import.meta.url);
const { Vec3 } = require("vec3");
const registry = require("minecraft-data")("26.1.2");
const point = (index) => ({ x: index, y: 64, z: 0 });
function record(index, items = [], slots = 27) {
  const position = point(index);
  return {
    name: "chest",
    position,
    positions: [position],
    distance: index,
    ...inspectContents(
      { inventoryStart: slots, slots: [...items, ...Array(slots - items.length).fill(null)] },
      registry,
    ),
  };
}

test("scan categories route valuable drops separately and keep mass materials out of precious storage", () => {
  for (const name of [
    "diamond",
    "raw_gold",
    "emerald_block",
    "netherite_scrap",
    "ancient_debris",
    "enchanted_book",
  ])
    assert.ok(matchesFilter("#valuable", name, registry), name);
  for (const name of ["cobblestone", "dirt", "gravel", "sand", "flint"])
    assert.ok(matchesFilter("#bulk", name, registry), name);
  for (const name of ["diamond_ore", "iron_ore", "raw_iron", "diamond", "oak_log"])
    assert.equal(matchesFilter("#bulk", name, registry), false, name);
  assert.ok(matchesFilter("#food", "bread", registry));
  assert.equal(matchesFilter("#valuable", "raw_iron", registry), false);
});

test("contents determine purpose, mixed contents stay mixed, and player slots are excluded", () => {
  assert.equal(
    record(0, [
      { name: "diamond", count: 4 },
      { name: "raw_gold", count: 12 },
    ]).category,
    "#valuable",
  );
  assert.equal(
    record(0, [
      { name: "oak_log", count: 64 },
      { name: "birch_planks", count: 64 },
    ]).category,
    "#wood",
  );
  assert.equal(
    record(0, [
      { name: "cobblestone", count: 64 },
      { name: "diamond", count: 1 },
    ]).category,
    "mixed",
  );
  const inspection = inspectContents(
    { inventoryStart: 1, slots: [null, { name: "diamond", count: 64 }] },
    registry,
  );
  assert.equal(inspection.category, null);
  assert.equal(inspection.freeSlots, 1);
  assert.deepEqual(inspection.contents, []);
});

test("empty containers reserve the largest share of slots for bulk and a separate chest for valuables", () => {
  const records = Array.from({ length: 8 }, (_, index) => record(index, [], index === 7 ? 54 : 27));
  const result = assignStorage(records);
  const bulk = result.records.filter((entry) => entry.category === "#bulk");
  const valuable = result.records.filter((entry) => entry.category === "#valuable");
  assert.equal(valuable.length, 1);
  assert.ok(
    bulk.some((entry) => entry.totalSlots === 54),
    "double chests go to bulk first",
  );
  const size = (entries) => entries.reduce((sum, entry) => sum + entry.freeSlots, 0);
  for (const category of ["#valuable", "#wood", "#ores", "#food"])
    assert.ok(size(bulk) > size(result.records.filter((entry) => entry.category === category)));
  assert.equal(result.added, 8);
  assert.ok(
    storageGroupForItem(result.groups, { name: "diamond" }, registry).filters.includes("#valuable"),
  );
  assert.ok(
    storageGroupForItem(result.groups, { name: "dirt" }, registry).filters.includes("#bulk"),
  );
});

test("existing contents and manual destinations are preserved, including the other half of a double chest", () => {
  const known = {
    id: "manual",
    name: "Мой склад",
    enabled: false,
    filters: ["oak_log"],
    chests: [point(10)],
  };
  const paired = { ...record(9), positions: [point(9), point(10)] };
  const records = [
    paired,
    record(1, [{ name: "diamond", count: 5 }]),
    record(2, [{ name: "raw_iron", count: 32 }]),
    record(3),
  ];
  const original = structuredClone(known);
  const result = assignStorage(records, [known]);
  assert.deepEqual(result.groups[0], original);
  assert.deepEqual(known, original);
  assert.equal(result.records[0].configured, true);
  assert.equal(result.records[0].label, "Мой склад");
  assert.equal(
    result.groups.flatMap((group) => group.chests).filter((position) => position.x === 9).length,
    0,
  );
  assert.equal(result.records[1].category, "#valuable");
  assert.equal(result.records[2].category, "#ores");
});

test("repeat scans are idempotent and extend automatic groups without creating duplicate groups", () => {
  const first = assignStorage([record(0), record(1), record(2)]);
  const again = assignStorage([record(0), record(1), record(2)], first.groups);
  assert.equal(again.added, 0);
  assert.deepEqual(again.groups, first.groups);
  const expanded = assignStorage([record(0), record(1), record(2), record(3)], first.groups);
  assert.equal(expanded.added, 1);
  assert.equal(expanded.groups.length, first.groups.length);
  assert.equal(expanded.groups.find((group) => group.filters.includes("#bulk")).chests.length, 3);
});

test("unavailable containers are excluded and capacity limits never drop saved groups", () => {
  const known = Array.from({ length: 32 }, (_, index) => ({
    id: `manual${index}`,
    name: "Склад",
    enabled: true,
    filters: ["stone"],
    chests: [point(index + 100)],
  }));
  const result = assignStorage([{ ...record(0), error: "Закрыт" }, record(1), record(2)], known);
  assert.equal(result.groups.length, 32);
  assert.equal(result.added, 0);
  assert.ok(result.warnings.some((value) => value.includes("32 групп")));
  assert.deepEqual(result.groups, known);
});

test("large scans spill over to another bulk group instead of exceeding 32 destinations", () => {
  const result = assignStorage(
    Array.from({ length: 64 }, (_, index) => record(index, [{ name: "cobblestone", count: 1 }])),
  );
  assert.equal(result.added, 64);
  assert.equal(result.groups.length, 2);
  assert.ok(result.groups.every((group) => group.chests.length === 32));
  assert.notEqual(result.groups[0].id, result.groups[1].id);
});

test("discovery identifies supported storage, enforces radius and deduplicates modern double chests", () => {
  const blocks = new Map();
  function block(name, x, properties = {}) {
    const value = {
      name,
      type: registry.blocksByName[name].id,
      position: new Vec3(x, 64, 0),
      getProperties: () => properties,
    };
    blocks.set(value.position.toString(), value);
    return value;
  }
  const left = block("chest", 2, { type: "left", facing: "north" });
  const right = block("chest", 3, { type: "right", facing: "north" });
  block("chest", 4, { type: "single", facing: "north" });
  block("chest", 5, { type: "single", facing: "north" });
  block("barrel", 7);
  block("red_shulker_box", 9);
  block("chest", 50);
  block("ender_chest", 6);
  const bot = {
    registry,
    entity: { position: new Vec3(0, 64, 0) },
    blockAt: (position) => blocks.get(position.toString()),
    findBlocks: ({ matching }) =>
      [...blocks.values()]
        .filter((block) => matching.includes(block.type))
        .map((block) => block.position),
  };
  assert.equal(chestPartner(bot, left), right);
  assert.equal(chestPartner(bot, right), left);
  const results = discoverBlocks(bot, isStorage, 16);
  assert.equal(results.length, 5);
  assert.equal(results[0].positions.length, 2);
  assert.ok(!results.some((block) => block.name === "ender_chest" || block.position.x === 50));
  assert.ok(results.some((block) => block.name === "red_shulker_box"));
});

test("legacy adjacent chest halves are identified without a modern type property", () => {
  const left = {
    name: "chest",
    position: new Vec3(0, 64, 0),
    getProperties: () => ({ facing: "north" }),
  };
  const right = { ...left, position: new Vec3(1, 64, 0) };
  const bot = {
    blockAt: (position) => [left, right].find((block) => block.position.equals(position)),
  };
  assert.equal(chestPartner(bot, left), right);
  assert.equal(chestPartner(bot, right), left);
});
