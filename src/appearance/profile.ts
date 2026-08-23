import type { CSSProperties } from "react";
import { TAB_ORDER } from "../constants/tabs";
import type { TabKey } from "../types";
import {
  CLOSE_ANIMATIONS,
  OPEN_ANIMATIONS,
  TAB_ANIMATIONS,
  UI_MOTION_STYLES,
  type CloseAnimationId,
  type OpenAnimationId,
  type TabAnimationId,
  type UiMotionStyle,
} from "./animations";
import type { AppearanceBackgroundKind, AppearanceProfile, Theme } from "./types";

export const APPEARANCE_STORAGE_KEY = "screenlauncher-appearance-v2";
export const LEGACY_THEME_STORAGE_KEY = "screenlauncher-theme";
export const APPEARANCE_CHANGED_EVENT = "appearance-profile-changed";
export const APPEARANCE_PREVIEW_EVENT = "appearance-profile-preview";

export const FONT_OPTIONS = [
  { id: "inter", label: "INTER", value: '"Inter", sans-serif' },
  { id: "segoe", label: "SEGOE UI", value: '"Segoe UI", sans-serif' },
  { id: "arial", label: "ARIAL", value: "Arial, sans-serif" },
  { id: "georgia", label: "GEORGIA", value: "Georgia, serif" },
  {
    id: "mono",
    label: "JETBRAINS MONO",
    value: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
  },
] as const;

export const DISPLAY_FONT_OPTIONS = [
  { id: "playfair", label: "PLAYFAIR", value: '"Playfair Display", serif' },
  { id: "georgia", label: "GEORGIA", value: "Georgia, serif" },
  { id: "inter", label: "INTER", value: '"Inter", "Segoe UI", sans-serif' },
  {
    id: "mono",
    label: "MONO",
    value: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
  },
] as const;

const THEME_COLORS: Record<
  Theme,
  AppearanceProfile["colors"] & { cardAlpha: number; panelAlpha: number }
> = {
  light: {
    background: "#f8f7f2",
    surface: "#ffffff",
    text: "#1a1a1a",
    accent: "#c2410c",
    cardAlpha: 0.3,
    panelAlpha: 0.65,
  },
  dark: {
    background: "#111110",
    surface: "#ffffff",
    text: "#e8e6e1",
    accent: "#f26522",
    cardAlpha: 0.04,
    panelAlpha: 0.72,
  },
  void: {
    background: "#000000",
    surface: "#ffffff",
    text: "#d8d5cf",
    accent: "#f26522",
    cardAlpha: 0.025,
    panelAlpha: 0.92,
  },
};

const DEFAULT_TAB_ANIMATIONS: Record<TabKey, TabAnimationId> = {
  overview: "rise",
  instances: "slide-left",
  mods: "fade",
  resourcepacks: "rise",
  shaders: "zoom",
  settings: "fade",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp);base64,/i;
const MAX_EMBEDDED_IMAGE_LENGTH = 4_200_000;
const SAFE_ELEMENT_ID = /^element-[a-z0-9-]{1,72}$/;
const SAFE_ELEMENT_TAG = /^[a-z][a-z0-9-]{0,31}$/;
const SAFE_ELEMENT_MARKER = /^(?:id|class):[a-z_][a-z0-9_-]{0,63}$/i;
const MAX_ELEMENT_OVERRIDES = 64;
const MAX_ELEMENT_TEXT_LENGTH = 160;
const MAX_TEXT_TARGET_DEPTH = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function pickColor(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function pickEnum<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : fallback;
}

function pickImageDataUrl(value: unknown) {
  return typeof value === "string" &&
    value.length <= MAX_EMBEDDED_IMAGE_LENGTH &&
    SAFE_IMAGE_DATA_URL.test(value)
    ? value
    : "";
}

