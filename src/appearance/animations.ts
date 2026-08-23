export const TAB_ANIMATIONS = [
  { id: "none", label: "NONE" },
  { id: "fade", label: "FADE" },
  { id: "rise", label: "RISE" },
  { id: "slide-left", label: "SLIDE LEFT" },
  { id: "slide-right", label: "SLIDE RIGHT" },
  { id: "zoom", label: "ZOOM" },
  { id: "blur", label: "BLUR" },
] as const;

export type TabAnimationId = (typeof TAB_ANIMATIONS)[number]["id"];

export const OPEN_ANIMATIONS = [
  { id: "unfold", label: "GALLERY UNFOLD" },
  { id: "fade", label: "FADE" },
  { id: "zoom", label: "ZOOM" },
  { id: "slide-up", label: "SLIDE UP" },
  { id: "none", label: "NONE" },
] as const;

export type OpenAnimationId = (typeof OPEN_ANIMATIONS)[number]["id"];

export const CLOSE_ANIMATIONS = [
  { id: "tear", label: "PAPER TEAR", durationMs: 400 },
  { id: "shred", label: "PAPER SHRED", durationMs: 950 },
  { id: "fade", label: "FADE", durationMs: 260 },
  { id: "scale", label: "SCALE DOWN", durationMs: 320 },
  { id: "slide-down", label: "SLIDE DOWN", durationMs: 360 },
  { id: "none", label: "NONE", durationMs: 0 },
] as const;

export type CloseAnimationId = (typeof CLOSE_ANIMATIONS)[number]["id"];

export const UI_MOTION_STYLES = [
  { id: "smooth", label: "SMOOTH" },
  { id: "snappy", label: "SNAPPY" },
] as const;

export type UiMotionStyle = (typeof UI_MOTION_STYLES)[number]["id"];

const TAB_KEYFRAMES: Record<Exclude<TabAnimationId, "none">, Keyframe[]> = {
  fade: [{ opacity: 0 }, { opacity: 1 }],
  rise: [
    { opacity: 0, transform: "translateY(18px)" },
    { opacity: 1, transform: "translateY(0)" },
  ],
  "slide-left": [
    { opacity: 0, transform: "translateX(28px)" },
    { opacity: 1, transform: "translateX(0)" },
  ],
  "slide-right": [
    { opacity: 0, transform: "translateX(-28px)" },
    { opacity: 1, transform: "translateX(0)" },
  ],
  zoom: [
    { opacity: 0, transform: "scale(0.965)" },
    { opacity: 1, transform: "scale(1)" },
  ],
  blur: [
    { opacity: 0, filter: "blur(10px)", transform: "scale(1.01)" },
    { opacity: 1, filter: "blur(0)", transform: "scale(1)" },
  ],
};

export function playTabTransition(
  element: HTMLElement | null,
  animation: TabAnimationId,
  durationMs: number,
) {
  if (!element || animation === "none" || typeof element.animate !== "function") return;

  element.getAnimations().forEach((runningAnimation) => runningAnimation.cancel());
  element.animate(TAB_KEYFRAMES[animation], {
    duration: durationMs,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    fill: "both",
  });
}

export function getCloseAnimationDuration(animation: CloseAnimationId) {
  return CLOSE_ANIMATIONS.find((option) => option.id === animation)?.durationMs ?? 0;
}

const OPENING_PREVIEW: Record<
  Exclude<OpenAnimationId, "none">,
  { keyframes: Keyframe[]; duration: number }
> = {
  unfold: {
    duration: 1050,
    keyframes: [
      { opacity: 1, clipPath: "inset(calc(50% - 5px) calc(50% - 0.5px))", offset: 0 },
      { opacity: 1, clipPath: "inset(0 calc(50% - 0.5px))", offset: 0.42 },
      { opacity: 1, clipPath: "inset(0)", offset: 1 },
    ],
  },
  fade: {
    duration: 520,
    keyframes: [{ opacity: 0 }, { opacity: 1 }],
  },
  zoom: {
    duration: 620,
    keyframes: [
      { opacity: 0, clipPath: "inset(0)", transform: "scale(0.94)" },
      { opacity: 1, clipPath: "inset(0)", transform: "scale(1)" },
    ],
  },
  "slide-up": {
    duration: 560,
    keyframes: [
      { opacity: 0, clipPath: "inset(0)", transform: "translateY(28px)" },
      { opacity: 1, clipPath: "inset(0)", transform: "translateY(0)" },
    ],
  },
};

export function playWindowOpeningPreview(element: HTMLElement | null, animation: OpenAnimationId) {
  if (!element || animation === "none" || typeof element.animate !== "function") return null;
  const preview = OPENING_PREVIEW[animation];
  const targetOpacity = getComputedStyle(element).opacity || "1";
  const keyframes = preview.keyframes.map((keyframe) => ({
    ...keyframe,
    ...(keyframe.opacity === 1 ? { opacity: targetOpacity } : {}),
  }));
  return element.animate(keyframes, {
    duration: preview.duration,
    easing:
      animation === "unfold" ? "cubic-bezier(0.87, 0, 0.13, 1)" : "cubic-bezier(0.22, 1, 0.36, 1)",
  });
}
