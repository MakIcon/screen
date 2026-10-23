import { useEffect, useMemo, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import {
  CANVAS_UI_EFFECTS,
  CANVAS_UI_REPLAY_EVENT,
  canvasUiEffect,
  canvasUiOptions,
  createDefaultCanvasUi,
  isCanvasUiAsset,
  type CanvasUiField,
  type CanvasUiSettings,
  type CanvasUiValue,
} from "./canvasUi";
import { useCanvasUiText } from "./canvasUiLocalization";
import { ColorField, RangeField, Section, SelectField } from "./StudioFields";
import "./CanvasUiPanel.css";

const GROUPS = [
  "All effects",
  "Fluid and motion",
  "Fire and energy",
  "Glass and optics",
  "Retro and glitch",
  "Particles and structure",
  "3D objects",
];
function groupFor(id: string) {
  if (id.endsWith("-object")) return "3D objects";
  if (["liquid", "ripple", "cloth", "droplets", "bubble", "displacement"].includes(id))
    return "Fluid and motion";
  if (["blaze", "flame-wrap", "force-field", "laser"].includes(id)) return "Fire and energy";
  if (["glass", "frost", "magnify", "bend", "peel", "clouds"].includes(id))
    return "Glass and optics";
  if (
    [
      "vhs",
      "glitch",
      "retro-dither",
      "asciify",
      "decrypt-reveal",
      "glyph-rain",
      "ascii-sweep",
    ].includes(id)
  )
    return "Retro and glitch";
  return "Particles and structure";
}

function rgbToHex(value: CanvasUiValue) {
  const rgb = Array.isArray(value) ? value : [1, 1, 1];
  return (
    "#" +
    rgb
      .map((n) =>
        Math.round(Math.min(1, Math.max(0, n)) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function hexToRgb(value: string) {
  return [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
}

function CanvasUiFieldEditor({
  field,
  value,
  onChange,
}: {
  field: CanvasUiField;
  value: CanvasUiValue;
  onChange: (value: CanvasUiValue) => void;
}) {
  const copy = useCanvasUiText();
  const [error, setError] = useState("");
  const label = copy(field.label);
  if (field.kind === "number")
    return (
      <RangeField
        label={label}
        value={Number(value)}
        min={field.min!}
        max={field.max!}
        step={field.step}
        defaultValue={Number(field.default)}
        onChange={onChange}
      />
    );
  if (field.kind === "boolean")
    return (
      <label className="canvas-ui-toggle">
        <span>{label}</span>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  if (field.kind === "select")
    return (
      <SelectField
        label={label}
        value={String(value)}
        translateOptions={false}
        options={field.choices!.map((choice) => ({
          id: String(choice),
          label: copy(String(choice)),
        }))}
        onChange={(choice) => onChange(field.choices!.find((entry) => String(entry) === choice)!)}
      />
    );
  if (["rgb", "rgb-auto", "color"].includes(field.kind)) {
    const rgb = field.kind !== "color";
    const automatic = value === "auto";
    const transparent = value === "";
    return (
      <div className="canvas-ui-color">
        <ColorField
          label={label}
          value={
            rgb
              ? rgbToHex(value)
              : /^#[0-9a-f]{6}$/i.test(String(value))
                ? String(value)
                : "#ffffff"
          }
          onChange={(hex) => onChange(rgb ? hexToRgb(hex) : hex)}
        />
        {(field.kind === "rgb-auto" || field.kind === "color") && (
          <SelectField
            label={copy("Color")}
            value={automatic ? "auto" : transparent ? "transparent" : "custom"}
            translateOptions={false}
            options={[
              { id: "custom", label: copy("Custom color") },
              ...(field.default === "auto" ? [{ id: "auto", label: copy("Automatic") }] : []),
              ...(field.kind === "color" && field.default === ""
                ? [{ id: "transparent", label: copy("Transparent") }]
                : []),
            ]}
            onChange={(mode) =>
              onChange(
                mode === "auto"
                  ? "auto"
                  : mode === "transparent"
                    ? ""
                    : rgb
                      ? [1, 1, 1]
                      : "#ffffff",
              )
            }
          />
        )}
      </div>
    );
  }
  if (field.kind === "asset")
    return (
      <div className="canvas-ui-asset">
        <span>{label}</span>
        <CommittedTextInput
          value={String(value)}
          label={copy("Asset URL")}
          valid={isCanvasUiAsset}
          onChange={onChange}
        />
        {String(value).startsWith("data:") && <small>{copy("Embedded asset")}</small>}
        <div className="canvas-ui-actions">
          <label className="canvas-ui-upload">
            {copy("Upload asset")}
            <input
              type="file"
              accept=".glb,.gltf,.svg,.png,.jpg,.jpeg,.webp,.gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (
                  file.size > 2_000_000 ||
                  !/\.(glb|gltf|svg|png|jpe?g|webp|gif)$/i.test(file.name)
                ) {
                  setError(copy("Asset must be an image, SVG or GLB up to 2 MB."));
                  return;
                }
                setError("");
                const reader = new FileReader();
                reader.onerror = () => setError(copy("Could not read this file."));
                reader.onload = () => {
                  const data = String(reader.result).replace(
                    /^data:[^;]*;/,
                    `data:${/\.glb$/i.test(file.name) ? "model/gltf-binary" : /\.gltf$/i.test(file.name) ? "model/gltf+json" : file.type || "application/octet-stream"};`,
                  );
                  onChange(data);
                };
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <button type="button" onClick={() => onChange("")}>
            {copy(field.key === "src" ? "Use launcher mark" : "Transparent")}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  if (field.kind === "glyphs")
    return <GlyphField field={field} value={value} onChange={onChange} />;
  return (
    <label className="canvas-ui-text">
      <span>{label}</span>
      <CommittedTextInput
        value={String(value)}
        label={label}
        valid={
          field.key === "targets"
            ? (selector) => {
                try {
                  document.querySelector(selector);
                  return true;
                } catch {
                  return false;
                }
              }
            : undefined
        }
        onChange={onChange}
      />
    </label>
  );
}

function CommittedTextInput({
  value,
  label,
  valid,
  onChange,
}: {
  value: string;
  label: string;
  valid?: (value: string) => boolean;
  onChange: (value: string) => void;
}) {
  const shown = value.startsWith("data:") ? "" : value;
  const [draft, setDraft] = useState(shown);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(shown);
  }, [shown]);
  const commit = () => {
    if (draft === shown) return;
    if (!valid || valid(draft)) onChange(draft);
    else setDraft(shown);
  };
  return (
    <input
      aria-label={label}
      placeholder={label}
      value={draft}
      maxLength={2048}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function GlyphField({
  field,
  value,
  onChange,
}: {
  field: CanvasUiField;
  value: CanvasUiValue;
  onChange: (value: CanvasUiValue) => void;
}) {
  const copy = useCanvasUiText();
  const encoded = Array.isArray(value) ? value.join(", ") : "";
  const [draft, setDraft] = useState(encoded);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(encoded);
  }, [encoded]);
  return (
    <label className="canvas-ui-text">
      <span>{copy(field.label)}</span>
      <input
        aria-label={copy("Custom glyphs")}
        value={draft}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          const numbers = event.target.value.split(",").map((n) => Number(n.trim()));
          if (!event.target.value.trim()) onChange([]);
          else if (
            numbers.length <= 16 &&
            numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 33554431)
          )
            onChange(numbers);
        }}
        onBlur={() => {
          focused.current = false;
          setDraft(encoded);
        }}
      />
      <small>{copy("Up to 16 comma-separated 25-bit glyph numbers.")}</small>
    </label>
  );
}

export function CanvasUiPanel({
  settings,
  onChange,
  elementScope = false,
  onReset,
  replayTargetIds,
}: {
  settings: CanvasUiSettings;
  onChange: (settings: CanvasUiSettings) => void;
  elementScope?: boolean;
  onReset?: () => void;
  replayTargetIds?: string[];
}) {
  const copy = useCanvasUiText();
  const [search, setSearch] = useState("");
  const [parameterSearch, setParameterSearch] = useState("");
  const [group, setGroup] = useState(GROUPS[0]);
  const effect = canvasUiEffect(settings.effect);
  const options = useMemo(() => canvasUiOptions(settings), [settings]);
  const filtered = CANVAS_UI_EFFECTS.filter(
    (item) =>
      (group === GROUPS[0] || groupFor(item.id) === group) &&
      `${item.name} ${copy(groupFor(item.id))} ${item.id}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  const fields = effect.fields.filter((field) =>
    `${field.key} ${field.label} ${copy(field.label)}`
      .toLowerCase()
      .includes(parameterSearch.toLowerCase().trim()),
  );
  const setOption = (key: string, value: CanvasUiValue) =>
    onChange({
      ...settings,
      settings: {
        ...settings.settings,
        [effect.id]: { ...settings.settings[effect.id], [key]: value },
      },
    });
  return (
    <div className="canvas-ui-panel">
      <label className="studio-master-toggle">
        <div>
          <strong>{copy("ENABLE CANVAS UI")}</strong>
          <span>
            {copy(
              elementScope
                ? "Apply the selected effect inside the picked elements."
                : "Apply the selected effect to the launcher.",
            )}
          </span>
        </div>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => onChange({ ...settings, enabled: event.target.checked })}
        />
      </label>
      <p className="canvas-ui-note">
        {copy(
          elementScope
            ? "Each picked element keeps its own effect and settings. Click an effect to apply it inside the selection."
            : "Choose Pick Element above to create an effect inside a button, card or text. Global Style edits the whole launcher.",
        )}
      </p>
      <Section
        title={copy("EFFECT LIBRARY")}
        note={copy(
          "Choose an effect, then adjust its parameters below. Each effect keeps its own settings.",
        )}
      >
        <input
          className="canvas-ui-search"
          type="search"
          aria-label={copy("Search 35 effects…")}
          placeholder={copy("Search 35 effects…")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={copy("EFFECT LIBRARY")}
          value={group}
          options={GROUPS.map((id) => ({ id, label: copy(id) }))}
          translateOptions={false}
          onChange={setGroup}
        />
        <div className="canvas-ui-library">
          {filtered.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={settings.effect === item.id}
              className={settings.effect === item.id ? "active" : ""}
              onClick={() => {
                setParameterSearch("");
                onChange({ ...settings, effect: item.id, enabled: true });
              }}
            >
              <strong>{item.name}</strong>
              <small>{copy(groupFor(item.id))}</small>
            </button>
          ))}
        </div>
        {!filtered.length && <p className="canvas-ui-note">{copy("No matching effects")}</p>}
      </Section>
      <Section title={`${effect.name} · ${copy("EFFECT SETTINGS")}`}>
        <div className="canvas-ui-actions">
          <button
            type="button"
            onClick={() => {
              const payload = replayTargetIds ? { targetIds: replayTargetIds } : null;
              window.dispatchEvent(new CustomEvent(CANVAS_UI_REPLAY_EVENT, { detail: payload }));
              void emit(CANVAS_UI_REPLAY_EVENT, payload).catch(() => {});
            }}
          >
            {copy("Replay effect")}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = { ...settings.settings };
              delete next[effect.id];
              onChange({ ...settings, settings: next });
            }}
          >
            {copy("Reset effect")}
          </button>
        </div>
        <RangeField
          label={copy("Output opacity")}
          value={settings.opacity}
          min={0}
          max={1}
          step={0.01}
          defaultValue={1}
          onChange={(opacity) => onChange({ ...settings, opacity })}
        />
        <input
          className="canvas-ui-search"
          type="search"
          aria-label={copy("Search parameters…")}
          placeholder={copy("Search parameters…")}
          value={parameterSearch}
          onChange={(event) => setParameterSearch(event.target.value)}
        />
        <div className="canvas-ui-fields">
          {fields.map((field) => (
            <div
              key={`${effect.id}-${field.key}`}
              className="canvas-ui-field"
              data-canvas-ui-option={field.key}
              title={field.help ? `${field.key}: ${field.help}` : field.key}
            >
              <CanvasUiFieldEditor
                field={field}
                value={options[field.key]}
                onChange={(value) => setOption(field.key, value)}
              />
            </div>
          ))}
        </div>
        {!fields.length && <p className="canvas-ui-note">{copy("No matching parameters")}</p>}
      </Section>
      <button
        className="canvas-ui-reset"
        type="button"
        onClick={() => (onReset ? onReset() : onChange(createDefaultCanvasUi()))}
      >
        {copy(elementScope ? "Remove element effect" : "Reset all effects")}
      </button>
    </div>
  );
}
