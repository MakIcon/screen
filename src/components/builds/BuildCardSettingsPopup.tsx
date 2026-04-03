import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { ElementPopup } from "../popup/ElementPopup";
import { BuildCardEditor } from "./BuildCardEditor";
import "./BuildCardSettingsPopup.css";

export type BuildCardImageFit = "cover" | "stretch";
export type BuildCardPreviewSize = {
  width: number;
  height: number;
};

export type BuildCardAppearance = {
  image: string;
  imageFit: BuildCardImageFit;
  imageOpacity: number;
  backgroundColor: string;
  backgroundOpacity: number;
  badgeEnabled: boolean;
  badgeVisible: boolean;
  badgeText: string;
  badgeColor: string;
  badgeTextColor: string;
};

export const DEFAULT_BUILD_CARD_APPEARANCE: BuildCardAppearance = {
  image: "",
  imageFit: "cover",
  imageOpacity: 0.78,
  backgroundColor: "#1a1a1a",
  backgroundOpacity: 0,
  badgeEnabled: true,
  badgeVisible: true,
  badgeText: "RUNNING",
  badgeColor: "#c2410c",
  badgeTextColor: "#ffffff",
};

function clampUnit(value: number, fallback: number) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizeHexColor(
  value: string | undefined,
  fallback = DEFAULT_BUILD_CARD_APPEARANCE.backgroundColor,
) {
  const raw = (value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return fallback;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = normalizeHexColor(hex);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${clampUnit(alpha, 1)})`;
}

function getContrastTextColor(hex: string) {
  const normalized = normalizeHexColor(hex);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance >= 148 ? "#1a1a1a" : "#ffffff";
}

export function getBuildCardBadgeText(appearance?: BuildCardAppearance | null) {
  const raw = appearance?.badgeText?.trim();
  return raw || DEFAULT_BUILD_CARD_APPEARANCE.badgeText;
}

export function getBuildCardBadgeStyle(
  appearance?: BuildCardAppearance | null,
): CSSProperties | undefined {
  if (!appearance) return undefined;

  const badgeColor = normalizeHexColor(
    appearance.badgeColor,
    DEFAULT_BUILD_CARD_APPEARANCE.badgeColor,
  );
  const badgeTextColor = normalizeHexColor(
    appearance.badgeTextColor,
    getContrastTextColor(badgeColor),
  );
  return {
    backgroundColor: badgeColor,
    color: badgeTextColor,
  };
}

export function normalizeBuildCardAppearance(value: unknown): BuildCardAppearance {
  if (typeof value === "string") {
    return { ...DEFAULT_BUILD_CARD_APPEARANCE, image: value };
  }

  if (!value || typeof value !== "object") {
    return { ...DEFAULT_BUILD_CARD_APPEARANCE };
  }

  const draft = value as Partial<BuildCardAppearance>;
  const normalizedBadgeColor = normalizeHexColor(
    draft.badgeColor,
    DEFAULT_BUILD_CARD_APPEARANCE.badgeColor,
  );
  return {
    image: typeof draft.image === "string" ? draft.image : "",
    imageFit: draft.imageFit === "stretch" ? "stretch" : "cover",
    imageOpacity: clampUnit(
      typeof draft.imageOpacity === "number"
        ? draft.imageOpacity
        : DEFAULT_BUILD_CARD_APPEARANCE.imageOpacity,
      DEFAULT_BUILD_CARD_APPEARANCE.imageOpacity,
    ),
    backgroundColor: normalizeHexColor(
      draft.backgroundColor,
      DEFAULT_BUILD_CARD_APPEARANCE.backgroundColor,
    ),
    backgroundOpacity: clampUnit(
      typeof draft.backgroundOpacity === "number"
        ? draft.backgroundOpacity
        : DEFAULT_BUILD_CARD_APPEARANCE.backgroundOpacity,
      DEFAULT_BUILD_CARD_APPEARANCE.backgroundOpacity,
    ),
    badgeEnabled:
      typeof draft.badgeEnabled === "boolean"
        ? draft.badgeEnabled
        : DEFAULT_BUILD_CARD_APPEARANCE.badgeEnabled,
    badgeVisible:
      typeof draft.badgeVisible === "boolean"
        ? draft.badgeVisible
        : DEFAULT_BUILD_CARD_APPEARANCE.badgeVisible,
    badgeText:
      typeof draft.badgeText === "string" && draft.badgeText.trim()
        ? draft.badgeText.trim()
        : DEFAULT_BUILD_CARD_APPEARANCE.badgeText,
    badgeColor: normalizedBadgeColor,
    badgeTextColor: normalizeHexColor(
      draft.badgeTextColor,
      getContrastTextColor(normalizedBadgeColor),
    ),
  };
}

export function getBuildCardAppearanceStyle(
  appearance?: BuildCardAppearance | null,
): CSSProperties | undefined {
  if (!appearance) return undefined;

  const hasImage = Boolean(appearance.image);
  const safeImageOpacity = clampUnit(
    appearance.imageOpacity,
    DEFAULT_BUILD_CARD_APPEARANCE.imageOpacity,
  );
  const imageFade = hexToRgba("#f8f7f2", 1 - safeImageOpacity);
  const safeBgOpacity = clampUnit(
    appearance.backgroundOpacity,
    DEFAULT_BUILD_CARD_APPEARANCE.backgroundOpacity,
  );

  return {
    backgroundColor:
      safeBgOpacity > 0
        ? hexToRgba(appearance.backgroundColor, safeBgOpacity)
        : undefined,
    backgroundImage: hasImage
      ? `linear-gradient(${imageFade}, ${imageFade}), url(${appearance.image})`
      : undefined,
    backgroundSize: hasImage
      ? appearance.imageFit === "stretch"
        ? "100% 100%, 100% 100%"
        : "cover, cover"
      : undefined,
    backgroundPosition: hasImage ? "center, center" : undefined,
    backgroundRepeat: hasImage ? "no-repeat, no-repeat" : undefined,
    borderColor: hasImage ? "transparent" : undefined,
  };
}

export function SettingsGearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  isCreateMode: boolean;
  buildName: string;
  buildVersion: string;
  buildLoader: string;
  buildRamGb: number;
  lastPlayedLabel: string;
  previewCardSize: BuildCardPreviewSize | null;
  draft: BuildCardAppearance;
  onDraftChange: Dispatch<SetStateAction<BuildCardAppearance>>;
  onUploadImage: (file: File | null) => void;
  onResetAll: () => void;
  onClose: () => void;
  onSave: () => void;
};

export function BuildCardSettingsPopup(props: Props) {
  return (
    <ElementPopup
      open
      onClose={props.onClose}
      className="build-card-settings-dialog"
    >
      <BuildCardEditor {...props} />
    </ElementPopup>
  );
}
