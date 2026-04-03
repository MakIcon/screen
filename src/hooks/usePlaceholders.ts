import { useMemo } from "react";
import { resolvePlaceholders, type PlaceholderContext } from "../utils/placeholders";
import { formatLastPlayed, formatPlaytime, sumPlaytimeSecs } from "../utils/playtime";
import type { InstanceItem } from "../types";

/**
 * Returns a resolve(template) function pre-bound to the current context.
 * Use anywhere in the component tree — no need to pass context manually.
 *
 * Available placeholders:
 *   %system_ram%        %system_ram_max%
 *   %build_name%        %build_version%   %build_loader%
 *   %build_ram%         %build_playtime%  %build_last_played%  %build_status%
 *   %total_playtime%    %total_builds%
 */
export function usePlaceholders(
  instances: InstanceItem[],
  selectedInstance: InstanceItem | null | undefined,
  systemRamGb: number,
): (template: string) => string {
  return useMemo(() => {
    const ctx: PlaceholderContext = {
      systemRamGb,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    systemRamGb,
    instances,
    selectedInstance?.id,
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
