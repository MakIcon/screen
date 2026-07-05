import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { ColorPicker } from "../color-picker/ColorPicker";
import { ElementSlider } from "../inputs/ElementSlider";

type Props = {
  width: number;
  height: number;
  image: string;
  onImageChange: (image: string) => void;
};

function drawImageOnCanvas(canvas: HTMLCanvasElement, source: string) {
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!source) return;

  const image = new Image();
  image.onload = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  };
  image.src = source;
}

export function BuildCardDrawingCanvas({ width, height, image, onImageChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const committedImageRef = useRef(image);
  const renderedImageRef = useRef<string | null>(null);
  const renderedSizeRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const [historySize, setHistorySize] = useState(0);
  const [brushColor, setBrushColor] = useState("#c2410c");
  const [brushSize, setBrushSize] = useState(10);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sizeKey = `${width}x${height}`;
    const imageChangedExternally = image !== committedImageRef.current;
    const shouldRender = renderedImageRef.current !== image || renderedSizeRef.current !== sizeKey;

    if (imageChangedExternally) {
      committedImageRef.current = image;
      historyRef.current = [];
      setHistorySize(0);
    }

    if (shouldRender) {
      drawImageOnCanvas(canvas, image);
      renderedImageRef.current = image;
      renderedSizeRef.current = sizeKey;
    }
  }, [height, image, width]);

  const getCanvasPoint = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const commitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nextImage = canvas.toDataURL("image/png");
    committedImageRef.current = nextImage;
    renderedImageRef.current = nextImage;
    renderedSizeRef.current = `${width}x${height}`;
    onImageChange(nextImage);
  }, [height, onImageChange, width]);

  const beginStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || drawingRef.current) return;
    const canvas = canvasRef.current;
    const point = getCanvasPoint(event);
    const context = canvas?.getContext("2d");
    if (!canvas || !point || !context) return;

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    activePointerRef.current = event.pointerId;
    historyRef.current.push(committedImageRef.current);
    if (historyRef.current.length > 30) historyRef.current.shift();
    setHistorySize(historyRef.current.length);

    context.globalCompositeOperation = "source-over";
    context.strokeStyle = brushColor;
    context.fillStyle = brushColor;
    context.lineWidth = brushSize;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const continueStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || activePointerRef.current !== event.pointerId) return;
    const point = getCanvasPoint(event);
    const context = canvasRef.current?.getContext("2d");
    if (!point || !context) return;
    event.preventDefault();
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const finishStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || activePointerRef.current !== event.pointerId) return;
    drawingRef.current = false;
    activePointerRef.current = null;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    commitCanvas();
  };

  const undo = () => {
    const previousImage = historyRef.current.pop();
    if (previousImage === undefined) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    committedImageRef.current = previousImage;
    renderedImageRef.current = previousImage;
    renderedSizeRef.current = `${width}x${height}`;
    drawImageOnCanvas(canvas, previousImage);
    setHistorySize(historyRef.current.length);
    onImageChange(previousImage);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas || !committedImageRef.current) return;
    historyRef.current.push(committedImageRef.current);
    if (historyRef.current.length > 30) historyRef.current.shift();
    setHistorySize(historyRef.current.length);
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    committedImageRef.current = "";
    renderedImageRef.current = "";
    renderedSizeRef.current = `${width}x${height}`;
    onImageChange("");
  };

  return (
    <div className="bce-canvas-stack">
      <div className="bce-drawing-surface">
        <canvas
          ref={canvasRef}
          className="bce-drawing-canvas"
          width={width}
          height={height}
          aria-label="Build card drawing canvas"
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
      </div>

      <div className="bce-canvas-toolbar">
        <div className="bce-canvas-toolbar__brush">
          <div className="bce-canvas-toolbar__meta">
            <span className="bce-canvas-toolbar__label">Brush color</span>
          </div>
          <ColorPicker value={brushColor} onChange={setBrushColor} />
        </div>

        <div className="bce-canvas-toolbar__size">
          <div className="bce-canvas-toolbar__meta">
            <span className="bce-canvas-toolbar__label">Brush size</span>
            <strong>{brushSize}px</strong>
          </div>
          <div className="bce-slider bce-drawing-size-slider">
            <ElementSlider
              showHeader={false}
              min={1}
              max={40}
              step={1}
              value={brushSize}
              tickMode="none"
              onChange={(value) => setBrushSize(Number(value))}
            />
          </div>
        </div>

        <div className="bce-canvas-toolbar__actions">
          <button
            className="bce-mini-btn"
            type="button"
            onClick={undo}
            disabled={historySize === 0}
          >
            Undo
          </button>
          <button className="bce-mini-btn" type="button" onClick={clear} disabled={!image}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
