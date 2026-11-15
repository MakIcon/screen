import { describe, expect, it } from "vitest";
import {
  moveStorageGroup,
  normalizeStorageGroups,
  storageCatalog,
  mergeScannedStorageGroups,
} from "./storageGroups";
import { normalizeMineflayerGatheringSettings } from "../pluginSettings";

describe("storage groups", () => {
  it("keeps all sixty destinations when a scan extends an existing full group", () => {
    const makeGroup = (from: number, length: number) =>
      normalizeStorageGroups([
        {
          id: "auto-scan-bulk",
          name: "Камень",
          enabled: true,
          filters: ["#bulk", "#all"],
          chests: Array.from({ length }, (_, i) => ({ x: from + i, y: 64, z: 0 })),
        },
      ]);
    const current = makeGroup(0, 32),
      found = makeGroup(32, 28);
    const merged = mergeScannedStorageGroups(current, found);
    expect(merged.map((group) => group.chests.length)).toEqual([32, 28]);
    expect(mergeScannedStorageGroups(merged, found)).toEqual(merged);
    expect(current[0].chests).toHaveLength(32);
  });
  it("merges scan results once, keeps edits and disabled groups, and puts auto valuables before auto ores", () => {
    const current = normalizeStorageGroups([
      {
        id: "manual",
        name: "Мои настройки",
        enabled: false,
        filters: ["#wood"],
        chests: [{ x: 1, y: 64, z: 0 }],
      },
      { id: "auto-scan-ores", name: "Руды", filters: ["#ores"], chests: [{ x: 2, y: 64, z: 0 }] },
    ]);
    const scanned = normalizeStorageGroups([
      { ...current[0], name: "Старое имя", enabled: true },
      {
        id: "auto-scan-valuable",
        name: "Ценные ресурсы",
        filters: ["#valuable"],
        chests: [{ x: 3, y: 64, z: 0 }],
      },
      {
        id: "auto-scan-bulk",
        name: "Мусор",
        filters: ["#bulk", "#all"],
        chests: [
          { x: 1, y: 64, z: 0 },
          { x: 4, y: 64, z: 0 },
        ],
      },
    ]);
    const merged = mergeScannedStorageGroups(current, scanned);
    expect(merged[0]).toEqual(current[0]);
    expect(merged.map((group) => group.id)).toEqual([
      "manual",
      "auto-scan-valuable",
      "auto-scan-ores",
      "auto-scan-bulk",
    ]);
    expect(merged[3].chests).toEqual([{ x: 4, y: 64, z: 0 }]);
    expect(mergeScannedStorageGroups(merged, scanned)).toEqual(merged);
    expect(current).toHaveLength(2);
  });
  it("preserves all 100 groups through settings serialization and scan merging", () => {
    const groups = normalizeStorageGroups([
      {
        id: "wood",
        name: "Древесина",
        filters: ["#wood", "minecraft:oak_log"],
        enabled: false,
        chests: [
          { x: -10, y: 64, z: 2 },
          { x: 3, y: 65, z: 4 },
        ],
      },
      ...Array.from({ length: 99 }, (_, index) => ({
        id: `storage-${index}`,
        name: `Склад ${index + 2}`,
        enabled: true,
        filters: ["#all"],
        chests: [{ x: index + 10, y: 64, z: 0 }],
      })),
    ]);
    expect(groups).toHaveLength(100);
    expect(
      normalizeMineflayerGatheringSettings(JSON.parse(JSON.stringify({ storageGroups: groups })))
        .storageGroups,
    ).toEqual(groups);
    expect(groups[0].filters).toEqual(["#wood", "oak_log"]);
    expect(mergeScannedStorageGroups(groups.slice(0, 99), [groups[99]])).toEqual(groups);
  });
  it("discards malformed and duplicate destinations while keeping a group available for editing", () => {
    const groups = normalizeStorageGroups([
      {
        id: "wood",
        name: "",
        filters: ["#wood", "#bad", "oak_log", "oak_log"],
        chests: [
          { x: 1, y: 64, z: 2 },
          { x: 1, y: 64, z: 2 },
          { x: 0.5, y: 64, z: 1 },
        ],
      },
    ]);
    expect(groups[0].name).toBe("");
    expect(groups[0].filters).toEqual(["#wood", "oak_log"]);
    expect(groups[0].chests).toEqual([{ x: 1, y: 64, z: 2 }]);
    expect(normalizeStorageGroups(null)).toEqual([]);
  });
  it("reorders groups without mutating the saved array", () => {
    const groups = normalizeStorageGroups([
      { id: "first", name: "A", filters: [], chests: [] },
      { id: "second", name: "B", filters: [], chests: [] },
    ]);
    expect(moveStorageGroup(groups, "second", -1).map((group) => group.id)).toEqual([
      "second",
      "first",
    ]);
    expect(groups.map((group) => group.id)).toEqual(["first", "second"]);
    expect(moveStorageGroup(groups, "first", -1)).toBe(groups);
  });
  it("adds storage categories to item search without changing the mining catalogue", () => {
    const source = {
      version: "26.1.2",
      entries: [
        {
          name: "wood",
          displayName: "Стволы",
          kind: "group" as const,
          item: false,
          mineable: true,
          texture: "log",
        },
        {
          name: "oak_log",
          displayName: "Oak Log",
          kind: "block" as const,
          item: true,
          mineable: true,
          texture: "log",
        },
      ],
    };
    const result = storageCatalog(source);
    expect(result.entries.find((entry) => entry.name === "#wood")?.displayName).toBe(
      "Всё деревянное",
    );
    expect(result.entries.some((entry) => entry.name === "wood")).toBe(false);
    expect(result.entries.some((entry) => entry.name === "#diamond")).toBe(true);
    expect(source.entries[0].name).toBe("wood");
  });
});
