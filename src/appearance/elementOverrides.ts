import type {
  AppearanceElementComponentTarget,
  AppearanceElementKind,
  AppearanceElementInteractionState,
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
import { buildElementGradientImage, buildElementTextGradientImage } from "./elementGradient";
import { buildGradientAnimationKeyframes, resolveGradientAnimation } from "./gradientAnimation";

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
  previewState?: AppearanceElementInteractionState;
  /** Legacy payload field used by older Studio windows. */
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

function grainTexture(opacity: number) {
  const alpha = Math.round(Math.max(0, Math.min(0.6, opacity)) * 100) / 100;
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${alpha} 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
}

function hasVisibleBackground(style: CSSStyleDeclaration) {
  if (style.backgroundImage && style.backgroundImage !== "none") return true;
  const color = style.backgroundColor.replace(/\s+/g, "").toLowerCase();
  return Boolean(color) && color !== "transparent" && !/^rgba\([^)]*,0(?:\.0+)?\)$/.test(color);
}

const OVERRIDE_ATTRIBUTE = "data-appearance-override";
const TARGET_ATTRIBUTE = "data-appearance-target-id";
export const LIQUID_GLASS_ATTRIBUTE = "data-appearance-liquid-glass";
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
  const follow = (start: HTMLElement, path: AppearanceElementPathSegment[]) => {
    let current = start;
    for (const segment of path) {
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
  };
  const direct = follow(root, target.path);
  if (direct) return direct;
  // Resolve saved paths after transient launcher containers change.
  const anchor = target.path.findIndex((segment) => segment.marker === "class:ui-container");
  if (anchor >= 0) {
    const launchers = root.querySelectorAll<HTMLElement>(".ui-container");
    if (launchers.length === 1) return follow(launchers[0], target.path.slice(anchor + 1));
  }
  return null;
}

export function resolveElementTextTarget(
  element: HTMLElement,
  target: Pick<AppearanceElementTarget, "textTarget">,
) {
  if (!target.textTarget) return null;
  let current: Node = element;
  for (const index of target.textTarget.path) {
    const stableChildren = Array.from(current.childNodes).filter(
      (node) =>
        !(node instanceof HTMLCanvasElement) || node.dataset.appearanceLiquidGlassCanvas !== "true",
    );
    const next = stableChildren[index];
    if (!next) return null;
    current = next;
  }
  return current instanceof Text ? current : null;
}

