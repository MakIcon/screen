export interface GuidePoint {
  x: number;
  y: number;
}

export type GuideAction =
  | { kind: "wait"; duration: number }
  | { kind: "move"; target: string; duration: number; anchor?: "text" }
  | {
      kind: "press";
      target: string;
      duration?: number;
      anchor?: "text";
      activate?: (node: HTMLElement) => void;
    }
  | { kind: "type"; target: string; value: string; onChange: (value: string) => void }
  | {
      kind: "animate" | "drag";
      duration: number;
      target?: string;
      anchor?: "text";
      onFrame: (root: HTMLElement, progress: number) => void;
    };

export function guideTargetPoint(
  root: HTMLElement,
  target: HTMLElement,
  anchor?: "text",
): GuidePoint {
  const rootRect = root.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const rootStyle = window.getComputedStyle(root);
  // Both rectangles include the preview's scale and camera transform.
  // offsetHeight rounds auto-sized scenes; preserve their fractional CSS dimensions.
  const rootWidth =
    rootStyle.boxSizing === "border-box" ? parseFloat(rootStyle.width) : root.offsetWidth;
  const rootHeight =
    rootStyle.boxSizing === "border-box" ? parseFloat(rootStyle.height) : root.offsetHeight;
  const scaleX = rootRect.width / Math.max(1, rootWidth || root.offsetWidth);
  const scaleY = rootRect.height / Math.max(1, rootHeight || root.offsetHeight);
  const targetStyle = anchor === "text" ? window.getComputedStyle(target) : null;
  const targetScale = rect.width / Math.max(1, target.offsetWidth || rect.width);
  const textInset = targetStyle
    ? Math.min(
        ((parseFloat(targetStyle.paddingLeft) || 0) +
          (parseFloat(targetStyle.borderLeftWidth) || 0) +
          4) *
          targetScale,
        rect.width / 4,
      )
    : rect.width / 2;
  return {
    x:
      (rect.left - rootRect.left + textInset) / scaleX -
      (parseFloat(rootStyle.borderLeftWidth) || 0),
    y:
      (rect.top - rootRect.top + rect.height / 2) / scaleY -
      (parseFloat(rootStyle.borderTopWidth) || 0),
  };
}

export const guideEase = (progress: number) => progress * progress * (3 - 2 * progress);

/** Pan while zooming so the start of the text stays at the same screen position. */
export function guideSearchCameraTransform(focus: GuidePoint, zoom: number, destination = focus) {
  return `translate(${destination.x - focus.x * zoom}px, ${destination.y - focus.y * zoom}px) scale(${zoom})`;
}

/** One clock owns movement, mouse-down/up, camera movement and control updates. */
export function playGuideDemo(root: HTMLElement, pointer: HTMLElement, actions: GuideAction[]) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let frame = 0;
  let index = 0;
  let startedAt: number | null = null;
  let point: GuidePoint = { x: root.offsetWidth - 38, y: root.offsetHeight - 32 };
  let start = point;
  let pressedNode: HTMLElement | null = null;
  let hoverNode: HTMLElement | null = null;
  let typedLength = -1;
  let cancelled = false;

  const find = (selector: string) =>
    root.matches(selector) ? root : root.querySelector<HTMLElement>(selector);
  const place = (next: GuidePoint) => {
    point = next;
    pointer.style.left = `${next.x}px`;
    pointer.style.top = `${next.y}px`;
  };
  const durationOf = (action: GuideAction) => {
    if (reducedMotion) return 0;
    if (action.kind === "type") return Math.max(1, Array.from(action.value).length) * 105;
    if (action.kind === "press") return action.duration ?? 160;
    return action.duration;
  };
  const release = () => {
    pressedNode?.classList.remove("launcher-guide-demo-press");
    pressedNode?.classList.remove("es-thumb--active");
    pressedNode = null;
    pointer.classList.remove("is-pressed");
  };
  place(point);
  pointer.style.opacity = "0";

  const tick = (now: number) => {
    if (cancelled) return;
    const action = actions[index];
    if (!action) {
      release();
      hoverNode?.classList.remove("launcher-guide-demo-hover");
      pointer.style.opacity = "0";
      return;
    }
    const node = "target" in action && action.target ? find(action.target) : null;
    if (startedAt === null) {
      startedAt = now;
      start = point;
      typedLength = -1;
      if (action.kind !== "wait") pointer.style.opacity = "1";
      if ((action.kind === "press" || action.kind === "drag") && node) {
        pressedNode = node;
        node.classList.add("launcher-guide-demo-press");
        pointer.classList.add("is-pressed");
        if (action.kind === "drag") node.classList.add("es-thumb--active");
      }
    }
    const duration = durationOf(action);
    const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);

    if (action.kind === "move" && node) {
      const target = guideTargetPoint(root, node, action.anchor);
      const eased = guideEase(progress);
      place({
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
      });
      if (progress === 1) {
        hoverNode?.classList.remove("launcher-guide-demo-hover");
        hoverNode = node;
        node.classList.add("launcher-guide-demo-hover");
      }
    } else if (action.kind === "animate" || action.kind === "drag") {
      action.onFrame(root, reducedMotion ? 1 : guideEase(progress));
      // Measure after updating the control: the arrow tip follows the actual thumb.
      if (node) place(guideTargetPoint(root, node, action.anchor));
    } else if (action.kind === "press" && node) {
      place(guideTargetPoint(root, node, action.anchor));
    } else if (action.kind === "type") {
      const characters = Array.from(action.value);
      const length = Math.floor(progress * characters.length);
      if (length !== typedLength) {
        typedLength = length;
        action.onChange(characters.slice(0, length).join(""));
      }
    }

    if (progress === 1) {
      if (action.kind === "drag") release();
      if (action.kind === "press") {
        release();
        // Only sandbox components (or handler-free DOM replicas) are passed here.
        if (node) (action.activate ?? ((element) => element.click()))(node);
      }
      index += 1;
      startedAt = null;
    }
    frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
    release();
    hoverNode?.classList.remove("launcher-guide-demo-hover");
    pointer.style.opacity = "0";
  };
}
