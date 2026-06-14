import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import type {
  ActionResult,
  InstanceItem,
  LaunchLogSnapshot,
  MinecraftExitPayload,
} from "../../types";

interface Props {
  instance: InstanceItem;
  initialLog?: LaunchLogSnapshot | MinecraftExitPayload | null;
  standalone?: boolean;
  onClose: () => void;
}

type LogTab = "main" | "crash";

function isExitPayload(
  snapshot: LaunchLogSnapshot | MinecraftExitPayload | null,
): snapshot is MinecraftExitPayload {
  return Boolean(snapshot && "reason" in snapshot);
}

function formatRuntime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function pathLabel(path?: string | null) {
  if (!path) return "NOT CREATED YET";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function BuildLogsModal({
  instance,
  initialLog = null,
  standalone = false,
  onClose,
}: Props) {
  const [snapshot, setSnapshot] = useState<LaunchLogSnapshot | MinecraftExitPayload | null>(
    initialLog,
  );
  const [activeTab, setActiveTab] = useState<LogTab>(
    initialLog?.crashReportTail ? "crash" : "main",
  );
  const [loading, setLoading] = useState(!initialLog);
  const [error, setError] = useState("");

  const exitPayload = isExitPayload(snapshot) ? snapshot : null;
  const hasCrashReport = Boolean(snapshot?.crashReportTail);
  const bodyText =
    activeTab === "crash"
      ? snapshot?.crashReportTail || "No crash report was found for this launch."
      : snapshot?.logTail || "No launch log has been created yet.";

  const refreshLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const latest = await invoke<LaunchLogSnapshot>("read_instance_launch_log", {
        instanceId: instance.id,
      });
      setSnapshot(latest);
      setActiveTab((current) => (current === "crash" && !latest.crashReportTail ? "main" : current));
    } catch (err) {
      console.error(err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [instance.id]);

  useEffect(() => {
    if (initialLog) {
      setSnapshot(initialLog);
      setActiveTab(initialLog.crashReportTail ? "crash" : "main");
      setLoading(false);
      return;
    }

    void refreshLogs();
  }, [initialLog, refreshLogs]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openBuildFolder = async () => {
    try {
      setError("");
      await invoke<ActionResult>("open_instance_folder", {
        instanceId: instance.id,
      });
    } catch (err) {
      console.error(err);
      setError(String(err));
    }
  };

  const metaRows = useMemo(() => {
    const rows = [
      { label: "JVM LOG", value: pathLabel(snapshot?.logPath), title: snapshot?.logPath },
      {
        label: "LATEST.LOG",
        value: pathLabel(snapshot?.minecraftLogPath),
        title: snapshot?.minecraftLogPath,
      },
      {
        label: "CRASH REPORT",
        value: pathLabel(snapshot?.crashReportPath),
        title: snapshot?.crashReportPath,
      },
    ];

    if (exitPayload) {
      rows.unshift({
        label: "EXIT",
        value: exitPayload.exitCode === null || exitPayload.exitCode === undefined
          ? "UNKNOWN"
          : String(exitPayload.exitCode),
        title: exitPayload.reason,
      });
      rows.unshift({
        label: "RUNTIME",
        value: formatRuntime(exitPayload.runtimeSecs),
        title: exitPayload.reason,
      });
    }

    return rows;
  }, [exitPayload, snapshot]);

  const handleStandaloneDrag = () => {
    if (!standalone) return;
    void getCurrentWindow().startDragging();
  };

  const handleStandaloneToggleMaximize = () => {
    if (!standalone) return;
    void getCurrentWindow().toggleMaximize();
  };

  const handleStandaloneMinimize = () => {
    if (!standalone) return;
    void getCurrentWindow().minimize();
  };

  const modal = (
    <div
      className={`build-logs-modal${standalone ? " build-logs-modal--standalone" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      {standalone && (
        <div
          className="build-logs-titlebar"
          onMouseDown={handleStandaloneDrag}
          onDoubleClick={handleStandaloneToggleMaximize}
        >
          <div className="build-logs-titlebar-title">
            <span>SCREENLAUNCHER</span>
            <strong>{exitPayload?.crashed ? "CRASH LOG" : "BUILD LOGS"}</strong>
          </div>
          <div className="build-logs-window-actions" onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="build-logs-window-action"
              onClick={handleStandaloneMinimize}
              aria-label="Minimize"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 7h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className="build-logs-window-action"
              onClick={handleStandaloneToggleMaximize}
              aria-label="Maximize"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 3h6v6H3z" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
            <button
              type="button"
              className="build-logs-window-action build-logs-window-action--close"
              onClick={onClose}
              aria-label="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {!standalone && (
        <button
          className="bce-hdr-close build-logs-modal-close"
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="1" y1="1" x2="10" y2="10" />
            <line x1="10" y1="1" x2="1" y2="10" />
          </svg>
        </button>
      )}

        <div className="build-logs-head">
          <span className="confirm-label">
            {exitPayload?.crashed ? "CRASH LOG" : "BUILD LOGS"}
          </span>
          <h2 className="build-logs-name">{instance.name}</h2>
          {exitPayload && <p className="build-logs-reason">{exitPayload.reason}</p>}
        </div>

        {error && <div className="screenshots-error">{error}</div>}

        {snapshot?.hint && (
          <div className="build-logs-hint">
            <strong>LIKELY CAUSE</strong>
            <span>{snapshot.hint}</span>
          </div>
        )}

        <div className="build-logs-meta">
          {metaRows.map((row) => (
            <div className="build-logs-meta-item" key={row.label} title={row.title || row.value}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>

        <div className="build-logs-tabs">
          <button
            className={`build-logs-tab${activeTab === "main" ? " active" : ""}`}
            type="button"
            onClick={() => setActiveTab("main")}
          >
            JVM OUTPUT
          </button>
          <button
            className={`build-logs-tab${activeTab === "crash" ? " active" : ""}`}
            type="button"
            onClick={() => setActiveTab("crash")}
            disabled={!hasCrashReport}
          >
            CRASH REPORT
          </button>
        </div>

        <CustomScrollArea className="build-logs-body" onWheel={(event) => event.stopPropagation()}>
          {loading ? <div className="build-logs-empty">LOADING LOGS...</div> : <pre>{bodyText}</pre>}
        </CustomScrollArea>

        <div className="build-logs-actions">
          <button className="primary-action" type="button" onClick={openBuildFolder}>
            OPEN FOLDER
          </button>
          <button className="ghost-action" type="button" onClick={refreshLogs}>
            REFRESH
          </button>
          <button className="ghost-action" type="button" onClick={onClose}>
            CLOSE
          </button>
        </div>
    </div>
  );

  if (standalone) {
    return <div className="build-logs-window-root">{modal}</div>;
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      {modal}
    </div>
  );
}
