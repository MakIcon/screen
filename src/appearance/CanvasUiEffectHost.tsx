import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useMemo,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import steveFaceUrl from "../assets/plugins/steve-face.svg";
import {
  fitCanvasUiEffectProps,
  getCanvasUiEffect,
  resolveCanvasUiEffectProps,
} from "./canvasUiCatalog";
import { CanvasUiRasterFallback } from "./CanvasUiRasterFallback";
import { forwardCanvasUiPointer } from "./canvasUiRuntime";
import type {
  CanvasUiEffectConfig,
  CanvasUiEffectId,
  CanvasUiEffectSettings,
  CanvasUiRenderer,
} from "./types";

type EffectComponent = ComponentType<
  Record<string, unknown> & {
    children?: ReactNode;
    alternate?: ReactNode;
    className?: string;
    style?: CSSProperties;
    src?: string;
  }
>;
type EffectModule = Record<string, unknown> & { default?: unknown };

function effectLoader(loader: () => Promise<unknown>, exportName: string) {
  return lazy(async () => {
    const module = (await loader()) as EffectModule;
    const component = (module[exportName] ?? module.default) as EffectComponent;
    return { default: component };
  });
}

const WEBGL_EFFECTS: Record<CanvasUiEffectId, ReturnType<typeof effectLoader>> = {
  "ascii-object": effectLoader(() => import("../components/canvasui/AsciiObject"), "AsciiObject"),
  "ascii-sweep": effectLoader(() => import("../components/canvasui/AsciiSweep"), "AsciiSweep"),
  asciify: effectLoader(() => import("../components/canvasui/Asciify"), "Asciify"),
  bend: effectLoader(() => import("../components/canvasui/Bend"), "Bend"),
  blaze: effectLoader(() => import("../components/canvasui/Blaze"), "Blaze"),
  bubble: effectLoader(() => import("../components/canvasui/Bubble"), "Bubble"),
  canvas: effectLoader(() => import("../components/canvasui/Canvas"), "Canvas"),
  cloth: effectLoader(() => import("../components/canvasui/Cloth"), "Cloth"),
  clouds: effectLoader(() => import("../components/canvasui/Clouds"), "Clouds"),
  "decrypt-reveal": effectLoader(
    () => import("../components/canvasui/DecryptReveal"),
    "DecryptReveal",
  ),
  displacement: effectLoader(() => import("../components/canvasui/Displacement"), "Displacement"),
  "dithered-object": effectLoader(
    () => import("../components/canvasui/DitheredObject"),
    "DitheredObject",
  ),
  droplets: effectLoader(() => import("../components/canvasui/Droplets"), "Droplets"),
  "flame-wrap": effectLoader(() => import("../components/canvasui/FlameWrap"), "FlameWrap"),
  "force-field": effectLoader(() => import("../components/canvasui/ForceField"), "ForceField"),
  frost: effectLoader(() => import("../components/canvasui/Frost"), "Frost"),
  glass: effectLoader(() => import("../components/canvasui/Glass"), "Glass"),
  "glass-object": effectLoader(() => import("../components/canvasui/GlassObject"), "GlassObject"),
  glitch: effectLoader(() => import("../components/canvasui/Glitch"), "Glitch"),
  "glyph-rain": effectLoader(() => import("../components/canvasui/GlyphRain"), "GlyphRain"),
  grid: effectLoader(() => import("../components/canvasui/Grid"), "Grid"),
  "hex-float": effectLoader(() => import("../components/canvasui/HexFloat"), "HexFloat"),
  "ink-object": effectLoader(() => import("../components/canvasui/InkObject"), "InkObject"),
  laser: effectLoader(() => import("../components/canvasui/Laser"), "Laser"),
  liquid: effectLoader(() => import("../components/canvasui/Liquid"), "Liquid"),
  "liquid-object": effectLoader(
    () => import("../components/canvasui/LiquidObject"),
    "LiquidObject",
  ),
  magnify: effectLoader(() => import("../components/canvasui/Magnify"), "Magnify"),
  "particle-object": effectLoader(
    () => import("../components/canvasui/ParticleObject"),
    "ParticleObject",
  ),
  "particle-reveal": effectLoader(
    () => import("../components/canvasui/ParticleReveal"),
    "ParticleReveal",
  ),
  "particle-scroll": effectLoader(
    () => import("../components/canvasui/ParticleScroll"),
    "ParticleScroll",
  ),
  peel: effectLoader(() => import("../components/canvasui/Peel"), "Peel"),
  "retro-dither": effectLoader(() => import("../components/canvasui/RetroDither"), "RetroDither"),
  ripple: effectLoader(() => import("../components/canvasui/Ripple"), "Ripple"),
  shatter: effectLoader(() => import("../components/canvasui/Shatter"), "Shatter"),
  vhs: effectLoader(() => import("../components/canvasui/VHS"), "VHS"),
};

