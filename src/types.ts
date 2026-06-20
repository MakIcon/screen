export type TabKey =
  | "overview"
  | "instances"
  | "mods"
  | "resourcepacks"
  | "shaders"
  | "settings";

export type LoaderType = "Vanilla" | "Fabric" | "Quilt" | "NeoForge";

export type InstanceItem = {
  id: string;
  name: string;
  version: string;
  loader: LoaderType | string;
  loaderVersion?: string | null;
  status: "READY" | "EMPTY" | "UPDATING" | "RUNNING" | string;
  pid?: number | null;
  ram: number;
  javaArgs?: string | null;
  javaPath?: string | null;
  windowWidth?: number | null;
  windowHeight?: number | null;
  fullscreen?: boolean;
  lastPlayed: string;
  playtimeSecs: number;
  createdAt: string;
  gameDir: string;
};

export type PlaytimeSession = {
  ts: number;   // unix seconds when the session ended
  secs: number; // duration in seconds
};

export type CatalogItem = {
  id: string;
  title: string;
  author: string;
  category: string;
  description: string;
  installed?: boolean;
};

export type ModrinthProject = {
  projectId: string;
  slug: string;
  title: string;
  author: string;
  description: string;
  categories: string[];
  displayCategories: string[];
  versions: string[];
  downloads: number;
  follows: number;
  iconUrl?: string | null;
  installed?: boolean;
};

export type ModrinthSearchResponse = {
  totalHits: number;
  hits: ModrinthProject[];
  offset: number;
  limit: number;
};

export type InstalledModView = {
  projectId?: string | null;
  title: string;
  author: string;
  versionNumber?: string | null;
  filename: string;
  source: string;
  installedAt?: string | null;
};

export type MinecraftManifestVersion = {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  url: string;
  time: string;
  releaseTime: string;
  sha1?: string;
  complianceLevel?: number;
};

export type MinecraftManifest = {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: MinecraftManifestVersion[];
};

export type CreateInstancePayload = {
  name: string;
  version: string;
  loader: LoaderType;
  loaderVersion?: string | null;
  ram: number;
  javaArgs?: string | null;
  javaPath?: string | null;
  windowWidth?: number | null;
  windowHeight?: number | null;
  fullscreen?: boolean;
};

export type UpdateInstancePayload = {
  id: string;
  name: string;
  version: string;
  loader: LoaderType | string;
  loaderVersion?: string | null;
  ram: number;
  javaArgs?: string | null;
  javaPath?: string | null;
  windowWidth?: number | null;
  windowHeight?: number | null;
  fullscreen?: boolean;
};

export type ActionResult = {
  ok: boolean;
  message: string;
  pid?: number | null;
};

export type LaunchLogSnapshot = {
  instanceId: string;
  instanceName: string;
  logPath?: string | null;
  minecraftLogPath?: string | null;
  crashReportPath?: string | null;
  logTail: string;
  crashReportTail?: string | null;
  hint?: string | null;
};

export type MinecraftExitPayload = LaunchLogSnapshot & {
  pid: number;
  exitCode?: number | null;
  runtimeSecs: number;
  crashed: boolean;
  reason: string;
};

export type ScreenshotItem = {
  fileName: string;
  path: string;
  modifiedAt: number;
  sizeBytes: number;
  mime: string;
};

export type ScreenshotImage = {
  fileName: string;
  dataUrl: string;
  mime: string;
};

export type InstallProgressPayload = {
  phase: string;
  current: number;
  total: number;
  percent: number;
  detail: string;
};

export type LauncherSettings = {
  defaultRamGb: number;
  optimizedJavaArgs: boolean;
  plugins: LauncherPluginsSettings;
};

export type LauncherPluginsSettings = {
  discordRpc: DiscordRpcPluginSettings;
  mineflayerBot: MineflayerBotPluginSettings;
  blueMap: BlueMapPluginSettings;
  obsTelemetry: ObsTelemetryPluginSettings;
};

export type DiscordRpcPluginSettings = {
  enabled: boolean;
  applicationId: string;
  displayMode: "launcher" | "minecraft" | "combined";
  activityNameTemplate: string;
  detailsTemplate: string;
  stateTemplate: string;
  launcherDetailsTemplate: string;
  launcherStateTemplate: string;
  combinedDetailsTemplate: string;
  combinedStateTemplate: string;
  showElapsedTime: boolean;
  largeImageKey: string;
  largeImageTextTemplate: string;
  smallImageKey: string;
  smallImageTextTemplate: string;
  buttonLabel: string;
  buttonUrl: string;
};

