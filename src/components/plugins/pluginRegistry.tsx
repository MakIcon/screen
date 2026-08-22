import { lazy } from "react";
import type { LauncherPluginsSettings } from "../../types";
import blueMapIcon from "../../assets/plugins/bluemap.svg";
import discordIcon from "../../assets/plugins/discord.svg";
import obsMinecraftIcon from "../../assets/plugins/obs-minecraft.svg";
import proxyIcon from "../../assets/plugins/proxy.svg";
import steveFaceIcon from "../../assets/plugins/steve-face.svg";
import type { PluginDefinition } from "./pluginTypes";
import {
  DEFAULT_BLUE_MAP_SETTINGS,
  DEFAULT_DISCORD_RPC_SETTINGS,
  DEFAULT_MINEFLAYER_BOT_SETTINGS,
  DEFAULT_OBS_TELEMETRY_SETTINGS,
  DEFAULT_PROXY_SETTINGS,
  normalizeBlueMapSettings,
  normalizeDiscordRpcSettings,
  normalizeMineflayerBotSettings,
  normalizeObsTelemetrySettings,
  normalizeProxySettings,
} from "./pluginSettings";

export type { PluginDefinition, PluginId } from "./pluginTypes";
export {
  DEFAULT_BLUE_MAP_SETTINGS,
  DEFAULT_DISCORD_RPC_SETTINGS,
  DEFAULT_MINEFLAYER_BOT_SETTINGS,
  DEFAULT_OBS_TELEMETRY_SETTINGS,
  DEFAULT_PROXY_SETTINGS,
  normalizeBlueMapSettings,
  normalizeDiscordRpcSettings,
  normalizeMineflayerBotSettings,
  normalizeObsTelemetrySettings,
  normalizeProxySettings,
};

const DiscordRpcSettings = lazy(() =>
  import("./discordRpc/DiscordRpcPlugin").then((module) => ({
    default: module.DiscordRpcSettings,
  })),
);
const MineflayerBotSettings = lazy(() =>
  import("./mineflayerBot/MineflayerBotPlugin").then((module) => ({
    default: module.MineflayerBotSettings,
  })),
);
const BlueMapSettings = lazy(() =>
  import("./blueMap/BlueMapPlugin").then((module) => ({
    default: module.BlueMapSettings,
  })),
);
const ObsTelemetrySettings = lazy(() =>
  import("./obsTelemetry/ObsTelemetryPlugin").then((module) => ({
    default: module.ObsTelemetrySettings,
  })),
);
const ProxySettings = lazy(() =>
  import("./proxy/ProxyPlugin").then((module) => ({
    default: module.ProxySettings,
  })),
);

export const DEFAULT_LAUNCHER_PLUGINS_SETTINGS: LauncherPluginsSettings = {
  discordRpc: { ...DEFAULT_DISCORD_RPC_SETTINGS },
  mineflayerBot: { ...DEFAULT_MINEFLAYER_BOT_SETTINGS },
  blueMap: { ...DEFAULT_BLUE_MAP_SETTINGS },
  obsTelemetry: { ...DEFAULT_OBS_TELEMETRY_SETTINGS },
  proxy: { ...DEFAULT_PROXY_SETTINGS },
};

export function normalizeLauncherPluginsSettings(value: unknown): LauncherPluginsSettings {
  const draft =
    value && typeof value === "object" ? (value as Partial<LauncherPluginsSettings>) : {};
  return {
    discordRpc: normalizeDiscordRpcSettings(draft.discordRpc),
    mineflayerBot: normalizeMineflayerBotSettings(draft.mineflayerBot),
    blueMap: normalizeBlueMapSettings(draft.blueMap),
    obsTelemetry: normalizeObsTelemetrySettings(draft.obsTelemetry),
    proxy: normalizeProxySettings(draft.proxy),
  };
}

