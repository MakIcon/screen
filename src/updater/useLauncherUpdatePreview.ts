import { useEffect, useState } from "react";
import { useLocale } from "../i18n/locale";
import type { LauncherUpdateInfo, VisibleUpdateState } from "./useLauncherUpdater";

// TEMP_UPDATE_PREVIEW: remove this module and its App.tsx wiring to revert Ctrl+L.
// Preview data lives only in memory and never enters the real updater.
const PREVIEW_NOTES = {
  ru: "## Тестовое обновление\n- Улучшена скорость запуска лаунчера\n- Исправлена установка модов\n- Это временное превью: обновление не скачивается и не устанавливается.",
  en: "## Update preview\n- Faster launcher startup\n- Fixed mod installation\n- This is a temporary preview: no update is downloaded or installed.",
};

const DOWNLOAD_BYTES = 64 * 1024 * 1024;
const DOWNLOAD_DURATION_MS = 8000;
const VERIFY_DURATION_MS = 1200;
const INSTALL_DURATION_MS = 2000;

export function useLauncherUpdatePreview(currentVersion: string | null, enabled: boolean) {
  const locale = useLocale();
  const [info, setInfo] = useState<LauncherUpdateInfo | null>(null);
  const [overlayState, setOverlayState] = useState<VisibleUpdateState | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "KeyL" ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (info) {
        setStartedAt(null);
        setInfo(null);
        setOverlayState(null);
        return;
      }
      const [major, minor, patch] = (currentVersion ?? "0.0.0").split(".");
      setInfo({
        currentVersion: currentVersion ?? "0.0.0",
        version: `${major}.${minor}.${Number.parseInt(patch, 10) + 1}-preview`,
        date: new Date().toISOString(),
        notes: PREVIEW_NOTES[locale],
        releaseUrl: "https://github.com/MakIcon/screen/releases/latest",
      });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [currentVersion, enabled, info, locale]);

  useEffect(() => {
    if (!info || startedAt === null) return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < DOWNLOAD_DURATION_MS + VERIFY_DURATION_MS) {
        const progress = Math.min(1, elapsed / DOWNLOAD_DURATION_MS);
        const ratio = 1 - Math.pow(1 - progress, 1.15);
        setOverlayState({
          stage: "downloading",
          info,
          downloaded: Math.round(DOWNLOAD_BYTES * ratio),
          total: DOWNLOAD_BYTES,
          bytesPerSecond:
            progress < 1
              ? (DOWNLOAD_BYTES / (DOWNLOAD_DURATION_MS / 1000)) *
                1.15 *
                Math.pow(1 - progress, 0.15)
              : null,
        });
      } else if (elapsed < DOWNLOAD_DURATION_MS + VERIFY_DURATION_MS + INSTALL_DURATION_MS) {
        setOverlayState({ stage: "installing", info });
      } else {
        setStartedAt(null);
        setOverlayState(null);
        setInfo(null);
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [info, startedAt]);

  return {
    info,
    overlayState,
    open: () => {
      if (info && startedAt === null)
        setOverlayState({ stage: "available", info, autoStart: false });
    },
    startUpdate: () => {
      if (!info || overlayState?.stage !== "available" || startedAt !== null) return;
      setOverlayState({
        stage: "downloading",
        info,
        downloaded: 0,
        total: DOWNLOAD_BYTES,
        bytesPerSecond: null,
      });
      setStartedAt(Date.now());
    },
    dismiss: () => {
      setStartedAt(null);
      setOverlayState(null);
    },
  };
}
