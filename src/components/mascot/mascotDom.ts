import { SCROLLABLE_SELECTOR } from "./mascotConfig";
import type { CarriedElement, MascotPosition } from "./mascotTypes";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function randomItem<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

export function shuffled<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

export function distance(a: MascotPosition, b: MascotPosition) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isVisible(element: HTMLElement, rootRect: DOMRect) {
  if (element.hidden || element.closest("[aria-hidden='true']")) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 12) return false;
  if (rect.bottom < rootRect.top || rect.top > rootRect.bottom) return false;
  if (rect.right < rootRect.left || rect.left > rootRect.right) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

export function hasDrawnEdge(element: HTMLElement) {
  if (element.matches(".gallery-header, .sidebar, .gallery-footer")) return true;
  const style = window.getComputedStyle(element);
  return [
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ].some((width) => Number.parseFloat(width) > 0);
}

export function getToggleLabel(toggle: HTMLButtonElement) {
  return (
    toggle
      .closest(".settings-toggle-row")
      ?.querySelector(".settings-toggle-title")
      ?.textContent?.trim() ?? ""
  );
}

export function isStealableElement(element: HTMLElement) {
  if (element.matches("[data-mascot-ignore], .mascot-button-carried-source")) return false;
  if (element.closest(".launcher-mascot-layer, .ep-backdrop, .confirm-overlay")) return false;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return false;
  return true;
}

export function getScrollableAncestor(element: HTMLElement) {
  const scrollable = element.parentElement?.closest<HTMLElement>(SCROLLABLE_SELECTOR) ?? null;
  return scrollable && scrollable.scrollHeight > scrollable.clientHeight + 8 ? scrollable : null;
}

export function isRenderedStealTarget(element: HTMLElement) {
  if (element.hidden || element.closest("[aria-hidden='true']")) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 12) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

export function isVisibleInsideScroller(element: HTMLElement, scrollable: HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const scrollRect = scrollable.getBoundingClientRect();
  return (
    elementRect.bottom > scrollRect.top + 6 &&
    elementRect.top < scrollRect.bottom - 6 &&
    elementRect.right > scrollRect.left &&
    elementRect.left < scrollRect.right
  );
}

const FAKE_SLIDER_CLASS = "mascot-fake-slider-preview";

export function setNativeControlValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

type FakeSliderSnapshot = {
  slider: HTMLElement;
  fill: HTMLElement | null;
  readouts: Array<{ element: HTMLElement; text: string }>;
  originalLeft: string;
  originalWidth: string;
  lastLeft: string;
  lastWidth: string;
  lastReadoutTexts: string[];
  min: number;
  max: number;
};

function getSliderReadouts(slider: HTMLElement) {
  const root = slider.closest<HTMLElement>(".es-root");
  if (!root) return [];
  const candidates = [
    root.querySelector<HTMLElement>(".es-value-badge"),
    root.closest(".settings-memory-block")?.querySelector<HTMLElement>(".memory-number"),
    root.closest(".brs-section")?.querySelector<HTMLElement>(".brs-section-head strong"),
    root.closest(".bce-slider-field")?.querySelector<HTMLElement>(".bce-slider-value"),
  ];
  return Array.from(
    new Set(candidates.filter((element): element is HTMLElement => Boolean(element))),
  );
}

function captureFakeSlider(slider: HTMLElement): FakeSliderSnapshot {
  const root = slider.closest<HTMLElement>(".es-root");
  const fill = root?.querySelector<HTMLElement>(".es-fill") ?? null;
  const readouts = getSliderReadouts(slider).map((element) => ({
    element,
    text: element.textContent ?? "",
  }));
  const rawMin = Number(slider.getAttribute("aria-valuemin"));
  const rawMax = Number(slider.getAttribute("aria-valuemax"));
  const min = Number.isFinite(rawMin) ? rawMin : 0;
  const max = Number.isFinite(rawMax) && rawMax > min ? rawMax : min + 100;
  return {
    slider,
    fill,
    readouts,
    originalLeft: slider.style.left,
    originalWidth: fill?.style.width ?? "",
    lastLeft: slider.style.left,
    lastWidth: fill?.style.width ?? "",
    lastReadoutTexts: readouts.map(({ text }) => text),
    min,
    max,
  };
}

