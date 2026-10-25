import { useEffect, useState } from "react";
import { useTranslation, type PlainMessageKey } from "../i18n/locale";
import { RangeField, Section, SelectField, ColorField } from "./StudioFields";
import type { AppearanceElementComponentOverride, AppearanceElementComponentTarget } from "./types";
import type { ExtendedComponentKind } from "./componentDefaults";

type Field = {
  key: string;
  type: "text" | "boolean" | "range" | "choice" | "color";
  min?: number;
  max?: number;
  step?: number;
  choices?: readonly string[];
  labelKey?: PlainMessageKey;
};
const text = (key: string): Field => ({ key, type: "text" });
const toggle = (key: string): Field => ({ key, type: "boolean" });
const range = (key: string, min: number, max: number, step = 1): Field => ({
  key,
  type: "range",
  min,
  max,
  step,
});
const choice = (key: string, choices: readonly string[]): Field => ({
  key,
  type: "choice",
  choices,
});

export const COMPONENT_INSPECTOR_FIELDS: Record<ExtendedComponentKind, readonly Field[]> = {
  button: [
    text("label"),
    {
      ...choice("variant", ["inherit", "primary", "secondary", "ghost", "danger"]),
      labelKey: "components.settings.buttonVariant",
    },
    choice("size", ["sm", "md", "lg"]),
    toggle("showIcon"),
    choice("iconPosition", ["start", "end"]),
    toggle("fullWidth"),
    range("height", 0, 240),
    range("paddingX", -1, 64),
    range("fontSize", 0, 48),
    range("borderRadius", -1, 120),
    range("iconSize", 8, 48),
    range("gap", 0, 32),
  ],
  badge: [
    text("label"),
    choice("tone", ["neutral", "accent", "success", "warning", "danger"]),
    {
      ...choice("variant", ["soft", "solid", "outline", "plain"]),
      labelKey: "components.settings.badgeVariant",
    },
    choice("size", ["sm", "md", "lg"]),
    toggle("showIcon"),
    toggle("showDot"),
    toggle("pulse"),
    range("paddingX", -1, 64),
    range("fontSize", 0, 48),
    range("borderRadius", -1, 120),
  ],
  textfield: [
    text("label"),
    toggle("showLabel"),
    text("placeholder"),
    toggle("showPlaceholder"),
    text("hint"),
    toggle("showHint"),
    text("defaultValue"),
    toggle("showReset"),
    toggle("showClear"),
    toggle("showCopy"),
    toggle("showPasswordToggle"),
    toggle("showCounter"),
    range("maxLength", 0, 100000),
    toggle("selectOnFocus"),
    toggle("trimOnBlur"),
    range("height", 0, 240),
    range("paddingX", -1, 64),
    range("fontSize", 0, 48),
    range("borderRadius", -1, 120),
    choice("textAlign", ["inherit", "left", "center", "right"]),
    range("rows", 1, 40),
    choice("resize", ["inherit", "none", "vertical", "both"]),
  ],
  dropdown: [
    text("label"),
    toggle("showLabel"),
    toggle("searchEnabled"),
    text("searchPlaceholder"),
    text("emptyText"),
    range("visibleItems", 1, 20),
    range("itemHeight", 24, 96),
    toggle("showArrow"),
    toggle("showClear"),
    toggle("showSelectedMark"),
    toggle("highlightMatches"),
    toggle("showDescriptions"),
    toggle("showResultCount"),
    toggle("caseSensitive"),
    choice("searchMatch", ["contains", "starts-with"]),
    choice("sortMode", ["source", "ascending", "descending"]),
    toggle("closeOnSelect"),
    toggle("wrapNavigation"),
    choice("placement", ["auto", "down", "up"]),
    range("menuGap", 0, 32),
    range("menuMinWidth", 0, 1000),
    text("defaultValue"),
    toggle("showDefaultMarker"),
  ],
  progressbar: [
    text("label"),
    toggle("showLabel"),
    toggle("showValue"),
    toggle("showDetail"),
    choice("valueFormat", ["percent", "fraction", "value"]),
    range("precision", 0, 3),
    choice("variant", ["line", "rounded", "segmented"]),
    range("height", 1, 48),
    range("borderRadius", -1, 120),
    toggle("animated"),
    range("animationDuration", 0, 3000, 10),
    toggle("striped"),
    range("stripeWidth", 4, 64),
    range("segmentCount", 2, 100),
    range("segmentGap", 0, 12),
    choice("tickMode", ["none", "quarters", "tenths", "custom"]),
    toggle("showTickLabels"),
    toggle("highlightPassedTicks"),
    range("defaultValue", 0, 100),
    toggle("showDefaultMarker"),
    { key: "fillColor", type: "color" },
    { key: "trackColor", type: "color" },
    { key: "markerColor", type: "color" },
  ],
};

