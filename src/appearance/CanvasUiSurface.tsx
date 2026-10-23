import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { canvasUiEffect, canvasUiOptions, type CanvasUiSettings } from "./canvasUi";
import { canvasUiLoaders } from "./canvasUiLoaders";
import "./CanvasUiSurface.css";

const CANVAS_UI_NAME = "CANVAS UI";

type PaintCanvas = HTMLCanvasElement & {
  requestPaint?: () => void;
  onpaint?: (() => void) | null;
  updateElementGeometry?: (element: Element, options: { canvasTransform: DOMMatrix }) => void;
};
type PaintContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => DOMMatrix | void;
};
type EffectInstance = {
  setOptions: (options: Record<string, unknown>) => void;
  destroy: () => void;
  sweep?: (slot: 0 | 1) => void;
};
export type CanvasUiStatus = "loading" | "ready" | "fallback" | "unavailable" | "off";

export function supportsCanvasUiCapture() {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas") as PaintCanvas;
  return (
    typeof (canvas.getContext("2d") as PaintContext | null)?.drawElementImage === "function" &&
    typeof canvas.requestPaint === "function"
  );
}

// Capture live HTML only while a DOM effect is active. An idle drawable canvas
// does not reliably repaint the launcher's native opening animation in WebView2.
// A stable portal container can move between HTML and canvas without remounting
// controls, dialogs, or the launcher's existing appearance observers.
export function CanvasUiSurface({
  settings,
  children,
  replay = 0,
  onStatus,
  className = "",
}: {
  settings: CanvasUiSettings;
  children: ReactNode;
  replay?: number;
  onStatus?: (status: CanvasUiStatus) => void;
  className?: string;
}) {
  const [captureSupported] = useState(supportsCanvasUiCapture);
  const [contentElement] = useState(() => {
    const element = document.createElement("div");
    element.className = "canvas-ui-live-content";
    return element;
  });
  const contentRef = useRef(contentElement);
  const htmlHostRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const alternateRef = useRef<HTMLDivElement>(null);
  const alternateSourceRef = useRef<HTMLCanvasElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<EffectInstance | null>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const effect = canvasUiEffect(settings.effect);
  const options = useMemo(() => canvasUiOptions(settings), [settings]);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const active = settings.enabled && settings.opacity > 0;
  const native = captureSupported && active && !effect.object;

  useLayoutEffect(() => {
    const host = native ? sourceRef.current : htmlHostRef.current;
    if (!host) return;
    if (!native) contentElement.removeAttribute("drawable");
    host.appendChild(contentElement);
    return () => contentElement.remove();
  }, [native, contentElement]);

  useEffect(() => {
    if (!native) return;
    const source = sourceRef.current as PaintCanvas;
    const content = contentRef.current;
    if (!source || !content) return;
    if ("content" in source) {
      source.setAttribute("content", "drawable");
      content.setAttribute("drawable", "");
    } else source.setAttribute("layoutsubtree", "");
    const context = source.getContext("2d") as PaintContext | null;
    const paint = () => {
      if (!context?.drawElementImage) return;
      try {
        context.reset();
        const transform = context.drawElementImage(content, 0, 0);
        if (transform && source.updateElementGeometry)
          source.updateElementGeometry(content, { canvasTransform: transform });
      } catch {
        /* A detached or resizing subtree will repaint on the next frame. */
      }
    };
    source.onpaint = paint;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      source.width = Math.max(1, Math.round(content.clientWidth * dpr));
      source.height = Math.max(1, Math.round(content.clientHeight * dpr));
      source.requestPaint?.();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(content);
    resize();
    return () => {
      observer.disconnect();
      if (source.onpaint === paint) source.onpaint = null;
    };
  }, [native, active, effect.id, replay]);

  useEffect(() => {
    if (!active) {
      statusRef.current?.("off");
      return;
    }
    let cancelled = false;
    let instance: EffectInstance | null = null;
    const timers: number[] = [];
    let stopForwarding: (() => void) | undefined;
    const source = sourceRef.current as PaintCanvas;
    const content = contentRef.current;
    const alternate = alternateRef.current;
    const alternateSource = alternateSourceRef.current;
    const output = outputRef.current;
    if (!source || !content || !alternate || !alternateSource || !output) return;
    const idlePaint = source.onpaint;
    const contentStyle = content.getAttribute("style");
    const sourceStyle = source.getAttribute("style");
    statusRef.current?.("loading");
    void canvasUiLoaders[effect.id as keyof typeof canvasUiLoaders]()
      .then((module) => {
        if (cancelled) return;
        const factory = (module as unknown as Record<string, unknown>)[
          `create${effect.component}`
        ] as (
          elements: Record<string, unknown>,
          options: Record<string, unknown>,
        ) => EffectInstance | null;
        const elements = effect.object
          ? { canvas: output }
          : effect.id === "ascii-sweep"
            ? {
                slots: [
                  { source, content },
                  { source: alternateSource, content: alternate },
                ],
                output,
              }
            : { source, content, output, under: alternate };
        const engineOptions = {
          ...optionsRef.current,
          ...(effect.object && !optionsRef.current.src ? { src: "/canvas-ui-mark.svg" } : {}),
          ...(effect.object
            ? {
                onError: () => {
                  if (!cancelled) statusRef.current?.("unavailable");
                },
                onLoad: () => {
                  if (!cancelled) statusRef.current?.("ready");
                },
              }
            : {}),
        };
        instance = factory(elements, engineOptions);
        instanceRef.current = instance;
        statusRef.current?.(
          !instance ? "unavailable" : native || effect.object ? "ready" : "fallback",
        );
        if (instance && effect.object) {
          // OrbitControls listens on its canvas. Forward background gestures to
          // it while keeping the launcher's controls and text inputs clickable.
          const forward = (event: Event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("button, a, input, select, textarea, [role=button]")
            )
              return;
            if (event instanceof PointerEvent)
              output.dispatchEvent(
                new PointerEvent(event.type, {
                  bubbles: false,
                  clientX: event.clientX,
                  clientY: event.clientY,
                  pointerId: event.pointerId,
                  pointerType: event.pointerType,
                  isPrimary: event.isPrimary,
                  button: event.button,
                  buttons: event.buttons,
                  ctrlKey: event.ctrlKey,
                  shiftKey: event.shiftKey,
                  altKey: event.altKey,
                  metaKey: event.metaKey,
                }),
              );
            else if (event instanceof WheelEvent)
              output.dispatchEvent(
                new WheelEvent("wheel", {
                  bubbles: false,
                  cancelable: true,
                  clientX: event.clientX,
                  clientY: event.clientY,
                  deltaX: event.deltaX,
                  deltaY: event.deltaY,
                  deltaMode: event.deltaMode,
                }),
              );
          };
          const events = ["pointerdown", "pointermove", "pointerup", "pointercancel", "wheel"];
          events.forEach((type) => content.addEventListener(type, forward, { passive: true }));
          stopForwarding = () =>
            events.forEach((type) => content.removeEventListener(type, forward));
        }
        if (instance?.sweep && optionsRef.current.progress === -1) {
          timers.push(window.setTimeout(() => instance?.sweep?.(1), 300));
          timers.push(
            window.setTimeout(
              () => instance?.sweep?.(0),
              (Number(optionsRef.current.duration) + 0.8) * 1000,
            ),
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn("Canvas UI effect could not start", error);
          statusRef.current?.("unavailable");
        }
      });
    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
      stopForwarding?.();
      instance?.destroy();
      instanceRef.current = null;
      // Ascii Sweep temporarily controls stacking, focus and backgrounds.
      for (const element of [content, source]) {
        element.inert = false;
        element.removeAttribute("aria-hidden");
      }
      if (contentStyle === null) content.removeAttribute("style");
      else content.setAttribute("style", contentStyle);
      if (sourceStyle === null) source.removeAttribute("style");
      else source.setAttribute("style", sourceStyle);
      source.onpaint = idlePaint;
      source.requestPaint?.();
    };
  }, [active, effect.id, effect.component, effect.object, native, replay]);

  useEffect(() => {
    instanceRef.current?.setOptions({
      ...options,
      ...(effect.object && !options.src ? { src: "/canvas-ui-mark.svg" } : {}),
    });
  }, [options, effect.object]);

  const alternate = (
    <div ref={alternateRef} className="canvas-ui-alternate" aria-hidden="true">
      <span>{CANVAS_UI_NAME}</span>
    </div>
  );
  return (
    <div
      className={`canvas-ui-surface ${className}`}
      data-canvas-ui-effect={active ? effect.id : "none"}
      data-canvas-ui-transition={
        active && ["peel", "ascii-sweep"].includes(effect.id) ? "true" : undefined
      }
    >
      <canvas
        ref={alternateSourceRef}
        className="canvas-ui-alternate-source"
        {...(native ? { layoutsubtree: "" } : {})}
      >
        {native ? alternate : null}
      </canvas>
      {!native && alternate}
      <canvas
        ref={sourceRef}
        className={native ? "canvas-ui-source" : "canvas-ui-source-hidden"}
        {...(native ? { layoutsubtree: "" } : {})}
      />
      <div ref={htmlHostRef} className="canvas-ui-html-host" hidden={native} />
      {createPortal(children, contentElement)}
      {active && (
        <canvas
          key={`${effect.id}-${replay}`}
          ref={outputRef}
          className="canvas-ui-output"
          style={{ opacity: settings.opacity }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