function normalizeElementOverrides(value: unknown): AppearanceProfile["elementOverrides"] {
  if (!Array.isArray(value)) return [];

  const fontFamilies = [
    ...FONT_OPTIONS.map((option) => option.value),
    ...DISPLAY_FONT_OPTIONS.map((option) => option.value),
  ];

  return value.slice(0, MAX_ELEMENT_OVERRIDES).flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = pickString(candidate.id, "");
    if (!SAFE_ELEMENT_ID.test(id)) return [];
    if (
      !Array.isArray(candidate.path) ||
      candidate.path.length === 0 ||
      candidate.path.length > 24
    ) {
      return [];
    }

    const path = candidate.path.flatMap((segment) => {
      if (!isRecord(segment)) return [];
      const tag = pickString(segment.tag, "").toLowerCase();
      const index = segment.index;
      const marker = pickString(segment.marker, "");
      return SAFE_ELEMENT_TAG.test(tag) &&
        (!marker || SAFE_ELEMENT_MARKER.test(marker)) &&
        typeof index === "number" &&
        Number.isInteger(index) &&
        index >= 0 &&
        index <= 255
        ? [{ tag, index, ...(marker ? { marker } : {}) }]
        : [];
    });
    if (path.length !== candidate.path.length) return [];

    const rawStyle = isRecord(candidate.style) ? candidate.style : {};
    const style: AppearanceProfile["elementOverrides"][number]["style"] = {};
    if (typeof rawStyle.opacity === "number" && Number.isFinite(rawStyle.opacity)) {
      style.opacity = clampNumber(rawStyle.opacity, 1, 0, 1);
    }
    if (typeof rawStyle.radius === "number" && Number.isFinite(rawStyle.radius)) {
      style.radius = clampNumber(rawStyle.radius, 0, 0, 40);
    }
    if (fontFamilies.includes(rawStyle.fontFamily as (typeof fontFamilies)[number])) {
      style.fontFamily = rawStyle.fontFamily as string;
    }
    if (typeof rawStyle.fontSize === "number" && Number.isFinite(rawStyle.fontSize)) {
      style.fontSize = clampNumber(rawStyle.fontSize, 14, 6, 96);
    }
    if (typeof rawStyle.fontWeight === "number" && Number.isFinite(rawStyle.fontWeight)) {
      style.fontWeight = Math.round(clampNumber(rawStyle.fontWeight, 700, 100, 900) / 100) * 100;
    }
    if (typeof rawStyle.letterSpacing === "number" && Number.isFinite(rawStyle.letterSpacing)) {
      style.letterSpacing = clampNumber(rawStyle.letterSpacing, 0, -2, 10);
    }
    if (typeof rawStyle.lineHeight === "number" && Number.isFinite(rawStyle.lineHeight)) {
      style.lineHeight = clampNumber(rawStyle.lineHeight, 1.2, 0.7, 2.5);
    }
    if (["left", "center", "right"].includes(rawStyle.textAlign as string)) {
      style.textAlign = rawStyle.textAlign as NonNullable<typeof style.textAlign>;
    }
    if (typeof rawStyle.backgroundColor === "string" && HEX_COLOR.test(rawStyle.backgroundColor)) {
      style.backgroundColor = rawStyle.backgroundColor.toLowerCase();
    }
    if (typeof rawStyle.textColor === "string" && HEX_COLOR.test(rawStyle.textColor)) {
      style.textColor = rawStyle.textColor.toLowerCase();
    }
    if (typeof rawStyle.paddingX === "number" && Number.isFinite(rawStyle.paddingX)) {
      style.paddingX = clampNumber(rawStyle.paddingX, 0, 0, 64);
    }
    if (typeof rawStyle.paddingY === "number" && Number.isFinite(rawStyle.paddingY)) {
      style.paddingY = clampNumber(rawStyle.paddingY, 0, 0, 48);
    }
    if (typeof rawStyle.borderWidth === "number" && Number.isFinite(rawStyle.borderWidth)) {
      style.borderWidth = clampNumber(rawStyle.borderWidth, 0, 0, 8);
    }
    if (typeof rawStyle.borderColor === "string" && HEX_COLOR.test(rawStyle.borderColor)) {
      style.borderColor = rawStyle.borderColor.toLowerCase();
    }
    if (["none", "soft", "strong", "glow"].includes(rawStyle.shadow as string)) {
      style.shadow = rawStyle.shadow as NonNullable<typeof style.shadow>;
    }
    if (typeof rawStyle.scale === "number" && Number.isFinite(rawStyle.scale)) {
      style.scale = clampNumber(rawStyle.scale, 1, 0.5, 1.5);
    }
    if (typeof rawStyle.rotate === "number" && Number.isFinite(rawStyle.rotate)) {
      style.rotate = clampNumber(rawStyle.rotate, 0, -15, 15);
    }

    const rawTextTarget = isRecord(candidate.textTarget) ? candidate.textTarget : null;
    const textPath = rawTextTarget?.path;
    const originalText = rawTextTarget?.original;
    const textTarget =
      Array.isArray(textPath) &&
      textPath.length > 0 &&
      textPath.length <= MAX_TEXT_TARGET_DEPTH &&
      textPath.every(
        (index) =>
          typeof index === "number" && Number.isInteger(index) && index >= 0 && index <= 255,
      ) &&
      typeof originalText === "string" &&
      originalText.trim().length > 0
        ? {
            path: textPath as number[],
            original: originalText.trim().slice(0, MAX_ELEMENT_TEXT_LENGTH),
          }
        : undefined;
    const hasTextOverride = textTarget !== undefined && typeof candidate.text === "string";
    if (Object.keys(style).length === 0 && !hasTextOverride) return [];

    return [
      {
        id,
        label: pickString(candidate.label, "ELEMENT").slice(0, 80),
        path,
        ...(TAB_ORDER.includes(candidate.tab as TabKey) ? { tab: candidate.tab as TabKey } : {}),
        ...(textTarget ? { textTarget } : {}),
        ...(hasTextOverride
          ? { text: (candidate.text as string).slice(0, MAX_ELEMENT_TEXT_LENGTH) }
          : {}),
        style,
      },
    ];
  });
}

