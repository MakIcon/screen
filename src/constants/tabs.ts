import type { LoaderType, TabKey } from "../types.ts";

export const TAB_ORDER: TabKey[] = [
  "overview",
  "instances",
  "mods",
  "resourcepacks",
  "shaders",
  "settings",
];

export const TAB_INDEX: Record<TabKey, string> = {
  overview: "01.",
  instances: "02.",
  mods: "03.",
  resourcepacks: "04.",
  shaders: "05.",
  settings: "06.",
};

export const TAB_TITLE: Record<TabKey, string> = {
  overview: "OVERVIEW",
  instances: "BUILDS",
  mods: "MODRINTH",
  resourcepacks: "PACKS",
  shaders: "SHADERS",
  settings: "SETTINGS",
};

export const LOADER_OPTIONS: LoaderType[] = ["Vanilla", "Fabric", "Quilt", "NeoForge"];
export const SOURCE_OPTIONS = ["OFFICIAL"];
