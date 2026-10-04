import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { logger } from "../../utils/logger";
import {
  advancePinnedPaperMotion,
  createPaperPositionWriter,
  createPinnedPaperMotion,
  getPinnedPaperTilt,
  getPinnedPaperSwingLimit,
  isPinnedPaperSettled,
  type PaperWindowPosition,
} from "./pinnedPaperMotion";

type DragSession = {
  id: number;
  pointerId: number;
  element: HTMLElement;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  sampleTime: number;
  position: PaperWindowPosition | null;
  scale: number;
};

export function usePinnedPaperDrag(
  paperRef: RefObject<HTMLElement | null>,
  animationEnabled: boolean,
) {
  const startRef = useRef<((event: PointerEvent<HTMLElement>) => void) | null>(null);
  const animationEnabledRef = useRef(animationEnabled);
  const updateAnimationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    animationEnabledRef.current = animationEnabled;
    updateAnimationRef.current?.();
  }, [animationEnabled]);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    const nativeWindow = isTauri() ? getCurrentWindow() : null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let motion = createPinnedPaperMotion();
    let session: DragSession | null = null;
    let generation = 0;
    let horizontalVelocity = 0;
    let lastMovementTime = 0;
    let lastFrameTime = 0;
    let frame = 0;
    let disposed = false;
    let maxAngle = 6.4;
    const canAnimate = () => animationEnabledRef.current && !reducedMotion.matches;

    const updateBounds = () => {
      const width = paper.parentElement?.clientWidth ?? paper.offsetWidth;
      const height = paper.parentElement?.clientHeight ?? paper.offsetHeight;
      const gutter = Math.max(0, (width - paper.offsetWidth) / 2 - 2);
      const verticalGutter = Math.max(0, (height - paper.offsetHeight) / 2 - 2);
      maxAngle = getPinnedPaperSwingLimit(
        paper.offsetWidth,
        paper.offsetHeight,
        gutter,
        verticalGutter,
      );
    };
    updateBounds();

    const render = () => {
      // Limit the visible swing to the transparent margins without scaling the sheet.
      const restAngle = Number.parseFloat(paper.style.getPropertyValue("--bpg-rest-angle")) || 0;
      const totalAngle = Math.max(-maxAngle, Math.min(maxAngle, restAngle + motion.angle));
      paper.style.setProperty("--bpg-swing", `${(totalAngle - restAngle).toFixed(4)}deg`);
      paper.style.setProperty(
        "--bpg-pin-lift",
        Math.max(0, Math.min(1.06, motion.lift)).toFixed(4),
      );
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.064) : 1 / 60;
      lastFrameTime = now;
      if (!session || now - lastMovementTime > 50) horizontalVelocity *= Math.exp(-10 * dt);
      if (Math.abs(horizontalVelocity) < 0.1) horizontalVelocity = 0;
      motion = canAnimate()
        ? advancePinnedPaperMotion(
            motion,
            getPinnedPaperTilt(horizontalVelocity),
            session !== null,
            dt,
          )
        : createPinnedPaperMotion();
      render();
      if (canAnimate() && (!isPinnedPaperSettled(motion, session !== null) || horizontalVelocity)) {
        frame = requestAnimationFrame(tick);
      } else {
        lastFrameTime = 0;
      }
    };

    const wake = () => {
      if (!frame && !disposed && canAnimate()) frame = requestAnimationFrame(tick);
    };

    const boundsObserver = new ResizeObserver(() => {
      updateBounds();
      render();
      wake();
    });
    boundsObserver.observe(paper);
    if (paper.parentElement) boundsObserver.observe(paper.parentElement);

    const finish = () => {
      const finished = session;
      session = null;
      delete paper.dataset.dragging;
      if (finished?.element.hasPointerCapture(finished.pointerId))
        finished.element.releasePointerCapture(finished.pointerId);
      wake();
    };

    const writer = createPaperPositionWriter(
      async (position) => {
        if (nativeWindow) await nativeWindow.setPosition(new PhysicalPosition(position));
      },
      (error) => {
        logger.error(error);
        finish();
      },
    );

    const moveWindow = (drag: DragSession) => {
      if (!drag.position || drag.id !== generation || disposed) return;
      writer.push({
        x: Math.round(drag.position.x + (drag.currentX - drag.originX) * drag.scale),
        y: Math.round(drag.position.y + (drag.currentY - drag.originY) * drag.scale),
      });
    };

    const onMove = (event: globalThis.PointerEvent) => {
      if (!session || session.pointerId !== event.pointerId) return;
      const now = performance.now();
      const delta = event.screenX - session.currentX;
      const elapsed = Math.max(8, now - session.sampleTime);
      horizontalVelocity = horizontalVelocity * 0.3 + (delta / elapsed) * 1000 * 0.7;
      session.currentX = event.screenX;
      session.currentY = event.screenY;
      session.sampleTime = now;
      lastMovementTime = now;
      moveWindow(session);
      wake();
    };

    const onEnd = (event: globalThis.PointerEvent) => {
      if (session?.pointerId !== event.pointerId) return;
      if (event.type === "pointerup") {
        session.currentX = event.screenX;
        session.currentY = event.screenY;
        moveWindow(session);
      }
      finish();
    };

    startRef.current = (event) => {
      if (event.button !== 0 || session) return;
      event.preventDefault();
      const now = performance.now();
      const drag: DragSession = {
        id: ++generation,
        pointerId: event.pointerId,
        element: event.currentTarget,
        originX: event.screenX,
        originY: event.screenY,
        currentX: event.screenX,
        currentY: event.screenY,
        sampleTime: now,
        position: null,
        scale: 1,
      };
      drag.element.setPointerCapture(drag.pointerId);
      session = drag;
      horizontalVelocity = 0;
      lastMovementTime = now;
      paper.dataset.dragging = "true";
      wake();

      if (nativeWindow) {
        // Keep capture in the webview so mouse release is received even outside
        // the sheet. Serialize position writes instead of entering the OS drag loop.
        void writer
          .flush()
          .then(() => Promise.all([nativeWindow.outerPosition(), nativeWindow.scaleFactor()]))
          .then(([position, scale]) => {
            if (disposed || drag.id !== generation) return;
            drag.position = position;
            drag.scale = scale;
            moveWindow(drag);
          })
          .catch((error: unknown) => {
            if (disposed || drag.id !== generation) return;
            logger.error(error);
            finish();
          });
      }
    };

    const onAnimationPreferenceChange = () => {
      if (!canAnimate()) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastFrameTime = 0;
        horizontalVelocity = 0;
        motion = createPinnedPaperMotion();
        render();
      }
      wake();
    };
    updateAnimationRef.current = onAnimationPreferenceChange;
    onAnimationPreferenceChange();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    window.addEventListener("lostpointercapture", onEnd);
    window.addEventListener("blur", finish);
    reducedMotion.addEventListener("change", onAnimationPreferenceChange);

    return () => {
      disposed = true;
      startRef.current = null;
      updateAnimationRef.current = null;
      finish();
      writer.dispose();
      boundsObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("lostpointercapture", onEnd);
      window.removeEventListener("blur", finish);
      reducedMotion.removeEventListener("change", onAnimationPreferenceChange);
      paper.style.removeProperty("--bpg-swing");
      paper.style.removeProperty("--bpg-pin-lift");
    };
  }, [paperRef]);

  return useCallback((event: PointerEvent<HTMLElement>) => startRef.current?.(event), []);
}