export function createDefaultAppearance(
  baseTheme: Theme = "light",
  customized = false,
): AppearanceProfile {
  const colors = THEME_COLORS[baseTheme];
  return {
    version: 1,
    customized,
    baseTheme,
    colors: {
      background: colors.background,
      surface: colors.surface,
      text: colors.text,
      accent: colors.accent,
    },
    background: {
      kind: "solid",
      imageDataUrl: "",
      imageName: "",
      drawingDataUrl: "",
      dim: 0.25,
      blur: 0,
    },
    shape: { radius: 0 },
    typography: {
      uiFont: FONT_OPTIONS[0].value,
      displayFont: DISPLAY_FONT_OPTIONS[0].value,
    },
    opacity: {
      window: 1,
      panels: 0,
      controls: 1,
    },
    elementOverrides: [],
    motion: {
      enabled: true,
      uiStyle: "smooth",
      opening: "unfold",
      tabMode: "global",
      tabDefault: "rise",
      tabByTarget: { ...DEFAULT_TAB_ANIMATIONS },
      closeButton: "tear",
      closeSystem: "shred",
    },
  };
}

export function normalizeAppearanceProfile(value: unknown): AppearanceProfile {
  const record = isRecord(value) ? value : {};
  const baseTheme = pickEnum(record.baseTheme, ["light", "dark", "void"] as const, "light");
  const fallback = createDefaultAppearance(baseTheme, Boolean(record.customized));
  const colors = isRecord(record.colors) ? record.colors : {};
  const background = isRecord(record.background) ? record.background : {};
  const shape = isRecord(record.shape) ? record.shape : {};
  const typography = isRecord(record.typography) ? record.typography : {};
  const opacity = isRecord(record.opacity) ? record.opacity : {};
  const motion = isRecord(record.motion) ? record.motion : {};
  const tabByTarget = isRecord(motion.tabByTarget) ? motion.tabByTarget : {};

  const tabAnimationIds = TAB_ANIMATIONS.map((option) => option.id);
  const openingIds = OPEN_ANIMATIONS.map((option) => option.id);
  const closeIds = CLOSE_ANIMATIONS.map((option) => option.id);
  const uiMotionIds = UI_MOTION_STYLES.map((option) => option.id);

  return {
    version: 1,
    customized: Boolean(record.customized),
    baseTheme,
    colors: {
      background: pickColor(colors.background, fallback.colors.background),
      surface: pickColor(colors.surface, fallback.colors.surface),
      text: pickColor(colors.text, fallback.colors.text),
      accent: pickColor(colors.accent, fallback.colors.accent),
    },
    background: {
      kind: pickEnum<AppearanceBackgroundKind>(
        background.kind,
        ["solid", "image", "drawing"],
        fallback.background.kind,
      ),
      imageDataUrl: pickImageDataUrl(background.imageDataUrl),
      imageName: pickString(background.imageName, "").slice(0, 180),
      drawingDataUrl: pickImageDataUrl(background.drawingDataUrl),
      dim: clampNumber(background.dim, fallback.background.dim, 0, 0.9),
      blur: clampNumber(background.blur, fallback.background.blur, 0, 24),
    },
    shape: {
      radius: clampNumber(shape.radius, fallback.shape.radius, 0, 28),
    },
    typography: {
      uiFont: pickEnum(
        typography.uiFont,
        FONT_OPTIONS.map((option) => option.value),
        fallback.typography.uiFont,
      ),
      displayFont: pickEnum(
        typography.displayFont,
        DISPLAY_FONT_OPTIONS.map((option) => option.value),
        fallback.typography.displayFont,
      ),
    },
    opacity: {
      window: clampNumber(opacity.window, fallback.opacity.window, 0.55, 1),
      panels: clampNumber(opacity.panels, fallback.opacity.panels, 0, 1),
      controls: clampNumber(opacity.controls, fallback.opacity.controls, 0.35, 1),
    },
    elementOverrides: normalizeElementOverrides(record.elementOverrides),
    motion: {
      enabled: typeof motion.enabled === "boolean" ? motion.enabled : fallback.motion.enabled,
      uiStyle: pickEnum<UiMotionStyle>(motion.uiStyle, uiMotionIds, fallback.motion.uiStyle),
      opening: pickEnum<OpenAnimationId>(motion.opening, openingIds, fallback.motion.opening),
      tabMode: pickEnum(motion.tabMode, ["global", "per-tab"] as const, fallback.motion.tabMode),
      tabDefault: pickEnum<TabAnimationId>(
        motion.tabDefault,
        tabAnimationIds,
        fallback.motion.tabDefault,
      ),
      tabByTarget: Object.fromEntries(
        TAB_ORDER.map((tab) => [
          tab,
          pickEnum<TabAnimationId>(
            tabByTarget[tab],
            tabAnimationIds,
            fallback.motion.tabByTarget[tab],
          ),
        ]),
      ) as Record<TabKey, TabAnimationId>,
      closeButton: pickEnum<CloseAnimationId>(
        motion.closeButton,
        closeIds,
        fallback.motion.closeButton,
      ),
      closeSystem: pickEnum<CloseAnimationId>(
        motion.closeSystem,
        closeIds,
        fallback.motion.closeSystem,
      ),
    },
  };
}

