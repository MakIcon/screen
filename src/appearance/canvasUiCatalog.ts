import type { CanvasUiEffectId, CanvasUiEffectSettings, CanvasUiSettingValue } from "./types";

export type CanvasUiEffectCategory = "surface" | "motion" | "atmosphere" | "retro" | "object";
export type CanvasUiControlGroup = "motion" | "material" | "detail" | "color" | "behavior";

type ControlBase = { key: string; label: string; group: CanvasUiControlGroup; hint?: string };
export type CanvasUiRangeControl = ControlBase & {
  kind: "range";
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
};
export type CanvasUiToggleControl = ControlBase & { kind: "toggle"; defaultValue: boolean };
export type CanvasUiSelectControl = ControlBase & {
  kind: "select";
  defaultValue: string;
  options: readonly { id: string; label: string }[];
};
export type CanvasUiColorControl = ControlBase & {
  kind: "color";
  defaultValue: string;
  colorMode: "rgb" | "css";
};
export type CanvasUiControl =
  | CanvasUiRangeControl
  | CanvasUiToggleControl
  | CanvasUiSelectControl
  | CanvasUiColorControl;

export type CanvasUiEffectDefinition = {
  id: CanvasUiEffectId;
  name: string;
  category: CanvasUiEffectCategory;
  description: string;
  interaction: string;
  objectEffect?: boolean;
  controls: readonly CanvasUiControl[];
};

const r = (
  key: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  step: number,
  group: CanvasUiControlGroup = "detail",
  suffix?: string,
  hint?: string,
): CanvasUiRangeControl => ({
  kind: "range",
  key,
  label,
  defaultValue,
  min,
  max,
  step,
  group,
  suffix,
  hint,
});

const t = (key: string, label: string, defaultValue: boolean): CanvasUiToggleControl => ({
  kind: "toggle",
  key,
  label,
  defaultValue,
  group: "behavior",
});

const s = (
  key: string,
  label: string,
  defaultValue: string,
  options: readonly string[],
): CanvasUiSelectControl => ({
  kind: "select",
  key,
  label,
  defaultValue,
  options: options.map((id) => ({ id, label: id.replace(/-/g, " ").toUpperCase() })),
  group: "behavior",
});

const c = (
  key: string,
  label: string,
  defaultValue: string,
  colorMode: "rgb" | "css" = "rgb",
): CanvasUiColorControl => ({
  kind: "color",
  key,
  label,
  defaultValue,
  colorMode,
  group: "color",
});

const objectScene = (): readonly CanvasUiControl[] => [
  r("scale", "OBJECT SCALE", 3, 0.5, 6, 0.1, "material"),
  r("xOffset", "X OFFSET", 0, -3, 3, 0.05, "material"),
  r("yOffset", "Y OFFSET", 0, -3, 3, 0.05, "material"),
  r("floatIntensity", "FLOAT", 1.5, 0, 4, 0.05, "motion"),
  r("floatSpeed", "FLOAT SPEED", 2, 0, 5, 0.05, "motion"),
  t("orbit", "DRAG TO ORBIT", true),
  t("autoRotate", "AUTO ROTATE", false),
  r("autoRotateSpeed", "ROTATE SPEED", 2, -5, 5, 0.1, "motion"),
  r("cameraDistance", "CAMERA DISTANCE", 4.1, 1.5, 10, 0.1, "material"),
];

