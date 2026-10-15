import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { WorkflowDraftStep } from "./workflowDraft";

type DragPreview = {
  id: string;
  beforeId: string | null | undefined;
  left: number;
  top: number;
  width: number;
};

export function useWorkflowStepDrag(
  steps: WorkflowDraftStep[],
  locked: boolean,
  onMove: (id: string, beforeId: string | null) => void,
) {
  const [drag, setDrag] = useState<DragPreview | null>(null);
  const startRef = useRef<((event: PointerEvent<HTMLOListElement>) => void) | null>(null);
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    let session: {
      id: string;
      pointerId: number;
      list: HTMLOListElement;
      scroll: HTMLElement;
      x: number;
      y: number;
      startX: number;
      startY: number;
      offsetX: number;
      offsetY: number;
      width: number;
      active: boolean;
      beforeId: string | null | undefined;
    } | null = null;
    let frame = 0;
    let previousFrame = 0;

    const finish = (commit = false) => {
      const finished = session;
      session = null;
      cancelAnimationFrame(frame);
      frame = 0;
      previousFrame = 0;
      if (!finished) return;
      if (finished.list.hasPointerCapture(finished.pointerId))
        finished.list.releasePointerCapture(finished.pointerId);
      if (!finished.active) return;
      document.documentElement.classList.remove("mf-reordering");
      suppressClickUntil.current = performance.now() + 250;
      setDrag(null);
      if (commit && finished.beforeId !== undefined) onMove(finished.id, finished.beforeId);
    };

    const render = () => {
      if (!session?.active) return;
      const bounds = session.list.getBoundingClientRect();
      const viewport = session.scroll.getBoundingClientRect();
      const page = session.scroll === document.scrollingElement;
      const top = Math.max(bounds.top, page ? 0 : viewport.top);
      const bottom = Math.min(bounds.bottom, page ? innerHeight : viewport.bottom);
      session.beforeId = undefined;
      if (
        session.x >= bounds.left &&
        session.x <= bounds.right &&
        session.y >= top &&
        session.y <= bottom
      ) {
        session.beforeId = null;
        for (const row of session.list.querySelectorAll<HTMLElement>(
          ":scope > [data-workflow-step]",
        )) {
          if (row.dataset.workflowStep === session.id) continue;
          const rect = row.getBoundingClientRect();
          if (session.y < rect.top + rect.height / 2) {
            session.beforeId = row.dataset.workflowStep;
            break;
          }
        }
      }
      setDrag({
        id: session.id,
        beforeId: session.beforeId,
        left: session.x - session.offsetX,
        top: session.y - session.offsetY,
        width: session.width,
      });
    };

    const tick = (now: number) => {
      if (!session?.active) return;
      const elapsed = Math.min(previousFrame ? now - previousFrame : 16, 40);
      previousFrame = now;
      const rect = session.scroll.getBoundingClientRect();
      const page = session.scroll === document.scrollingElement;
      const top = Math.max(0, page ? 0 : rect.top);
      const bottom = Math.min(innerHeight, page ? innerHeight : rect.bottom);
      const bounds = session.list.getBoundingClientRect();
      if (
        session.x >= bounds.left &&
        session.x <= bounds.right &&
        session.y >= top &&
        session.y <= bottom
      ) {
        const edge = Math.min(56, (bottom - top) / 4);
        const speed =
          session.y < top + edge
            ? -Math.min(1, (top + edge - session.y) / edge)
            : session.y > bottom - edge
              ? Math.min(1, (session.y - bottom + edge) / edge)
              : 0;
        if (speed) {
          const previous = session.scroll.scrollTop;
          session.scroll.scrollTop += speed * elapsed * 0.7;
          if (session.scroll.scrollTop !== previous) render();
        }
      }
      frame = requestAnimationFrame(tick);
    };

    const move = (event: globalThis.PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      session.x = event.clientX;
      session.y = event.clientY;
      if (!session.active) {
        if (Math.hypot(session.x - session.startX, session.y - session.startY) < 6) return;
        session.active = true;
        session.list.setPointerCapture(session.pointerId);
        document.documentElement.classList.add("mf-reordering");
        window.getSelection()?.removeAllRanges();
        frame = requestAnimationFrame(tick);
      }
      event.preventDefault();
      render();
    };
    const end = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== session?.pointerId) return;
      if (event.type === "pointerup" && session.active) {
        session.x = event.clientX;
        session.y = event.clientY;
        render();
        event.preventDefault();
      }
      finish(event.type === "pointerup");
    };
    const cancel = () => finish();
    const key = (event: KeyboardEvent) => {
      if (session && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish();
      }
    };

    startRef.current = (event) => {
      if (locked || steps.length < 2 || event.button !== 0 || !event.isPrimary || session) return;
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLElement>(".mf-step-row");
      const id = row?.parentElement?.dataset.workflowStep;
      if (!row || !id || target.closest(".mf-step-tools")) return;
      if (event.pointerType === "touch" && !target.closest(".mf-step-grip")) return;
      let scroll = event.currentTarget.parentElement;
      while (
        scroll &&
        !(
          /auto|scroll/.test(getComputedStyle(scroll).overflowY) &&
          scroll.scrollHeight > scroll.clientHeight
        )
      )
        scroll = scroll.parentElement;
      const rect = row.getBoundingClientRect();
      session = {
        id,
        pointerId: event.pointerId,
        list: event.currentTarget,
        scroll: scroll || (document.scrollingElement as HTMLElement),
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        active: false,
        beforeId: undefined,
      };
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("lostpointercapture", end);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", render, true);
    return () => {
      finish();
      startRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("lostpointercapture", end);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", render, true);
    };
  }, [locked, steps, onMove]);

  return {
    drag,
    onPointerDown: (event: PointerEvent<HTMLOListElement>) => startRef.current?.(event),
    onClickCapture: (event: MouseEvent<HTMLOListElement>) => {
      if (performance.now() >= suppressClickUntil.current) return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
