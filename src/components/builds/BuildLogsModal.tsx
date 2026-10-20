import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { toErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { useTranslation } from "../../i18n/locale";
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

function pathLabel(path?: string | null, missing = "NOT CREATED YET") {
  if (!path) return missing;
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function BuildLogsModal({
  instance,
  initialLog = null,
  standalone = false,
  onClose,
}: Props) {
  const tr = useTranslation();
  const [snapshot, setSnapshot] = useState<LaunchLogSnapshot | MinecraftExitPayload | null>(
    initialLog,
  );
  const [activeTab, setActiveTab] = useState<LogTab>(
    initialLog?.crashReportTail ? "crash" : "main",
  );
  const [loading, setLoading] = useState(!initialLog);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const exitPayload = isExitPayload(snapshot) ? snapshot : null;
  const hasCrashReport = Boolean(snapshot?.crashReportTail);
  const bodyText =
    activeTab === "crash"
      ? snapshot?.crashReportTail || tr("buildLogs.noCrashReportWas")
      : snapshot?.logTail || tr("buildLogs.noLaunchLogHas");

  const refreshLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const latest = await invoke<LaunchLogSnapshot>("read_instance_launch_log", {
        instanceId: instance.id,
      });
      setSnapshot(latest);
      setActiveTab((current) =>
        current === "crash" && !latest.crashReportTail ? "main" : current,
      );
    } catch (err) {
      logger.error(err);
      setError(toErrorMessage(err));
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

  const copyActiveLog = async () => {
    if (loading || !bodyText) return;
    try {
      setError("");
      await navigator.clipboard.writeText(bodyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logger.error(err);
      setError(toErrorMessage(err));
    }
  };

  const openBuildFolder = async () => {
    try {
      setError("");
      await invoke<ActionResult>("open_instance_folder", {
        instanceId: instance.id,
      });
    } catch (err) {
      logger.error(err);
      setError(toErrorMessage(err));
    }
  };

  const metaRows = useMemo(() => {
    const rows = [
      {
        label: tr("buildLogs.jvmLog"),
        value: pathLabel(snapshot?.logPath, tr("buildLogs.notCreatedYet")),
        title: snapshot?.logPath,
      },
      {
        label: "LATEST.LOG",
        value: pathLabel(snapshot?.minecraftLogPath, tr("buildLogs.notCreatedYet")),
        title: snapshot?.minecraftLogPath,
      },
      {
        label: tr("buildLogs.crashReport"),
        value: pathLabel(snapshot?.crashReportPath, tr("buildLogs.notCreatedYet")),
        title: snapshot?.crashReportPath,
      },
    ];

    if (exitPayload) {
      rows.unshift({
        label: tr("buildLogs.exit"),
        value:
          exitPayload.exitCode === null || exitPayload.exitCode === undefined
            ? tr("buildLogs.unknown")
            : String(exitPayload.exitCode),
        title: exitPayload.reason,
      });
      rows.unshift({
        label: tr("buildLogs.runtime"),
        value: formatRuntime(exitPayload.runtimeSecs),
        title: exitPayload.reason,
      });
    }

    return rows;
  }, [exitPayload, snapshot, tr]);

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
            <strong>
              {exitPayload?.crashed ? tr("buildLogs.crashLog") : tr("buildLogs.buildLogs")}
            </strong>
          </div>
          <div
            className="build-logs-window-actions"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="build-logs-window-action"
              onClick={handleStandaloneMinimize}
              aria-label={tr("buildLogs.minimize")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 7h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className="build-logs-window-action"
              onClick={handleStandaloneToggleMaximize}
              aria-label={tr("buildLogs.maximize")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 3h6v6H3z" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
            <button
              type="button"
              className="build-logs-window-action build-logs-window-action--close"
              onClick={onClose}
              aria-label={tr("common.close2")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M3 3l6 6M9 3L3 9"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
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
          aria-label={tr("common.close2")}
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
          {exitPayload?.crashed ? tr("buildLogs.crashLog") : tr("buildLogs.buildLogs")}
        </span>
        <h2 className="build-logs-name">{instance.name}</h2>
        {exitPayload && <p className="build-logs-reason">{exitPayload.reason}</p>}
      </div>

      {error && <div className="screenshots-error">{error}</div>}

      {snapshot?.hint && (
        <div className="build-logs-hint">
          <strong>{tr("buildLogs.likelyCause")}</strong>
          <span>{snapshot.hint}</span>
        </div>
      )}

      <div className="build-logs-meta">
        {metaRows.map((row) => (
          <div
            className="build-logs-meta-item"
            key={row.label}
            data-tooltip={row.title || row.value}
          >
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
          {tr("buildLogs.jvmOutput")}
        </button>
        <button
          className={`build-logs-tab${activeTab === "crash" ? " active" : ""}`}
          type="button"
          onClick={() => setActiveTab("crash")}
          disabled={!hasCrashReport}
        >
          {tr("buildLogs.crashReport")}
        </button>
        <button
          className={`build-logs-copy${copied ? " copied" : ""}`}
          type="button"
          onClick={copyActiveLog}
          disabled={loading || !bodyText}
          data-tooltip={`${tr("buildLogs.copy")} ${activeTab === "crash" ? tr("buildLogs.crashReport2") : tr("buildLogs.jvmOutput2")}`}
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M2.5 6.5l2.5 2.5 4.5-5.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {tr("buildLogs.copied")}
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect
                  x="3.5"
                  y="3.5"
                  width="6"
                  height="6"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M2.5 7.5V2.5h5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              {tr("buildLogs.copy2")}
            </>
          )}
        </button>
      </div>

      <CustomScrollArea className="build-logs-body" onWheel={(event) => event.stopPropagation()}>
        {loading ? (
          <div className="build-logs-empty">{tr("buildLogs.loadingLogs")}</div>
        ) : (
          <pre>{bodyText}</pre>
        )}
      </CustomScrollArea>

      <div className="build-logs-actions">
        <button className="primary-action" type="button" onClick={openBuildFolder}>
          {tr("buildLogs.openFolder")}
        </button>
        <button className="ghost-action" type="button" onClick={refreshLogs}>
          {tr("common.refresh")}
        </button>
        <button className="ghost-action" type="button" onClick={onClose}>
          {tr("common.close")}
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
