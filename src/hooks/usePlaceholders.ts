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
        | "ram"
        | "playtimeSecs"
        | "lastPlayed"
        | "status"
      >
    >
  | null
  | undefined;

type BuildPlaceholderContextOptions = {
  instances: InstanceItem[];
  target: PlaceholderTarget;
  systemRamGb: number;
  accountType?: string | null;
  buildState?: string | null;
};

export function buildPlaceholderContext({
  instances,
  target,
  systemRamGb,
  accountType,
  buildState,
}: BuildPlaceholderContextOptions): PlaceholderContext {
  return {
    systemRamGb,
    buildName: target?.name ?? "—",
    buildVersion: target?.version ?? "—",
    buildLoader: target?.loader ?? "—",
    buildRam: target?.ram ?? 0,
    buildPlaytimeSecs: target?.playtimeSecs ?? 0,
    buildLastPlayed: target?.lastPlayed ?? "0",
    buildStatus: target?.status ?? "—",
    buildState: buildState ?? "",
    accountType: accountType ?? "OFFLINE",
    totalPlaytimeSecs: sumPlaytimeSecs(instances),
    totalBuilds: instances.length,
  };
}

/**
 * Returns a resolve(template) function pre-bound to the current context.
 * Use anywhere in the component tree — no need to pass context manually.
 *
 * Available placeholders:
 *   %system_ram%        %system_ram_max%
 *   %build_name%        %build_version%   %build_loader%
 *   %build_ram%         %build_playtime%  %build_last_played%  %build_status%
 *   %build_state%       %account_type%
 *   %total_playtime%    %total_builds%
 * Prefix any placeholder with ^ to force uppercase, for example ^%account_type%.
 */
export function usePlaceholders(
  instances: InstanceItem[],
  selectedInstance: InstanceItem | null | undefined,
  systemRamGb: number,
  accountType: string,
  buildState = "",
): (template: string) => string {
  return useMemo(() => {
    const ctx: PlaceholderContext = {
      systemRamGb,
      accountType,
      buildState,
      buildName: selectedInstance?.name ?? "—",
      buildVersion: selectedInstance?.version ?? "—",
      buildLoader: selectedInstance?.loader ?? "—",
      buildRam: selectedInstance?.ram ?? 0,
      buildPlaytimeSecs: selectedInstance?.playtimeSecs ?? 0,
      buildLastPlayed: selectedInstance?.lastPlayed ?? "0",
      buildStatus: selectedInstance?.status ?? "—",
      totalPlaytimeSecs: sumPlaytimeSecs(instances),
      totalBuilds: instances.length,
    };
    return (template: string) => resolvePlaceholders(template, ctx);
  }, [
    systemRamGb,
    instances,
    accountType,
    buildState,
    selectedInstance?.name,
    selectedInstance?.version,
    selectedInstance?.loader,
    selectedInstance?.ram,
    selectedInstance?.playtimeSecs,
    selectedInstance?.lastPlayed,
    selectedInstance?.status,
  ]);
}

export { formatLastPlayed, formatPlaytime };
