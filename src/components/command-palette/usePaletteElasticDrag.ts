import { useLayoutEffect, useRef, type RefObject } from "react";
import type { PaletteContextLayout } from "./paletteContextLayout";
import type { PalettePhase } from "./usePalettePresence";
import { createPaletteWaveFilter } from "./paletteWaveFilter";
import {
  advancePaletteMesh,
  constrainPaletteMesh,
  getPaletteElasticConnector,
  getPaletteMeshOffset,
  getPaletteMeshTransform,
  getPaletteMeshWeights,
  isPaletteMeshAtRest,
  isPaletteMeshSettled,
  pinPaletteMesh,
  resistPaletteDrag,
  restingPaletteMesh,
  uniformPaletteMesh,
} from "./paletteElasticMotion";

type DragSession = {
  pointerId: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
};

export function usePaletteElasticDrag(
  dialogRef: RefObject<HTMLDialogElement | null>,
  layout: PaletteContextLayout | null,
  phase: PalettePhase,
  animated: boolean,
) {
  const phaseRef = useRef(phase);
  const finishRef = useRef<(() => void) | null>(null);
  const present = phase !== "closed";

  useLayoutEffect(() => {
    phaseRef.current = phase;
    if (phase === "closing") finishRef.current?.();
  }, [phase]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const shell = dialog?.querySelector<HTMLElement>(".command-palette-drag-shell");
    const heading = shell?.querySelector<HTMLElement>(".command-palette-heading");
    if (!present || !layout || !dialog || !shell || !heading) return;
    const panel = shell.querySelector<HTMLElement>(".command-palette");
    const waveFilter = panel ? createPaletteWaveFilter(dialog, panel) : null;
    const track = dialog.querySelector<SVGPathElement>(".command-palette-connection-track");
    const line = dialog.querySelector<SVGPathElement>(".command-palette-connection-line");
    const port = dialog.querySelector<SVGCircleElement>(".command-palette-connection-port--end");
    let mesh = restingPaletteMesh();
    const grab = { u: 0.5, v: 0.05 };
    let weights = getPaletteMeshWeights(grab, layout.panel);
    let target = { x: 0, y: 0 };
    let drag: DragSession | null = null;
    let frame = 0;
    let lastTime = 0;
    let suppressClick = false;
    let disposed = false;
    const bounds = {
      left: Math.min(360, Math.max(0, layout.panel.left - 14)),
      right: Math.min(
        360,
        Math.max(0, layout.viewport.width - layout.panel.left - layout.panel.width + 100),
      ),
      up: Math.min(180, Math.max(0, layout.panel.top - 14)),
      down: Math.min(260, Math.max(0, layout.viewport.height - layout.panel.top - 90)),
    };

    const measure = () => ({
      width: shell.offsetWidth || layout.panel.width,
      height: shell.offsetHeight || layout.panel.height,
    });
    let size = measure();
    const visibleMesh = () => (drag ? pinPaletteMesh(mesh, size, grab, target) : mesh);

    const render = (updateWave = true) => {
      const atRest = !drag && isPaletteMeshAtRest(mesh);
      const visible = visibleMesh();
      shell.style.transform = atRest ? "" : getPaletteMeshTransform(visible, size);
      if (updateWave) {
        if (animated && !atRest) waveFilter?.render(visible, size);
        else waveFilter?.reset();
      }
      if (atRest) delete shell.dataset.moving;
      else shell.dataset.moving = "true";
      if (layout.connection) {
        // The attachment rides on the deformed panel, so the line never detaches.
        const { end } = layout.connection;
        const offset = atRest
          ? { x: 0, y: 0 }
          : getPaletteMeshOffset(
              visible,
              size,
              (end.x - layout.panel.left) / size.width,
              (end.y - layout.panel.top) / size.height,
            );
        const connector = getPaletteElasticConnector(layout.connection, offset);
        track?.setAttribute("d", connector.path);
        line?.setAttribute("d", connector.path);
        port?.setAttribute("cx", String(connector.end.x));
        port?.setAttribute("cy", String(connector.end.y));
        if (line)
          line.style.strokeWidth = atRest
            ? ""
            : String(1.5 - Math.min(Math.hypot(offset.x, offset.y) / 800, 0.4));
      }
    };

    const tick = (now: number) => {
      frame = 0;
      const elapsed = lastTime ? (now - lastTime) / 1000 : 1 / 60;
      lastTime = now;
      mesh = constrainPaletteMesh(
        advancePaletteMesh(mesh, target, weights, elapsed, drag !== null),
        size,
      );
      const settled = isPaletteMeshSettled(mesh, target);
      if (settled) mesh = uniformPaletteMesh(target);
      render();
      if (!settled && !disposed) frame = requestAnimationFrame(tick);
      else lastTime = 0;
    };

    const wake = () => {
      if (disposed) return;
      if (!animated) {
        mesh = uniformPaletteMesh(target);
        render();
      } else if (!frame) frame = requestAnimationFrame(tick);
    };

    const finish = () => {
      if (!drag) return;
      const ended = drag;
      mesh = visibleMesh();
      drag = null;
      suppressClick = ended.moved;
      delete shell.dataset.dragging;
      target = { x: 0, y: 0 };
      if (heading.hasPointerCapture(ended.pointerId))
        heading.releasePointerCapture(ended.pointerId);
      wake();
    };
    finishRef.current = finish;

    const onDown = (event: PointerEvent) => {
      if (
        drag ||
        event.button !== 0 ||
        !event.isPrimary ||
        !["open", "opening"].includes(phaseRef.current)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      heading.setPointerCapture(event.pointerId);
      const box = shell.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        grab.u = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
        grab.v = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
      }
      size = measure();
      weights = getPaletteMeshWeights(grab, size);
      const held = getPaletteMeshOffset(mesh, size, grab.u, grab.v);
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        offsetX: held.x,
        offsetY: held.y,
        moved: false,
      };
      target = { x: held.x, y: held.y };
      shell.dataset.dragging = "true";
    };
    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (event.pointerType === "mouse" && !(event.buttons & 1)) {
        finish();
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      target = {
        x:
          drag.offsetX +
          resistPaletteDrag(dx, dx < 0 ? bounds.left + drag.offsetX : bounds.right - drag.offsetX),
        y:
          drag.offsetY +
          resistPaletteDrag(dy, dy < 0 ? bounds.up + drag.offsetY : bounds.down - drag.offsetY),
      };
      if (animated) render(false);
      wake();
    };
    const onEnd = (event: PointerEvent) => {
      if (event.pointerId === drag?.pointerId) finish();
    };
    const onVisibility = () => {
      if (document.hidden) finish();
    };
    const onClick = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const onNewPointer = () => {
      suppressClick = false;
    };

    const observer = new ResizeObserver(() => {
      size = measure();
      weights = getPaletteMeshWeights(grab, size);
      render();
    });
    observer.observe(shell);
    const events = new AbortController();
    const listen = { signal: events.signal };
    heading.addEventListener("pointerdown", onDown, listen);
    heading.addEventListener("lostpointercapture", onEnd, listen);
    window.addEventListener("pointermove", onMove, listen);
    window.addEventListener("pointerup", onEnd, listen);
    window.addEventListener("pointercancel", onEnd, listen);
    window.addEventListener("blur", finish, listen);
    document.addEventListener("visibilitychange", onVisibility, listen);
    dialog.addEventListener("click", onClick, { ...listen, capture: true });
    dialog.addEventListener("pointerdown", onNewPointer, { ...listen, capture: true });
    render();
    return () => {
      disposed = true;
      finish();
      if (frame) cancelAnimationFrame(frame);
      finishRef.current = null;
      events.abort();
      observer.disconnect();
      waveFilter?.reset();
      mesh = restingPaletteMesh();
      render();
    };
  }, [dialogRef, layout, present, animated]);
}
