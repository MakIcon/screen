import type {
  BlueMapPluginSettings,
  DiscordRpcPluginSettings,
  MineflayerBotPluginSettings,
  MineflayerCombatSettings,
  ObsTelemetryPluginSettings,
  ProxyPluginSettings,
} from "../../types";
import combatDefaults from "../../../extensions/mineflayer-bot/combat-defaults.json";

export const DEFAULT_MINEFLAYER_COMBAT_SETTINGS = combatDefaults as MineflayerCombatSettings;

export function normalizeMineflayerCombatSettings(value: unknown): MineflayerCombatSettings {
  const draft = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_MINEFLAYER_COMBAT_SETTINGS };
  const choices: Record<string, string[]> = {
    engine: ["custom", "basic"],
    style: ["auto", "melee", "ranged"],
    autoTarget: ["manual", "hostile"],
    weapon: ["sword", "axe"],
    strafe: ["off", "intelligent", "circle", "random"],
    criticals: ["off", "hop", "shorthop"],
    sprintTap: ["off", "wtap", "stap", "sprintcancel"],
    bowEngine: ["custom", "hawkeye"],
  };
  const bounds: Record<string, [number, number]> = {
    targetRange: [4, 128],
    reactionMs: [0, 3000],
    meleeSkill: [0, 100],
    cps: [1, 20],
    attackRange: [1, 3],
    smoothAimSpeed: [10, 300],
    bowAccuracy: [0, 100],
    bowRange: [4, 120],
    bowIntervalMs: [1200, 10000],
  };
  const normalized = result as unknown as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(result)) {
    if (typeof fallback === "boolean") normalized[key] = normalizeBoolean(draft[key], fallback);
    else if (choices[key]) {
      if (typeof draft[key] === "string" && choices[key].includes(draft[key]))
        normalized[key] = draft[key];
    } else if (typeof draft[key] === "number" && Number.isFinite(draft[key])) {
      const numeric = ["attackRange", "targetRange", "bowRange"].includes(key)
        ? draft[key]
        : Math.round(draft[key]);
      normalized[key] = Math.max(bounds[key][0], Math.min(bounds[key][1], numeric));
    }
  }
  return result;
}

export const DEFAULT_DISCORD_RPC_SETTINGS: DiscordRpcPluginSettings = {
  enabled: false,
  applicationId: "",
  displayMode: "minecraft",
  activityNameTemplate: "",
  detailsTemplate: "Playing %build_name%",
  stateTemplate: "%build_version% / %build_loader% via ScreenLauncher",
  launcherDetailsTemplate: "In ScreenLauncher",
  launcherStateTemplate: "Managing %total_builds% builds",
  combinedDetailsTemplate: "Playing %build_name%",
  combinedStateTemplate: "%build_version% / %build_loader% via ScreenLauncher",
  showElapsedTime: true,
  largeImageKey: "",
  largeImageTextTemplate: "ScreenLauncher",
  smallImageKey: "",
  smallImageTextTemplate: "Minecraft %build_version%",
  buttonLabel: "",
  buttonUrl: "",
};

export const DEFAULT_MINEFLAYER_BOT_SETTINGS: MineflayerBotPluginSettings = {
  enabled: false,
  host: "",
  port: 25565,
  version: "",
  commandPrefix: "!",
  commandSource: "both",
  extraOwners: "",
  commandCooldownMs: 500,
  sendChatFeedback: true,
  allowSayCommand: false,
  allowQuitCommand: true,
  botAccountMode: "offline",
  botNickname: "SCREEN_BOT",
  botMicrosoftAccountId: null,
  followDistance: 3,
  gotoRadius: 1,
  allowSprinting: true,
  allowParkour: true,
  canDig: false,
  maxDropDown: 3,
  stayOnWater: true,
  autoFollowOnSpawn: false,
  announceOnSpawn: false,
  spawnMessage: "Ready, %owner%!",
  autoReconnect: true,
  reconnectDelaySeconds: 5,
  maxReconnectAttempts: 10,
  connectTimeoutSeconds: 30,
  autoRespawn: true,
  logPathUpdates: false,
  combat: { ...DEFAULT_MINEFLAYER_COMBAT_SETTINGS },
};

