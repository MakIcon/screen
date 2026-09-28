import type { AppearanceElementGradientStop, AppearanceElementOverride } from "./types";

type BackgroundStyle = AppearanceElementOverride["style"];

export const DEFAULT_GRADIENT_ANGLE = 135;
export const DEFAULT_GRADIENT_CENTER = 50;
export const DEFAULT_GRADIENT_SCALE = 100;
export const DEFAULT_GRADIENT_RADIAL_ASPECT = 1;
export const DEFAULT_GRADIENT_STRENGTH = 1;
export const DEFAULT_GRADIENT_MIDPOINT = 0.5;
export const DEFAULT_GRADIENT_SOFTNESS = 0.72;
export const MAX_GRADIENT_STOPS = 8;

const GRADIENT_COLOR_SPACE = "oklab";
const CURVE_SAMPLE_TOLERANCE = 0.006;
const MAX_CURVE_SUBDIVISIONS = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number) {
  return String(Math.round(value * 100) / 100);
}

function opacityPercentage(opacity: number) {
  return Math.round(clamp(opacity, 0, 1) * 10_000) / 100;
}

function colorWithOpacity(color: string, opacity: number) {
  if (opacity >= 0.9999) return color;
  return `color-mix(in ${GRADIENT_COLOR_SPACE}, ${color} ${opacityPercentage(opacity)}%, transparent)`;
}

function colorWithStrength(color: string, baseColor: string, strength: number) {
  if (strength >= 0.9999) return color;
  if (strength <= 0.0001) return baseColor;
  return `color-mix(in ${GRADIENT_COLOR_SPACE}, ${color} ${opacityPercentage(strength)}%, ${baseColor})`;
}

export function resolveElementGradientStops(
  style: BackgroundStyle | undefined,
  fallbackStart: string,
  fallbackEnd: string,
): AppearanceElementGradientStop[] {
  const savedStops = style?.backgroundGradientStops;
  if (savedStops && savedStops.length >= 2) {
    return savedStops
      .slice(0, MAX_GRADIENT_STOPS)
      .map((stop) => ({ ...stop, position: clamp(stop.position, 0, 100) }));
  }

  return [
    { color: style?.backgroundGradientStart ?? fallbackStart, position: 0 },
    { color: style?.backgroundGradientEnd ?? fallbackEnd, position: 100 },
  ];
}

/**
 * Maps a spatial position to color progress. A midpoint shifts the 50% color
 * blend, while softness changes the shoulder from linear to a tighter S-curve.
 * The odds curve stays continuously differentiable when the midpoint moves,
 * avoiding the visible seam produced by two joined power curves.
 */
export function gradientCurveValue(
  progress: number,
  midpoint = DEFAULT_GRADIENT_MIDPOINT,
  softness = DEFAULT_GRADIENT_SOFTNESS,
) {
  const x = clamp(progress, 0, 1);
  const center = clamp(midpoint, 0.05, 0.95);
  const exponent = 1 + (1 - clamp(softness, 0, 1)) * 3.5;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const odds = (x / (1 - x)) * ((1 - center) / center);
  const curvedOdds = Math.pow(odds, exponent);
  return curvedOdds / (1 + curvedOdds);
}

/** Approximate a shaped color blend only where its curvature needs extra stops. */
export function sampleGradientCurve(
  midpoint = DEFAULT_GRADIENT_MIDPOINT,
  softness = DEFAULT_GRADIENT_SOFTNESS,
) {
  const points = [{ position: 0, blend: 0 }];
  if (Math.abs(midpoint - 0.5) < 0.0001 && softness >= 0.9999) {
    points.push({ position: 1, blend: 1 });
    return points;
  }

  const sample = (
    start: number,
    startBlend: number,
    end: number,
    endBlend: number,
    depth: number,
  ) => {
    const span = end - start;
    const blendSpan = endBlend - startBlend;
    const error = [0.25, 0.5, 0.75].reduce((largest, fraction) => {
      const actual = gradientCurveValue(start + span * fraction, midpoint, softness);
      return Math.max(largest, Math.abs(actual - (startBlend + blendSpan * fraction)));
    }, 0);
    if (error > CURVE_SAMPLE_TOLERANCE && depth < MAX_CURVE_SUBDIVISIONS) {
      const center = (start + end) / 2;
      const centerBlend = gradientCurveValue(center, midpoint, softness);
      sample(start, startBlend, center, centerBlend, depth + 1);
      sample(center, centerBlend, end, endBlend, depth + 1);
      return;
    }
    points.push({ position: end, blend: endBlend });
  };

  sample(0, 0, 1, 1, 0);
  return points;
}

