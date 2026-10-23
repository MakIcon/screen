import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { canvasUiEffect, canvasUiOptions, type CanvasUiSettings } from "./canvasUi";
import { canvasUiLoaders } from "./canvasUiLoaders";
import { observeCanvasUiElement } from "./canvasUiElementCapture";
import "./CanvasUiSurface.css";
import surfaceCss from "./CanvasUiSurface.css?inline";

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
  captureElement,
}: {
  settings: CanvasUiSettings;
  children?: ReactNode;
  captureElement?: HTMLElement;
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
  const [isolatedCapture] = useState(() => {
    if (!captureElement) return null;
    const host = document.createElement("canvas-ui-capture");
    host.setAttribute("aria-hidden", "true");
    host.inert = true;
    Object.assign(host.style, {
      display: "block",
      position: "fixed",
      left: "0",
      top: "0",
      // Chromium drops paint records for offscreen or fully transparent sources.
      // This subpixel alpha keeps capture alive without a visible helper layer.
      opacity: "0.001",
      zIndex: "-1",
      pointerEvents: "none",
      overflow: "hidden",
    });
    return { host, shadow: host.attachShadow({ mode: "open" }) };
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
    if (!native || captureElement) return;
    const source = sourceRef.current as PaintCanvas;
    const context = source?.getContext("2d") as PaintContext | null;
    if (!context?.drawElementImage) return;
    const draw = context.drawElementImage;
    // Chromium misplaces nested WebGL paint records inside HTML-in-canvas.
    // Capture ordinary HTML, then composite each element's finished GPU frame.
    context.drawElementImage = function (element, x, y) {
      const transform = draw.call(this, element, x, y);
      const origin = contentElement.getBoundingClientRect();
      const dpr = source.width / Math.max(contentElement.clientWidth, 1);
      const depth = (host: HTMLElement) => {
        let value = host.dataset.canvasUiReplaced ? 1 : 0;
        for (let parent = host.parentElement; parent; parent = parent.parentElement) value++;
        return value;
      };
      const hosts = Array.from(
        contentElement.querySelectorAll<HTMLElement>("canvas-ui-element"),
      ).sort((a, b) => depth(a) - depth(b));
      for (const host of hosts) {
        const output = host.shadowRoot?.querySelector<HTMLCanvasElement>(".canvas-ui-output");
        if (!output?.width || !output.height) continue;
        const rect = host.getBoundingClientRect();
        const style = getComputedStyle(host);
        this.save();
        this.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.beginPath();
        this.roundRect(
          rect.x - origin.x,
          rect.y - origin.y,
          rect.width,
          rect.height,
          [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomRightRadius,
            style.borderBottomLeftRadius,
          ].map((radius) => parseFloat(radius) || 0),
        );
        this.clip();
        let opacity = Number(getComputedStyle(output).opacity);
        for (
          let parent = host.parentElement;
          parent && parent !== contentElement;
          parent = parent.parentElement
        ) {
          const parentStyle = getComputedStyle(parent);
          opacity *= Number(parentStyle.opacity);
          const clipX = parentStyle.overflowX !== "visible";
          const clipY = parentStyle.overflowY !== "visible";
          if (clipX || clipY) {
            const bounds = parent.getBoundingClientRect();
            this.beginPath();
            this.rect(
              clipX ? bounds.x - origin.x : 0,
              clipY ? bounds.y - origin.y : 0,
              clipX ? bounds.width : origin.width,
              clipY ? bounds.height : origin.height,
            );
            this.clip();
          }
        }
        this.globalAlpha = opacity;
        try {
          this.drawImage(output, rect.x - origin.x, rect.y - origin.y, rect.width, rect.height);
        } catch {
          /* A GPU frame can disappear while its element is being removed. */
        }
        this.restore();
      }
      return transform;
    };
    let frame = 0;
    const paintElements = () => {
      if (contentElement.querySelector("canvas-ui-element")) source.requestPaint?.();
      frame = requestAnimationFrame(paintElements);
    };
    frame = requestAnimationFrame(paintElements);
    return () => {
      cancelAnimationFrame(frame);
      context.drawElementImage = draw;
    };
  }, [native, captureElement, contentElement]);

  useLayoutEffect(() => {
    if (!captureElement || !isolatedCapture) return;
    // HTML-in-canvas cannot safely nest capture canvases. Keep each source at
    // document level; only the final WebGL output lives inside the real target.
    const { host } = isolatedCapture;
    const resize = () =>
      Object.assign(host.style, {
        width: `${captureElement.offsetWidth}px`,
        height: `${captureElement.offsetHeight}px`,
      });
    document.body.appendChild(host);
    const observer = new ResizeObserver(resize);
    observer.observe(captureElement);
    resize();
    return () => {
      observer.disconnect();
      host.remove();
    };
  }, [captureElement, isolatedCapture]);

  useLayoutEffect(() => {
    if (!captureElement || !captureSupported || effect.object) return;
    contentElement.inert = true;
    return observeCanvasUiElement(captureElement, contentElement, () =>
      (sourceRef.current as PaintCanvas | null)?.requestPaint?.(),
    );
  }, [captureElement, contentElement, captureSupported, effect.object]);

  useEffect(() => {
    if (!captureElement) return;
    const forward = (event: Event) => {
      if (
        effect.object &&
        event.target instanceof Element &&
        event.target.closest(
          "button, a, input, select, textarea, [role=button], [role=switch], [role=slider], [role=checkbox]",
        )
      )
        return;
      if (event instanceof PointerEvent)
        contentElement.dispatchEvent(
          new PointerEvent(event.type, {
            bubbles: false,
            composed: false,
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
          }),
        );
      else if (event instanceof WheelEvent)
        contentElement.dispatchEvent(
          new WheelEvent(event.type, {
            bubbles: false,
            composed: false,
            clientX: event.clientX,
            clientY: event.clientY,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaMode: event.deltaMode,
          }),
        );
    };
    const events = [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "pointerleave",
      "wheel",
    ];
    events.forEach((type) => captureElement.addEventListener(type, forward, { passive: true }));
    return () => events.forEach((type) => captureElement.removeEventListener(type, forward));
  }, [captureElement, contentElement, effect.object]);

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
        if (captureElement) {
          const getContext = output.getContext.bind(output) as (
            id: string,
            attributes?: unknown,
          ) => RenderingContext | null;
          output.getContext = ((id: string, attributes?: WebGLContextAttributes) =>
            getContext(
              id,
              id.startsWith("webgl") ? { ...attributes, preserveDrawingBuffer: true } : attributes,
            )) as typeof output.getContext;
        }
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
  }, [active, effect.id, effect.component, effect.object, native, replay, captureElement]);

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
  const capture = (
    <>
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
    </>
  );
  return (
    <div
      className={`canvas-ui-surface ${className}`}
      data-canvas-ui-effect={active ? effect.id : "none"}
      data-canvas-ui-composite={native && !captureElement ? "true" : undefined}
      data-canvas-ui-transition={
        active && ["peel", "ascii-sweep"].includes(effect.id) ? "true" : undefined
      }
    >
      {isolatedCapture
        ? createPortal(
            <>
              <style>{surfaceCss}</style>
              {capture}
            </>,
            isolatedCapture.shadow,
          )
        : capture}
      {!captureElement && createPortal(children, contentElement)}
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
