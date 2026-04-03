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
  buildState: string;
  accountType: string;
  totalPlaytimeSecs: number;
  totalBuilds: number;
};

const FRIENDLY_PLACEHOLDER_VALUES: Record<string, string> = {
  empty: "Empty",
  fabric: "Fabric",
  microsoft: "Microsoft",
  offline: "Offline",
  ready: "Ready",
  running: "Running",
  updating: "Updating",
  vanilla: "Vanilla",
};

function toFriendlyPlaceholderValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const mapped = FRIENDLY_PLACEHOLDER_VALUES[trimmed.toLowerCase()];
  if (mapped) return mapped;

  if (/^[A-Z0-9_\-\s]+$/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return trimmed;
}

function resolvePlaceholderValue(key: string, ctx: PlaceholderContext): string | null {
  switch (key) {
    case "system_ram":
    case "system_ram_max":    return `${ctx.systemRamGb} GB`;
    case "build_name":        return ctx.buildName;
    case "build_version":     return ctx.buildVersion;
    case "build_loader":      return toFriendlyPlaceholderValue(ctx.buildLoader);
    case "build_ram":         return `${ctx.buildRam}GB`;
    case "build_playtime":    return formatPlaytime(ctx.buildPlaytimeSecs);
    case "build_last_played": return formatLastPlayed(ctx.buildLastPlayed);
    case "build_status":      return toFriendlyPlaceholderValue(ctx.buildStatus);
    case "build_state":       return toFriendlyPlaceholderValue(ctx.buildState);
    case "account_type":      return toFriendlyPlaceholderValue(ctx.accountType);
    case "total_playtime":    return formatPlaytime(ctx.totalPlaytimeSecs);
    case "total_builds":      return `${ctx.totalBuilds}`;
    default:                  return null;
  }
}

export function resolvePlaceholders(template: string, ctx: PlaceholderContext): string {
  return template.replace(/(\^)?%(\w+)%/g, (match, uppercaseFlag: string | undefined, key: string) => {
    const value = resolvePlaceholderValue(key, ctx);
    if (value === null) return match;
    return uppercaseFlag ? value.toUpperCase() : value;
  });
}
