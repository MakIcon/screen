import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useAppearanceComponentSettings } from "../../appearance/useAppearanceComponentSettings";
import { CustomNumberInput } from "./CustomNumberInput";
import {
  magnetizeSliderRatio,
  normalizeCustomSliderTicks,
  projectPointerToSliderRatio,
} from "./sliderMath";
import "./ElementSlider.css";

export type TickMode =
  | "none"
  | "every"
  | "every-2"
  | "every-3"
  | "every-4"
  | "even"
  | "odd"
  | "custom";

export interface ElementSliderProps {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  tickMode?: TickMode;
  customTicks?: number[];
  showHeader?: boolean;
  showValue?: boolean;
  valueEditable?: boolean;
  keyboardEnabled?: boolean;
  showDefaultMarker?: boolean;
  defaultMarkerMagnetic?: boolean;
  disabled?: boolean;
  appearanceConstraint?: "none" | "system-ram";
  appearanceSystemMax?: number;
  className?: string;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
}

function shouldShowTick(n: number, mode: TickMode, custom: number[]): boolean {
  switch (mode) {
    case "none":
      return false;
    case "every":
      return true;
    case "every-2":
      return n % 2 === 0;
    case "every-3":
      return n % 3 === 0;
    case "every-4":
      return n % 4 === 0;
    case "even":
      return n % 2 === 0;
    case "odd":
      return n % 2 !== 0;
    case "custom":
      return custom.includes(n);
    default:
      return false;
  }
}

