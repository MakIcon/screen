import {
  lazy,
  Suspense,
  useEffect,
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
import { CanvasUiNativeElementContent } from "./CanvasUiNativeElementContent";
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
  const [sweepIndex, setSweepIndex] = useState(0);
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
  const Effect =
    renderer === "webgpu" && effect === "liquid" ? LIQUID_WEBGPU : WEBGL_EFFECTS[effect];
  const effectProps = useMemo(() => {
    const props = resolveCanvasUiEffectProps(effect, settings);
    if (!captureTarget || !elementSize) return props;
    return fitCanvasUiEffectProps(effect, props, elementSize.width, elementSize.height);
  }, [captureTarget, effect, elementSize, settings]);
  useEffect(() => {
    if (effect !== "ascii-sweep") return;
    const duration = Number(effectProps.duration ?? 1.6);
    const timer = window.setInterval(
      () => setSweepIndex((current) => (current === 0 ? 1 : 0)),
      Math.max(900, duration * 1_000 + 550),
    );
    return () => window.clearInterval(timer);
  }, [effect, effectProps.duration]);

  // The official wrappers own their live HTML-in-Canvas subtree and fall
  // back themselves. Never emulate the API with periodic DOM screenshots.
  if (captureTarget && !htmlInCanvas) return null;
  const effectContent = captureTarget ? (
    <CanvasUiNativeElementContent target={captureTarget} effect={effect} />
  ) : (
    <div className="canvas-ui-page-content">{children}</div>
  );

  return (
    <div
      className="canvas-ui-effect-viewport"
      data-canvas-ui-effect={effect}
      data-canvas-ui-capture={htmlInCanvas ? "native" : "unsupported"}
    >
      <Suspense fallback={captureTarget ? null : <div className={className}>{children}</div>}>
        <Effect
          {...effectProps}
          className={className}
          alternate={effect === "ascii-sweep" ? effectContent : undefined}
          index={effect === "ascii-sweep" ? sweepIndex : undefined}
          under={effect === "peel" ? <div className="canvas-ui-peel-under" /> : undefined}
          targets={effect === "glass" ? "[data-glass-target], .canvas-ui-element-clone" : undefined}
        >
          {effectContent}
        </Effect>
      </Suspense>
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
