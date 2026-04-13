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
};

export type UpdateInstancePayload = {
  id: string;
  name: string;
  version: string;
  loader: LoaderType;
  fabricLoaderVersion?: string | null;
  ram: number;
};

export type ActionResult = {
  ok: boolean;
  message: string;
  pid?: number | null;
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
};

export type MicrosoftAccount = {
  id: string;
  uuid: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
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
