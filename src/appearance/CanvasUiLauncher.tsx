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
    const restart = (payload?: { targetIds?: string[] } | null) => {
      if (!payload?.targetIds) setReplay((current) => current + 1);
    };
    const local = (event: Event) =>
      restart((event as CustomEvent<{ targetIds?: string[] }>).detail);
    window.addEventListener(CANVAS_UI_REPLAY_EVENT, local);
    void listen<{ targetIds?: string[] } | null>(CANVAS_UI_REPLAY_EVENT, (event) =>
      restart(event.payload),
    )
      .then((dispose) => {
        if (cancelled) dispose();
        else unlisten = dispose;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener(CANVAS_UI_REPLAY_EVENT, local);
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
