import { useMemo } from "react";
import { resolvePlaceholders, type PlaceholderContext } from "../utils/placeholders";
import { formatLastPlayed, formatPlaytime, sumPlaytimeSecs } from "../utils/playtime";
import type { InstanceItem } from "../types";

export type PlaceholderTarget =
  | Partial<
      Pick<
        InstanceItem,
        | "name"
        | "version"
        | "loader"
        | "loaderVersion"
        | "ram"
        | "playtimeSecs"
        | "lastPlayed"
        | "createdAt"
        | "status"
      >
    >
  | null
  | undefined;

type BuildPlaceholderContextOptions = {
  instances: InstanceItem[];
  target: PlaceholderTarget;
  systemRamGb: number;
  launcherRamGb?: number;
  playerName?: string | null;
  accountType?: string | null;
  buildState?: string | null;
};

export function buildPlaceholderContext({
  instances,
  target,
  systemRamGb,
  launcherRamGb,
  playerName,
  accountType,
  buildState,
}: BuildPlaceholderContextOptions): PlaceholderContext {
  const totalVanillaBuilds = instances.filter(
    (instance) => instance.loader.trim().toLowerCase() === "vanilla",
  ).length;
  return {
    launcherName: "ScreenLauncher",
    launcherRamGb: launcherRamGb ?? 0,
    systemRamGb,
    playerName: playerName ?? "PLAYER",
    buildName: target?.name ?? "—",
    buildVersion: target?.version ?? "—",
    buildLoader: target?.loader ?? "—",
    buildLoaderVersion: target?.loaderVersion ?? "",
    buildRam: target?.ram ?? 0,
    buildPlaytimeSecs: target?.playtimeSecs ?? 0,
    buildLastPlayed: target?.lastPlayed ?? "0",
    buildCreatedAt: target?.createdAt ?? "0",
    buildStatus: target?.status ?? "—",
    buildState: buildState ?? "",
    buildSource: "OFFICIAL",
    accountType: accountType ?? "OFFLINE",
    totalPlaytimeSecs: sumPlaytimeSecs(instances),
    totalBuilds: instances.length,
    totalModdedBuilds: instances.length - totalVanillaBuilds,
    totalVanillaBuilds,
    totalAllocatedRamGb: instances.reduce((total, instance) => total + (instance.ram ?? 0), 0),
  };
}

/**
 * Returns a resolve(template) function pre-bound to the current context.
 * Use anywhere in the component tree — no need to pass context manually.
 *
 * Available placeholders:
 *   %player_name%       %nickname%
 *   %system_ram%        %system_ram_max%
 * The full, documented catalogue lives in utils/placeholders.ts and is also
 * rendered by Appearance Studio. Legacy aliases such as %nickname% and
 * %system_ram_max% remain supported.
 * Prefix any placeholder with ^ to force uppercase, for example ^%account_type%.
 */
export function usePlaceholders(
  instances: InstanceItem[],
  selectedInstance: InstanceItem | null | undefined,
  systemRamGb: number,
  launcherRamGb: number,
  accountType: string,
  playerName: string,
  buildState = "",
): (template: string) => string {
  return useMemo(() => {
    const totalVanillaBuilds = instances.filter(
      (instance) => instance.loader.trim().toLowerCase() === "vanilla",
    ).length;
    const ctx: PlaceholderContext = {
      launcherName: "ScreenLauncher",
      launcherRamGb,
      systemRamGb,
      playerName,
      accountType,
      buildState,
      buildName: selectedInstance?.name ?? "—",
      buildVersion: selectedInstance?.version ?? "—",
      buildLoader: selectedInstance?.loader ?? "—",
      buildLoaderVersion: selectedInstance?.loaderVersion ?? "",
      buildRam: selectedInstance?.ram ?? 0,
      buildPlaytimeSecs: selectedInstance?.playtimeSecs ?? 0,
      buildLastPlayed: selectedInstance?.lastPlayed ?? "0",
      buildCreatedAt: selectedInstance?.createdAt ?? "0",
      buildStatus: selectedInstance?.status ?? "—",
      buildSource: "OFFICIAL",
      totalPlaytimeSecs: sumPlaytimeSecs(instances),
      totalBuilds: instances.length,
      totalModdedBuilds: instances.length - totalVanillaBuilds,
      totalVanillaBuilds,
      totalAllocatedRamGb: instances.reduce((total, instance) => total + (instance.ram ?? 0), 0),
    };
    return (template: string) => resolvePlaceholders(template, ctx);
  }, [
    systemRamGb,
    launcherRamGb,
    instances,
    accountType,
    playerName,
    buildState,
    selectedInstance?.name,
    selectedInstance?.version,
    selectedInstance?.loader,
    selectedInstance?.loaderVersion,
    selectedInstance?.ram,
    selectedInstance?.playtimeSecs,
    selectedInstance?.lastPlayed,
    selectedInstance?.createdAt,
    selectedInstance?.status,
  ]);
}

export { formatLastPlayed, formatPlaytime };
