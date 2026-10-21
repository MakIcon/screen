import { useCallback, useEffect, useRef, useState } from "react";

export type PalettePhase = "closed" | "mounting" | "opening" | "open" | "closing";
const ENTER_MS = 360;
const EXIT_MS = 160;

/** Keep the native modal alive through its exit, then run the chosen action once. */
export function usePalettePresence(
  disabled: boolean,
  animationsEnabled: boolean,
  onExit: () => void,
) {
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const animated = animationsEnabled && !reducedMotion;
  const [phase, setPhase] = useState<PalettePhase>("closed");
  const phaseRef = useRef<PalettePhase>("closed");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef(0);
  const action = useRef<(() => void) | null>(null);
  const exit = useRef(onExit);
  exit.current = onExit;

  const changePhase = useCallback((next: PalettePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const clearTransition = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (frame.current) window.cancelAnimationFrame(frame.current);
    timer.current = null;
    frame.current = 0;
  }, []);
  const finish = useCallback(() => {
    clearTransition();
    exit.current();
    changePhase("closed");
    const selectedAction = action.current;
    action.current = null;
    selectedAction?.();
  }, [changePhase, clearTransition]);

  const show = useCallback(() => {
    if (disabled || action.current) return false;
    if (phaseRef.current !== "closed" && phaseRef.current !== "closing") return false;
    const reopening = phaseRef.current === "closing";
    clearTransition();
    if (!animated) changePhase("open");
    else {
      const enter = () => {
        frame.current = 0;
        changePhase("opening");
        timer.current = window.setTimeout(() => changePhase("open"), ENTER_MS);
      };
      if (reopening) enter();
      else {
        changePhase("mounting");
        // Paint the initial pose before starting interruptible CSS transitions.
        frame.current = window.requestAnimationFrame(() => {
          frame.current = window.requestAnimationFrame(enter);
        });
      }
    }
    return true;
  }, [animated, changePhase, clearTransition, disabled]);

  const close = useCallback(
    (onClosed?: () => void) => {
      if (phaseRef.current === "closing") return;
      if (phaseRef.current === "closed") {
        onClosed?.();
        return;
      }
      action.current = onClosed ?? null;
      clearTransition();
      if (!animated || phaseRef.current === "mounting") finish();
      else {
        changePhase("closing");
        timer.current = window.setTimeout(finish, EXIT_MS);
      }
    },
    [animated, changePhase, clearTransition, finish],
  );

  const toggle = useCallback(() => {
    if (phaseRef.current === "closed" || phaseRef.current === "closing") return show();
    close();
    return false;
  }, [close, show]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (disabled && phaseRef.current !== "closed") {
      action.current = null;
      finish();
    } else if (!animated) {
      if (phaseRef.current === "closing") finish();
      else if (phaseRef.current === "mounting" || phaseRef.current === "opening") {
        clearTransition();
        changePhase("open");
      }
    }
  }, [animated, changePhase, clearTransition, disabled, finish]);

  useEffect(
    () => () => {
      clearTransition();
      action.current = null;
    },
    [clearTransition],
  );

  return { phase, animated, present: phase !== "closed", show, close, toggle };
}
