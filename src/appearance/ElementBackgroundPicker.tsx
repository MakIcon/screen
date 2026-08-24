import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ColorPicker } from "../components/color-picker/ColorPicker";
import type { AppearanceElementGradientStop, AppearanceElementOverride } from "./types";
import { RangeField } from "./StudioFields";
import { GradientGraphEditor } from "../components/gradient-editor/GradientGraphEditor";
import {
  buildElementGradientImage,
  DEFAULT_GRADIENT_STRENGTH,
  interpolateGradientStopColor,
  MAX_GRADIENT_STOPS,
  resolveElementGradientStops,
} from "./elementGradient";
import "./ElementBackgroundPicker.css";

type BackgroundStyle = AppearanceElementOverride["style"];

type ElementBackgroundPickerProps = {
  style?: BackgroundStyle;
  fallbackColor: string;
  fallbackAccent: string;
  onChange: (style: Partial<BackgroundStyle>) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ElementBackgroundPicker({
  style,
  fallbackColor,
  fallbackAccent,
  onChange,
}: ElementBackgroundPickerProps) {
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const stopRailRef = useRef<HTMLDivElement>(null);
  const kind = style?.backgroundKind ?? "solid";
  const solidColor = style?.backgroundColor ?? fallbackColor;
  const stops = resolveElementGradientStops(style, solidColor, fallbackAccent);
  const activeStopIndex = clamp(selectedStopIndex, 0, stops.length - 1);
  const activeStop = stops[activeStopIndex];
  const gradientType = style?.backgroundGradientType ?? "linear";
  const gradientStrength = style?.backgroundGradientStrength ?? DEFAULT_GRADIENT_STRENGTH;
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
    <div className="element-background-picker">
      <div className="element-background-picker__head">
        <span>BACKGROUND</span>
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
        className="element-background-picker__preview"
        style={{
          backgroundColor: solidColor,
          backgroundImage: kind === "gradient" ? gradientImage : "none",
        }}
      >
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
          label="Background color"
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
        </div>
      )}
    </div>
  );
}
