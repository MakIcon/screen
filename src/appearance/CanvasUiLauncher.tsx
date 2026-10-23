import { useEffect, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { CANVAS_UI_REPLAY_EVENT, createDefaultCanvasUi } from "./canvasUi";
import { CanvasUiSurface } from "./CanvasUiSurface";
import type { AppearanceProfile } from "./types";

const disabled = createDefaultCanvasUi();

export function CanvasUiLauncher({
  appearance,
  children,
}: {
  appearance: AppearanceProfile;
  children: ReactNode;
}) {
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const restart = () => setReplay((current) => current + 1);
    window.addEventListener(CANVAS_UI_REPLAY_EVENT, restart);
    void listen(CANVAS_UI_REPLAY_EVENT, restart)
      .then((dispose) => {
        if (cancelled) dispose();
        else unlisten = dispose;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener(CANVAS_UI_REPLAY_EVENT, restart);
    };
  }, []);
  return (
    <CanvasUiSurface
      settings={appearance.customized ? appearance.canvasUi : disabled}
      replay={replay}
    >
      {children}
    </CanvasUiSurface>
  );
}
