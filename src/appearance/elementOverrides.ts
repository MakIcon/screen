import type {
  AppearanceElementOverride,
  AppearanceElementPathSegment,
  AppearanceElementTarget,
} from "./types";
import type { CloseAnimationId, OpenAnimationId } from "./animations";
import type { TabKey } from "../types";

export const APPEARANCE_ELEMENT_PICK_REQUEST_EVENT = "appearance-element-pick-request";
export const APPEARANCE_ELEMENT_PICKED_EVENT = "appearance-element-picked";
export const APPEARANCE_ELEMENT_PICK_CANCEL_EVENT = "appearance-element-pick-cancel";
export const APPEARANCE_ELEMENT_REVEAL_EVENT = "appearance-element-reveal";
export const APPEARANCE_WINDOW_ANIMATION_PREVIEW_EVENT = "appearance-window-animation-preview";
export const APPEARANCE_DRAWING_CURSOR_EVENT = "appearance-drawing-cursor";

export type WindowAnimationPreviewPayload =
  | { kind: "opening"; animation: OpenAnimationId }
  | { kind: "closing"; animation: CloseAnimationId };

export type DrawingCursorPayload = {
  visible: boolean;
  x: number;
  y: number;
  size: number;
  color: string;
  eraser: boolean;
};

export function mapDrawingCursorToCover(
  payload: Pick<DrawingCursorPayload, "x" | "y" | "size">,
  viewportWidth: number,
  viewportHeight: number,
) {
  const coverScale = Math.max(viewportWidth / 960, viewportHeight / 540);
  const renderedWidth = 960 * coverScale;
  const renderedHeight = 540 * coverScale;
  return {
    x: payload.x * renderedWidth - (renderedWidth - viewportWidth) / 2,
    y: payload.y * renderedHeight - (renderedHeight - viewportHeight) / 2,
    diameter: Math.max(5, payload.size * coverScale),
  };
}

const OVERRIDE_ATTRIBUTE = "data-appearance-override";
const TARGET_ATTRIBUTE = "data-appearance-target-id";
const OVERRIDE_STYLE_ID = "appearance-element-overrides";
const MAX_TEXT_TARGET_DEPTH = 20;

const ELEMENT_SHADOWS: Record<NonNullable<AppearanceElementOverride["style"]["shadow"]>, string> = {
  none: "none",
  soft: "0 8px 24px rgba(0, 0, 0, 0.16)",
  strong: "0 14px 42px rgba(0, 0, 0, 0.32)",
  glow: "0 0 0 1px var(--accent), 0 0 24px color-mix(in srgb, var(--accent) 48%, transparent)",
};

type ActiveTextOverride = {
  original: string;
  applied: string;
};

const activeTextOverrides = new Map<Text, ActiveTextOverride>();

function pathSignature(path: AppearanceElementPathSegment[]) {
  return path.map((segment) => `${segment.tag}:${segment.index}:${segment.marker || ""}`).join("/");
}

function elementMarker(element: HTMLElement) {
  if (/^[a-z_][a-z0-9_-]{0,63}$/i.test(element.id)) return `id:${element.id}`;
  const className = Array.from(element.classList).find(
    (value) =>
      /^[a-z_][a-z0-9_-]{0,63}$/i.test(value) &&
      !/^(?:active|ready|unfolding|tearing|shredding|closing-|appearance-)/.test(value),
  );
  return className ? `class:${className}` : undefined;
}

