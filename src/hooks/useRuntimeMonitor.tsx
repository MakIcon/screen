import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RuntimeMonitorSnapshot } from "../types";
import { toErrorMessage } from "../utils/errors";

const MONITOR_INTERVAL_MS = 2_000;

export type RuntimeMonitorController = {
  snapshot: RuntimeMonitorSnapshot | null;
  error: string;
  refresh: () => Promise<RuntimeMonitorSnapshot | null>;
};

const RuntimeMonitorContext = createContext<RuntimeMonitorController | null>(null);

export function useRuntimeMonitorController(pids: number[], enabled: boolean) {
  const [snapshot, setSnapshot] = useState<RuntimeMonitorSnapshot | null>(null);
  const [error, setError] = useState("");
  const pidsRef = useRef(pids);
  const requestInFlightRef = useRef(false);

  useEffect(() => {
    pidsRef.current = pids;
  }, [pids]);

  const refresh = useCallback(async () => {
    if (requestInFlightRef.current) return null;
    requestInFlightRef.current = true;
    try {
      const next = await invoke<RuntimeMonitorSnapshot>("get_runtime_monitor_snapshot", {
        pids: pidsRef.current,
      });
      setSnapshot(next);
      setError("");
      return next;
    } catch (caught) {
      setError(toErrorMessage(caught));
      return null;
    } finally {
      requestInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!enabled) return;
    const timer = window.setInterval(() => void refresh(), MONITOR_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return useMemo<RuntimeMonitorController>(
    () => ({ snapshot, error, refresh }),
    [error, refresh, snapshot],
  );
}

export function RuntimeMonitorScope({
  controller,
  children,
}: {
  controller: RuntimeMonitorController;
  children: ReactNode;
}) {
  return (
    <RuntimeMonitorContext.Provider value={controller}>{children}</RuntimeMonitorContext.Provider>
  );
}

export function useRuntimeMonitor() {
  const controller = useContext(RuntimeMonitorContext);
  if (!controller) {
    throw new Error("useRuntimeMonitor must be used inside RuntimeMonitorScope");
  }
  return controller;
}
