import { ElementBackgroundPicker } from "./ElementBackgroundPicker";
import type { AppearanceElementOverride } from "./types";

type ElementStyle = AppearanceElementOverride["style"];

type ElementTextColorPickerProps = {
  style?: ElementStyle;
  fallbackColor: string;
  fallbackAccent: string;
  onChange: (style: Partial<ElementStyle>) => void;
};

function asBackgroundStyle(style: ElementStyle | undefined): ElementStyle | undefined {
  if (!style) return undefined;
  return {
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
    backgroundGradientAnimation: style.textGradientAnimation,
    backgroundGradientAnimationDuration: style.textGradientAnimationDuration,
    backgroundGradientAnimationDirection: style.textGradientAnimationDirection,
    backgroundGradientAnimationEasing: style.textGradientAnimationEasing,
    backgroundGradientAnimationStartX: style.textGradientAnimationStartX,
    backgroundGradientAnimationStartY: style.textGradientAnimationStartY,
    backgroundGradientAnimationEndX: style.textGradientAnimationEndX,
    backgroundGradientAnimationEndY: style.textGradientAnimationEndY,
    backgroundGradientAnimationScale: style.textGradientAnimationScale,
    backgroundGradientAnimationHue: style.textGradientAnimationHue,
    backgroundGradientAnimationSaturation: style.textGradientAnimationSaturation,
    backgroundGradientAnimationBrightness: style.textGradientAnimationBrightness,
  };
}

function asTextStyle(patch: Partial<ElementStyle>): Partial<ElementStyle> {
  const next: Partial<ElementStyle> = {};
  if ("backgroundKind" in patch) next.textKind = patch.backgroundKind;
  if ("backgroundColor" in patch) next.textColor = patch.backgroundColor;
  if ("backgroundGradientStart" in patch) {
    next.textGradientStart = patch.backgroundGradientStart;
  }
  if ("backgroundGradientEnd" in patch) next.textGradientEnd = patch.backgroundGradientEnd;
  if ("backgroundGradientAngle" in patch) next.textGradientAngle = patch.backgroundGradientAngle;
  if ("backgroundGradientType" in patch) next.textGradientType = patch.backgroundGradientType;
  if ("backgroundGradientStops" in patch) next.textGradientStops = patch.backgroundGradientStops;
  if ("backgroundGradientCenterX" in patch) {
    next.textGradientCenterX = patch.backgroundGradientCenterX;
  }
  if ("backgroundGradientCenterY" in patch) {
    next.textGradientCenterY = patch.backgroundGradientCenterY;
  }
  if ("backgroundGradientScale" in patch) next.textGradientScale = patch.backgroundGradientScale;
  if ("backgroundGradientRadialShape" in patch) {
    next.textGradientRadialShape = patch.backgroundGradientRadialShape;
  }
  if ("backgroundGradientRadialAspect" in patch) {
    next.textGradientRadialAspect = patch.backgroundGradientRadialAspect;
  }
  if ("backgroundGradientStrength" in patch) {
    next.textGradientStrength = patch.backgroundGradientStrength;
  }
  if ("backgroundGradientMidpoint" in patch) {
    next.textGradientMidpoint = patch.backgroundGradientMidpoint;
  }
  if ("backgroundGradientSoftness" in patch) {
    next.textGradientSoftness = patch.backgroundGradientSoftness;
  }
  if ("backgroundGradientAnimation" in patch) {
    next.textGradientAnimation = patch.backgroundGradientAnimation;
  }
  if ("backgroundGradientAnimationDuration" in patch) {
    next.textGradientAnimationDuration = patch.backgroundGradientAnimationDuration;
  }
  if ("backgroundGradientAnimationDirection" in patch) {
    next.textGradientAnimationDirection = patch.backgroundGradientAnimationDirection;
  }
  if ("backgroundGradientAnimationEasing" in patch) {
    next.textGradientAnimationEasing = patch.backgroundGradientAnimationEasing;
  }
  if ("backgroundGradientAnimationStartX" in patch) {
    next.textGradientAnimationStartX = patch.backgroundGradientAnimationStartX;
  }
  if ("backgroundGradientAnimationStartY" in patch) {
    next.textGradientAnimationStartY = patch.backgroundGradientAnimationStartY;
  }
  if ("backgroundGradientAnimationEndX" in patch) {
    next.textGradientAnimationEndX = patch.backgroundGradientAnimationEndX;
  }
  if ("backgroundGradientAnimationEndY" in patch) {
    next.textGradientAnimationEndY = patch.backgroundGradientAnimationEndY;
  }
  if ("backgroundGradientAnimationScale" in patch) {
    next.textGradientAnimationScale = patch.backgroundGradientAnimationScale;
  }
  if ("backgroundGradientAnimationHue" in patch) {
    next.textGradientAnimationHue = patch.backgroundGradientAnimationHue;
  }
  if ("backgroundGradientAnimationSaturation" in patch) {
    next.textGradientAnimationSaturation = patch.backgroundGradientAnimationSaturation;
  }
  if ("backgroundGradientAnimationBrightness" in patch) {
    next.textGradientAnimationBrightness = patch.backgroundGradientAnimationBrightness;
  }
  return next;
}

export function ElementTextColorPicker({
  style,
  fallbackColor,
  fallbackAccent,
  onChange,
}: ElementTextColorPickerProps) {
  return (
    <ElementBackgroundPicker
      style={asBackgroundStyle(style)}
      fallbackColor={fallbackColor}
      fallbackAccent={fallbackAccent}
      title="TEXT"
      colorLabel="Text color"
      previewMode="text"
      onChange={(patch) => onChange(asTextStyle(patch))}
    />
  );
}