export type MineflayerBotPluginSettings = {
  enabled: boolean;
  host: string;
  port: number;
  version: string;
  commandPrefix: string;
  botAccountMode: "offline" | "microsoft";
  botNickname: string;
  botMicrosoftAccountId?: string | null;
  followDistance: number;
};

export type BlueMapPluginSettings = {
  enabled: boolean;
  mapUrl: string;
  cliJarPath: string;
  workingDir: string;
  javaPath: string;
  renderOnStart: boolean;
  updateOnStart: boolean;
};

export type ObsTelemetryPluginSettings = {
  enabled: boolean;
  port: number;
};

export type MineflayerBotStatus = {
  running: boolean;
  state: string;
  pid?: number | null;
  ownerName?: string | null;
  botUsername?: string | null;
  server?: string | null;
  lastError?: string | null;
  logs: string[];
};

export type BlueMapStatus = {
  running: boolean;
  state: string;
  pid?: number | null;
  url: string;
  cliJarPath?: string | null;
  workingDir?: string | null;
  worldPath?: string | null;
  lastError?: string | null;
  logs: string[];
};

export type ObsTelemetryPosition = {
  x: number;
  y: number;
  z: number;
};

export type ObsTelemetryBlockPosition = {
  x: number;
  y: number;
  z: number;
};

export type ObsTelemetryItem = {
  slot?: string | null;
  itemId: string;
  displayName: string;
  count: number;
  damage: number;
  maxDamage: number;
  durability: number;
  durabilityPercent: number;
};

export type ObsTelemetryPayload = {
  minecraftVersion: string;
  playerName: string;
  dimension: string;
  health: number;
  maxHealth: number;
  armor: number;
  food: number;
  saturation: number;
  experienceLevel: number;
  experienceProgress: number;
  totalExperience: number;
  yaw: number;
  pitch: number;
  position: ObsTelemetryPosition;
  blockPosition: ObsTelemetryBlockPosition;
  heldItem?: ObsTelemetryItem | null;
  offhandItem?: ObsTelemetryItem | null;
  armorItems: ObsTelemetryItem[];
  sentAtMs?: number | null;
};

export type ObsTelemetryStatus = {
  running: boolean;
  state: string;
  port: number;
  overlayUrl: string;
  overlayUrls: Record<string, string>;
  jsonUrl: string;
  lastPlayerName?: string | null;
  lastUpdateAgeMs?: number | null;
  lastPayload?: ObsTelemetryPayload | null;
  lastError?: string | null;
  logs: string[];
};

export type MicrosoftAccount = {
  id: string;
  uuid: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type MinecraftSkin = {
  id?: string | null;
  state?: string | null;
  url?: string | null;
  variant?: "CLASSIC" | "SLIM" | string | null;
  alias?: string | null;
};

export type MinecraftCape = {
  id?: string | null;
  state?: string | null;
  url?: string | null;
  alias?: string | null;
};

export type MinecraftProfile = {
  id: string;
  name: string;
  skins: MinecraftSkin[];
  capes: MinecraftCape[];
};

export type ExportedItem = {
  projectId: string | null;
  title: string;
  source: string;
  iconUrl?: string | null;
};

export type InstanceExportData = {
  schemaVersion: number;
  name: string;
  version: string;
  loader: string;
  loaderVersion?: string | null;
  ram: number;
  javaArgs?: string | null;
  javaPath?: string | null;
  windowWidth?: number | null;
  windowHeight?: number | null;
  fullscreen?: boolean;
  mods: ExportedItem[];
  shaders: ExportedItem[];
  resourcePacks: ExportedItem[];
};

export type ImportInstancePayload = {
  name: string;
  version: string;
  loader: string;
  loaderVersion?: string | null;
  ram: number;
  javaArgs?: string | null;
  javaPath?: string | null;
  windowWidth?: number | null;
  windowHeight?: number | null;
  fullscreen?: boolean;
  mods: ExportedItem[];
  shaders: ExportedItem[];
  resourcePacks: ExportedItem[];
};

export type BuildRuntimeSettingsDraft = {
  ram: number;
  javaArgs: string;
  javaPath: string;
  windowWidth: number;
  windowHeight: number;
  fullscreen: boolean;
};

export type DropdownKey =
  | null
  | "build"
  | "mc"
  | "loader"
  | "source"
  | "mods-build"
  | "mods-mc"
  | "mods-loader"
  | "mods-source"
  | "mod-version"
  | "account"
  | "create-version"
  | "create-loader"
  | "create-loader-version"
  | "target-mods"
  | "target-packs"
  | "target-shaders";
