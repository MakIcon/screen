import catalog from "./canvasUiCatalog.json";

export type CanvasUiValue = string | number | boolean | number[];
export type CanvasUiField = {
  key: string;
  label: string;
  help?: string;
  kind: string;
  default: CanvasUiValue;
  min?: number;
  max?: number;
  step?: number;
  choices?: (string | number)[];
};
export type CanvasUiEffect = {
  id: string;
  name: string;
  component: string;
  object: boolean;
  fields: CanvasUiField[];
};
export const CANVAS_UI_EFFECTS: readonly CanvasUiEffect[] = catalog;
export const CANVAS_UI_REPLAY_EVENT = "appearance-canvas-ui-replay";
export type CanvasUiSettings = {
  enabled: boolean;
  effect: string;
  opacity: number;
  settings: Record<string, Record<string, CanvasUiValue>>;
};

export function createDefaultCanvasUi(): CanvasUiSettings {
  return { enabled: false, effect: "liquid", opacity: 1, settings: {} };
}

export function canvasUiEffect(id: string) {
  return (
    CANVAS_UI_EFFECTS.find((effect) => effect.id === id) ??
    CANVAS_UI_EFFECTS.find((effect) => effect.id === "liquid")!
  );
}

export function canvasUiOptions(settings: CanvasUiSettings) {
  const effect = canvasUiEffect(settings.effect);
  return Object.fromEntries(
    effect.fields.map((field) => [
      field.key,
      settings.settings[effect.id]?.[field.key] ?? field.default,
    ]),
  );
}

export function canvasUiColorChannelMax(field: CanvasUiField) {
  return Array.isArray(field.default) && field.default.some((value) => value > 1) ? 2 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isCanvasUiAsset(value: string) {
  return (
    value.length <= 2_800_000 &&
    (value === "" ||
      /^https?:\/\//i.test(value) ||
      /^\/(?!\/)[a-z0-9_./%-]+$/i.test(value) ||
      /^data:(?:image\/(?:png|jpe?g|webp|gif|svg\+xml)|model\/(?:gltf-binary|gltf\+json)|application\/octet-stream);base64,[a-z0-9+/=\r\n]+$/i.test(
        value,
      ))
  );
}

function normalizeValue(value: unknown, field: CanvasUiField): CanvasUiValue | undefined {
  if (field.kind === "select")
    return field.choices?.includes(value as string | number)
      ? (value as string | number)
      : undefined;
  if (field.kind === "number")
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(field.min ?? 0, Math.min(field.max ?? 100, value))
      : undefined;
  if (field.kind === "boolean") return typeof value === "boolean" ? value : undefined;
  if (field.kind === "rgb-auto" && value === "auto") return value;
  if (["rgb", "rgb-auto", "vector", "glyphs"].includes(field.kind)) {
    const length =
      field.kind === "glyphs" ? 16 : Array.isArray(field.default) ? field.default.length : 3;
    if (
      !Array.isArray(value) ||
      value.length > length ||
      (field.kind !== "glyphs" && value.length !== length) ||
      value.some((n) => typeof n !== "number" || !Number.isFinite(n))
    )
      return undefined;
    return value.map((n: number) =>
      field.kind === "glyphs"
        ? Math.round(Math.max(0, Math.min(33554431, n)))
        : Math.max(0, Math.min(canvasUiColorChannelMax(field), n)),
    );
  }
  if (typeof value !== "string") return undefined;
  if (field.kind === "asset") return isCanvasUiAsset(value) ? value : undefined;
  if (field.kind === "color")
    return value === "" || value === "auto" || /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
  return value.slice(0, 256);
}

export function normalizeCanvasUi(value: unknown): CanvasUiSettings {
  const defaults = createDefaultCanvasUi();
  if (!isRecord(value)) return defaults;
  const settings: CanvasUiSettings["settings"] = {};
  if (isRecord(value.settings)) {
    for (const effect of CANVAS_UI_EFFECTS) {
      const raw = value.settings[effect.id];
      if (!isRecord(raw)) continue;
      const values: Record<string, CanvasUiValue> = {};
      for (const field of effect.fields) {
        const safe = normalizeValue(raw[field.key], field);
        if (safe !== undefined) values[field.key] = safe;
      }
      if (Object.keys(values).length) settings[effect.id] = values;
    }
  }
  const effectExists = CANVAS_UI_EFFECTS.some((effect) => effect.id === value.effect);
  return {
    enabled: effectExists && value.enabled === true,
    effect: effectExists ? (value.effect as string) : defaults.effect,
    opacity:
      typeof value.opacity === "number" && Number.isFinite(value.opacity)
        ? Math.max(0, Math.min(1, value.opacity))
        : 1,
    settings,
  };
}
