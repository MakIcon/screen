import { describe, expect, it } from "vitest";
import {
  workflowName,
  readCustomWorkflowName,
  readWorkflowNameVariant,
  findWorkflowNameVariant,
} from "./workflowName";
import { workflowTemplate } from "./workflowDraft";

describe("automatic scenario names", () => {
  it("names the requested result and updates when the item or amount changes", () => {
    const wood = { kind: "forest" as const, count: 4, radius: 16 };
    expect(workflowName([wood, { kind: "craft", item: "wooden_spear", count: 1 }])).toBe(
      "Дерево × 4 → Деревянное копьё",
    );
    expect(workflowName([wood, { kind: "craft", item: "stick", count: 16 }])).toBe(
      "Дерево × 4 → Палки × 16",
    );
    expect(workflowName([{ kind: "craft", item: "stone_spear", count: 2 }])).toBe(
      "Каменное копьё × 2",
    );
  });
  it("keeps only short descriptions and uses a material and purpose for larger plans", () => {
    const steps = [
      { kind: "mine" as const, item: "iron", count: 9 },
      { kind: "smelt" as const, item: "raw_iron", count: 9 },
    ];
    expect(workflowName(steps).length).toBeLessThanOrEqual(36);
    expect(workflowName(steps)).not.toContain("→");
    expect(
      workflowName([{ kind: "collect" }, { kind: "return" }, { kind: "deposit" }]),
    ).not.toContain("→");
    expect(workflowName([])).toBe("Новый сценарий");
  });
  it("gives complex plans compact names without counts, routes or ellipses", () => {
    const steps = workflowTemplate("iron");
    const name = workflowName(steps);
    expect(name.length).toBeLessThanOrEqual(36);
    expect(workflowName(steps.map((step) => ({ ...step, count: 64, radius: 48 })))).toBe(name);
    expect(workflowName([...steps, { kind: "deposit" }])).not.toBe(name);
    expect(
      workflowName([{ kind: "craft", item: "modded_very_long_item_name_".repeat(15) }]).length,
    ).toBeLessThanOrEqual(36);
    for (const kind of [
      "mine",
      "forest",
      "craft",
      "smelt",
      "collect",
      "deposit",
      "return",
    ] as const) {
      const title = workflowName(Array(100).fill({ kind, item: "diamond", count: 256 }));
      expect(title.length).toBeLessThanOrEqual(36);
      expect(title).not.toMatch(/…|→|×|шагов/);
    }
  });
  it("offers many distinct short alternatives and restores the chosen one", () => {
    const steps = workflowTemplate("iron");
    const names = Array.from({ length: 24 }, (_, variant) => workflowName(steps, variant));
    expect(new Set(names).size).toBe(24);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(36);
      const restored = findWorkflowNameVariant(name, steps);
      expect(restored).not.toBeNull();
      expect(workflowName(steps, restored!)).toBe(name);
    }
    expect(readWorkflowNameVariant('{"manual":null,"variant":17}')).toBe(17);
  });
  it("covers distinct wood, food, machinery, building, dimension and resource cases", () => {
    const items = [
      "oak_planks",
      "birch_planks",
      "spruce_planks",
      "jungle_planks",
      "bamboo_planks",
      "cherry_planks",
      "mangrove_planks",
      "pale_oak_planks",
      "iron_pickaxe",
      "golden_sword",
      "diamond_sword",
      "netherite_pickaxe",
      "copper_ingot",
      "redstone",
      "quartz",
      "amethyst_block",
      "obsidian",
      "netherrack",
      "end_stone",
      "sculk",
      "prismarine",
      "blue_ice",
      "glass",
      "terracotta",
      "wheat",
      "white_wool",
      "leather",
      "red_dye",
      "cooked_beef",
    ];
    const names = items.map((item) =>
      workflowName([{ kind: "collect" }, { kind: "craft", item, count: 64 }, { kind: "deposit" }]),
    );
    expect(new Set(names).size).toBeGreaterThanOrEqual(25);
    expect(names.every((name) => name.length <= 36)).toBe(true);
    expect(workflowName([{ kind: "craft", item: "oak_planks" }], 1)).toMatch(/Дубов|Крепк|Лесн/);
    expect(workflowName([{ kind: "craft", item: "spruce_planks" }], 1)).toMatch(
      /Елов|Таёжн|Северн|Хвойн/,
    );
  });
  it("migrates old placeholders to auto while retaining deliberate custom names", () => {
    for (const value of [
      null,
      "Мой сценарий",
      "Без названия",
      "Железные инструменты",
      '{"manual":null}',
    ])
      expect(readCustomWorkflowName(value)).toBeNull();
    expect(readCustomWorkflowName("Экспедиция на север")).toBe("Экспедиция на север");
    expect(readCustomWorkflowName('{"manual":"Снаряжение для шахты"}')).toBe(
      "Снаряжение для шахты",
    );
  });
});
