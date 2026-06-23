import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "../../hooks/useTheme";
import type { InstallProgressPayload } from "../../types";

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
  useTheme();
  const [state, setState] = useState<InstallProgressWindowState>(() =>
    readPersistedInstallProgressState(),
  );
  const progress = state.progress;
  const phase = progress?.phase.trim().toUpperCase() || "WAITING";
  const percent = clampProgressPercent(progress?.percent ?? 0);
  const detail = progress?.detail.trim() ?? "";
  const message = state.busyMessage.trim() || detail || "Waiting for build task";
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
    <div className="install-progress-window-root">
      <div className="install-progress-window-shell">
        <div className="install-progress-titlebar" onMouseDown={startDrag}>
          <div className="install-progress-titlebar-title">
            <span>BUILD TASK</span>
            <strong>{phase}</strong>
          </div>
          <div className="install-progress-window-actions" onMouseDown={(event) => event.stopPropagation()}>
            <button
              className="install-progress-window-action"
              type="button"
              aria-label="Minimize"
              onClick={() => void getCurrentWindow().minimize()}
            >
              -
            </button>
            <button
              className="install-progress-window-action install-progress-window-action--close"
              type="button"
              aria-label="Close"
              onClick={() => void getCurrentWindow().close()}
            >
              x
            </button>
          </div>
        </div>

        <div className="install-progress-body" role="status" aria-live="polite">
          {progress ? (
            <>
              <div className="install-progress-message-card">
                <span className="install-progress-card-label">CURRENT STEP</span>
                <p>{message}</p>
              </div>

              <div className="download-progress-box download-progress-box--floating">
                <div className="download-progress-head">
                  <span>{phase}</span>
                  <strong>{Math.round(percent)}%</strong>
                </div>
                <div className="download-progress-track">
                  <div className="download-progress-fill" style={{ width: `${percent}%` }} />
                </div>
                {hasCount && (
                  <div className="download-progress-meta">
                    <span>{detail || "Working"}</span>
                    <strong>
                      {progress.current} / {progress.total}
                    </strong>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="install-progress-empty">WAITING FOR BUILD TASK</p>
          )}
        </div>
      </div>
    </div>
  );
}