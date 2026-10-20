import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ElementSlider } from "../inputs/ElementSlider";
import { drawSVCanvas, hexToHsv, hsvToRgb, rgbToHex } from "./Colorutils";
import "./ColorPicker.css";
import { useTranslation } from "../../i18n/locale";

type HsvColor = [number, number, number];
type RgbInput = { r: string; g: string; b: string };

interface PickerPanelProps {
  value: string;
  onChange: (hex: string) => void;
}

const CANVAS_WIDTH = 532;
const CANVAS_HEIGHT = 320;
const POPUP_WIDTH = 292;
const POPUP_GAP = 8;
const VIEWPORT_MARGIN = 10;

function toDisplayHex(r: number, g: number, b: number) {
  return rgbToHex(r, g, b).toUpperCase();
}

function parseHex(input: string, allowShort = false) {
  const clean = input.trim().replace(/^#/, "").toUpperCase();

  if (/^[0-9A-F]{6}$/.test(clean)) return `#${clean}`;
  if (allowShort && /^[0-9A-F]{3}$/.test(clean)) {
    return `#${clean
      .split("")
      .map((character) => character.repeat(2))
      .join("")}`;
  }

  return null;
}

function rgbInputFromHsv(hsv: HsvColor): RgbInput {
  const [r, g, b] = hsvToRgb(...hsv);
  return { r: String(r), g: String(g), b: String(b) };
}

function hexFromHsv(hsv: HsvColor) {
  return toDisplayHex(...hsvToRgb(...hsv));
}

export function PickerPanel({ value, onChange }: PickerPanelProps) {
  const tr = useTranslation();
  const initialHex = parseHex(value, true) ?? "#000000";
  const initialHsv = hexToHsv(initialHex) as HsvColor;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const svDragging = useRef(false);
  const hsvRef = useRef<HsvColor>(initialHsv);

  const [hsv, setHsv] = useState<HsvColor>(initialHsv);
  const [hexInput, setHexInput] = useState(initialHex);
  const [rgbInput, setRgbInput] = useState<RgbInput>(() => rgbInputFromHsv(initialHsv));

  const eyedropperConstructor =
    typeof window === "undefined"
      ? undefined
      : (
          window as Window & {
            EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
          }
        ).EyeDropper;
  const eyedropperSupported = Boolean(eyedropperConstructor);

  const updateCursor = useCallback((saturation: number, brightness: number) => {
    if (!cursorRef.current) return;
    cursorRef.current.style.left = `${saturation * 100}%`;
    cursorRef.current.style.top = `${(1 - brightness) * 100}%`;
  }, []);

  const applyHsv = useCallback(
    (next: HsvColor, notify = true) => {
      hsvRef.current = next;
      setHsv(next);
      updateCursor(next[1], next[2]);

      const nextHex = hexFromHsv(next);
      setHexInput(nextHex);
      setRgbInput(rgbInputFromHsv(next));
      if (notify) onChange(nextHex);
    },
    [onChange, updateCursor],
  );

  useLayoutEffect(() => {
    const nextHex = parseHex(value, true) ?? "#000000";
    if (nextHex === hexFromHsv(hsvRef.current)) {
      setHexInput(nextHex);
      setRgbInput(rgbInputFromHsv(hsvRef.current));
      updateCursor(hsvRef.current[1], hsvRef.current[2]);
      return;
    }

    const next = hexToHsv(nextHex) as HsvColor;

    // Retain the last useful hue for white, grey, and black.
    if (next[1] === 0) next[0] = hsvRef.current[0];
    hsvRef.current = next;
    setHsv(next);
    setHexInput(nextHex);
    setRgbInput(rgbInputFromHsv(next));
    updateCursor(next[1], next[2]);
  }, [updateCursor, value]);

  const hue = hsv[0];
  useLayoutEffect(() => {
    if (canvasRef.current) drawSVCanvas(canvasRef.current, hue);
  }, [hue]);

  const pickSV = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const saturation = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const brightness = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
      applyHsv([hsvRef.current[0], saturation, brightness]);
    },
    [applyHsv],
  );

  const finishSVInteraction = () => {
    svDragging.current = false;
  };

  const onSVKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const [hue, saturation, brightness] = hsvRef.current;
    let nextSaturation = saturation;
    let nextBrightness = brightness;

    if (event.key === "ArrowLeft") nextSaturation -= step;
    else if (event.key === "ArrowRight") nextSaturation += step;
    else if (event.key === "ArrowUp") nextBrightness += step;
    else if (event.key === "ArrowDown") nextBrightness -= step;
    else return;

    event.preventDefault();
    applyHsv([
      hue,
      Math.max(0, Math.min(1, nextSaturation)),
      Math.max(0, Math.min(1, nextBrightness)),
    ]);
  };

  const onHueChange = (nextHue: number) => {
    const [, saturation, brightness] = hsvRef.current;
    applyHsv([nextHue, saturation, brightness]);
  };

  const applyHex = (hex: string) => {
    const next = hexToHsv(hex) as HsvColor;
    if (next[1] === 0) next[0] = hsvRef.current[0];
    applyHsv(next);
  };

  const onHexChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value.toUpperCase();
    setHexInput(raw);

    const parsed = parseHex(raw);
    if (parsed) applyHex(parsed);
  };

  const onHexBlur = () => {
    const parsed = parseHex(hexInput, true);
    if (parsed) applyHex(parsed);
    else setHexInput(hexFromHsv(hsvRef.current));
  };

  const applyRgbInput = (next: RgbInput) => {
    const r = Number(next.r);
    const g = Number(next.g);
    const b = Number(next.b);
    const nextHsv = hexToHsv(toDisplayHex(r, g, b)) as HsvColor;

    if (nextHsv[1] === 0) nextHsv[0] = hsvRef.current[0];
    applyHsv(nextHsv);
  };

  const onRgbChange = (channel: keyof RgbInput, raw: string) => {
    if (!/^\d{0,3}$/.test(raw)) return;

    const next = { ...rgbInput, [channel]: raw };
    setRgbInput(next);

    const complete = Object.values(next).every((entry) => {
      const number = Number(entry);
      return entry !== "" && number >= 0 && number <= 255;
    });
    if (complete) applyRgbInput(next);
  };

  const onRgbBlur = (channel: keyof RgbInput) => {
    const current = rgbInputFromHsv(hsvRef.current);
    const parsed = Number(rgbInput[channel]);
    const safeValue =
      rgbInput[channel] === "" || !Number.isFinite(parsed)
        ? current[channel]
        : String(Math.min(255, Math.max(0, Math.round(parsed))));

    applyRgbInput({ ...rgbInput, [channel]: safeValue });
  };

  const pickEye = async () => {
    if (!eyedropperConstructor) return;

    try {
      const result = await new eyedropperConstructor().open();
      const parsed = parseHex(result.sRGBHex, true);
      if (parsed) applyHex(parsed);
    } catch {
      // The native picker rejects when the user cancels it.
    }
  };

  const previewColor = hexFromHsv(hsv);
  const saturationPercent = Math.round(hsv[1] * 100);
  const brightnessPercent = Math.round(hsv[2] * 100);

  return (
    <div className="cp-panel">
      <div className="cp-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="cp-canvas"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          tabIndex={0}
          role="group"
          aria-label={tr("colorPicker.saturationBrightnessUseArrow", {
            saturationPercent,
            brightnessPercent,
          })}
          onKeyDown={onSVKeyDown}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            svDragging.current = true;
            pickSV(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (svDragging.current) pickSV(event.clientX, event.clientY);
          }}
          onPointerUp={finishSVInteraction}
          onPointerCancel={finishSVInteraction}
          onLostPointerCapture={finishSVInteraction}
        />
        <div ref={cursorRef} className="cp-cursor" aria-hidden="true" />
      </div>

      <div className="cp-controls">
        <button
          type="button"
          className="cp-eyedropper"
          onClick={pickEye}
          data-tooltip={
            eyedropperSupported
              ? tr("colorPicker.pickColorFromScreen")
              : tr("ui.screenColorUnavailable")
          }
          aria-label={tr("colorPicker.pickColorFromScreen")}
          disabled={!eyedropperSupported}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9.75 2.25 4 4-6.9 6.9-3.35.6.6-3.35 5.65-5.65" />
            <path d="m8.25 3.75 4 4M4.1 10.4l1.5 1.5M2.75 13.25l-1 1" />
          </svg>
        </button>

        <div
          className="cp-preview"
          style={{ backgroundColor: previewColor }}
          role="img"
          aria-label={tr("colorPicker.selectedColor", { previewColor })}
        />

        <div className="cp-hue-control">
          <div className="cp-control-meta" aria-hidden="true">
            <span>{tr("colorPicker.hue")}</span>
            <output>{Math.round(hsv[0])}°</output>
          </div>
          <ElementSlider
            className="cp-hue-slider"
            label={tr("colorPicker.hue")}
            min={0}
            max={360}
            step={1}
            value={hsv[0]}
            tickMode="none"
            showHeader={false}
            showValue={false}
            valueEditable={false}
            showDefaultMarker={false}
            onChange={onHueChange}
          />
        </div>
      </div>

      <div className="cp-inputs">
        <label className="cp-field-group cp-field-group--hex">
          <span className="cp-field-label">Hex</span>
          <input
            className="cp-field"
            value={hexInput}
            onChange={onHexChange}
            onBlur={onHexBlur}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            aria-invalid={!parseHex(hexInput, true)}
          />
        </label>

        {(["r", "g", "b"] as const).map((channel) => (
          <label className="cp-field-group" key={channel}>
            <span className="cp-field-label">{channel.toUpperCase()}</span>
            <input
              className="cp-field cp-field--rgb"
              value={rgbInput[channel]}
              onChange={(event) => onRgbChange(channel, event.target.value)}
              onBlur={() => onRgbBlur(channel)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              maxLength={3}
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const tr = useTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, side: "bottom" });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const displayValue = parseHex(value, true) ?? "#000000";

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    const panelWidth = panelRect?.width || POPUP_WIDTH;
    const panelHeight = panelRect?.height || 290;
    const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = triggerRect.top - VIEWPORT_MARGIN;
    const side = spaceBelow >= panelHeight || spaceBelow >= spaceAbove ? "bottom" : "top";
    const desiredTop =
      side === "bottom"
        ? triggerRect.bottom + POPUP_GAP
        : triggerRect.top - panelHeight - POPUP_GAP;
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - panelHeight - VIEWPORT_MARGIN);

    let left = triggerRect.left;
    if (left + panelWidth > window.innerWidth - VIEWPORT_MARGIN) {
      left = triggerRect.right - panelWidth;
    }

    setPosition({
      top: Math.min(maxTop, Math.max(VIEWPORT_MARGIN, desiredTop)),
      left: Math.min(
        Math.max(VIEWPORT_MARGIN, window.innerWidth - panelWidth - VIEWPORT_MARGIN),
        Math.max(VIEWPORT_MARGIN, left),
      ),
      side,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cp-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        aria-label={label ? `${label}: ${displayValue}` : undefined}
        data-tooltip={tr("ui.chooseColor", { color: displayValue })}
      >
        <span
          className="cp-trigger__swatch"
          style={{ backgroundColor: displayValue }}
          aria-hidden="true"
        />
        <span className="cp-trigger__hex">{displayValue}</span>
        {label && <span className="cp-trigger__label">{label}</span>}
        <svg
          className={`cp-trigger__chevron ${open ? "cp-trigger__chevron--open" : ""}`}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m2 3.5 3 3 3-3" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={popupId}
            className="cp-popup"
            style={{ top: position.top, left: position.left }}
            data-side={position.side}
            role="dialog"
            aria-label={label ? tr("ui.namedColorPicker", { label }) : tr("ui.colorPicker")}
          >
            <PickerPanel value={displayValue} onChange={onChange} />
          </div>,
          document.body,
        )}
    </>
  );
}