function hexToRgba(hex: string, alpha: number) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
}

function selectedBackgroundImage(profile: AppearanceProfile) {
  if (profile.background.kind === "image") return profile.background.imageDataUrl;
  if (profile.background.kind === "drawing") return profile.background.drawingDataUrl;
  return "";
}

export function buildAppearanceStyle(profileValue: AppearanceProfile): CSSProperties {
  const profile = normalizeAppearanceProfile(profileValue);
  const theme = THEME_COLORS[profile.baseTheme];
  const cardAlpha = theme.cardAlpha * profile.opacity.panels;
  const panelAlpha = theme.panelAlpha * profile.opacity.panels;
  const backgroundImage = selectedBackgroundImage(profile);
  const backgroundDim = backgroundImage ? profile.background.dim : 0;

  return {
    "--bg": profile.colors.background,
    "--ink": profile.colors.text,
    "--accent": profile.colors.accent,
    "--line": hexToRgba(profile.colors.text, 0.1),
    "--line-strong": hexToRgba(profile.colors.text, 0.18),
    "--bg-card": hexToRgba(profile.colors.surface, cardAlpha),
    "--bg-card-strong": hexToRgba(profile.colors.surface, cardAlpha * 1.45),
    "--bg-field": hexToRgba(profile.colors.surface, Math.min(0.5, cardAlpha * 1.25)),
    "--bg-panel": hexToRgba(profile.colors.background, panelAlpha),
    "--bg-panel-strong": hexToRgba(profile.colors.background, Math.min(1, panelAlpha * 1.2)),
    "--appearance-background-color": profile.colors.background,
    "--appearance-background-image": backgroundImage ? `url("${backgroundImage}")` : "none",
    "--appearance-background-dim": hexToRgba("#000000", backgroundDim),
    "--appearance-background-blur": `${profile.background.blur}px`,
    "--appearance-background-bleed": `${-(profile.background.blur + 2)}px`,
    "--appearance-window-opacity": String(profile.opacity.window),
    "--appearance-panel-opacity": String(profile.opacity.panels),
    "--appearance-control-opacity": String(profile.opacity.controls),
    "--ui-radius": `${profile.shape.radius}px`,
    "--font-ui": profile.typography.uiFont,
    "--font-display": profile.typography.displayFont,
  } as CSSProperties;
}

