import type {
  AppearanceElementGradientStop,
  AppearanceElementGradientType,
  AppearanceElementStyle,
} from "./types";

export type GradientPreset = {
  id: string;
  name: string;
  detail: string;
  type: AppearanceElementGradientType;
  angle: number;
  stops: AppearanceElementGradientStop[];
  midpoint: number;
  softness: number;
};

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: "aurora",
    name: "AURORA",
    detail: "COOL LIGHT",
    type: "linear",
    angle: 125,
    stops: [
      { color: "#142d56", position: 0 },
      { color: "#3389ab", position: 35 },
      { color: "#6ed9c6", position: 68 },
      { color: "#e6c6ff", position: 100 },
    ],
    midpoint: 0.48,
    softness: 0.85,
  },
  {
    id: "golden-hour",
    name: "GOLDEN HOUR",
    detail: "WARM GLOW",
    type: "linear",
    angle: 105,
    stops: [
      { color: "#582a24", position: 0 },
      { color: "#c96342", position: 36 },
      { color: "#f5b66a", position: 70 },
      { color: "#fff0c4", position: 100 },
    ],
    midpoint: 0.54,
    softness: 0.78,
  },
  {
    id: "lagoon",
    name: "LAGOON",
    detail: "DEEP WATER",
    type: "radial",
    angle: 135,
    stops: [
      { color: "#baf3e7", position: 0 },
      { color: "#43aeb8", position: 42 },
      { color: "#17436d", position: 100 },
    ],
    midpoint: 0.5,
    softness: 0.88,
  },
  {
    id: "prism",
    name: "PRISM",
    detail: "VIVID COLOR",
    type: "linear",
    angle: 90,
    stops: [
      { color: "#49377e", position: 0 },
      { color: "#a262c8", position: 35 },
      { color: "#ee8ab8", position: 68 },
      { color: "#ffd2aa", position: 100 },
    ],
    midpoint: 0.5,
    softness: 0.9,
  },
  {
    id: "evergreen",
    name: "EVERGREEN",
    detail: "BOTANICAL",
    type: "linear",
    angle: 130,
    stops: [
      { color: "#173d3b", position: 0 },
      { color: "#33836d", position: 48 },
      { color: "#b6e3ae", position: 100 },
    ],
    midpoint: 0.48,
    softness: 0.82,
  },
  {
    id: "graphite",
    name: "GRAPHITE",
    detail: "SOFT METAL",
    type: "linear",
    angle: 120,
    stops: [
      { color: "#1c2534", position: 0 },
      { color: "#677e91", position: 52 },
      { color: "#e2eaf0", position: 100 },
    ],
    midpoint: 0.46,
    softness: 0.9,
  },
];

export function gradientPresetStyle(preset: GradientPreset): Partial<AppearanceElementStyle> {
  return {
    backgroundKind: "gradient",
    backgroundGradientType: preset.type,
    backgroundGradientAngle: preset.angle,
    backgroundGradientStops: preset.stops.map((stop) => ({ ...stop })),
    backgroundGradientStart: preset.stops[0].color,
    backgroundGradientEnd: preset.stops[preset.stops.length - 1].color,
    backgroundGradientCenterX: 50,
    backgroundGradientCenterY: 50,
    backgroundGradientScale: 100,
    backgroundGradientRadialShape: "circle",
    backgroundGradientRadialAspect: 1,
    backgroundGradientStrength: 1,
    backgroundGradientMidpoint: preset.midpoint,
    backgroundGradientSoftness: preset.softness,
  };
}

export function isGradientPresetActive(
  style: AppearanceElementStyle | undefined,
  preset: GradientPreset,
) {
  const stops = style?.backgroundGradientStops;
  return (
    style?.backgroundKind === "gradient" &&
    style.backgroundGradientType === preset.type &&
    style.backgroundGradientAngle === preset.angle &&
    style.backgroundGradientMidpoint === preset.midpoint &&
    style.backgroundGradientSoftness === preset.softness &&
    stops?.length === preset.stops.length &&
    stops.every(
      (stop, index) =>
        stop.position === preset.stops[index].position &&
        stop.color.toLowerCase() === preset.stops[index].color,
    )
  );
}
