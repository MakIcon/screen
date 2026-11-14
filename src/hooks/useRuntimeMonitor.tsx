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
const FLEET_BATCH_MIN_MS = 200;
const FLEET_BATCH_PER_BOT_MS = 20;
const FLEET_BATCH_MAX_MS = 1_000;

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
  const fleetStatusRef = useRef(new Map<string, MineflayerBotStatus>());
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
      const mineflayerBots = next.mineflayerBots?.map((status) => {
        const latest = fleetStatusRef.current.get(status.botId ?? "default");
        return latest && latest.revision > status.revision ? latest : status;
      });
      if (mineflayerBots) {
        for (const [id, status] of fleetStatusRef.current) {
          if (!mineflayerBots.some((bot) => (bot.botId ?? "default") === id))
            mineflayerBots.push(status);
        }
        for (const status of mineflayerBots)
          fleetStatusRef.current.set(status.botId ?? "default", status);
      }
      const merged = { ...next, mineflayerBot, ...(mineflayerBots ? { mineflayerBots } : {}) };
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
    // A fleet reports progress from every bot several times a second. Each
    // snapshot rerenders the launcher, so progress is applied in one batch per
    // window; a bot that changes state (or is new) is shown at once.
    const pending = new Map<string, MineflayerBotStatus>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let appliedAt = 0;
    const apply = () => {
      timer = undefined;
      if (disposed || !pending.size) return;
      const updates = new Map(pending);
      pending.clear();
      appliedAt = Date.now();
      setSnapshot((current) => {
        if (!current) return current;
        const primary = updates.get("default");
        const secondary = [...updates.keys()].some((id) => id !== "default");
        const listed = current.mineflayerBots ?? (secondary ? [current.mineflayerBot] : undefined);
        return {
          ...current,
          ...(primary ? { mineflayerBot: primary } : {}),
          ...(listed
            ? {
                mineflayerBots: [
                  ...listed.filter((bot) => !updates.has(bot.botId ?? "default")),
                  ...updates.values(),
                ],
              }
            : {}),
        };
      });
    };
    void listen<MineflayerBotStatus>(STATUS_EVENT, ({ payload }) => {
      if (disposed) return;
      const id = payload.botId ?? "default";
      const latest = id === "default" ? botStatusRef.current : fleetStatusRef.current.get(id);
      if (latest && payload.revision <= latest.revision) return;
      if (id === "default") botStatusRef.current = payload;
      fleetStatusRef.current.set(id, payload);
      pending.set(id, payload);
      const batch = Math.min(
        FLEET_BATCH_MAX_MS,
        Math.max(FLEET_BATCH_MIN_MS, fleetStatusRef.current.size * FLEET_BATCH_PER_BOT_MS),
      );
      const urgent =
        !latest || latest.state !== payload.state || latest.running !== payload.running;
      const wait = appliedAt + batch - Date.now();
      if (urgent || wait <= 0) {
        if (timer !== undefined) clearTimeout(timer);
        apply();
      } else if (timer === undefined) timer = setTimeout(apply, wait);
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
      if (timer !== undefined) clearTimeout(timer);
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