export const PLUGIN_DEFINITIONS: PluginDefinition[] = [
  {
    id: "discordRpc",
    title: "DISCORD RPC",
    tag: "PRESENCE",
    mark: "RPC",
    icon: { src: discordIcon, alt: "Discord" },
    description: "Shows the active build, version, loader and play time in Discord.",
    getEnabled: (plugins) => plugins.discordRpc.enabled,
    getStatus: (plugins) => {
      if (!plugins.discordRpc.enabled) return "OFF";
      return plugins.discordRpc.applicationId.trim() ? "ON" : "NEEDS APP ID";
    },
    setEnabled: (plugins, enabled) => ({
      ...plugins,
      discordRpc: { ...plugins.discordRpc, enabled },
    }),
    SettingsComponent: DiscordRpcSettings,
  },
  {
    id: "mineflayerBot",
    title: "MINEFLAYER BOT",
    tag: "BOT PACKAGE",
    mark: "BOT",
    icon: { src: steveFaceIcon, alt: "Steve face" },
    description: "An isolated, optional Minecraft companion package with owner-only commands.",
    optionalExtensionId: "mineflayer-bot",
    getEnabled: (plugins) => plugins.mineflayerBot.enabled,
    getStatus: (plugins) => {
      if (!plugins.mineflayerBot.enabled) return "OFF";
      if (!plugins.mineflayerBot.host.trim()) return "NEEDS SERVER";
      if (
        plugins.mineflayerBot.botAccountMode === "microsoft" &&
        !plugins.mineflayerBot.botMicrosoftAccountId
      ) {
        return "NEEDS ACCOUNT";
      }
      return "ON";
    },
    setEnabled: (plugins, enabled) => ({
      ...plugins,
      mineflayerBot: { ...plugins.mineflayerBot, enabled },
    }),
    SettingsComponent: MineflayerBotSettings,
  },
  {
    id: "blueMap",
    title: "BLUE MAP",
    tag: "SERVER PACKAGE",
    mark: "MAP",
    icon: { src: blueMapIcon, alt: "BlueMap" },
    description: "Runs an isolated BlueMap server package and opens its local web map.",
    optionalExtensionId: "blue-map-server",
    getEnabled: (plugins) => plugins.blueMap.enabled,
    getStatus: (plugins) => {
      if (!plugins.blueMap.enabled) return "OFF";
      if (!plugins.blueMap.mapUrl.trim()) return "NEEDS URL";
      return plugins.blueMap.cliJarPath.trim() ? "ON" : "NEEDS PACKAGE";
    },
    setEnabled: (plugins, enabled) => ({
      ...plugins,
      blueMap: { ...plugins.blueMap, enabled },
    }),
    SettingsComponent: BlueMapSettings,
  },
  {
    id: "obsTelemetry",
    title: "OBS TELEMETRY",
    tag: "STREAM",
    mark: "OBS",
    icon: { src: obsMinecraftIcon, alt: "OBS Minecraft" },
    description: "Shows live player health, armor, food and coordinates in OBS.",
    getEnabled: (plugins) => plugins.obsTelemetry.enabled,
    getStatus: (plugins) => {
      if (!plugins.obsTelemetry.enabled) return "OFF";
      return plugins.obsTelemetry.port ? "ON" : "NEEDS PORT";
    },
    setEnabled: (plugins, enabled) => ({
      ...plugins,
      obsTelemetry: { ...plugins.obsTelemetry, enabled },
    }),
    SettingsComponent: ObsTelemetrySettings,
  },
  {
    id: "proxy",
    title: "PROXY",
    tag: "NETWORK",
    mark: "PXY",
    icon: { src: proxyIcon, alt: "Proxy network" },
    description: "Tunnels launcher downloads through HTTP, HTTPS or SOCKS5 proxies.",
    getEnabled: (plugins) => plugins.proxy.enabled,
    getStatus: (plugins) => {
      if (!plugins.proxy.enabled) return "OFF";
      return plugins.proxy.url.trim() ? "ON" : "NEEDS URL";
    },
    setEnabled: (plugins, enabled) => ({
      ...plugins,
      proxy: { ...plugins.proxy, enabled },
    }),
    SettingsComponent: ProxySettings,
  },
];
