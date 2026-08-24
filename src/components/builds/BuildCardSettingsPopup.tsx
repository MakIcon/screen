import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { ElementPopup } from "../popup/ElementPopup";
import { BuildCardEditor } from "./BuildCardEditor";
import { BuildRuntimeSettingsEditor } from "./BuildRuntimeSettingsEditor";
import { BuildModsEditor } from "./BuildModsEditor";
import type { BuildRuntimeSettingsDraft } from "../../types";
import "./BuildCardSettingsPopup.css";

export type BuildCardImageFit = "cover" | "stretch";
export type BuildCardBackgroundMode = "color" | "image" | "url" | "draw";
export type BuildCardBadgeVisibility = "on" | "off" | "always";
export type BuildCardPreviewSize = {
  width: number;
  height: number;
};
export type BuildCardTextAlign = "left" | "center" | "right";
export type BuildCardContentMode = "tags" | "text";
export type BuildCardElementPosition = {
  x: number;
  y: number;
};
export type BuildCardContentTag = {
  id: string;
  text: string;
  borderColor: string;
  fillColor: string;
  textColor: string;
  fillOpacity: number;
  fontSize: number;
};

let buildCardTagSeed = 0;

export const BUILD_CARD_TITLE_ELEMENT_ID = "title";
export const BUILD_CARD_BADGE_ELEMENT_ID = "badge";

const DEFAULT_TITLE_POSITION: BuildCardElementPosition = { x: 0, y: 0 };
const DEFAULT_BADGE_POSITION: BuildCardElementPosition = { x: 0.76, y: 0 };
const DEFAULT_TAG_POSITION_PRESETS: BuildCardElementPosition[] = [
  { x: 0, y: 0.62 },
  { x: 0.28, y: 0.62 },
  { x: 0.5, y: 0.62 },
  { x: 0.72, y: 0.62 },
  { x: 0, y: 0.8 },
  { x: 0.28, y: 0.8 },
  { x: 0.5, y: 0.8 },
  { x: 0.72, y: 0.8 },
];

export function getDefaultBuildCardTitlePosition(): BuildCardElementPosition {
  return { ...DEFAULT_TITLE_POSITION };
}

export function getDefaultBuildCardBadgePosition(): BuildCardElementPosition {
  return { ...DEFAULT_BADGE_POSITION };
}

export type BuildCardAppearance = {
  backgroundMode: BuildCardBackgroundMode;
  image: string;
  imageFit: BuildCardImageFit;
  imageOpacity: number;
  drawingImage: string;
  drawingOpacity: number;
  cardHeight: number;
  backgroundColor: string;
  backgroundOpacity: number;
  titleText: string;
  titleFontSize: number;
  titleColor: string;
  titlePosition: BuildCardElementPosition;
  badgeEnabled: boolean;
  badgeVisibility: BuildCardBadgeVisibility;
  badgeText: string;
  badgeColor: string;
  badgeTextColor: string;
  badgePosition: BuildCardElementPosition;
  contentEnabled: boolean;
  contentMode: BuildCardContentMode;
  contentTextAlign: BuildCardTextAlign;
  contentTextStrokeEnabled: boolean;
  contentTags: BuildCardContentTag[];
  contentTagPositions: Record<string, BuildCardElementPosition>;
};

function clampPercent(value: number, fallback: number) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampFontSize(value: number, fallback: number) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(28, Math.max(8, Math.round(value)));
}

function clampTitleFontSize(value: number, fallback: number) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(32, Math.max(10, Math.round(value)));
}

function clampCardHeight(value: number, fallback: number) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(260, Math.max(0, Math.round(value)));
}

function clampLayoutUnit(value: number, fallback: number) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizeBuildCardElementPosition(
  value: unknown,
  fallback: BuildCardElementPosition,
): BuildCardElementPosition {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }

  const draft = value as Partial<BuildCardElementPosition>;
  return {
    x: clampLayoutUnit(typeof draft.x === "number" ? draft.x : fallback.x, fallback.x),
    y: clampLayoutUnit(typeof draft.y === "number" ? draft.y : fallback.y, fallback.y),
  };
}

export function getDefaultBuildCardTagPosition(index: number): BuildCardElementPosition {
  const preset = DEFAULT_TAG_POSITION_PRESETS[index];
  if (preset) {
    return { ...preset };
  }

  const row = Math.floor(index / 4);
  const col = index % 4;
  return {
    x: clampLayoutUnit(col * 0.24, 0),
    y: clampLayoutUnit(0.62 + row * 0.18, 0.62),
  };
}

