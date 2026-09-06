import html2canvas from "html2canvas-pro";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CanvasUiEffectId, CanvasUiRenderer } from "./types";
import {
  CANVAS_UI_POINTER_EVENTS,
  CANVAS_UI_REPLACED_ATTRIBUTE,
  canvasUiReplacesContent,
  forwardCanvasUiPointer,
  queueCanvasUiCapture,
} from "./canvasUiRuntime";

type EffectOptions = Record<string, unknown>;
type RasterElements = {
  source: HTMLCanvasElement;
  content: HTMLElement;
  output: HTMLCanvasElement;
  under?: HTMLElement;
  raster?: boolean;
};
type RasterEngine = {
  ready?: Promise<boolean>;
  setOptions: (options: EffectOptions) => void;
  resize: () => void;
  destroy: () => void;
  capture?: () => void;
  current?: () => 0 | 1;
  sweep?: (to: 0 | 1, options?: { angle?: number }) => void;
};
type RasterEngineFactory = (
  elements: RasterElements,
  options: EffectOptions,
) => RasterEngine | null;
type RasterModule = Record<string, unknown>;

const CAPTURE_IGNORE_SELECTOR = [
  ".canvas-ui-element-effects",
  ".appearance-drawing-cursor",
  ".canvas-ui-raster-output",
  ".canvas-ui-raster-source",
  ".canvas-ui-raster-alternate",
  ".canvas-ui-object-layer",
  ".canvas-ui-element-object-layer",
  ".canvas-ui-compat-layer",
].join(", ");

const RASTER_ENGINES: Partial<
  Record<CanvasUiEffectId, { factory: string; load: () => Promise<unknown> }>
> = {
  liquid: { factory: "createLiquid", load: () => import("../components/canvasui/Liquid") },
  ripple: { factory: "createRipple", load: () => import("../components/canvasui/Ripple") },
  bubble: { factory: "createBubble", load: () => import("../components/canvasui/Bubble") },
  glass: { factory: "createGlass", load: () => import("../components/canvasui/Glass") },
  frost: { factory: "createFrost", load: () => import("../components/canvasui/Frost") },
  droplets: { factory: "createDroplets", load: () => import("../components/canvasui/Droplets") },
  clouds: { factory: "createClouds", load: () => import("../components/canvasui/Clouds") },
  blaze: { factory: "createBlaze", load: () => import("../components/canvasui/Blaze") },
  "flame-wrap": {
    factory: "createFlameWrap",
    load: () => import("../components/canvasui/FlameWrap"),
  },
  "force-field": {
    factory: "createForceField",
    load: () => import("../components/canvasui/ForceField"),
  },
  displacement: {
    factory: "createDisplacement",
    load: () => import("../components/canvasui/Displacement"),
  },
  grid: { factory: "createGrid", load: () => import("../components/canvasui/Grid") },
  "hex-float": {
    factory: "createHexFloat",
    load: () => import("../components/canvasui/HexFloat"),
  },
  bend: { factory: "createBend", load: () => import("../components/canvasui/Bend") },
  cloth: { factory: "createCloth", load: () => import("../components/canvasui/Cloth") },
  shatter: { factory: "createShatter", load: () => import("../components/canvasui/Shatter") },
  peel: { factory: "createPeel", load: () => import("../components/canvasui/Peel") },
  "particle-reveal": {
    factory: "createParticleReveal",
    load: () => import("../components/canvasui/ParticleReveal"),
  },
  "particle-scroll": {
    factory: "createParticleScroll",
    load: () => import("../components/canvasui/ParticleScroll"),
  },
  magnify: { factory: "createMagnify", load: () => import("../components/canvasui/Magnify") },
  canvas: { factory: "createCanvas", load: () => import("../components/canvasui/Canvas") },
  vhs: { factory: "createVHS", load: () => import("../components/canvasui/VHS") },
  glitch: { factory: "createGlitch", load: () => import("../components/canvasui/Glitch") },
  "retro-dither": {
    factory: "createRetroDither",
    load: () => import("../components/canvasui/RetroDither"),
  },
  asciify: { factory: "createAsciify", load: () => import("../components/canvasui/Asciify") },
  "ascii-sweep": {
    factory: "createAsciiSweep",
    load: () => import("../components/canvasui/AsciiSweep"),
  },
  "decrypt-reveal": {
    factory: "createDecryptReveal",
    load: () => import("../components/canvasui/DecryptReveal"),
  },
  "glyph-rain": {
    factory: "createGlyphRain",
    load: () => import("../components/canvasui/GlyphRain"),
  },
  laser: { factory: "createLaser", load: () => import("../components/canvasui/Laser") },
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};
type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
  reset?: () => void;
};

