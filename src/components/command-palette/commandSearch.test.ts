import { describe, expect, it, vi } from "vitest";
import {
  filterPaletteCommands,
  isCommandPaletteShortcut,
  parsePaletteQuery,
  type PaletteCommand,
} from "./commandSearch";

const command = (
  id: string,
  label: string,
  overrides: Partial<PaletteCommand> = {},
): PaletteCommand => ({
  id,
  label,
  icon: "arrow",
  run: vi.fn(),
  ...overrides,
});

describe("catalog scopes", () => {
  it("accepts Russian and English categories without changing the project name", () => {
    expect(parsePaletteQuery("ресурспаки: Faithful 32x")).toEqual({
      kind: "resourcepacks",
      query: "Faithful 32x",
    });
    expect(parsePaletteQuery("resource packs Fresh Animations")).toEqual({
      kind: "resourcepacks",
      query: "Fresh Animations",
    });
    expect(parsePaletteQuery("МОДЫ Sodium")).toEqual({ kind: "mods", query: "Sodium" });
    expect(parsePaletteQuery("shaders: Complementary")).toEqual({
      kind: "shaders",
      query: "Complementary",
    });
    expect(parsePaletteQuery("шейдеры")).toEqual({ kind: "shaders", query: "" });
  });
  it("does not mistake partial words or setting names for content scopes", () => {
    expect(parsePaletteQuery("Sodium")).toEqual({ query: "Sodium" });
    expect(parsePaletteQuery("память")).toEqual({ query: "память" });
    expect(parsePaletteQuery("modern")).toEqual({ query: "modern" });
  });
});

describe("command search", () => {
  it("ranks an exact build name above actions that mention it", () => {
    const commands = [
      command("folder", "Открыть папку", { description: "Sodium" }),
      command("other-build", "Sodium Plus"),
      command("build", "Sodium"),
    ];
    expect(filterPaletteCommands(commands, " SODIUM ").map((item) => item.id)).toEqual([
      "build",
      "other-build",
      "folder",
    ]);
    expect(commands.every((item) => vi.mocked(item.run).mock.calls.length === 0)).toBe(true);
  });

  it("matches Russian and English aliases and build metadata in any word order", () => {
    const folder = command("folder", "Открыть папку", {
      keywords: ["open folder files"],
      description: "Зелёный мир · Fabric · 1.21.1",
    });
    expect(filterPaletteCommands([folder], "folder OPEN")).toEqual([folder]);
    expect(filterPaletteCommands([folder], "папку открыть")).toEqual([folder]);
    expect(filterPaletteCommands([folder], "зеленый   fabric")).toEqual([folder]);
    expect(filterPaletteCommands([folder], "Sodium")).toEqual([]);
  });

  it("preserves default command order and never mutates the supplied list", () => {
    const commands = [command("first", "First"), command("second", "Second")];
    expect(filterPaletteCommands(commands, "  ")).toEqual(commands);
    filterPaletteCommands(commands, "second");
    expect(commands.map((item) => item.id)).toEqual(["first", "second"]);
  });
});

describe("command palette shortcut", () => {
  const event = { code: "KeyK", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
  it("accepts the physical K key with Ctrl or Cmd regardless of keyboard layout", () => {
    expect(isCommandPaletteShortcut(event)).toBe(true);
    expect(isCommandPaletteShortcut({ ...event, ctrlKey: false, metaKey: true })).toBe(true);
  });
  it("rejects typing and unrelated or conflicting shortcuts", () => {
    expect(isCommandPaletteShortcut({ ...event, ctrlKey: false })).toBe(false);
    expect(isCommandPaletteShortcut({ ...event, code: "KeyJ" })).toBe(false);
    expect(isCommandPaletteShortcut({ ...event, shiftKey: true })).toBe(false);
    expect(isCommandPaletteShortcut({ ...event, altKey: true })).toBe(false);
  });
});
