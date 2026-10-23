import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import { CANVAS_UI_REPLAY_EVENT } from "./canvasUi";
import { CanvasUiSurface } from "./CanvasUiSurface";
import surfaceCss from "./CanvasUiSurface.css?inline";
import elementSurfaceCss from "./CanvasUiElementSurface.css?inline";
import { resolveElementTarget } from "./elementOverrides";
import type { AppearanceElementOverride } from "./types";
import type { TabKey } from "../types";
import "./CanvasUiElementEffects.css";

type Binding = {
  id: string;
  element: HTMLElement;
  host: HTMLElement;
  shadow: ShadowRoot;
  dispose: () => void;
};
function positionOwner(owner: HTMLElement) {
  if (getComputedStyle(owner).position === "static")
    owner.setAttribute("data-canvas-ui-positioned", "");
  return () => {
    if (!Array.from(owner.children).some((child) => child.tagName === "CANVAS-UI-ELEMENT")) {
      owner.removeAttribute("data-canvas-ui-positioned");
    }
  };
}

function bindElement(id: string, element: HTMLElement): Binding | null {
  // Replaced controls cannot display child canvases; anchor their effect in the
  // same parent instead. Original nodes, paths and React event handlers stay put.
  const replaced = element.matches("input, textarea, select, img, canvas, video, iframe, hr, br");
  const owner = replaced ? element.parentElement : element;
  if (!owner) return null;
  const releasePosition = positionOwner(owner);
  const host = document.createElement("canvas-ui-element");
  host.dataset.canvasUiTarget = id;
  if (replaced) host.dataset.canvasUiReplaced = "true";
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  const shadow = host.attachShadow({ mode: "open" });
  owner.appendChild(host);
  const resize = () => {
    if (getComputedStyle(owner).position === "static")
      owner.setAttribute("data-canvas-ui-positioned", "");
    const style = getComputedStyle(element);
    Object.assign(host.style, {
      left: `${replaced ? element.offsetLeft : -parseFloat(style.borderLeftWidth || "0")}px`,
      top: `${replaced ? element.offsetTop : -parseFloat(style.borderTopWidth || "0")}px`,
      width: `${element.offsetWidth}px`,
      height: `${element.offsetHeight}px`,
      borderRadius: style.borderRadius,
      ...(replaced ? { transform: style.transform, opacity: style.opacity } : {}),
    });
  };
  const observer = new ResizeObserver(resize);
  observer.observe(element);
  if (owner !== element) observer.observe(owner);
  // Radius, borders and offsets can change without resizing the border box.
  const attributes = new MutationObserver(resize);
  attributes.observe(element, { attributes: true });
  resize();
  let disposed = false;
  return {
    id,
    element,
    host,
    shadow,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      attributes.disconnect();
      host.remove();
      releasePosition();
    },
  };
}

export function CanvasUiElementEffects({
  rootRef,
  overrides,
  activeTab,
}: {
  rootRef: RefObject<HTMLElement | null>;
  overrides: AppearanceElementOverride[];
  activeTab: TabKey;
}) {
  const bindingsRef = useRef(new Map<string, Binding>());
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [replays, setReplays] = useState<Record<string, number>>({});

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const restart = (targetIds?: string[]) =>
      setReplays((current) => {
        const next = { ...current };
        for (const id of bindingsRef.current.keys()) {
          if (!targetIds || targetIds.includes(id)) next[id] = (next[id] ?? 0) + 1;
        }
        return next;
      });
    const local = (event: Event) =>
      restart((event as CustomEvent<{ targetIds?: string[] }>).detail?.targetIds);
    window.addEventListener(CANVAS_UI_REPLAY_EVENT, local);
    void listen<{ targetIds?: string[] } | null>(CANVAS_UI_REPLAY_EVENT, (event) =>
      restart(event.payload?.targetIds),
    )
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener(CANVAS_UI_REPLAY_EVENT, local);
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const active = overrides.filter(
      (override) =>
        override.canvasUi?.enabled &&
        override.canvasUi.opacity > 0 &&
        (!override.tab || override.tab === activeTab),
    );
    const map = bindingsRef.current;
    let frame = 0;
    const sync = () => {
      frame = 0;
      let changed = false;
      const wanted = new Set<string>();
      for (const override of active) {
        const previous = map.get(override.id);
        const element =
          previous?.element.isConnected && root.contains(previous.element)
            ? previous.element
            : (root.querySelector<HTMLElement>(`[data-appearance-override="${override.id}"]`) ??
              resolveElementTarget(root, override));
        if (!element) continue;
        wanted.add(override.id);
        if (previous?.element === element) continue;
        previous?.dispose();
        const binding = bindElement(override.id, element);
        if (binding) map.set(override.id, binding);
        else map.delete(override.id);
        changed = true;
      }
      for (const [id, binding] of map) {
        if (wanted.has(id)) continue;
        binding.dispose();
        map.delete(id);
        changed = true;
      }
      if (changed) setBindings([...map.values()]);
    };
    sync();
    if (!active.length) return;
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(sync);
    });
    observer.observe(root, { subtree: true, childList: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [rootRef, overrides, activeTab]);

  useLayoutEffect(() => {
    const map = bindingsRef.current;
    return () => {
      map.forEach((binding) => binding.dispose());
      map.clear();
    };
  }, []);

  return bindings.map((binding) => {
    const settings = overrides.find((override) => override.id === binding.id)?.canvasUi;
    return settings
      ? createPortal(
          <>
            <style>
              {surfaceCss}
              {elementSurfaceCss}
            </style>
            <CanvasUiSurface
              settings={settings}
              captureElement={binding.element}
              replay={replays[binding.id] ?? 0}
              onStatus={(status) => {
                binding.host.dataset.canvasUiStatus = status;
              }}
            />
          </>,
          binding.shadow,
          binding.id,
        )
      : null;
  });
}
