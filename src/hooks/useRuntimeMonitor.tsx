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
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MineflayerBotStatus, RuntimeMonitorActivity, RuntimeMonitorSnapshot } from "../types";
import { toErrorMessage } from "../utils/errors";

const STATUS_EVENT = "mineflayer-bot-status";
const RECONCILE_INTERVAL_MS = 30_000;
const ACTIVITY_INTERVAL_MS = 2_000;

// IPC deserializes fresh objects even when no status has changed. Keep the
// snapshot reference in that case so polling does not rerender the launcher.
function sameRuntimeValue(current: unknown, next: unknown): boolean {
  if (Object.is(current, next)) return true;
  if (!current || !next || typeof current !== "object" || typeof next !== "object") return false;
  if (Array.isArray(current) !== Array.isArray(next)) return false;
  const previous = current as Record<string, unknown>;
  const incoming = next as Record<string, unknown>;
  const keys = Object.keys(incoming);
  return (
    Object.keys(previous).length === keys.length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(previous, key) &&
        sameRuntimeValue(previous[key], incoming[key]),
    )
  );
}

export type RuntimeMonitorController = {
  snapshot: RuntimeMonitorSnapshot | null;
  error: string;
  refresh: () => Promise<RuntimeMonitorSnapshot | null>;
};

const RuntimeMonitorContext = createContext<RuntimeMonitorController | null>(null);

export function useRuntimeMonitorController(
  pids: number[],
  enabled: boolean,
  pollActivity: boolean = enabled,
) {
  const [snapshot, setSnapshot] = useState<RuntimeMonitorSnapshot | null>(null);
  const [error, setError] = useState("");
  const pidsRef = useRef(pids);
  const requestInFlightRef = useRef(false);
  const botStatusRef = useRef<MineflayerBotStatus | null>(null);
  const mountedRef = useRef(true);
  const [eventsAvailable, setEventsAvailable] = useState<boolean | null>(null);

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
      if (!mountedRef.current) return null;
      // A worker event may have arrived while the full snapshot was in flight.
      const latest = botStatusRef.current;
      const mineflayerBot =
        latest && latest.revision > next.mineflayerBot.revision ? latest : next.mineflayerBot;
      botStatusRef.current = mineflayerBot;
      const merged = { ...next, mineflayerBot };
      setSnapshot((current) => (sameRuntimeValue(current, merged) ? current : merged));
      setError("");
      return merged;
    } catch (caught) {
      if (mountedRef.current) setError(toErrorMessage(caught));
      return null;
    } finally {
      requestInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<MineflayerBotStatus>(STATUS_EVENT, ({ payload }) => {
      if (disposed) return;
      const latest = botStatusRef.current;
      if (latest && payload.revision <= latest.revision) return;
      botStatusRef.current = payload;
      setSnapshot((current) => (current ? { ...current, mineflayerBot: payload } : current));
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
        setEventsAvailable(true);
      })
      .catch(() => {
        if (disposed) return;
        setEventsAvailable(false);
      });
    return () => {
      disposed = true;
      mountedRef.current = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (eventsAvailable === null) return;
    // Read only after subscribing so startup changes cannot fall into a gap.
    void refresh();
    if (!enabled) return;
    const timer = window.setInterval(
      () => void refresh(),
      eventsAvailable ? RECONCILE_INTERVAL_MS : ACTIVITY_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [enabled, eventsAvailable, refresh]);

  useEffect(() => {
    if (!enabled || !pollActivity || !eventsAvailable) return;
    // Game exits and OBS still need their normal cadence, without retransmitting
    // the bot's inventory/logs or rechecking extension files every two seconds.
    const timer = window.setInterval(async () => {
      if (requestInFlightRef.current) return;
      requestInFlightRef.current = true;
      try {
        const activity = await invoke<RuntimeMonitorActivity>("get_runtime_monitor_activity", {
          pids: pidsRef.current,
        });
        if (!mountedRef.current) return;
        setSnapshot((current) => {
          if (!current) return current;
          const changed = Object.entries(activity).some(
            ([key, value]) =>
              !sameRuntimeValue(current[key as keyof RuntimeMonitorActivity], value),
          );
          return changed ? { ...current, ...activity } : current;
        });
        setError("");
      } catch (caught) {
        if (mountedRef.current) setError(toErrorMessage(caught));
      } finally {
        requestInFlightRef.current = false;
      }
    }, ACTIVITY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, eventsAvailable, pollActivity]);

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