const LIQUID_WEBGPU = effectLoader(() => import("../components/canvasui/LiquidWebGPU"), "Liquid");

function supportsHtmlInCanvas() {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas") as HTMLCanvasElement & {
    requestPaint?: () => void;
  };
  const context = canvas.getContext("2d") as
    | (CanvasRenderingContext2D & {
        drawElementImage?: (element: Element, x: number, y: number) => void;
      })
    | null;
  return Boolean(context?.drawElementImage && canvas.requestPaint);
}

function useHtmlInCanvasSupport() {
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(supportsHtmlInCanvas()), []);
  return supported;
}

function CompatibilityLayer({ effect }: { effect: CanvasUiEffectId }) {
  return <div className={`canvas-ui-compat-layer canvas-ui-compat-layer--${effect}`} aria-hidden />;
}

function optionNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionColor(value: unknown) {
  if (Array.isArray(value) && value.length === 3) {
    return `rgb(${value.map((channel) => Math.round(optionNumber(channel, 1) * 255)).join(" ")})`;
  }
  return typeof value === "string" && value.startsWith("#") ? value : "#4f8aff";
}

function CanvasUiPageEffect({
  effect,
  renderer,
  settings,
  children,
  className = "canvas-ui-effect-shell",
  captureTarget,
}: {
  effect: CanvasUiEffectId;
  renderer: CanvasUiRenderer;
  settings?: CanvasUiEffectSettings;
  children?: ReactNode;
  className?: string;
  captureTarget?: HTMLElement | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sweepIndex, setSweepIndex] = useState(0);
  const [rasterReady, setRasterReady] = useState(false);
  const [elementSize, setElementSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!captureTarget) return;
    const update = () => {
      const rect = captureTarget.getBoundingClientRect();
      setElementSize((current) =>
        current?.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(captureTarget);
    return () => observer.disconnect();
  }, [captureTarget]);
  const htmlInCanvas = useHtmlInCanvasSupport();
  const useRasterFallback = Boolean(captureTarget) || !htmlInCanvas;
  const Effect =
    renderer === "webgpu" && effect === "liquid" ? LIQUID_WEBGPU : WEBGL_EFFECTS[effect];
  const effectProps = useMemo(() => {
    const props = resolveCanvasUiEffectProps(effect, settings);
    if (!captureTarget || !elementSize) return props;
    return fitCanvasUiEffectProps(effect, props, elementSize.width, elementSize.height);
  }, [captureTarget, effect, elementSize, settings]);
  const compatStyle = {
    "--canvas-ui-compat-opacity": String(
      Math.min(
        0.92,
        Math.max(
          0.18,
          optionNumber(
            effectProps.opacity ??
              effectProps.intensity ??
              effectProps.strength ??
              effectProps.glow,
            0.7,
          ),
        ),
      ),
    ),
    "--canvas-ui-compat-color": optionColor(
      effectProps.color ?? effectProps.tint ?? effectProps.edgeColor,
    ),
    "--canvas-ui-compat-size": `${Math.max(
      8,
      optionNumber(effectProps.tileSize ?? effectProps.cell ?? effectProps.size, 56),
    )}px`,
    "--canvas-ui-compat-speed": `${Math.max(
      0.45,
      3 / Math.max(0.15, optionNumber(effectProps.speed ?? effectProps.waveSpeed, 1)),
    )}s`,
    "--canvas-ui-pointer-x": "50%",
    "--canvas-ui-pointer-y": "50%",
  } as CSSProperties;

  useEffect(() => {
    if (effect !== "ascii-sweep") return;
    const duration = Number(effectProps.duration ?? 1.6);
    const timer = window.setInterval(
      () => setSweepIndex((current) => (current === 0 ? 1 : 0)),
      Math.max(900, duration * 1_000 + 550),
    );
    return () => window.clearInterval(timer);
  }, [effect, effectProps.duration]);

  const updatePointer = (clientX: number, clientY: number) => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    host.style.setProperty("--canvas-ui-pointer-x", `${clientX - rect.left}px`);
    host.style.setProperty("--canvas-ui-pointer-y", `${clientY - rect.top}px`);
  };

  const content = useRasterFallback ? (
    <CanvasUiRasterFallback
      effect={effect}
      renderer={renderer}
      options={effectProps}
      className={className}
      sweepIndex={sweepIndex}
      captureTarget={captureTarget}
      onReady={setRasterReady}
    >
      {children}
    </CanvasUiRasterFallback>
  ) : (
    <Suspense fallback={<div className={className}>{children}</div>}>
      <Effect
        {...effectProps}
        className={className}
        alternate={effect === "ascii-sweep" ? children : undefined}
        index={effect === "ascii-sweep" ? sweepIndex : undefined}
        under={effect === "peel" ? <div className="canvas-ui-peel-under" /> : undefined}
        targets={effect === "glass" ? "[data-glass-target], .canvas-ui-element-clone" : undefined}
      >
        {children}
      </Effect>
    </Suspense>
  );

  return (
    <div
      ref={hostRef}
      className="canvas-ui-effect-viewport"
      data-canvas-ui-effect={effect}
      data-canvas-ui-capture={useRasterFallback ? (rasterReady ? "raster" : "compat") : "native"}
      style={compatStyle}
      onPointerMove={(event) => updatePointer(event.clientX, event.clientY)}
    >
      {content}
      {useRasterFallback && !rasterReady && <CompatibilityLayer effect={effect} />}
    </div>
  );
}

