import { useLayoutEffect, useRef, type RefObject } from "react";
import type { PaletteContextLayout } from "./paletteContextLayout";
import {
  advancePaletteSpring,
  getPaletteElasticConnector,
  getPaletteElasticTransform,
  isPaletteSpringSettled,
  resistPaletteDrag,
  restingPaletteSpring,
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
  phase: string,
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
    const track = dialog.querySelector<SVGPathElement>(".command-palette-connection-track");
    const line = dialog.querySelector<SVGPathElement>(".command-palette-connection-line");
    const port = dialog.querySelector<SVGCircleElement>(".command-palette-connection-port--end");
    let motion = restingPaletteSpring();
    let target = { x: 0, y: 0 };
    let drag: DragSession | null = null;
    let frame = 0;
    let lastTime = 0;
    let suppressClick = false;
    let disposed = false;
    const bounds = {
      left: Math.min(220, Math.max(0, layout.panel.left - 14)),
      right: Math.min(
        220,
        Math.max(0, layout.viewport.width - layout.panel.left - layout.panel.width - 14),
      ),
      up: Math.min(140, Math.max(0, layout.panel.top - 14)),
      // The body may dip below the window temporarily; the drag handle stays reachable.
      down: Math.min(180, Math.max(0, layout.viewport.height - layout.panel.top - 90)),
    };

    const render = () => {
      const atRest = !drag && motion.x === 0 && motion.y === 0;
      shell.style.transform = atRest ? "" : getPaletteElasticTransform(motion, animated);
      if (atRest) delete shell.dataset.moving;
      else shell.dataset.moving = "true";
      if (layout.connection) {
        // Both transforms pivot at this attachment, so deformation never detaches the line.
        const connector = getPaletteElasticConnector(layout.connection, motion);
        track?.setAttribute("d", connector.path);
        line?.setAttribute("d", connector.path);
        port?.setAttribute("cx", String(connector.end.x));
        port?.setAttribute("cy", String(connector.end.y));
        if (line)
          line.style.strokeWidth = atRest
            ? ""
            : String(1.5 - Math.min(Math.hypot(motion.x, motion.y) / 800, 0.4));
      }
    };

    const tick = (now: number) => {
      frame = 0;
      const elapsed = lastTime ? (now - lastTime) / 1000 : 1 / 60;
      lastTime = now;
      motion = advancePaletteSpring(motion, target, elapsed);
      const settled = isPaletteSpringSettled(motion, target);
      if (settled) motion = { ...target, vx: 0, vy: 0 };
      render();
      if (!settled && !disposed) frame = requestAnimationFrame(tick);
      else lastTime = 0;
    };

    const wake = () => {
      if (disposed) return;
      if (!animated) {
        motion = { ...target, vx: 0, vy: 0 };
        render();
      } else if (!frame) frame = requestAnimationFrame(tick);
    };

    const finish = () => {
      if (!drag) return;
      const ended = drag;
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
      // Re-grabbing a returning panel continues from its current location without a jump.
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        offsetX: motion.x,
        offsetY: motion.y,
        moved: false,
      };
      target = { x: motion.x, y: motion.y };
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
      const rawX = drag.offsetX + dx;
      const rawY = drag.offsetY + dy;
      // Apply resistance to the delta, preserving the initial offset when re-grabbing.
      target = {
        x: Math.max(
          -bounds.left,
          Math.min(
            bounds.right,
            drag.offsetX +
              resistPaletteDrag(dx, Math.max(1, rawX < 0 ? bounds.left : bounds.right)),
          ),
        ),
        y: Math.max(
          -bounds.up,
          Math.min(
            bounds.down,
            drag.offsetY + resistPaletteDrag(dy, Math.max(1, rawY < 0 ? bounds.up : bounds.down)),
          ),
        ),
      };
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

    render();
    heading.addEventListener("pointerdown", onDown);
    heading.addEventListener("lostpointercapture", onEnd);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    window.addEventListener("blur", finish);
    document.addEventListener("visibilitychange", onVisibility);
    dialog.addEventListener("click", onClick, true);
    dialog.addEventListener("pointerdown", onNewPointer, true);
    return () => {
      disposed = true;
      finish();
      if (frame) cancelAnimationFrame(frame);
      finishRef.current = null;
      heading.removeEventListener("pointerdown", onDown);
      heading.removeEventListener("lostpointercapture", onEnd);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("blur", finish);
      document.removeEventListener("visibilitychange", onVisibility);
      dialog.removeEventListener("click", onClick, true);
      dialog.removeEventListener("pointerdown", onNewPointer, true);
      motion = restingPaletteSpring();
      render();
    };
  }, [dialogRef, layout, present, animated]);
}
