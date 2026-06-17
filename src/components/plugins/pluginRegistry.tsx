import type { LauncherPluginsSettings } from "../../types";
import {
  BLUE_MAP_PLUGIN_DEFINITION,
  DEFAULT_BLUE_MAP_SETTINGS,
  normalizeBlueMapSettings,
} from "./blueMap/BlueMapPlugin";
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
import {
  DEFAULT_OBS_TELEMETRY_SETTINGS,
  OBS_TELEMETRY_PLUGIN_DEFINITION,
  normalizeObsTelemetrySettings,
} from "./obsTelemetry/ObsTelemetryPlugin";
import type { PluginDefinition } from "./pluginTypes";

export type { PluginDefinition, PluginId } from "./pluginTypes";
export {
  DEFAULT_DISCORD_RPC_SETTINGS,
  DEFAULT_BLUE_MAP_SETTINGS,
  DEFAULT_MINEFLAYER_BOT_SETTINGS,
  DEFAULT_OBS_TELEMETRY_SETTINGS,
  normalizeBlueMapSettings,
  normalizeDiscordRpcSettings,
  normalizeMineflayerBotSettings,
  normalizeObsTelemetrySettings,
};

export const DEFAULT_LAUNCHER_PLUGINS_SETTINGS: LauncherPluginsSettings = {
  discordRpc: { ...DEFAULT_DISCORD_RPC_SETTINGS },
  mineflayerBot: { ...DEFAULT_MINEFLAYER_BOT_SETTINGS },
  blueMap: { ...DEFAULT_BLUE_MAP_SETTINGS },
  obsTelemetry: { ...DEFAULT_OBS_TELEMETRY_SETTINGS },
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
    blueMap: normalizeBlueMapSettings(draft.blueMap),
    obsTelemetry: normalizeObsTelemetrySettings(draft.obsTelemetry),
  };
}

export const PLUGIN_DEFINITIONS: PluginDefinition[] = [
  DISCORD_RPC_PLUGIN_DEFINITION,
  MINEFLAYER_BOT_PLUGIN_DEFINITION,
  BLUE_MAP_PLUGIN_DEFINITION,
  OBS_TELEMETRY_PLUGIN_DEFINITION,
];
