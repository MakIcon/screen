import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export function useWindowPhase(
  win: WebviewWindow,
  setPhase: (phase: string) => void
) {
  const hasStartedUnfoldRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let cleanup: null | (() => void) = null;

    const setup = async () => {
      const unlisten = await win.listen<{ phase: string }>(
        "window-phase",
        (e) => {
          if (mounted) {
            setPhase(e.payload.phase);
          }
        }
      );

      if (!hasStartedUnfoldRef.current) {
        hasStartedUnfoldRef.current = true;
        await invoke("start_gallery_unfold");
      }

      cleanup = unlisten;
    };

    void setup();

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [setPhase, win]);
}