function sampledGradientStops(
  stops: AppearanceElementGradientStop[],
  midpoint: number,
  softness: number,
  strength: number,
  opacity: number,
  baseColor: string,
  positionScale = 1,
) {
  const result: string[] = [];
  const applyColor = (color: string) =>
    colorWithOpacity(colorWithStrength(color, baseColor, strength), opacity);

  const curvePoints = sampleGradientCurve(midpoint, softness);
  if (curvePoints.length === 2) {
    if (
      positionScale === 1 &&
      stops.length === 2 &&
      stops[0].position === 0 &&
      stops[1].position === 100
    ) {
      return stops.map((stop) => applyColor(stop.color)).join(", ");
    }
    return stops
      .map((stop) => `${applyColor(stop.color)} ${formatNumber(stop.position * positionScale)}%`)
      .join(", ");
  }

  stops.forEach((left, index) => {
    if (index === stops.length - 1) {
      result.push(`${applyColor(left.color)} ${formatNumber(left.position * positionScale)}%`);
      return;
    }

    const right = stops[index + 1];
    const span = right.position - left.position;
    result.push(`${applyColor(left.color)} ${formatNumber(left.position * positionScale)}%`);
    if (span <= 0.01) return;

    for (let sample = 1; sample < curvePoints.length - 1; sample += 1) {
      const spatialProgress = curvePoints[sample].position;
      const colorProgress = curvePoints[sample].blend;
      const mixedColor = `color-mix(in ${GRADIENT_COLOR_SPACE}, ${right.color} ${formatNumber(
        colorProgress * 100,
      )}%, ${left.color})`;
      const position = left.position + span * spatialProgress;
      result.push(`${applyColor(mixedColor)} ${formatNumber(position * positionScale)}%`);
    }
  });

  return result.join(", ");
}

