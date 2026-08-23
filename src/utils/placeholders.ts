import { formatLastPlayed, formatPlaytime } from "./playtime";

export type PlaceholderContext = {
  systemRamGb: number;
  playerName: string;
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

export const APPEARANCE_TEXT_TEMPLATE_ATTRIBUTE = "data-appearance-text-template";
export const APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE = "data-appearance-placeholder-values";

export const AVAILABLE_PLACEHOLDERS = [
  { token: "%player_name%", label: "PLAYER NAME" },
  { token: "%system_ram%", label: "SYSTEM RAM" },
  { token: "%build_name%", label: "BUILD NAME" },
  { token: "%build_version%", label: "BUILD VERSION" },
  { token: "%build_loader%", label: "BUILD LOADER" },
  { token: "%build_ram%", label: "BUILD RAM" },
  { token: "%build_playtime%", label: "BUILD PLAYTIME" },
  { token: "%build_last_played%", label: "LAST PLAYED" },
  { token: "%build_status%", label: "BUILD STATUS" },
  { token: "%build_state%", label: "BUILD STATE" },
  { token: "%account_type%", label: "ACCOUNT TYPE" },
  { token: "%total_playtime%", label: "TOTAL PLAYTIME" },
  { token: "%total_builds%", label: "TOTAL BUILDS" },
] as const;

export type PlaceholderAppearanceAttributes = {
  "data-appearance-text-template": string;
  "data-appearance-placeholder-values": string;
};

const FRIENDLY_PLACEHOLDER_VALUES: Record<string, string> = {
  empty: "Empty",
  fabric: "Fabric",
  quilt: "Quilt",
  neoforge: "NeoForge",
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
    case "player_name":      return ctx.playerName;
    case "nickname":         return ctx.playerName;
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

export function createPlaceholderAppearanceAttributes(
  template: string,
  resolve: (template: string) => string,
): PlaceholderAppearanceAttributes {
  const values = Object.fromEntries(
    AVAILABLE_PLACEHOLDERS.map(({ token }) => {
      const key = token.slice(1, -1);
      return [key, resolve(token)];
    }),
  );
  // Keep the legacy nickname alias usable in hand-written templates.
  values.nickname = values.player_name;
  return {
    [APPEARANCE_TEXT_TEMPLATE_ATTRIBUTE]: template,
    [APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE]: JSON.stringify(values),
  };
}

export function resolveAppearancePlaceholderTemplate(
  template: string,
  serializedValues: string | null | undefined,
) {
  if (!serializedValues) return template;
  try {
    const parsed = JSON.parse(serializedValues) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return template;
    const values = parsed as Record<string, unknown>;
    return template.replace(
      /(\^)?%(\w+)%/g,
      (match, uppercaseFlag: string | undefined, key: string) => {
        const value = values[key];
        if (typeof value !== "string") return match;
        return uppercaseFlag ? value.toUpperCase() : value;
      },
    );
  } catch {
    return template;
  }
}
