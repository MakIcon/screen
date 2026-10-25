import { useEffect, useState } from "react";
import { useAppearanceText } from "./localization";
import { RangeField, Section, SelectField } from "./StudioFields";
import { ComponentPropsInspector } from "./ComponentPropsInspector";
import { ElementTargetSummary } from "./ElementTargetSummary";
import type {
  AppearanceCheckboxSettings,
  AppearanceElementComponentOverride,
  AppearanceElementOverride,
  AppearanceElementTarget,
  AppearanceSliderSettings,
  AppearanceToggleSettings,
} from "./types";

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

type ComponentSettingsInspectorProps = {
  target: AppearanceElementTarget | null;
  override?: AppearanceElementOverride;
  onPick: () => void;
  onComponentChange: (settings: AppearanceElementComponentOverride) => void;
};

export function ComponentSettingsInspector({
  target,
  override,
  onPick,
  onComponentChange,
}: ComponentSettingsInspectorProps) {
  const copy = useAppearanceText();
  if (!target?.component) {
    return (
      <div className="appearance-element-empty">
        <span>{copy("SELECT SETTINGS")}</span>
        <strong>{copy("PICK A COMPONENT IN THE LAUNCHER")}</strong>
        <p>
          {copy(
            "Select a text field, dropdown, progress bar, slider, toggle, checkbox, button or badge to edit its behavior and content.",
          )}
        </p>
        <button type="button" onClick={onPick}>
          {copy("START ELEMENT PICKER →")}
        </button>
      </div>
    );
  }
  const component = target.component;
  const componentOverride = override?.componentSettings;
  const sliderDefaults = component?.kind === "slider" ? component.props : null;
  const toggleDefaults = component?.kind === "toggle" ? component.props : null;
  const checkboxDefaults = component?.kind === "checkbox" ? component.props : null;
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

  return (
    <div className="appearance-component-settings">
      <ElementTargetSummary target={target} />
      {sliderSettings && (
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

      {toggleSettings && (
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

      {checkboxSettings && (
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

      {component && (
        <ComponentPropsInspector
          component={component}
          override={componentOverride}
          onChange={onComponentChange}
        />
      )}
    </div>
  );
}
