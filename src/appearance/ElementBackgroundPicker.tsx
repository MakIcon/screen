import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ColorPicker } from "../components/color-picker/ColorPicker";
import type { AppearanceElementGradientStop, AppearanceElementOverride } from "./types";
import { RangeField, SelectField } from "./StudioFields";
import { GradientGraphEditor } from "../components/gradient-editor/GradientGraphEditor";
import {
  buildElementGradientImage,
  DEFAULT_GRADIENT_STRENGTH,
  interpolateGradientStopColor,
  MAX_GRADIENT_STOPS,
  resolveElementGradientStops,
} from "./elementGradient";
import {
  DEFAULT_CUSTOM_GRADIENT_ANIMATION,
  GRADIENT_ANIMATIONS,
  GRADIENT_DIRECTIONS,
  GRADIENT_EASINGS,
  defaultGradientAnimationEasing,
  resolveGradientAnimation,
} from "./gradientAnimation";
import "./ElementBackgroundPicker.css";

type BackgroundStyle = AppearanceElementOverride["style"];

type ElementBackgroundPickerProps = {
  style?: BackgroundStyle;
  fallbackColor: string;
  fallbackAccent: string;
  onChange: (style: Partial<BackgroundStyle>) => void;
  title?: string;
  colorLabel?: string;
  previewMode?: "surface" | "text";
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ElementBackgroundPicker({
  style,
  fallbackColor,
  fallbackAccent,
  onChange,
  title = "BACKGROUND",
  colorLabel = "Background color",
  previewMode = "surface",
}: ElementBackgroundPickerProps) {
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [previewStuck, setPreviewStuck] = useState(false);
  const headRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const textPreviewRef = useRef<HTMLElement>(null);
  const motionPreviewRef = useRef<Animation | null>(null);
  const stopRailRef = useRef<HTMLDivElement>(null);
  const kind = style?.backgroundKind ?? "solid";
  const solidColor = style?.backgroundColor ?? fallbackColor;
  const stops = resolveElementGradientStops(style, solidColor, fallbackAccent);
  const activeStopIndex = clamp(selectedStopIndex, 0, stops.length - 1);
  const activeStop = stops[activeStopIndex];
  const gradientType = style?.backgroundGradientType ?? "linear";
  const gradientStrength = style?.backgroundGradientStrength ?? DEFAULT_GRADIENT_STRENGTH;
  const gradientAnimation = style?.backgroundGradientAnimation ?? "none";
  const gradientAnimationDuration = style?.backgroundGradientAnimationDuration ?? 6_000;
  const gradientAnimationDirection = style?.backgroundGradientAnimationDirection ?? "alternate";
  const gradientAnimationEasing =
    style?.backgroundGradientAnimationEasing ?? defaultGradientAnimationEasing(gradientAnimation);
  const gradientAnimationDefinition = useMemo(
    () =>
      resolveGradientAnimation(gradientAnimation, {
        easing: gradientAnimationEasing,
        startX: style?.backgroundGradientAnimationStartX,
        startY: style?.backgroundGradientAnimationStartY,
        endX: style?.backgroundGradientAnimationEndX,
        endY: style?.backgroundGradientAnimationEndY,
        scale: style?.backgroundGradientAnimationScale,
        hue: style?.backgroundGradientAnimationHue,
        saturation: style?.backgroundGradientAnimationSaturation,
        brightness: style?.backgroundGradientAnimationBrightness,
      }),
    [
      gradientAnimation,
      gradientAnimationEasing,
      style?.backgroundGradientAnimationBrightness,
      style?.backgroundGradientAnimationEndX,
      style?.backgroundGradientAnimationEndY,
      style?.backgroundGradientAnimationHue,
      style?.backgroundGradientAnimationSaturation,
      style?.backgroundGradientAnimationScale,
      style?.backgroundGradientAnimationStartX,
      style?.backgroundGradientAnimationStartY,
    ],
  );
  const gradientImage = buildElementGradientImage(style, solidColor, fallbackAccent, {
    baseColor: solidColor,
    opacity: 1,
  });
  const stopRailImage = buildElementGradientImage(
    { ...style, backgroundGradientType: "linear", backgroundGradientAngle: 90 },
    solidColor,
    fallbackAccent,
    { baseColor: solidColor, opacity: 1 },
  );

  useEffect(() => {
    if (previewMode !== "text") {
      setPreviewStuck(false);
      return;
    }
    const head = headRef.current;
    const preview = previewRef.current;
    const scroller = preview?.closest<HTMLElement>(".csa-content");
    if (!head || !scroller) return;

    const updateStickyState = () => {
      const naturalPreviewTop = head.getBoundingClientRect().bottom + 12;
      const scrollTop = scroller.getBoundingClientRect().top;
      const nextStuck = naturalPreviewTop <= scrollTop + 0.5;
      setPreviewStuck((current) => (current === nextStuck ? current : nextStuck));
    };

    updateStickyState();
    scroller.addEventListener("scroll", updateStickyState, { passive: true });
    window.addEventListener("resize", updateStickyState);
    return () => {
      scroller.removeEventListener("scroll", updateStickyState);
      window.removeEventListener("resize", updateStickyState);
    };
  }, [previewMode]);

  useEffect(() => {
    motionPreviewRef.current?.cancel();
    motionPreviewRef.current = null;
    if (kind !== "gradient" || !gradientAnimationDefinition) return;

    const target = previewMode === "text" ? textPreviewRef.current : previewRef.current;
    if (!target || typeof target.animate !== "function") return;
    const animation = target.animate(gradientAnimationDefinition.frames, {
      duration: gradientAnimationDuration,
      easing: gradientAnimationDefinition.easing,
      iterations: Infinity,
      direction: gradientAnimationDirection,
      fill: "both",
    });
    motionPreviewRef.current = animation;
    return () => {
      animation.cancel();
      if (motionPreviewRef.current === animation) motionPreviewRef.current = null;
    };
  }, [
    gradientAnimationDefinition,
    gradientAnimationDirection,
    gradientAnimationDuration,
    kind,
    previewMode,
  ]);

  const patchStops = (nextStops: AppearanceElementGradientStop[]) => {
    const orderedStops = [...nextStops].sort((left, right) => left.position - right.position);
    onChange({
      backgroundGradientStops: nextStops,
      backgroundGradientStart: orderedStops[0].color,
      backgroundGradientEnd: orderedStops[orderedStops.length - 1].color,
    });
  };

  const updateStop = (index: number, patch: Partial<AppearanceElementGradientStop>) => {
    patchStops(
      stops.map((stop, stopIndex) => (stopIndex === index ? { ...stop, ...patch } : stop)),
    );
  };

  const findStopColorAt = (position: number) => {
    const orderedStops = [...stops].sort((left, right) => left.position - right.position);
    const rightIndex = orderedStops.findIndex((stop) => stop.position >= position);
    if (rightIndex <= 0) return orderedStops[0].color;
    if (rightIndex < 0) return orderedStops[orderedStops.length - 1].color;
    return interpolateGradientStopColor(
      orderedStops[rightIndex - 1],
      orderedStops[rightIndex],
      position,
    );
  };

  const addStopAt = (position: number) => {
    if (stops.length >= MAX_GRADIENT_STOPS) return;
    const nextPosition = Math.round(clamp(position, 0, 100));
    const nextStop = { color: findStopColorAt(nextPosition), position: nextPosition };
    patchStops([...stops, nextStop]);
    setSelectedStopIndex(stops.length);
  };

  const addStopInLargestGap = () => {
    const orderedStops = [...stops].sort((left, right) => left.position - right.position);
    let largestGap = -1;
    let position = 50;
    for (let index = 0; index < orderedStops.length - 1; index += 1) {
      const gap = orderedStops[index + 1].position - orderedStops[index].position;
      if (gap > largestGap) {
        largestGap = gap;
        position = orderedStops[index].position + gap / 2;
      }
    }
    addStopAt(position);
  };

  const removeActiveStop = () => {
    if (stops.length <= 2) return;
    const nextStops = stops.filter((_, index) => index !== activeStopIndex);
    patchStops(nextStops);
    setSelectedStopIndex(Math.min(activeStopIndex, nextStops.length - 1));
  };

  const reverseStops = () => {
    patchStops(stops.map((stop) => ({ ...stop, position: 100 - stop.position })).reverse());
    setSelectedStopIndex(stops.length - 1 - activeStopIndex);
  };

  const pointerPositionIn = (event: ReactPointerEvent, element: Element | null) => {
    if (!element) return 50;
    const rect = element.getBoundingClientRect();
    return clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  const dragStop = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.type === "pointerdown") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectedStopIndex(index);
    } else if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    updateStop(index, { position: Math.round(pointerPositionIn(event, stopRailRef.current)) });
  };

  const selectKind = (nextKind: "solid" | "gradient") => {
    if (nextKind === "gradient") {
      const orderedStops = [...stops].sort((left, right) => left.position - right.position);
      onChange({
        backgroundKind: "gradient",
        backgroundColor: solidColor,
        backgroundGradientStart: orderedStops[0].color,
        backgroundGradientEnd: orderedStops[orderedStops.length - 1].color,
        backgroundGradientStops: stops,
      });
      return;
    }
    onChange({ backgroundKind: "solid", backgroundColor: solidColor });
  };

  return (
    <div
      className={`element-background-picker${
        previewMode === "text" ? " element-background-picker--text" : ""
      }`}
    >
      <div ref={headRef} className="element-background-picker__head">
        <span>{title}</span>
        <div className="element-background-picker__modes">
          {(["solid", "gradient"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={kind === option ? "active" : ""}
              onClick={() => selectKind(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={previewRef}
        className={`element-background-picker__preview${previewStuck ? " is-stuck" : ""}`}
        style={{
          backgroundColor: previewMode === "surface" ? solidColor : undefined,
          backgroundImage:
            previewMode === "surface" && kind === "gradient" ? gradientImage : "none",
        }}
      >
        {previewMode === "text" && (
          <strong
            ref={textPreviewRef}
            style={{
              color: solidColor,
              backgroundImage: kind === "gradient" ? gradientImage : "none",
              backgroundClip: kind === "gradient" ? "text" : undefined,
              WebkitBackgroundClip: kind === "gradient" ? "text" : undefined,
              WebkitTextFillColor: kind === "gradient" ? "transparent" : undefined,
            }}
          >
            TEXT PREVIEW
          </strong>
        )}
        <span>
          {kind === "gradient"
            ? `${gradientType.toUpperCase()} · ${stops.length} STOPS`
            : solidColor.toUpperCase()}
        </span>
      </div>

      {kind === "solid" ? (
        <ColorPicker
          value={solidColor}
          onChange={(backgroundColor) => onChange({ backgroundKind: "solid", backgroundColor })}
          label={colorLabel}
        />
      ) : (
        <div className="element-gradient-editor">
          <div className="element-gradient-editor__section element-gradient-editor__stops-section">
            <div className="element-gradient-editor__section-head">
              <span>COLOR STOPS</span>
              <div>
                <button type="button" onClick={reverseStops} title="Reverse gradient">
                  ↔ REVERSE
                </button>
                <button
                  type="button"
                  onClick={addStopInLargestGap}
                  disabled={stops.length >= MAX_GRADIENT_STOPS}
                  title={`Add color stop (${stops.length}/${MAX_GRADIENT_STOPS})`}
                >
                  + ADD
                </button>
              </div>
            </div>

            <div
              ref={stopRailRef}
              className="element-gradient-stops"
              style={{ backgroundColor: solidColor, backgroundImage: stopRailImage }}
              onPointerDown={(event) => {
                if (event.target !== event.currentTarget) return;
                addStopAt(pointerPositionIn(event, event.currentTarget));
              }}
              title="Click to add a color stop"
            >
              {stops.map((stop, index) => (
                <button
                  key={`gradient-stop-${index}`}
                  type="button"
                  className={index === activeStopIndex ? "active" : ""}
                  style={{ left: `${stop.position}%`, background: stop.color }}
                  aria-label={`Gradient stop ${index + 1} at ${Math.round(stop.position)}%`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    dragStop(event, index);
                  }}
                  onPointerMove={(event) => dragStop(event, index)}
                  onClick={() => setSelectedStopIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    const direction = event.key === "ArrowLeft" ? -1 : 1;
                    const distance = event.shiftKey ? 10 : 1;
                    setSelectedStopIndex(index);
                    updateStop(index, {
                      position: clamp(stop.position + direction * distance, 0, 100),
                    });
                  }}
                />
              ))}
            </div>

            <div className="element-gradient-stop-editor">
              <label>
                <span>STOP {String(activeStopIndex + 1).padStart(2, "0")} COLOR</span>
                <ColorPicker
                  value={activeStop.color}
                  onChange={(color) => updateStop(activeStopIndex, { color })}
                  label={`Gradient stop ${activeStopIndex + 1}`}
                />
              </label>
              <RangeField
                label="POSITION"
                value={Math.round(activeStop.position)}
                min={0}
                max={100}
                step={1}
                suffix=" %"
                onChange={(position) => updateStop(activeStopIndex, { position })}
              />
              <button
                type="button"
                className="element-gradient-stop-editor__remove"
                disabled={stops.length <= 2}
                onClick={removeActiveStop}
                title="Remove selected color stop"
              >
                REMOVE
              </button>
            </div>
          </div>

          <GradientGraphEditor style={style} onChange={onChange} />

          <RangeField
            label="GRADIENT STRENGTH"
            value={Math.round(gradientStrength * 100)}
            min={0}
            max={100}
            step={1}
            suffix=" %"
            onChange={(value) => onChange({ backgroundGradientStrength: value / 100 })}
          />
          <SelectField
            label="GRADIENT MOTION"
            value={gradientAnimation}
            options={GRADIENT_ANIMATIONS}
            onChange={(backgroundGradientAnimation) => onChange({ backgroundGradientAnimation })}
          />
          {gradientAnimation !== "none" && (
            <>
              <RangeField
                label="MOTION DURATION"
                value={gradientAnimationDuration}
                min={500}
                max={30_000}
                step={250}
                suffix=" MS"
                onChange={(backgroundGradientAnimationDuration) =>
                  onChange({ backgroundGradientAnimationDuration })
                }
              />
              <SelectField
                label="MOTION DIRECTION"
                value={gradientAnimationDirection}
                options={GRADIENT_DIRECTIONS}
                onChange={(backgroundGradientAnimationDirection) =>
                  onChange({ backgroundGradientAnimationDirection })
                }
              />
              <SelectField
                label="MOTION EASING"
                value={gradientAnimationEasing}
                options={GRADIENT_EASINGS}
                onChange={(backgroundGradientAnimationEasing) =>
                  onChange({ backgroundGradientAnimationEasing })
                }
              />
              {gradientAnimation === "custom" && (
                <div className="element-gradient-editor__section element-gradient-editor__custom-motion">
                  <div className="element-gradient-editor__section-head">
                    <span>CUSTOM KEYFRAMES</span>
                    <small>FROM → TO</small>
                  </div>
                  <div className="studio-field-grid">
                    <RangeField
                      label="START X"
                      value={
                        style?.backgroundGradientAnimationStartX ??
                        DEFAULT_CUSTOM_GRADIENT_ANIMATION.startX
                      }
                      min={-100}
                      max={200}
                      suffix=" %"
                      onChange={(backgroundGradientAnimationStartX) =>
                        onChange({ backgroundGradientAnimationStartX })
                      }
                    />
                    <RangeField
                      label="START Y"
                      value={
                        style?.backgroundGradientAnimationStartY ??
                        DEFAULT_CUSTOM_GRADIENT_ANIMATION.startY
                      }
                      min={-100}
                      max={200}
                      suffix=" %"
                      onChange={(backgroundGradientAnimationStartY) =>
                        onChange({ backgroundGradientAnimationStartY })
                      }
                    />
                  </div>
                  <div className="studio-field-grid">
                    <RangeField
                      label="END X"
                      value={
                        style?.backgroundGradientAnimationEndX ??
                        DEFAULT_CUSTOM_GRADIENT_ANIMATION.endX
                      }
                      min={-100}
                      max={200}
                      suffix=" %"
                      onChange={(backgroundGradientAnimationEndX) =>
                        onChange({ backgroundGradientAnimationEndX })
                      }
                    />
                    <RangeField
                      label="END Y"
                      value={
                        style?.backgroundGradientAnimationEndY ??
                        DEFAULT_CUSTOM_GRADIENT_ANIMATION.endY
                      }
                      min={-100}
                      max={200}
                      suffix=" %"
                      onChange={(backgroundGradientAnimationEndY) =>
                        onChange({ backgroundGradientAnimationEndY })
                      }
                    />
                  </div>
                  <RangeField
                    label="GRADIENT ZOOM"
                    value={
                      style?.backgroundGradientAnimationScale ??
                      DEFAULT_CUSTOM_GRADIENT_ANIMATION.scale
                    }
                    min={100}
                    max={500}
                    step={5}
                    suffix=" %"
                    onChange={(backgroundGradientAnimationScale) =>
                      onChange({ backgroundGradientAnimationScale })
                    }
                  />
                  <RangeField
                    label="HUE SHIFT"
                    value={
                      style?.backgroundGradientAnimationHue ?? DEFAULT_CUSTOM_GRADIENT_ANIMATION.hue
                    }
                    min={-360}
                    max={360}
                    step={5}
                    suffix=" DEG"
                    onChange={(backgroundGradientAnimationHue) =>
                      onChange({ backgroundGradientAnimationHue })
                    }
                  />
                  <div className="studio-field-grid">
                    <RangeField
                      label="END SATURATION"
                      value={Math.round(
                        (style?.backgroundGradientAnimationSaturation ??
                          DEFAULT_CUSTOM_GRADIENT_ANIMATION.saturation) * 100,
                      )}
                      min={25}
                      max={250}
                      step={5}
                      suffix=" %"
                      onChange={(value) =>
                        onChange({ backgroundGradientAnimationSaturation: value / 100 })
                      }
                    />
                    <RangeField
                      label="END BRIGHTNESS"
                      value={Math.round(
                        (style?.backgroundGradientAnimationBrightness ??
                          DEFAULT_CUSTOM_GRADIENT_ANIMATION.brightness) * 100,
                      )}
                      min={25}
                      max={250}
                      step={5}
                      suffix=" %"
                      onChange={(value) =>
                        onChange({ backgroundGradientAnimationBrightness: value / 100 })
                      }
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
