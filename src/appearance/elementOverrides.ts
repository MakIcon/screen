import type {
  AppearanceElementComponentTarget,
  AppearanceElementKind,
  AppearanceElementOverride,
  AppearanceElementPathSegment,
  AppearanceElementTarget,
} from "./types";
import {
  APPEARANCE_COMPONENT_ATTRIBUTE,
  APPEARANCE_COMPONENT_PROPS_ATTRIBUTE,
  APPEARANCE_COMPONENT_SETTINGS_ATTRIBUTE,
} from "./useAppearanceComponentSettings";
import type { CloseAnimationId, OpenAnimationId } from "./animations";
import type { TabKey } from "../types";
import {
  APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE,
  APPEARANCE_TEXT_TEMPLATE_ATTRIBUTE,
  parseAppearancePlaceholderValues,
  resolveAppearancePlaceholderTemplate,
} from "../utils/placeholders";
import { buildElementGradientImage } from "./elementGradient";

export const APPEARANCE_ELEMENT_PICK_REQUEST_EVENT = "appearance-element-pick-request";
export const APPEARANCE_ELEMENT_PICKED_EVENT = "appearance-element-picked";
export const APPEARANCE_ELEMENT_PICK_CANCEL_EVENT = "appearance-element-pick-cancel";
export const APPEARANCE_ELEMENT_REVEAL_EVENT = "appearance-element-reveal";
export const APPEARANCE_ELEMENT_PREVIEW_EVENT = "appearance-element-preview";
export const APPEARANCE_ELEMENT_SELECTION_EVENT = "appearance-element-selection";
export const APPEARANCE_WINDOW_ANIMATION_PREVIEW_EVENT = "appearance-window-animation-preview";
export const APPEARANCE_DRAWING_CURSOR_EVENT = "appearance-drawing-cursor";

export type AppearanceElementPreviewPayload = {
  customized: boolean;
  elementOverrides: AppearanceElementOverride[];
};

export type AppearanceElementPickedPayload =
  | AppearanceElementTarget
  | { target: AppearanceElementTarget; additive: boolean; continuing?: boolean };

export type AppearanceElementSelectionPayload = {
  targets: AppearanceElementTarget[];
  previewHover?: boolean;
};

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
    diameter: payload.size * coverScale,
  };
}

function opacityPercentage(opacity: number) {
  return Math.round(opacity * 10_000) / 100;
}

function colorWithOpacity(color: string, opacity: number) {
  return `color-mix(in srgb, ${color} ${opacityPercentage(opacity)}%, transparent)`;
}

function backgroundImageWithOpacity(backgroundImage: string, opacity: number) {
  return backgroundImage.replace(/rgba?\([^()]*\)|#[0-9a-f]{3,8}|\btransparent\b/gi, (color) =>
    colorWithOpacity(color, opacity),
  );
}

function hasVisibleBackground(style: CSSStyleDeclaration) {
  if (style.backgroundImage && style.backgroundImage !== "none") return true;
  const color = style.backgroundColor.replace(/\s+/g, "").toLowerCase();
  return Boolean(color) && color !== "transparent" && !/^rgba\([^)]*,0(?:\.0+)?\)$/.test(color);
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

type ActiveElementBindings = {
  elements: Map<string, HTMLElement>;
};

const activeElementBindings = new WeakMap<HTMLElement, ActiveElementBindings>();

function getActiveElementBindings(root: HTMLElement): ActiveElementBindings {
  const existing = activeElementBindings.get(root);
  if (existing) return existing;

  const elements = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>(`[${OVERRIDE_ATTRIBUTE}]`).forEach((element) => {
    const id = element.getAttribute(OVERRIDE_ATTRIBUTE);
    if (id) elements.set(id, element);
  });
  const bindings = { elements };
  activeElementBindings.set(root, bindings);
  return bindings;
}

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