export function createDefaultBuildCardTagPositions(tags: BuildCardContentTag[]) {
  return Object.fromEntries(
    tags.map((tag, index) => [tag.id, getDefaultBuildCardTagPosition(index)]),
  ) as Record<string, BuildCardElementPosition>;
}

function normalizeBuildCardTagPositions(
  value: unknown,
  tags: BuildCardContentTag[],
): Record<string, BuildCardElementPosition> {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return Object.fromEntries(
    tags.map((tag, index) => [
      tag.id,
      normalizeBuildCardElementPosition(source[tag.id], getDefaultBuildCardTagPosition(index)),
    ]),
  ) as Record<string, BuildCardElementPosition>;
}

export function createBuildCardContentTag(
  mode: BuildCardContentMode = "tags",
  overrides: Partial<BuildCardContentTag> = {},
): BuildCardContentTag {
  buildCardTagSeed += 1;
  const defaultFillOpacity = mode === "text" ? 100 : 14;
  const defaultBorderColor = mode === "text" ? "#334155" : "#475569";
  const defaultFillColor = mode === "text" ? "#1f2937" : "#94a3b8";
  const normalizedBorderColor = normalizeHexColor(overrides.borderColor, defaultBorderColor);
  return {
    id: overrides.id ?? `build-card-tag-${Date.now()}-${buildCardTagSeed}`,
    text: overrides.text ?? "^%build_version%",
    borderColor: normalizedBorderColor,
    fillColor: normalizeHexColor(overrides.fillColor, defaultFillColor),
    textColor: normalizeHexColor(
      overrides.textColor,
      mode === "text" ? normalizedBorderColor : "#0f172a",
    ),
    fillOpacity: clampPercent(
      typeof overrides.fillOpacity === "number" ? overrides.fillOpacity : defaultFillOpacity,
      defaultFillOpacity,
    ),
    fontSize: clampFontSize(typeof overrides.fontSize === "number" ? overrides.fontSize : 9, 9),
  };
}

export const DEFAULT_BUILD_CARD_CONTENT_TAGS: BuildCardContentTag[] = [
  createBuildCardContentTag("tags", {
    id: "build-card-tag-version",
    text: "^%build_version%",
    borderColor: "#334155",
    fillColor: "#94a3b8",
    textColor: "#0f172a",
    fillOpacity: 16,
  }),
  createBuildCardContentTag("tags", {
    id: "build-card-tag-loader",
    text: "^%build_loader%",
    borderColor: "#166534",
    fillColor: "#22c55e",
    textColor: "#14532d",
    fillOpacity: 16,
  }),
  createBuildCardContentTag("tags", {
    id: "build-card-tag-ram",
    text: "^%build_ram%",
    borderColor: "#1d4ed8",
    fillColor: "#3b82f6",
    textColor: "#1e3a8a",
    fillOpacity: 16,
  }),
  createBuildCardContentTag("tags", {
    id: "build-card-tag-last-played",
    text: "^%build_last_played%",
    borderColor: "#b45309",
    fillColor: "#f59e0b",
    textColor: "#92400e",
    fillOpacity: 18,
  }),
];

export function cloneBuildCardContentTags(tags: BuildCardContentTag[]) {
  return tags.map((tag) => ({ ...tag }));
}