export function ElementSlider({
  label = "Value",
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  tickMode = "every-4",
  customTicks = [],
  showHeader = true,
  showValue,
  valueEditable = false,
  keyboardEnabled = true,
  showDefaultMarker = false,
  defaultMarkerMagnetic = true,
  disabled = false,
  appearanceConstraint = "none",
  appearanceSystemMax = max,
  className,
  onChange,
  onCommit,
}: ElementSliderProps) {
  const componentDefaults = {
    label,
    min,
    max,
    step,
    defaultValue: defaultValue ?? Math.round((min + max) / 2),
    constraint: appearanceConstraint,
    maxMode: appearanceConstraint === "system-ram" ? "system" : "custom",
    systemMax: Math.max(min, appearanceSystemMax),
    tickMode,
    customTicks,
    showHeader,
    showValue: showValue ?? showHeader,
    valueEditable,
    keyboardEnabled,
    showDefaultMarker,
    defaultMarkerMagnetic,
  } satisfies import("../../appearance/types").AppearanceSliderSettings;
  const { settings: componentSettings, appearanceProps } = useAppearanceComponentSettings(
    "slider",
    componentDefaults,
  );

  const hardMax =
    componentSettings.constraint === "system-ram"
      ? Math.max(1, componentSettings.systemMax)
      : Number.POSITIVE_INFINITY;
  const hardMin = componentSettings.constraint === "system-ram" ? 1 : Number.NEGATIVE_INFINITY;
  const requestedMax =
    componentSettings.constraint === "system-ram" && componentSettings.maxMode === "system"
      ? componentSettings.systemMax
      : componentSettings.max;
  const normalizedRequestedMax =
    componentSettings.constraint === "system-ram" ? Math.round(requestedMax) : requestedMax;
  const effectiveMax = Math.min(hardMax, Math.max(normalizedRequestedMax, 0.01));
  const effectiveMin =
    componentSettings.constraint === "system-ram"
      ? Math.min(effectiveMax, Math.max(hardMin, Math.round(componentSettings.min)))
      : Math.min(componentSettings.min, effectiveMax - 0.01);
  const effectiveStep =
    componentSettings.constraint === "system-ram"
      ? Math.max(1, Math.round(componentSettings.step))
      : Math.max(0.01, componentSettings.step);
  const effectiveDefaultValue =
    componentSettings.constraint === "system-ram"
      ? Math.round(componentSettings.defaultValue)
      : componentSettings.defaultValue;
  const effectiveTickMode = componentSettings.tickMode;
  const effectiveCustomTicks = componentSettings.customTicks.map((tick) =>
    componentSettings.constraint === "system-ram" ? Math.round(tick) : tick,
  );
  const effectiveShowHeader = componentSettings.showHeader;
  const effectiveShowValue = componentSettings.showValue;
  const effectiveValueEditable = componentSettings.valueEditable;
  const effectiveKeyboardEnabled = componentSettings.keyboardEnabled;
  const effectiveShowDefaultMarker = componentSettings.showDefaultMarker;
  const effectiveDefaultMarkerMagnetic = componentSettings.defaultMarkerMagnetic;
  const effectiveLabel = componentSettings.label;
  const isControlled = value !== undefined;
  const initialValue = Math.max(
    effectiveMin,
    Math.min(effectiveMax, value ?? effectiveDefaultValue),
  );

  const [internalValue, setInternalValue] = useState(initialValue);
  const currentValue = isControlled
    ? Math.max(effectiveMin, Math.min(effectiveMax, value ?? initialValue))
    : Math.max(effectiveMin, Math.min(effectiveMax, internalValue));

  const dragging = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const liveVal = useRef(currentValue);
  const previousDefaultValue = useRef(effectiveDefaultValue);

  const total = Math.max(0, effectiveMax - effectiveMin);

  const snap = useCallback(
    (raw: number) => {
      const stepped =
        effectiveMin + Math.round((raw - effectiveMin) / effectiveStep) * effectiveStep;
      const precision = Math.min(8, Math.max(0, String(effectiveStep).split(".")[1]?.length ?? 0));
      return Math.max(effectiveMin, Math.min(effectiveMax, Number(stepped.toFixed(precision))));
    },
    [effectiveMax, effectiveMin, effectiveStep],
  );

  const defaultMarkerValue = snap(effectiveDefaultValue);
  const defaultMarkerRatio = total === 0 ? 0 : (defaultMarkerValue - effectiveMin) / total;

  const applyDOM = useCallback(
    (nextValue: number) => {
      const pct = total === 0 ? 0 : ((nextValue - effectiveMin) / total) * 100;
      if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (badgeRef.current) badgeRef.current.textContent = String(nextValue);
    },
    [effectiveMin, total],
  );

  const updateValue = useCallback(
    (nextValue: number, commit = false) => {
      const snappedValue = snap(nextValue);
      liveVal.current = snappedValue;
      applyDOM(snappedValue);
      if (!isControlled) {
        setInternalValue(snappedValue);
      }
      onChange?.(snappedValue);
      if (commit) {
        onCommit?.(snappedValue);
      }
    },
    [applyDOM, isControlled, onChange, onCommit, snap],
  );

  const clientToValue = useCallback(
    (clientX: number, clientY: number) => {
      const track = trackRef.current;
      const root = appearanceProps.ref.current;
      if (!track) return liveVal.current;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return liveVal.current;

      let axisX = 1;
      let axisY = 0;
      let axisScale = 1;
      if (root) {
        const transform = window.getComputedStyle(root).transform;
        if (transform && transform !== "none") {
          const matrix = new DOMMatrixReadOnly(transform);
          axisScale = Math.hypot(matrix.a, matrix.b) || 1;
          axisX = matrix.a / axisScale;
          axisY = matrix.b / axisScale;
        }
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const visualWidth = Math.max(1, track.offsetWidth * axisScale);
      const pointerRatio = projectPointerToSliderRatio(
        clientX,
        clientY,
        centerX,
        centerY,
        visualWidth,
        axisX,
        axisY,
      );
      const ratio =
        effectiveShowDefaultMarker && effectiveDefaultMarkerMagnetic
          ? magnetizeSliderRatio(pointerRatio, defaultMarkerRatio, visualWidth)
          : pointerRatio;
      return snap(ratio * total + effectiveMin);
    },
    [
      appearanceProps.ref,
      defaultMarkerRatio,
      effectiveDefaultMarkerMagnetic,
      effectiveMin,
      effectiveShowDefaultMarker,
      snap,
      total,
    ],
  );

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
      const nextValue = clientToValue(e.clientX, e.clientY);
      updateValue(nextValue, false);
    },
    [clientToValue, disabled, updateValue],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const nextValue = clientToValue(e.clientX, e.clientY);
      if (nextValue === liveVal.current) return;
      updateValue(nextValue, false);
    },
    [clientToValue, updateValue],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      onCommit?.(liveVal.current);
    },
    [onCommit],
  );

  const onPointerCancel = useCallback(() => {
    dragging.current = false;
    applyDOM(currentValue);
    liveVal.current = currentValue;
  }, [applyDOM, currentValue]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      let nextValue = liveVal.current;
      if (e.key === "ArrowRight" || e.key === "ArrowUp")
        nextValue = snap(nextValue + effectiveStep);
      if (e.key === "ArrowLeft" || e.key === "ArrowDown")
        nextValue = snap(nextValue - effectiveStep);
      if (nextValue !== liveVal.current) {
        e.preventDefault();
        updateValue(nextValue, true);
      }
    },
    [effectiveStep, snap, updateValue],
  );

  useEffect(() => {
    liveVal.current = currentValue;
    applyDOM(currentValue);
    if (!isControlled) {
      setInternalValue(currentValue);
    }
  }, [applyDOM, currentValue, isControlled]);

  useEffect(() => {
    const changed = previousDefaultValue.current !== effectiveDefaultValue;
    previousDefaultValue.current = effectiveDefaultValue;
    if (!isControlled && changed) updateValue(effectiveDefaultValue, false);
  }, [effectiveDefaultValue, isControlled, updateValue]);

  const defaultMarkerPercent =
    total === 0 ? 0 : ((defaultMarkerValue - effectiveMin) / total) * 100;
  const ticks: number[] = [];
  if (effectiveTickMode === "custom") {
    ticks.push(
      ...normalizeCustomSliderTicks(
        effectiveCustomTicks,
        effectiveMin,
        effectiveMax,
        componentSettings.constraint === "system-ram",
      ),
    );
  } else {
    const tickCount = total === 0 ? 0 : Math.floor(total / effectiveStep);
    if (tickCount <= 2_000) {
      for (let index = 0; index <= tickCount; index += 1) {
        ticks.push(snap(effectiveMin + index * effectiveStep));
      }
      if (ticks[ticks.length - 1] !== effectiveMax) ticks.push(effectiveMax);
    }
  }

  return (
    <div
      {...appearanceProps}
      className={["es-root", disabled ? "es-root--disabled" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {(effectiveShowHeader || effectiveShowValue) && (
        <div className={`es-header ${!effectiveShowHeader ? "es-header--value-only" : ""}`}>
          {effectiveShowHeader && <span className="es-label">{effectiveLabel}</span>}
          {effectiveShowValue &&
            (effectiveValueEditable ? (
              <CustomNumberInput
                className="es-value-editor"
                value={currentValue}
                min={effectiveMin}
                max={effectiveMax}
                step={effectiveStep}
                showArrows={false}
                disabled={disabled}
                ariaLabel={`${effectiveLabel} value`}
                onChange={(nextValue) => updateValue(nextValue, false)}
                onCommit={(nextValue) => onCommit?.(snap(nextValue))}
              />
            ) : (
              <span className="es-value-badge" ref={badgeRef}>
                {currentValue}
              </span>
            ))}
        </div>
      )}

      <div
        className={`es-body ${effectiveShowHeader || effectiveShowValue ? "" : "es-body--bare"}`}
      >
        <div
          className="es-track-wrap"
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div className="es-rail">
            <div
              className="es-fill"
              ref={fillRef}
              style={{
                width: `${total === 0 ? 0 : ((currentValue - effectiveMin) / total) * 100}%`,
              }}
            />
          </div>

          {effectiveShowDefaultMarker && (
            <span
              className="es-default-marker"
              style={{ left: `${defaultMarkerPercent}%` }}
              title={`Default: ${defaultMarkerValue}`}
              aria-hidden="true"
            />
          )}

          <div
            className="es-thumb"
            ref={thumbRef}
            style={{ left: `${total === 0 ? 0 : ((currentValue - effectiveMin) / total) * 100}%` }}
            role="slider"
            aria-label={effectiveLabel}
            aria-valuemin={effectiveMin}
            aria-valuemax={effectiveMax}
            aria-valuenow={currentValue}
            aria-disabled={disabled || undefined}
            tabIndex={!disabled && effectiveKeyboardEnabled ? 0 : -1}
            onKeyDown={!disabled && effectiveKeyboardEnabled ? onKeyDown : undefined}
          >
            <div className="es-thumb-inner" />
          </div>
        </div>

        {effectiveTickMode !== "none" && (
          <div className="es-ticks">
            {ticks.map((n) => {
              const show = shouldShowTick(n, effectiveTickMode, effectiveCustomTicks);
              const p = total === 0 ? 0 : ((n - effectiveMin) / total) * 100;
              const edgeClass = p <= 5 ? "es-tick--edge-start" : p >= 95 ? "es-tick--edge-end" : "";
              return (
                <div key={n} className={`es-tick ${edgeClass}`} style={{ left: `${p}%` }}>
                  <span className={`es-tick-mark ${show ? "es-tick-mark--labeled" : ""}`} />
                  {show && <span className="es-tick-label">{n}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