const controls: Record<CanvasUiEffectId, readonly CanvasUiControl[]> = {
  liquid: [
    r("densityDissipation", "TRAIL PERSISTENCE", 0.96, 0.8, 1, 0.005, "motion"),
    r("curl", "CURL", 1.9, 0, 10, 0.1, "motion"),
    r("radius", "BRUSH RADIUS", 0.3, 0.01, 1, 0.01, "motion"),
    r("force", "POINTER FORCE", 1.1, 0, 5, 0.05, "motion"),
    r("intensity", "COLOR INTENSITY", 2, 0, 8, 0.1, "material"),
    r("distortion", "DISTORTION", 0.4, 0, 3, 0.05, "material"),
    r("blend", "COLOR BLEND", 5, 0, 12, 0.1, "material"),
    c("color", "FLUID COLOR", "#253ddf"),
    t("rainbow", "RAINBOW FLOW", false),
  ],
  ripple: [
    r("amplitude", "WAVE HEIGHT", 0.35, 0, 3, 0.05, "motion"),
    r("speed", "WAVE SPEED", 0.65, 0.1, 3, 0.05, "motion"),
    r("wavelength", "WAVELENGTH", 80, 20, 240, 1, "motion", "PX"),
    r("rings", "RINGS", 3, 1, 8, 1),
    r("refraction", "REFRACTION", 24, 0, 240, 1, "material", "PX"),
    r("dispersion", "DISPERSION", 0.15, 0, 1, 0.01, "color"),
    r("shine", "CREST SHINE", 0.25, 0, 2, 0.05, "material"),
    s("trigger", "TRIGGER", "hover", ["click", "hover", "none"]),
    r("interval", "AMBIENT INTERVAL", 2.5, 0, 12, 0.1, "behavior", "S"),
  ],
  bubble: [
    r("size", "DROPLET RADIUS", 42, 8, 180, 1, "motion", "PX"),
    r("trail", "TRAIL SPHERES", 18, 1, 24, 1, "motion"),
    r("follow", "FOLLOW", 0.5, 0, 1, 0.01, "motion"),
    r("blend", "METABALL BLEND", 14, 1, 30, 0.5, "material"),
    r("refraction", "REFRACTION", 80, 0, 220, 1, "material"),
    r("dispersion", "DISPERSION", 1, 0, 3, 0.05, "color"),
    r("frost", "FROST", 0, 0, 1, 0.01, "material"),
    r("shine", "SHINE", 0.25, 0, 1, 0.01, "material"),
    r("rim", "RIM", 0.5, 0, 2, 0.05, "material"),
    r("intensity", "VISIBILITY", 0.9, 0, 2, 0.05, "material"),
    c("tint", "GLASS TINT", "#ffffff"),
    r("tintStrength", "TINT STRENGTH", 0, 0, 1, 0.01, "color"),
  ],
  glass: [
    s("shape", "LENS SHAPE", "circle", ["circle", "rounded", "square"]),
    r("size", "LENS SIZE", 120, 30, 320, 1, "motion", "PX"),
    r("aspect", "ASPECT", 1.7, 0.5, 3, 0.05, "material"),
    r("corner", "CORNER", 32, 0, 120, 1, "material", "PX"),
    r("ior", "REFRACTION INDEX", 1.5, 1, 2.5, 0.01, "material"),
    r("edge", "EDGE", 0.7, 0, 2, 0.05, "material"),
    r("depth", "DEPTH", 250, 0, 600, 5, "material"),
    r("aberration", "ABERRATION", 1, 0, 4, 0.05, "color"),
    r("blur", "BLUR", 0, 0, 30, 0.5, "material", "PX"),
    r("zoom", "ZOOM", 1.5, 1, 4, 0.05, "material"),
    r("follow", "FOLLOW", 0.2, 0, 1, 0.01, "motion"),
  ],
  frost: [
    r("frost", "FROST GRAIN", 0.08, 0, 1, 0.01, "material"),
    r("strength", "ICE STRENGTH", 0.8, 0, 1, 0.01, "material"),
    r("contrast", "ICE CONTRAST", 3, 0, 8, 0.1, "material"),
    r("haze", "HAZE", 0.5, 0, 2, 0.05, "material"),
    r("saturation", "SATURATION", 1.2, 0, 2, 0.05, "color"),
    r("refraction", "REFRACTION", 1, 0, 4, 0.05, "material"),
    r("meltRadius", "MELT RADIUS", 0.25, 0.02, 1, 0.01, "motion"),
    r("meltStrength", "MELT STRENGTH", 0.75, 0, 1, 0.01, "motion"),
    r("refreeze", "REFREEZE SPEED", 2, 0, 8, 0.1, "motion"),
    r("opacity", "ICE OPACITY", 0.72, 0, 1, 0.01, "material"),
  ],
  droplets: [
    r("intensity", "RAIN INTENSITY", 0.65, 0, 1, 0.01, "material"),
    r("speed", "ANIMATION SPEED", 1, 0, 4, 0.05, "motion"),
    r("scale", "DROP SCALE", 0.4, 0.1, 2, 0.05),
    r("dropWidth", "DROP WIDTH", 1, 0.2, 3, 0.05),
    r("dropLength", "DROP LENGTH", 1, 0.2, 3, 0.05),
    r("refraction", "REFRACTION", 0.2, 0, 2, 0.05, "material"),
    r("fallSpeed", "FALL SPEED", 1, 0, 4, 0.05, "motion"),
    r("staticDrops", "STATIC DROPS", 0.2, 0, 1, 0.01),
    t("interactive", "POINTER INTERACTION", true),
    c("tint", "WATER TINT", "#ffffff"),
  ],
  clouds: [
    r("scale", "CLOUD SCALE", 1, 0.2, 4, 0.05),
    r("speed", "DRIFT SPEED", 0.6, 0, 3, 0.05, "motion"),
    r("cover", "COVERAGE", 0.1, 0, 1, 0.01, "material"),
    r("density", "DENSITY", 2.5, 0, 6, 0.05, "material"),
    r("opacity", "OPACITY", 0.64, 0, 1, 0.01, "material"),
    r("wind", "POINTER WIND", 0.6, 0, 2, 0.05, "motion"),
    r("windRadius", "WIND RADIUS", 350, 40, 900, 10, "motion", "PX"),
    r("refraction", "REFRACTION", 0, 0, 2, 0.05, "material"),
    r("fogBlur", "FOG BLUR", 0, 0, 20, 0.5, "material", "PX"),
  ],
  blaze: [
    r("height", "BLAZE HEIGHT", 0.97, 0.1, 1, 0.01, "material"),
    r("distortion", "HEAT DISTORTION", 0.8, 0, 3, 0.05, "material"),
    r("speed", "ANIMATION SPEED", 1, 0, 4, 0.05, "motion"),
    r("sparks", "SPARKS", 0.7, 0, 3, 0.05, "material"),
    r("sparkDensity", "SPARK DENSITY", 1.5, 0.1, 4, 0.05),
    r("layers", "DEPTH LAYERS", 4, 1, 10, 1),
    r("smoke", "SMOKE", 0.6, 0, 3, 0.05, "material"),
    r("glow", "AMBIENT GLOW", 1.5, 0, 4, 0.05, "material"),
    c("sparkColor", "SPARK COLOR", "#ff660d"),
    c("smokeColor", "SMOKE COLOR", "#ff6e1a"),
  ],
  "flame-wrap": [
    c("color", "FLAME COLOR", "#4f8aff"),
    r("intensity", "INTENSITY", 0.7, 0, 3, 0.05, "material"),
    r("height", "FLAME HEIGHT", 110, 10, 260, 2, "material", "PX"),
    r("spread", "SPREAD", 8, 0, 40, 0.5, "detail", "PX"),
    r("radius", "CORNER RADIUS", 40, 0, 160, 1, "material", "PX"),
    r("speed", "SPEED", 0.35, 0, 3, 0.05, "motion"),
    r("turbulence", "TURBULENCE", 0.5, 0, 2, 0.05, "motion"),
    r("sparks", "SPARKS", 1.5, 0, 5, 0.1, "material"),
    r("distortion", "HEAT DISTORTION", 10, 0, 40, 0.5, "material", "PX"),
  ],
  "force-field": [
    s("shape", "GRID SHAPE", "hexagon", ["hexagon", "triangle", "square"]),
    c("color", "FIELD COLOR", "#26adff"),
    c("edgeColor", "EDGE COLOR", "#80ccff"),
    r("opacity", "FIELD OPACITY", 0.9, 0, 1, 0.01, "material"),
    r("cellScale", "CELL SCALE", 16, 4, 40, 1),
    r("gridOpacity", "GRID OPACITY", 0.25, 0, 1, 0.01, "material"),
    r("gridRevealStrength", "REVEAL STRENGTH", 1.5, 0, 4, 0.05, "motion"),
    r("edgeGlow", "EDGE GLOW", 0.35, 0, 2, 0.05, "material"),
    r("refraction", "REFRACTION", 30, 0, 120, 1, "material", "PX"),
    r("bloom", "BLOOM", 1, 0, 3, 0.05, "material"),
    t("clickRipples", "CLICK RIPPLES", true),
  ],
  displacement: [
    r("grid", "GRID CELLS", 42, 4, 100, 1),
    r("cellAspect", "CELL ASPECT", 1, 0.25, 4, 0.05),
    r("radius", "INFLUENCE RADIUS", 0.28, 0.02, 1, 0.01, "motion"),
    r("strength", "PUSH STRENGTH", 0.7, 0, 1, 0.01, "motion"),
    r(
      "threshold",
      "SPEED THRESHOLD",
      0,
      0,
      2000,
      10,
      "behavior",
      "PX/S",
      "0 reacts to every pointer movement.",
    ),
    r("relaxation", "RELAXATION", 0.9, 0.5, 0.99, 0.01, "motion"),
    r("shift", "CONTENT SHIFT", 2.2, 0, 4, 0.05, "material"),
    r("aberration", "ABERRATION", 1.5, 0, 3, 0.05, "color"),
    r("grain", "FILM GRAIN", 0.18, 0, 1, 0.01, "material"),
    r("grainSize", "GRAIN SIZE", 1, 0.5, 4, 0.05),
    r("grainSpeed", "GRAIN SPEED", 1, 0, 4, 0.05, "motion"),
    r("scramble", "INTRO SCRAMBLE", 1.8, 0, 3, 0.05, "motion"),
  ],
  grid: [
    r("tileSize", "TILE SIZE", 120, 30, 300, 5, "detail", "PX"),
    r("gap", "TILE GAP", 0, 0, 24, 0.5, "detail", "PX"),
    r("amplitude", "WAVE AMPLITUDE", 2.5, 0, 6, 0.05, "motion"),
    r("waveSpeed", "WAVE SPEED", 0.5, 0, 3, 0.05, "motion"),
    r("liftHeight", "LIFT HEIGHT", 60, 0, 180, 1, "material", "PX"),
    r("perspective", "PERSPECTIVE", 1200, 300, 3000, 25, "material", "PX"),
    r("tilt", "TILT", 1, 0, 4, 0.05, "motion"),
    c("tint", "TILE TINT", "#0054ff"),
    r("tintStrength", "TINT STRENGTH", 0.1, 0, 1, 0.01, "color"),
    r("idleRipples", "IDLE RIPPLES", 0.35, 0, 2, 0.05, "behavior"),
  ],
  "hex-float": [
    t("preserveColor", "PRESERVE SOURCE COLORS", true),
    r("size", "HEX SIZE", 120, 30, 320, 5, "detail", "PX"),
    r("gap", "GAP", 1, 0, 24, 0.5, "detail", "PX"),
    r("tilt", "PERSPECTIVE TILT", 24, 0, 60, 1, "motion", "°"),
    r("float", "IDLE FLOAT", 0.25, 0, 2, 0.05, "motion"),
    r("shine", "SHINE", 0.5, 0, 2, 0.05, "material"),
    r("lift", "POINTER LIFT", 0.3, 0, 1, 0.01, "motion"),
    r("radius", "LIFT RADIUS", 700, 80, 1600, 20, "motion", "PX"),
    r("iridescence", "IRIDESCENCE", 1, 0, 3, 0.05, "color"),
    r("bloom", "BLOOM", 0.25, 0, 2, 0.05, "material"),
    r("grain", "GRAIN", 0.4, 0, 1, 0.01, "material"),
  ],
  bend: [
    r("zone", "FOLD ZONE", 180, 40, 500, 5, "material", "PX"),
    r("angle", "FOLD ANGLE", 72, 0, 90, 1, "material", "°"),
    r("rounding", "CREASE ROUNDING", 120, 0, 500, 5, "material", "PX"),
    r("perspective", "PERSPECTIVE", 700, 200, 3000, 25, "material", "PX"),
    s("direction", "FOLD DIRECTION", "in", ["in", "out"]),
    r("smoothing", "SMOOTHING", 0.1, 0, 1, 0.01, "motion", "S"),
    t("top", "TOP EDGE", true),
    t("bottom", "BOTTOM EDGE", true),
    r("tumble", "OVERSCROLL TUMBLE", 0.5, 0, 1, 0.01, "motion"),
    r("tilt", "POINTER TILT", 0.5, 0, 1, 0.01, "motion"),
  ],
  cloth: [
    s("pin", "PINNED EDGE", "top", ["top", "bottom", "left", "right"]),
    r("wind", "WIND", 3, 0, 8, 0.1, "motion"),
    r("speed", "SPEED", 0.5, 0, 3, 0.05, "motion"),
    r("amplitude", "FOLD HEIGHT", 30, 0, 100, 1, "material", "PX"),
    r("drape", "DRAPE", 40, 0, 140, 1, "material", "PX"),
    r("brush", "POINTER BRUSH", 2.05, 0, 5, 0.05, "motion"),
    r("brushSize", "BRUSH RADIUS", 150, 20, 500, 5, "motion", "PX"),
    r("light", "LIGHT", 0.5, 0, 1, 0.01, "material"),
    r("sheen", "SHEEN", 0.1, 0, 1, 0.01, "material"),
    r("shadow", "CONTACT SHADOW", 0.25, 0, 1, 0.01, "material"),
  ],
  shatter: [
    r("radius", "LENS RADIUS", 0.45, 0.05, 1, 0.01, "motion"),
    r("softness", "EDGE SOFTNESS", 0.6, 0, 1, 0.01, "material"),
    r("tileSize", "SHARD SIZE", 90, 20, 260, 5, "detail", "PX"),
    r("shards", "IRREGULARITY", 1, 0, 1, 0.01),
    r("lift", "LIFT", 40, 0, 120, 1, "motion", "PX"),
    r("tilt", "TILT", 2, 0, 3, 0.05, "motion"),
    r("scatter", "SCATTER", 8, 0, 80, 1, "motion", "PX"),
    c("gapColor", "VOID COLOR", "#000000"),
    r("refraction", "REFRACTION", 1.5, 0, 2, 0.05, "material"),
    r("dispersion", "DISPERSION", 0.3, 0, 1, 0.01, "color"),
    r("baseStrength", "BASE LIFT", 0.08, 0, 1, 0.01, "material"),
  ],
  peel: [
    s("side", "PEEL SIDE", "left", ["left", "right", "top", "bottom"]),
    s("mode", "TRIGGER MODE", "cursor", ["cursor", "hover"]),
    r("reveal", "REVEAL", 180, 20, 500, 5, "material", "PX"),
    r("zone", "TRIGGER ZONE", 200, 20, 500, 5, "motion", "PX"),
    r("curl", "CURL RADIUS", 240, 20, 600, 5, "material", "PX"),
    r("bow", "EDGE BOW", 75, -200, 200, 5, "material", "PX"),
    r("shade", "CURL SHADE", 0.25, 0, 1, 0.01, "material"),
    r("shine", "EDGE SHINE", 1, 0, 1, 0.01, "material"),
    r("bulge", "POINTER BULGE", 50, 0, 180, 1, "motion", "PX"),
    r("smoothing", "SMOOTHING", 0.3, 0, 1.5, 0.01, "motion", "S"),
  ],
  "particle-reveal": [
    r("radius", "REVEAL RADIUS", 360, 40, 900, 5, "motion", "PX"),
    r("softness", "EDGE SOFTNESS", 0.75, 0, 1, 0.01, "material"),
    r("size", "GRAIN SIZE", 1, 0.5, 8, 0.1, "detail", "PX"),
    r("scatter", "SCATTER", 25, 0, 120, 1, "motion", "PX"),
    r("drift", "DRIFT", 1, 0, 4, 0.05, "motion"),
    r("aberration", "ABERRATION", 40, 0, 100, 1, "color", "PX"),
    r("bend", "EDGE BEND", 50, 0, 160, 1, "material", "PX"),
    r("fade", "DUST OPACITY", 0.85, 0, 1, 0.01, "material"),
    c("background", "BACKDROP", "#000000", "css"),
  ],
  "particle-scroll": [
    r("point", "FORMATION LINE", 0.68, 0.05, 0.95, 0.01, "behavior"),
    r("band", "TRANSITION BAND", 320, 40, 800, 5, "material", "PX"),
    r("density", "GRAIN SPACING", 2, 0.5, 8, 0.1, "detail", "PX"),
    r("size", "GRAIN SIZE", 1.25, 0.2, 6, 0.05, "detail", "PX"),
    r("spread", "SCATTER DISTANCE", 220, 0, 500, 5, "motion", "PX"),
    r("gravity", "GRAVITY", 0.35, -1, 1, 0.01, "motion"),
    r("drift", "DRIFT", 0.7, 0, 1, 0.01, "motion"),
    r("swirl", "SWIRL", 60, -200, 200, 5, "motion", "PX"),
    r("fade", "SCATTERED OPACITY", 0.85, 0, 1, 0.01, "material"),
    r("settle", "SETTLE TIME", 1.2, 0, 4, 0.05, "motion", "S"),
  ],
  magnify: [
    r("size", "LENS RADIUS", 140, 30, 360, 2, "motion", "PX"),
    r("zoom", "MAGNIFICATION", 1.5, 1, 4, 0.05, "material"),
    c("color", "HUD COLOR", "#cccccc"),
    r("follow", "FOLLOW", 0.25, 0, 1, 0.01, "motion"),
    r("hud", "HUD INTENSITY", 0.8, 0, 1, 0.01, "material"),
    t("ring", "OUTER RING", true),
    t("crosshair", "CROSSHAIR", true),
    t("ticks", "TICK MARKS", true),
    t("grid", "MEASUREMENT GRID", false),
    t("readout", "DATA READOUT", true),
    r("aberration", "ABERRATION", 0.8, 0, 3, 0.05, "color"),
    r("haze", "HAZE", 0.2, 0, 1, 0.01, "material"),
    t("ripples", "CLICK RIPPLES", true),
  ],
  canvas: [
    r("threadSize", "THREAD SIZE", 2, 1, 8, 0.25, "detail", "PX"),
    r("threadWidth", "THREAD SEAMS", 0.2, 0, 1, 0.01),
    r("texture", "WEAVE TEXTURE", 1, 0, 1, 0.01, "material"),
    c("tint", "PAPER TINT", "#d6cfc0"),
    r("tintStrength", "TINT STRENGTH", 0, 0, 1, 0.01, "color"),
    r("grain", "PHOTO GRAIN", 0.5, 0, 1, 0.01, "material"),
    r("halftone", "HALFTONE", 0.1, 0, 1, 0.01, "material"),
    r("dotSize", "DOT SIZE", 6, 1, 20, 0.5, "detail", "PX"),
    r("strength", "PAINT MIX", 1, 0, 1, 0.01, "material"),
    r("relief", "WET RELIEF", 0.45, 0, 1, 0.01, "material"),
    r("gloss", "PAINT GLOSS", 0.35, 0, 1, 0.01, "material"),
    r("radius", "BRUSH RADIUS", 0.08, 0.01, 0.5, 0.01, "motion"),
  ],
  vhs: [
    r("speed", "PLAYBACK SPEED", 0.5, 0, 3, 0.05, "motion"),
    r("wave", "TAPE WAVE", 1, 0, 3, 0.05, "material"),
    r("jitter", "LINE JITTER", 0.35, 0, 3, 0.05, "motion"),
    r("crease", "TAPE CREASE", 0.2, 0, 3, 0.05, "material"),
    r("switching", "HEAD NOISE", 0.12, 0, 3, 0.01, "material"),
    r("bloom", "BLOOM", 0.4, 0, 1, 0.01, "material"),
    r("aberration", "CHROMA SHIFT", 2, 0, 12, 0.25, "color", "PX"),
    r("grain", "STATIC GRAIN", 0.18, 0, 1, 0.01, "material"),
    r("scanlines", "SCANLINES", 0.16, 0, 1, 0.01, "material"),
    r("vignette", "VIGNETTE", 0, 0, 1, 0.01, "material"),
    r("barrel", "CRT CURVATURE", 0, 0, 1, 0.01, "material"),
    r("saturation", "SATURATION", 1, 0, 2, 0.05, "color"),
  ],
  glitch: [
    r("intensity", "INTENSITY", 1, 0, 3, 0.05, "material"),
    r("interval", "BURST INTERVAL", 1.5, 0.2, 10, 0.1, "behavior", "S"),
    r("duration", "BURST DURATION", 0.55, 0.05, 2, 0.05, "motion", "S"),
    r("slices", "TEAR SLICES", 24, 2, 80, 1),
    r("shift", "SLICE SHIFT", 30, 0, 100, 1, "motion", "PX"),
    r("rgbShift", "RGB SHIFT", 4, 0, 24, 0.5, "color", "PX"),
    r("blocks", "CORRUPTED BLOCKS", 0.5, 0, 1, 0.01, "material"),
    r("noise", "NOISE", 0.35, 0, 1, 0.01, "material"),
  ],
  "retro-dither": [
    r("radius", "LENS RADIUS", 0.5, 0.05, 1, 0.01, "motion"),
    r("softness", "EDGE SOFTNESS", 1, 0, 1, 0.01, "material"),
    r("pixelSize", "PIXEL SIZE", 2, 1, 12, 0.5, "detail", "PX"),
    r("levels", "BRIGHTNESS LEVELS", 4, 2, 12, 1),
    c("darkColor", "DARK COLOR", "#000000"),
    c("lightColor", "LIGHT COLOR", "#ffffff"),
    r("colorize", "PALETTE MIX", 0.1, 0, 1, 0.01, "color"),
    r("contrast", "CONTRAST", 0.6, 0, 3, 0.05, "material"),
    r("strength", "LENS STRENGTH", 0.85, 0, 1, 0.01, "material"),
    r("baseStrength", "BASE DITHER", 0.12, 0, 1, 0.01, "material"),
    s("pattern", "DITHER PATTERN", "bayer", ["bayer", "halftone", "hatch", "dash"]),
    r("trail", "PHOSPHOR TRAIL", 0.4, 0, 1, 0.01, "motion"),
  ],
  asciify: [
    r("radius", "LENS RADIUS", 0.45, 0.05, 1, 0.01, "motion"),
    r("softness", "EDGE SOFTNESS", 1, 0, 1, 0.01, "material"),
    r("scale", "GLYPH SCALE", 2, 1, 8, 0.5, "detail", "PX"),
    r("spacing", "GLYPH SPACING", 1, 0, 3, 0.25),
    s("charset", "CHARACTER SET", "ascii", ["ascii", "blocks", "binary"]),
    r("contrast", "CONTRAST", 1, 0, 3, 0.05, "material"),
    r("strength", "LENS STRENGTH", 1, 0, 1, 0.01, "material"),
    r("baseStrength", "BASE ASCII", 0.12, 0, 1, 0.01, "material"),
    r("followSpeed", "FOLLOW SPEED", 3, 0.2, 10, 0.1, "motion"),
    r("glow", "PHOSPHOR GLOW", 0.75, 0, 2, 0.05, "material"),
    r("aberration", "ABERRATION", 0.75, 0, 3, 0.05, "color"),
  ],
  "ascii-sweep": [
    r("angle", "SWEEP ANGLE", 0, 0, 360, 1, "motion", "°"),
    r("duration", "SWEEP DURATION", 1.6, 0.25, 8, 0.05, "motion", "S"),
    r("band", "BAND WIDTH", 0.28, 0.02, 1, 0.01, "material"),
    r("softness", "EDGE SOFTNESS", 0.45, 0, 1, 0.01, "material"),
    r("turbulence", "TURBULENCE", 0.5, 0, 2, 0.05, "motion"),
    r("trail", "GLOW TRAIL", 0.75, 0, 2, 0.05, "motion"),
    r("scale", "GLYPH SCALE", 2, 1, 8, 0.5, "detail", "PX"),
    s("charset", "CHARACTER SET", "ascii", ["ascii", "blocks", "binary"]),
    c("color", "SWEEP COLOR", "#4ade80", "css"),
    r("glow", "PHOSPHOR GLOW", 2, 0, 3, 0.05, "material"),
    r("aberration", "ABERRATION", 5, 0, 30, 0.5, "color", "PX"),
    r("flicker", "FLICKER", 0.35, 0, 1, 0.01, "motion"),
    r("displace", "ROW TEARING", 14, 0, 60, 1, "motion", "PX"),
  ],
  "decrypt-reveal": [
    r("radius", "DECRYPT RADIUS", 320, 40, 900, 5, "motion", "PX"),
    r("softness", "EDGE SOFTNESS", 0.5, 0, 1, 0.01, "material"),
    r("cell", "GLYPH CELL", 10, 4, 40, 1, "detail", "PX"),
    r("aspect", "CELL ASPECT", 0.75, 0.35, 1.25, 0.05),
    r("colored", "SOURCE COLOR", 1, 0, 1, 0.01, "color"),
    c("color", "CIPHER COLOR", "#4ade80", "css"),
    r("contrast", "CONTRAST", 1, 0, 4, 0.05, "material"),
    r("scramble", "SCRAMBLE", 0.2, 0, 1, 0.01, "motion"),
    r("scrambleSpeed", "SCRAMBLE SPEED", 6, 0, 20, 0.25, "motion"),
    r("edgeGlow", "EDGE GLOW", 2, 0, 5, 0.05, "material"),
    r("aberration", "ABERRATION", 10, 0, 50, 1, "color", "PX"),
    c("background", "BACKDROP", "#000000", "css"),
  ],
  "glyph-rain": [
    r("cell", "GLYPH CELL", 15, 5, 40, 1, "detail", "PX"),
    c("color", "TRAIL COLOR", "#4474ff"),
    c("headColor", "HEAD COLOR", "#2b6aff"),
    r("speed", "FALL SPEED", 0.3, 0, 2, 0.05, "motion"),
    r("density", "STREAM DENSITY", 0.2, 0, 1, 0.01),
    r("trail", "TRAIL LENGTH", 0.65, 0, 1, 0.01, "motion"),
    r("glow", "GLOW", 1.75, 0, 4, 0.05, "material"),
    r("layers", "DEPTH LAYERS", 2, 1, 6, 1),
    r("dim", "CONTENT DIM", 0.5, 0, 1, 0.01, "material"),
    r("light", "LIGHT POOLS", 2.8, 0, 6, 0.1, "material"),
    r("stir", "POINTER STIR", 0.7, 0, 2, 0.05, "motion"),
    r("stirRadius", "STIR RADIUS", 260, 20, 700, 5, "motion", "PX"),
  ],
  laser: [
    r("speed", "BEAM SPEED", 0.3, 0, 2, 0.05, "motion"),
    r("offset", "BOTTOM OFFSET", 100, 0, 400, 5, "material", "PX"),
    c("color", "LASER COLOR", "#0d59ff"),
    r("thickness", "THICKNESS", 6, 1, 24, 0.5, "material", "PX"),
    r("glow", "GLOW", 2, 0, 5, 0.05, "material"),
    r("wave", "BEAM WAVE", 10, 0, 50, 0.5, "motion", "PX"),
    r("width", "BEAM WIDTH", 0.55, 0.05, 1, 0.01, "material"),
    r("flicker", "FLICKER", 0.2, 0, 1, 0.01, "motion"),
    r("reveal", "REVEAL DISTANCE", 300, 20, 800, 5, "material", "PX"),
    r("heat", "HEAT HAZE", 1.5, 0, 5, 0.05, "material"),
    r("bezelOpacity", "LOWER MASK", 0, 0, 1, 0.01, "material"),
  ],
  "ascii-object": [
    t("ascii", "ASCII RENDER", true),
    r("cellSize", "CHARACTER SIZE", 10, 4, 30, 1, "detail", "PX"),
    r("cellAspect", "CHARACTER ASPECT", 0.6, 0.35, 1.25, 0.05),
    t("colored", "SOURCE COLORS", true),
    c("color", "MONO COLOR", "#ffffff", "css"),
    r("contrast", "CONTRAST", 1.5, 0.2, 4, 0.05, "material"),
    r("edgeContrast", "EDGE CONTRAST", 3, 1, 6, 0.05, "material"),
    r("exposure", "EXPOSURE", 1, 0.2, 3, 0.05, "color"),
    t("invert", "INVERT TONES", false),
    ...objectScene(),
  ],
  "dithered-object": [
    s("method", "DITHER METHOD", "bayer", ["bayer", "halftone", "floyd-steinberg"]),
    r("gridSize", "DITHER GRID", 4, 2, 12, 1),
    r("pixelSizeRatio", "PIXEL ASPECT", 1, 0.4, 2, 0.05),
    t("grayscale", "GRAYSCALE", true),
    t("invert", "INVERT", false),
    t("dither", "DITHER", true),
    r("environmentIntensity", "STUDIO LIGHT", 0.35, 0, 3, 0.05, "material"),
    ...objectScene(),
  ],
  "glass-object": [
    r("ior", "REFRACTION INDEX", 1.75, 1, 2.5, 0.01, "material"),
    r("thickness", "THICKNESS", 4, 0.1, 10, 0.1, "material"),
    r("roughness", "ROUGHNESS", 0.25, 0, 1, 0.01, "material"),
    r("dispersion", "DISPERSION", 1.5, 0, 4, 0.05, "color"),
    r("clearcoat", "CLEARCOAT", 0.5, 0, 1, 0.01, "material"),
    r("tintDensity", "TINT DENSITY", 2, 0, 6, 0.05, "color"),
    r("depth", "EXTRUSION DEPTH", 0.1, 0.01, 1, 0.01, "material"),
    r("bevel", "BEVEL", 1, 0, 4, 0.05, "material"),
    ...objectScene(),
  ],
  "ink-object": [
    t("ink", "INK RENDER", true),
    c("inkColor", "INK COLOR", "#111111", "css"),
    r("lineSpacing", "LINE SPACING", 8, 2, 24, 0.5, "detail", "PX"),
    r("strokeWeight", "STROKE WEIGHT", 1, 0.2, 4, 0.05),
    r("angle", "STROKE ANGLE", 0, 0, 180, 1, "detail", "°"),
    r("variation", "VARIATION", 1, 0, 3, 0.05, "material"),
    r("bleed", "INK BLEED", 0.35, 0, 1, 0.01, "material"),
    r("grain", "PAPER GRAIN", 0.32, 0, 1, 0.01, "material"),
    r("wobble", "LINE WOBBLE", 0.3, 0, 1, 0.01, "motion"),
    ...objectScene(),
  ],
  "liquid-object": [
    r("distortion", "DISTORTION", 2, 0, 6, 0.05, "material"),
    r("aberration", "ABERRATION", 0.75, 0, 3, 0.05, "color"),
    r("grain", "GRAIN", 1, 0, 3, 0.05, "material"),
    r("sheen", "SHEEN", 1.6, 0, 4, 0.05, "material"),
    r("cursorSize", "STIR RADIUS", 1, 0.1, 3, 0.05, "motion"),
    r("cursorForce", "STIR FORCE", 1, 0, 4, 0.05, "motion"),
    r("persistence", "FLUID PERSISTENCE", 0.6, 0, 1, 0.01, "motion"),
    r("swirl", "SWIRL", 0.5, 0, 3, 0.05, "motion"),
    r("iridescence", "IRIDESCENCE", 1.5, 0, 4, 0.05, "color"),
    ...objectScene(),
  ],
  "particle-object": [
    r("count", "PARTICLE COUNT", 14000, 1000, 30000, 500),
    r("size", "PARTICLE SIZE", 2.4, 0.5, 8, 0.1, "detail", "PX"),
    r("sizeVariance", "SIZE VARIANCE", 0.6, 0, 1, 0.01),
    r("radius", "PUSH RADIUS", 110, 20, 400, 5, "motion", "PX"),
    r("strength", "PUSH STRENGTH", 1, 0, 4, 0.05, "motion"),
    r("swirl", "PUSH SWIRL", 0.6, 0, 2, 0.05, "motion"),
    r("spring", "RETURN SPRING", 1, 0, 4, 0.05, "motion"),
    r("damping", "DAMPING", 0.35, 0, 1, 0.01, "motion"),
    r("drift", "IDLE DRIFT", 0.6, 0, 2, 0.05, "motion"),
    ...objectScene(),
  ],
};