export const DEFAULT_BLUE_MAP_SETTINGS: BlueMapPluginSettings = {
  enabled: false,
  mapUrl: "http://127.0.0.1:8100/",
  cliJarPath: "",
  workingDir: "",
  javaPath: "java",
  renderOnStart: true,
  updateOnStart: true,
};

export const DEFAULT_OBS_TELEMETRY_SETTINGS: ObsTelemetryPluginSettings = {
  enabled: false,
  port: 18991,
};

export const DEFAULT_PROXY_SETTINGS: ProxyPluginSettings = {
  enabled: false,
  url: "",
  bypass: "",
};

function normalizeText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(Math.round(parsed), maximum));
}

export function normalizeDiscordRpcSettings(value: unknown): DiscordRpcPluginSettings {
  const draft =
    value && typeof value === "object" ? (value as Partial<DiscordRpcPluginSettings>) : {};
  const defaults = DEFAULT_DISCORD_RPC_SETTINGS;
  const displayMode = ["minecraft", "launcher", "combined"].includes(String(draft.displayMode))
    ? (draft.displayMode as DiscordRpcPluginSettings["displayMode"])
    : defaults.displayMode;

  return {
    enabled: normalizeBoolean(draft.enabled, defaults.enabled),
    applicationId: normalizeText(draft.applicationId, defaults.applicationId),
    displayMode,
    activityNameTemplate: normalizeText(draft.activityNameTemplate, defaults.activityNameTemplate),
    detailsTemplate: normalizeText(draft.detailsTemplate, defaults.detailsTemplate),
    stateTemplate: normalizeText(draft.stateTemplate, defaults.stateTemplate),
    launcherDetailsTemplate: normalizeText(
      draft.launcherDetailsTemplate,
      defaults.launcherDetailsTemplate,
    ),
    launcherStateTemplate: normalizeText(
      draft.launcherStateTemplate,
      defaults.launcherStateTemplate,
    ),
    combinedDetailsTemplate: normalizeText(
      draft.combinedDetailsTemplate,
      defaults.combinedDetailsTemplate,
    ),
    combinedStateTemplate: normalizeText(
      draft.combinedStateTemplate,
      defaults.combinedStateTemplate,
    ),
    showElapsedTime: normalizeBoolean(draft.showElapsedTime, defaults.showElapsedTime),
    largeImageKey: normalizeText(draft.largeImageKey, defaults.largeImageKey),
    largeImageTextTemplate: normalizeText(
      draft.largeImageTextTemplate,
      defaults.largeImageTextTemplate,
    ),
    smallImageKey: normalizeText(draft.smallImageKey, defaults.smallImageKey),
    smallImageTextTemplate: normalizeText(
      draft.smallImageTextTemplate,
      defaults.smallImageTextTemplate,
    ),
    buttonLabel: normalizeText(draft.buttonLabel, defaults.buttonLabel),
    buttonUrl: normalizeText(draft.buttonUrl, defaults.buttonUrl),
  };
}