function targetId(path: AppearanceElementPathSegment[], tab?: TabKey) {
  let hash = 2_166_136_261;
  for (const character of `${tab || "global"}@${pathSignature(path)}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `element-${(hash >>> 0).toString(36)}`;
}

function describeElement(element: HTMLElement) {
  const explicitLabel =
    element.getAttribute("aria-label") || element.getAttribute("title") || element.dataset.label;
  const text = (explicitLabel || element.innerText || element.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 52);
  const className = Array.from(element.classList)
    .find((value) => !value.includes("active") && !value.includes("appearance-"))
    ?.replace(/[-_]+/g, " ");

  return `${element.tagName}${text ? ` · ${text}` : className ? ` · ${className}` : ""}`;
}

function isEditableTextNode(node: Text) {
  if (!node.data.trim()) return false;
  const parent = node.parentElement;
  if (!parent || parent.closest("[aria-hidden='true'], script, style")) return false;
  const style = window.getComputedStyle(parent);
  return style.display !== "none" && style.visibility !== "hidden";
}

function findEditableTextNode(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node instanceof Text && isEditableTextNode(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  return walker.nextNode() as Text | null;
}

function createTextTarget(element: HTMLElement, preferredSource?: HTMLElement | null) {
  const preferred =
    preferredSource && element.contains(preferredSource)
      ? findEditableTextNode(preferredSource)
      : null;
  const textNode = preferred || findEditableTextNode(element);
  if (!textNode) return undefined;

  const path: number[] = [];
  let current: Node = textNode;
  while (current !== element) {
    const parent = current.parentNode;
    if (!parent) return undefined;
    const index = Array.prototype.indexOf.call(parent.childNodes, current) as number;
    if (index < 0 || index > 255) return undefined;
    path.unshift(index);
    current = parent;
  }

  const original = textNode.data.replace(/\s+/g, " ").trim();
  if (!original || path.length === 0 || path.length > MAX_TEXT_TARGET_DEPTH) return undefined;
  return { path, original: original.slice(0, 160) };
}

export function createElementTarget(
  root: HTMLElement,
  element: HTMLElement,
  tab?: TabKey,
  preferredTextSource?: HTMLElement | null,
): AppearanceElementTarget | null {
  if (element === root || !root.contains(element)) return null;

  const path: AppearanceElementPathSegment[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) return null;
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (candidate) => candidate.tagName.toLowerCase() === tag,
    );
    const marker = elementMarker(current);
    path.unshift({
      tag,
      index: siblings.indexOf(current),
      ...(marker ? { marker } : {}),
    });
    current = parent;
  }

  if (current !== root || path.length === 0 || path.length > 24) return null;
  const textTarget = createTextTarget(element, preferredTextSource);
  return {
    id: targetId(path, tab),
    label: describeElement(element),
    path,
    ...(tab ? { tab } : {}),
    ...(textTarget ? { textTarget } : {}),
  };
}

export function resolveElementTarget(
  root: HTMLElement,
  target: Pick<AppearanceElementTarget, "path">,
) {
  let current: HTMLElement = root;
  for (const segment of target.path) {
    const next = Array.from(current.children).filter(
      (candidate) => candidate.tagName.toLowerCase() === segment.tag,
    )[segment.index];
    if (!(next instanceof HTMLElement)) return null;
    if (segment.marker) {
      const [kind, marker] = segment.marker.split(":", 2);
      if (kind === "id" && next.id !== marker) return null;
      if (kind === "class" && !next.classList.contains(marker)) return null;
    }
    current = next;
  }
  return current;
}

export function resolveElementTextTarget(
  element: HTMLElement,
  target: Pick<AppearanceElementTarget, "textTarget">,
) {
  if (!target.textTarget) return null;
  let current: Node = element;
  for (const index of target.textTarget.path) {
    const next = current.childNodes[index];
    if (!next) return null;
    current = next;
  }
  return current instanceof Text ? current : null;
}

export function buildElementOverrideRule(override: AppearanceElementOverride) {
  const declarations: string[] = [];
  if (override.style.opacity !== undefined) {
    declarations.push(`opacity: ${override.style.opacity} !important`);
  }
  if (override.style.radius !== undefined) {
    declarations.push(`border-radius: ${override.style.radius}px !important`);
  }
  if (override.style.fontFamily) {
    declarations.push(`font-family: ${override.style.fontFamily} !important`);
  }
  if (override.style.fontSize !== undefined) {
    declarations.push(`font-size: ${override.style.fontSize}px !important`);
  }
  if (override.style.fontWeight !== undefined) {
    declarations.push(`font-weight: ${override.style.fontWeight} !important`);
  }
  if (override.style.letterSpacing !== undefined) {
    declarations.push(`letter-spacing: ${override.style.letterSpacing}px !important`);
  }
  if (override.style.lineHeight !== undefined) {
    declarations.push(`line-height: ${override.style.lineHeight} !important`);
  }
  if (override.style.textAlign) {
    declarations.push(`text-align: ${override.style.textAlign} !important`);
  }
  if (override.style.backgroundColor) {
    declarations.push(`background-color: ${override.style.backgroundColor} !important`);
  }
  if (override.style.textColor) {
    declarations.push(`color: ${override.style.textColor} !important`);
  }
  if (override.style.paddingX !== undefined) {
    declarations.push(`padding-left: ${override.style.paddingX}px !important`);
    declarations.push(`padding-right: ${override.style.paddingX}px !important`);
  }
  if (override.style.paddingY !== undefined) {
    declarations.push(`padding-top: ${override.style.paddingY}px !important`);
    declarations.push(`padding-bottom: ${override.style.paddingY}px !important`);
  }
  if (override.style.borderWidth !== undefined) {
    declarations.push(`border-width: ${override.style.borderWidth}px !important`);
    declarations.push(`border-style: solid !important`);
  }
  if (override.style.borderColor) {
    declarations.push(`border-color: ${override.style.borderColor} !important`);
  }
  if (override.style.shadow) {
    declarations.push(`box-shadow: ${ELEMENT_SHADOWS[override.style.shadow]} !important`);
  }
  if (override.style.scale !== undefined || override.style.rotate !== undefined) {
    declarations.push(
      `transform: rotate(${override.style.rotate ?? 0}deg) scale(${override.style.scale ?? 1}) !important`,
    );
    declarations.push("transform-origin: center !important");
  }
  if (declarations.length === 0) return "";
  const target = `[${OVERRIDE_ATTRIBUTE}="${override.id}"]`;
  // Individual edits must outrank the global custom-appearance rules, which
  // intentionally use !important to cover the launcher's existing components.
  return `html[data-appearance-custom="true"] .gallery-root ${target}${target}${target} { ${declarations.join("; ")} }`;
}

export function applyElementAppearanceOverrides(
  root: HTMLElement,
  overrides: AppearanceElementOverride[],
) {
  root.querySelectorAll<HTMLElement>(`[${OVERRIDE_ATTRIBUTE}]`).forEach((element) => {
    element.removeAttribute(OVERRIDE_ATTRIBUTE);
  });

  const rules: string[] = [];
  const nextTextNodes = new Set<Text>();
  for (const override of overrides) {
    const taggedElement = root.querySelector<HTMLElement>(`[${TARGET_ATTRIBUTE}="${override.id}"]`);
    const element = taggedElement || resolveElementTarget(root, override);
    if (!element) continue;
    element.setAttribute(TARGET_ATTRIBUTE, override.id);
    element.setAttribute(OVERRIDE_ATTRIBUTE, override.id);
    const rule = buildElementOverrideRule(override);
    if (rule) rules.push(rule);

    if (override.text !== undefined) {
      const textNode = resolveElementTextTarget(element, override);
      if (textNode) {
        nextTextNodes.add(textNode);
        const active = activeTextOverrides.get(textNode);
        if (!active) {
          activeTextOverrides.set(textNode, { original: textNode.data, applied: override.text });
        } else {
          // React may update a dynamic label (for example PLAY LAST -> WORKING).
          // Preserve that latest source value so removing the override restores it.
          if (textNode.data !== active.applied) active.original = textNode.data;
          active.applied = override.text;
        }
        if (textNode.data !== override.text) textNode.data = override.text;
      }
    }
  }

  for (const [textNode, active] of activeTextOverrides) {
    if (nextTextNodes.has(textNode)) continue;
    if (textNode.isConnected && textNode.data === active.applied) textNode.data = active.original;
    activeTextOverrides.delete(textNode);
  }

  let styleElement = document.getElementById(OVERRIDE_STYLE_ID) as HTMLStyleElement | null;
  if (rules.length === 0) {
    styleElement?.remove();
    return;
  }
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = OVERRIDE_STYLE_ID;
    document.head.append(styleElement);
  }
  styleElement.textContent = rules.join("\n");
}

function eventElement(event: Event, root: HTMLElement) {
  const rawTarget = event.target;
  const element =
    rawTarget instanceof HTMLElement
      ? rawTarget
      : rawTarget instanceof SVGElement
        ? rawTarget.parentElement
        : null;
  if (!element || element === root || !root.contains(element)) return null;
  if (element.closest(".paper-texture, .appearance-background")) return null;
  const interactive = element.closest<HTMLElement>(
    "button, input, select, textarea, label, [role='button']",
  );
  return {
    element:
      interactive && interactive !== root && root.contains(interactive) ? interactive : element,
    textSource: element,
  };
}

export function beginElementPicker(
  root: HTMLElement,
  onPicked: (target: AppearanceElementTarget) => void,
  onCancelled?: () => void,
  tab?: TabKey,
) {
  let highlighted: HTMLElement | null = null;

  const highlight = (element: HTMLElement | null) => {
    if (highlighted === element) return;
    highlighted?.classList.remove("appearance-pick-target");
    highlighted = element;
    highlighted?.classList.add("appearance-pick-target");
  };

  const cleanup = () => {
    highlight(null);
    root.classList.remove("appearance-picking");
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };

  const onPointerMove = (event: PointerEvent) =>
    highlight(eventElement(event, root)?.element ?? null);
  const onPointerDown = (event: PointerEvent) => {
    const candidate = eventElement(event, root);
    if (!candidate) return;
    const { element, textSource } = candidate;
    event.preventDefault();
    event.stopImmediatePropagation();
    const suppressClick = (clickEvent: MouseEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopImmediatePropagation();
      document.removeEventListener("click", suppressClick, true);
    };
    document.addEventListener("click", suppressClick, true);
    window.setTimeout(() => document.removeEventListener("click", suppressClick, true), 500);
    const target = createElementTarget(root, element, tab, textSource);
    if (target) element.setAttribute(TARGET_ATTRIBUTE, target.id);
    cleanup();
    if (target) onPicked(target);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cleanup();
    onCancelled?.();
  };

  root.classList.add("appearance-picking");
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  return cleanup;
}
