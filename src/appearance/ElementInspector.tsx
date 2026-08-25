import { useEffect, useState } from "react";
import { DISPLAY_FONT_OPTIONS, FONT_OPTIONS } from "./profile";
import { ColorField, RangeField, Section, SelectField } from "./StudioFields";
import { ElementBackgroundPicker } from "./ElementBackgroundPicker";
import { PlaceholderTemplateEditor } from "./PlaceholderTemplateEditor";
import type {
  AppearanceCheckboxSettings,
  AppearanceDropdownSettings,
  AppearanceElementComponentOverride,
  AppearanceElementHoverEasing,
  AppearanceElementInteractionState,
  AppearanceElementLayout,
  AppearanceElementOverride,
  AppearanceElementShadow,
  AppearanceElementTarget,
  AppearanceElementTextAlign,
  AppearanceProfile,
  AppearanceSliderSettings,
  AppearanceToggleSettings,
} from "./types";

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

const HOVER_EASINGS: readonly { id: AppearanceElementHoverEasing; label: string }[] = [
  { id: "linear", label: "LINEAR" },
  { id: "ease", label: "EASE" },
  { id: "ease-in", label: "EASE IN" },
  { id: "ease-out", label: "EASE OUT" },
  { id: "ease-in-out", label: "EASE IN / OUT" },
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
      <span>CUSTOM TICK VALUES</span>
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
        ALLOWED: {min} TO {max} · VALUES OUTSIDE {activeMin}–{activeMax} STAY SAVED
      </small>
    </label>
  );
}

type ElementInspectorProps = {
  target: AppearanceElementTarget | null;
  override?: AppearanceElementOverride;
  visualStyle?: AppearanceElementOverride["style"];
  interactionState: AppearanceElementInteractionState;
  hoverTransitionMs: number;
  hoverEasing: AppearanceElementHoverEasing;
  profile: AppearanceProfile;
  onPick: () => void;
  onStyleChange: (style: Partial<AppearanceElementOverride["style"]>) => void;
  onTextChange: (text: string | undefined) => void;
  onComponentChange: (settings: AppearanceElementComponentOverride) => void;
  onHoverTransitionChange: (patch: {
    hoverTransitionMs?: number;
    hoverEasing?: AppearanceElementHoverEasing;
  }) => void;
};

