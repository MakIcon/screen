export type TabKey =
  | "overview"
  | "instances"
  | "mods"
  | "resourcepacks"
  | "shaders"
  | "settings";

export type LoaderType = "Vanilla" | "Fabric";

export type InstanceItem = {
  id: string;
  name: string;
  version: string;
  loader: LoaderType | string;
  fabricLoaderVersion?: string | null;
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
  fabricLoaderVersion?: string | null;
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
  fabricLoaderVersion?: string | null;
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
};

export type DiscordRpcPluginSettings = {
  enabled: boolean;
  applicationId: string;
  detailsTemplate: string;
  stateTemplate: string;
  showElapsedTime: boolean;
};

export type MicrosoftAccount = {
  id: string;
  uuid: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
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
  fabricLoaderVersion?: string | null;
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
  fabricLoaderVersion?: string | null;
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
  | "create-fabric-loader"
  | "target-mods"
  | "target-packs"
  | "target-shaders";