export function buildElementGradientImage(
  style: BackgroundStyle | undefined,
  fallbackStart: string,
  fallbackEnd: string,
  options?: { baseColor?: string; opacity?: number },
) {
  const stops = resolveElementGradientStops(style, fallbackStart, fallbackEnd).sort(
    (left, right) => left.position - right.position,
  );
  const type = style?.backgroundGradientType ?? "linear";
  const angle = clamp(style?.backgroundGradientAngle ?? DEFAULT_GRADIENT_ANGLE, 0, 360);
  const centerX = clamp(style?.backgroundGradientCenterX ?? DEFAULT_GRADIENT_CENTER, 0, 100);
  const centerY = clamp(style?.backgroundGradientCenterY ?? DEFAULT_GRADIENT_CENTER, 0, 100);
  const scale = clamp(style?.backgroundGradientScale ?? DEFAULT_GRADIENT_SCALE, 10, 200);
  const radialShape = style?.backgroundGradientRadialShape ?? "circle";
  const radialAspect = clamp(
    style?.backgroundGradientRadialAspect ?? DEFAULT_GRADIENT_RADIAL_ASPECT,
    0.25,
    2,
  );
  const strength = clamp(style?.backgroundGradientStrength ?? DEFAULT_GRADIENT_STRENGTH, 0, 1);
  const midpoint = clamp(
    style?.backgroundGradientMidpoint ?? DEFAULT_GRADIENT_MIDPOINT,
    0.05,
    0.95,
  );
  const softness = clamp(style?.backgroundGradientSoftness ?? DEFAULT_GRADIENT_SOFTNESS, 0, 1);
  const opacity = clamp(options?.opacity ?? style?.backgroundOpacity ?? 1, 0, 1);
  const baseColor = options?.baseColor ?? style?.backgroundColor ?? fallbackStart;
  const positionScale = type === "radial" && radialShape === "circle" ? scale / 100 : 1;
  const colorStops = sampledGradientStops(
    stops,
    midpoint,
    softness,
    strength,
    opacity,
    baseColor,
    positionScale,
  );

  if (type === "radial") {
    if (radialShape === "circle") {
      return `radial-gradient(circle at ${formatNumber(centerX)}% ${formatNumber(
        centerY,
      )}% in ${GRADIENT_COLOR_SPACE}, ${colorStops})`;
    }
    return `radial-gradient(ellipse ${formatNumber(scale)}% ${formatNumber(
      scale * radialAspect,
    )}% at ${formatNumber(centerX)}% ${formatNumber(
      centerY,
    )}% in ${GRADIENT_COLOR_SPACE}, ${colorStops})`;
  }
  if (type === "conic") {
    return `conic-gradient(from ${formatNumber(angle)}deg at ${formatNumber(
      centerX,
    )}% ${formatNumber(centerY)}% in ${GRADIENT_COLOR_SPACE}, ${colorStops})`;
  }
  return `linear-gradient(${formatNumber(angle)}deg in ${GRADIENT_COLOR_SPACE}, ${colorStops})`;
}

export function buildElementTextGradientImage(
  style: BackgroundStyle | undefined,
  fallbackStart: string,
  fallbackEnd: string,
  options?: { baseColor?: string; opacity?: number },
) {
  const textAsBackground: BackgroundStyle | undefined = style
    ? {
        backgroundKind: style.textKind,
        backgroundColor: style.textColor,
        backgroundGradientStart: style.textGradientStart,
        backgroundGradientEnd: style.textGradientEnd,
        backgroundGradientAngle: style.textGradientAngle,
        backgroundGradientType: style.textGradientType,
        backgroundGradientStops: style.textGradientStops,
        backgroundGradientCenterX: style.textGradientCenterX,
        backgroundGradientCenterY: style.textGradientCenterY,
        backgroundGradientScale: style.textGradientScale,
        backgroundGradientRadialShape: style.textGradientRadialShape,
        backgroundGradientRadialAspect: style.textGradientRadialAspect,
        backgroundGradientStrength: style.textGradientStrength,
        backgroundGradientMidpoint: style.textGradientMidpoint,
        backgroundGradientSoftness: style.textGradientSoftness,
      }
    : undefined;
  return buildElementGradientImage(textAsBackground, fallbackStart, fallbackEnd, options);
}

function hexToOklab(color: string) {
  const raw = color.replace("#", "");
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((channel) => channel.repeat(2))
          .join("")
      : raw;
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
  );
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToHex(lightness: number, a: number, b: number) {
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const linearChannels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${linearChannels
    .map((channel) => {
      const srgb =
        channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
      return Math.round(clamp(srgb, 0, 1) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

export function interpolateGradientStopColor(
  left: AppearanceElementGradientStop,
  right: AppearanceElementGradientStop,
  position: number,
  midpoint = DEFAULT_GRADIENT_MIDPOINT,
  softness = 1,
) {
  const leftOklab = hexToOklab(left.color);
  const rightOklab = hexToOklab(right.color);
  const span = Math.max(0.0001, right.position - left.position);
  const progress = gradientCurveValue(
    clamp((position - left.position) / span, 0, 1),
    midpoint,
    softness,
  );
  return oklabToHex(
    leftOklab.lightness + (rightOklab.lightness - leftOklab.lightness) * progress,
    leftOklab.a + (rightOklab.a - leftOklab.a) * progress,
    leftOklab.b + (rightOklab.b - leftOklab.b) * progress,
  );
}
