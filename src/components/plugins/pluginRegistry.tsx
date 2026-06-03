import type { LauncherPluginsSettings } from "../../types";
import {
  DEFAULT_DISCORD_RPC_SETTINGS,
  DISCORD_RPC_PLUGIN_DEFINITION,
  normalizeDiscordRpcSettings,
} from "./discordRpc/DiscordRpcPlugin";
import type { PluginDefinition } from "./pluginTypes";

export type { PluginDefinition, PluginId } from "./pluginTypes";
export { DEFAULT_DISCORD_RPC_SETTINGS, normalizeDiscordRpcSettings };

export const DEFAULT_LAUNCHER_PLUGINS_SETTINGS: LauncherPluginsSettings = {
  discordRpc: { ...DEFAULT_DISCORD_RPC_SETTINGS },
};

export function normalizeLauncherPluginsSettings(
  value: unknown,
): LauncherPluginsSettings {
  const draft =
    value && typeof value === "object"
      ? (value as Partial<LauncherPluginsSettings>)
      : {};

  return {
    discordRpc: normalizeDiscordRpcSettings(draft.discordRpc),
  };
}

export const PLUGIN_DEFINITIONS: PluginDefinition[] = [
  DISCORD_RPC_PLUGIN_DEFINITION,
];
