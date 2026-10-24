import { ProgressBar } from "../display/ProgressBar";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppearance } from "../../appearance/useAppearance";
import { useStandaloneAppearanceRuntime } from "../../appearance/useStandaloneAppearanceRuntime";
import type { InstallProgressPayload } from "../../types";
import { useLocale, useTranslation } from "../../i18n/locale";
import { installProgressCopy } from "../../utils/installProgress";

export const INSTALL_PROGRESS_WINDOW_LABEL = "install-progress";
export const INSTALL_PROGRESS_WINDOW_EVENT = "install-progress-window-update";
export const INSTALL_PROGRESS_STORAGE_KEY = "screenlauncher-install-progress-window-state";

export type InstallProgressWindowState = {
  busyMessage: string;
  progress: InstallProgressPayload | null;
};

export function readInstallProgressWindowRoute() {
  const params = new URLSearchParams(window.location.search);
  return params.get("installProgressWindow") === "1";
}

export function getInstallProgressWindowUrl() {
  return "/?installProgressWindow=1";
}

export function persistInstallProgressWindowState(state: InstallProgressWindowState) {
  window.localStorage.setItem(INSTALL_PROGRESS_STORAGE_KEY, JSON.stringify(state));
}

function readPersistedInstallProgressState(): InstallProgressWindowState {
  const raw = window.localStorage.getItem(INSTALL_PROGRESS_STORAGE_KEY);
  if (!raw) return { busyMessage: "", progress: null };

  try {
    return JSON.parse(raw) as InstallProgressWindowState;
  } catch {
    return { busyMessage: "", progress: null };
  }
}

function clampProgressPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function InstallProgressWindowApp() {
  const tr = useTranslation();
  const locale = useLocale();
  const { appearance } = useAppearance();
  const appearanceRootRef = useStandaloneAppearanceRuntime(appearance, "instances");
  const [state, setState] = useState<InstallProgressWindowState>(() =>
    readPersistedInstallProgressState(),
  );
  const progress = state.progress;
  const { phase, detail } = installProgressCopy(progress, locale);
  const percent = clampProgressPercent(progress?.percent ?? 0);
  const message = detail || tr("progress.waiting");
  const hasCount = Boolean(progress && progress.total > 1);

  useEffect(() => {
    const windowHandle = getCurrentWindow();
    const unlisten = windowHandle.listen<InstallProgressWindowState>(
      INSTALL_PROGRESS_WINDOW_EVENT,
      (event) => {
        setState(event.payload);
        if (!event.payload.progress) {
          window.setTimeout(() => void getCurrentWindow().close(), 80);
        }
      },
    );

    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  const startDrag = () => {
    void getCurrentWindow().startDragging();
  };

  return (
    <div className="install-progress-window-root" ref={appearanceRootRef}>
      <div className="install-progress-window-shell">
        <div className="install-progress-titlebar" onMouseDown={startDrag}>
          <div className="install-progress-titlebar-title">
            <span>{tr("installProgress.buildTask")}</span>
            <strong>{phase}</strong>
          </div>
          <div
            className="install-progress-window-actions"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="install-progress-window-action"
              type="button"
              aria-label={tr("installProgress.minimize")}
              onClick={() => void getCurrentWindow().minimize()}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button
              className="install-progress-window-action install-progress-window-action--close"
              type="button"
              aria-label={tr("common.close2")}
              onClick={() => void getCurrentWindow().close()}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="m2 2 8 8m0-8-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="install-progress-body" role="status" aria-live="polite">
          {progress ? (
            <>
              <div className="install-progress-message-card">
                <span className="install-progress-card-label">
                  {tr("installProgress.currentStep")}
                </span>
                <p>{message}</p>
              </div>

              <div className="download-progress-box download-progress-box--floating">
                <ProgressBar
                  value={percent}
                  label={phase}
                  aria-label={phase}
                  headerClassName="download-progress-head"
                  trackClassName="download-progress-track"
                  fillClassName="download-progress-fill"
                  settings={{ height: 8 }}
                  style={
                    {
                      gap: 0,
                      "--progress-screen-track": "var(--bg-elevated)",
                    } as React.CSSProperties
                  }
                  detail={
                    hasCount ? (
                      <>
                        <span>{detail || tr("progress.working")}</span>
                        <strong>
                          {progress.current} / {progress.total}
                        </strong>
                      </>
                    ) : undefined
                  }
                  detailClassName="download-progress-meta"
                />
              </div>
            </>
          ) : (
            <p className="install-progress-empty">{tr("installProgress.waitingForBuildTask")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