function readNormalElementOpacity(
  root: HTMLElement,
  path: AppearanceElementPathSegment[],
): number | undefined {
  const rootRect = root.getBoundingClientRect();
  const clone = root.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return undefined;

  clone
    .querySelectorAll<HTMLElement>(`.appearance-hover-preview, .appearance-pick-selected`)
    .forEach((candidate) =>
      candidate.classList.remove("appearance-hover-preview", "appearance-pick-selected"),
    );
  clone.style.setProperty("position", "fixed", "important");
  clone.style.setProperty(
    "left",
    `${-Math.max(2_000, Math.ceil(rootRect.width) + 100)}px`,
    "important",
  );
  clone.style.setProperty("top", "0", "important");
  clone.style.setProperty("width", `${rootRect.width}px`, "important");
  clone.style.setProperty("height", `${rootRect.height}px`, "important");
  clone.style.setProperty("visibility", "hidden", "important");
  clone.style.setProperty("pointer-events", "none", "important");
  clone.setAttribute("aria-hidden", "true");
  clone.inert = true;

  document.body.appendChild(clone);
  try {
    const clonedElement = resolveElementTarget(clone, { path });
    if (!clonedElement) return undefined;
    const opacity = Number.parseFloat(window.getComputedStyle(clonedElement).opacity);
    return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : undefined;
  } finally {
    clone.remove();
  }
}

function readElementDefaults(
  element: HTMLElement,
  root: HTMLElement,
  path: AppearanceElementPathSegment[],
) {
  const overrideId = element.getAttribute(OVERRIDE_ATTRIBUTE);
  if (overrideId) element.removeAttribute(OVERRIDE_ATTRIBUTE);
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);
  const before = window.getComputedStyle(element, "::before");
  const after = window.getComputedStyle(element, "::after");
  const computedMinWidth = computed.minWidth;
  const computedMinHeight = computed.minHeight;

  const originalTransition = element.style.getPropertyValue("transition");
  const originalTransitionPriority = element.style.getPropertyPriority("transition");
  element.style.setProperty("transition", "none", "important");
  const hoveredElementOpacity = Number.parseFloat(window.getComputedStyle(element).opacity);
  const normalElementOpacity = readNormalElementOpacity(root, path);

  const matchesAutoSize = (property: "width" | "height", measuredSize: number) => {
    const originalValue = element.style.getPropertyValue(property);
    const originalPriority = element.style.getPropertyPriority(property);
    element.style.setProperty(property, "auto", "important");
    const autoSize = element.getBoundingClientRect()[property];
    if (originalValue) element.style.setProperty(property, originalValue, originalPriority);
    else element.style.removeProperty(property);
    return Math.abs(autoSize - measuredSize) <= 0.75;
  };

  const widthAuto = matchesAutoSize("width", rect.width);
  const heightAuto = matchesAutoSize("height", rect.height);

  if (originalTransition) {
    element.style.setProperty("transition", originalTransition, originalTransitionPriority);
  } else {
    element.style.removeProperty("transition");
  }
  if (overrideId) element.setAttribute(OVERRIDE_ATTRIBUTE, overrideId);

  const round = (value: number) => Math.max(0, Math.round(value * 100) / 100);
  const cssSize = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? round(parsed) : 0;
  };

  return {
    width: round(rect.width),
    height: round(rect.height),
    minWidth: cssSize(computedMinWidth),
    minHeight: cssSize(computedMinHeight),
    backgroundColor: computed.backgroundColor,
    backgroundImage: computed.backgroundImage,
    backgroundBefore: hasVisibleBackground(before),
    backgroundAfter: hasVisibleBackground(after),
    beforeOpacity: Number.parseFloat(before.opacity) || 0,
    afterOpacity: Number.parseFloat(after.opacity) || 0,
    ...(normalElementOpacity !== undefined ? { elementOpacity: normalElementOpacity } : {}),
    ...(Number.isFinite(hoveredElementOpacity)
      ? { hoverElementOpacity: Math.min(1, Math.max(0, hoveredElementOpacity)) }
      : {}),
    textColor: computed.color,
    widthAuto,
    heightAuto,
    minWidthAuto: computedMinWidth === "auto",
    minHeightAuto: computedMinHeight === "auto",
  };
}

function readComponentTarget(element: HTMLElement): AppearanceElementComponentTarget | undefined {
  const kind = element.getAttribute(APPEARANCE_COMPONENT_ATTRIBUTE);
  if (!kind || !["slider", "toggle", "checkbox", "dropdown"].includes(kind)) return undefined;
  const rawProps = element.getAttribute(APPEARANCE_COMPONENT_PROPS_ATTRIBUTE);
  if (!rawProps) return undefined;
  try {
    const props = JSON.parse(rawProps) as unknown;
    if (!props || typeof props !== "object" || Array.isArray(props)) return undefined;
    return { kind, props } as AppearanceElementComponentTarget;
  } catch {
    return undefined;
  }
}

