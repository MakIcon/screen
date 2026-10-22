import type { CanvasUiEffectId } from "./types";

export const CANVAS_UI_REPLACED_ATTRIBUTE = "data-canvas-ui-replaced";

export const CANVAS_UI_CAPTURE_IGNORE_SELECTOR = [
  ".canvas-ui-element-effects",
  ".appearance-drawing-cursor",
  ".canvas-ui-object-layer",
  ".canvas-ui-element-object-layer",
].join(", ");

function captureStyle(style: string | null) {
  return (style ?? "").replace(/--canvas-ui-pointer-[xy]\s*:[^;]*;?/g, "").trim();
}

// Texture uploads, overlay positioning and compatibility cursor variables are
// renderer bookkeeping, not changes to the HTML being captured.
export function canvasUiMutationAffectsCapture(record: MutationRecord) {
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (target?.closest(CANVAS_UI_CAPTURE_IGNORE_SELECTOR)) return false;
  if (record.type === "attributes") {
    if (record.oldValue === target?.getAttribute(record.attributeName ?? "")) return false;
    if (
      record.attributeName === CANVAS_UI_REPLACED_ATTRIBUTE ||
      record.attributeName?.startsWith("data-canvas-ui-")
    )
      return false;
    if (record.attributeName === "style")
      return captureStyle(record.oldValue) !== captureStyle(target?.getAttribute("style") ?? null);
  }
  if (record.type === "childList") {
    return [...record.addedNodes, ...record.removedNodes].some(
      (node) => !(node instanceof Element && node.matches(CANVAS_UI_CAPTURE_IGNORE_SELECTOR)),
    );
  }
  return true;
}

// These engines draw only a lens/atmosphere; all others render the source too.
export function canvasUiReplacesContent(effect: CanvasUiEffectId) {
  return !["bubble", "glass", "magnify", "clouds", "asciify", "ascii-sweep", "laser"].includes(
    effect,
  );
}

export function forwardCanvasUiPointer(event: Event, receiver: HTMLElement, boundary = receiver) {
  if (!(event instanceof PointerEvent)) return;
  const forwarded = new PointerEvent(event.type, {
    bubbles: true,
    clientX: event.clientX,
    clientY: event.clientY,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    button: event.button,
    buttons: event.buttons,
    pressure: event.pressure,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  });
  // Preserve hit-test information for lenses without redispatching clicks or
  // letting window listeners process the same movement twice.
  Object.defineProperty(forwarded, "target", { value: event.target });
  const stop = (copy: Event) => copy.stopPropagation();
  boundary.addEventListener(event.type, stop);
  try {
    receiver.dispatchEvent(forwarded);
  } finally {
    boundary.removeEventListener(event.type, stop);
  }
}

export const CANVAS_UI_POINTER_EVENTS = [
  "pointermove",
  "pointerleave",
  "pointerdown",
  "pointerup",
  "pointercancel",
] as const;

export type CanvasUiBounds = { left: number; top: number; width: number; height: number };

export function canvasUiLocalBounds(
  source: CanvasUiBounds,
  host: CanvasUiBounds,
  width: number,
  height: number,
): CanvasUiBounds {
  const scaleX = host.width / (width || host.width || 1) || 1;
  const scaleY = host.height / (height || host.height || 1) || 1;
  return {
    left: (source.left - host.left) / scaleX,
    top: (source.top - host.top) / scaleY,
    width: source.width / scaleX,
    height: source.height / scaleY,
  };
}

export function canvasUiClipInsets(source: CanvasUiBounds, clips: CanvasUiBounds[]) {
  const left = Math.max(source.left, ...clips.map((clip) => clip.left));
  const top = Math.max(source.top, ...clips.map((clip) => clip.top));
  const right = Math.min(
    source.left + source.width,
    ...clips.map((clip) => clip.left + clip.width),
  );
  const bottom = Math.min(
    source.top + source.height,
    ...clips.map((clip) => clip.top + clip.height),
  );
  return {
    top: Math.max(0, top - source.top),
    left: Math.max(0, left - source.left),
    right: Math.max(0, source.left + source.width - right),
    bottom: Math.max(0, source.top + source.height - bottom),
    visible: right > left && bottom > top,
  };
}
