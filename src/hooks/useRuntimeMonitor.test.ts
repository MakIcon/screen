import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MineflayerBotStatus, RuntimeMonitorSnapshot } from "../types";

// Keep the async hook tests independent of a DOM runtime, as in useModrinthContent.test.ts.
const runtime = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  pending: [] as (() => void)[],
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  listener: undefined as ((event: { payload: MineflayerBotStatus }) => void) | undefined,
}));

function memo(factory: () => unknown, dependencies: unknown[]) {
  const index = runtime.cursor++;
  const previous = runtime.slots[index];
  if (
    !previous ||
    dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))
  ) {
    runtime.slots[index] = { dependencies, value: factory() };
  }
  return runtime.slots[index].value;
}

vi.mock("react", () => ({
  createContext: () => ({}),
  useContext: () => null,
  useState: (initial: unknown) => {
    const index = runtime.cursor++;
    runtime.slots[index] ??= { value: initial };
    return [
      runtime.slots[index].value,
      (next: any) => {
        runtime.slots[index].value =
          typeof next === "function" ? next(runtime.slots[index].value) : next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = runtime.cursor++;
    runtime.slots[index] ??= { current: initial };
    return runtime.slots[index];
  },
  useMemo: (factory: () => unknown, dependencies: unknown[]) => memo(factory, dependencies),
  useCallback: (callback: unknown, dependencies: unknown[]) => memo(() => callback, dependencies),
  useEffect: (effect: () => (() => void) | undefined, dependencies: unknown[]) => {
    const index = runtime.cursor++;
    const previous = runtime.slots[index];
    if (
      !previous ||
      dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))
    ) {
      runtime.pending.push(() => {
        previous?.cleanup?.();
        runtime.slots[index] = { dependencies, cleanup: effect() };
      });
    }
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: runtime.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: runtime.listen }));

import { useRuntimeMonitorController } from "./useRuntimeMonitor";

function bot(revision = 1): MineflayerBotStatus {
  return {
    revision,
    running: true,
    state: "connected",
    logs: [],
    inventory: null,
    gathering: null,
  };
}

function snapshot(revision = 1): RuntimeMonitorSnapshot {
  return {
    mineflayerBot: bot(revision),
    blueMap: { running: false, state: "idle", url: "", logs: [] },
    obsTelemetry: {
      running: false,
      state: "idle",
      port: 18991,
      overlayUrl: "",
      overlayUrls: {},
      jsonUrl: "",
      logs: [],
    },
    processes: [],
    optionalExtensions: [],
  };
}

function RenderHookHarness(pids: number[] = [], enabled = true, pollActivity = false) {
  runtime.cursor = 0;
  const controller = useRuntimeMonitorController(pids, enabled, pollActivity);
  for (const effect of runtime.pending.splice(0)) effect();
  return controller;
}

function unmount() {
  for (const slot of runtime.slots) slot?.cleanup?.();
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function start(pids: number[] = [], enabled = true, pollActivity = false) {
  RenderHookHarness(pids, enabled, pollActivity);
  await flush();
  RenderHookHarness(pids, enabled, pollActivity);
  await flush();
  return RenderHookHarness(pids, enabled, pollActivity);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function emit(status: MineflayerBotStatus) {
  runtime.listener?.({ payload: status });
}

describe("runtime monitor events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setInterval, clearInterval });
    runtime.slots = [];
    runtime.cursor = 0;
    runtime.pending = [];
    runtime.listener = undefined;
    runtime.invoke.mockReset();
    runtime.listen.mockReset();
    runtime.unlisten.mockReset();
    runtime.invoke.mockResolvedValue(snapshot());
    runtime.listen.mockImplementation(async (_name, callback) => {
      runtime.listener = callback;
      return runtime.unlisten;
    });
  });

  afterEach(() => {
    unmount();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("subscribes before the initial read and immediately applies inventory, work and stop events", async () => {
    await start();
    expect(runtime.listen).toHaveBeenCalledWith("mineflayer-bot-status", expect.any(Function));
    expect(runtime.listen.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.invoke.mock.invocationCallOrder[0],
    );
    const update = {
      ...bot(2),
      logs: ["Picked up diamond"],
      inventory: { ...({} as NonNullable<MineflayerBotStatus["inventory"]>), health: 18 },
      gathering: {
        phase: "dig",
        kind: "mine",
        mined: 3,
        collected: 1,
        delivered: 0,
        queued: 0,
        reason: "",
        message: "",
      },
    };
    emit(update);
    expect(RenderHookHarness().snapshot?.mineflayerBot).toBe(update);
    emit({ ...bot(3), running: false, state: "stopped" });
    expect(RenderHookHarness().snapshot?.mineflayerBot.state).toBe("stopped");
    expect(RenderHookHarness().snapshot?.mineflayerBot.inventory).toBeNull();
    expect(runtime.invoke).toHaveBeenCalledTimes(1);
  });

  it("reconciles every 30 seconds without two-second queries when only the bot is enabled", async () => {
    await start();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(runtime.invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.invoke).toHaveBeenCalledTimes(2);
    expect(
      runtime.invoke.mock.calls.every(([command]) => command === "get_runtime_monitor_snapshot"),
    ).toBe(true);
  });

  it("keeps game/OBS activity polling separate and uses the current process IDs", async () => {
    await start([10], true, true);
    const update = { ...bot(2), state: "reconnecting" };
    emit(update);
    RenderHookHarness([11], true, true);
    const activity = {
      blueMap: { ...snapshot().blueMap, state: "serving" },
      obsTelemetry: { ...snapshot().obsTelemetry, running: true },
      processes: [{ pid: 11, alive: false }],
    };
    runtime.invoke.mockResolvedValueOnce(activity);
    await vi.advanceTimersByTimeAsync(2_000);
    const current = RenderHookHarness([11], true, true).snapshot;
    expect(runtime.invoke).toHaveBeenLastCalledWith("get_runtime_monitor_activity", { pids: [11] });
    expect(current?.mineflayerBot).toBe(update);
    expect(current?.processes).toEqual(activity.processes);
    expect(current?.obsTelemetry.running).toBe(true);
    expect(current?.blueMap.state).toBe("serving");
  });

  it("does not rerender the launcher for unchanged two-second activity or full snapshots", async () => {
    const initial = await start([10], true, true);
    const unchanged = snapshot();
    runtime.invoke.mockResolvedValue({
      blueMap: unchanged.blueMap,
      obsTelemetry: unchanged.obsTelemetry,
      processes: unchanged.processes,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(RenderHookHarness([10], true, true)).toBe(initial);

    runtime.invoke.mockResolvedValue(snapshot());
    await initial.refresh();
    expect(RenderHookHarness([10], true, true)).toBe(initial);
  });

  it("still publishes nested telemetry changes when polling returns fresh objects", async () => {
    const initial = await start([], true, true);
    const changed = snapshot();
    changed.obsTelemetry.overlayUrls = { inventory: "http://localhost/inventory" };
    runtime.invoke.mockResolvedValue({
      blueMap: changed.blueMap,
      obsTelemetry: changed.obsTelemetry,
      processes: changed.processes,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    const next = RenderHookHarness([], true, true);
    expect(next).not.toBe(initial);
    expect(next.snapshot?.obsTelemetry.overlayUrls).toEqual(changed.obsTelemetry.overlayUrls);
  });

  it("does not overwrite a newer event with a full snapshot that was already in flight", async () => {
    const controller = await start();
    const pending = deferred<RuntimeMonitorSnapshot>();
    runtime.invoke.mockReturnValueOnce(pending.promise);
    const refreshing = controller.refresh();
    const update = { ...bot(4), state: "stopped", running: false };
    emit(update);
    pending.resolve(snapshot(2));
    expect((await refreshing)?.mineflayerBot).toBe(update);
    expect(RenderHookHarness().snapshot?.mineflayerBot).toBe(update);
  });

  it("preserves an event received before the first snapshot completes", async () => {
    const pending = deferred<RuntimeMonitorSnapshot>();
    runtime.invoke.mockReturnValueOnce(pending.promise);
    RenderHookHarness();
    await flush();
    RenderHookHarness();
    const update = { ...bot(7), logs: ["Ready"] };
    emit(update);
    pending.resolve(snapshot(5));
    await flush();
    expect(RenderHookHarness().snapshot?.mineflayerBot).toBe(update);
  });

  it("ignores duplicate and out-of-order events", async () => {
    await start();
    const update = { ...bot(4), state: "reconnecting" };
    emit(update);
    emit({ ...bot(3), state: "connected" });
    emit({ ...bot(4), state: "connected" });
    expect(RenderHookHarness().snapshot?.mineflayerBot).toBe(update);
  });

  it("falls back to the original polling cadence if event subscription fails", async () => {
    runtime.listen.mockRejectedValueOnce(new Error("Event bridge unavailable"));
    await start();
    runtime.invoke.mockResolvedValueOnce(snapshot(2));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(runtime.invoke).toHaveBeenCalledTimes(2);
    expect(RenderHookHarness().snapshot?.mineflayerBot.revision).toBe(2);
  });

  it("loads once when disabled, then stops timers while keeping the subscription", async () => {
    await start([], false);
    emit(bot(2));
    expect(RenderHookHarness([], false).snapshot?.mineflayerBot.revision).toBe(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runtime.invoke).toHaveBeenCalledTimes(1);
    RenderHookHarness([], true);
    await flush();
    RenderHookHarness([], false);
    await flush();
    const calls = runtime.invoke.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runtime.invoke).toHaveBeenCalledTimes(calls);
  });

  it("cleans up a subscription that finishes after unmount and ignores its events", async () => {
    const pending = deferred<() => void>();
    runtime.listen.mockReturnValueOnce(pending.promise);
    RenderHookHarness();
    const callback = runtime.listen.mock.calls[0][1];
    unmount();
    callback({ payload: bot(9) });
    pending.resolve(runtime.unlisten);
    await flush();
    expect(runtime.unlisten).toHaveBeenCalledTimes(1);
    expect(runtime.invoke).not.toHaveBeenCalled();
  });

  it("does not overlap activity requests with a pending reconciliation", async () => {
    const controller = await start([10], true, true);
    const pending = deferred<RuntimeMonitorSnapshot>();
    runtime.invoke.mockReturnValueOnce(pending.promise);
    const refreshing = controller.refresh();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(runtime.invoke).toHaveBeenCalledTimes(2);
    pending.resolve(snapshot(2));
    await refreshing;
    runtime.invoke.mockResolvedValueOnce({
      blueMap: snapshot().blueMap,
      obsTelemetry: snapshot().obsTelemetry,
      processes: [{ pid: 10, alive: true }],
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(runtime.invoke).toHaveBeenLastCalledWith("get_runtime_monitor_activity", { pids: [10] });
  });
});
