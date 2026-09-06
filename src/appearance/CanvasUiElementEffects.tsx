import { useEffect, useRef, useState, type RefObject } from "react";
import { CanvasUiElementEffect } from "./CanvasUiEffectHost";
import { getCanvasUiEffect } from "./canvasUiCatalog";
import {
  CANVAS_UI_POINTER_EVENTS,
  canvasUiClipInsets,
  canvasUiLocalBounds,
  forwardCanvasUiPointer,
  type CanvasUiBounds,
} from "./canvasUiRuntime";
import { resolveElementTarget } from "./elementOverrides";
import type { AppearanceElementOverride } from "./types";
import type { TabKey } from "../types";

function ElementEffectFrame({
  rootRef,
  layerRef,
  override,
  activeTab,
}: {
  rootRef: RefObject<HTMLElement | null>;
  layerRef: RefObject<HTMLDivElement | null>;
  override: AppearanceElementOverride;
  activeTab: TabKey;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const objectEffect = Boolean(
    override.canvasUi && getCanvasUiEffect(override.canvasUi.effect).objectEffect,
  );
  const { id, path } = override;

  useEffect(() => {
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;
    let source: HTMLElement | null = null;
    let resolvePending = true;
    let animationFrame = 0;
    let previousStyle = "";
    const forward = (event: Event) => {
      // OrbitControls captures the pointer on press. Keep button/input gestures
      // on the launcher control; motion-only object effects still get moves.
      if (
        event.type === "pointerdown" &&
        event.target instanceof Element &&
        event.target.closest("button, a, input, textarea, select, [role=button], [contenteditable]")
      )
        return;
      const receiver = overlayRef.current?.querySelector<HTMLCanvasElement>(
        ".canvas-ui-element-object-layer canvas",
      );
      if (receiver) forwardCanvasUiPointer(event, receiver);
    };
    const bind = (next: HTMLElement | null) => {
      setTarget(next);
      if (source === next) return;
      if (objectEffect)
        CANVAS_UI_POINTER_EVENTS.forEach((type) => source?.removeEventListener(type, forward));
      source = next;
      if (objectEffect)
        CANVAS_UI_POINTER_EVENTS.forEach((type) => source?.addEventListener(type, forward));
    };
    const update = () => {
      if (resolvePending || !source?.isConnected) {
        resolvePending = false;
        const tagged = Array.from(
          root.querySelectorAll<HTMLElement>(
            "[data-appearance-override], [data-appearance-target-id]",
          ),
        ).find(
          (node) =>
            node.dataset.appearanceOverride === id || node.dataset.appearanceTargetId === id,
        );
        bind(tagged ?? resolveElementTarget(root, { path }));
      }
      const overlay = overlayRef.current;
      if (!source && overlay) overlay.style.visibility = "hidden";
      if (source && overlay) {
        const rect = source.getBoundingClientRect();
        const host = layer.getBoundingClientRect();
        const frame = canvasUiLocalBounds(rect, host, layer.clientWidth, layer.clientHeight);
        const clips: CanvasUiBounds[] = [host];
        let visible = source.isConnected && rect.width > 0 && rect.height > 0;
        let ancestor: HTMLElement | null = source;
        const style = getComputedStyle(source);
        let ancestorOpacity = 1;
        while (ancestor) {
          const computed = ancestor === source ? style : getComputedStyle(ancestor);
          visible &&=
            computed.visibility !== "hidden" &&
            computed.display !== "none" &&
            Number(computed.opacity) > 0;
          if (ancestor !== source && ancestor !== root) ancestorOpacity *= Number(computed.opacity);
          if (ancestor !== source) {
            const clipX = /hidden|clip|scroll|auto/.test(computed.overflowX);
            const clipY = /hidden|clip|scroll|auto/.test(computed.overflowY);
            if (clipX || clipY) {
              const bounds = ancestor.getBoundingClientRect();
              const sx = bounds.width / (ancestor.offsetWidth || bounds.width || 1);
              const sy = bounds.height / (ancestor.offsetHeight || bounds.height || 1);
              clips.push({
                left: clipX ? bounds.left + ancestor.clientLeft * sx : host.left,
                top: clipY ? bounds.top + ancestor.clientTop * sy : host.top,
                width: clipX ? ancestor.clientWidth * sx : host.width,
                height: clipY ? ancestor.clientHeight * sy : host.height,
              });
            }
          }
          if (ancestor === root) break;
          ancestor = ancestor.parentElement;
        }
        const clip = canvasUiClipInsets(rect, clips);
        visible &&= clip.visible;
        const sx = frame.width / (rect.width || 1);
        const sy = frame.height / (rect.height || 1);
        const css =
          `left:${frame.left}px;top:${frame.top}px;width:${frame.width}px;height:${frame.height}px;` +
          `visibility:${visible ? "visible" : "hidden"};opacity:${ancestorOpacity};` +
          `border-radius:${style.borderRadius};clip-path:inset(${clip.top * sy}px ${clip.right * sx}px ${clip.bottom * sy}px ${clip.left * sx}px);`;
        // Geometry updates do not rerender React or restart the GPU engine.
        if (css !== previousStyle) {
          overlay.style.cssText = css;
          previousStyle = css;
        }
        overlay.classList.toggle(
          "is-selected",
          source.classList.contains("appearance-pick-selected"),
        );
      }
      animationFrame = requestAnimationFrame(update);
    };
    const observer = new MutationObserver((records) => {
      if (records.some((record) => !layer.contains(record.target))) resolvePending = true;
    });
    observer.observe(root, { childList: true, subtree: true });
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
      if (objectEffect)
        CANVAS_UI_POINTER_EVENTS.forEach((type) => source?.removeEventListener(type, forward));
    };
  }, [activeTab, layerRef, objectEffect, id, path, rootRef]);

  return (
    <div ref={overlayRef} className="canvas-ui-element-effect-frame" data-canvas-ui-target={id}>
      {target && override.canvasUi && (
        <CanvasUiElementEffect config={override.canvasUi} captureTarget={target} />
      )}
    </div>
  );
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
  const layerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={layerRef} className="canvas-ui-element-effects" aria-hidden>
      {overrides
        .filter(
          (override) => override.canvasUi?.enabled && (!override.tab || override.tab === activeTab),
        )
        .map((override) => (
          <ElementEffectFrame
            key={override.id}
            rootRef={rootRef}
            layerRef={layerRef}
            override={override}
            activeTab={activeTab}
          />
        ))}
    </div>
  );
}
