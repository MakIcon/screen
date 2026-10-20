import { useAppearanceText } from "./localization";
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
  DEFAULT_GRADIENT_MIDPOINT,
  DEFAULT_GRADIENT_SOFTNESS,
  DEFAULT_GRADIENT_STRENGTH,
  interpolateGradientStopColor,
  MAX_GRADIENT_STOPS,
  resolveElementGradientStops,
} from "./elementGradient";
import { GRADIENT_PRESETS, gradientPresetStyle, isGradientPresetActive } from "./gradientPresets";
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
  gradientOnly?: boolean;
  enableMotion?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const PRESET_PREVIEWS = GRADIENT_PRESETS.map((preset) => ({
  ...preset,
  // Small palette thumbnails need only the source stops; the full curve is
  // generated for the selected gradient and its live preview.
  image: `${
    preset.type === "radial"
      ? "radial-gradient(circle at center in oklab"
      : `linear-gradient(${preset.angle}deg in oklab`
  }, ${preset.stops.map((stop) => `${stop.color} ${stop.position}%`).join(", ")})`,
}));

export function ElementBackgroundPicker({
  style,
  fallbackColor,
  fallbackAccent,
  onChange,
  title = "BACKGROUND",
  colorLabel = "Background color",
  previewMode = "surface",
  gradientOnly = false,
  enableMotion = true,
}: ElementBackgroundPickerProps) {
  const copy = useAppearanceText();
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [textPreviewTone, setTextPreviewTone] = useState<"light" | "dark">("dark");
  const [previewStuck, setPreviewStuck] = useState(false);
  const headRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const textPreviewRef = useRef<HTMLElement>(null);
  const motionPreviewRef = useRef<Animation | null>(null);
  const stopRailRef = useRef<HTMLDivElement>(null);
  const stopDragFrameRef = useRef<number | null>(null);
  const kind = gradientOnly ? "gradient" : (style?.backgroundKind ?? "solid");
  const solidColor = style?.backgroundColor ?? fallbackColor;
  const stops = resolveElementGradientStops(style, solidColor, fallbackAccent);
  const activeStopIndex = clamp(selectedStopIndex, 0, stops.length - 1);
  const activeStop = stops[activeStopIndex];
  const gradientType = style?.backgroundGradientType ?? "linear";
  const gradientStrength = style?.backgroundGradientStrength ?? DEFAULT_GRADIENT_STRENGTH;
  const gradientMidpoint = style?.backgroundGradientMidpoint ?? DEFAULT_GRADIENT_MIDPOINT;
  const gradientSoftness = style?.backgroundGradientSoftness ?? DEFAULT_GRADIENT_SOFTNESS;
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
  const gradientImage = useMemo(
    () =>
      buildElementGradientImage(style, solidColor, fallbackAccent, {
        baseColor: solidColor,
        opacity: 1,
      }),
    [style, solidColor, fallbackAccent],
  );
  const stopRailImage = useMemo(
    () =>
      buildElementGradientImage(
        { ...style, backgroundGradientType: "linear", backgroundGradientAngle: 90 },
        solidColor,
        fallbackAccent,
        { baseColor: solidColor, opacity: 1 },
      ),
    [style, solidColor, fallbackAccent],
  );

  useEffect(
    () => () => {
      if (stopDragFrameRef.current !== null) cancelAnimationFrame(stopDragFrameRef.current);
    },
    [],
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
      gradientMidpoint,
      gradientSoftness,
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
      return;
    }
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    if (stopDragFrameRef.current !== null) cancelAnimationFrame(stopDragFrameRef.current);
    const position = Math.round(pointerPositionIn(event, stopRailRef.current));
    if (event.type === "pointerup") {
      stopDragFrameRef.current = null;
      updateStop(index, { position });
      return;
    }
    stopDragFrameRef.current = requestAnimationFrame(() => {
      stopDragFrameRef.current = null;
      updateStop(index, { position });
    });
  };

  const applyPreset = (preset: (typeof GRADIENT_PRESETS)[number]) => {
    onChange(gradientPresetStyle(preset));
    setSelectedStopIndex(0);
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
      {!gradientOnly && (
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
                {copy(option === "solid" ? "SOLID COLOR" : "GRADIENT")}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={previewRef}
        className={`element-background-picker__preview${previewStuck ? " is-stuck" : ""}${
          previewMode === "text" ? ` is-${textPreviewTone}` : ""
        }`}
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
            {copy("TEXT PREVIEW")}
          </strong>
        )}
        <span>
          {kind === "gradient"
            ? copy("Gradient type: {type} · stops: {count}", {
                type: copy(gradientType.toUpperCase()),
                count: stops.length,
              })
            : solidColor.toUpperCase()}
        </span>
        {previewMode === "text" && (
          <button
            type="button"
            className="element-background-picker__contrast"
            onClick={() => setTextPreviewTone((tone) => (tone === "dark" ? "light" : "dark"))}
            data-tooltip={copy("Switch text preview background")}
            aria-label={copy(
              textPreviewTone === "dark"
                ? "Preview text on light background"
                : "Preview text on dark background",
            )}
          >
            {textPreviewTone === "dark" ? copy("☀ LIGHT") : copy("● DARK")}
          </button>
        )}
      </div>

      {kind === "solid" ? (
        <ColorPicker
          value={solidColor}
          onChange={(backgroundColor) => onChange({ backgroundKind: "solid", backgroundColor })}
          label={colorLabel}
        />
      ) : (
        <div className="element-gradient-editor">
          <div className="element-gradient-editor__section element-gradient-editor__presets">
            <div className="element-gradient-editor__section-head">
              <span>{copy("GRADIENT PALETTES")}</span>
              <small>{copy("ONE CLICK, THEN MAKE IT YOURS")}</small>
            </div>
            <div className="element-gradient-presets">
              {PRESET_PREVIEWS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={isGradientPresetActive(style, preset) ? "active" : ""}
                  onClick={() => applyPreset(preset)}
                  aria-label={copy("Apply {name} gradient", { name: copy(preset.name) })}
                >
                  <i style={{ backgroundImage: preset.image }} aria-hidden="true" />
                  <strong>{copy(preset.name)}</strong>
                  <small>{copy(preset.detail)}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="element-gradient-editor__section element-gradient-editor__stops-section">
            <div className="element-gradient-editor__section-head">
              <span>{copy("COLOR STOPS")}</span>
              <div>
                <button
                  type="button"
                  onClick={reverseStops}
                  data-tooltip={copy("Reverse gradient")}
                >
                  {copy("↔ REVERSE")}
                </button>
                <button
                  type="button"
                  onClick={addStopInLargestGap}
                  disabled={stops.length >= MAX_GRADIENT_STOPS}
                  data-tooltip={copy("Add color stop ({count}/{max})", {
                    count: stops.length,
                    max: MAX_GRADIENT_STOPS,
                  })}
                >
                  {copy("+ ADD")}
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
              data-tooltip={copy("Click to add a color stop")}
            >
              {stops.map((stop, index) => (
                <button
                  key={`gradient-stop-${index}`}
                  type="button"
                  className={index === activeStopIndex ? "active" : ""}
                  style={{ left: `${stop.position}%`, background: stop.color }}
                  aria-label={copy("Gradient stop {index} at {position}%", {
                    index: index + 1,
                    position: Math.round(stop.position),
                  })}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    dragStop(event, index);
                  }}
                  onPointerMove={(event) => dragStop(event, index)}
                  onPointerUp={(event) => dragStop(event, index)}
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
                <span>
                  {copy("STOP")} {String(activeStopIndex + 1).padStart(2, "0")} {copy("COLOR")}
                </span>
                <ColorPicker
                  value={activeStop.color}
                  onChange={(color) => updateStop(activeStopIndex, { color })}
                  label={copy("Gradient stop {index}", { index: activeStopIndex + 1 })}
                />
              </label>
              <RangeField
                label={copy("POSITION")}
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
                data-tooltip={copy("Remove selected color stop")}
              >
                {copy("REMOVE")}
              </button>
            </div>
          </div>

          <GradientGraphEditor style={style} onChange={onChange} />

          <RangeField
            label={copy("GRADIENT STRENGTH")}
            value={Math.round(gradientStrength * 100)}
            min={0}
            max={100}
            step={1}
            suffix=" %"
            onChange={(value) => onChange({ backgroundGradientStrength: value / 100 })}
          />
          {enableMotion && (
            <>
              <SelectField
                label={copy("GRADIENT MOTION")}
                value={gradientAnimation}
                options={GRADIENT_ANIMATIONS}
                onChange={(backgroundGradientAnimation) =>
                  onChange({ backgroundGradientAnimation })
                }
              />
              {gradientAnimation !== "none" && (
                <>
                  <RangeField
                    label={copy("MOTION DURATION")}
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
                    label={copy("MOTION DIRECTION")}
                    value={gradientAnimationDirection}
                    options={GRADIENT_DIRECTIONS}
                    onChange={(backgroundGradientAnimationDirection) =>
                      onChange({ backgroundGradientAnimationDirection })
                    }
                  />
                  <SelectField
                    label={copy("MOTION EASING")}
                    value={gradientAnimationEasing}
                    options={GRADIENT_EASINGS}
                    onChange={(backgroundGradientAnimationEasing) =>
                      onChange({ backgroundGradientAnimationEasing })
                    }
                  />
                  {gradientAnimation === "custom" && (
                    <div className="element-gradient-editor__section element-gradient-editor__custom-motion">
                      <div className="element-gradient-editor__section-head">
                        <span>{copy("CUSTOM KEYFRAMES")}</span>
                        <small>{copy("FROM → TO")}</small>
                      </div>
                      <div className="studio-field-grid">
                        <RangeField
                          label={copy("START X")}
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
                          label={copy("START Y")}
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
                          label={copy("END X")}
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
                          label={copy("END Y")}
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
                        label={copy("GRADIENT ZOOM")}
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
                        label={copy("HUE SHIFT")}
                        value={
                          style?.backgroundGradientAnimationHue ??
                          DEFAULT_CUSTOM_GRADIENT_ANIMATION.hue
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
                          label={copy("END SATURATION")}
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
                          label={copy("END BRIGHTNESS")}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
