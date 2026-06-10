import type { LauncherPluginsSettings } from "../../types";
import {
  DEFAULT_DISCORD_RPC_SETTINGS,
  DISCORD_RPC_PLUGIN_DEFINITION,
  normalizeDiscordRpcSettings,
} from "./discordRpc/DiscordRpcPlugin";
import {
  DEFAULT_MINEFLAYER_BOT_SETTINGS,
  MINEFLAYER_BOT_PLUGIN_DEFINITION,
  normalizeMineflayerBotSettings,
} from "./mineflayerBot/MineflayerBotPlugin";
import type { PluginDefinition } from "./pluginTypes";

export type { PluginDefinition, PluginId } from "./pluginTypes";
export {
  DEFAULT_DISCORD_RPC_SETTINGS,
  DEFAULT_MINEFLAYER_BOT_SETTINGS,
  normalizeDiscordRpcSettings,
  normalizeMineflayerBotSettings,
};

export const DEFAULT_LAUNCHER_PLUGINS_SETTINGS: LauncherPluginsSettings = {
  discordRpc: { ...DEFAULT_DISCORD_RPC_SETTINGS },
  mineflayerBot: { ...DEFAULT_MINEFLAYER_BOT_SETTINGS },
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
    mineflayerBot: normalizeMineflayerBotSettings(draft.mineflayerBot),
  };
}

export const PLUGIN_DEFINITIONS: PluginDefinition[] = [
  DISCORD_RPC_PLUGIN_DEFINITION,
  MINEFLAYER_BOT_PLUGIN_DEFINITION,
];
