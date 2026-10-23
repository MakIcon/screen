import type {
  BlueMapPluginSettings,
  DiscordRpcPluginSettings,
  MineflayerBotPluginSettings,
  MineflayerCombatSettings,
  MineflayerSurvivalSettings,
  MineflayerGatheringSettings,
  ObsTelemetryPluginSettings,
  ProxyPluginSettings,
} from "../../types";
import combatDefaults from "../../../extensions/mineflayer-bot/combat-defaults.json";
import survivalDefaults from "../../../extensions/mineflayer-bot/survival-defaults.json";
import gatheringDefaults from "../../../extensions/mineflayer-bot/gathering-defaults.json";
import { normalizeStorageGroups } from "./mineflayerBot/storageGroups";

export const DEFAULT_MINEFLAYER_COMBAT_SETTINGS = combatDefaults as MineflayerCombatSettings;
export const DEFAULT_MINEFLAYER_SURVIVAL_SETTINGS = survivalDefaults as MineflayerSurvivalSettings;
export const DEFAULT_MINEFLAYER_GATHERING_SETTINGS: MineflayerGatheringSettings = {
  ...gatheringDefaults,
};

export function normalizeMineflayerGatheringSettings(value: unknown): MineflayerGatheringSettings {
  const draft =
    value && typeof value === "object" ? (value as Partial<MineflayerGatheringSettings>) : {};
  const defaults = DEFAULT_MINEFLAYER_GATHERING_SETTINGS;
  return {
    tunnelWidth: normalizeInteger(draft.tunnelWidth, defaults.tunnelWidth, 1, 3),
    tunnelHeight: normalizeInteger(draft.tunnelHeight, defaults.tunnelHeight, 2, 4),
    stairWidth: normalizeInteger(draft.stairWidth, defaults.stairWidth, 1, 3),
    stairHeight: normalizeInteger(draft.stairHeight, defaults.stairHeight, 3, 4),
    placeTorches: normalizeBoolean(draft.placeTorches, defaults.placeTorches),
    torchInterval: normalizeInteger(draft.torchInterval, defaults.torchInterval, 4, 16),
    defendMobs: normalizeBoolean(draft.defendMobs, defaults.defendMobs),
    defendPlayers: normalizeBoolean(draft.defendPlayers, defaults.defendPlayers),
    defendArrows: normalizeBoolean(draft.defendArrows, defaults.defendArrows),
    storageGroups: normalizeStorageGroups(draft.storageGroups),
  };
}

export function normalizeMineflayerSurvivalSettings(value: unknown): MineflayerSurvivalSettings {
  const draft = value && typeof value === "object" ? value as Partial<MineflayerSurvivalSettings> : {};
  const defaults = DEFAULT_MINEFLAYER_SURVIVAL_SETTINGS;
  return {
    autoEat: normalizeBoolean(draft.autoEat, defaults.autoEat),
    autoEatMinHunger: normalizeInteger(draft.autoEatMinHunger, defaults.autoEatMinHunger, 1, 19),
    autoEatMinHealth: normalizeInteger(draft.autoEatMinHealth, defaults.autoEatMinHealth, 1, 20),
    autoEatPriority: draft.autoEatPriority === "foodPoints" ? "foodPoints" : "saturation",
    autoBuff: normalizeBoolean(draft.autoBuff, defaults.autoBuff),
    autoBuffHealing: normalizeBoolean(draft.autoBuffHealing, defaults.autoBuffHealing),
    autoBuffCombat: normalizeBoolean(draft.autoBuffCombat, defaults.autoBuffCombat),
    autoBuffMinHealth: normalizeInteger(draft.autoBuffMinHealth, defaults.autoBuffMinHealth, 1, 20),
    emergencyMlg: normalizeBoolean(draft.emergencyMlg, defaults.emergencyMlg),
    mlgMinFallHeight: normalizeInteger(draft.mlgMinFallHeight, defaults.mlgMinFallHeight, 4, 32),
    mlgPickupWater: normalizeBoolean(draft.mlgPickupWater, defaults.mlgPickupWater),
  };
}

