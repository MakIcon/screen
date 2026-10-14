import { describe, expect, it } from "vitest";
import { moveStorageGroup, normalizeStorageGroups, storageCatalog } from "./storageGroups";
import { normalizeMineflayerGatheringSettings } from "../pluginSettings";

describe("storage groups", () => {
  it("survives settings serialization with order, filters, destinations and disabled groups", () => {
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
    ]);
    expect(
      normalizeMineflayerGatheringSettings(JSON.parse(JSON.stringify({ storageGroups: groups })))
        .storageGroups,
    ).toEqual(groups);
    expect(groups[0].filters).toEqual(["#wood", "oak_log"]);
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