export const DEFAULT_BUILD_CARD_APPEARANCE: BuildCardAppearance = {
  backgroundMode: "color",
  image: "",
  imageFit: "cover",
  imageOpacity: 0.78,
  drawingImage: "",
  drawingOpacity: 1,
  cardHeight: 0,
  backgroundColor: "#1a1a1a",
  backgroundOpacity: 0,
  titleText: "%build_name%",
  titleFontSize: 13,
  titleColor: "#1a1a1a",
  titlePosition: { ...DEFAULT_TITLE_POSITION },
  badgeEnabled: true,
  badgeVisibility: "on",
  badgeText: "^%build_state%",
  badgeColor: "#c2410c",
  badgeTextColor: "#ffffff",
  badgePosition: { ...DEFAULT_BADGE_POSITION },
  contentEnabled: false,
  contentMode: "tags",
  contentTextAlign: "left",
  contentTextStrokeEnabled: true,
  contentTags: cloneBuildCardContentTags(DEFAULT_BUILD_CARD_CONTENT_TAGS),
  contentTagPositions: createDefaultBuildCardTagPositions(DEFAULT_BUILD_CARD_CONTENT_TAGS),
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

function normalizeBuildCardContentTag(
  value: unknown,
  fallback: BuildCardContentTag,
  mode: BuildCardContentMode,
): BuildCardContentTag {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }

  const draft = value as Partial<BuildCardContentTag>;
  return createBuildCardContentTag(mode, {
    id: typeof draft.id === "string" && draft.id.trim() ? draft.id.trim() : fallback.id,
    text: typeof draft.text === "string" && draft.text.length > 0 ? draft.text : fallback.text,
    borderColor: normalizeHexColor(draft.borderColor, fallback.borderColor),
    fillColor: normalizeHexColor(draft.fillColor, fallback.fillColor),
    textColor: normalizeHexColor(draft.textColor, fallback.textColor),
    fillOpacity: clampPercent(
      typeof draft.fillOpacity === "number" ? draft.fillOpacity : fallback.fillOpacity,
      fallback.fillOpacity,
    ),
    fontSize: clampFontSize(
      typeof draft.fontSize === "number" ? draft.fontSize : fallback.fontSize,
      fallback.fontSize,
    ),
  });
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

export function getBuildCardTitleText(appearance?: BuildCardAppearance | null) {
  const raw = appearance?.titleText?.trim();
  return raw || DEFAULT_BUILD_CARD_APPEARANCE.titleText;
}

export function getBuildCardBadgeVisibility(
  appearance?: BuildCardAppearance | null,
): BuildCardBadgeVisibility {
  return appearance?.badgeVisibility ?? DEFAULT_BUILD_CARD_APPEARANCE.badgeVisibility;
}

export function shouldShowBuildCardBadge(
  appearance: BuildCardAppearance | null | undefined,
  isRunning: boolean,
): boolean {
  if (!appearance?.badgeEnabled) return false;

  const visibility = getBuildCardBadgeVisibility(appearance);
  if (visibility === "always") return true;
  if (visibility === "off") return false;
  return isRunning;
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
    return {
      ...DEFAULT_BUILD_CARD_APPEARANCE,
      backgroundMode: value.startsWith("data:") ? "image" : "url",
      image: value,
      contentTags: cloneBuildCardContentTags(DEFAULT_BUILD_CARD_CONTENT_TAGS),
    };
  }

  if (!value || typeof value !== "object") {
    return {
      ...DEFAULT_BUILD_CARD_APPEARANCE,
      contentTags: cloneBuildCardContentTags(DEFAULT_BUILD_CARD_CONTENT_TAGS),
    };
  }

  const draft = value as Partial<BuildCardAppearance>;
  const backgroundMode: BuildCardBackgroundMode =
    draft.backgroundMode === "color" ||
    draft.backgroundMode === "image" ||
    draft.backgroundMode === "url" ||
    draft.backgroundMode === "draw"
      ? draft.backgroundMode
      : typeof draft.image === "string" && draft.image
        ? draft.image.startsWith("data:")
          ? "image"
          : "url"
        : "color";
  const legacyVisibility = (draft as { badgeVisible?: boolean | string }).badgeVisible;
  const normalizedBadgeColor = normalizeHexColor(
    draft.badgeColor,
    DEFAULT_BUILD_CARD_APPEARANCE.badgeColor,
  );
  const badgeVisibility: BuildCardBadgeVisibility =
    draft.badgeVisibility === "always" || legacyVisibility === "always"
      ? "always"
      : draft.badgeVisibility === "off"
        ? "off"
        : draft.badgeVisibility === "on"
          ? "on"
          : typeof legacyVisibility === "boolean"
            ? legacyVisibility
              ? "on"
              : "off"
            : DEFAULT_BUILD_CARD_APPEARANCE.badgeVisibility;
  const contentMode: BuildCardContentMode = draft.contentMode === "text" ? "text" : "tags";
  const contentTextAlign: BuildCardTextAlign =
    draft.contentTextAlign === "center" || draft.contentTextAlign === "right"
      ? draft.contentTextAlign
      : DEFAULT_BUILD_CARD_APPEARANCE.contentTextAlign;
  const contentTags = Array.isArray(draft.contentTags)
    ? draft.contentTags.map((tag, index) =>
        normalizeBuildCardContentTag(
          tag,
          DEFAULT_BUILD_CARD_CONTENT_TAGS[index] ?? createBuildCardContentTag(contentMode),
          contentMode,
        ),
      )
    : cloneBuildCardContentTags(DEFAULT_BUILD_CARD_CONTENT_TAGS);
  return {
    backgroundMode,
    image: typeof draft.image === "string" ? draft.image : "",
    imageFit: draft.imageFit === "stretch" ? "stretch" : "cover",
    imageOpacity: clampUnit(
      typeof draft.imageOpacity === "number"
        ? draft.imageOpacity
        : DEFAULT_BUILD_CARD_APPEARANCE.imageOpacity,
      DEFAULT_BUILD_CARD_APPEARANCE.imageOpacity,
    ),
    drawingImage: typeof draft.drawingImage === "string" ? draft.drawingImage : "",
    drawingOpacity: clampUnit(
      typeof draft.drawingOpacity === "number"
        ? draft.drawingOpacity
        : DEFAULT_BUILD_CARD_APPEARANCE.drawingOpacity,
      DEFAULT_BUILD_CARD_APPEARANCE.drawingOpacity,
    ),
    cardHeight: clampCardHeight(
      typeof draft.cardHeight === "number"
        ? draft.cardHeight
        : DEFAULT_BUILD_CARD_APPEARANCE.cardHeight,
      DEFAULT_BUILD_CARD_APPEARANCE.cardHeight,
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
    titleText:
      typeof draft.titleText === "string" && draft.titleText.trim()
        ? draft.titleText.trim()
        : DEFAULT_BUILD_CARD_APPEARANCE.titleText,
    titleFontSize: clampTitleFontSize(
      typeof draft.titleFontSize === "number"
        ? draft.titleFontSize
        : DEFAULT_BUILD_CARD_APPEARANCE.titleFontSize,
      DEFAULT_BUILD_CARD_APPEARANCE.titleFontSize,
    ),
    titleColor: normalizeHexColor(draft.titleColor, DEFAULT_BUILD_CARD_APPEARANCE.titleColor),
    titlePosition: normalizeBuildCardElementPosition(draft.titlePosition, DEFAULT_TITLE_POSITION),
    badgeEnabled:
      typeof draft.badgeEnabled === "boolean"
        ? draft.badgeEnabled
        : DEFAULT_BUILD_CARD_APPEARANCE.badgeEnabled,
    badgeVisibility,
    badgeText:
      typeof draft.badgeText === "string" && draft.badgeText.trim()
        ? draft.badgeText.trim()
        : DEFAULT_BUILD_CARD_APPEARANCE.badgeText,
    badgeColor: normalizedBadgeColor,
    badgeTextColor: normalizeHexColor(
      draft.badgeTextColor,
      getContrastTextColor(normalizedBadgeColor),
    ),
    badgePosition: normalizeBuildCardElementPosition(draft.badgePosition, DEFAULT_BADGE_POSITION),
    contentEnabled:
      typeof draft.contentEnabled === "boolean"
        ? draft.contentEnabled
        : DEFAULT_BUILD_CARD_APPEARANCE.contentEnabled,
    contentMode,
    contentTextAlign,
    contentTextStrokeEnabled:
      typeof draft.contentTextStrokeEnabled === "boolean"
        ? draft.contentTextStrokeEnabled
        : DEFAULT_BUILD_CARD_APPEARANCE.contentTextStrokeEnabled,
    contentTags,
    contentTagPositions: normalizeBuildCardTagPositions(draft.contentTagPositions, contentTags),
  };
}

export function getBuildCardAppearanceStyle(
  appearance?: BuildCardAppearance | null,
): CSSProperties | undefined {
  if (!appearance) return undefined;

  const backgroundImage =
    appearance.backgroundMode === "draw"
      ? appearance.drawingImage
      : appearance.backgroundMode === "image" || appearance.backgroundMode === "url"
        ? appearance.image
        : "";
  const hasImage = Boolean(backgroundImage);
  const safeImageOpacity = clampUnit(
    appearance.backgroundMode === "draw" ? appearance.drawingOpacity : appearance.imageOpacity,
    appearance.backgroundMode === "draw"
      ? DEFAULT_BUILD_CARD_APPEARANCE.drawingOpacity
      : DEFAULT_BUILD_CARD_APPEARANCE.imageOpacity,
  );
  const imageFade = hexToRgba("#f8f7f2", 1 - safeImageOpacity);
  const safeBgOpacity = clampUnit(
    appearance.backgroundOpacity,
    DEFAULT_BUILD_CARD_APPEARANCE.backgroundOpacity,
  );

  return {
    backgroundColor:
      safeBgOpacity > 0 ? hexToRgba(appearance.backgroundColor, safeBgOpacity) : undefined,
    backgroundImage: hasImage
      ? `linear-gradient(${imageFade}, ${imageFade}), url(${backgroundImage})`
      : undefined,
    backgroundSize: hasImage
      ? appearance.backgroundMode === "draw" || appearance.imageFit === "stretch"
        ? "100% 100%, 100% 100%"
        : "cover, cover"
      : undefined,
    backgroundPosition: hasImage ? "center, center" : undefined,
    backgroundRepeat: hasImage ? "no-repeat, no-repeat" : undefined,
    borderColor: hasImage ? "transparent" : undefined,
    minHeight: appearance.cardHeight > 0 ? `${appearance.cardHeight}px` : undefined,
  };
}

export function hasBuildCardBackgroundImage(appearance?: BuildCardAppearance | null): boolean {
  if (!appearance) return false;
  if (appearance.backgroundMode === "draw") return Boolean(appearance.drawingImage);
  if (appearance.backgroundMode === "image" || appearance.backgroundMode === "url") {
    return Boolean(appearance.image);
  }
  return false;
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
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  instanceId: string | null;
  systemRamGb: number;
  optimizedJavaArgs: boolean;
  buildName: string;
  buildVersion: string;
  buildLoader: string;
  buildRamGb: number;
  lastPlayedLabel: string;
  badgePreviewText: string;
  resolvePreviewText: (template: string) => string;
  previewCardSize: BuildCardPreviewSize | null;
  draft: BuildCardAppearance;
  onDraftChange: Dispatch<SetStateAction<BuildCardAppearance>>;
  runtimeDraft: BuildRuntimeSettingsDraft;
  onRuntimeDraftChange: Dispatch<SetStateAction<BuildRuntimeSettingsDraft>>;
  onUploadImage: (file: File | null) => void;
  onOpenLogs?: () => void;
  onResetAll: () => void;
  onResetRuntime: () => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function BuildCardSettingsPopup(props: Props) {
  const [activeTab, setActiveTab] = useState<"runtime" | "card" | "mods">("runtime");
  const isRuntimeTab = activeTab === "runtime";
  const isModsTab = activeTab === "mods";

  return (
    <ElementPopup open onClose={props.onClose} className="build-card-settings-dialog">
      <div className="bcs-shell">
        <div className="bce-header bcs-header">
          <div className="bcs-heading">
            <span className="bce-header-title">
              {props.isCreateMode ? "NEW BUILD SETTINGS" : "BUILD SETTINGS"}
            </span>
            <div className="bcs-tabs" role="tablist" aria-label="Build settings sections">
              <button
                type="button"
                role="tab"
                aria-selected={isRuntimeTab}
                className={`bcs-tab ${isRuntimeTab ? "bcs-tab--active" : ""}`}
                onClick={() => setActiveTab("runtime")}
              >
                BUILD
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isModsTab}
                className={`bcs-tab ${isModsTab ? "bcs-tab--active" : ""}`}
                onClick={() => setActiveTab("mods")}
              >
                MODS
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "card"}
                className={`bcs-tab ${activeTab === "card" ? "bcs-tab--active" : ""}`}
                onClick={() => setActiveTab("card")}
              >
                CARD
              </button>
            </div>
          </div>

          <div className="bce-header-actions">
            {!isModsTab && (
              <>
                <button
                  className="bce-hdr-btn"
                  type="button"
                  onClick={isRuntimeTab ? props.onResetRuntime : props.onResetAll}
                >
                  RESET
                </button>
                <button
                  className="bce-hdr-btn bce-hdr-btn--save"
                  type="button"
                  onClick={() => void props.onSave()}
                >
                  SAVE
                </button>
              </>
            )}
            <button
              className="bce-hdr-close"
              type="button"
              onClick={props.onClose}
              aria-label="Close"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 11 11"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="1" y1="1" x2="10" y2="10" />
                <line x1="10" y1="1" x2="1" y2="10" />
              </svg>
            </button>
          </div>
        </div>

        <div className="bcs-tab-panel">
          {isRuntimeTab ? (
            <BuildRuntimeSettingsEditor
              systemRamGb={props.systemRamGb}
              optimizedJavaArgs={props.optimizedJavaArgs}
              draft={props.runtimeDraft}
              resolvePreviewText={props.resolvePreviewText}
              onDraftChange={props.onRuntimeDraftChange}
              onOpenLogs={props.onOpenLogs}
            />
          ) : isModsTab ? (
            <BuildModsEditor instanceId={props.instanceId} loader={props.buildLoader} />
          ) : (
            <BuildCardEditor {...props} showHeader={false} />
          )}
        </div>
      </div>
    </ElementPopup>
  );
}
