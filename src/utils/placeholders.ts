import { formatLastPlayed, formatPlaytime } from "./playtime";

export type PlaceholderContext = {
  systemRamGb: number;
  buildName: string;
  buildVersion: string;
  buildLoader: string;
  buildRam: number;
  buildPlaytimeSecs: number;
  buildLastPlayed: string;
  buildStatus: string;
  totalPlaytimeSecs: number;
  totalBuilds: number;
};

export function resolvePlaceholders(template: string, ctx: PlaceholderContext): string {
  return template.replace(/%(\w+)%/g, (match, key: string) => {
    switch (key) {
      case "system_ram":
      case "system_ram_max":    return `${ctx.systemRamGb} GB`;
      case "build_name":        return ctx.buildName;
      case "build_version":     return ctx.buildVersion;
      case "build_loader":      return ctx.buildLoader;
      case "build_ram":         return `${ctx.buildRam}GB`;
      case "build_playtime":    return formatPlaytime(ctx.buildPlaytimeSecs);
      case "build_last_played": return formatLastPlayed(ctx.buildLastPlayed);
      case "build_status":      return ctx.buildStatus;
      case "total_playtime":    return formatPlaytime(ctx.totalPlaytimeSecs);
      case "total_builds":      return `${ctx.totalBuilds}`;
      default:                  return match;
    }
  });
}
