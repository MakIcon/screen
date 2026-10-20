import { formatLastPlayed, formatPlaytime } from "./playtime";
import { intlLocale, isPlainMessageKey, translateFor, type Locale } from "../i18n/locale";

export type PlaceholderContext = {
  locale?: Locale;
  launcherName: string;
  launcherRamGb: number;
  systemRamGb: number;
  playerName: string;
  buildName: string;
  buildVersion: string;
  buildLoader: string;
  buildLoaderVersion: string;
  buildRam: number;
  buildPlaytimeSecs: number;
  buildLastPlayed: string;
  buildCreatedAt: string;
  buildStatus: string;
  buildState: string;
  buildSource: string;
  accountType: string;
  totalPlaytimeSecs: number;
  totalBuilds: number;
  totalModdedBuilds: number;
  totalVanillaBuilds: number;
  totalAllocatedRamGb: number;
};

export const APPEARANCE_TEXT_TEMPLATE_ATTRIBUTE = "data-appearance-text-template";
export const APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE = "data-appearance-placeholder-values";

export type PlaceholderGroup = "launcher" | "player" | "build" | "library";

export type PlaceholderDefinition = {
  key: string;
  token: string;
  label: string;
  description: string;
  group: PlaceholderGroup;
  aliases?: readonly string[];
};

/**
 * The single public catalogue used by the launcher resolver, Appearance Studio,
 * and every UI that offers placeholder insertion. Aliases remain resolvable but
 * are intentionally not duplicated as buttons in the picker.
 */
export const AVAILABLE_PLACEHOLDERS: readonly PlaceholderDefinition[] = [
  {
    key: "launcher_name",
    token: "%launcher_name%",
    label: "LAUNCHER NAME",
    description: "The launcher product name.",
    group: "launcher",
  },
  {
    key: "system_ram",
    token: "%system_ram%",
    label: "SYSTEM RAM",
    description: "Total memory detected on this computer.",
    group: "launcher",
    aliases: ["system_ram_max"],
  },
  {
    key: "system_ram_value",
    token: "%system_ram_value%",
    label: "SYSTEM RAM VALUE",
    description: "Detected system memory as a number without the GB suffix.",
    group: "launcher",
  },
  {
    key: "launcher_ram",
    token: "%launcher_ram%",
    label: "LAUNCHER RAM",
    description: "The RAM value selected in Launcher Settings.",
    group: "launcher",
  },
  {
    key: "launcher_ram_value",
    token: "%launcher_ram_value%",
    label: "LAUNCHER RAM VALUE",
    description: "Launcher RAM as a number without the GB suffix.",
    group: "launcher",
  },
  {
    key: "player_name",
    token: "%player_name%",
    label: "PLAYER NAME",
    description: "Offline nickname or the active Microsoft account name.",
    group: "player",
    aliases: ["nickname"],
  },
  {
    key: "account_type",
    token: "%account_type%",
    label: "ACCOUNT TYPE",
    description: "The active account mode, such as Offline or Microsoft.",
    group: "player",
  },
  {
    key: "build_name",
    token: "%build_name%",
    label: "BUILD NAME",
    description: "Name of the build represented by this element.",
    group: "build",
  },
  {
    key: "build_version",
    token: "%build_version%",
    label: "MC VERSION",
    description: "Minecraft version of the current build.",
    group: "build",
    aliases: ["minecraft_version"],
  },
  {
    key: "build_loader",
    token: "%build_loader%",
    label: "LOADER",
    description: "Loader family, such as Vanilla, Fabric, Forge or NeoForge.",
    group: "build",
  },
  {
    key: "build_loader_version",
    token: "%build_loader_version%",
    label: "LOADER VERSION",
    description: "Installed loader version, when the build uses one.",
    group: "build",
    aliases: ["loader_version"],
  },
  {
    key: "build_full_loader",
    token: "%build_full_loader%",
    label: "LOADER + VERSION",
    description: "Friendly loader name followed by its installed version.",
    group: "build",
  },
  {
    key: "build_ram",
    token: "%build_ram%",
    label: "BUILD RAM",
    description: "Memory allocated to the current build.",
    group: "build",
  },
  {
    key: "build_ram_value",
    token: "%build_ram_value%",
    label: "BUILD RAM VALUE",
    description: "Build memory as a number without the GB suffix.",
    group: "build",
  },
  {
    key: "build_playtime",
    token: "%build_playtime%",
    label: "TIME IN BUILD",
    description: "Total recorded play time for the current build.",
    group: "build",
    aliases: ["time_on_build"],
  },
  {
    key: "build_last_played",
    token: "%build_last_played%",
    label: "LAST PLAYED",
    description: "Relative date when this build was last launched.",
    group: "build",
  },
  {
    key: "build_created",
    token: "%build_created%",
    label: "BUILD CREATED",
    description: "Calendar date when the current build was created.",
    group: "build",
  },
  {
    key: "build_status",
    token: "%build_status%",
    label: "BUILD STATUS",
    description: "Persistent installation status, such as Ready or Updating.",
    group: "build",
  },
  {
    key: "build_state",
    token: "%build_state%",
    label: "LIVE BUILD STATE",
    description: "Transient state supplied by the current view, such as Running.",
    group: "build",
  },
  {
    key: "build_source",
    token: "%build_source%",
    label: "BUILD SOURCE",
    description: "Build origin: Official for a new build, Imported for an imported build.",
    group: "build",
  },
  {
    key: "total_playtime",
    token: "%total_playtime%",
    label: "TOTAL TIME IN GAME",
    description: "Recorded play time across every build.",
    group: "library",
    aliases: ["total_time_in_game"],
  },
  {
    key: "total_builds",
    token: "%total_builds%",
    label: "TOTAL BUILDS",
    description: "Number of builds in the launcher library.",
    group: "library",
  },
  {
    key: "total_modded_builds",
    token: "%total_modded_builds%",
    label: "MODDED BUILDS",
    description: "Number of builds that use a mod loader.",
    group: "library",
  },
  {
    key: "total_vanilla_builds",
    token: "%total_vanilla_builds%",
    label: "VANILLA BUILDS",
    description: "Number of Vanilla builds in the library.",
    group: "library",
  },
  {
    key: "total_allocated_ram",
    token: "%total_allocated_ram%",
    label: "TOTAL ALLOCATED RAM",
    description: "Sum of the RAM settings across every build.",
    group: "library",
  },
] as const;

