import { describe, expect, it } from "vitest";
import type { MinecraftCatalogEntry } from "../../types";
import { minecraftToken, searchMinecraft, selectMinecraftToken } from "./minecraftSearch";

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
});