function inferElementKind(
  element: HTMLElement,
  component?: AppearanceElementComponentTarget,
): AppearanceElementKind {
  if (component) return component.kind;
  if (element.dataset.appearanceLayoutContainer === "true") return "list";
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  if (element.classList.contains("csa-root")) return "container";
  if (tag === "button" || role === "button") return "button";
  if (tag === "input" || tag === "textarea") return "input";
  if (tag === "select") return "select";
  if (tag === "ul" || tag === "ol" || /(?:^|-)(?:list|grid|menu)(?:-|$)/.test(element.className)) {
    return "list";
  }
  if (element.children.length > 0) return "container";
  return "text";
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
  const templateOwner = textNode.parentElement?.closest<HTMLElement>(
    `[${APPEARANCE_TEXT_TEMPLATE_ATTRIBUTE}]`,
  );
  const template = templateOwner
    ?.getAttribute(APPEARANCE_TEXT_TEMPLATE_ATTRIBUTE)
    ?.trim()
    .slice(0, 160);
  const placeholderOwner = textNode.parentElement?.closest<HTMLElement>(
    `[${APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE}]`,
  );
  const placeholderValues = parseAppearancePlaceholderValues(
    placeholderOwner?.getAttribute(APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE),
  );
  return {
    path,
    original: original.slice(0, 160),
    ...(template ? { template } : {}),
    ...(Object.keys(placeholderValues).length > 0 ? { placeholderValues } : {}),
  };
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
  const component = readComponentTarget(element);
  const defaults = readElementDefaults(element, root, path);
  // Component roots expose their editable copy through typed props. A raw text-node
  // replacement would be overwritten by React (and could accidentally target a slider tick).
  const textTarget = component ? undefined : createTextTarget(element, preferredTextSource);
  return {
    id: targetId(path, tab),
    label: describeElement(element),
    path,
    ...(tab ? { tab } : {}),
    ...(textTarget ? { textTarget } : {}),
    defaults,
    kind: inferElementKind(element, component),
    ...(component ? { component } : {}),
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

function buildElementOverrideStateRule(
  sourceOverride: AppearanceElementOverride,
  style: AppearanceElementOverride["style"],
  interactionState: "normal" | "hover",
) {
  const override: AppearanceElementOverride = { ...sourceOverride, style };
  const declarations: string[] = [];
  const descendantTypographyDeclarations: string[] = [];
  const legacyWidthZero = override.style.width === 0 && override.defaults?.widthAuto === undefined;
  const legacyHeightZero =
    override.style.height === 0 && override.defaults?.heightAuto === undefined;
  if (override.style.width !== undefined && !legacyWidthZero) {
    const width =
      override.style.width === 0 && override.defaults?.widthAuto !== false
        ? "auto"
        : `${override.style.width}px`;
    declarations.push(`width: ${width} !important`);
  }
  if (override.style.height !== undefined && !legacyHeightZero) {
    const height =
      override.style.height === 0 && override.defaults?.heightAuto !== false
        ? "auto"
        : `${override.style.height}px`;
    declarations.push(`height: ${height} !important`);
  }
  if (override.style.minWidth !== undefined) {
    const minWidth =
      override.style.minWidth === 0 && override.defaults?.minWidthAuto === true
        ? "auto"
        : `${override.style.minWidth}px`;
    declarations.push(`min-width: ${minWidth} !important`);
  }
  if (override.style.minHeight !== undefined) {
    const minHeight =
      override.style.minHeight === 0 && override.defaults?.minHeightAuto === true
        ? "auto"
        : `${override.style.minHeight}px`;
    declarations.push(`min-height: ${minHeight} !important`);
  }
  if (override.style.elementOpacity !== undefined) {
    declarations.push(`opacity: ${override.style.elementOpacity} !important`);
  } else if (
    override.style.opacity !== undefined &&
    override.style.backgroundOpacity === undefined &&
    override.style.contentOpacity === undefined
  ) {
    declarations.push(`opacity: ${override.style.opacity} !important`);
  }
  if (override.style.radius !== undefined) {
    declarations.push(`border-radius: ${override.style.radius}px !important`);
  }
  if (override.style.fontFamily) {
    declarations.push(`font-family: ${override.style.fontFamily} !important`);
    descendantTypographyDeclarations.push(`font-family: ${override.style.fontFamily} !important`);
  }
  if (override.style.fontSize !== undefined) {
    declarations.push(`font-size: ${override.style.fontSize}px !important`);
    descendantTypographyDeclarations.push(`font-size: ${override.style.fontSize}px !important`);
  }
  if (override.style.fontWeight !== undefined) {
    declarations.push(`font-weight: ${override.style.fontWeight} !important`);
    descendantTypographyDeclarations.push(`font-weight: ${override.style.fontWeight} !important`);
  }
  if (override.style.letterSpacing !== undefined) {
    declarations.push(`letter-spacing: ${override.style.letterSpacing}px !important`);
    descendantTypographyDeclarations.push(
      `letter-spacing: ${override.style.letterSpacing}px !important`,
    );
  }
  if (override.style.lineHeight !== undefined) {
    declarations.push(`line-height: ${override.style.lineHeight} !important`);
    descendantTypographyDeclarations.push(`line-height: ${override.style.lineHeight} !important`);
  }
  if (override.style.textAlign) {
    declarations.push(`text-align: ${override.style.textAlign} !important`);
  }
  const backgroundOpacity = override.style.backgroundOpacity ?? 1;
  const backgroundColor = override.style.backgroundColor ?? override.defaults?.backgroundColor;
  const backgroundImage = override.defaults?.backgroundImage;
  const usesCustomGradient =
    override.style.backgroundKind === "gradient" &&
    ((override.style.backgroundGradientStops?.length ?? 0) >= 2 ||
      Boolean(override.style.backgroundGradientStart && override.style.backgroundGradientEnd));
  if (usesCustomGradient) {
    const firstStop = override.style.backgroundGradientStops?.[0];
    const lastStop =
      override.style.backgroundGradientStops?.[override.style.backgroundGradientStops.length - 1];
    const start =
      override.style.backgroundGradientStart ?? firstStop?.color ?? backgroundColor ?? "#000000";
    const end = override.style.backgroundGradientEnd ?? lastStop?.color ?? start;
    declarations.push("background-color: transparent !important");
    // Keep translucent borders visually independent from the gradient. Without
    // this, CSS paints the background underneath the border and its color leaks
    // through, making the outline look like a reflected copy of the gradient.
    declarations.push("background-clip: padding-box !important");
    declarations.push(
      `background-image: ${buildElementGradientImage(override.style, start, end, {
        baseColor: backgroundColor ?? start,
        opacity: backgroundOpacity,
      })} !important`,
    );
  } else {
    if (override.style.backgroundKind === "solid") {
      declarations.push("background-image: none !important");
    }
    if (override.style.backgroundOpacity !== undefined && backgroundColor) {
      declarations.push(
        `background-color: ${colorWithOpacity(backgroundColor, backgroundOpacity)} !important`,
      );
    } else if (override.style.backgroundColor) {
      declarations.push(`background-color: ${override.style.backgroundColor} !important`);
    }
    if (
      override.style.backgroundOpacity !== undefined &&
      backgroundImage &&
      backgroundImage !== "none"
    ) {
      declarations.push(
        `background-image: ${backgroundImageWithOpacity(backgroundImage, backgroundOpacity)} !important`,
      );
    }
  }
  const textColor = override.style.textColor ?? override.defaults?.textColor;
  if (override.style.contentOpacity !== undefined && textColor) {
    declarations.push(
      `color: ${colorWithOpacity(textColor, override.style.contentOpacity)} !important`,
    );
  } else if (override.style.textColor) {
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
  if (
    override.kind === "list" &&
    (override.style.layout === "row" || override.style.layout === "column")
  ) {
    declarations.push("display: flex !important");
    declarations.push(`flex-direction: ${override.style.layout} !important`);
  }
  if (override.kind === "list" && override.style.layout === "grid") {
    declarations.push("display: grid !important");
    declarations.push(
      `grid-template-columns: repeat(${override.style.columns ?? 2}, minmax(0, 1fr)) !important`,
    );
    declarations.push("align-content: start !important");
    declarations.push("align-items: start !important");
    declarations.push("position: relative !important");
  }
  if (override.kind === "list" && override.style.gap !== undefined) {
    declarations.push(`gap: ${override.style.gap}px !important`);
  }
  if (override.style.contentOpacity !== undefined) {
    declarations.push(
      `--appearance-element-content-opacity: ${override.style.contentOpacity} !important`,
    );
  }
  if (declarations.length === 0) return "";
  const target = `[${OVERRIDE_ATTRIBUTE}="${override.id}"]`;
  // Individual edits must outrank the global custom-appearance rules, which
  // intentionally use !important to cover the launcher's existing components.
  const baseSelector = `html[data-appearance-custom="true"] .gallery-root ${target}${target}${target}`;
  const selectors =
    interactionState === "hover"
      ? [`${baseSelector}:hover`, `${baseSelector}.appearance-hover-preview`]
      : [baseSelector];
  const selector = selectors.join(", ");
  const rules = [`${selector} { ${declarations.join("; ")} }`];
  if (descendantTypographyDeclarations.length > 0) {
    rules.push(
      `${selectors.map((item) => `${item} *`).join(", ")} { ${descendantTypographyDeclarations.join("; ")} }`,
    );
  }
  const backgroundPseudoStates = [
    override.defaults?.backgroundBefore
      ? { pseudo: "::before", opacity: override.defaults.beforeOpacity ?? 1 }
      : null,
    override.defaults?.backgroundAfter
      ? { pseudo: "::after", opacity: override.defaults.afterOpacity ?? 1 }
      : null,
  ].filter((entry): entry is { pseudo: string; opacity: number } => entry !== null);
  const backgroundPseudos = backgroundPseudoStates.flatMap((entry) =>
    selectors.map((item) => ({ selector: `${item}${entry.pseudo}`, opacity: entry.opacity })),
  );
  if (override.style.backgroundKind && backgroundPseudos.length > 0) {
    rules.push(
      `${backgroundPseudos.map((entry) => entry.selector).join(", ")} { background: transparent !important; }`,
    );
  } else if (override.style.backgroundOpacity !== undefined && backgroundPseudos.length > 0) {
    rules.push(
      ...backgroundPseudos.map(
        (entry) =>
          `${entry.selector} { opacity: ${Math.round(entry.opacity * backgroundOpacity * 10_000) / 10_000} !important; }`,
      ),
    );
  }
  if (override.style.contentOpacity !== undefined) {
    const contentOpacity = override.style.contentOpacity;
    rules.push(
      `${selectors.map((item) => `${item} > *`).join(", ")} { opacity: ${contentOpacity} !important; }`,
      `${selectors.map((item) => `${item}::placeholder`).join(", ")} { opacity: ${contentOpacity} !important; }`,
    );
  }
  if (override.kind === "list" && override.style.layout === "grid") {
    rules.push(
      `${selectors.map((item) => `${item} > *`).join(", ")} { min-width: 0 !important; max-width: 100% !important; margin-bottom: 0 !important; box-sizing: border-box !important; }`,
      `${selectors.map((item) => `${item} .mod-card-head`).join(", ")} { flex-wrap: wrap !important; }`,
      `${selectors.map((item) => `${item} .mod-card-head > div:last-child`).join(", ")} { max-width: 100% !important; flex-wrap: wrap !important; }`,
      `${selectors.map((item) => `${item} .mod-card-project`).join(", ")} { min-width: 0 !important; flex: 1 1 180px !important; }`,
      `${selectors.map((item) => `${item} .mod-meta-strip`).join(", ")} { min-width: 0 !important; flex-wrap: wrap !important; }`,
      `${selectors.map((item) => `${item} > [data-appearance-grid-ignore="true"]`).join(", ")} { position: absolute !important; width: 100% !important; visibility: hidden !important; pointer-events: none !important; }`,
    );
  }
  return rules.join("\n");
}

export function buildElementOverrideRule(override: AppearanceElementOverride) {
  const normalRule = buildElementOverrideStateRule(override, override.style, "normal");
  if (!override.hoverStyle || Object.keys(override.hoverStyle).length === 0) return normalRule;

  const target = `[${OVERRIDE_ATTRIBUTE}="${override.id}"]`;
  const selector = `html[data-appearance-custom="true"] .gallery-root ${target}${target}${target}`;
  const transitionSelectors = [
    selector,
    `${selector}::before`,
    `${selector}::after`,
    `${selector}::placeholder`,
    `${selector} > *`,
    `${selector} *`,
  ].join(", ");
  const transitionRule = `${transitionSelectors} { transition-property: all !important; transition-duration: ${override.hoverTransitionMs ?? 200}ms !important; transition-timing-function: ${override.hoverEasing ?? "ease"} !important; transition-delay: 0ms !important; }`;
  const hoverRule = buildElementOverrideStateRule(
    override,
    { ...override.style, ...override.hoverStyle },
    "hover",
  );
  return [normalRule, transitionRule, hoverRule].filter(Boolean).join("\n");
}

export function applyElementAppearanceOverrides(
  root: HTMLElement,
  overrides: AppearanceElementOverride[],
) {
  const bindings = getActiveElementBindings(root);
  const previousElements = bindings.elements;
  const nextElements = new Map<string, HTMLElement>();
  const rules: string[] = [];
  const nextTextNodes = new Set<Text>();
  for (const override of overrides) {
    const previouslyBound = previousElements.get(override.id);
    const taggedElement =
      previouslyBound?.isConnected && root.contains(previouslyBound)
        ? previouslyBound
        : root.querySelector<HTMLElement>(`[${TARGET_ATTRIBUTE}="${override.id}"]`);
    const element = taggedElement || resolveElementTarget(root, override);
    if (!element) continue;
    nextElements.set(override.id, element);
    element.setAttribute(TARGET_ATTRIBUTE, override.id);
    element.setAttribute(OVERRIDE_ATTRIBUTE, override.id);
    if (
      override.componentSettings &&
      element.getAttribute(APPEARANCE_COMPONENT_ATTRIBUTE) === override.componentSettings.kind
    ) {
      element.setAttribute(
        APPEARANCE_COMPONENT_SETTINGS_ATTRIBUTE,
        JSON.stringify(override.componentSettings.settings),
      );
    } else {
      element.removeAttribute(APPEARANCE_COMPONENT_SETTINGS_ATTRIBUTE);
    }
    const rule = buildElementOverrideRule(override);
    if (rule) rules.push(rule);

    if (override.text !== undefined) {
      const textNode = resolveElementTextTarget(element, override);
      if (textNode) {
        const placeholderOwner = textNode.parentElement?.closest<HTMLElement>(
          `[${APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE}]`,
        );
        const appliedText = resolveAppearancePlaceholderTemplate(
          override.text,
          placeholderOwner?.getAttribute(APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE),
        );
        nextTextNodes.add(textNode);
        const active = activeTextOverrides.get(textNode);
        if (!active) {
          activeTextOverrides.set(textNode, { original: textNode.data, applied: appliedText });
        } else {
          // React may update a dynamic label (for example PLAY LAST -> WORKING).
          // Preserve that latest source value so removing the override restores it.
          if (textNode.data !== active.applied) active.original = textNode.data;
          active.applied = appliedText;
        }
        if (textNode.data !== appliedText) textNode.data = appliedText;
      }
    }
  }

  const activeElements = new Set(nextElements.values());
  for (const [id, element] of previousElements) {
    if (nextElements.get(id) === element) continue;
    if (element.getAttribute(OVERRIDE_ATTRIBUTE) === id) {
      element.removeAttribute(OVERRIDE_ATTRIBUTE);
    }
    if (!activeElements.has(element)) {
      element.removeAttribute(APPEARANCE_COMPONENT_SETTINGS_ATTRIBUTE);
    }
  }
  bindings.elements = nextElements;

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
  const component = element.closest<HTMLElement>(`[${APPEARANCE_COMPONENT_ATTRIBUTE}]`);
  const interactive = element.closest<HTMLElement>(
    "button, input, select, textarea, label, [role='button'], [role='switch'], [role='slider'], [role='checkbox'], [role='option']",
  );
  const textBoundary = component ?? root;
  let textElement: HTMLElement | null = element;
  while (textElement && textElement !== textBoundary) {
    const hasDirectText = Array.from(textElement.childNodes).some(
      (node) => node.nodeType === 3 && Boolean(node.textContent?.trim()),
    );
    if (hasDirectText) break;
    textElement = textElement.parentElement;
  }
  if (textElement === textBoundary) {
    const boundaryHasDirectText = Array.from(textElement.childNodes).some(
      (node) => node.nodeType === 3 && Boolean(node.textContent?.trim()),
    );
    if (!boundaryHasDirectText) textElement = null;
  }

  return {
    element:
      textElement && textElement !== root && root.contains(textElement)
        ? textElement
        : interactive && interactive !== root && root.contains(interactive)
          ? interactive
          : component && component !== root && root.contains(component)
            ? component
            : element,
    textSource: element,
  };
}

export function beginElementPicker(
  root: HTMLElement,
  onPicked: (target: AppearanceElementTarget, additive: boolean, continuing: boolean) => void,
  onCancelled?: () => void,
  tab?: TabKey,
) {
  let highlighted: HTMLElement | null = null;
  let additivePicks = 0;

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
    if (!target) return;
    const additive = event.shiftKey || additivePicks > 0;
    onPicked(target, additive, event.shiftKey);
    if (event.shiftKey) {
      additivePicks += 1;
      highlight(null);
    } else {
      cleanup();
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cleanup();
    if (additivePicks === 0) onCancelled?.();
  };

  root.classList.add("appearance-picking");
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  return cleanup;
}
