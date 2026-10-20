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

/** English tab names for the English-only Appearance Studio; the launcher uses `tabs.*` messages. */
export const TAB_TITLE: Record<TabKey, string> = {
  overview: "OVERVIEW",
  instances: "BUILDS",
  mods: "MODRINTH",
  resourcepacks: "PACKS",
  shaders: "SHADERS",
  settings: "SETTINGS",
};

export const TAB_HINT: Record<TabKey, string> = {
  overview: "Choose a build, check your account, then press Play.",
  instances: "Create, import and manage your Minecraft builds.",
  mods: "Find mods on Modrinth and install them into the selected build.",
  resourcepacks: "Browse resource packs and add them to the selected build.",
  shaders: "Browse shaders and install them into an Iris-compatible build.",
  settings: "Configure the launcher, Java, extensions and appearance.",
};

export const LOADER_OPTIONS: LoaderType[] = ["Vanilla", "Fabric", "Quilt", "Forge", "NeoForge"];
export const SOURCE_OPTIONS = ["OFFICIAL"];
