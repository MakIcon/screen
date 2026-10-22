import { useLayoutEffect, useRef } from "react";
import {
  CANVAS_UI_POINTER_EVENTS,
  CANVAS_UI_REPLACED_ATTRIBUTE,
  canvasUiMutationAffectsCapture,
  canvasUiReplacesContent,
  forwardCanvasUiPointer,
} from "./canvasUiRuntime";
import type { CanvasUiEffectId } from "./types";
import { createCanvasUiElementMirror } from "./canvasUiElementMirror";

type PaintableCanvas = HTMLCanvasElement & { requestPaint?: () => void };

// Arbitrary picked elements remain owned by the launcher's React tree. Mirror
// just that element inside the official component's capture subtree; Chromium
// paints it natively. There is no document rasterizer or snapshot polling loop.
export function CanvasUiNativeElementContent({
  target,
  effect,
}: {
  target: HTMLElement;
  effect: CanvasUiEffectId;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = host?.closest<PaintableCanvas>("canvas");
    if (!host || !canvas?.requestPaint) return;
    const shell = canvas.parentElement;
    const content = Array.from(canvas.children).find((child) => child.contains(host));
    if (!shell || !(content instanceof HTMLElement)) return;

    let frame = 0;
    let readyFrame = 0;
    let ready = false;
    let disposed = false;
    const replaces = canvasUiReplacesContent(effect);
    const mirror = createCanvasUiElementMirror(target, host);

    const update = () => {
      frame = 0;
      if (disposed || !target.isConnected) return;
      // Concealing the live pixels must never become part of the mirror's CSS.
      const concealed: Element[] = [];
      let ancestor: HTMLElement | null = target;
      while (ancestor) {
        if (ancestor.hasAttribute(CANVAS_UI_REPLACED_ATTRIBUTE)) {
          ancestor.removeAttribute(CANVAS_UI_REPLACED_ATTRIBUTE);
          concealed.push(ancestor);
        }
        ancestor = ancestor.parentElement;
      }
      try {
        mirror.flush();
        canvas.requestPaint?.();
      } finally {
        concealed.forEach((element) => element.setAttribute(CANVAS_UI_REPLACED_ATTRIBUTE, ""));
      }
    };
    const schedule = () => {
      if (!frame && !disposed) frame = requestAnimationFrame(update);
    };
    const refresh = () => {
      mirror.refresh();
      schedule();
    };
    const onVisualEvent = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      if (["input", "scroll", "load", "loadeddata"].includes(event.type)) {
        mirror.value(event.target);
      } else {
        mirror.state(
          event.target,
          event instanceof FocusEvent || event instanceof MouseEvent ? event.relatedTarget : null,
        );
      }
      schedule();
    };
    const onPaint = () => {
      if (ready || readyFrame || disposed) return;
      // The official engine uploads on paint and draws on the next GPU frame.
      readyFrame = requestAnimationFrame(() => {
        readyFrame = requestAnimationFrame(() => {
          readyFrame = 0;
          if (disposed) return;
          ready = true;
          host.dataset.canvasUiReady = "true";
          if (replaces) target.setAttribute(CANVAS_UI_REPLACED_ATTRIBUTE, "");
        });
      });
    };
    canvas.addEventListener("paint", onPaint);
    const forward = (event: Event) => forwardCanvasUiPointer(event, content, shell);
    CANVAS_UI_POINTER_EVENTS.forEach((type) => target.addEventListener(type, forward));
    const visualEvents = [
      "pointerover",
      "pointerout",
      "pointerdown",
      "pointerup",
      "focusin",
      "focusout",
      "input",
      "change",
      "load",
      "loadeddata",
      "transitionend",
      "animationend",
    ];
    visualEvents.forEach((type) => target.addEventListener(type, onVisualEvent, true));
    target.addEventListener("scroll", onVisualEvent, true);
    const mutations = new MutationObserver((records) => {
      let changed = false;
      for (const record of records) {
        if (!canvasUiMutationAffectsCapture(record)) continue;
        if (document.head.contains(record.target)) mirror.refresh();
        else mirror.mutation(record);
        changed = true;
      }
      if (changed) schedule();
    });
    mutations.observe(target, {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    mutations.observe(document.head, { childList: true, characterData: true, subtree: true });
    let ancestor = target.parentElement;
    while (ancestor) {
      mutations.observe(ancestor, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["class", "style"],
      });
      ancestor = ancestor.parentElement;
    }
    const resize = new ResizeObserver(() => {
      mirror.resize();
      schedule();
    });
    resize.observe(target);
    document.fonts?.addEventListener("loadingdone", refresh);
    update();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(readyFrame);
      mutations.disconnect();
      resize.disconnect();
      canvas.removeEventListener("paint", onPaint);
      CANVAS_UI_POINTER_EVENTS.forEach((type) => target.removeEventListener(type, forward));
      visualEvents.forEach((type) => target.removeEventListener(type, onVisualEvent, true));
      target.removeEventListener("scroll", onVisualEvent, true);
      document.fonts?.removeEventListener("loadingdone", refresh);
      target.removeAttribute(CANVAS_UI_REPLACED_ATTRIBUTE);
      mirror.destroy();
    };
  }, [effect, target]);

  return <div ref={hostRef} className="canvas-ui-element-clone" aria-hidden inert />;
}