export function normalizeMineflayerBotSettings(value: unknown): MineflayerBotPluginSettings {
  const draft =
    value && typeof value === "object" ? (value as Partial<MineflayerBotPluginSettings>) : {};
  const defaults = DEFAULT_MINEFLAYER_BOT_SETTINGS;
  return {
    enabled: normalizeBoolean(draft.enabled, defaults.enabled),
    host: normalizeText(draft.host, defaults.host),
    port: normalizeInteger(draft.port, defaults.port, 1, 65535),
    version: normalizeText(draft.version, defaults.version),
    commandPrefix: normalizeText(draft.commandPrefix, defaults.commandPrefix),
    commandSource:
      draft.commandSource === "chat" || draft.commandSource === "whisper"
        ? draft.commandSource
        : "both",
    extraOwners: normalizeText(draft.extraOwners, defaults.extraOwners),
    commandCooldownMs: normalizeInteger(
      draft.commandCooldownMs,
      defaults.commandCooldownMs,
      0,
      10_000,
    ),
    sendChatFeedback: normalizeBoolean(draft.sendChatFeedback, defaults.sendChatFeedback),
    allowSayCommand: normalizeBoolean(draft.allowSayCommand, defaults.allowSayCommand),
    allowQuitCommand: normalizeBoolean(draft.allowQuitCommand, defaults.allowQuitCommand),
    botAccountMode: draft.botAccountMode === "microsoft" ? "microsoft" : "offline",
    botNickname: normalizeText(draft.botNickname, defaults.botNickname),
    botMicrosoftAccountId:
      typeof draft.botMicrosoftAccountId === "string" ? draft.botMicrosoftAccountId : null,
    followDistance: normalizeInteger(draft.followDistance, defaults.followDistance, 1, 16),
    gotoRadius: normalizeInteger(draft.gotoRadius, defaults.gotoRadius, 1, 16),
    allowSprinting: normalizeBoolean(draft.allowSprinting, defaults.allowSprinting),
    allowParkour: normalizeBoolean(draft.allowParkour, defaults.allowParkour),
    canDig: normalizeBoolean(draft.canDig, defaults.canDig),
    maxDropDown: normalizeInteger(draft.maxDropDown, defaults.maxDropDown, 1, 16),
    stayOnWater: normalizeBoolean(draft.stayOnWater, defaults.stayOnWater),
    autoFollowOnSpawn: normalizeBoolean(draft.autoFollowOnSpawn, defaults.autoFollowOnSpawn),
    announceOnSpawn: normalizeBoolean(draft.announceOnSpawn, defaults.announceOnSpawn),
    spawnMessage: normalizeText(draft.spawnMessage, defaults.spawnMessage),
    autoReconnect: normalizeBoolean(draft.autoReconnect, defaults.autoReconnect),
    reconnectDelaySeconds: normalizeInteger(
      draft.reconnectDelaySeconds,
      defaults.reconnectDelaySeconds,
      1,
      300,
    ),
    maxReconnectAttempts: normalizeInteger(
      draft.maxReconnectAttempts,
      defaults.maxReconnectAttempts,
      0,
      100,
    ),
    connectTimeoutSeconds: normalizeInteger(
      draft.connectTimeoutSeconds,
      defaults.connectTimeoutSeconds,
      5,
      300,
    ),
    autoRespawn: normalizeBoolean(draft.autoRespawn, defaults.autoRespawn),
    logPathUpdates: normalizeBoolean(draft.logPathUpdates, defaults.logPathUpdates),
    combat: normalizeMineflayerCombatSettings(draft.combat),
  };
}

export function normalizeBlueMapSettings(value: unknown): BlueMapPluginSettings {
  const draft = value && typeof value === "object" ? (value as Partial<BlueMapPluginSettings>) : {};
  const defaults = DEFAULT_BLUE_MAP_SETTINGS;
  return {
    enabled: normalizeBoolean(draft.enabled, defaults.enabled),
    mapUrl: normalizeText(draft.mapUrl, defaults.mapUrl),
    cliJarPath: normalizeText(draft.cliJarPath, defaults.cliJarPath),
    workingDir: normalizeText(draft.workingDir, defaults.workingDir),
    javaPath: normalizeText(draft.javaPath, defaults.javaPath),
    renderOnStart: normalizeBoolean(draft.renderOnStart, defaults.renderOnStart),
    updateOnStart: normalizeBoolean(draft.updateOnStart, defaults.updateOnStart),
  };
}

export function normalizeObsTelemetrySettings(value: unknown): ObsTelemetryPluginSettings {
  const draft =
    value && typeof value === "object" ? (value as Partial<ObsTelemetryPluginSettings>) : {};
  return {
    enabled: normalizeBoolean(draft.enabled, DEFAULT_OBS_TELEMETRY_SETTINGS.enabled),
    port: normalizeInteger(draft.port, DEFAULT_OBS_TELEMETRY_SETTINGS.port, 1, 65535),
  };
}

export function normalizeProxySettings(value: unknown): ProxyPluginSettings {
  const draft = value && typeof value === "object" ? (value as Partial<ProxyPluginSettings>) : {};
  return {
    enabled: normalizeBoolean(draft.enabled, DEFAULT_PROXY_SETTINGS.enabled),
    url: normalizeText(draft.url, DEFAULT_PROXY_SETTINGS.url),
    bypass: normalizeText(draft.bypass, DEFAULT_PROXY_SETTINGS.bypass),
  };
}
