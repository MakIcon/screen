export type TabKey = "overview" | "instances" | "mods" | "resourcepacks" | "shaders" | "settings";

export type LoaderType = "Vanilla" | "Fabric" | "Quilt" | "Forge" | "NeoForge";

export type InstanceItem = {
  id: string;
  name: string;
  pinned: boolean;
  version: string;
  loader: LoaderType | string;
  loaderVersion?: string | null;
  status: "READY" | "EMPTY" | "UPDATING" | "RUNNING" | string;
  pid?: number | null;
  ram: number;
  javaArgs?: string | null;
  javaPath?: string | null;
  environmentVariables?: Record<string, string>;
  windowWidth?: number | null;
  windowHeight?: number | null;
  fullscreen?: boolean;
  lastPlayed: string;
  playtimeSecs: number;
  createdAt: string;
  gameDir: string;
};

export type PlaytimeSession = {
  ts: number; // unix seconds when the session ended
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

export type ModrinthProjectDetails = {
  projectId: string;
  slug: string;
  title: string;
  author: string;
  description: string;
  body: string;
  projectType: string;
  categories: string[];
  gameVersions: string[];
  loaders: string[];
  downloads: number;
  follows: number;
  iconUrl?: string | null;
  published?: string | null;
  updated?: string | null;
  license?: string | null;
  sourceUrl?: string | null;
  issuesUrl?: string | null;
  wikiUrl?: string | null;
  discordUrl?: string | null;
};

export type ModrinthSearchResponse = {
  totalHits: number;
  hits: ModrinthProject[];
  offset: number;
  limit: number;
};

export type ModrinthModDependency = {
  projectId: string;
  title: string;
  iconUrl?: string | null;
  versionNumber: string;
  direct: boolean;
  status: "download" | "installed" | "enable";
};

export type ModrinthModDependencies = {
  versionNumber: string;
  dependencies: ModrinthModDependency[];
};

export type InstalledModView = {
  projectId?: string | null;
  title: string;
  author: string;
  versionNumber?: string | null;
  filename: string;
  source: string;
  installedAt?: string | null;
  enabled: boolean;
  iconUrl?: string | null;
};

export type JavaInstallation = {
  path: string;
  version: string;
  vendor: string;
  major: number;
};

export type JavaSettingsTestResult = {
  success: boolean;
  javaPath: string;
  output: string;
  warning: string | null;
};

export type EnvironmentVariable = {
  name: string;
  value: string;
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
  environmentVariables?: Record<string, string>;
  windowWidth?: number | null;
  windowHeight?: number | null;
  fullscreen?: boolean;
};

export type UpdateInstancePayload = {
  id: string;
  name: string;
  pinned: boolean;
  version: string;
  loader: LoaderType | string;
  loaderVersion?: string | null;
  ram: number;
  javaArgs?: string | null;
  javaPath?: string | null;
  environmentVariables?: Record<string, string>;
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

export type ModDownloadProgressPayload = {
  instanceId: string;
  projectId: string;
  filename: string;
  receivedBytes: number;
  totalBytes: number;
  percent: number;
  state: "downloading" | "paused" | "completed" | "cancelled";
};

export type MirrorMode = "official" | "auto" | "mirror";

export type NetworkSettings = {
  mirror: MirrorMode;
};

export type MascotSettings = {
  name: string;
  showName: boolean;
  rageEnabled: boolean;
  bowlEnabled: boolean;
  movementEnabled: boolean;
  interactionsEnabled: boolean;
  carryElementsEnabled: boolean;
  scrollListsEnabled: boolean;
};

export type LauncherSettings = {
  defaultRamGb: number;
  optimizedJavaArgs: boolean;
  autoDownloadJava: boolean;
  mascotEnabled: boolean;
  mascot: MascotSettings;
  network: NetworkSettings;
  plugins: LauncherPluginsSettings;
};

export type LauncherPluginsSettings = {
  discordRpc: DiscordRpcPluginSettings;
  mineflayerBot: MineflayerBotPluginSettings;
  blueMap: BlueMapPluginSettings;
  obsTelemetry: ObsTelemetryPluginSettings;
  proxy: ProxyPluginSettings;
};

export type ProxyPluginSettings = {
  enabled: boolean;
  url: string;
  bypass: string;
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

export type MineflayerCombatSettings = {
  enabled: boolean;
  adaptiveCombat: boolean;
  combatHealing: boolean;
  pearlEscape: boolean;
  engine: "custom" | "basic";
  style: "auto" | "melee" | "ranged" | "crystal";
  autoTarget: "manual" | "hostile";
  targetRange: number;
  reactionMs: number;
  meleeSkill: number;
  cps: number;
  attackRange: number;
  weapon: "sword" | "axe" | "mace";
  strafe: "off" | "intelligent" | "circle" | "random";
  criticals: "off" | "hop" | "shorthop";
  sprintTap: "off" | "wtap" | "stap" | "sprintcancel";
  shield: boolean;
  shieldBreak: boolean;
  maceDefense: boolean;
  smoothAim: boolean;
  smoothAimSpeed: number;
  bowEnabled: boolean;
  bowEngine: "custom" | "hawkeye";
  bowAccuracy: number;
  bowRange: number;
  bowIntervalMs: number;
  bowPredict: boolean;
  bowOffhand: boolean;
  meleeFallback: boolean;
  bowDefense: boolean;
  bowDefenseMode: "early" | "trajectory";
  bowDefenseCheckMs: number;
  bowDefenseRange: number;
  bowDefenseMargin: number;
  bowDefenseHoldMs: number;
  bowDefenseRequireDraw: boolean;
  crystalEnabled: boolean;
  crystalPlace: boolean;
  crystalBreak: boolean;
  crystalBuildBase: boolean;
  crystalCover: boolean;
  crystalCoverBlock: "auto" | "obsidian" | "planks" | "cobblestone";
  crystalFastAim: boolean;
  crystalMaxCoverBlocks: number;
  crystalSpawnTimeoutMs: number;
  crystalRetries: number;
  crystalPlaceRange: number;
  crystalBreakRange: number;
  crystalMinDamage: number;
  crystalMaxSelfDamage: number;
  crystalMinHealth: number;
  crystalIntervalMs: number;
  crystalPredict: boolean;
  crystalPredictionTicks: number;
  crystalPriority: "damage" | "closest";
  crystalProtectOwners: boolean;
  pearlEnabled: boolean;
  pearlFollow: boolean;
  pearlCome: boolean;
  pearlGoto: boolean;
  pearlChase: boolean;
  pearlChain: boolean;
  pearlMinDistance: number;
  pearlMaxDistance: number;
  pearlCooldownMs: number;
  pearlMinHealth: number;
  pearlReserve: number;
};

export type MineflayerSurvivalSettings = {
  autoEat: boolean;
  autoEatMinHunger: number;
  autoEatMinHealth: number;
  autoEatPriority: "foodPoints" | "saturation";
  autoBuff: boolean;
  autoBuffHealing: boolean;
  autoBuffCombat: boolean;
  autoBuffMinHealth: number;
  emergencyMlg: boolean;
  mlgMinFallHeight: number;
  mlgPickupWater: boolean;
};

export type MineflayerBotPluginSettings = {
  enabled: boolean;
  host: string;
  port: number;
  version: string;
  commandPrefix: string;
  commandSource: "chat" | "whisper" | "both";
  extraOwners: string;
  commandCooldownMs: number;
  sendChatFeedback: boolean;
  allowSayCommand: boolean;
  allowQuitCommand: boolean;
  botAccountMode: "offline" | "microsoft";
  botNickname: string;
  botMicrosoftAccountId?: string | null;
  followDistance: number;
  gotoRadius: number;
  allowSprinting: boolean;
  allowLowCeilingJumps: boolean;
  allowParkour: boolean;
  allowAirStrafe: boolean;
  canDig: boolean;
  maxDropDown: number;
  allowWaterDrop: boolean;
  allowBucketWaterDrop: boolean;
  stayOnWater: boolean;
  antiKnockback: boolean;
  autoFollowOnSpawn: boolean;
  announceOnSpawn: boolean;
  spawnMessage: string;
  autoReconnect: boolean;
  reconnectDelaySeconds: number;
  maxReconnectAttempts: number;
  connectTimeoutSeconds: number;
  autoRespawn: boolean;
  logPathUpdates: boolean;
  combat: MineflayerCombatSettings;
  survival: MineflayerSurvivalSettings;
  gathering: MineflayerGatheringSettings;
};

export type MineflayerGatheringSettings = {
  tunnelWidth: number;
  tunnelHeight: number;
  stairWidth: number;
  stairHeight: number;
  placeTorches: boolean;
  torchInterval: number;
  defendMobs: boolean;
  defendPlayers: boolean;
  defendArrows: boolean;
  storageGroups: MineflayerStorageGroup[];
};

export type MineflayerStorageGroup = {
  id: string;
  name: string;
  enabled: boolean;
  filters: string[];
  chests: Array<{ x: number; y: number; z: number }>;
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

export type MineflayerWorkTask = {
  id: number;
  kind: string;
  tunnel?: boolean;
  names?: string[];
  radius?: number;
  count: number;
  minY?: number;
  maxY?: number;
  item?: string;
  area?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    volume: number;
  };
  mined: number;
  collected: number;
  deposited: number;
  delivered: number;
  outcome?: string;
  reason?: string;
};
export type MinecraftCatalogEntry = {
  name: string;
  displayName: string;
  texture: string;
  kind: "block" | "item" | "group";
  item: boolean;
  mineable: boolean;
  blocks?: string[];
  /** Optional section and secondary label for search menus. */
  section?: string;
  description?: string;
};
export type MinecraftCatalog = {
  version: string;
  entries: MinecraftCatalogEntry[];
};
export type MineflayerInventoryItem = {
  slot: number;
  name: string;
  displayName: string;
  count: number;
  texture: string;
  durability: number | null;
  maxDurability: number | null;
  enchants: Array<{ name: string; level: number }>;
};
export type MineflayerDiscoveredBlock = {
  name: string;
  position: { x: number; y: number; z: number };
  positions: Array<{ x: number; y: number; z: number }>;
  distance: number;
};
export type MineflayerStorageScan = {
  id: number;
  state: "running" | "complete" | "cancelled" | "error";
  saved: boolean;
  radius: number;
  total: number;
  added: number;
  groups: MineflayerStorageGroup[];
  warnings: string[];
  records: Array<MineflayerDiscoveredBlock & {
    category?: string | null;
    label: string;
    configured?: boolean;
    totalSlots?: number;
    freeSlots?: number;
    contents?: Array<{ name: string; count: number }>;
    error?: string;
  }>;
};
export type MineflayerInventory = {
  workflow?: MineflayerWorkflowStatus | null;
  username: string;
  health: number;
  maxHealth: number;
  food: number;
  saturation: number;
  armor: number;
  oxygen: number | null;
  selectedSlot: number;
  slots: Array<MineflayerInventoryItem | null>;
  occupied: number;
  capacity: number;
  production?: {
    busy: boolean;
    phase: string;
    message: string;
    nearbyScan?: { id: number; radius: number; blocks: MineflayerDiscoveredBlock[] } | null;
    storageScan?: MineflayerStorageScan | null;
    station: {
      name: string;
      position: { x: number; y: number; z: number };
      type: string;
      slots: Array<{ slot: number; name: string; count: number } | null>;
      properties: Record<string, number>;
    } | null;
  } | null;
};
export type MineflayerWorkflowStep = {
  kind: "mine" | "forest" | "craft" | "smelt" | "collect" | "deposit" | "return";
  item?: string;
  count?: number;
  radius?: number;
  mode?: string;
};
export type MineflayerWorkflowStatus = {
  id?: string | null;
  name?: string;
  startedAt?: number | null;
  finishedAt?: number | null;
  history?: MineflayerWorkflowRun[];
  phase: "idle" | "starting" | "running" | "pausing" | "paused" | "stopping" | "stopped" | "complete" | "error";
  message: string;
  current: number;
  steps: Array<MineflayerWorkflowStep & { state: "waiting" | "running" | "complete" | "error" | "stopped" }>;
};
export type MineflayerWorkflowRun = {
  id: string;
  name: string;
  startedAt: number;
  finishedAt: number;
  phase: "complete" | "stopped" | "error";
  message: string;
  steps: MineflayerWorkflowStatus["steps"];
};
export type MineflayerBotStatus = {
  revision: number;
  running: boolean;
  state: string;
  pid?: number | null;
  ownerName?: string | null;
  botUsername?: string | null;
  server?: string | null;
  lastError?: string | null;
  logs: string[];
  inventoryUrl?: string | null;
  inventory?: MineflayerInventory | null;
  gathering?: {
    phase: string;
    kind: string | null;
    mined: number;
    collected: number;
    delivered: number;
    queued: number;
    reason: string;
    message: string;
    active?: MineflayerWorkTask | null;
    suspended?: MineflayerWorkTask | null;
    queue?: MineflayerWorkTask[];
    history?: MineflayerWorkTask[];
    selection?: {
      chest: { x: number; y: number; z: number } | null;
      storagePick?: { x: number; y: number; z: number } | null;
      storageGroups?: MineflayerStorageGroup[];
      storageStatus?: Record<string, { state: "full" | "ok" | "unavailable"; message: string }>;
      areas: Record<string, Partial<Record<"1" | "2", { x: number; y: number; z: number }>>>;
    };
  } | null;
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

export type OptionalExtensionId = "mineflayer-bot" | "blue-map-server";

export type OptionalExtensionStatus = {
  id: OptionalExtensionId;
  installed: boolean;
  version?: string | null;
  installPath: string;
  message: string;
};

export type RuntimeProcessStatus = {
  pid: number;
  alive: boolean;
};

export type RuntimeMonitorSnapshot = {
  mineflayerBot: MineflayerBotStatus;
  blueMap: BlueMapStatus;
  obsTelemetry: ObsTelemetryStatus;
  processes: RuntimeProcessStatus[];
  optionalExtensions: OptionalExtensionStatus[];
};

export type RuntimeMonitorActivity = Pick<
  RuntimeMonitorSnapshot,
  "blueMap" | "obsTelemetry" | "processes"
>;

export type MicrosoftAccount = {
  id: string;
  uuid: string;
  username: string;
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
  environmentVariables?: Record<string, string>;
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
  environmentVariables?: Record<string, string>;
  windowWidth?: number | null;
  windowHeight?: number | null;
  fullscreen?: boolean;
  mods: ExportedItem[];
  shaders: ExportedItem[];
  resourcePacks: ExportedItem[];
};

export type ImportContentResult = {
  category: "mods" | "shaders" | "resourcePacks";
  item: ExportedItem;
  success: boolean;
  message: string;
};

export type ImportInstanceResult = {
  instance: InstanceItem;
  items: ImportContentResult[];
};

export type BackupWorldInfo = {
  folderName: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type WorldBackupInfo = {
  id: string;
  instanceId: string;
  createdAt: string;
  worldCount: number;
  name: string;
  kind: "manual" | "beforeRestore";
  worlds: BackupWorldInfo[];
  sizeBytes: number;
};

export type WorldBackupState = {
  worlds: BackupWorldInfo[];
  backups: WorldBackupInfo[];
  selectedWorlds: string[];
};

export type WorldRestoreResult = {
  restoredWorlds: string[];
  safetyBackup: WorldBackupInfo | null;
};

export type BuildRuntimeSettingsDraft = {
  ram: number;
  javaArgs: string;
  javaPath: string;
  environmentVariables: EnvironmentVariable[];
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
  | "account"
  | "create-version"
  | "create-loader"
  | "create-loader-version"
  | "target-mods"
  | "target-packs"
  | "target-shaders";