const meta: readonly Omit<CanvasUiEffectDefinition, "controls">[] = [
  {
    id: "liquid",
    name: "Liquid",
    category: "motion",
    description: "Pointer-driven fluid distortion over live HTML.",
    interaction: "MOVE THE POINTER TO PAINT FLUID",
  },
  {
    id: "ripple",
    name: "Ripple",
    category: "motion",
    description: "Click ripples with refraction and crest highlights.",
    interaction: "CLICK OR MOVE TO SPAWN RIPPLES",
  },
  {
    id: "bubble",
    name: "Bubble",
    category: "surface",
    description: "A glassy metaball lens that trails the pointer.",
    interaction: "MOVE THE POINTER TO PULL THE BUBBLE",
  },
  {
    id: "glass",
    name: "Glass",
    category: "surface",
    description: "A cursor-following crystal lens with refraction.",
    interaction: "MOVE ACROSS THE TARGET TO INSPECT IT",
  },
  {
    id: "frost",
    name: "Frost",
    category: "surface",
    description: "Frozen glass that melts open around the pointer.",
    interaction: "MOVE TO MELT · LEAVE TO REFREEZE",
  },
  {
    id: "droplets",
    name: "Droplets",
    category: "atmosphere",
    description: "Falling rain droplets that refract the target.",
    interaction: "MOVE THROUGH THE RAIN TO PUSH DROPS",
  },
  {
    id: "clouds",
    name: "Clouds",
    category: "atmosphere",
    description: "Procedural fog that parts as the cursor moves.",
    interaction: "MOVE TO PART THE MIST",
  },
  {
    id: "blaze",
    name: "Blaze",
    category: "atmosphere",
    description: "Fire, sparks, smoke and rising heat distortion.",
    interaction: "MOVE THROUGH THE HEAT",
  },
  {
    id: "flame-wrap",
    name: "Flame Wrap",
    category: "atmosphere",
    description: "A molten animated flame border around the surface.",
    interaction: "WATCH THE TARGET EDGE",
  },
  {
    id: "force-field",
    name: "Force Field",
    category: "motion",
    description: "An interactive energy lattice with shockwave refraction.",
    interaction: "CLICK TO DETONATE A SHOCKWAVE",
  },
  {
    id: "displacement",
    name: "Displacement",
    category: "motion",
    description: "A pointer-reactive displacement grid with film grain.",
    interaction: "MOVE THE POINTER — THRESHOLD 0 REACTS IMMEDIATELY",
  },
  {
    id: "grid",
    name: "Grid",
    category: "motion",
    description: "Live UI split into 3D tiles that ripple around the cursor.",
    interaction: "MOVE OR WAIT FOR IDLE RIPPLES",
  },
  {
    id: "hex-float",
    name: "Hex Float",
    category: "motion",
    description: "A field of perspective hex tiles rising toward the cursor.",
    interaction: "MOVE TO LIFT THE HEX FIELD",
  },
  {
    id: "bend",
    name: "Bend",
    category: "motion",
    description: "Folds live HTML over virtual edges while scrolling.",
    interaction: "SCROLL TO FLEX THE FOLDED EDGES",
  },
  {
    id: "cloth",
    name: "Cloth",
    category: "motion",
    description: "Live UI rendered as softly lit, pointer-reactive fabric.",
    interaction: "BRUSH THE FABRIC WITH THE POINTER",
  },
  {
    id: "shatter",
    name: "Shatter",
    category: "motion",
    description: "3D glass shards lift and tilt around the pointer.",
    interaction: "MOVE TO LIFT THE GLASS SHARDS",
  },
  {
    id: "peel",
    name: "Peel",
    category: "motion",
    description: "Peels the interface back from a chosen edge.",
    interaction: "APPROACH THE CHOSEN EDGE TO PEEL",
  },
  {
    id: "particle-reveal",
    name: "Particle Reveal",
    category: "motion",
    description: "Fine dust resolves into crisp UI around the cursor.",
    interaction: "MOVE TO REASSEMBLE THE PARTICLES",
  },
  {
    id: "particle-scroll",
    name: "Particle Scroll",
    category: "motion",
    description: "Content dissolves into drifting particles while scrolling.",
    interaction: "SCROLL THROUGH THE FORMATION LINE",
  },
  {
    id: "magnify",
    name: "Magnify",
    category: "surface",
    description: "A HUD scanner lens with magnification and chromatic haze.",
    interaction: "MOVE TO SCAN · CLICK FOR A RIPPLE",
  },
  {
    id: "canvas",
    name: "Canvas",
    category: "surface",
    description: "Woven fibers, paper tint, grain and halftone texture.",
    interaction: "DRAG THE POINTER TO MOVE WET PAINT",
  },
  {
    id: "vhs",
    name: "VHS",
    category: "retro",
    description: "Tape wave, chroma bleed, head noise and analog grain.",
    interaction: "THE TAPE ARTIFACTS RUN CONTINUOUSLY",
  },
  {
    id: "glitch",
    name: "Glitch",
    category: "retro",
    description: "RGB splits, corrupted blocks and broadcast tearing.",
    interaction: "WAIT FOR THE NEXT SHORT GLITCH BURST",
  },
  {
    id: "retro-dither",
    name: "Retro Dither",
    category: "retro",
    description: "A pixelated, quantized dither lens around the pointer.",
    interaction: "MOVE THE DITHER LENS · CLICK TO DEGAUSS",
  },
  {
    id: "asciify",
    name: "Asciify",
    category: "retro",
    description: "Redraws live HTML as ASCII near the cursor.",
    interaction: "MOVE THE ASCII LENS",
  },
  {
    id: "ascii-sweep",
    name: "ASCII Sweep",
    category: "retro",
    description: "A phosphor ASCII wave repeatedly sweeps across content.",
    interaction: "THE PREVIEW REPLAYS AUTOMATICALLY",
  },
  {
    id: "decrypt-reveal",
    name: "Decrypt Reveal",
    category: "retro",
    description: "Cipher text decodes into the interface around the cursor.",
    interaction: "MOVE TO DECRYPT THE TARGET",
  },
  {
    id: "glyph-rain",
    name: "Glyph Rain",
    category: "retro",
    description: "Glowing glyph streams cast pools of light onto the UI.",
    interaction: "MOVE TO STIR THE GLYPH STREAMS",
  },
  {
    id: "laser",
    name: "Laser",
    category: "retro",
    description: "A glowing scan beam reveals content as it scrolls.",
    interaction: "SCROLL CONTENT THROUGH THE LASER LINE",
  },
  {
    id: "ascii-object",
    name: "ASCII Object",
    category: "object",
    description: "Renders an image, SVG or 3D model as shaped glyphs.",
    interaction: "DRAG TO ORBIT THE ASCII OBJECT",
    objectEffect: true,
  },
  {
    id: "dithered-object",
    name: "Dithered Object",
    category: "object",
    description: "A 1-bit Bayer, halftone or Floyd–Steinberg object.",
    interaction: "DRAG TO ORBIT THE DITHERED OBJECT",
    objectEffect: true,
  },
  {
    id: "glass-object",
    name: "Glass Object",
    category: "object",
    description: "A floating refractive liquid-glass object.",
    interaction: "DRAG TO ORBIT THE GLASS OBJECT",
    objectEffect: true,
  },
  {
    id: "ink-object",
    name: "Ink Object",
    category: "object",
    description: "An object rebuilt from hand-pressed ink strokes.",
    interaction: "DRAG TO ORBIT THE INK OBJECT",
    objectEffect: true,
  },
  {
    id: "liquid-object",
    name: "Liquid Object",
    category: "object",
    description: "A studio object distorted by an invisible fluid field.",
    interaction: "MOVE TO STIR · DRAG TO ORBIT",
    objectEffect: true,
  },
  {
    id: "particle-object",
    name: "Particle Object",
    category: "object",
    description: "An image or model rebuilt as interactive particles.",
    interaction: "MOVE TO SCATTER · DRAG TO ORBIT",
    objectEffect: true,
  },
];