export type PlaceholderAppearanceValues = Record<string, string>;

export type PlaceholderValueAttributes = {
  "data-appearance-placeholder-values": string;
};

export type PlaceholderAppearanceAttributes = {
  "data-appearance-text-template": string;
};

export type PlaceholderTemplateSegment =
  | { type: "text"; value: string }
  | {
      type: "placeholder";
      value: string;
      key: string;
      uppercase: boolean;
      definition?: PlaceholderDefinition;
    };

export type PlaceholderTemplateCase = "none" | "value" | "uppercase" | "mixed";

const PLACEHOLDER_BY_KEY = new Map<string, PlaceholderDefinition>();
for (const definition of AVAILABLE_PLACEHOLDERS) {
  PLACEHOLDER_BY_KEY.set(definition.key, definition);
  for (const alias of definition.aliases ?? []) PLACEHOLDER_BY_KEY.set(alias, definition);
}

const PLACEHOLDER_VALUE_ENTRIES = AVAILABLE_PLACEHOLDERS.flatMap((definition) => [
  { key: definition.key, token: definition.token },
  ...(definition.aliases ?? []).map((alias) => ({ key: alias, token: `%${alias}%` })),
]);
const PLACEHOLDER_VALUE_SEPARATOR = "\u0000";
const placeholderValueAttributesCache = new WeakMap<
  (template: string) => string,
  PlaceholderValueAttributes
>();

function toFriendlyPlaceholderValue(value: string, locale: Locale = "en"): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const key = `placeholderValue.${trimmed.toLowerCase()}`;
  if (isPlainMessageKey(key)) return translateFor(locale, key);

  if (/^[A-Z0-9_\-\s]+$/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return trimmed;
}

