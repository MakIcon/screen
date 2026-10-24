import { useAppearanceText } from "./localization";
import { DISPLAY_FONT_OPTIONS, FONT_OPTIONS, customFontStack } from "./profile";
import { ColorField, RangeField, Section, SelectField } from "./StudioFields";
import { ElementTargetSummary } from "./ElementTargetSummary";
import { ElementBackgroundPicker } from "./ElementBackgroundPicker";
import { ElementTextColorPicker } from "./ElementTextColorPicker";
import { PlaceholderTemplateEditor } from "./PlaceholderTemplateEditor";
import type {
  AppearanceElementAlignment,
  AppearanceElementHoverEasing,
  AppearanceElementInteractionState,
  AppearanceElementLayout,
  AppearanceElementOverride,
  AppearanceElementStyle,
  AppearanceElementShadow,
  AppearanceElementTarget,
  AppearanceElementTextAlign,
  AppearanceProfile,
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

function normalizeBoxDefault(value: number | undefined, max: number) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
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
  onStateTransitionChange,
}: ElementInspectorProps) {
  const copy = useAppearanceText();
  if (!target) {
    return (
      <div className="appearance-element-empty">
        <span>{copy("10 / ELEMENT INSPECTOR")}</span>
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
      <ElementTargetSummary target={target} interactionState={interactionState} />

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