function formatFakeReadout(original: string, value: number) {
  return /-?\d+(?:\.\d+)?/.test(original)
    ? original.replace(/-?\d+(?:\.\d+)?/, String(value))
    : String(value);
}

function applyFakeSlider(snapshot: FakeSliderSnapshot, percent: number) {
  const safePercent = clamp(percent, 0, 100);
  const position = `${safePercent}%`;
  const value = Math.round(snapshot.min + ((snapshot.max - snapshot.min) * safePercent) / 100);
  snapshot.slider.style.left = position;
  if (snapshot.fill) snapshot.fill.style.width = position;
  snapshot.lastLeft = position;
  snapshot.lastWidth = position;
  snapshot.lastReadoutTexts = snapshot.readouts.map(({ element, text }) => {
    const nextText = formatFakeReadout(text, value);
    element.textContent = nextText;
    return nextText;
  });
}

function restoreFakeSlider(snapshot: FakeSliderSnapshot) {
  if (snapshot.slider.style.left === snapshot.lastLeft) {
    snapshot.slider.style.left = snapshot.originalLeft;
  }
  if (snapshot.fill && snapshot.fill.style.width === snapshot.lastWidth) {
    snapshot.fill.style.width = snapshot.originalWidth;
  }
  snapshot.readouts.forEach(({ element, text }, index) => {
    if (element.textContent === snapshot.lastReadoutTexts[index]) element.textContent = text;
  });
  snapshot.slider.classList.remove(FAKE_SLIDER_CLASS);
}

function isRamSlider(slider: HTMLElement) {
  return Boolean(slider.closest(".settings-memory-block, .brs-slider"));
}

function fireSliderKey(slider: HTMLElement, key: string) {
  slider.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  slider.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

function getSliderSpan(slider: HTMLElement) {
  const min = Number(slider.getAttribute("aria-valuemin"));
  const max = Number(slider.getAttribute("aria-valuemax"));
  return Number.isFinite(min) && Number.isFinite(max) && max > min
    ? Math.min(64, Math.round(max - min))
    : 20;
}

export function nudgeSlider(slider: HTMLElement) {
  if (!isRamSlider(slider)) {
    slider.focus({ preventScroll: true });
    const span = getSliderSpan(slider);
    const bursts = 3 + Math.floor(Math.random() * 4);
    for (let burst = 0; burst < bursts; burst += 1) {
      const key = burst % 2 === 0 ? "ArrowRight" : "ArrowLeft";
      const steps = 3 + Math.floor(Math.random() * 6);
      for (let step = 0; step < steps; step += 1) fireSliderKey(slider, key);
    }
    for (let step = 0; step < span; step += 1) fireSliderKey(slider, "ArrowLeft");
    const target = Math.floor(Math.random() * (span + 1));
    for (let step = 0; step < target; step += 1) fireSliderKey(slider, "ArrowRight");
    return;
  }

  const snapshot = captureFakeSlider(slider);
  slider.classList.add(FAKE_SLIDER_CLASS);
  applyFakeSlider(snapshot, 8 + Math.random() * 84);
  window.setTimeout(() => restoreFakeSlider(snapshot), 440);
}

export async function playSlider(slider: HTMLElement, isAlive: () => boolean) {
  if (!isRamSlider(slider)) {
    slider.focus({ preventScroll: true });
    const span = getSliderSpan(slider);
    const bursts = 4 + Math.floor(Math.random() * 4);
    for (let burst = 0; burst < bursts; burst += 1) {
      if (!isAlive()) return;
      const key = burst % 2 === 0 ? "ArrowRight" : "ArrowLeft";
      const steps = 4 + Math.floor(Math.random() * Math.max(4, Math.ceil(span * 0.6)));
      for (let step = 0; step < steps; step += 1) fireSliderKey(slider, key);
      await wait(80 + Math.random() * 70);
    }
    if (!isAlive()) return;
    for (let step = 0; step < span; step += 1) fireSliderKey(slider, "ArrowLeft");
    const target = Math.floor(Math.random() * (span + 1));
    for (let step = 0; step < target; step += 1) fireSliderKey(slider, "ArrowRight");
    return;
  }

  const snapshot = captureFakeSlider(slider);
  slider.classList.add(FAKE_SLIDER_CLASS);
  try {
    const bursts = 4 + Math.floor(Math.random() * 4);
    for (let burst = 0; burst < bursts; burst += 1) {
      if (!isAlive()) return;
      const lane = burst % 2 === 0 ? 58 + Math.random() * 38 : 4 + Math.random() * 38;
      applyFakeSlider(snapshot, lane);
      await wait(80 + Math.random() * 70);
    }
  } finally {
    restoreFakeSlider(snapshot);
  }
}

function copyComputedTree(source: HTMLElement, clone: HTMLElement) {
  const sourceNodes: Element[] = [source, ...Array.from(source.querySelectorAll("*"))];
  const cloneNodes: Element[] = [clone, ...Array.from(clone.querySelectorAll("*"))];
  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode) return;
    const computed = window.getComputedStyle(sourceNode);
    const inlineStyle = (cloneNode as HTMLElement | SVGElement).style;
    Array.from(computed).forEach((property) => {
      inlineStyle.setProperty(
        property,
        computed.getPropertyValue(property),
        computed.getPropertyPriority(property),
      );
    });
  });
}

