import type {
  AppearanceElementGradientAnimation,
  AppearanceElementGradientAnimationDirection,
  AppearanceElementHoverEasing,
} from "./types";

export const GRADIENT_ANIMATIONS: readonly {
  id: AppearanceElementGradientAnimation;
  label: string;
}[] = [
  { id: "none", label: "STATIC" },
  { id: "flow", label: "FLOW" },
  { id: "pulse", label: "PULSE" },
  { id: "drift", label: "DRIFT" },
  { id: "orbit", label: "ORBIT" },
  { id: "shimmer", label: "SHIMMER" },
  { id: "spectrum", label: "SPECTRUM" },
  { id: "custom", label: "CUSTOM" },
];

export const GRADIENT_DIRECTIONS: readonly {
  id: AppearanceElementGradientAnimationDirection;
  label: string;
}[] = [
  { id: "normal", label: "FORWARD" },
  { id: "reverse", label: "REVERSE" },
  { id: "alternate", label: "PING-PONG" },
];

export const GRADIENT_EASINGS: readonly {
  id: AppearanceElementHoverEasing;
  label: string;
}[] = [
  { id: "linear", label: "LINEAR" },
  { id: "ease", label: "EASE" },
  { id: "ease-in", label: "EASE IN" },
  { id: "ease-out", label: "EASE OUT" },
  { id: "ease-in-out", label: "EASE IN / OUT" },
];

export type GradientAnimationTuning = {
  easing?: AppearanceElementHoverEasing;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  scale?: number;
  hue?: number;
  saturation?: number;
  brightness?: number;
};

export type GradientAnimationDefinition = {
  backgroundSize: string;
  easing: AppearanceElementHoverEasing;
  frames: Keyframe[];
};

export const DEFAULT_CUSTOM_GRADIENT_ANIMATION = {
  startX: 0,
  startY: 50,
  endX: 100,
  endY: 50,
  scale: 240,
  hue: 0,
  saturation: 1.25,
  brightness: 1.08,
} as const;

function frame(
  offset: number,
  backgroundPosition: string,
  backgroundSize: string,
  filter?: string,
): Keyframe {
  return { offset, backgroundPosition, backgroundSize, ...(filter ? { filter } : {}) };
}

export function defaultGradientAnimationEasing(
  animation: AppearanceElementGradientAnimation,
): AppearanceElementHoverEasing {
  return animation === "flow" || animation === "orbit" || animation === "spectrum"
    ? "linear"
    : "ease-in-out";
}

export function resolveGradientAnimation(
  animation: AppearanceElementGradientAnimation,
  tuning: GradientAnimationTuning = {},
): GradientAnimationDefinition | null {
  if (animation === "none") return null;

  const easing = tuning.easing ?? defaultGradientAnimationEasing(animation);
  if (animation === "flow") {
    const size = "220% 220%";
    return {
      backgroundSize: size,
      easing,
      frames: [frame(0, "0% 50%", size), frame(0.5, "100% 50%", size), frame(1, "0% 50%", size)],
    };
  }
  if (animation === "pulse") {
    const size = "220% 220%";
    return {
      backgroundSize: size,
      easing,
      frames: [
        frame(0, "38% 50%", size, "saturate(0.9) brightness(0.94)"),
        frame(0.5, "62% 50%", size, "saturate(1.25) brightness(1.08)"),
        frame(1, "38% 50%", size, "saturate(0.9) brightness(0.94)"),
      ],
    };
  }
  if (animation === "drift") {
    const size = "250% 250%";
    return {
      backgroundSize: size,
      easing,
      frames: [
        frame(0, "0% 18%", size),
        frame(0.34, "100% 36%", size),
        frame(0.68, "28% 100%", size),
        frame(1, "0% 18%", size),
      ],
    };
  }
  if (animation === "orbit") {
    const size = "260% 260%";
    return {
      backgroundSize: size,
      easing,
      frames: [
        frame(0, "0% 0%", size),
        frame(0.25, "100% 0%", size),
        frame(0.5, "100% 100%", size),
        frame(0.75, "0% 100%", size),
        frame(1, "0% 0%", size),
      ],
    };
  }
  if (animation === "shimmer") {
    const size = "320% 320%";
    return {
      backgroundSize: size,
      easing,
      frames: [
        frame(0, "0% 50%", size, "saturate(0.88) brightness(0.86)"),
        frame(0.5, "100% 50%", size, "saturate(1.18) brightness(1.28)"),
        frame(1, "0% 50%", size, "saturate(0.88) brightness(0.86)"),
      ],
    };
  }
  if (animation === "spectrum") {
    const size = "220% 220%";
    return {
      backgroundSize: size,
      easing,
      frames: [
        frame(0, "0% 50%", size, "hue-rotate(0deg) saturate(1)"),
        frame(0.5, "100% 50%", size, "hue-rotate(180deg) saturate(1.3)"),
        frame(1, "0% 50%", size, "hue-rotate(360deg) saturate(1)"),
      ],
    };
  }

  const startX = tuning.startX ?? DEFAULT_CUSTOM_GRADIENT_ANIMATION.startX;
  const startY = tuning.startY ?? DEFAULT_CUSTOM_GRADIENT_ANIMATION.startY;
  const endX = tuning.endX ?? DEFAULT_CUSTOM_GRADIENT_ANIMATION.endX;
  const endY = tuning.endY ?? DEFAULT_CUSTOM_GRADIENT_ANIMATION.endY;
  const scale = tuning.scale ?? DEFAULT_CUSTOM_GRADIENT_ANIMATION.scale;
  const hue = tuning.hue ?? DEFAULT_CUSTOM_GRADIENT_ANIMATION.hue;
  const saturation = tuning.saturation ?? DEFAULT_CUSTOM_GRADIENT_ANIMATION.saturation;
  const brightness = tuning.brightness ?? DEFAULT_CUSTOM_GRADIENT_ANIMATION.brightness;
  const size = `${scale}% ${scale}%`;
  return {
    backgroundSize: size,
    easing,
    frames: [
      frame(0, `${startX}% ${startY}%`, size, "hue-rotate(0deg) saturate(1) brightness(1)"),
      frame(
        1,
        `${endX}% ${endY}%`,
        size,
        `hue-rotate(${hue}deg) saturate(${saturation}) brightness(${brightness})`,
      ),
    ],
  };
}

function serializeFrame(frameValue: Keyframe) {
  const declarations: string[] = [];
  if (frameValue.backgroundPosition) {
    declarations.push(`background-position: ${String(frameValue.backgroundPosition)}`);
  }
  if (frameValue.backgroundSize) {
    declarations.push(`background-size: ${String(frameValue.backgroundSize)}`);
  }
  if (frameValue.filter) declarations.push(`filter: ${String(frameValue.filter)}`);
  return declarations.join("; ");
}

export function buildGradientAnimationKeyframes(
  name: string,
  definition: GradientAnimationDefinition,
) {
  return `@keyframes ${name} { ${definition.frames
    .map(
      (frameValue) => `${Number(frameValue.offset ?? 0) * 100}% { ${serializeFrame(frameValue)}; }`,
    )
    .join(" ")} }`;
}