function attachRasterBridge(source: HTMLCanvasElement) {
  const paintable = source as PaintableCanvas;
  const context = source.getContext("2d") as ElementImageContext | null;
  if (!context) return null;

  let raster: HTMLCanvasElement | null = null;
  const previousDrawElementImage = context.drawElementImage;
  const previousRequestPaint = paintable.requestPaint;
  const previousReset = context.reset;

  // Canvas UI checks these two experimental methods before it enables texture
  // capture. In WebView2 we provide the same synchronous contract, backed by a
  // DOM snapshot prepared below instead of Chromium's origin-trial API.
  context.drawElementImage = () => {
    if (!raster) return;
    context.drawImage(raster, 0, 0, source.width, source.height);
  };
  context.reset ??= () => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, source.width, source.height);
  };
  paintable.requestPaint = () => paintable.onpaint?.();

  return {
    setRaster(next: HTMLCanvasElement) {
      raster = next;
      paintable.requestPaint?.();
    },
    destroy() {
      paintable.onpaint = null;
      if (previousDrawElementImage) context.drawElementImage = previousDrawElementImage;
      else delete context.drawElementImage;
      if (previousRequestPaint) paintable.requestPaint = previousRequestPaint;
      else delete paintable.requestPaint;
      if (previousReset) context.reset = previousReset;
      raster = null;
    },
  };
}

function rasterCanvasStyle(): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  };
}

