import {
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  AppearanceElementGradientRadialShape,
  AppearanceElementGradientType,
  AppearanceElementOverride,
} from "../../appearance/types";
import { RangeField } from "../../appearance/StudioFields";
import {
  DEFAULT_GRADIENT_ANGLE,
  DEFAULT_GRADIENT_CENTER,
  DEFAULT_GRADIENT_MIDPOINT,
  DEFAULT_GRADIENT_RADIAL_ASPECT,
  DEFAULT_GRADIENT_SCALE,
  DEFAULT_GRADIENT_SOFTNESS,
  gradientCurveValue,
} from "../../appearance/elementGradient";
import "./GradientGraphEditor.css";

type BackgroundStyle = AppearanceElementOverride["style"];

type GradientGraphEditorProps = {
  style?: BackgroundStyle;
  onChange: (style: Partial<BackgroundStyle>) => void;
};

const GRADIENT_TYPES: { id: AppearanceElementGradientType; label: string }[] = [
  { id: "linear", label: "LINEAR" },
  { id: "radial", label: "RADIAL" },
  { id: "conic", label: "CONIC" },
];

const DIRECTION_PRESETS = [
  { angle: 0, label: "↑", name: "Top" },
  { angle: 45, label: "↗", name: "Top right" },
  { angle: 90, label: "→", name: "Right" },
  { angle: 135, label: "↘", name: "Bottom right" },
  { angle: 180, label: "↓", name: "Bottom" },
  { angle: 225, label: "↙", name: "Bottom left" },
  { angle: 270, label: "←", name: "Left" },
  { angle: 315, label: "↖", name: "Top left" },
] as const;

const ORIGIN_PRESETS = [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 100, y: 0 },
  { x: 0, y: 50 },
  { x: 50, y: 50 },
  { x: 100, y: 50 },
  { x: 0, y: 100 },
  { x: 50, y: 100 },
  { x: 100, y: 100 },
] as const;

const CURVE_PRESETS = [
  { id: "linear", label: "LINEAR", midpoint: 0.5, softness: 1 },
  { id: "smooth", label: "SMOOTH", midpoint: 0.5, softness: DEFAULT_GRADIENT_SOFTNESS },
  { id: "film", label: "FILMIC", midpoint: 0.4, softness: 0.28 },
  { id: "punch", label: "PUNCH", midpoint: 0.5, softness: 0 },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pointerPositionIn(event: ReactPointerEvent, element: Element | null) {
  if (!element) return { x: 50, y: 50 };
  const rect = element.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
  };
}

