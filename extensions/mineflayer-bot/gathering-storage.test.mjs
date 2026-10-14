import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  normalizeStorageGroups,
  storageGroupForItem,
  matchesFilter,
  containerCapacity,
} from "./gathering-storage.cjs";
const require = createRequire(import.meta.url);
const registry = require("minecraft-data")("26.1.2");
const group = (id, filters) => ({
  id,
  name: id,
  enabled: true,
  filters,
  chests: [{ x: 1, y: 64, z: 0 }],
});

test("wood groups include logs, boards and wooden products without accepting iron or stone", () => {
  for (const name of [
    "oak_log",
    "stripped_spruce_log",
    "warped_stem",
    "bamboo_planks",
    "oak_trapdoor",
    "stick",
    "barrel",
    "cherry_leaves",
  ])
    assert.equal(matchesFilter("#wood", name, registry), true, name);
  for (const name of ["raw_iron", "stone", "iron_trapdoor", "diamond"])
    assert.equal(matchesFilter("#wood", name, registry), false, name);
  assert.equal(matchesFilter("#logs", "stripped_oak_wood", registry), true);
  assert.equal(matchesFilter("#logs", "oak_planks", registry), false);
});

test("block and mineral filters route the actual ore drops and remain separate from ordinary stone", () => {
  for (const name of ["iron_ore", "deepslate_iron_ore", "raw_iron", "raw_iron_block", "iron_ingot"])
    assert.equal(matchesFilter("iron", name, registry), true, name);
  assert.equal(matchesFilter("iron_ore", "raw_iron", registry), true);
  assert.equal(matchesFilter("diamond_ore", "diamond", registry), true);
  assert.equal(matchesFilter("#stone", "cobbled_deepslate", registry), true);
  assert.equal(matchesFilter("#stone", "deepslate_iron_ore", registry), false);
  assert.equal(matchesFilter("#ores", "raw_gold", registry), true);
  assert.equal(matchesFilter("diamond", "diamond_block", registry), false, "an exact item is distinct from its resource family");
  assert.equal(matchesFilter("#diamond", "diamond_block", registry), true);
});

test("specific groups take priority over the general fallback; disabled or empty groups do not route", () => {
  const groups = normalizeStorageGroups([
    group("general", ["#all"]),
    group("wood", ["#wood"]),
    group("oak", ["oak_log"]),
  ]);
  assert.equal(storageGroupForItem(groups, { name: "oak_log" }, registry).id, "wood");
  assert.equal(storageGroupForItem(groups, { name: "diamond" }, registry).id, "general");
  groups[1].enabled = false;
  assert.equal(storageGroupForItem(groups, { name: "oak_log" }, registry).id, "oak");
  groups[2].chests = [];
  assert.equal(storageGroupForItem(groups, { name: "oak_log" }, registry).id, "general");
  assert.equal(
    storageGroupForItem([group("wood", ["#wood"])], { name: "diamond" }, registry),
    null,
  );
});

test("storage configuration deduplicates destinations and rejects invalid or oversized inputs", () => {
  const draft = group("wood", ["minecraft:oak_log", "oak_log"]);
  draft.chests.push({ x: 1, y: 64, z: 0 });
  assert.equal(normalizeStorageGroups([draft])[0].chests.length, 1);
  assert.deepEqual(normalizeStorageGroups([draft])[0].filters, ["oak_log"]);
  assert.throws(() => normalizeStorageGroups([draft, draft]), /уникальный/);
  assert.throws(() => normalizeStorageGroups([{ ...draft, filters: ["#unknown"] }]), /фильтр/);
  assert.throws(
    () => normalizeStorageGroups([{ ...draft, chests: [{ x: 0.5, y: 64, z: 0 }] }]),
    /целые/,
  );
  assert.throws(() => normalizeStorageGroups(Array(33).fill(draft)), /32/);
});

test("container capacity includes free slots and compatible partial stacks, preserving NBT and components", () => {
  const item = { name: "diamond", type: registry.itemsByName.diamond.id, metadata: 0, count: 64 };
  const window = {
    inventoryStart: 3,
    slots: [
      { ...item, count: 60 },
      { ...item, count: 60, components: [{ type: "custom_name", data: "Special" }] },
      null,
      { ...item, count: 64 },
    ],
  };
  assert.equal(containerCapacity(window, item, registry), 68);
  assert.equal(
    containerCapacity({ inventoryStart: 1, slots: [{ ...item, count: 64 }] }, item, registry),
    0,
  );
});