export function CanvasUiEffectHost({
  config,
  children,
}: {
  config: CanvasUiEffectConfig;
  children: ReactNode;
}) {
  const forwardObjectPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isTrusted) return;
    if (
      event.type === "pointerdown" &&
      event.target instanceof Element &&
      event.target.closest("button, a, input, textarea, select, [role=button], [contenteditable]")
    )
      return;
    const canvas = event.currentTarget.querySelector<HTMLCanvasElement>(
      ".canvas-ui-object-layer canvas",
    );
    if (canvas) forwardCanvasUiPointer(event.nativeEvent, canvas);
  };
  if (!config.enabled) return children;

  const definition = getCanvasUiEffect(config.effect);
  const settings = config.settings[config.effect];
  if (definition.objectEffect) {
    const Effect = WEBGL_EFFECTS[config.effect];
    return (
      <div
        className="canvas-ui-composite"
        data-canvas-ui-effect={config.effect}
        onPointerMove={forwardObjectPointer}
        onPointerDown={forwardObjectPointer}
        onPointerUp={forwardObjectPointer}
        onPointerLeave={forwardObjectPointer}
        onPointerCancel={forwardObjectPointer}
      >
        {children}
        <Suspense fallback={null}>
          <Effect
            {...resolveCanvasUiEffectProps(config.effect, settings)}
            src={config.assetUrl || steveFaceUrl}
            className="canvas-ui-object-layer"
          />
        </Suspense>
      </div>
    );
  }

  return (
    <CanvasUiPageEffect effect={config.effect} renderer={config.renderer} settings={settings}>
      {children}
    </CanvasUiPageEffect>
  );
}

export function CanvasUiElementEffect({
  config,
  children,
  captureTarget,
}: {
  config: CanvasUiEffectConfig;
  children?: ReactNode;
  captureTarget?: HTMLElement | null;
}) {
  if (!config.enabled) return children;
  const definition = getCanvasUiEffect(config.effect);
  const settings = config.settings[config.effect];
  if (definition.objectEffect) {
    const Effect = WEBGL_EFFECTS[config.effect];
    return (
      <div className="canvas-ui-element-composite" data-canvas-ui-effect={config.effect}>
        {children}
        <Suspense fallback={null}>
          <Effect
            {...resolveCanvasUiEffectProps(config.effect, settings)}
            src={config.assetUrl || steveFaceUrl}
            className="canvas-ui-element-object-layer"
          />
        </Suspense>
      </div>
    );
  }
  return (
    <CanvasUiPageEffect
      effect={config.effect}
      renderer={config.renderer}
      settings={settings}
      className="canvas-ui-effect-shell canvas-ui-effect-shell--element"
      captureTarget={captureTarget}
    >
      {children}
    </CanvasUiPageEffect>
  );
}
