import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ColorPicker } from "../components/color-picker/ColorPicker";
import type { DrawingCursorPayload } from "./elementOverrides";

type DrawingCanvasProps = {
  value: string;
  backgroundColor: string;
  scope: "launcher" | "content";
  onChange: (dataUrl: string) => void;
  onCursorChange?: (payload: DrawingCursorPayload) => void;
};

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

function loadCanvasImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

export function DrawingCanvas({
  value,
  backgroundColor,
  scope,
  onChange,
  onCursorChange,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const cursorFrameRef = useRef(0);
  const pendingCursorRef = useRef<DrawingCursorPayload | null>(null);
  const [brushColor, setBrushColor] = useState("#f26522");
  const [brushSize, setBrushSize] = useState(12);
  const [eraser, setEraser] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) return;

    let cancelled = false;
    void loadCanvasImage(value)
      .then((image) => {
        if (!cancelled) context.drawImage(image, 0, 0, canvas.width, canvas.height);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(
    () => () => {
      window.cancelAnimationFrame(cursorFrameRef.current);
    },
    [],
  );

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const queueCursor = (payload: DrawingCursorPayload) => {
    pendingCursorRef.current = payload;
    if (cursorFrameRef.current) return;
    cursorFrameRef.current = window.requestAnimationFrame(() => {
      cursorFrameRef.current = 0;
      if (pendingCursorRef.current) onCursorChange?.(pendingCursorRef.current);
    });
  };

  const publishCursor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    queueCursor({
      visible: true,
      x: Math.min(1, Math.max(0, point.x / CANVAS_WIDTH)),
      y: Math.min(1, Math.max(0, point.y / CANVAS_HEIGHT)),
      size: brushSize,
      color: brushColor,
      eraser,
    });
  };

  const hideCursor = () => {
    queueCursor({ visible: false, x: 0, y: 0, size: brushSize, color: brushColor, eraser });
  };

  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    publishCursor(event);
    drawingRef.current = true;
    lastPointRef.current = canvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    publishCursor(event);
    if (!drawingRef.current || !lastPointRef.current) return;
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;

    const nextPoint = canvasPoint(event);
    context.save();
    context.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    context.strokeStyle = brushColor;
    context.lineWidth = brushSize;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    context.restore();
    lastPointRef.current = nextPoint;
  };

  const commitDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onChange(event.currentTarget.toDataURL("image/png"));
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    onChange("");
  };

  const addText = () => {
    const trimmed = text.trim();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !trimmed) return;

    context.save();
    context.fillStyle = eraser ? backgroundColor : brushColor;
    context.font = `700 ${Math.max(28, brushSize * 3)}px Inter, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(trimmed.slice(0, 80), canvas.width / 2, canvas.height / 2);
    context.restore();
    setText("");
    onChange(canvas.toDataURL("image/png"));
  };

  return (
    <div className="drawing-editor">
      <div className="drawing-toolbar">
        <div className="studio-color-compact" data-tooltip="Brush color">
          <ColorPicker value={brushColor} onChange={setBrushColor} label="Brush color" />
        </div>
        <label className="drawing-size">
          <span>SIZE</span>
          <input
            type="range"
            min="2"
            max="42"
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          className={eraser ? "active" : ""}
          onClick={() => setEraser((current) => !current)}
        >
          ERASER
        </button>
        <button type="button" onClick={clearDrawing}>
          CLEAR
        </button>
      </div>

      <div className={`drawing-canvas-frame drawing-canvas-frame--${scope}`}>
        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{ backgroundColor }}
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={commitDrawing}
          onPointerEnter={publishCursor}
          onPointerLeave={hideCursor}
          onPointerCancel={(event) => {
            commitDrawing(event);
            hideCursor();
          }}
        />
        <div className="drawing-layout-guides" aria-hidden="true">
          <span className="drawing-layout-zone drawing-layout-zone--header">TITLE BAR</span>
          <span className="drawing-layout-zone drawing-layout-zone--sidebar">LEFT PANEL</span>
          <span className="drawing-layout-zone drawing-layout-zone--footer">FOOTER</span>
          <i className="drawing-layout-line drawing-layout-line--header" />
          <i className="drawing-layout-line drawing-layout-line--sidebar" />
          <i className="drawing-layout-line drawing-layout-line--footer" />
        </div>
      </div>

      <div className="drawing-text-row">
        <input
          value={text}
          maxLength={80}
          placeholder="TYPE SOMETHING ON THE CANVAS"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && addText()}
        />
        <button type="button" onClick={addText} disabled={!text.trim()}>
          ADD TEXT
        </button>
      </div>
    </div>
  );
}
