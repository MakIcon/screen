import { useCallback, useRef, useState } from "react";

/**
 * Tracks which instances are currently running (instance id → process id) plus
 * the bookkeeping needed to attribute playtime on exit and tell user-initiated
 * stops apart from crashes.
 */
export function useRunningInstances() {
  const [runningInstances, setRunningInstances] = useState<Map<string, number>>(new Map());
  // Wall-clock launch time per instance, consumed to record playtime on exit.
  const launchTimestamps = useRef<Map<string, number>>(new Map());
  // Keys ("id" or "id:pid") for stops the user asked for, so the exit handler
  // can skip the crash toast.
  const intentionalStops = useRef<Set<string>>(new Set());

  const isRunning = useCallback((id: string) => runningInstances.has(id), [runningInstances]);

  const addRunning = (id: string, pid: number) => {
    launchTimestamps.current.set(id, Math.floor(Date.now() / 1000));
    setRunningInstances((prev) => new Map(prev).set(id, pid));
  };

  const removeRunning = (id: string) =>
    setRunningInstances((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

  /** Returns the recorded launch timestamp (if any) and forgets it. */
  const takeLaunchTimestamp = (id: string) => {
    const timestamp = launchTimestamps.current.get(id);
    launchTimestamps.current.delete(id);
    return timestamp;
  };

  const markIntentionalStop = (key: string) => {
    intentionalStops.current.add(key);
  };
  const clearIntentionalStop = (key: string) => {
    intentionalStops.current.delete(key);
  };
  /** True if any of the given keys was a pending user-initiated stop. */
  const consumeIntentionalStop = (...keys: string[]) =>
    keys.reduce((hit, key) => intentionalStops.current.delete(key) || hit, false);

  return {
    runningInstances,
    isRunning,
    addRunning,
    removeRunning,
    takeLaunchTimestamp,
    markIntentionalStop,
    clearIntentionalStop,
    consumeIntentionalStop,
  };
}