export function CanvasUiRasterFallback({
  effect,
  renderer = "webgl",
  options,
  children,
  className,
  sweepIndex = 0,
  captureTarget,
  onReady,
}: {
  effect: CanvasUiEffectId;
  renderer?: CanvasUiRenderer;
  options: EffectOptions;
  children?: ReactNode;
  className: string;
  sweepIndex?: number;
  captureTarget?: HTMLElement | null;
  onReady?: (ready: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const alternateSourceRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const alternateContentRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const underRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RasterEngine | null>(null);
  const optionsRef = useRef(options);
  const sweepIndexRef = useRef<0 | 1>(sweepIndex >= 1 ? 1 : 0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [gpuFailed, setGpuFailed] = useState(false);
  const useWebGPU = renderer === "webgpu" && effect === "liquid" && !gpuFailed;
  const engineKey = `${effect}-${useWebGPU ? "webgpu" : "webgl"}`;

  optionsRef.current = options;
  sweepIndexRef.current = sweepIndex >= 1 ? 1 : 0;

  useEffect(() => {
    engineRef.current?.setOptions(options);
  }, [options]);

  useEffect(() => {
    const engine = engineRef.current;
    if (
      effect !== "ascii-sweep" ||
      !engine?.sweep ||
      engine.current?.() === sweepIndexRef.current
    ) {
      return;
    }
    const angle = typeof options.angle === "number" ? options.angle : 0;
    engine.sweep(sweepIndexRef.current, {
      angle: sweepIndexRef.current === 0 ? angle + 180 : angle,
    });
  }, [effect, options.angle, sweepIndex]);

  useEffect(() => {
    const root = rootRef.current;
    const source = sourceRef.current;
    const alternateSource = alternateSourceRef.current;
    const content = contentRef.current;
    const alternateContent = alternateContentRef.current;
    const output = outputRef.current;
    if (!root || !source || !content || !output) return;
    const observedTarget = captureTarget ?? content;

    let destroyed = false;
    let captureTimer = 0;
    let captureRunning = false;
    let captureAgain = false;
    let readyFrame = 0;
    let engineStarted = false;
    const abortController = new AbortController();
    const bridge = attachRasterBridge(source);
    const alternateBridge =
      effect === "ascii-sweep" && alternateSource ? attachRasterBridge(alternateSource) : null;

    const markReady = () => {
      if (destroyed || !engineStarted) return;
      setStatus("ready");
      if (
        canvasUiReplacesContent(effect) &&
        !observedTarget.hasAttribute(CANVAS_UI_REPLACED_ATTRIBUTE)
      ) {
        observedTarget.setAttribute(CANVAS_UI_REPLACED_ATTRIBUTE, "");
      }
      onReady?.(true);
    };

    const markFailed = () => {
      observedTarget.removeAttribute(CANVAS_UI_REPLACED_ATTRIBUTE);
      setStatus("failed");
      onReady?.(false);
    };

    const capture = async () => {
      if (destroyed || !bridge || !engineStarted) return;
      if (captureRunning) {
        captureAgain = true;
        return;
      }
      const rect = observedTarget.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      captureRunning = true;
      try {
        const raster = await queueCanvasUiCapture(async () => {
          if (destroyed || !observedTarget.isConnected) return null;
          // A transparent button inherits its visible backdrop from surrounding
          // layers (often a sibling gradient/image), not from backgroundColor.
          // Capture that composed surface and crop it to the selected element.
          // Feeding an isolated transparent snapshot lets 3D engines substitute
          // their default white backing instead of the launcher's actual shade.
          const snapshotTarget = captureTarget
            ? (observedTarget.closest<HTMLElement>(".gallery-root") ?? document.body)
            : observedTarget;
          const snapshotRect = snapshotTarget.getBoundingClientRect();
          const targetRect = observedTarget.getBoundingClientRect();
          return html2canvas(snapshotTarget, {
            allowTaint: false,
            backgroundColor: null,
            ignoreElements: (element) => element.matches(CAPTURE_IGNORE_SELECTOR),
            logging: false,
            onclone: (_document, clonedTarget) => {
              const transientClasses = ["appearance-pick-selected", "appearance-pick-target"];
              // Effects conceal the live source only after the first texture is
              // ready. Always capture its original styling, including state previews.
              _document
                .querySelectorAll(`[${CANVAS_UI_REPLACED_ATTRIBUTE}]`)
                .forEach((node) => node.removeAttribute(CANVAS_UI_REPLACED_ATTRIBUTE));
              const originals = [
                snapshotTarget,
                ...snapshotTarget.querySelectorAll<HTMLElement>("*"),
              ].filter((node) => !node.closest(CAPTURE_IGNORE_SELECTOR));
              const clones = [clonedTarget, ...clonedTarget.querySelectorAll<HTMLElement>("*")];
              originals.forEach((node, index) => {
                const clone = clones[index];
                if (!clone || !node.matches(":hover, :focus, :active")) return;
                const style = getComputedStyle(node);
                for (const property of [
                  "color",
                  "background-color",
                  "background-image",
                  "border-color",
                  "border-radius",
                  "opacity",
                  "font-weight",
                  "text-decoration",
                  "box-shadow",
                ]) {
                  if (
                    property === "box-shadow" &&
                    node.classList.contains("appearance-pick-selected")
                  )
                    continue;
                  clone.style.setProperty(property, style.getPropertyValue(property), "important");
                }
              });
              clonedTarget.classList.remove(...transientClasses);
              clonedTarget
                .querySelectorAll<HTMLElement>(transientClasses.map((name) => `.${name}`).join(","))
                .forEach((node) => node.classList.remove(...transientClasses));
            },
            removeContainer: true,
            scale: Math.min(window.devicePixelRatio || 1, 2),
            x: targetRect.left - snapshotRect.left,
            y: targetRect.top - snapshotRect.top,
            width: targetRect.width,
            height: targetRect.height,
            signal: abortController.signal,
            useCORS: true,
          });
        });
        if (destroyed || !raster || !engineRef.current || !engineStarted) return;
        bridge.setRaster(raster);
        alternateBridge?.setRaster(raster);
        engineRef.current?.resize();
        engineRef.current?.capture?.();
        // Let the engine upload/draw before replacing the live source.
        window.cancelAnimationFrame(readyFrame);
        readyFrame = window.requestAnimationFrame(markReady);
      } catch (error) {
        if (!destroyed && !(error instanceof DOMException && error.name === "AbortError")) {
          console.warn(`Canvas UI ${effect} raster fallback could not capture the target:`, error);
          markFailed();
        }
      } finally {
        captureRunning = false;
        if (captureAgain && !destroyed) {
          captureAgain = false;
          scheduleCapture(80);
        }
      }
    };

    const scheduleCapture = (delay = 160) => {
      // A throttle, not a debounce: continuous animations must not indefinitely
      // postpone the next texture update.
      if (captureTimer || destroyed) return;
      captureTimer = window.setTimeout(() => {
        captureTimer = 0;
        void capture();
      }, delay);
    };

    const descriptor = useWebGPU
      ? { factory: "createLiquid", load: () => import("../components/canvasui/LiquidWebGPU") }
      : RASTER_ENGINES[effect];
    if (!descriptor) {
      setStatus("failed");
      onReady?.(false);
      return;
    }
    void descriptor
      .load()
      .then(async (loaded) => {
        if (destroyed) return;
        const factory = (loaded as RasterModule)[descriptor.factory] as
          | RasterEngineFactory
          | undefined;
        if (typeof factory !== "function") throw new Error(`Missing ${descriptor.factory} export`);

        const elements: RasterElements =
          effect === "ascii-sweep" && alternateSource && alternateContent
            ? ({
                slots: [
                  { source, content: observedTarget },
                  { source: alternateSource, content: alternateContent },
                ],
                output,
                raster: true,
              } as unknown as RasterElements)
            : {
                source,
                content: observedTarget,
                output,
                under: underRef.current ?? undefined,
                raster: true,
              };
        const engine = factory(elements, optionsRef.current);
        if (!engine) {
          if (useWebGPU) {
            setGpuFailed(true);
            return;
          }
          throw new Error("WebGL2 is unavailable");
        }
        engineRef.current = engine;
        if (engine.ready && !(await engine.ready)) {
          if (!destroyed) setGpuFailed(true);
          return;
        }
        if (destroyed) return;
        engineStarted = true;
        scheduleCapture(0);
      })
      .catch((error) => {
        if (destroyed) return;
        if (useWebGPU) {
          setGpuFailed(true);
          return;
        }
        console.warn(`Canvas UI ${effect} raster fallback could not start:`, error);
        markFailed();
      });

    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName !== CANVAS_UI_REPLACED_ATTRIBUTE))
        scheduleCapture();
    });
    observer.observe(observedTarget, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    const resizeObserver = new ResizeObserver(() => scheduleCapture(80));
    resizeObserver.observe(observedTarget);
    const visualChange = () => scheduleCapture(80);
    const scrollChange = (event: Event) => {
      const scroller = event.target;
      if (
        scroller instanceof Node &&
        (observedTarget.contains(scroller) || scroller.contains(observedTarget))
      ) {
        visualChange();
      }
    };
    const forward = (event: Event) => {
      const viewport = root.parentElement;
      if (viewport && event instanceof PointerEvent) {
        const rect = viewport.getBoundingClientRect();
        viewport.style.setProperty("--canvas-ui-pointer-x", `${event.clientX - rect.left}px`);
        viewport.style.setProperty("--canvas-ui-pointer-y", `${event.clientY - rect.top}px`);
      }
      forwardCanvasUiPointer(event, root);
    };
    const stopForwarded = (event: Event) => {
      if (!event.isTrusted) event.stopPropagation();
    };
    // Content-based engines listen to the real target. Wrapper-based engines
    // also need its events when the output lives in the element overlay.
    if (captureTarget)
      CANVAS_UI_POINTER_EVENTS.forEach((type) => {
        observedTarget.addEventListener(type, forward);
        root.addEventListener(type, stopForwarded);
      });
    const interactionEvents = [
      "pointerover",
      "pointerout",
      "pointerdown",
      "pointerup",
      "focusin",
      "focusout",
    ];
    interactionEvents.forEach((type) => observedTarget.addEventListener(type, visualChange, true));
    document.addEventListener("scroll", scrollChange, true);
    const appearanceObserver = new MutationObserver(visualChange);
    appearanceObserver.observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    let ancestor = observedTarget.parentElement;
    while (ancestor) {
      appearanceObserver.observe(ancestor, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
      ancestor = ancestor.parentElement;
    }
    const mediaTimer = window.setInterval(() => {
      if (
        document.visibilityState !== "hidden" &&
        observedTarget.isConnected &&
        (observedTarget.matches("canvas, video") ||
          observedTarget.querySelector("canvas, video") ||
          observedTarget
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === "running"))
      ) {
        scheduleCapture();
      }
    }, 500);
    const contextLost = (event: Event) => {
      event.preventDefault();
      engineStarted = false;
      window.cancelAnimationFrame(readyFrame);
      markFailed();
    };
    output.addEventListener("webglcontextlost", contextLost);
    observedTarget.addEventListener("load", visualChange, true);
    observedTarget.addEventListener("loadeddata", visualChange, true);
    observedTarget.addEventListener("input", visualChange, true);
    observedTarget.addEventListener("change", visualChange, true);
    observedTarget.addEventListener("transitionend", visualChange, true);
    observedTarget.addEventListener("animationend", visualChange, true);
    document.fonts?.addEventListener("loadingdone", visualChange);

    setStatus("loading");
    onReady?.(false);
    return () => {
      destroyed = true;
      abortController.abort();
      window.clearTimeout(captureTimer);
      window.cancelAnimationFrame(readyFrame);
      observedTarget.removeAttribute(CANVAS_UI_REPLACED_ATTRIBUTE);
      observer.disconnect();
      appearanceObserver.disconnect();
      window.clearInterval(mediaTimer);
      resizeObserver.disconnect();
      observedTarget.removeEventListener("load", visualChange, true);
      observedTarget.removeEventListener("loadeddata", visualChange, true);
      observedTarget.removeEventListener("input", visualChange, true);
      observedTarget.removeEventListener("change", visualChange, true);
      observedTarget.removeEventListener("transitionend", visualChange, true);
      observedTarget.removeEventListener("animationend", visualChange, true);
      document.fonts?.removeEventListener("loadingdone", visualChange);
      document.removeEventListener("scroll", scrollChange, true);
      output.removeEventListener("webglcontextlost", contextLost);
      interactionEvents.forEach((type) =>
        observedTarget.removeEventListener(type, visualChange, true),
      );
      if (captureTarget)
        CANVAS_UI_POINTER_EVENTS.forEach((type) => {
          observedTarget.removeEventListener(type, forward);
          root.removeEventListener(type, stopForwarded);
        });
      engineRef.current?.destroy();
      engineRef.current = null;
      // StrictMode replays setup on the same mounted canvas. Release contexts
      // only once that canvas has actually been removed/replaced.
      window.setTimeout(() => {
        if (!output.isConnected && !useWebGPU)
          output.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      }, 0);
      bridge?.destroy();
      alternateBridge?.destroy();
      onReady?.(false);
    };
  }, [captureTarget, effect, onReady, useWebGPU]);

  return (
    <div
      ref={rootRef}
      className={`${className} canvas-ui-raster-fallback`}
      data-external-capture={captureTarget ? "true" : undefined}
      data-raster-status={status}
      data-canvas-ui-renderer={useWebGPU ? "webgpu" : "webgl"}
    >
      {effect === "peel" ? (
        <div ref={underRef} className="canvas-ui-raster-under">
          <div className="canvas-ui-peel-under" />
        </div>
      ) : null}
      <div ref={contentRef} className="canvas-ui-raster-content">
        {children}
      </div>
      <div ref={alternateContentRef} className="canvas-ui-raster-alternate" aria-hidden />
      <canvas
        key={`${engineKey}-source`}
        ref={sourceRef}
        className="canvas-ui-raster-source"
        aria-hidden
      />
      <canvas
        key={`${engineKey}-alternate`}
        ref={alternateSourceRef}
        className="canvas-ui-raster-source"
        aria-hidden
      />
      <canvas
        key={engineKey}
        ref={outputRef}
        className="canvas-ui-raster-output"
        style={rasterCanvasStyle()}
        aria-hidden
      />
    </div>
  );
}