export function mountElementReplica(holder: HTMLElement, carried: CarriedElement) {
  const clone = carried.element.cloneNode(true) as HTMLElement;
  carried.element.classList.remove("mascot-button-carried-source");
  const sourceRadius = window.getComputedStyle(carried.element).borderRadius;
  try {
    copyComputedTree(carried.element, clone);
  } finally {
    carried.element.classList.add("mascot-button-carried-source");
  }
  holder.style.setProperty("background", "var(--bg)", "important");
  holder.style.setProperty("border-radius", sourceRadius, "important");
  holder.style.setProperty("overflow", "hidden", "important");
  holder.style.setProperty("box-shadow", "var(--surface-shadow-soft)", "important");
  clone.classList.remove("mascot-button-carried-source");
  clone.removeAttribute("id");
  clone.removeAttribute("aria-hidden");
  clone.setAttribute("aria-hidden", "true");
  clone.tabIndex = -1;
  clone.style.setProperty("width", `${carried.width}px`, "important");
  clone.style.setProperty("height", `${carried.height}px`, "important");
  clone.style.setProperty("min-width", `${carried.width}px`, "important");
  clone.style.setProperty("max-width", `${carried.width}px`, "important");
  clone.style.setProperty("box-sizing", "border-box", "important");
  clone.style.setProperty("position", "relative", "important");
  clone.style.setProperty("inset", "auto", "important");
  clone.style.setProperty("margin", "0", "important");
  clone.style.setProperty("transform", "none", "important");
  clone.style.setProperty("visibility", "visible", "important");
  clone.style.setProperty("opacity", "1", "important");
  clone.style.setProperty("pointer-events", "none", "important");
  holder.replaceChildren(clone);
  return () => {
    holder.replaceChildren();
    holder.style.removeProperty("background");
    holder.style.removeProperty("border-radius");
    holder.style.removeProperty("overflow");
    holder.style.removeProperty("box-shadow");
  };
}

export function restoreCarriedElement(carried: CarriedElement) {
  if (!carried.element.isConnected) return;
  carried.element.classList.remove("mascot-button-carried-source");
  if (carried.previousAriaHidden === null) carried.element.removeAttribute("aria-hidden");
  else carried.element.setAttribute("aria-hidden", carried.previousAriaHidden);
}
