import { describe, expect, it } from "vitest";
import type { MinecraftCatalogEntry } from "../../types";
import {
  minecraftToken,
  searchMinecraft,
  selectMinecraftToken,
  selectMinecraftEntries,
  minecraftResultSections,
} from "./minecraftSearch";

const entry = (
  name: string,
  kind: MinecraftCatalogEntry["kind"],
  title = name,
): MinecraftCatalogEntry => ({
  name,
  displayName: title,
  kind,
  texture: "data:image/png;base64,",
  item: kind !== "group",
  mineable: kind !== "item",
});
const entries = [
  entry("diamond", "group", "Алмазы · все руды"),
  entry("diamond", "item", "Diamond"),
  entry("diamond_ore", "block", "Diamond Ore"),
  entry("deepslate_diamond_ore", "block", "Deepslate Diamond Ore"),
  entry("diamond_block", "block", "Block of Diamond"),
  entry("diamond_pickaxe", "item", "Diamond Pickaxe"),
  entry("iron_ore", "block", "Iron Ore"),
  entry("dirt", "block", "Dirt"),
];
describe("Minecraft catalogue search", () => {
  it("finds crafting inputs and tools by their Russian names", () => {
    const items = [entry("stick", "item"), entry("iron_pickaxe", "item"), entry("iron_ingot", "item")];
    expect(searchMinecraft(items, "палки", "items")[0].name).toBe("stick");
    expect(searchMinecraft(items, "железная кирка", "items")[0].name).toBe("iron_pickaxe");
    expect(searchMinecraft(items, "слиток", "items")[0].name).toBe("iron_ingot");
  });
  it("finds every diamond match for DIA and keeps mining and item selection usable", () => {
    expect(searchMinecraft(entries, "DIA", "blocks").map((value) => value.name)).toEqual([
      "diamond",
      "diamond_ore",
      "diamond_block",
      "deepslate_diamond_ore",
    ]);
    expect(searchMinecraft(entries, "dia", "items").map((value) => value.name)).toEqual([
      "diamond",
      "diamond_ore",
      "diamond_block",
      "diamond_pickaxe",
      "deepslate_diamond_ore",
    ]);
  });
  it("accepts namespaced IDs, display names and Russian material searches", () => {
    expect(searchMinecraft(entries, "MINECRAFT:diamond_ore", "blocks")[0].name).toBe("diamond_ore");
    expect(searchMinecraft(entries, "diamond ore", "blocks")).toHaveLength(2);
    expect(searchMinecraft(entries, "алмаз", "items")).toHaveLength(5);
    expect(searchMinecraft(entries, "алмазы", "items")).toHaveLength(5);
    expect(searchMinecraft(entries, "missing", "items")).toEqual([]);
  });
  it("replaces the token at the cursor, retaining other selected blocks", () => {
    expect(minecraftToken("iron, DIA,stone", 8, true).query).toBe("DIA");
    expect(selectMinecraftToken("iron, DIA,stone", 8, "diamond", true)).toBe("iron,diamond,stone");
    expect(selectMinecraftToken("iron,DIA", 8, "diamond_ore", true)).toBe("iron,diamond_ore");
    expect(selectMinecraftToken("DIA", 3, "diamond", false)).toBe("diamond");
    expect(minecraftToken("iron,", 5, true).query).toBe("");
  });
  it("replaces selection on a plain click, toggles with Ctrl, and selects Shift ranges", () => {
    const valid = new Set(entries.map((entry) => entry.name));
    expect(selectMinecraftEntries("diamond, dirt", 13, ["iron_ore"], "single", valid)).toBe(
      "iron_ore",
    );
    expect(selectMinecraftEntries("DIA", 3, ["diamond"], "toggle", valid)).toBe("diamond");
    expect(selectMinecraftEntries("dirt, DIA", 9, ["diamond"], "toggle", valid)).toBe(
      "dirt, diamond",
    );
    expect(selectMinecraftEntries("diamond, dirt", 13, ["diamond"], "toggle", valid)).toBe("dirt");
    expect(selectMinecraftEntries("diamond", 7, ["diamond"], "toggle", valid)).toBe("");
    expect(
      selectMinecraftEntries("dirt", 4, ["diamond", "diamond_ore", "diamond"], "range", valid),
    ).toBe("diamond, diamond_ore");
    expect(selectMinecraftEntries("dirt", 4, ["diamond", "diamond_ore"], "add", valid)).toBe(
      "dirt, diamond, diamond_ore",
    );
    expect(
      selectMinecraftEntries(
        "minecraft:diamond, mod:block, DIA",
        33,
        ["diamond_ore"],
        "toggle",
        valid,
      ),
    ).toBe("diamond, mod:block, diamond_ore");
  });
  it("supports explicit section labels, separates groups from blocks and searches descriptions", () => {
    const catalog = [
      entry("dirt", "block"),
      { ...entry("ores", "group", "Руды"), section: "bundles", description: "Все ресурсы" },
      entry("diamond", "group"),
    ];
    const sections = minecraftResultSections(catalog, [
      { id: "bundles", label: "Наборы" },
      { id: "group", label: "Материалы" },
      { id: "block", label: "Блоки" },
    ]);
    expect(sections.map((section) => section.label)).toEqual(["Наборы", "Материалы", "Блоки"]);
    expect(sections[0].entries.map((entry) => entry.name)).toEqual(["ores"]);
    expect(searchMinecraft(catalog, "ресурсы", "blocks").map((entry) => entry.name)).toEqual([
      "ores",
    ]);
  });
});