export function normalizeMineflayerCombatSettings(value: unknown): MineflayerCombatSettings {
  const draft = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_MINEFLAYER_COMBAT_SETTINGS };
  const choices: Record<string, string[]> = {
    engine: ["custom", "basic"],
    style: ["auto", "melee", "ranged", "crystal"],
    autoTarget: ["manual", "hostile"],
    weapon: ["sword", "axe", "mace"],
    strafe: ["off", "intelligent", "circle", "random"],
    criticals: ["off", "hop", "shorthop"],
    sprintTap: ["off", "wtap", "stap", "sprintcancel"],
    bowEngine: ["custom", "hawkeye"],
    crystalPriority: ["damage", "closest"],
    crystalCoverBlock: ["auto", "obsidian", "planks", "cobblestone"],
    bowDefenseMode: ["early", "trajectory"],
  };
  const bounds: Record<string, [number, number]> = {
    bowDefenseCheckMs: [0, 500],
    bowDefenseRange: [4, 128],
    bowDefenseMargin: [0, 2],
    bowDefenseHoldMs: [100, 2000],
    crystalMaxCoverBlocks: [0, 4],
    crystalSpawnTimeoutMs: [300, 5000],
    crystalRetries: [1, 5],
    targetRange: [4, 128],
    reactionMs: [0, 3000],
    meleeSkill: [0, 100],
    cps: [1, 20],
    attackRange: [1, 3],
    smoothAimSpeed: [10, 300],
    bowAccuracy: [0, 100],
    bowRange: [4, 120],
    bowIntervalMs: [1200, 10000],
    crystalPlaceRange: [1, 4.5],
    crystalBreakRange: [1, 4.5],
    crystalMinDamage: [0, 100],
    crystalMaxSelfDamage: [0, 20],
    crystalMinHealth: [1, 20],
    crystalIntervalMs: [100, 5000],
    crystalPredictionTicks: [0, 10],
    pearlMinDistance: [4, 64],
    pearlMaxDistance: [8, 64],
    pearlCooldownMs: [1000, 10000],
    pearlMinHealth: [6, 20],
    pearlReserve: [0, 64],
  };
  const normalized = result as unknown as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(result)) {
    if (typeof fallback === "boolean") normalized[key] = normalizeBoolean(draft[key], fallback);
    else if (choices[key]) {
      if (typeof draft[key] === "string" && choices[key].includes(draft[key]))
        normalized[key] = draft[key];
    } else if (typeof draft[key] === "number" && Number.isFinite(draft[key])) {
      const numeric = [
        "attackRange",
        "targetRange",
        "bowRange",
        "crystalPlaceRange",
        "crystalBreakRange",
        "bowDefenseRange",
        "bowDefenseMargin",
      ].includes(key)
        ? draft[key]
        : Math.round(draft[key]);
      normalized[key] = Math.max(bounds[key][0], Math.min(bounds[key][1], numeric));
    }
  }
  result.pearlMinDistance = Math.min(result.pearlMinDistance, result.pearlMaxDistance);
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
  allowLowCeilingJumps: true,
  allowParkour: true,
  allowAirStrafe: false,
  canDig: false,
  maxDropDown: 3,
  allowWaterDrop: true,
  allowBucketWaterDrop: true,
  stayOnWater: true,
  antiKnockback: false,
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
  survival: { ...DEFAULT_MINEFLAYER_SURVIVAL_SETTINGS },
  gathering: { ...DEFAULT_MINEFLAYER_GATHERING_SETTINGS },
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
  profiles: [],
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
    allowLowCeilingJumps: normalizeBoolean(draft.allowLowCeilingJumps, defaults.allowLowCeilingJumps),
    allowParkour: normalizeBoolean(draft.allowParkour, defaults.allowParkour),
    allowAirStrafe: normalizeBoolean(draft.allowAirStrafe, defaults.allowAirStrafe),
    canDig: normalizeBoolean(draft.canDig, defaults.canDig),
    maxDropDown: normalizeInteger(draft.maxDropDown, defaults.maxDropDown, 1, 16),
    allowWaterDrop: normalizeBoolean(draft.allowWaterDrop, defaults.allowWaterDrop),
    allowBucketWaterDrop: normalizeBoolean(
      draft.allowBucketWaterDrop,
      defaults.allowBucketWaterDrop,
    ),
    stayOnWater: normalizeBoolean(draft.stayOnWater, defaults.stayOnWater),
    antiKnockback: normalizeBoolean(draft.antiKnockback, defaults.antiKnockback),
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
    survival: normalizeMineflayerSurvivalSettings(draft.survival),
    gathering: normalizeMineflayerGatheringSettings(draft.gathering),
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
  const ids = new Set<string>();
  const profiles = (Array.isArray(draft.profiles) ? draft.profiles : []).flatMap((profile) => {
    if (!profile || typeof profile !== "object") return [];
    const { id, name, url, bypass } = profile;
    if (typeof id !== "string" || !id.trim() || ids.has(id)) return [];
    if (typeof name !== "string" || !name.trim() || typeof url !== "string" || !url.trim())
      return [];
    ids.add(id);
    return [{ id, name: name.trim().slice(0, 64), url, bypass: normalizeText(bypass, "") }];
  });
  return {
    enabled: normalizeBoolean(draft.enabled, DEFAULT_PROXY_SETTINGS.enabled),
    url: normalizeText(draft.url, DEFAULT_PROXY_SETTINGS.url),
    bypass: normalizeText(draft.bypass, DEFAULT_PROXY_SETTINGS.bypass),
    profiles,
  };
}
