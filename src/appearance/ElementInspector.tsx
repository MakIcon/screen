import { TAB_TITLE } from "../constants/tabs";
import { useAppearanceText } from "./localization";
import { useEffect, useState } from "react";
import { DISPLAY_FONT_OPTIONS, FONT_OPTIONS, customFontStack } from "./profile";
import { ColorField, RangeField, Section, SelectField } from "./StudioFields";
import { ElementBackgroundPicker } from "./ElementBackgroundPicker";
import { ElementTextColorPicker } from "./ElementTextColorPicker";
import { PlaceholderTemplateEditor } from "./PlaceholderTemplateEditor";
import type {
  AppearanceCheckboxSettings,
  AppearanceDropdownSettings,
  AppearanceElementAlignment,
  AppearanceElementComponentOverride,
  AppearanceElementHoverEasing,
  AppearanceElementInteractionState,
  AppearanceElementLayout,
  AppearanceElementOverride,
  AppearanceElementStyle,
  AppearanceElementShadow,
  AppearanceElementTarget,
  AppearanceElementTextAlign,
  AppearanceProfile,
  AppearanceSliderSettings,
  AppearanceToggleSettings,
} from "./types";
import { getElementStateStyle } from "./elementState";

const TEXT_ALIGNMENTS: readonly { id: AppearanceElementTextAlign; label: string }[] = [
  { id: "left", label: "LEFT" },
  { id: "center", label: "CENTER" },
  { id: "right", label: "RIGHT" },
];

const SHADOWS: readonly { id: AppearanceElementShadow; label: string }[] = [
  { id: "none", label: "NONE" },
  { id: "soft", label: "SOFT" },
  { id: "strong", label: "STRONG" },
  { id: "glow", label: "ACCENT GLOW" },
];

const LAYOUTS: readonly { id: AppearanceElementLayout; label: string }[] = [
  { id: "default", label: "KEEP COMPONENT DEFAULT" },
  { id: "row", label: "FLEX ROW" },
  { id: "column", label: "FLEX COLUMN" },
  { id: "grid", label: "GRID" },
];

const ALIGNMENTS: readonly { id: AppearanceElementAlignment; label: string }[] = [
  { id: "auto", label: "AUTO / PARENT DEFAULT" },
  { id: "start", label: "START" },
  { id: "center", label: "CENTER" },
  { id: "end", label: "END" },
  { id: "stretch", label: "STRETCH" },
];

const HOVER_EASINGS: readonly { id: AppearanceElementHoverEasing; label: string }[] = [
  { id: "linear", label: "LINEAR" },
  { id: "ease", label: "EASE" },
  { id: "ease-in", label: "EASE IN" },
  { id: "ease-out", label: "EASE OUT" },
  { id: "ease-in-out", label: "EASE IN / OUT" },
];

const TEXT_DECORATIONS = [
  { id: "none", label: "NONE" },
  { id: "underline", label: "UNDERLINE" },
  { id: "overline", label: "OVERLINE" },
  { id: "line-through", label: "LINE THROUGH" },
] as const;

const TEXT_DECORATION_STYLES = [
  { id: "solid", label: "SOLID" },
  { id: "double", label: "DOUBLE" },
  { id: "dotted", label: "DOTTED" },
  { id: "dashed", label: "DASHED" },
  { id: "wavy", label: "WAVY" },
] as const;

const TEXT_TRANSFORMS = [
  { id: "none", label: "KEEP ORIGINAL" },
  { id: "uppercase", label: "UPPERCASE" },
  { id: "lowercase", label: "LOWERCASE" },
  { id: "capitalize", label: "CAPITALIZE" },
] as const;

const ENTRANCE_ANIMATIONS = [
  { id: "none", label: "NONE" },
  { id: "fade", label: "FADE" },
  { id: "rise", label: "RISE" },
  { id: "slide-left", label: "SLIDE FROM LEFT" },
  { id: "slide-right", label: "SLIDE FROM RIGHT" },
  { id: "zoom", label: "ZOOM" },
  { id: "blur", label: "BLUR IN" },
  { id: "custom", label: "CUSTOM KEYFRAME" },
] as const;

const TEXT_PRESETS: readonly {
  id: string;
  label: string;
  note: string;
  style: Partial<AppearanceElementStyle>;
}[] = [
  {
    id: "ice",
    label: "ICE",
    note: "FROSTED BLUE",
    style: {
      textKind: "gradient",
      textGradientType: "linear",
      textGradientAngle: 135,
      textGradientStops: [
        { color: "#ffffff", position: 0 },
        { color: "#9ee8ff", position: 42 },
        { color: "#4d8dff", position: 100 },
      ],
      textGradientStart: "#ffffff",
      textGradientEnd: "#4d8dff",
      textShadowColor: "#69d5ff",
      textShadowX: 0,
      textShadowY: 2,
      textShadowBlur: 14,
      textStrokeColor: "#dff8ff",
      textStrokeWidth: 0.25,
    },
  },
  {
    id: "gold",
    label: "GOLD",
    note: "POLISHED METAL",
    style: {
      textKind: "gradient",
      textGradientType: "linear",
      textGradientAngle: 110,
      textGradientStops: [
        { color: "#7a4300", position: 0 },
        { color: "#ffe990", position: 34 },
        { color: "#c98a16", position: 64 },
        { color: "#fff3a6", position: 100 },
      ],
      textGradientStart: "#7a4300",
      textGradientEnd: "#fff3a6",
      textShadowColor: "#3b2100",
      textShadowX: 0,
      textShadowY: 3,
      textShadowBlur: 5,
      textStrokeColor: "#6b3e00",
      textStrokeWidth: 0.35,
    },
  },
  {
    id: "glass",
    label: "GLASS",
    note: "CLEAR HIGHLIGHT",
    style: {
      textKind: "gradient",
      textGradientType: "linear",
      textGradientAngle: 180,
      textGradientStops: [
        { color: "#ffffff", position: 0 },
        { color: "#c8e7f2", position: 48 },
        { color: "#ffffff", position: 100 },
      ],
      textGradientStart: "#ffffff",
      textGradientEnd: "#ffffff",
      textShadowColor: "#7ac7e6",
      textShadowX: 0,
      textShadowY: 1,
      textShadowBlur: 9,
      textStrokeColor: "#ffffff",
      textStrokeWidth: 0.4,
    },
  },
  {
    id: "liquid-glass",
    label: "LIQUID GLASS",
    note: "REFRACTIVE",
    style: {
      textKind: "gradient",
      textGradientType: "linear",
      textGradientAngle: 120,
      textGradientStops: [
        { color: "#ffffff", position: 0 },
        { color: "#8ee6ff", position: 28 },
        { color: "#d5b8ff", position: 55 },
        { color: "#ffffff", position: 100 },
      ],
      textGradientStart: "#ffffff",
      textGradientEnd: "#ffffff",
      textGradientAnimation: "flow",
      textGradientAnimationDuration: 5_000,
      textGradientAnimationDirection: "alternate",
      textShadowColor: "#93dcff",
      textShadowX: 0,
      textShadowY: 2,
      textShadowBlur: 12,
      textStrokeColor: "#ffffff",
      textStrokeWidth: 0.3,
      glassEffect: true,
      liquidGlass: true,
      liquidGlassBlur: 0.28,
      liquidGlassRefraction: 0.72,
      liquidGlassChromaticAberration: 0.06,
      liquidGlassEdgeHighlight: 0.2,
      liquidGlassSpecular: 0.25,
    },
  },
];