export const CANVAS_UI_EFFECTS: readonly CanvasUiEffectDefinition[] = meta.map((effect) => ({
  ...effect,
  controls: controls[effect.id],
}));
export const CANVAS_UI_EFFECT_IDS = CANVAS_UI_EFFECTS.map((effect) => effect.id);

export function getCanvasUiEffect(id: CanvasUiEffectId) {
  return CANVAS_UI_EFFECTS.find((effect) => effect.id === id) ?? CANVAS_UI_EFFECTS[0];
}

export function getCanvasUiDefaultSettings(effect: CanvasUiEffectId): CanvasUiEffectSettings {
  return Object.fromEntries(controls[effect].map((control) => [control.key, control.defaultValue]));
}

export function normalizeCanvasUiEffectSettings(
  effect: CanvasUiEffectId,
  value: unknown,
): CanvasUiEffectSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const result: CanvasUiEffectSettings = {};
  for (const control of controls[effect]) {
    const candidate = input[control.key];
    if (control.kind === "range" && typeof candidate === "number" && Number.isFinite(candidate)) {
      const clamped = Math.min(control.max, Math.max(control.min, candidate));
      const precision = Math.min(8, String(control.step).split(".")[1]?.length ?? 0);
      result[control.key] = Number(clamped.toFixed(precision));
    } else if (control.kind === "toggle" && typeof candidate === "boolean") {
      result[control.key] = candidate;
    } else if (
      control.kind === "select" &&
      typeof candidate === "string" &&
      control.options.some((option) => option.id === candidate)
    ) {
      result[control.key] = candidate;
    } else if (
      control.kind === "color" &&
      typeof candidate === "string" &&
      /^#[0-9a-f]{6}$/i.test(candidate)
    ) {
      result[control.key] = candidate.toLowerCase();
    }
  }
  return result;
}

