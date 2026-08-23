import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppearance } from "../../appearance/useAppearance";
import type { InstanceItem, LaunchLogSnapshot, MinecraftExitPayload } from "../../types";
import { toErrorMessage } from "../../utils/errors";
import { BuildLogsModal } from "./BuildLogsModal";

const LOG_WINDOW_STORAGE_PREFIX = "screenlauncher-log-window";
export const LOG_WINDOW_REFRESH_EVENT = "launch-log-window-refresh";

export type BuildLogsWindowRoute = {
  instanceId: string;
  payloadKey: string;
};

type StoredLogWindowPayload = {
  instanceId: string;
  initialLog?: LaunchLogSnapshot | MinecraftExitPayload | null;
};

export function readBuildLogsWindowRoute(): BuildLogsWindowRoute | null {
  const params = new URLSearchParams(window.location.search);
  const instanceId = params.get("logWindow");
  const payloadKey = params.get("payloadKey");
  return instanceId && payloadKey ? { instanceId, payloadKey } : null;
}

export function getBuildLogsWindowLabel(instanceId: string): string {
  const safeId = instanceId.replace(/[^a-zA-Z0-9-/:_]/g, "_");
  return `build-log-${safeId}`;
}

export function createBuildLogsWindowPayload(
  instanceId: string,
  initialLog: LaunchLogSnapshot | MinecraftExitPayload | null,
): string {
  const safeId = instanceId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const payloadKey = `${LOG_WINDOW_STORAGE_PREFIX}-${safeId}-${Date.now()}`;
  const payload: StoredLogWindowPayload = { instanceId, initialLog };
  window.localStorage.setItem(payloadKey, JSON.stringify(payload));
  return payloadKey;
}

export function getBuildLogsWindowUrl(instanceId: string, payloadKey: string): string {
  return `/?logWindow=${encodeURIComponent(instanceId)}&payloadKey=${encodeURIComponent(payloadKey)}`;
}

function createLogWindowInstance(instanceId: string, instanceName: string): InstanceItem {
  return {
    id: instanceId,
    name: instanceName || "Build logs",
    version: "",
    loader: "",
    status: "READY",
    ram: 0,
    javaArgs: null,
    javaPath: null,
    windowWidth: null,
    windowHeight: null,
    fullscreen: false,
    lastPlayed: "0",
    playtimeSecs: 0,
    createdAt: "0",
    gameDir: "",
  };
}

function consumeStoredPayload(payloadKey: string): StoredLogWindowPayload | null {
  const raw = window.localStorage.getItem(payloadKey);
  if (!raw) return null;
  window.localStorage.removeItem(payloadKey);

  try {
    return JSON.parse(raw) as StoredLogWindowPayload;
  } catch {
    return null;
  }
}

export function BuildLogsWindowApp({ instanceId, payloadKey }: BuildLogsWindowRoute) {
  useAppearance();
  const [instance, setInstance] = useState<InstanceItem | null>(null);
  const [initialLog, setInitialLog] = useState<LaunchLogSnapshot | MinecraftExitPayload | null>(
    null,
  );

  useEffect(() => {
    const windowHandle = getCurrentWindow();
    let alive = true;

    const loadPayload = async (nextPayloadKey: string) => {
      const stored = consumeStoredPayload(nextPayloadKey);
      const resolvedInstanceId = stored?.instanceId || instanceId;

      if (stored?.initialLog) {
        if (!alive) return;
        setInitialLog(stored.initialLog);
        setInstance(
          createLogWindowInstance(stored.initialLog.instanceId, stored.initialLog.instanceName),
        );
        return;
      }

      try {
        const latest = await invoke<LaunchLogSnapshot>("read_instance_launch_log", {
          instanceId: resolvedInstanceId,
        });
        if (!alive) return;
        setInitialLog(latest);
        setInstance(createLogWindowInstance(latest.instanceId, latest.instanceName));
      } catch (error) {
        if (!alive) return;
        setInitialLog({
          instanceId: resolvedInstanceId,
          instanceName: "Build logs",
          logPath: null,
          minecraftLogPath: null,
          crashReportPath: null,
          logTail: toErrorMessage(error),
          crashReportTail: null,
          hint: null,
        });
        setInstance(createLogWindowInstance(resolvedInstanceId, "Build logs"));
      }
    };

    void loadPayload(payloadKey);
    const unlisten = windowHandle.listen<{ payloadKey: string }>(
      LOG_WINDOW_REFRESH_EVENT,
      (event) => void loadPayload(event.payload.payloadKey),
    );

    return () => {
      alive = false;
      void unlisten.then((dispose) => dispose());
    };
  }, [instanceId, payloadKey]);

  if (!instance) {
    return (
      <div className="build-logs-window-root">
        <div className="build-logs-modal build-logs-modal--standalone">
          <div className="build-logs-empty">LOADING LOGS...</div>
        </div>
      </div>
    );
  }

  return (
    <BuildLogsModal
      instance={instance}
      initialLog={initialLog}
      standalone
      onClose={() => void getCurrentWindow().close()}
    />
  );
}