export function applyAppearanceToElement(element: HTMLElement, profileValue: AppearanceProfile) {
  const profile = normalizeAppearanceProfile(profileValue);
  element.dataset.theme = profile.baseTheme === "light" ? "" : profile.baseTheme;
  element.dataset.appearanceCustom = profile.customized ? "true" : "false";
  element.dataset.appearanceBackground = profile.background.kind;
  element.dataset.appearancePanels = profile.opacity.panels <= 0.001 ? "transparent" : "tinted";
  element.dataset.motion = profile.motion.enabled ? profile.motion.uiStyle : "off";
  element.dataset.openAnimation = profile.motion.enabled ? profile.motion.opening : "none";

  const style = buildAppearanceStyle(profile) as Record<string, string>;
  Object.entries(style).forEach(([property, value]) => {
    if (profile.customized) {
      element.style.setProperty(property, value);
    } else {
      // Built-in profiles are the launcher's original CSS with no appearance overrides.
      element.style.removeProperty(property);
    }
  });
}

export function resolveTabAnimation(profile: AppearanceProfile, target: TabKey): TabAnimationId {
  if (!profile.motion.enabled) return "none";
  return profile.motion.tabMode === "per-tab"
    ? profile.motion.tabByTarget[target]
    : profile.motion.tabDefault;
}

export function readStoredAppearance(): AppearanceProfile {
  try {
    const serialized = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (serialized) return normalizeAppearanceProfile(JSON.parse(serialized));
  } catch {
    // Corrupt or unavailable storage falls through to a safe built-in profile.
  }

  const legacyTheme = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  const theme = legacyTheme === "dark" || legacyTheme === "void" ? legacyTheme : "light";
  return createDefaultAppearance(theme);
}

export function writeStoredAppearance(profileValue: AppearanceProfile) {
  const profile = normalizeAppearanceProfile(profileValue);
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(profile));
  window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, profile.baseTheme);
  return profile;
}