function formatBuildCreated(raw: string, locale: Locale = "en"): string {
  const timestamp = Number.parseInt(raw, 10);
  if (!Number.isFinite(timestamp) || timestamp <= 0)
    return translateFor(locale, "placeholderValue.unknown");
  return new Date(timestamp * 1_000).toLocaleDateString(intlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getPlaceholderDefinition(keyOrToken: string): PlaceholderDefinition | undefined {
  const key = keyOrToken.replace(/^\^?%|%$/g, "").toLowerCase();
  return PLACEHOLDER_BY_KEY.get(key);
}

function resolvePlaceholderValue(key: string, ctx: PlaceholderContext): string | null {
  const definition = getPlaceholderDefinition(key);
  const canonicalKey = definition?.key ?? key.toLowerCase();
  switch (canonicalKey) {
    case "launcher_name":
      return ctx.launcherName;
    case "launcher_ram":
      return `${ctx.launcherRamGb} GB`;
    case "launcher_ram_value":
      return `${ctx.launcherRamGb}`;
    case "player_name":
      return ctx.playerName;
    case "system_ram":
      return `${ctx.systemRamGb} GB`;
    case "system_ram_value":
      return `${ctx.systemRamGb}`;
    case "build_name":
      return ctx.buildName;
    case "build_version":
      return ctx.buildVersion;
    case "build_loader":
      return toFriendlyPlaceholderValue(ctx.buildLoader, ctx.locale);
    case "build_loader_version":
      return ctx.buildLoaderVersion || "—";
    case "build_full_loader": {
      const loader = toFriendlyPlaceholderValue(ctx.buildLoader, ctx.locale);
      return ctx.buildLoaderVersion ? `${loader} ${ctx.buildLoaderVersion}` : loader;
    }
    case "build_ram":
      return `${ctx.buildRam} GB`;
    case "build_ram_value":
      return `${ctx.buildRam}`;
    case "build_playtime":
      return formatPlaytime(ctx.buildPlaytimeSecs, ctx.locale);
    case "build_last_played":
      return formatLastPlayed(ctx.buildLastPlayed, ctx.locale);
    case "build_created":
      return formatBuildCreated(ctx.buildCreatedAt, ctx.locale);
    case "build_status":
      return toFriendlyPlaceholderValue(ctx.buildStatus, ctx.locale);
    case "build_state":
      return toFriendlyPlaceholderValue(ctx.buildState, ctx.locale);
    case "build_source":
      return toFriendlyPlaceholderValue(ctx.buildSource, ctx.locale);
    case "account_type":
      return toFriendlyPlaceholderValue(ctx.accountType, ctx.locale);
    case "total_playtime":
      return formatPlaytime(ctx.totalPlaytimeSecs, ctx.locale);
    case "total_builds":
      return `${ctx.totalBuilds}`;
    case "total_modded_builds":
      return `${ctx.totalModdedBuilds}`;
    case "total_vanilla_builds":
      return `${ctx.totalVanillaBuilds}`;
    case "total_allocated_ram":
      return `${ctx.totalAllocatedRamGb} GB`;
    default:
      return null;
  }
}

export function resolvePlaceholders(template: string, ctx: PlaceholderContext): string {
  return template.replace(
    /(\^)?%([a-z0-9_]+)%/gi,
    (match, uppercaseFlag: string | undefined, key: string) => {
      const value = resolvePlaceholderValue(key, ctx);
      if (value === null) return match;
      return uppercaseFlag ? value.toUpperCase() : value;
    },
  );
}

export function createPlaceholderValueAttributes(
  resolve: (template: string) => string,
): PlaceholderValueAttributes {
  const cached = placeholderValueAttributesCache.get(resolve);
  if (cached) return cached;

  const resolvedValues = resolve(
    PLACEHOLDER_VALUE_ENTRIES.map((entry) => entry.token).join(PLACEHOLDER_VALUE_SEPARATOR),
  ).split(PLACEHOLDER_VALUE_SEPARATOR);
  const values: PlaceholderAppearanceValues = {};
  if (resolvedValues.length === PLACEHOLDER_VALUE_ENTRIES.length) {
    PLACEHOLDER_VALUE_ENTRIES.forEach((entry, index) => {
      values[entry.key] = resolvedValues[index];
    });
  } else {
    // A control character inside user-provided text is extremely unlikely, but
    // retain a safe fallback rather than publishing a misaligned value map.
    PLACEHOLDER_VALUE_ENTRIES.forEach((entry) => {
      values[entry.key] = resolve(entry.token);
    });
  }
  const attributes = {
    [APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE]: JSON.stringify(values),
  };
  placeholderValueAttributesCache.set(resolve, attributes);
  return attributes;
}

export function createPlaceholderAppearanceAttributes(
  template: string,
  _resolve: (template: string) => string,
): PlaceholderAppearanceAttributes {
  return {
    [APPEARANCE_TEXT_TEMPLATE_ATTRIBUTE]: template,
  };
}

export function parseAppearancePlaceholderValues(
  serializedValues: string | null | undefined,
): PlaceholderAppearanceValues {
  if (!serializedValues) return {};
  try {
    const parsed = JSON.parse(serializedValues) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) =>
        /^[a-z0-9_]+$/i.test(key) && typeof value === "string"
          ? [[key.toLowerCase(), value.slice(0, 512)]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

export function resolveAppearancePlaceholderTemplate(
  template: string,
  serializedValues: string | PlaceholderAppearanceValues | null | undefined,
) {
  const values =
    typeof serializedValues === "string"
      ? parseAppearancePlaceholderValues(serializedValues)
      : (serializedValues ?? {});
  return template.replace(
    /(\^)?%([a-z0-9_]+)%/gi,
    (match, uppercaseFlag: string | undefined, key: string) => {
      const normalizedKey = key.toLowerCase();
      const definition = getPlaceholderDefinition(normalizedKey);
      const value = values[normalizedKey] ?? (definition ? values[definition.key] : undefined);
      if (typeof value !== "string") return match;
      return uppercaseFlag ? value.toUpperCase() : value;
    },
  );
}

export function tokenizePlaceholderTemplate(template: string): PlaceholderTemplateSegment[] {
  const segments: PlaceholderTemplateSegment[] = [];
  const pattern = /(\^)?%([a-z0-9_]+)%/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template))) {
    if (match.index > cursor) {
      segments.push({ type: "text", value: template.slice(cursor, match.index) });
    }
    const key = match[2].toLowerCase();
    segments.push({
      type: "placeholder",
      value: match[0],
      key,
      uppercase: Boolean(match[1]),
      definition: getPlaceholderDefinition(key),
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) segments.push({ type: "text", value: template.slice(cursor) });
  return segments;
}

export function createPlaceholderTokenVariant(token: string, uppercase: boolean): string {
  const normalized = token.startsWith("^") ? token.slice(1) : token;
  return uppercase ? `^${normalized}` : normalized;
}

export function getPlaceholderTemplateCase(template: string): PlaceholderTemplateCase {
  const placeholders = tokenizePlaceholderTemplate(template).filter(
    (segment) => segment.type === "placeholder",
  );
  if (placeholders.length === 0) return "none";
  const uppercaseCount = placeholders.filter((segment) => segment.uppercase).length;
  if (uppercaseCount === 0) return "value";
  if (uppercaseCount === placeholders.length) return "uppercase";
  return "mixed";
}

/**
 * Changes only placeholder case markers and leaves surrounding user text
 * untouched. `value` keeps each resolved value's natural casing, while
 * `uppercase` adds the launcher's shared `^` modifier to every token.
 */
export function setPlaceholderTemplateCase(
  template: string,
  mode: Exclude<PlaceholderTemplateCase, "none" | "mixed">,
): string {
  return template.replace(/(?:\^)?%[a-z0-9_]+%/gi, (token) =>
    createPlaceholderTokenVariant(token, mode === "uppercase"),
  );
}