function hexToRgbTuple(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

export function resolveCanvasUiEffectProps(
  effect: CanvasUiEffectId,
  saved: CanvasUiEffectSettings | undefined,
): Record<string, CanvasUiSettingValue | [number, number, number]> {
  return Object.fromEntries(
    controls[effect].map((control) => {
      const value = saved?.[control.key] ?? control.defaultValue;
      return [
        control.key,
        control.kind === "color" && control.colorMode === "rgb"
          ? hexToRgbTuple(String(value))
          : value,
      ];
    }),
  );
}

export function fitCanvasUiEffectProps(
  effect: CanvasUiEffectId,
  props: Record<string, unknown>,
  width: number,
  height: number,
): Record<string, unknown> {
  // Spatial parameters are authored for a launcher-sized surface. Scale them
  // together for cards/buttons, while retaining glyph size and fine detail.
  const scale = Math.min(1, Math.max(0.12, Math.min(width, height) / 540));
  if (scale === 1) return props;
  const fitted = { ...props };
  for (const control of controls[effect]) {
    const value = props[control.key];
    if (
      control.kind === "range" &&
      control.suffix === "PX" &&
      Math.abs(control.defaultValue) >= 8 &&
      typeof value === "number"
    ) {
      fitted[control.key] = value * scale;
    }
  }
  return fitted;
}