const RESET_ELEMENT_MATERIAL: Partial<AppearanceElementStyle> = {
  backgroundOpacity: 1,
  backgroundGradientAnimation: "none",
  backgroundGradientAnimationDuration: undefined,
  backgroundGradientAnimationDirection: undefined,
  borderWidth: 0,
  shadow: "none",
  shadowColor: undefined,
  shadowX: undefined,
  shadowY: undefined,
  shadowBlur: undefined,
  shadowSpread: undefined,
  glowColor: undefined,
  glowBlur: undefined,
  glowIntensity: 0,
  backdropBlur: undefined,
  grainOpacity: 0,
  glassEffect: false,
  glassTint: undefined,
  glassOpacity: undefined,
  glassSaturation: undefined,
  liquidGlass: false,
  liquidGlassBlur: undefined,
  liquidGlassRefraction: undefined,
  liquidGlassChromaticAberration: undefined,
  liquidGlassEdgeHighlight: undefined,
  liquidGlassSpecular: undefined,
};

const ELEMENT_MATERIAL_PRESETS: readonly {
  id: NonNullable<AppearanceElementStyle["materialPreset"]>;
  label: string;
  note: string;
  style: Partial<AppearanceElementStyle>;
}[] = [
  {
    id: "ice",
    label: "ICE",
    note: "FROSTED SURFACE",
    style: {
      ...RESET_ELEMENT_MATERIAL,
      materialPreset: "ice",
      backgroundKind: "gradient",
      backgroundGradientType: "linear",
      backgroundGradientAngle: 135,
      backgroundGradientStart: "#102a46",
      backgroundGradientEnd: "#dff9ff",
      backgroundGradientStops: [
        { color: "#102a46", position: 0 },
        { color: "#59c9f2", position: 48 },
        { color: "#dff9ff", position: 100 },
      ],
      backgroundGradientAnimation: "pulse",
      backgroundGradientAnimationDuration: 6_500,
      backgroundGradientAnimationDirection: "alternate",
      borderColor: "#b9f4ff",
      borderWidth: 1.5,
      textKind: "solid",
      textColor: "#f4fdff",
      shadow: "soft",
      glowColor: "#55d7ff",
      glowBlur: 28,
      glowIntensity: 0.45,
      grainOpacity: 0.05,
    },
  },
  {
    id: "gold",
    label: "GOLD",
    note: "POLISHED METAL",
    style: {
      ...RESET_ELEMENT_MATERIAL,
      materialPreset: "gold",
      backgroundKind: "gradient",
      backgroundGradientType: "linear",
      backgroundGradientAngle: 120,
      backgroundGradientStart: "#3b1d00",
      backgroundGradientEnd: "#ffe89a",
      backgroundGradientStops: [
        { color: "#3b1d00", position: 0 },
        { color: "#a8670b", position: 28 },
        { color: "#ffe89a", position: 52 },
        { color: "#bf7c12", position: 74 },
        { color: "#fff0af", position: 100 },
      ],
      backgroundGradientAnimation: "flow",
      backgroundGradientAnimationDuration: 8_000,
      backgroundGradientAnimationDirection: "alternate",
      borderColor: "#ffe28a",
      borderWidth: 1.5,
      textKind: "solid",
      textColor: "#fff6cf",
      shadow: "strong",
      glowColor: "#f6b93b",
      glowBlur: 22,
      glowIntensity: 0.3,
      grainOpacity: 0.08,
    },
  },
  {
    id: "glass",
    label: "GLASS",
    note: "CLEAR & FROSTED",
    style: {
      ...RESET_ELEMENT_MATERIAL,
      materialPreset: "glass",
      backgroundKind: "gradient",
      backgroundGradientType: "linear",
      backgroundGradientAngle: 145,
      backgroundGradientStart: "#dff8ff",
      backgroundGradientEnd: "#7895a8",
      backgroundGradientStops: [
        { color: "#ffffff", position: 0 },
        { color: "#b9e9f7", position: 42 },
        { color: "#7895a8", position: 100 },
      ],
      backgroundOpacity: 0.24,
      borderColor: "#ffffff",
      borderWidth: 1,
      textKind: "solid",
      textColor: "#f8fdff",
      shadow: "soft",
      glassEffect: true,
      glassTint: "#dff8ff",
      glassOpacity: 0.14,
      glassSaturation: 1.45,
      backdropBlur: 22,
    },
  },
  {
    id: "liquid-glass",
    label: "LIQUID GLASS",
    note: "LIVE REFRACTION",
    style: {
      ...RESET_ELEMENT_MATERIAL,
      materialPreset: "liquid-glass",
      backgroundKind: "gradient",
      backgroundGradientType: "linear",
      backgroundGradientAngle: 120,
      backgroundGradientStart: "#ffffff",
      backgroundGradientEnd: "#88dfff",
      backgroundGradientStops: [
        { color: "#ffffff", position: 0 },
        { color: "#9be9ff", position: 35 },
        { color: "#ccb9ff", position: 65 },
        { color: "#ffffff", position: 100 },
      ],
      backgroundOpacity: 0.18,
      backgroundGradientAnimation: "flow",
      backgroundGradientAnimationDuration: 5_500,
      backgroundGradientAnimationDirection: "alternate",
      borderColor: "#ffffff",
      borderWidth: 1,
      textKind: "solid",
      textColor: "#ffffff",
      glowColor: "#7bdcff",
      glowBlur: 24,
      glowIntensity: 0.22,
      glassEffect: true,
      glassTint: "#dff8ff",
      glassOpacity: 0.1,
      glassSaturation: 1.5,
      backdropBlur: 18,
      liquidGlass: true,
      liquidGlassBlur: 0.28,
      liquidGlassRefraction: 0.72,
      liquidGlassChromaticAberration: 0.06,
      liquidGlassEdgeHighlight: 0.2,
      liquidGlassSpecular: 0.25,
    },
  },
];

const BOOLEAN_OPTIONS = [
  { id: "on", label: "ON" },
  { id: "off", label: "OFF" },
] as const;

const TICK_MODES: readonly { id: AppearanceSliderSettings["tickMode"]; label: string }[] = [
  { id: "none", label: "NO TICK LABELS" },
  { id: "every", label: "EVERY VALUE" },
  { id: "every-2", label: "EVERY 2" },
  { id: "every-3", label: "EVERY 3" },
  { id: "every-4", label: "EVERY 4" },
  { id: "even", label: "EVEN VALUES" },
  { id: "odd", label: "ODD VALUES" },
  { id: "custom", label: "CUSTOM LIST" },
];

function normalizeBoxDefault(value: number | undefined, max: number) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