function ProgressTickEditor({
  values,
  onChange,
}: {
  values: number[];
  onChange: (values: number[]) => void;
}) {
  const tr = useTranslation();
  const [draft, setDraft] = useState(values.join(", "));
  const [invalid, setInvalid] = useState(false);
  const serialized = values.join(", ");
  useEffect(() => setDraft(serialized), [serialized]);
  const commit = () => {
    const parsed = draft.trim()
      ? draft
          .split(/[,;\s]+/)
          .filter(Boolean)
          .map(Number)
      : [];
    if (parsed.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      setInvalid(true);
      return;
    }
    const next = [...new Set(parsed)].sort((a, b) => a - b).slice(0, 64);
    setInvalid(false);
    setDraft(next.join(", "));
    onChange(next);
  };
  return (
    <label className="studio-text-field">
      <span>{tr("components.customTicks")}</span>
      <input
        value={draft}
        aria-invalid={invalid || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      <small role={invalid ? "alert" : undefined}>
        {tr(invalid ? "components.invalidTicks" : "components.tickHint")}
      </small>
    </label>
  );
}

export function ComponentPropsInspector({
  component,
  override,
  onChange,
}: {
  component: AppearanceElementComponentTarget;
  override?: AppearanceElementComponentOverride;
  onChange: (override: AppearanceElementComponentOverride) => void;
}) {
  const tr = useTranslation();
  if (
    component.kind !== "textfield" &&
    component.kind !== "dropdown" &&
    component.kind !== "progressbar" &&
    component.kind !== "button" &&
    component.kind !== "badge"
  )
    return null;
  const values = {
    ...component.props,
    ...(override?.kind === component.kind ? override.settings : {}),
  } as Record<string, unknown>;
  const patch = (key: string, value: unknown) =>
    onChange({
      kind: component.kind,
      settings: { ...values, [key]: value },
    } as AppearanceElementComponentOverride);
  const title = tr(
    component.kind === "textfield"
      ? "components.textFieldSettings"
      : component.kind === "dropdown"
        ? "components.selectSettings"
        : component.kind === "button"
          ? "components.buttonSettings"
          : component.kind === "badge"
            ? "components.badgeSettings"
            : "components.progressSettings",
  );
  return (
    <Section
      title={title}
      note={tr(
        component.kind === "progressbar"
          ? "components.progressSettingsHint"
          : "components.settingsHint",
      )}
    >
      {COMPONENT_INSPECTOR_FIELDS[component.kind].map((field) => {
        if (
          component.kind === "button" &&
          component.props.iconOnly &&
          (field.key === "showIcon" || field.key === "iconPosition")
        )
          return null;
        const label = tr(field.labelKey ?? (`components.settings.${field.key}` as PlainMessageKey));
        const value = values[field.key];
        if (field.type === "boolean")
          return (
            <SelectField
              key={field.key}
              label={label}
              value={value ? "on" : "off"}
              translateOptions={false}
              options={[
                { id: "on", label: tr("components.on") },
                { id: "off", label: tr("components.off") },
              ]}
              onChange={(next) => patch(field.key, next === "on")}
            />
          );
        if (field.type === "range")
          return (
            <RangeField
              key={field.key}
              label={label}
              value={Number(value)}
              min={field.min!}
              max={field.max!}
              step={field.step}
              defaultValue={Number(
                (component.props as unknown as Record<string, unknown>)[field.key],
              )}
              onChange={(next) => patch(field.key, next)}
            />
          );
        if (field.type === "choice")
          return (
            <SelectField
              key={field.key}
              label={label}
              value={String(value)}
              translateOptions={false}
              options={field.choices!.map((id) => ({
                id,
                label: tr(`components.option.${id}` as PlainMessageKey),
              }))}
              onChange={(next) => patch(field.key, next)}
            />
          );
        if (field.type === "color")
          return (
            <div key={field.key}>
              <ColorField
                label={label}
                value={String(value || (field.key === "trackColor" ? "#d0d0d0" : "#d95445"))}
                onChange={(next) => patch(field.key, next)}
              />
              <button
                type="button"
                className="studio-inline-action"
                onClick={() => patch(field.key, "")}
              >
                {tr("components.inheritColor")}
              </button>
            </div>
          );
        return (
          <label key={field.key} className="studio-text-field studio-text-field--single-line">
            <span>{label}</span>
            <input
              value={String(value ?? "")}
              maxLength={field.key === "defaultValue" ? 2000 : 500}
              spellCheck={false}
              onChange={(event) => patch(field.key, event.target.value)}
            />
          </label>
        );
      })}
      {component.kind === "progressbar" && values.tickMode === "custom" && (
        <ProgressTickEditor
          values={values.customTicks as number[]}
          onChange={(ticks) => patch("customTicks", ticks)}
        />
      )}
      {component.kind !== "button" && component.kind !== "badge" && (
        <div className="studio-unavailable-note">{tr("components.defaultHint")}</div>
      )}
      {(component.kind === "button" || component.kind === "badge") && (
        <div className="studio-unavailable-note">{tr("components.liveLabelHint")}</div>
      )}
    </Section>
  );
}