export function ElementInspector({
  target,
  override,
  visualStyle,
  interactionState,
  hoverTransitionMs,
  hoverEasing,
  profile,
  onPick,
  onStyleChange,
  onTextChange,
  onComponentChange,
  onHoverTransitionChange,
}: ElementInspectorProps) {
  if (!target) {
    return (
      <div className="appearance-element-empty">
        <span>08 / ELEMENT INSPECTOR</span>
        <strong>PICK ANY OBJECT IN THE LAUNCHER</strong>
        <p>
          Select a button, title, card or control. Its text and visual settings will appear here and
          update live in the main window.
        </p>
        <button type="button" onClick={onPick}>
          START ELEMENT PICKER →
        </button>
      </div>
    );
  }

  const style = visualStyle;
  const activeInteractionStyle =
    interactionState === "hover" ? override?.hoverStyle : override?.style;
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
      : interactionState === "hover" &&
          (override?.style.elementOpacity !== undefined || override?.style.opacity !== undefined)
        ? " · FROM NORMAL"
        : " · LAUNCHER DEFAULT";
  const renderedOriginalText = target.textTarget?.original;
  const originalText = target.textTarget?.template ?? renderedOriginalText;
  const hasTextOverride = override && Object.prototype.hasOwnProperty.call(override, "text");
  const displayedText = hasTextOverride ? (override.text ?? "") : (originalText ?? "");
  const fonts = [...FONT_OPTIONS, ...DISPLAY_FONT_OPTIONS].filter(
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
          {target.tab ? target.tab.toUpperCase() : "ALL TABS"} ·{" "}
          {(target.kind ?? "element").toUpperCase()} · {interactionState.toUpperCase()}
        </span>
        <strong>{target.label}</strong>
        <small>{target.id}</small>
      </div>

      {interactionState === "hover" && (
        <Section
          title="HOVER TRANSITION"
          note="The launcher pins this state on the selected element while you edit it. Zero milliseconds makes the change instant."
        >
          <RangeField
            label="DURATION"
            value={hoverTransitionMs}
            min={0}
            max={2_000}
            step={25}
            suffix=" MS"
            defaultValue={200}
            onChange={(hoverTransitionMs) => onHoverTransitionChange({ hoverTransitionMs })}
          />
          <SelectField
            label="EASING"
            value={hoverEasing}
            options={HOVER_EASINGS}
            onChange={(hoverEasing) => onHoverTransitionChange({ hoverEasing })}
          />
        </Section>
      )}

      {interactionState === "normal" && supportsVisibleText && (
        <Section
          title="VISIBLE TEXT"
          note="Changes the primary visible label without replacing the button or breaking its click behavior."
        >
          <>
            <div className="studio-text-field">
              <span>
                {target.textTarget?.template ? "TEXT / PLACEHOLDER TEMPLATE" : "ELEMENT LABEL"}
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
              RESTORE ORIGINAL TEXT
            </button>
          </>
        </Section>
      )}

      <Section
        title="SIZE & BOX"
        note="AUTO is detected separately for every axis. Fixed-size controls start at their measured pixels; flexible controls start at 0 AUTO."
      >
        <RangeField
          label="WIDTH"
          value={style?.width ?? initialWidth}
          min={0}
          max={1_200}
          defaultValue={defaultWidth}
          suffix=" PX"
          zeroSuffix={widthAuto ? " AUTO" : undefined}
          onChange={(width) =>
            onStyleChange({
              width: interactionState === "normal" && width === initialWidth ? undefined : width,
            })
          }
        />
        <RangeField
          label="HEIGHT"
          value={style?.height ?? initialHeight}
          min={0}
          max={800}
          defaultValue={defaultHeight}
          suffix=" PX"
          zeroSuffix={heightAuto ? " AUTO" : undefined}
          onChange={(height) =>
            onStyleChange({
              height:
                interactionState === "normal" && height === initialHeight ? undefined : height,
            })
          }
        />
        <RangeField
          label="MIN WIDTH"
          value={style?.minWidth ?? initialMinWidth}
          min={0}
          max={1_200}
          defaultValue={defaultMinWidth}
          suffix=" PX"
          zeroSuffix={minWidthAuto ? " AUTO" : undefined}
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
          label="MIN HEIGHT"
          value={style?.minHeight ?? initialMinHeight}
          min={0}
          max={800}
          defaultValue={defaultMinHeight}
          suffix=" PX"
          zeroSuffix={minHeightAuto ? " AUTO" : undefined}
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
          title="SLIDER PROPS"
          note="These are live component props: the selected ElementSlider is rebuilt with the new range, step, header and ticks."
        >
          <label className="studio-text-field studio-text-field--single-line">
            <span>HEADER LABEL</span>
            <input
              value={sliderSettings.label}
              maxLength={80}
              spellCheck={false}
              onChange={(event) => patchSlider({ label: event.target.value })}
            />
          </label>
          <RangeField
            label="MIN"
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
                  USE REAL RAM · {sliderSettings.systemMax} GB
                </button>
                <button
                  type="button"
                  className={sliderSettings.maxMode === "custom" ? "active" : ""}
                  onClick={() => patchSlider({ maxMode: "custom" })}
                >
                  MANUAL MAX ≤ {sliderSettings.systemMax} GB
                </button>
              </div>
              <div className="studio-unavailable-note">
                This is the launcher RAM slider. Its hard ceiling is the detected system memory, so
                an appearance profile can never set it above {sliderSettings.systemMax} GB.
              </div>
            </>
          )}
          <RangeField
            label={sliderSettings.maxMode === "system" ? "MAX · SYSTEM RAM" : "MAX"}
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
            label={sliderSettings.constraint === "system-ram" ? "STEP · WHOLE GB" : "STEP"}
            value={sliderSettings.step}
            min={sliderSettings.constraint === "system-ram" ? 1 : 0.01}
            max={sliderSettings.constraint === "system-ram" ? sliderHardMax : 100}
            step={sliderSettings.constraint === "system-ram" ? 1 : 0.01}
            defaultValue={sliderDefaults?.step}
            onChange={(step) => patchSlider({ step })}
          />
          <RangeField
            label="DEFAULT VALUE"
            value={sliderSettings.defaultValue}
            min={sliderSettings.min}
            max={sliderActiveMax}
            step={sliderSettings.constraint === "system-ram" ? 1 : sliderSettings.step}
            defaultValue={sliderDefaults?.defaultValue}
            onChange={(defaultValue) => patchSlider({ defaultValue })}
          />
          <SelectField
            label="SHOW HEADER LABEL"
            value={sliderSettings.showHeader ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchSlider({ showHeader: value === "on" })}
          />
          <SelectField
            label="SHOW VALUE"
            value={sliderSettings.showValue ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchSlider({ showValue: value === "on" })}
          />
          <SelectField
            label="EDIT VALUE BY KEYBOARD"
            value={sliderSettings.valueEditable ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchSlider({ valueEditable: value === "on" })}
          />
          <SelectField
            label="ARROW KEY CONTROL"
            value={sliderSettings.keyboardEnabled ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchSlider({ keyboardEnabled: value === "on" })}
          />
          <SelectField
            label="DEFAULT VALUE MARKER"
            value={sliderSettings.showDefaultMarker ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchSlider({ showDefaultMarker: value === "on" })}
          />
          {sliderSettings.showDefaultMarker && (
            <SelectField
              label="SNAP TO DEFAULT MARKER"
              value={sliderSettings.defaultMarkerMagnetic ? "on" : "off"}
              options={BOOLEAN_OPTIONS}
              onChange={(value) => patchSlider({ defaultMarkerMagnetic: value === "on" })}
            />
          )}
          <SelectField
            label="TICK LABEL MODE"
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
            DEFAULT VALUE affects uncontrolled sliders. Controlled sliders such as launcher RAM keep
            their real saved value, while MIN, MAX, STEP and TICKS still apply live.
          </div>
        </Section>
      )}

      {interactionState === "normal" && toggleSettings && (
        <Section
          title="TOGGLE PROPS"
          note="Controls the selected ElementToggle structure and switch size."
        >
          <label className="studio-text-field studio-text-field--single-line">
            <span>TITLE</span>
            <input
              value={toggleSettings.title}
              maxLength={120}
              spellCheck={false}
              onChange={(event) => patchToggle({ title: event.target.value })}
            />
          </label>
          <label className="studio-text-field">
            <span>NOTE</span>
            <textarea
              value={toggleSettings.note}
              maxLength={240}
              rows={2}
              spellCheck={false}
              onChange={(event) => patchToggle({ note: event.target.value })}
            />
          </label>
          <SelectField
            label="SHOW NOTE"
            value={toggleSettings.showNote ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchToggle({ showNote: value === "on" })}
          />
          <SelectField
            label="COMPACT MODE"
            value={toggleSettings.compact ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchToggle({ compact: value === "on" })}
          />
          <RangeField
            label="SWITCH SCALE"
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
          title="CHECKBOX PROPS"
          note="Fine-tune the indicator independently from its label."
        >
          <label className="studio-text-field studio-text-field--single-line">
            <span>LABEL</span>
            <input
              value={checkboxSettings.label}
              maxLength={120}
              spellCheck={false}
              onChange={(event) => patchCheckbox({ label: event.target.value })}
            />
          </label>
          <RangeField
            label="INDICATOR SIZE"
            value={checkboxSettings.indicatorSize}
            min={10}
            max={36}
            suffix=" PX"
            defaultValue={checkboxDefaults?.indicatorSize}
            onChange={(indicatorSize) => patchCheckbox({ indicatorSize })}
          />
          <RangeField
            label="LABEL GAP"
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
          title="DROPDOWN PROPS"
          note="Changes the selected InlineDropdown and its option list."
        >
          <label className="studio-text-field studio-text-field--single-line">
            <span>LABEL</span>
            <input
              value={dropdownSettings.label}
              maxLength={120}
              spellCheck={false}
              onChange={(event) => patchDropdown({ label: event.target.value })}
            />
          </label>
          <SelectField
            label="SHOW LABEL"
            value={dropdownSettings.showLabel ? "on" : "off"}
            options={BOOLEAN_OPTIONS}
            onChange={(value) => patchDropdown({ showLabel: value === "on" })}
          />
          <RangeField
            label="VISIBLE ITEMS"
            value={dropdownSettings.visibleItems}
            min={1}
            max={12}
            defaultValue={dropdownDefaults?.visibleItems}
            onChange={(visibleItems) => patchDropdown({ visibleItems })}
          />
          <RangeField
            label="ITEM HEIGHT"
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
        <Section title="TYPOGRAPHY" note="Fine controls apply only to this selected object.">
          <SelectField
            label="FONT FAMILY"
            value={selectedFont}
            options={fontOptions}
            onChange={(fontFamily) => onStyleChange({ fontFamily })}
          />
          <SelectField
            label="TEXT ALIGN"
            value={style?.textAlign ?? "center"}
            options={TEXT_ALIGNMENTS}
            onChange={(textAlign) => onStyleChange({ textAlign })}
          />
          <RangeField
            label="FONT SIZE"
            value={style?.fontSize ?? 14}
            min={6}
            max={96}
            suffix=" PX"
            onChange={(fontSize) => onStyleChange({ fontSize })}
          />
          <RangeField
            label="FONT WEIGHT"
            value={style?.fontWeight ?? 700}
            min={100}
            max={900}
            step={100}
            onChange={(fontWeight) => onStyleChange({ fontWeight })}
          />
          <RangeField
            label="LETTER SPACING"
            value={style?.letterSpacing ?? 0}
            min={-2}
            max={10}
            step={0.25}
            suffix=" PX"
            onChange={(letterSpacing) => onStyleChange({ letterSpacing })}
          />
          <RangeField
            label="LINE HEIGHT"
            value={style?.lineHeight ?? 1.2}
            min={0.7}
            max={2.5}
            step={0.05}
            onChange={(lineHeight) => onStyleChange({ lineHeight })}
          />
        </Section>
      )}

      {supportsSurface && (
        <Section title="SURFACE & BORDER">
          <ElementBackgroundPicker
            style={style}
            fallbackColor={profile.colors.surface}
            fallbackAccent={profile.colors.accent}
            onChange={onStyleChange}
          />
          <div className="studio-color-grid">
            <ColorField
              label="TEXT"
              value={style?.textColor ?? profile.colors.text}
              onChange={(textColor) => onStyleChange({ textColor })}
            />
            <ColorField
              label="BORDER"
              value={style?.borderColor ?? profile.colors.accent}
              onChange={(borderColor) => onStyleChange({ borderColor })}
            />
          </div>
          <RangeField
            label="CORNER RADIUS"
            value={style?.radius ?? profile.shape.radius}
            min={0}
            max={40}
            suffix=" PX"
            onChange={(radius) => onStyleChange({ radius })}
          />
          <RangeField
            label="BORDER WIDTH"
            value={style?.borderWidth ?? 0}
            min={0}
            max={8}
            step={0.5}
            suffix=" PX"
            onChange={(borderWidth) => onStyleChange({ borderWidth })}
          />
          <RangeField
            label={`WHOLE ELEMENT OPACITY${elementOpacitySource}`}
            value={effectiveElementOpacity}
            min={0}
            max={1}
            step={0.05}
            defaultValue={inheritedElementOpacity}
            onChange={(elementOpacity) => onStyleChange({ elementOpacity })}
          />
          <RangeField
            label="BACKGROUND OPACITY"
            value={style?.backgroundOpacity ?? style?.opacity ?? 1}
            min={0}
            max={1}
            step={0.05}
            onChange={(backgroundOpacity) => onStyleChange({ backgroundOpacity })}
          />
          <RangeField
            label="CONTENT OPACITY"
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
          title="SPACING"
          note="Use padding to make a button or card larger without fixed sizing."
        >
          <RangeField
            label="HORIZONTAL PADDING"
            value={style?.paddingX ?? 0}
            min={0}
            max={64}
            suffix=" PX"
            onChange={(paddingX) => onStyleChange({ paddingX })}
          />
          <RangeField
            label="VERTICAL PADDING"
            value={style?.paddingY ?? 0}
            min={0}
            max={48}
            suffix=" PX"
            onChange={(paddingY) => onStyleChange({ paddingY })}
          />
        </Section>
      )}

      {target.kind === "list" && (
        <Section
          title="CHILD LAYOUT"
          note="Container-only controls, equivalent to changing display, direction, columns and gap in CSS."
        >
          <SelectField
            label="LAYOUT"
            value={style?.layout ?? "default"}
            options={LAYOUTS}
            onChange={(layout) => onStyleChange({ layout })}
          />
          {(style?.layout ?? "default") === "grid" && (
            <RangeField
              label="GRID COLUMNS"
              value={style?.columns ?? 2}
              min={1}
              max={12}
              onChange={(columns) => onStyleChange({ columns })}
            />
          )}
          <RangeField
            label="CHILD GAP"
            value={style?.gap ?? 0}
            min={0}
            max={96}
            suffix=" PX"
            onChange={(gap) => onStyleChange({ gap })}
          />
        </Section>
      )}

      <Section title="EFFECTS" note="Transform and shadow use the selected NORMAL or HOVER state.">
        <SelectField
          label="SHADOW"
          value={style?.shadow ?? "none"}
          options={SHADOWS}
          onChange={(shadow) => onStyleChange({ shadow })}
        />
        <RangeField
          label="SCALE"
          value={style?.scale ?? 1}
          min={0.5}
          max={1.5}
          step={0.01}
          onChange={(scale) => onStyleChange({ scale })}
        />
        <RangeField
          label="ROTATION"
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