export function GradientGraphEditor({ style, onChange }: GradientGraphEditorProps) {
  const geometryPadRef = useRef<HTMLDivElement>(null);
  const curveHandleRef = useRef<"midpoint" | "softness">("midpoint");
  const gradientType = style?.backgroundGradientType ?? "linear";
  const gradientAngle = style?.backgroundGradientAngle ?? DEFAULT_GRADIENT_ANGLE;
  const centerX = style?.backgroundGradientCenterX ?? DEFAULT_GRADIENT_CENTER;
  const centerY = style?.backgroundGradientCenterY ?? DEFAULT_GRADIENT_CENTER;
  const gradientScale = style?.backgroundGradientScale ?? DEFAULT_GRADIENT_SCALE;
  const radialShape = style?.backgroundGradientRadialShape ?? "circle";
  const radialAspect = style?.backgroundGradientRadialAspect ?? DEFAULT_GRADIENT_RADIAL_ASPECT;
  const gradientMidpoint = style?.backgroundGradientMidpoint ?? DEFAULT_GRADIENT_MIDPOINT;
  const gradientSoftness = style?.backgroundGradientSoftness ?? DEFAULT_GRADIENT_SOFTNESS;

  const curvePath = useMemo(() => {
    const points = Array.from({ length: 49 }, (_, index) => {
      const progress = index / 48;
      const x = 10 + progress * 80;
      const y = 90 - gradientCurveValue(progress, gradientMidpoint, gradientSoftness) * 80;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    });
    return points.join(" ");
  }, [gradientMidpoint, gradientSoftness]);

  const curveAreaPath = `${curvePath} L90 90 L10 90 Z`;
  const softnessProgress = gradientMidpoint / 2;
  const softnessHandleX = 10 + softnessProgress * 80;
  const softnessHandleY =
    90 - gradientCurveValue(softnessProgress, gradientMidpoint, gradientSoftness) * 80;

  const angleRadians = (gradientAngle * Math.PI) / 180;
  const directionX = Math.sin(angleRadians);
  const directionY = -Math.cos(angleRadians);
  const vectorOriginX = gradientType === "linear" ? 50 : centerX;
  const vectorOriginY = gradientType === "linear" ? 50 : centerY;
  const vectorLength = gradientType === "linear" ? 35 : 32;
  const vectorStartX =
    gradientType === "linear" ? vectorOriginX - directionX * vectorLength : vectorOriginX;
  const vectorStartY =
    gradientType === "linear" ? vectorOriginY - directionY * vectorLength : vectorOriginY;
  const vectorEndX = vectorOriginX + directionX * vectorLength;
  const vectorEndY = vectorOriginY + directionY * vectorLength;
  const radialRadius = clamp(11 + gradientScale * 0.17, 11, 43);
  const radialRadiusY =
    radialShape === "circle" ? radialRadius : clamp(radialRadius * radialAspect, 5, 43);

  const updateGeometryFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId);
    if (event.type === "pointermove" && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const point = pointerPositionIn(event, geometryPadRef.current);
    if (gradientType === "linear") {
      const angle = (Math.atan2(point.x - 50, -(point.y - 50)) * 180) / Math.PI;
      onChange({ backgroundGradientAngle: Math.round((angle + 360) % 360) });
      return;
    }
    onChange({
      backgroundGradientCenterX: Math.round(point.x),
      backgroundGradientCenterY: Math.round(point.y),
    });
  };

  const updateGeometryFromKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const distance = event.shiftKey ? 10 : 1;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (gradientType === "linear") {
      const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
      onChange({
        backgroundGradientAngle: (gradientAngle + direction * distance + 360) % 360,
      });
      return;
    }
    onChange({
      backgroundGradientCenterX: clamp(
        centerX +
          (event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0),
        0,
        100,
      ),
      backgroundGradientCenterY: clamp(
        centerY + (event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0),
        0,
        100,
      ),
    });
  };

  const updateCurveFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.type === "pointerdown") {
      event.currentTarget.setPointerCapture(event.pointerId);
      curveHandleRef.current =
        event.target instanceof Element && event.target.getAttribute("data-handle") === "softness"
          ? "softness"
          : "midpoint";
    } else if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const point = pointerPositionIn(event, event.currentTarget);
    if (curveHandleRef.current === "softness") {
      const curveValue = clamp((90 - point.y) / 80, 0.011, 0.49);
      const exponent = Math.log(curveValue / 0.5) / Math.log(0.5);
      const softness = 1 - (exponent - 1) / 3.5;
      onChange({ backgroundGradientSoftness: clamp(softness, 0, 1) });
      return;
    }
    onChange({ backgroundGradientMidpoint: clamp((point.x - 10) / 80, 0.05, 0.95) });
  };

  const resetGeometry = () => {
    onChange({
      backgroundGradientAngle: DEFAULT_GRADIENT_ANGLE,
      backgroundGradientCenterX: DEFAULT_GRADIENT_CENTER,
      backgroundGradientCenterY: DEFAULT_GRADIENT_CENTER,
      backgroundGradientScale: DEFAULT_GRADIENT_SCALE,
      backgroundGradientRadialShape: "circle",
      backgroundGradientRadialAspect: DEFAULT_GRADIENT_RADIAL_ASPECT,
    });
  };

  const selectRadialShape = (shape: AppearanceElementGradientRadialShape) => {
    onChange({
      backgroundGradientRadialShape: shape,
      ...(shape === "circle"
        ? { backgroundGradientRadialAspect: DEFAULT_GRADIENT_RADIAL_ASPECT }
        : {}),
    });
  };

  const activeCurvePreset = CURVE_PRESETS.find(
    (preset) =>
      Math.abs(preset.midpoint - gradientMidpoint) < 0.005 &&
      Math.abs(preset.softness - gradientSoftness) < 0.005,
  )?.id;

  return (
    <div className="gradient-graph-editor">
      <section className="gradient-graph-panel">
        <header className="gradient-graph-panel__head">
          <div>
            <span>SHAPE & DIRECTION</span>
            <small>DRAG THE CANVAS OR USE PRECISE CONTROLS</small>
          </div>
          <button type="button" onClick={resetGeometry}>
            RESET
          </button>
        </header>

        <div className="gradient-graph-types">
          {GRADIENT_TYPES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={gradientType === option.id ? "active" : ""}
              onClick={() => onChange({ backgroundGradientType: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="gradient-geometry-layout">
          <div className="gradient-geometry-visual">
            <div
              ref={geometryPadRef}
              className="gradient-geometry-pad"
              role="slider"
              aria-label={gradientType === "linear" ? "Gradient angle" : "Gradient origin"}
              aria-valuemin={0}
              aria-valuemax={gradientType === "linear" ? 360 : 100}
              aria-valuenow={Math.round(gradientType === "linear" ? gradientAngle : centerX)}
              aria-valuetext={
                gradientType === "linear"
                  ? `${Math.round(gradientAngle)} degrees`
                  : `${Math.round(centerX)}%, ${Math.round(centerY)}%`
              }
              tabIndex={0}
              onPointerDown={updateGeometryFromPointer}
              onPointerMove={updateGeometryFromPointer}
              onKeyDown={updateGeometryFromKeyboard}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <path
                  className="gradient-geometry-grid"
                  d="M50 0V100M0 50H100M25 0V100M75 0V100M0 25H100M0 75H100"
                />
                {gradientType === "radial" && radialShape === "circle" && (
                  <>
                    <circle
                      className="gradient-geometry-ring"
                      cx={centerX}
                      cy={centerY}
                      r={radialRadius}
                    />
                    <circle
                      className="gradient-geometry-ring gradient-geometry-ring--inner"
                      cx={centerX}
                      cy={centerY}
                      r={radialRadius * 0.56}
                    />
                  </>
                )}
                {gradientType === "radial" && radialShape === "ellipse" && (
                  <>
                    <ellipse
                      className="gradient-geometry-ring"
                      cx={centerX}
                      cy={centerY}
                      rx={radialRadius}
                      ry={radialRadiusY}
                    />
                    <ellipse
                      className="gradient-geometry-ring gradient-geometry-ring--inner"
                      cx={centerX}
                      cy={centerY}
                      rx={radialRadius * 0.56}
                      ry={radialRadiusY * 0.56}
                    />
                  </>
                )}
                {gradientType === "conic" && (
                  <>
                    <circle
                      className="gradient-geometry-ring gradient-geometry-ring--conic"
                      cx={centerX}
                      cy={centerY}
                      r="31"
                    />
                    {Array.from({ length: 8 }, (_, index) => {
                      const rayAngle = ((index * 45 - 90) * Math.PI) / 180;
                      return (
                        <line
                          key={index}
                          className="gradient-geometry-ray"
                          x1={centerX}
                          y1={centerY}
                          x2={centerX + Math.cos(rayAngle) * 31}
                          y2={centerY + Math.sin(rayAngle) * 31}
                        />
                      );
                    })}
                  </>
                )}
                {gradientType !== "radial" && (
                  <line
                    className="gradient-geometry-vector"
                    x1={vectorStartX}
                    y1={vectorStartY}
                    x2={vectorEndX}
                    y2={vectorEndY}
                  />
                )}
                <circle
                  className="gradient-geometry-origin"
                  cx={vectorOriginX}
                  cy={vectorOriginY}
                  r="4"
                />
                {gradientType !== "radial" && (
                  <circle className="gradient-geometry-tip" cx={vectorEndX} cy={vectorEndY} r="3" />
                )}
              </svg>
              <small>{gradientType === "linear" ? "DRAG DIRECTION" : "DRAG ORIGIN"}</small>
            </div>

            {gradientType !== "linear" && (
              <div className="gradient-origin-preset-group">
                <span>ORIGIN PRESETS</span>
                <div className="gradient-origin-presets" aria-label="Origin presets">
                  {ORIGIN_PRESETS.map((preset) => (
                    <button
                      key={`${preset.x}-${preset.y}`}
                      type="button"
                      className={
                        Math.abs(centerX - preset.x) < 1 && Math.abs(centerY - preset.y) < 1
                          ? "active"
                          : ""
                      }
                      aria-label={`Origin ${preset.x}%, ${preset.y}%`}
                      data-tooltip={`Origin ${preset.x}%, ${preset.y}%`}
                      onClick={() =>
                        onChange({
                          backgroundGradientCenterX: preset.x,
                          backgroundGradientCenterY: preset.y,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="gradient-geometry-controls">
            {gradientType === "linear" && (
              <>
                <div className="gradient-direction-presets">
                  <span>DIRECTION PRESETS</span>
                  <div>
                    {DIRECTION_PRESETS.map((preset) => (
                      <button
                        key={preset.angle}
                        type="button"
                        className={Math.abs(gradientAngle - preset.angle) < 0.5 ? "active" : ""}
                        aria-label={preset.name}
                        data-tooltip={`${preset.name} · ${preset.angle}°`}
                        onClick={() => onChange({ backgroundGradientAngle: preset.angle })}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <RangeField
                  label="ANGLE"
                  value={Math.round(gradientAngle)}
                  min={0}
                  max={360}
                  step={1}
                  suffix=" DEG"
                  onChange={(backgroundGradientAngle) => onChange({ backgroundGradientAngle })}
                />
              </>
            )}

            {gradientType === "radial" && (
              <div className="gradient-radial-shape">
                <span>RADIAL SHAPE</span>
                <div>
                  {(["circle", "ellipse"] as const).map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      className={radialShape === shape ? "active" : ""}
                      onClick={() => selectRadialShape(shape)}
                    >
                      {shape.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gradientType !== "linear" && (
              <>
                <div className="gradient-origin-fields">
                  <RangeField
                    label="ORIGIN X"
                    value={Math.round(centerX)}
                    min={0}
                    max={100}
                    step={1}
                    suffix=" %"
                    onChange={(backgroundGradientCenterX) =>
                      onChange({ backgroundGradientCenterX })
                    }
                  />
                  <RangeField
                    label="ORIGIN Y"
                    value={Math.round(centerY)}
                    min={0}
                    max={100}
                    step={1}
                    suffix=" %"
                    onChange={(backgroundGradientCenterY) =>
                      onChange({ backgroundGradientCenterY })
                    }
                  />
                </div>
                {gradientType === "radial" && (
                  <>
                    <RangeField
                      label="RADIUS"
                      value={Math.round(gradientScale)}
                      min={10}
                      max={200}
                      step={1}
                      suffix=" %"
                      onChange={(backgroundGradientScale) => onChange({ backgroundGradientScale })}
                    />
                    {radialShape === "ellipse" && (
                      <RangeField
                        label="ASPECT"
                        value={Math.round(radialAspect * 100)}
                        min={25}
                        max={200}
                        step={1}
                        suffix=" %"
                        onChange={(value) =>
                          onChange({ backgroundGradientRadialAspect: value / 100 })
                        }
                      />
                    )}
                  </>
                )}
                {gradientType === "conic" && (
                  <RangeField
                    label="START ANGLE"
                    value={Math.round(gradientAngle)}
                    min={0}
                    max={360}
                    step={1}
                    suffix=" DEG"
                    onChange={(backgroundGradientAngle) => onChange({ backgroundGradientAngle })}
                  />
                )}
              </>
            )}
            <small className="gradient-precision-hint">SHIFT + ARROWS = 10× PRECISION STEP</small>
          </div>
        </div>
      </section>

      <section className="gradient-graph-panel">
        <header className="gradient-graph-panel__head">
          <div>
            <span>TRANSITION CURVE</span>
            <small>DRAG BOTH HANDLES TO SHAPE THE COLOR BLEND</small>
          </div>
          <button
            type="button"
            onClick={() =>
              onChange({
                backgroundGradientMidpoint: DEFAULT_GRADIENT_MIDPOINT,
                backgroundGradientSoftness: DEFAULT_GRADIENT_SOFTNESS,
              })
            }
          >
            RESET
          </button>
        </header>

        <div className="gradient-curve-presets">
          {CURVE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={activeCurvePreset === preset.id ? "active" : ""}
              onClick={() =>
                onChange({
                  backgroundGradientMidpoint: preset.midpoint,
                  backgroundGradientSoftness: preset.softness,
                })
              }
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="gradient-curve-canvas">
          <svg
            viewBox="0 0 100 100"
            role="slider"
            aria-label="Gradient transition curve"
            aria-valuemin={5}
            aria-valuemax={95}
            aria-valuenow={Math.round(gradientMidpoint * 100)}
            aria-valuetext={`${Math.round(gradientMidpoint * 100)}% midpoint, ${Math.round(
              gradientSoftness * 100,
            )}% softness`}
            tabIndex={0}
            onPointerDown={updateCurveFromPointer}
            onPointerMove={updateCurveFromPointer}
            onKeyDown={(event) => {
              const distance = event.shiftKey ? 0.1 : 0.01;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                onChange({
                  backgroundGradientMidpoint: clamp(
                    gradientMidpoint + (event.key === "ArrowLeft" ? -distance : distance),
                    0.05,
                    0.95,
                  ),
                });
              }
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                onChange({
                  backgroundGradientSoftness: clamp(
                    gradientSoftness + (event.key === "ArrowDown" ? -distance : distance),
                    0,
                    1,
                  ),
                });
              }
            }}
          >
            <defs>
              <linearGradient id="gradient-curve-fill" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="var(--accent)" stopOpacity="0.02" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0.22" />
              </linearGradient>
            </defs>
            <path className="gradient-curve-grid" d="M10 10V90H90M10 50H90M50 10V90" />
            <line
              className="gradient-curve-midpoint"
              x1={10 + gradientMidpoint * 80}
              y1="10"
              x2={10 + gradientMidpoint * 80}
              y2="90"
            />
            <path className="gradient-curve-area" d={curveAreaPath} />
            <path className="gradient-curve-line" d={curvePath} />
            <circle
              data-handle="softness"
              className="gradient-curve-handle gradient-curve-handle--softness"
              cx={softnessHandleX}
              cy={softnessHandleY}
              r="3.3"
            />
            <circle
              data-handle="midpoint"
              className="gradient-curve-handle"
              cx={10 + gradientMidpoint * 80}
              cy="50"
              r="4"
            />
          </svg>
          <div>
            <span>INPUT</span>
            <span>COLOR MIX</span>
          </div>
        </div>

        <div className="gradient-curve-fields">
          <RangeField
            label="MIDPOINT"
            value={Math.round(gradientMidpoint * 100)}
            min={5}
            max={95}
            step={1}
            suffix=" %"
            onChange={(value) => onChange({ backgroundGradientMidpoint: value / 100 })}
          />
          <RangeField
            label="SOFTNESS"
            value={Math.round(gradientSoftness * 100)}
            min={0}
            max={100}
            step={1}
            suffix=" %"
            onChange={(value) => onChange({ backgroundGradientSoftness: value / 100 })}
          />
        </div>
      </section>
    </div>
  );
}
