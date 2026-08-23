import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  APPEARANCE_CHANGED_EVENT,
  APPEARANCE_PREVIEW_EVENT,
  APPEARANCE_STORAGE_KEY,
  applyAppearanceToElement,
  createDefaultAppearance,
  normalizeAppearanceProfile,
  readStoredAppearance,
  writeStoredAppearance,
} from "./profile";
import type { AppearanceProfile, Theme } from "./types";

export function useAppearance() {
  const [appearance, setAppearanceState] = useState<AppearanceProfile>(readStoredAppearance);

  useLayoutEffect(() => {
    applyAppearanceToElement(document.documentElement, appearance);
  }, [appearance]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const subscribe = async () => {
      const disposers = await Promise.all([
        listen<AppearanceProfile>(APPEARANCE_CHANGED_EVENT, (event) => {
          if (!disposed) setAppearanceState(normalizeAppearanceProfile(event.payload));
        }),
        listen<AppearanceProfile>(APPEARANCE_PREVIEW_EVENT, (event) => {
          if (!disposed) setAppearanceState(normalizeAppearanceProfile(event.payload));
        }),
      ]);

      const disposeAll = () => disposers.forEach((dispose) => dispose());
      if (disposed) disposeAll();
      else unlisten = disposeAll;
    };

    void subscribe().catch(() => {
      // A plain browser preview has no Tauri event bridge; storage still works there.
    });

    const onStorage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_STORAGE_KEY && event.newValue) {
        try {
          setAppearanceState(normalizeAppearanceProfile(JSON.parse(event.newValue)));
        } catch {
          // Ignore a partial write from another webview and keep the last valid profile.
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const saveAppearance = useCallback((next: AppearanceProfile) => {
    const normalized = writeStoredAppearance(next);
    setAppearanceState(normalized);
    void emit(APPEARANCE_CHANGED_EVENT, normalized).catch(() => {
      // The storage event remains a fallback when running outside Tauri.
    });
    return normalized;
  }, []);

  const setTheme = useCallback(
    (theme: Theme) => saveAppearance(createDefaultAppearance(theme, false)),
    [saveAppearance],
  );

  return {
    appearance,
    theme: appearance.baseTheme,
    setTheme,
    saveAppearance,
  };
}