function NumberListField({
  value,
  min,
  max,
  activeMin,
  activeMax,
  onChange,
}: {
  value: number[];
  min: number;
  max: number;
  activeMin: number;
  activeMax: number;
  onChange: (value: number[]) => void;
}) {
  const copy = useAppearanceText();
  const serialized = value.join(", ");
  const [draft, setDraft] = useState(serialized);

  useEffect(() => setDraft(serialized), [serialized]);

  const commit = () => {
    const parsed = draft
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(Number)
      .filter((tick) => Number.isFinite(tick) && tick >= min && tick <= max);
    const unique = [...new Set(parsed)].sort((left, right) => left - right).slice(0, 64);
    setDraft(unique.join(", "));
    onChange(unique);
  };

  return (
    <label className="studio-text-field studio-text-field--single-line">
      <span>{copy("CUSTOM TICK VALUES")}</span>
      <input
        value={draft}
        spellCheck={false}
        placeholder={`${min}, ${Math.round((min + max) / 2)}, ${max}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <small>
        {copy("ALLOWED:")} {min} {copy("TO")} {max} {copy("· VALUES OUTSIDE")} {activeMin}–
        {activeMax} {copy("STAY SAVED")}
      </small>
    </label>
  );
}

type ElementInspectorProps = {
  target: AppearanceElementTarget | null;
  override?: AppearanceElementOverride;
  visualStyle?: AppearanceElementOverride["style"];
  interactionState: AppearanceElementInteractionState;
  stateTransitionMs: number;
  stateEasing: AppearanceElementHoverEasing;
  profile: AppearanceProfile;
  onPick: () => void;
  onStyleChange: (style: Partial<AppearanceElementOverride["style"]>) => void;
  onTextChange: (text: string | undefined) => void;
  onComponentChange: (settings: AppearanceElementComponentOverride) => void;
  onStateTransitionChange: (patch: {
    stateTransitionMs?: number;
    stateEasing?: AppearanceElementHoverEasing;
  }) => void;
};

export function ElementInspector({
  target,
  override,
  visualStyle,
  interactionState,
  stateTransitionMs,
  stateEasing,
  profile,
  onPick,
  onStyleChange,
  onTextChange,
  onComponentChange,
  onStateTransitionChange,
}: ElementInspectorProps) {
  const copy = useAppearanceText();
  if (!target) {
    return (
      <div className="appearance-element-empty">
        <span>{copy("09 / ELEMENT INSPECTOR")}</span>
        <strong>{copy("PICK ANY OBJECT IN THE LAUNCHER")}</strong>
        <p>
          {copy(
            "Select a button, title, card or control. Its text and visual settings will appear here and update live in the main window.",
          )}
        </p>
        <button type="button" onClick={onPick}>
          {copy("START ELEMENT PICKER →")}
        </button>
      </div>
    );
  }

  const style = visualStyle;
  const activeInteractionStyle = getElementStateStyle(override, interactionState);
  const inheritedElementOpacity =
    interactionState === "hover"
      ? (target.defaults?.hoverElementOpacity ?? target.defaults?.elementOpacity ?? 1)
      : (target.defaults?.elementOpacity ?? 1);
  const effectiveElementOpacity =
    style?.elementOpacity ?? style?.opacity ?? inheritedElementOpacity;
  const elementOpacitySource =
    activeInteractionStyle?.elementOpacity !== undefined ||
    activeInteractionStyle?.opacity !== undefined
      ? ""
      : interactionState !== "normal" &&
          (override?.style.elementOpacity !== undefined || override?.style.opacity !== undefined)
        ? " · FROM NORMAL"
        : " · LAUNCHER DEFAULT";
  const renderedOriginalText = target.textTarget?.original;
  const originalText = target.textTarget?.template ?? renderedOriginalText;
  const hasTextOverride = override && Object.prototype.hasOwnProperty.call(override, "text");
  const displayedText = hasTextOverride ? (override.text ?? "") : (originalText ?? "");
  const customFonts = profile.typography.customFonts.map((font) => ({
    id: font.id,
    label: font.name.toUpperCase(),
    value: customFontStack(font),
  }));
  const fonts = [...FONT_OPTIONS, ...DISPLAY_FONT_OPTIONS, ...customFonts].filter(
    (font, index, options) =>
      options.findIndex((candidate) => candidate.value === font.value) === index,
  );
  const selectedFont = style?.fontFamily ?? profile.typography.uiFont;
  const fontOptions = fonts.map((font) => ({ id: font.value, label: font.label }));
  const component = target.component;
  const componentOverride = override?.componentSettings;
  const sliderDefaults = component?.kind === "slider" ? component.props : null;
  const toggleDefaults = component?.kind === "toggle" ? component.props : null;
  const checkboxDefaults = component?.kind === "checkbox" ? component.props : null;
  const dropdownDefaults = component?.kind === "dropdown" ? component.props : null;
  const sliderSettings =
    component?.kind === "slider"
      ? {
          ...component.props,
          ...(componentOverride?.kind === "slider" ? componentOverride.settings : {}),
        }
      : null;
  const toggleSettings =
    component?.kind === "toggle"
      ? {
          ...component.props,
          ...(componentOverride?.kind === "toggle" ? componentOverride.settings : {}),
        }
      : null;
  const checkboxSettings =
    component?.kind === "checkbox"
      ? {
          ...component.props,
          ...(componentOverride?.kind === "checkbox" ? componentOverride.settings : {}),
        }
      : null;
  const dropdownSettings =
    component?.kind === "dropdown"
      ? {
          ...component.props,
          ...(componentOverride?.kind === "dropdown" ? componentOverride.settings : {}),
        }
      : null;

  const patchSlider = (settings: Partial<AppearanceSliderSettings>) => {
    if (!sliderSettings) return;
    const merged = { ...sliderSettings, ...settings };
    if (merged.constraint === "system-ram") {
      merged.min = Math.round(merged.min);
      merged.max = Math.round(merged.max);
      merged.step = Math.max(1, Math.round(merged.step));
      merged.defaultValue = Math.round(merged.defaultValue);
    }
    const hardMin = merged.constraint === "system-ram" ? 1 : -10_000;
    const hardMax = merged.constraint === "system-ram" ? Math.max(1, merged.systemMax) : 10_001;
    if (merged.constraint === "system-ram") {
      merged.step = Math.min(hardMax, merged.step);
    }
    merged.customTicks = [
      ...new Set(
        merged.customTicks
          .filter((tick) => Number.isFinite(tick))
          .map((tick) => (merged.constraint === "system-ram" ? Math.round(tick) : tick))
          .map((tick) => Math.max(hardMin, Math.min(hardMax, tick))),
      ),
    ];
    merged.max = Math.max(hardMin, Math.min(hardMax, merged.max));
    merged.min = Math.max(hardMin, Math.min(hardMax, merged.min));
    if (hardMax > hardMin && merged.max <= merged.min) {
      const separation = Math.min(hardMax - hardMin, Math.max(merged.step, 0.01));
      if (settings.min !== undefined) {
        merged.min = Math.min(merged.min, hardMax - separation);
        merged.max = Math.max(merged.max, merged.min + separation);
      } else {
        merged.max = Math.max(merged.max, hardMin + separation);
        merged.min = Math.min(merged.min, merged.max - separation);
      }
    }
    const activeMax =
      merged.constraint === "system-ram" && merged.maxMode === "system" ? hardMax : merged.max;
    merged.defaultValue = Math.min(activeMax, Math.max(merged.min, merged.defaultValue));
    onComponentChange({ kind: "slider", settings: merged });
  };
  const patchToggle = (settings: Partial<AppearanceToggleSettings>) => {
    if (toggleSettings)
      onComponentChange({ kind: "toggle", settings: { ...toggleSettings, ...settings } });
  };
  const patchCheckbox = (settings: Partial<AppearanceCheckboxSettings>) => {
    if (checkboxSettings) {
      onComponentChange({ kind: "checkbox", settings: { ...checkboxSettings, ...settings } });
    }
  };
  const patchDropdown = (settings: Partial<AppearanceDropdownSettings>) => {
    if (dropdownSettings) {
      onComponentChange({ kind: "dropdown", settings: { ...dropdownSettings, ...settings } });
    }
  };
  const sliderHardMax =
    sliderSettings?.constraint === "system-ram" ? sliderSettings.systemMax : 10_001;
  const sliderHardMin = sliderSettings?.constraint === "system-ram" ? 1 : -1_000;
  const sliderFieldStep = sliderSettings?.constraint === "system-ram" ? 1 : 0.5;
  const sliderActiveMax = sliderSettings
    ? sliderSettings.constraint === "system-ram" && sliderSettings.maxMode === "system"
      ? sliderHardMax
      : Math.min(sliderHardMax, sliderSettings.max)
    : 100;
  const sliderMaximumFloor = sliderSettings
    ? Math.min(sliderHardMax, sliderSettings.min + Math.max(0.01, sliderSettings.step))
    : -999;
  const isComponentTarget = component !== undefined;
  const supportsVisibleText = originalText !== undefined;
  const supportsTypography =
    !isComponentTarget &&
    (supportsVisibleText || target.kind === "input" || target.kind === "select");
  const supportsSurface = !isComponentTarget;
  const supportsSpacing = !isComponentTarget && target.kind !== "text";
  const defaultWidth = normalizeBoxDefault(target.defaults?.width, 1_200);
  const defaultHeight = normalizeBoxDefault(target.defaults?.height, 800);
  const defaultMinWidth = normalizeBoxDefault(target.defaults?.minWidth, 1_200);
  const defaultMinHeight = normalizeBoxDefault(target.defaults?.minHeight, 800);
  const widthAuto = target.defaults?.widthAuto ?? style?.width === 0;
  const heightAuto = target.defaults?.heightAuto ?? style?.height === 0;
  const minWidthAuto = target.defaults?.minWidthAuto === true;
  const minHeightAuto = target.defaults?.minHeightAuto === true;
  const initialWidth = widthAuto ? 0 : defaultWidth;
  const initialHeight = heightAuto ? 0 : defaultHeight;
  const initialMinWidth = minWidthAuto ? 0 : defaultMinWidth;
  const initialMinHeight = minHeightAuto ? 0 : defaultMinHeight;

  return (
    <div className="appearance-element-inspector">
      <div className="appearance-element-summary">
        <span>
          {target.tab ? TAB_TITLE[target.tab] : copy("ALL TABS")} ·{" "}
          {copy(target.kind === "input" ? "FIELD" : (target.kind ?? "element").toUpperCase())} ·{" "}
          {copy(interactionState.toUpperCase())}
        </span>
        <strong>{target.label}</strong>
        <small>{target.id}</small>
      </div>

      {interactionState !== "normal" && (
        <Section
          title={copy("{state} transition", { state: copy(interactionState.toUpperCase()) })}
          note={copy(
            "The launcher pins this state on the selected element while you edit it. Zero milliseconds makes the change instant.",
          )}
        >
          <RangeField
            label={copy("DURATION")}
            value={stateTransitionMs}
            min={0}
            max={2_000}
            step={25}
            suffix=" MS"
            defaultValue={200}
            onChange={(stateTransitionMs) => onStateTransitionChange({ stateTransitionMs })}
          />
          <SelectField
            label={copy("EASING")}
            value={stateEasing}
            options={HOVER_EASINGS}
            onChange={(stateEasing) => onStateTransitionChange({ stateEasing })}
          />
        </Section>
      )}

      {interactionState === "normal" && supportsVisibleText && (
        <Section
          title={copy("VISIBLE TEXT")}
          note={copy(
            "Changes the primary visible label without replacing the button or breaking its click behavior.",
          )}
        >
          <>
            <div className="studio-text-field">
              <span>
                {target.textTarget?.template
                  ? copy("TEXT / PLACEHOLDER TEMPLATE")
                  : copy("ELEMENT LABEL")}
              </span>
              <PlaceholderTemplateEditor
                value={displayedText}
                maxLength={160}
                originalText={originalText ?? ""}
                renderedOriginalText={renderedOriginalText ?? ""}
                placeholderValues={target.textTarget?.placeholderValues}
                onChange={onTextChange}
              />
            </div>
            <button
              type="button"
              className="studio-inline-action"
              disabled={!hasTextOverride}
              onClick={() => onTextChange(undefined)}
            >
              {copy("RESTORE ORIGINAL TEXT")}
            </button>
          </>
        </Section>
      )}

      {interactionState === "normal" && (
        <Section
          title={copy("ELEMENT MATERIALS")}
          note={copy(
            "One-click materials style the entire picked element, including its surface, border, text and effects.",
          )}
        >
          <div className="studio-material-preset-grid">
            {ELEMENT_MATERIAL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-preset={preset.id}
                className={style?.materialPreset === preset.id ? "active" : ""}
                onClick={() => onStyleChange(preset.style)}
              >
                <i aria-hidden="true" />
                <strong>{copy(preset.label)}</strong>
                <small>{copy(preset.note)}</small>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section
        title={copy("SIZE & BOX")}
        note={copy(
          "AUTO is detected separately for every axis. Fixed-size controls start at their measured pixels; flexible controls start at 0 AUTO.",
        )}
      >
        <RangeField
          label={copy("WIDTH")}
          value={style?.width ?? initialWidth}
          min={0}
          max={1_200}
          defaultValue={defaultWidth}
          suffix=" PX"
          zeroSuffix={widthAuto ? copy(" AUTO") : undefined}
          onChange={(width) =>
            onStyleChange({
              width: interactionState === "normal" && width === initialWidth ? undefined : width,
            })
          }
        />
        <RangeField
          label={copy("HEIGHT")}
          value={style?.height ?? initialHeight}
          min={0}
          max={800}
          defaultValue={defaultHeight}
          suffix=" PX"
          zeroSuffix={heightAuto ? copy(" AUTO") : undefined}
          onChange={(height) =>
            onStyleChange({
              height:
                interactionState === "normal" && height === initialHeight ? undefined : height,
            })
          }
        />
        <RangeField
          label={copy("MIN WIDTH")}
          value={style?.minWidth ?? initialMinWidth}
          min={0}
          max={1_200}
          defaultValue={defaultMinWidth}
          suffix=" PX"
          zeroSuffix={minWidthAuto ? copy(" AUTO") : undefined}
          onChange={(minWidth) =>
            onStyleChange({
              minWidth:
                interactionState === "normal" && minWidth === initialMinWidth
                  ? undefined
                  : minWidth,
            })
          }
        />
        <RangeField
          label={copy("MIN HEIGHT")}
          value={style?.minHeight ?? initialMinHeight}
          min={0}
          max={800}
          defaultValue={defaultMinHeight}
          suffix=" PX"
          zeroSuffix={minHeightAuto ? copy(" AUTO") : undefined}
          onChange={(minHeight) =>
            onStyleChange({
              minHeight:
                interactionState === "normal" && minHeight === initialMinHeight
                  ? undefined
                  : minHeight,
            })
          }
        />
      </Section>

      {interactionState === "normal" && sliderSettings && (
        <Section
          title={copy("SLIDER PROPS")}
          note={copy(
            "These are live component props: the selected ElementSlider is rebuilt with the new range, step, header and ticks.",
          )}
        >
          <label className="studio-text-field studio-text-field--single-line">
            <span>{copy("HEADER LABEL")}</span>
            <input
              value={sliderSettings.label}
              maxLength={80}
              spellCheck={false}
              onChange={(event) => patchSlider({ label: event.target.value })}
            />
          </label>
          <RangeField
            label={copy("MIN")}
            value={sliderSettings.min}
            min={sliderHardMin}
            max={Math.max(-999, sliderActiveMax - 0.01)}
            step={sliderFieldStep}
            defaultValue={sliderDefaults?.min}
            onChange={(min) => patchSlider({ min })}
          />
          {sliderSettings.constraint === "system-ram" && (
            <>
              <div className="studio-segmented studio-segmented--component-limit">
                <button
                  type="button"
                  className={sliderSettings.maxMode === "system" ? "active" : ""}
                  onClick={() => patchSlider({ maxMode: "system" })}
                >
                  {copy("USE REAL RAM ·")} {sliderSettings.systemMax} {copy("GB")}
                </button>
                <button
                  type="button"
                  className={sliderSettings.maxMode === "custom" ? "active" : ""}
                  onClick={() => patchSlider({ maxMode: "custom" })}
                >
                  {copy("MANUAL MAX ≤")} {sliderSettings.systemMax} {copy("GB")}
                </button>
              </div>
              <div className="studio-unavailable-note">
                {copy(
                  "This is the launcher RAM slider. Its hard ceiling is the detected system memory, so an appearance profile can never set it above",
                )}{" "}
                {sliderSettings.systemMax} {copy("GB.")}
              </div>
            </>
          )}
          <RangeField
            label={sliderSettings.maxMode === "system" ? copy("MAX · SYSTEM RAM") : copy("MAX")}
            value={sliderActiveMax}
            min={sliderMaximumFloor}
            max={sliderHardMax}
            step={sliderFieldStep}
            defaultValue={sliderDefaults?.max}
            disabled={
              sliderSettings.constraint === "system-ram" && sliderSettings.maxMode === "system"
            }
            onChange={(max) => patchSlider({ max })}
          />
          <RangeField
            label={
              sliderSettings.constraint === "system-ram" ? copy("STEP · WHOLE GB") : copy("STEP")
            }
            value={sliderSettings.step}
            min={sliderSettings.constraint === "system-ram" ? 1 : 0.01}
            max={sliderSettings.constraint === "system-ram" ? sliderHardMax : 100}
            step={sliderSettings.constraint === "system-ram" ? 1 : 0.01}
            defaultValue={sliderDefaults?.step}
            onChange={(step) => patchSlider({ step })}
          />
          <RangeField
            label={copy("DEFAULT VALUE")}
            value={sliderSettings.defaultValue}
            min={sliderSettings.min}
            max={sliderActiveMax}
            step={sliderSettings.constraint === "system-ram" ? 1 : sliderSettings.step}
            defaultValue={sliderDefaults?.defaultValue}
            onChange={(defaultValue) => patchSlider({ defaultValue })}
          />
          <SelectField
            label={copy("SHOW HEADER LABEL")}
            value={sliderSettings.showHeader ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchSlider({ showHeader: value === "on" })}
          />
          <SelectField
            label={copy("SHOW VALUE")}
            value={sliderSettings.showValue ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchSlider({ showValue: value === "on" })}
          />
          <SelectField
            label={copy("EDIT VALUE BY KEYBOARD")}
            value={sliderSettings.valueEditable ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchSlider({ valueEditable: value === "on" })}
          />
          <SelectField
            label={copy("ARROW KEY CONTROL")}
            value={sliderSettings.keyboardEnabled ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchSlider({ keyboardEnabled: value === "on" })}
          />
          <SelectField
            label={copy("DEFAULT VALUE MARKER")}
            value={sliderSettings.showDefaultMarker ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchSlider({ showDefaultMarker: value === "on" })}
          />
          {sliderSettings.showDefaultMarker && (
            <SelectField
              label={copy("SNAP TO DEFAULT MARKER")}
              value={sliderSettings.defaultMarkerMagnetic ? "on" : "off"}
              options={BOOLEAN_OPTIONS}
              onChange={(value) => patchSlider({ defaultMarkerMagnetic: value === "on" })}
            />
          )}
          <SelectField
            label={copy("TICK LABEL MODE")}
            value={sliderSettings.tickMode}
            options={TICK_MODES}
            onChange={(tickMode) => patchSlider({ tickMode })}
          />
          {sliderSettings.tickMode === "custom" && (
            <NumberListField
              value={sliderSettings.customTicks}
              min={sliderSettings.constraint === "system-ram" ? 1 : -10_000}
              max={sliderHardMax}
              activeMin={sliderSettings.min}
              activeMax={sliderActiveMax}
              onChange={(customTicks) => patchSlider({ customTicks })}
            />
          )}
          <div className="studio-unavailable-note">
            {copy(
              "DEFAULT VALUE affects uncontrolled sliders. Controlled sliders such as launcher RAM keep their real saved value, while MIN, MAX, STEP and TICKS still apply live.",
            )}
          </div>
        </Section>
      )}

      {interactionState === "normal" && toggleSettings && (
        <Section
          title={copy("TOGGLE PROPS")}
          note={copy("Controls the selected ElementToggle structure and switch size.")}
        >
          <label className="studio-text-field studio-text-field--single-line">
            <span>{copy("TITLE")}</span>
            <input
              value={toggleSettings.title}
              maxLength={120}
              spellCheck={false}
              onChange={(event) => patchToggle({ title: event.target.value })}
            />
          </label>
          <label className="studio-text-field">
            <span>{copy("NOTE")}</span>
            <textarea
              value={toggleSettings.note}
              maxLength={240}
              rows={2}
              spellCheck={false}
              onChange={(event) => patchToggle({ note: event.target.value })}
            />
          </label>
          <SelectField
            label={copy("SHOW NOTE")}
            value={toggleSettings.showNote ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchToggle({ showNote: value === "on" })}
          />
          <SelectField
            label={copy("COMPACT MODE")}
            value={toggleSettings.compact ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchToggle({ compact: value === "on" })}
          />
          <RangeField
            label={copy("SWITCH SCALE")}
            value={toggleSettings.switchScale}
            min={0.65}
            max={1.6}
            step={0.05}
            defaultValue={toggleDefaults?.switchScale}
            onChange={(switchScale) => patchToggle({ switchScale })}
          />
        </Section>
      )}

      {interactionState === "normal" && checkboxSettings && (
        <Section
          title={copy("CHECKBOX PROPS")}
          note={copy("Fine-tune the indicator independently from its label.")}
        >
          <label className="studio-text-field studio-text-field--single-line">
            <span>{copy("LABEL")}</span>
            <input
              value={checkboxSettings.label}
              maxLength={120}
              spellCheck={false}
              onChange={(event) => patchCheckbox({ label: event.target.value })}
            />
          </label>
          <RangeField
            label={copy("INDICATOR SIZE")}
            value={checkboxSettings.indicatorSize}
            min={10}
            max={36}
            suffix=" PX"
            defaultValue={checkboxDefaults?.indicatorSize}
            onChange={(indicatorSize) => patchCheckbox({ indicatorSize })}
          />
          <RangeField
            label={copy("LABEL GAP")}
            value={checkboxSettings.labelGap}
            min={0}
            max={40}
            suffix=" PX"
            defaultValue={checkboxDefaults?.labelGap}
            onChange={(labelGap) => patchCheckbox({ labelGap })}
          />
        </Section>
      )}

      {interactionState === "normal" && dropdownSettings && (
        <Section
          title={copy("DROPDOWN PROPS")}
          note={copy("Changes the selected InlineDropdown and its option list.")}
        >
          <label className="studio-text-field studio-text-field--single-line">
            <span>{copy("LABEL")}</span>
            <input
              value={dropdownSettings.label}
              maxLength={120}
              spellCheck={false}
              onChange={(event) => patchDropdown({ label: event.target.value })}
            />
          </label>
          <SelectField
            label={copy("SHOW LABEL")}
            value={dropdownSettings.showLabel ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchDropdown({ showLabel: value === "on" })}
          />
          <RangeField
            label={copy("VISIBLE ITEMS")}
            value={dropdownSettings.visibleItems}
            min={1}
            max={12}
            defaultValue={dropdownDefaults?.visibleItems}
            onChange={(visibleItems) => patchDropdown({ visibleItems })}
          />
          <RangeField
            label={copy("ITEM HEIGHT")}
            value={dropdownSettings.itemHeight}
            min={28}
            max={96}
            suffix=" PX"
            defaultValue={dropdownDefaults?.itemHeight}
            onChange={(itemHeight) => patchDropdown({ itemHeight })}
          />
        </Section>
      )}

      {supportsTypography && (
        <>
          <Section
            title={copy("TEXT PRESETS")}
            note={copy("Apply a complete material treatment in one click.")}
          >
            <div className="studio-text-preset-grid">
              {TEXT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-preset={preset.id}
                  onClick={() => onStyleChange(preset.style)}
                >
                  <strong>{copy(preset.label)}</strong>
                  <small>{copy(preset.note)}</small>
                </button>
              ))}
            </div>
          </Section>
          <Section
            title={copy("TYPOGRAPHY")}
            note={copy("Fine controls apply only to this selected object.")}
          >
            <SelectField
              label={copy("FONT FAMILY")}
              value={selectedFont}
              options={fontOptions}
              translateOptions={false}
              onChange={(fontFamily) => onStyleChange({ fontFamily })}
            />
            <SelectField
              label={copy("TEXT ALIGN")}
              value={style?.textAlign ?? "center"}
              options={TEXT_ALIGNMENTS}
              onChange={(textAlign) => onStyleChange({ textAlign })}
            />
            <RangeField
              label={copy("FONT SIZE")}
              value={style?.fontSize ?? 14}
              min={6}
              max={96}
              suffix=" PX"
              onChange={(fontSize) => onStyleChange({ fontSize })}
            />
            <RangeField
              label={copy("FONT WEIGHT")}
              value={style?.fontWeight ?? 700}
              min={100}
              max={900}
              step={100}
              onChange={(fontWeight) => onStyleChange({ fontWeight })}
            />
            <RangeField
              label={copy("LETTER SPACING")}
              value={style?.letterSpacing ?? 0}
              min={-2}
              max={10}
              step={0.25}
              suffix=" PX"
              onChange={(letterSpacing) => onStyleChange({ letterSpacing })}
            />
            <RangeField
              label={copy("LINE HEIGHT")}
              value={style?.lineHeight ?? 1.2}
              min={0.7}
              max={2.5}
              step={0.05}
              onChange={(lineHeight) => onStyleChange({ lineHeight })}
            />
          </Section>
          <Section
            title={copy("TEXT DECORATION")}
            note={copy("Decoration, casing, shadow, glow and outline.")}
          >
            <SelectField
              label={copy("DECORATION")}
              value={style?.textDecoration ?? "none"}
              options={TEXT_DECORATIONS}
              onChange={(textDecoration) => onStyleChange({ textDecoration })}
            />
            {(style?.textDecoration ?? "none") !== "none" && (
              <>
                <SelectField
                  label={copy("DECORATION STYLE")}
                  value={style?.textDecorationStyle ?? "solid"}
                  options={TEXT_DECORATION_STYLES}
                  onChange={(textDecorationStyle) => onStyleChange({ textDecorationStyle })}
                />
                <div className="studio-color-grid studio-color-grid--single">
                  <ColorField
                    label={copy("DECORATION COLOR")}
                    value={style?.textDecorationColor ?? profile.colors.accent}
                    onChange={(textDecorationColor) => onStyleChange({ textDecorationColor })}
                  />
                </div>
                <RangeField
                  label={copy("DECORATION THICKNESS")}
                  value={style?.textDecorationThickness ?? 1}
                  min={0}
                  max={12}
                  step={0.25}
                  suffix=" PX"
                  onChange={(textDecorationThickness) => onStyleChange({ textDecorationThickness })}
                />
                <RangeField
                  label={copy("UNDERLINE OFFSET")}
                  value={style?.textUnderlineOffset ?? 2}
                  min={-8}
                  max={24}
                  step={0.5}
                  suffix=" PX"
                  onChange={(textUnderlineOffset) => onStyleChange({ textUnderlineOffset })}
                />
              </>
            )}
            <SelectField
              label={copy("TEXT CASE")}
              value={style?.textTransform ?? "none"}
              options={TEXT_TRANSFORMS}
              onChange={(textTransform) => onStyleChange({ textTransform })}
            />
            <div className="studio-color-grid">
              <ColorField
                label={copy("TEXT SHADOW")}
                value={style?.textShadowColor ?? "#000000"}
                onChange={(textShadowColor) => onStyleChange({ textShadowColor })}
              />
              <ColorField
                label={copy("TEXT OUTLINE")}
                value={style?.textStrokeColor ?? profile.colors.text}
                onChange={(textStrokeColor) => onStyleChange({ textStrokeColor })}
              />
            </div>
            <div className="studio-field-grid">
              <RangeField
                label={copy("SHADOW X")}
                value={style?.textShadowX ?? 0}
                min={-40}
                max={40}
                suffix=" PX"
                onChange={(textShadowX) => onStyleChange({ textShadowX })}
              />
              <RangeField
                label={copy("SHADOW Y")}
                value={style?.textShadowY ?? 2}
                min={-40}
                max={40}
                suffix=" PX"
                onChange={(textShadowY) => onStyleChange({ textShadowY })}
              />
            </div>
            <RangeField
              label={copy("SHADOW BLUR / GLOW")}
              value={style?.textShadowBlur ?? 0}
              min={0}
              max={80}
              suffix=" PX"
              onChange={(textShadowBlur) => onStyleChange({ textShadowBlur })}
            />
            <RangeField
              label={copy("TEXT OUTLINE WIDTH")}
              value={style?.textStrokeWidth ?? 0}
              min={0}
              max={8}
              step={0.25}
              suffix=" PX"
              onChange={(textStrokeWidth) => onStyleChange({ textStrokeWidth })}
            />
          </Section>
        </>
      )}

      {supportsSurface && (
        <Section title={copy("SURFACE & BORDER")}>
          <ElementBackgroundPicker
            style={style}
            fallbackColor={profile.colors.surface}
            fallbackAccent={profile.colors.accent}
            onChange={onStyleChange}
          />
          <ElementTextColorPicker
            style={style}
            fallbackColor={profile.colors.text}
            fallbackAccent={profile.colors.accent}
            onChange={onStyleChange}
          />
          <div className="studio-color-grid studio-color-grid--single">
            <ColorField
              label={copy("BORDER")}
              value={style?.borderColor ?? profile.colors.accent}
              onChange={(borderColor) => onStyleChange({ borderColor })}
            />
          </div>
          <RangeField
            label={copy("CORNER RADIUS")}
            value={style?.radius ?? profile.shape.radius}
            min={0}
            max={40}
            suffix=" PX"
            onChange={(radius) => onStyleChange({ radius })}
          />
          <RangeField
            label={copy("BORDER WIDTH")}
            value={style?.borderWidth ?? 0}
            min={0}
            max={8}
            step={0.5}
            suffix=" PX"
            onChange={(borderWidth) => onStyleChange({ borderWidth })}
          />
          <RangeField
            label={copy("WHOLE ELEMENT OPACITY") + copy(elementOpacitySource)}
            value={effectiveElementOpacity}
            min={0}
            max={1}
            step={0.05}
            defaultValue={inheritedElementOpacity}
            onChange={(elementOpacity) => onStyleChange({ elementOpacity })}
          />
          <RangeField
            label={copy("BACKGROUND OPACITY")}
            value={style?.backgroundOpacity ?? style?.opacity ?? 1}
            min={0}
            max={1}
            step={0.05}
            onChange={(backgroundOpacity) => onStyleChange({ backgroundOpacity })}
          />
          <RangeField
            label={copy("CONTENT OPACITY")}
            value={style?.contentOpacity ?? style?.opacity ?? 1}
            min={0}
            max={1}
            step={0.05}
            onChange={(contentOpacity) => onStyleChange({ contentOpacity })}
          />
        </Section>
      )}

      {supportsSpacing && (
        <Section
          title={copy("SPACING")}
          note={copy("Use padding to make a button or card larger without fixed sizing.")}
        >
          <RangeField
            label={copy("HORIZONTAL PADDING")}
            value={style?.paddingX ?? 0}
            min={0}
            max={64}
            suffix=" PX"
            onChange={(paddingX) => onStyleChange({ paddingX })}
          />
          <RangeField
            label={copy("VERTICAL PADDING")}
            value={style?.paddingY ?? 0}
            min={0}
            max={48}
            suffix=" PX"
            onChange={(paddingY) => onStyleChange({ paddingY })}
          />
        </Section>
      )}

      {interactionState === "normal" && (
        <Section
          title={copy("ENTRANCE ANIMATION")}
          note={copy("Plays when the element is mounted, including when its tab appears.")}
        >
          <SelectField
            label={copy("APPEAR EFFECT")}
            value={style?.entranceAnimation ?? "none"}
            options={ENTRANCE_ANIMATIONS}
            onChange={(entranceAnimation) => onStyleChange({ entranceAnimation })}
          />
          {(style?.entranceAnimation ?? "none") !== "none" && (
            <>
              <RangeField
                label={copy("DURATION")}
                value={style?.entranceDuration ?? 600}
                min={100}
                max={5_000}
                step={50}
                suffix=" MS"
                onChange={(entranceDuration) => onStyleChange({ entranceDuration })}
              />
              <RangeField
                label={copy("DELAY")}
                value={style?.entranceDelay ?? 0}
                min={0}
                max={5_000}
                step={50}
                suffix=" MS"
                onChange={(entranceDelay) => onStyleChange({ entranceDelay })}
              />
              <SelectField
                label={copy("EASING")}
                value={style?.entranceEasing ?? "ease-out"}
                options={HOVER_EASINGS}
                onChange={(entranceEasing) => onStyleChange({ entranceEasing })}
              />
              {style?.entranceAnimation === "custom" && (
                <div className="studio-custom-animation">
                  <div className="studio-custom-animation__head">
                    <span>{copy("START FRAME")}</span>
                    <small>
                      {copy("The element animates from these values to its current style.")}
                    </small>
                  </div>
                  <RangeField
                    label={copy("START OPACITY")}
                    value={Math.round((style.entranceFromOpacity ?? 0) * 100)}
                    min={0}
                    max={100}
                    suffix=" %"
                    onChange={(value) => onStyleChange({ entranceFromOpacity: value / 100 })}
                  />
                  <div className="studio-field-grid">
                    <RangeField
                      label={copy("START X")}
                      value={style.entranceFromX ?? 0}
                      min={-800}
                      max={800}
                      suffix=" PX"
                      onChange={(entranceFromX) => onStyleChange({ entranceFromX })}
                    />
                    <RangeField
                      label={copy("START Y")}
                      value={style.entranceFromY ?? 24}
                      min={-600}
                      max={600}
                      suffix=" PX"
                      onChange={(entranceFromY) => onStyleChange({ entranceFromY })}
                    />
                  </div>
                  <div className="studio-field-grid">
                    <RangeField
                      label={copy("START SCALE")}
                      value={Math.round((style.entranceFromScale ?? 0.9) * 100)}
                      min={25}
                      max={200}
                      suffix=" %"
                      onChange={(value) => onStyleChange({ entranceFromScale: value / 100 })}
                    />
                    <RangeField
                      label={copy("START ROTATION")}
                      value={style.entranceFromRotate ?? 0}
                      min={-360}
                      max={360}
                      step={5}
                      suffix=" DEG"
                      onChange={(entranceFromRotate) => onStyleChange({ entranceFromRotate })}
                    />
                  </div>
                  <RangeField
                    label={copy("START BLUR")}
                    value={style.entranceFromBlur ?? 0}
                    min={0}
                    max={80}
                    suffix=" PX"
                    onChange={(entranceFromBlur) => onStyleChange({ entranceFromBlur })}
                  />
                </div>
              )}
            </>
          )}
        </Section>
      )}

      <Section
        title={copy("POSITION & STACKING")}
        note={copy(
          "Offsets move the element visually without removing it from layout. Margins, order and alignment participate in the parent layout.",
        )}
      >
        <div className="studio-field-grid">
          <RangeField
            label={copy("X OFFSET")}
            value={style?.offsetX ?? 0}
            min={-800}
            max={800}
            step={1}
            suffix=" PX"
            onChange={(offsetX) => onStyleChange({ offsetX })}
          />
          <RangeField
            label={copy("Y OFFSET")}
            value={style?.offsetY ?? 0}
            min={-600}
            max={600}
            step={1}
            suffix=" PX"
            onChange={(offsetY) => onStyleChange({ offsetY })}
          />
        </div>
        <div className="studio-field-grid">
          <RangeField
            label={copy("MARGIN TOP")}
            value={style?.marginTop ?? 0}
            min={-200}
            max={400}
            suffix=" PX"
            onChange={(marginTop) => onStyleChange({ marginTop })}
          />
          <RangeField
            label={copy("MARGIN RIGHT")}
            value={style?.marginRight ?? 0}
            min={-200}
            max={400}
            suffix=" PX"
            onChange={(marginRight) => onStyleChange({ marginRight })}
          />
          <RangeField
            label={copy("MARGIN BOTTOM")}
            value={style?.marginBottom ?? 0}
            min={-200}
            max={400}
            suffix=" PX"
            onChange={(marginBottom) => onStyleChange({ marginBottom })}
          />
          <RangeField
            label={copy("MARGIN LEFT")}
            value={style?.marginLeft ?? 0}
            min={-200}
            max={400}
            suffix=" PX"
            onChange={(marginLeft) => onStyleChange({ marginLeft })}
          />
        </div>
        <div className="studio-field-grid">
          <RangeField
            label={copy("ORDER")}
            value={style?.order ?? 0}
            min={-100}
            max={100}
            step={1}
            onChange={(order) => onStyleChange({ order })}
          />
          <RangeField
            label={copy("Z-INDEX")}
            value={style?.zIndex ?? 0}
            min={-100}
            max={1000}
            step={1}
            onChange={(zIndex) => onStyleChange({ zIndex })}
          />
        </div>
        <div className="studio-field-grid">
          <SelectField
            label={copy("ALIGN SELF")}
            value={style?.alignSelf ?? "auto"}
            options={ALIGNMENTS}
            onChange={(alignSelf) => onStyleChange({ alignSelf })}
          />
          <SelectField
            label={copy("JUSTIFY SELF")}
            value={style?.justifySelf ?? "auto"}
            options={ALIGNMENTS}
            onChange={(justifySelf) => onStyleChange({ justifySelf })}
          />
        </div>
      </Section>

      {target.kind === "list" && (
        <Section
          title={copy("CHILD LAYOUT")}
          note={copy(
            "Container-only controls, equivalent to changing display, direction, columns and gap in CSS.",
          )}
        >
          <SelectField
            label={copy("LAYOUT")}
            value={style?.layout ?? "default"}
            options={LAYOUTS}
            onChange={(layout) => onStyleChange({ layout })}
          />
          {(style?.layout ?? "default") === "grid" && (
            <RangeField
              label={copy("GRID COLUMNS")}
              value={style?.columns ?? 2}
              min={1}
              max={12}
              onChange={(columns) => onStyleChange({ columns })}
            />
          )}
          <RangeField
            label={copy("CHILD GAP")}
            value={style?.gap ?? 0}
            min={0}
            max={96}
            suffix=" PX"
            onChange={(gap) => onStyleChange({ gap })}
          />
        </Section>
      )}

      <Section
        title={copy("ADVANCED EFFECTS")}
        note={copy("Every value belongs to the selected {state} state.", {
          state: copy(interactionState.toUpperCase()),
        })}
      >
        <SelectField
          label={copy("SHADOW PRESET")}
          value={style?.shadow ?? "none"}
          options={SHADOWS}
          onChange={(shadow) => onStyleChange({ shadow })}
        />
        <div className="studio-color-grid">
          <ColorField
            label={copy("CUSTOM SHADOW")}
            value={style?.shadowColor ?? "#000000"}
            onChange={(shadowColor) => onStyleChange({ shadowColor })}
          />
          <ColorField
            label={copy("GLOW")}
            value={style?.glowColor ?? profile.colors.accent}
            onChange={(glowColor) => onStyleChange({ glowColor })}
          />
        </div>
        <div className="studio-field-grid">
          <RangeField
            label={copy("SHADOW X")}
            value={style?.shadowX ?? 0}
            min={-100}
            max={100}
            suffix=" PX"
            onChange={(shadowX) => onStyleChange({ shadowX })}
          />
          <RangeField
            label={copy("SHADOW Y")}
            value={style?.shadowY ?? 8}
            min={-100}
            max={100}
            suffix=" PX"
            onChange={(shadowY) => onStyleChange({ shadowY })}
          />
          <RangeField
            label={copy("SHADOW BLUR")}
            value={style?.shadowBlur ?? 24}
            min={0}
            max={160}
            suffix=" PX"
            onChange={(shadowBlur) => onStyleChange({ shadowBlur })}
          />
          <RangeField
            label={copy("SHADOW SPREAD")}
            value={style?.shadowSpread ?? 0}
            min={-40}
            max={80}
            suffix=" PX"
            onChange={(shadowSpread) => onStyleChange({ shadowSpread })}
          />
        </div>
        <div className="studio-field-grid">
          <RangeField
            label={copy("GLOW INTENSITY")}
            value={style?.glowIntensity ?? 0}
            min={0}
            max={1}
            step={0.05}
            onChange={(glowIntensity) => onStyleChange({ glowIntensity })}
          />
          <RangeField
            label={copy("GLOW BLUR")}
            value={style?.glowBlur ?? 24}
            min={0}
            max={160}
            suffix=" PX"
            onChange={(glowBlur) => onStyleChange({ glowBlur })}
          />
        </div>
        <div className="studio-color-grid">
          <ColorField
            label={copy("OUTLINE")}
            value={style?.outlineColor ?? profile.colors.accent}
            onChange={(outlineColor) => onStyleChange({ outlineColor })}
          />
          <ColorField
            label={copy("GLASS TINT")}
            value={style?.glassTint ?? profile.colors.surface}
            onChange={(glassTint) => onStyleChange({ glassTint })}
          />
        </div>
        <div className="studio-field-grid">
          <RangeField
            label={copy("OUTLINE WIDTH")}
            value={style?.outlineWidth ?? 0}
            min={0}
            max={12}
            step={0.5}
            suffix=" PX"
            onChange={(outlineWidth) => onStyleChange({ outlineWidth })}
          />
          <RangeField
            label={copy("OUTLINE OFFSET")}
            value={style?.outlineOffset ?? 0}
            min={-20}
            max={40}
            suffix=" PX"
            onChange={(outlineOffset) => onStyleChange({ outlineOffset })}
          />
          <RangeField
            label={copy("BACKDROP BLUR")}
            value={style?.backdropBlur ?? 0}
            min={0}
            max={80}
            suffix=" PX"
            onChange={(backdropBlur) => onStyleChange({ backdropBlur })}
          />
          <RangeField
            label={copy("GRAIN / NOISE")}
            value={style?.grainOpacity ?? 0}
            min={0}
            max={0.6}
            step={0.01}
            onChange={(grainOpacity) => onStyleChange({ grainOpacity })}
          />
        </div>
        <SelectField
          label={copy("GLASS EFFECT")}
          value={style?.glassEffect ? "on" : "off"}
          options={BOOLEAN_OPTIONS}
          onChange={(value) => onStyleChange({ glassEffect: value === "on" })}
        />
        {style?.glassEffect && (
          <div className="studio-field-grid">
            <RangeField
              label={copy("GLASS OPACITY")}
              value={style.glassOpacity ?? 0.18}
              min={0}
              max={1}
              step={0.01}
              onChange={(glassOpacity) => onStyleChange({ glassOpacity })}
            />
            <RangeField
              label={copy("GLASS SATURATION")}
              value={style.glassSaturation ?? 1.35}
              min={0}
              max={3}
              step={0.05}
              onChange={(glassSaturation) => onStyleChange({ glassSaturation })}
            />
          </div>
        )}
        {interactionState === "normal" && (
          <>
            <SelectField
              label={copy("LIQUID GLASS SHADER")}
              value={style?.liquidGlass ? "on" : "off"}
              options={BOOLEAN_OPTIONS}
              onChange={(value) =>
                onStyleChange({
                  liquidGlass: value === "on",
                  ...(value === "on" ? { glassEffect: true } : {}),
                })
              }
            />
            {style?.liquidGlass && (
              <>
                <div className="studio-field-grid">
                  <RangeField
                    label={copy("LIQUID BLUR")}
                    value={style.liquidGlassBlur ?? 0.25}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(liquidGlassBlur) => onStyleChange({ liquidGlassBlur })}
                  />
                  <RangeField
                    label={copy("REFRACTION")}
                    value={style.liquidGlassRefraction ?? 0.69}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(liquidGlassRefraction) => onStyleChange({ liquidGlassRefraction })}
                  />
                  <RangeField
                    label={copy("CHROMATIC EDGE")}
                    value={style.liquidGlassChromaticAberration ?? 0.05}
                    min={0}
                    max={0.35}
                    step={0.01}
                    onChange={(liquidGlassChromaticAberration) =>
                      onStyleChange({ liquidGlassChromaticAberration })
                    }
                  />
                  <RangeField
                    label={copy("EDGE HIGHLIGHT")}
                    value={style.liquidGlassEdgeHighlight ?? 0.12}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(liquidGlassEdgeHighlight) =>
                      onStyleChange({ liquidGlassEdgeHighlight })
                    }
                  />
                </div>
                <RangeField
                  label={copy("SPECULAR LIGHT")}
                  value={style.liquidGlassSpecular ?? 0.2}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(liquidGlassSpecular) => onStyleChange({ liquidGlassSpecular })}
                />
              </>
            )}
          </>
        )}
        <RangeField
          label={copy("SCALE")}
          value={style?.scale ?? 1}
          min={0.5}
          max={1.5}
          step={0.01}
          onChange={(scale) => onStyleChange({ scale })}
        />
        <RangeField
          label={copy("ROTATION")}
          value={style?.rotate ?? 0}
          min={-180}
          max={180}
          step={0.5}
          suffix="°"
          onChange={(rotate) => onStyleChange({ rotate })}
        />
      </Section>
    </div>
  );
}
