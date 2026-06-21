import {
  useRef, useState, useCallback, useLayoutEffect, useEffect,
} from "react";
import { createPortal } from "react-dom";
import { hexToHsv, hsvToRgb, rgbToHex, hexToRgb, drawSVCanvas } from "./Colorutils";
import "./ColorPicker.css";

/* ─── Standalone picker panel ──────────────────────── */
interface PickerPanelProps {
  value: string;
  onChange: (hex: string) => void;
}

const CW = 236;
const CH = 130;

export function PickerPanel({ value, onChange }: PickerPanelProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const cursorRef   = useRef<HTMLDivElement>(null);
  const svDragging  = useRef(false);

  const [hsv, setHsv]           = useState<[number, number, number]>(() => hexToHsv(value));
  const [hexInput, setHexInput] = useState(value);
  const [rgbInput, setRgbInput] = useState(() => {
    const [r, g, b] = hexToRgb(value);
    return { r: String(r), g: String(g), b: String(b) };
  });
  const hsvRef = useRef(hsv);

  /* sync when value prop changes externally */
  useLayoutEffect(() => {
    const next = hexToHsv(value);
    hsvRef.current = next;
    setHsv(next);
    setHexInput(value);
    const [r, g, b] = hexToRgb(value);
    setRgbInput({ r: String(r), g: String(g), b: String(b) });
  }, [value]);

  /* draw canvas whenever hue changes */
  const hue = hsv[0];
  useLayoutEffect(() => {
    if (canvasRef.current) drawSVCanvas(canvasRef.current, hue);
  }, [hue]);

  /* update cursor position directly (no re-render) */
  const updateCursor = useCallback((s: number, v: number) => {
    if (cursorRef.current) {
      cursorRef.current.style.left = `${s * 100}%`;
      cursorRef.current.style.top = `${(1 - v) * 100}%`;
    }
  }, []);

  useLayoutEffect(() => { updateCursor(hsv[1], hsv[2]); }, [hsv, updateCursor]);

  const emit = useCallback((h: number, s: number, v: number) => {
    const [r, g, b] = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);
    setHexInput(hex);
    setRgbInput({ r: String(r), g: String(g), b: String(b) });
    onChange(hex);
  }, [onChange]);

  /* SV canvas */
  const pickSV = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    const h = hsvRef.current[0];
    hsvRef.current = [h, s, v];
    updateCursor(s, v);
    emit(h, s, v);
  }, [emit, updateCursor]);

  const onSVDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    svDragging.current = true;
    pickSV(e.clientX, e.clientY);
  };
  const onSVMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (svDragging.current) pickSV(e.clientX, e.clientY);
  };
  const onSVUp = () => { svDragging.current = false; };

  /* hue */
  const onHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const h = Number(e.target.value);
    const [, s, v] = hsvRef.current;
    hsvRef.current = [h, s, v];
    setHsv([h, s, v]);
    emit(h, s, v);
  };

  /* hex */
  const onHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setHexInput(raw);
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
      const next = hexToHsv(raw);
      hsvRef.current = next;
      setHsv(next);
      const [r, g, b] = hexToRgb(raw);
      setRgbInput({ r: String(r), g: String(g), b: String(b) });
      onChange(raw);
    }
  };

  /* rgb */
  const onRgbChange = (ch: "r" | "g" | "b", val: string) => {
    const next = { ...rgbInput, [ch]: val };
    setRgbInput(next);
    const r = Math.min(255, Math.max(0, parseInt(next.r) || 0));
    const g = Math.min(255, Math.max(0, parseInt(next.g) || 0));
    const b = Math.min(255, Math.max(0, parseInt(next.b) || 0));
    const hex = rgbToHex(r, g, b);
    setHexInput(hex);
    const nh = hexToHsv(hex);
    hsvRef.current = nh;
    setHsv(nh);
    onChange(hex);
  };

  /* eyedropper */
  const pickEye = async () => {
    if (!("EyeDropper" in window)) return;
    try {
      // @ts-expect-error EyeDropper is not yet part of the TS DOM typings
      const dropper = new window.EyeDropper();
      const result  = await dropper.open();
      const hex     = result.sRGBHex.toLowerCase();
      const nh      = hexToHsv(hex);
      hsvRef.current = nh;
      setHsv(nh);
      setHexInput(hex);
      const [r, g, b] = hexToRgb(hex);
      setRgbInput({ r: String(r), g: String(g), b: String(b) });
      onChange(hex);
    } catch { /* cancelled */ }
  };

  const [pr, pg, pb] = hsvToRgb(...hsv);
  const previewColor = rgbToHex(pr, pg, pb);

  return (
    <div className="cp-panel">
      {/* SV canvas */}
      <div className="cp-canvas-wrap">
        <canvas ref={canvasRef} className="cp-canvas" width={CW} height={CH}
          onPointerDown={onSVDown} onPointerMove={onSVMove} onPointerUp={onSVUp} />
        <div ref={cursorRef} className="cp-cursor" />
      </div>

      {/* hue slider */}
      <div className="cp-hue-row">
        <div className="cp-preview" style={{ background: previewColor }} />
        <input type="range" className="cp-hue" min={0} max={360} step={1}
          value={hsv[0]} onChange={onHueChange} />
      </div>

      {/* inputs row */}
      <div className="cp-inputs">
        <button
          className={`cp-eyedropper ${"EyeDropper" in window ? "" : "cp-eyedropper--unsupported"}`}
          onClick={pickEye}
          title="Pick color from screen"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 1.5l2 2-6 6-2.5.5.5-2.5 6-6z"/>
            <line x1="7.5" y1="3.5" x2="9.5" y2="5.5"/>
            <line x1="2" y1="11" x2="1" y2="12"/>
          </svg>
        </button>

        <div className="cp-hex-group">
          <input className="cp-field" value={hexInput} onChange={onHexChange}
            spellCheck={false} maxLength={7} />
          <span className="cp-field-label">Hex</span>
        </div>

        {(["r", "g", "b"] as const).map(ch => (
          <div className="cp-rgb-group" key={ch}>
            <input className="cp-field cp-field--sm"
              value={rgbInput[ch]}
              onChange={e => onRgbChange(ch, e.target.value)}
              onBlur={e => onRgbChange(ch, String(Math.min(255, Math.max(0, parseInt(e.target.value) || 0))))}
              maxLength={3} inputMode="numeric" />
            <span className="cp-field-label">{ch.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Anchored ColorPicker trigger ─────────────────── */
interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0 });
  const triggerRef      = useRef<HTMLButtonElement>(null);
  const panelRef        = useRef<HTMLDivElement>(null);

  /* position panel below (or above) trigger, always within viewport */
  const openPicker = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pickerH = 320; // approximate height
    const pickerW = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= pickerH || spaceBelow >= rect.top
      ? rect.bottom + 6
      : rect.top - pickerH - 6;
    const left = Math.min(rect.left, window.innerWidth - pickerW - 8);
    setPos({ top: Math.max(8, top), left: Math.max(8, left) });
    setOpen(true);
  }, []);

  /* close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /* close on Escape */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  return (
    <>
      <button ref={triggerRef} className="cp-trigger"
        onClick={() => open ? setOpen(false) : openPicker()}>
        <span className="cp-trigger__swatch" style={{ background: value }} />
        <span className="cp-trigger__hex">{value}</span>
        {label && <span className="cp-trigger__label">{label}</span>}
        <svg className={`cp-trigger__chevron ${open ? "cp-trigger__chevron--open" : ""}`}
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="cp-popup"
          style={{ top: pos.top, left: pos.left }}
        >
          <PickerPanel value={value} onChange={onChange} />
        </div>,
        document.body,
      )}
    </>
  );
}
