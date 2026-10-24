import type {
  AppearanceDropdownSettings,
  AppearanceTextFieldSettings,
  AppearanceProgressBarSettings,
} from "./types";

export const TEXT_FIELD_DEFAULTS: AppearanceTextFieldSettings = {
  label: "",
  placeholder: "",
  hint: "",
  defaultValue: "",
  showLabel: false,
  showPlaceholder: true,
  showHint: true,
  showCounter: false,
  showClear: false,
  showCopy: false,
  showReset: false,
  showPasswordToggle: false,
  selectOnFocus: false,
  trimOnBlur: false,
  maxLength: 0,
  height: 0,
  paddingX: -1,
  fontSize: 0,
  borderRadius: -1,
  textAlign: "inherit",
  rows: 3,
  resize: "inherit",
};

export const DROPDOWN_DEFAULTS: AppearanceDropdownSettings = {
  label: "",
  showLabel: true,
  visibleItems: 5,
  itemHeight: 49,
  searchEnabled: false,
  searchPlaceholder: "",
  emptyText: "",
  showArrow: true,
  showSelectedMark: false,
  highlightMatches: true,
  showResultCount: false,
  showDescriptions: true,
  closeOnSelect: true,
  wrapNavigation: true,
  caseSensitive: false,
  searchMatch: "contains",
  sortMode: "source",
  placement: "auto",
  menuGap: 2,
  menuMinWidth: 0,
  defaultValue: "",
  showDefaultMarker: false,
  showClear: false,
};

export const PROGRESS_BAR_DEFAULTS: AppearanceProgressBarSettings = {
  label: "",
  showLabel: true,
  showValue: true,
  showDetail: true,
  valueFormat: "percent",
  precision: 0,
  variant: "line",
  height: 6,
  borderRadius: -1,
  animated: true,
  animationDuration: 180,
  striped: false,
  stripeWidth: 12,
  segmentCount: 20,
  segmentGap: 2,
  tickMode: "none",
  customTicks: [],
  showTickLabels: true,
  highlightPassedTicks: true,
  defaultValue: 0,
  showDefaultMarker: false,
  fillColor: "",
  trackColor: "",
  markerColor: "",
};

const bounds: Record<string, readonly [number, number]> = {
  visibleItems: [1, 20],
  itemHeight: [24, 96],
  menuGap: [0, 32],
  menuMinWidth: [0, 1000],
  maxLength: [0, 100000],
  height: [0, 240],
  paddingX: [-1, 64],
  fontSize: [0, 48],
  borderRadius: [-1, 120],
  rows: [1, 40],
  precision: [0, 3],
  animationDuration: [0, 3000],
  stripeWidth: [4, 64],
  segmentCount: [2, 100],
  segmentGap: [0, 12],
  defaultValue: [0, 100],
};
const choices: Record<string, readonly string[]> = {
  textAlign: ["inherit", "left", "center", "right"],
  resize: ["inherit", "none", "vertical", "both"],
  searchMatch: ["contains", "starts-with"],
  sortMode: ["source", "ascending", "descending"],
  placement: ["auto", "down", "up"],
  valueFormat: ["percent", "fraction", "value"],
  variant: ["line", "rounded", "segmented"],
  tickMode: ["none", "quarters", "tenths", "custom"],
};

/** Keep imported component settings bounded without turning partial overrides into defaults. */
export function normalizeExtendedComponentValues(
  kind: "textfield" | "dropdown" | "progressbar",
  raw: Record<string, unknown>,
  partial: boolean,
): Record<string, unknown> {
  const defaults =
    kind === "textfield"
      ? TEXT_FIELD_DEFAULTS
      : kind === "dropdown"
        ? DROPDOWN_DEFAULTS
        : PROGRESS_BAR_DEFAULTS;
  const output: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    if (partial && !Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = raw[key];
    if (Array.isArray(fallback)) {
      output[key] = Array.isArray(value)
        ? [
            ...new Set(
              value
                .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
                .map((n) => Math.max(0, Math.min(100, n))),
            ),
          ]
            .sort((a, b) => a - b)
            .slice(0, 64)
        : [];
    } else if (typeof fallback === "boolean") {
      output[key] = typeof value === "boolean" ? value : fallback;
    } else if (typeof fallback === "number") {
      const [min, max] = bounds[key] ?? [0, 10000];
      output[key] =
        typeof value === "number" && Number.isFinite(value)
          ? Math.max(min, Math.min(max, value))
          : fallback;
      if (["visibleItems", "rows", "maxLength", "precision", "segmentCount"].includes(key))
        output[key] = Math.round(output[key] as number);
    } else {
      output[key] =
        typeof value === "string" && (!choices[key] || choices[key].includes(value))
          ? value.slice(0, key === "defaultValue" ? 2000 : 500)
          : fallback;
    }
  }
  return output;
}
