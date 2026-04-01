import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
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
  className,
  onChange,
  onCommit,
}: ElementSliderProps) {
  const isControlled = value !== undefined;
  const initialValue = Math.max(
    min,
    Math.min(max, value ?? defaultValue ?? Math.round((min + max) / 2))
  );

  const [internalValue, setInternalValue] = useState(initialValue);
  const currentValue = isControlled ? Math.max(min, Math.min(max, value ?? initialValue)) : internalValue;

  const dragging = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const liveVal = useRef(currentValue);

  const total = Math.max(step, max - min);

  const snap = useCallback(
    (raw: number) => {
      const stepped = Math.round(raw / step) * step;
      return Math.max(min, Math.min(max, stepped));
    },
    [min, max, step]
  );

  const applyDOM = useCallback(
    (nextValue: number) => {
      const pct = total === 0 ? 0 : ((nextValue - min) / total) * 100;
      if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (badgeRef.current) badgeRef.current.textContent = String(nextValue);
    },
    [min, total]
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
    [applyDOM, isControlled, onChange, onCommit, snap]
  );

  const clientToValue = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return liveVal.current;
      const { left, width } = track.getBoundingClientRect();
      if (width <= 0) return liveVal.current;
      return snap(((clientX - left) / width) * total + min);
    },
    [min, snap, total]
  );

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
      const nextValue = clientToValue(e.clientX);
      updateValue(nextValue, false);
    },
    [clientToValue, updateValue]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const nextValue = clientToValue(e.clientX);
      if (nextValue === liveVal.current) return;
      updateValue(nextValue, false);
    },
    [clientToValue, updateValue]
  );

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    onCommit?.(liveVal.current);
  }, [onCommit]);

  const onTrackClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (dragging.current) return;
      const nextValue = clientToValue(e.clientX);
      updateValue(nextValue, true);
    },
    [clientToValue, updateValue]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      let nextValue = liveVal.current;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") nextValue = snap(nextValue + step);
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") nextValue = snap(nextValue - step);
      if (nextValue !== liveVal.current) {
        updateValue(nextValue, true);
      }
    },
    [snap, step, updateValue]
  );

  useEffect(() => {
    liveVal.current = currentValue;
    applyDOM(currentValue);
    if (!isControlled) {
      setInternalValue(currentValue);
    }
  }, [applyDOM, currentValue, isControlled]);

  const ticks: number[] = [];
  for (let i = min; i <= max; i += step) {
    ticks.push(i);
  }

  return (
    <div className={["es-root", className].filter(Boolean).join(" ")}>
      {showHeader && (
        <div className="es-header">
          <span className="es-label">{label}</span>
          <span className="es-value-badge" ref={badgeRef}>
            {currentValue}
          </span>
        </div>
      )}

      <div className={`es-body ${showHeader ? "" : "es-body--bare"}`}>
        <div className="es-track-wrap" ref={trackRef} onClick={onTrackClick}>
          <div className="es-rail">
            <div
              className="es-fill"
              ref={fillRef}
              style={{ width: `${total === 0 ? 0 : ((currentValue - min) / total) * 100}%` }}
            />
          </div>

          <div
            className="es-thumb"
            ref={thumbRef}
            style={{ left: `${total === 0 ? 0 : ((currentValue - min) / total) * 100}%` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            role="slider"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={currentValue}
            tabIndex={0}
            onKeyDown={onKeyDown}
          >
            <div className="es-thumb-inner" />
          </div>
        </div>

        {tickMode !== "none" && (
          <div className="es-ticks">
            {ticks.map((n) => {
              const show = shouldShowTick(n, tickMode, customTicks);
              const p = total === 0 ? 0 : ((n - min) / total) * 100;
              return (
                <div key={n} className="es-tick" style={{ left: `${p}%` }}>
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