function buildElementOverrideStateRule(
  sourceOverride: AppearanceElementOverride,
  style: AppearanceElementOverride["style"],
  interactionState: AppearanceElementInteractionState,
) {
  const override: AppearanceElementOverride = { ...sourceOverride, style };
  const declarations: string[] = [];
  const descendantTypographyDeclarations: string[] = [];
  const generatedRules: string[] = [];
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
  if (override.style.textDecoration) {
    declarations.push(`text-decoration-line: ${override.style.textDecoration} !important`);
  }
  if (override.style.textDecorationStyle) {
    declarations.push(`text-decoration-style: ${override.style.textDecorationStyle} !important`);
  }
  if (override.style.textDecorationColor) {
    declarations.push(`text-decoration-color: ${override.style.textDecorationColor} !important`);
  }
  if (override.style.textDecorationThickness !== undefined) {
    declarations.push(
      `text-decoration-thickness: ${override.style.textDecorationThickness}px !important`,
    );
  }
  if (override.style.textUnderlineOffset !== undefined) {
    declarations.push(`text-underline-offset: ${override.style.textUnderlineOffset}px !important`);
  }
  if (override.style.textTransform) {
    declarations.push(`text-transform: ${override.style.textTransform} !important`);
  }
  const hasTextShadow =
    override.style.textShadowColor !== undefined ||
    override.style.textShadowX !== undefined ||
    override.style.textShadowY !== undefined ||
    override.style.textShadowBlur !== undefined;
  if (hasTextShadow) {
    declarations.push(
      `text-shadow: ${override.style.textShadowX ?? 0}px ${override.style.textShadowY ?? 2}px ${override.style.textShadowBlur ?? 0}px ${override.style.textShadowColor ?? "rgba(0, 0, 0, 0.35)"} !important`,
    );
  }
  if (override.style.textStrokeWidth !== undefined) {
    declarations.push(
      `-webkit-text-stroke: ${override.style.textStrokeWidth}px ${override.style.textStrokeColor ?? "currentColor"} !important`,
    );
  }
  const backgroundOpacity = override.style.backgroundOpacity ?? 1;
  const backgroundColor = override.style.backgroundColor ?? override.defaults?.backgroundColor;
  const backgroundImage = override.defaults?.backgroundImage;
  let resolvedSurfaceColor = backgroundColor;
  let resolvedBackgroundImage =
    backgroundImage && backgroundImage !== "none" ? backgroundImage : undefined;
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
    resolvedBackgroundImage = buildElementGradientImage(override.style, start, end, {
      baseColor: backgroundColor ?? start,
      opacity: backgroundOpacity,
    });
    declarations.push(`background-image: ${resolvedBackgroundImage} !important`);
  } else {
    if (override.style.backgroundKind === "solid") {
      declarations.push("background-image: none !important");
      resolvedBackgroundImage = undefined;
    }
    if (override.style.backgroundOpacity !== undefined && backgroundColor) {
      resolvedSurfaceColor = colorWithOpacity(backgroundColor, backgroundOpacity);
      declarations.push(`background-color: ${resolvedSurfaceColor} !important`);
    } else if (override.style.backgroundColor) {
      declarations.push(`background-color: ${override.style.backgroundColor} !important`);
    }
    if (
      override.style.backgroundOpacity !== undefined &&
      backgroundImage &&
      backgroundImage !== "none"
    ) {
      resolvedBackgroundImage = backgroundImageWithOpacity(backgroundImage, backgroundOpacity);
      declarations.push(`background-image: ${resolvedBackgroundImage} !important`);
    }
  }
  if (override.style.glassEffect) {
    const tint = override.style.glassTint ?? backgroundColor ?? "#ffffff";
    resolvedSurfaceColor = colorWithOpacity(tint, override.style.glassOpacity ?? 0.18);
    declarations.push(`background-color: ${resolvedSurfaceColor} !important`);
    declarations.push("background-clip: padding-box !important");
  }
  if (override.style.liquidGlass) {
    declarations.push("isolation: isolate !important");
    declarations.push("overflow: visible !important");
  }
  if ((override.style.grainOpacity ?? 0) > 0) {
    const layers = [grainTexture(override.style.grainOpacity ?? 0), resolvedBackgroundImage]
      .filter(Boolean)
      .join(", ");
    resolvedBackgroundImage = layers;
    declarations.push(`background-image: ${layers} !important`);
    declarations.push("background-size: 128px 128px, auto !important");
    declarations.push("background-blend-mode: soft-light, normal !important");
  }
  const textColor = override.style.textColor ?? override.defaults?.textColor;
  if (override.style.contentOpacity !== undefined && textColor) {
    declarations.push(
      `color: ${colorWithOpacity(textColor, override.style.contentOpacity)} !important`,
    );
  } else if (override.style.textColor) {
    declarations.push(`color: ${override.style.textColor} !important`);
  }
  const usesTextGradient =
    override.style.textKind === "gradient" &&
    ((override.style.textGradientStops?.length ?? 0) >= 2 ||
      Boolean(override.style.textGradientStart && override.style.textGradientEnd));
  if (usesTextGradient) {
    const firstStop = override.style.textGradientStops?.[0];
    const lastStop =
      override.style.textGradientStops?.[override.style.textGradientStops.length - 1];
    const start = override.style.textGradientStart ?? firstStop?.color ?? textColor ?? "#000000";
    const end = override.style.textGradientEnd ?? lastStop?.color ?? start;
    const textGradient = buildElementTextGradientImage(override.style, start, end, {
      baseColor: textColor ?? start,
      opacity: override.style.contentOpacity ?? 1,
    });
    const surfaceColor = resolvedSurfaceColor ?? "transparent";
    const surfaceImage =
      resolvedBackgroundImage ?? `linear-gradient(${surfaceColor}, ${surfaceColor})`;
    declarations.push("background-color: transparent !important");
    declarations.push(`background-image: ${textGradient}, ${surfaceImage} !important`);
    // Extra padding-box values are intentionally harmless when the surface has
    // one layer, and keep every existing multi-layer background out of the text clip.
    const textClips = `text, ${Array.from({ length: 8 }, () => "padding-box").join(", ")}`;
    declarations.push(`background-clip: ${textClips} !important`);
    declarations.push(`-webkit-background-clip: ${textClips} !important`);
    declarations.push("-webkit-text-fill-color: transparent !important");
    if (textColor) declarations.push(`caret-color: ${textColor} !important`);
    if ((override.style.grainOpacity ?? 0) > 0) {
      declarations.push("background-size: auto, 128px 128px, auto !important");
      declarations.push("background-blend-mode: normal, soft-light, normal !important");
    }
  } else if (override.style.textKind === "solid") {
    // This also restores a solid text fill when an interaction state replaces
    // a normal-state gradient.
    declarations.push("-webkit-text-fill-color: currentColor !important");
    declarations.push(`background-image: ${resolvedBackgroundImage ?? "none"} !important`);
    const surfaceClip =
      override.style.backgroundKind === "gradient" ||
      override.style.glassEffect ||
      (override.style.grainOpacity ?? 0) > 0
        ? "padding-box"
        : "border-box";
    declarations.push(`background-clip: ${surfaceClip} !important`);
    declarations.push(`-webkit-background-clip: ${surfaceClip} !important`);
  }
  if (override.style.paddingX !== undefined) {
    declarations.push(`padding-left: ${override.style.paddingX}px !important`);
    declarations.push(`padding-right: ${override.style.paddingX}px !important`);
  }
  if (override.style.paddingY !== undefined) {
    declarations.push(`padding-top: ${override.style.paddingY}px !important`);
    declarations.push(`padding-bottom: ${override.style.paddingY}px !important`);
  }
  if (override.style.marginTop !== undefined) {
    declarations.push(`margin-top: ${override.style.marginTop}px !important`);
  }
  if (override.style.marginRight !== undefined) {
    declarations.push(`margin-right: ${override.style.marginRight}px !important`);
  }
  if (override.style.marginBottom !== undefined) {
    declarations.push(`margin-bottom: ${override.style.marginBottom}px !important`);
  }
  if (override.style.marginLeft !== undefined) {
    declarations.push(`margin-left: ${override.style.marginLeft}px !important`);
  }
  if (override.style.order !== undefined) {
    declarations.push(`order: ${override.style.order} !important`);
  }
  if (override.style.alignSelf) {
    declarations.push(`align-self: ${override.style.alignSelf} !important`);
  }
  if (override.style.justifySelf) {
    declarations.push(`justify-self: ${override.style.justifySelf} !important`);
  }
  if (override.style.zIndex !== undefined) {
    declarations.push(`z-index: ${override.style.zIndex} !important`);
    declarations.push("position: relative !important");
  }
  if (override.style.borderWidth !== undefined) {
    declarations.push(`border-width: ${override.style.borderWidth}px !important`);
    declarations.push(`border-style: solid !important`);
  }
  if (override.style.borderColor) {
    declarations.push(`border-color: ${override.style.borderColor} !important`);
  }
  const shadows: string[] = [];
  if (override.style.shadow && override.style.shadow !== "none") {
    shadows.push(ELEMENT_SHADOWS[override.style.shadow]);
  }
  const hasCustomShadow =
    override.style.shadowColor !== undefined ||
    override.style.shadowX !== undefined ||
    override.style.shadowY !== undefined ||
    override.style.shadowBlur !== undefined ||
    override.style.shadowSpread !== undefined;
  if (hasCustomShadow) {
    shadows.push(
      `${override.style.shadowX ?? 0}px ${override.style.shadowY ?? 8}px ${override.style.shadowBlur ?? 24}px ${override.style.shadowSpread ?? 0}px ${override.style.shadowColor ?? "rgba(0, 0, 0, 0.28)"}`,
    );
  }
  if ((override.style.glowIntensity ?? 0) > 0) {
    const glowColor = override.style.glowColor ?? "var(--accent)";
    const glowAlpha = opacityPercentage(override.style.glowIntensity ?? 0);
    shadows.push(
      `0 0 ${override.style.glowBlur ?? 24}px color-mix(in srgb, ${glowColor} ${glowAlpha}%, transparent)`,
    );
  }
  if (override.style.glassEffect) {
    shadows.push("inset 0 1px 0 rgba(255, 255, 255, 0.42)");
    shadows.push("inset 0 -1px 0 rgba(255, 255, 255, 0.08)");
  }
  if (shadows.length > 0) {
    declarations.push(`box-shadow: ${shadows.join(", ")} !important`);
  } else if (override.style.shadow === "none") {
    declarations.push("box-shadow: none !important");
  }
  if (override.style.outlineWidth !== undefined) {
    declarations.push(`outline-width: ${override.style.outlineWidth}px !important`);
    declarations.push("outline-style: solid !important");
  }
  if (override.style.outlineColor) {
    declarations.push(`outline-color: ${override.style.outlineColor} !important`);
  }
  if (override.style.outlineOffset !== undefined) {
    declarations.push(`outline-offset: ${override.style.outlineOffset}px !important`);
  }
  if (override.style.backdropBlur !== undefined || override.style.glassEffect) {
    const blur = override.style.backdropBlur ?? (override.style.glassEffect ? 18 : 0);
    const saturation = override.style.glassEffect ? (override.style.glassSaturation ?? 1.35) : 1;
    declarations.push(`backdrop-filter: blur(${blur}px) saturate(${saturation}) !important`);
    declarations.push(
      `-webkit-backdrop-filter: blur(${blur}px) saturate(${saturation}) !important`,
    );
  }
  if (
    override.style.offsetX !== undefined ||
    override.style.offsetY !== undefined ||
    override.style.scale !== undefined ||
    override.style.rotate !== undefined
  ) {
    const translate =
      override.style.offsetX !== undefined || override.style.offsetY !== undefined
        ? `translate(${override.style.offsetX ?? 0}px, ${override.style.offsetY ?? 0}px) `
        : "";
    declarations.push(
      `transform: ${translate}rotate(${override.style.rotate ?? 0}deg) scale(${override.style.scale ?? 1}) !important`,
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
  const textMotion = usesTextGradient ? (override.style.textGradientAnimation ?? "none") : "none";
  const backgroundMotion = usesCustomGradient
    ? (override.style.backgroundGradientAnimation ?? "none")
    : "none";
  const gradientMotion = textMotion !== "none" ? textMotion : backgroundMotion;
  const animationNames: string[] = [];
  const animationDurations: string[] = [];
  const animationEasings: string[] = [];
  const animationIterations: string[] = [];
  const animationDirections: string[] = [];
  const animationFillModes: string[] = [];
  const animationDelays: string[] = [];
  if (gradientMotion !== "none") {
    const animationScope = `${override.id}-${interactionState}`.replace(/[^a-z0-9-]/gi, "-");
    const gradientName = `appearance-gradient-${gradientMotion}-${animationScope}`;
    const duration =
      textMotion !== "none"
        ? (override.style.textGradientAnimationDuration ?? 6_000)
        : (override.style.backgroundGradientAnimationDuration ?? 6_000);
    const direction =
      textMotion !== "none"
        ? (override.style.textGradientAnimationDirection ?? "alternate")
        : (override.style.backgroundGradientAnimationDirection ?? "alternate");
    const definition = resolveGradientAnimation(gradientMotion, {
      easing:
        textMotion !== "none"
          ? override.style.textGradientAnimationEasing
          : override.style.backgroundGradientAnimationEasing,
      startX:
        textMotion !== "none"
          ? override.style.textGradientAnimationStartX
          : override.style.backgroundGradientAnimationStartX,
      startY:
        textMotion !== "none"
          ? override.style.textGradientAnimationStartY
          : override.style.backgroundGradientAnimationStartY,
      endX:
        textMotion !== "none"
          ? override.style.textGradientAnimationEndX
          : override.style.backgroundGradientAnimationEndX,
      endY:
        textMotion !== "none"
          ? override.style.textGradientAnimationEndY
          : override.style.backgroundGradientAnimationEndY,
      scale:
        textMotion !== "none"
          ? override.style.textGradientAnimationScale
          : override.style.backgroundGradientAnimationScale,
      hue:
        textMotion !== "none"
          ? override.style.textGradientAnimationHue
          : override.style.backgroundGradientAnimationHue,
      saturation:
        textMotion !== "none"
          ? override.style.textGradientAnimationSaturation
          : override.style.backgroundGradientAnimationSaturation,
      brightness:
        textMotion !== "none"
          ? override.style.textGradientAnimationBrightness
          : override.style.backgroundGradientAnimationBrightness,
    });
    if (!definition) return "";
    declarations.push(`background-size: ${definition.backgroundSize} !important`);
    animationNames.push(gradientName);
    animationDurations.push(`${duration}ms`);
    animationEasings.push(definition.easing);
    animationIterations.push("infinite");
    animationDirections.push(direction);
    animationFillModes.push("both");
    animationDelays.push("0ms");
    generatedRules.push(buildGradientAnimationKeyframes(gradientName, definition));
  }
  if (
    interactionState === "normal" &&
    override.style.entranceAnimation &&
    override.style.entranceAnimation !== "none"
  ) {
    const animationScope = override.id.replace(/[^a-z0-9-]/gi, "-");
    const entranceName = `appearance-entrance-${override.style.entranceAnimation}-${animationScope}`;
    const targetOpacity = override.style.elementOpacity ?? 1;
    const animatesBlur =
      override.style.entranceAnimation === "blur" ||
      (override.style.entranceAnimation === "custom" && (override.style.entranceFromBlur ?? 0) > 0);
    const end = `opacity: ${targetOpacity}; translate: 0 0; scale: 1; rotate: 0deg;${animatesBlur ? " filter: blur(0);" : ""}`;
    const start = (() => {
      switch (override.style.entranceAnimation) {
        case "rise":
          return "opacity: 0; translate: 0 24px;";
        case "slide-left":
          return "opacity: 0; translate: -32px 0;";
        case "slide-right":
          return "opacity: 0; translate: 32px 0;";
        case "zoom":
          return "opacity: 0; scale: 0.9;";
        case "blur":
          return "opacity: 0; filter: blur(12px);";
        case "custom":
          return `opacity: ${override.style.entranceFromOpacity ?? 0}; translate: ${override.style.entranceFromX ?? 0}px ${override.style.entranceFromY ?? 24}px; scale: ${override.style.entranceFromScale ?? 0.9}; rotate: ${override.style.entranceFromRotate ?? 0}deg;${animatesBlur ? ` filter: blur(${override.style.entranceFromBlur ?? 0}px);` : ""}`;
        default:
          return "opacity: 0;";
      }
    })();
    animationNames.push(entranceName);
    animationDurations.push(`${override.style.entranceDuration ?? 600}ms`);
    animationEasings.push(override.style.entranceEasing ?? "ease-out");
    animationIterations.push("1");
    animationDirections.push("normal");
    animationFillModes.push("both");
    animationDelays.push(`${override.style.entranceDelay ?? 0}ms`);
    generatedRules.push(`@keyframes ${entranceName} { from { ${start} } to { ${end} } }`);
  }
  if (animationNames.length > 0) {
    declarations.push(`animation-name: ${animationNames.join(", ")} !important`);
    declarations.push(`animation-duration: ${animationDurations.join(", ")} !important`);
    declarations.push(`animation-timing-function: ${animationEasings.join(", ")} !important`);
    declarations.push(`animation-iteration-count: ${animationIterations.join(", ")} !important`);
    declarations.push(`animation-direction: ${animationDirections.join(", ")} !important`);
    declarations.push(`animation-fill-mode: ${animationFillModes.join(", ")} !important`);
    declarations.push(`animation-delay: ${animationDelays.join(", ")} !important`);
  }
  if (declarations.length === 0) return "";
  const target = `[${OVERRIDE_ATTRIBUTE}="${override.id}"]`;
  // Individual edits must outrank the global custom-appearance rules, which
  // intentionally use !important to cover the launcher's existing components.
  const baseSelector = `html[data-appearance-custom="true"] .gallery-root ${target}${target}${target}`;
  const selectors = (() => {
    switch (interactionState) {
      case "hover":
        return [`${baseSelector}:hover`, `${baseSelector}.appearance-hover-preview`];
      case "pressed":
        return [`${baseSelector}:active`, `${baseSelector}.appearance-pressed-preview`];
      case "focus":
        return [
          `${baseSelector}:focus`,
          `${baseSelector}:focus-visible`,
          `${baseSelector}.appearance-focus-preview`,
        ];
      case "disabled":
        return [
          `${baseSelector}:disabled`,
          `${baseSelector}[aria-disabled="true"]`,
          `${baseSelector}[data-disabled="true"]`,
          `${baseSelector}.appearance-disabled-preview`,
        ];
      case "selected":
        return [
          `${baseSelector}.active`,
          `${baseSelector}[aria-selected="true"]`,
          `${baseSelector}[aria-pressed="true"]`,
          `${baseSelector}[data-selected="true"]`,
          `${baseSelector}.appearance-selected-preview`,
        ];
      default:
        return [baseSelector];
    }
  })();
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
  if (
    (override.style.backgroundKind ||
      override.style.glassEffect ||
      (override.style.grainOpacity ?? 0) > 0) &&
    backgroundPseudos.length > 0
  ) {
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
  return [...rules, ...generatedRules].join("\n");
}

export function buildElementOverrideRule(override: AppearanceElementOverride) {
  const normalRule = buildElementOverrideStateRule(override, override.style, "normal");
  const stateStyles = [
    ["hover", override.hoverStyle],
    ["pressed", override.pressedStyle],
    ["focus", override.focusStyle],
    ["disabled", override.disabledStyle],
    ["selected", override.selectedStyle],
  ] as const;
  const activeStateStyles = stateStyles.filter(
    ([, style]) => style && Object.keys(style).length > 0,
  );
  if (activeStateStyles.length === 0) return normalRule;

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
  const transitionRule = `${transitionSelectors} { transition-property: all !important; transition-duration: ${override.stateTransitionMs ?? override.hoverTransitionMs ?? 200}ms !important; transition-timing-function: ${override.stateEasing ?? override.hoverEasing ?? "ease"} !important; transition-delay: 0ms !important; }`;
  const interactionRules = activeStateStyles.map(([state, style]) =>
    buildElementOverrideStateRule(override, { ...override.style, ...style }, state),
  );
  return [normalRule, transitionRule, ...interactionRules].filter(Boolean).join("\n");
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
    if (override.style.liquidGlass) {
      element.setAttribute(LIQUID_GLASS_ATTRIBUTE, "true");
      element.dataset.config = JSON.stringify({
        blurAmount: override.style.liquidGlassBlur ?? 0.25,
        refraction: override.style.liquidGlassRefraction ?? 0.69,
        chromAberration: override.style.liquidGlassChromaticAberration ?? 0.05,
        edgeHighlight: override.style.liquidGlassEdgeHighlight ?? 0.12,
        specular: override.style.liquidGlassSpecular ?? 0.2,
        cornerRadius: override.style.radius ?? 24,
        opacity: override.style.elementOpacity ?? 1,
        button: override.kind === "button",
      });
    } else {
      element.removeAttribute(LIQUID_GLASS_ATTRIBUTE);
      element.removeAttribute("data-config");
    }
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
    element.removeAttribute(LIQUID_GLASS_ATTRIBUTE);
    element.removeAttribute("data-config");
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
  const css = rules.join("\n");
  if (styleElement.textContent !== css) styleElement.textContent = css;
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
