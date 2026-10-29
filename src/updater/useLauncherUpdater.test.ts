import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";

const runtime = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as (() => void)[],
  check: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState(initial: unknown) {
    const index = runtime.cursor++;
    runtime.slots[index] ??= { value: initial };
    return [runtime.slots[index].value, (value: unknown) => (runtime.slots[index].value = value)];
  },
  useRef(initial: unknown) {
    const index = runtime.cursor++;
    runtime.slots[index] ??= { current: initial };
    return runtime.slots[index];
  },
  useCallback(callback: unknown, dependencies: unknown[]) {
    const index = runtime.cursor++;
    const previous = runtime.slots[index];
    if (
      !previous ||
      dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))
    ) {
      runtime.slots[index] = { callback, dependencies };
    }
    return runtime.slots[index].callback;
  },
  useEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
    const index = runtime.cursor++;
    const previous = runtime.slots[index];
    if (
      !previous ||
      dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))
    ) {
      runtime.effects.push(() => {
        previous?.cleanup?.();
        runtime.slots[index] = { dependencies, cleanup: effect() };
      });
    }
  },
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: runtime.check }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: runtime.invoke }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn(async () => "0.2.1") }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

import { useLauncherUpdater } from "./useLauncherUpdater";

function RenderHarness(ready = false, deferPresentation = false) {
  runtime.cursor = 0;
  const updater = useLauncherUpdater({
    ready,
    deferAutomatic: false,
    deferPresentation,
    proxy: null,
  });
  for (const effect of runtime.effects.splice(0)) effect();
  return updater;
}

function release(version = "0.3.0") {
  return {
    currentVersion: "0.2.1",
    version,
    date: "2026-10-23T12:00:00Z",
    body: "## Changes\n- Faster startup",
    rawJson: {},
    close: vi.fn(async () => {}),
    download: vi.fn(),
    install: vi.fn(),
  } as unknown as Update;
}

describe("launcher update notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval, clearInterval });
    runtime.slots = [];
    runtime.effects = [];
    runtime.check.mockReset();
    runtime.invoke.mockReset().mockResolvedValue([]);
  });
  afterEach(() => {
    for (const slot of runtime.slots) slot?.cleanup?.();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("checks on startup and publishes a notice without opening or installing an update", async () => {
    const update = release();
    runtime.check.mockResolvedValue(update);
    RenderHarness(true);
    await vi.advanceTimersByTimeAsync(0);
    let updater = RenderHarness(true);
    expect(updater.availableUpdate).toMatchObject({
      version: "0.3.0",
      notes: update.body,
      releaseUrl: "https://github.com/MakIcon/screen/releases/tag/v0.3.0",
    });
    expect(updater.overlayState).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    updater = RenderHarness(true);
    expect(updater.availableUpdate?.version).toBe("0.3.0");
    expect(updater.overlayState).toBeNull();
    expect(update.download).not.toHaveBeenCalled();
    expect(update.install).not.toHaveBeenCalled();
    expect(update.close).toHaveBeenCalledOnce();
  });

  it("refreshes a pending notification when a newer release is published", async () => {
    runtime.check.mockResolvedValueOnce(release()).mockResolvedValueOnce(release("0.3.1"));
    RenderHarness(true);
    await vi.advanceTimersByTimeAsync(0);
    RenderHarness(true);
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
    expect(RenderHarness(true).availableUpdate?.version).toBe("0.3.1");
    expect(runtime.check).toHaveBeenCalledTimes(2);
  });

  it.each(["completed", "skipped"])("queues a startup notice until the guide is %s", async () => {
    const update = release();
    runtime.check.mockResolvedValue(update);
    RenderHarness(true, true);
    await vi.advanceTimersByTimeAsync(0);
    let updater = RenderHarness(true, true);
    expect(updater.availableUpdate).toBeNull();
    expect(updater.overlayState).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    updater = RenderHarness(true, true);
    expect(updater.availableUpdate).toBeNull();
    expect(update.download).not.toHaveBeenCalled();
    expect(update.install).not.toHaveBeenCalled();

    updater = RenderHarness(true, false);
    expect(updater.availableUpdate?.version).toBe("0.3.0");
    expect(updater.overlayState).toBeNull();
    expect(runtime.check).toHaveBeenCalledTimes(1);
  });

  it("queues an in-flight installation prompt while the guide is pending", async () => {
    const update = release();
    runtime.check.mockResolvedValueOnce(null);
    RenderHarness(true);
    await vi.advanceTimersByTimeAsync(0);
    RenderHarness(true);
    let resolveCheck!: (update: Update) => void;
    runtime.check.mockReturnValue(
      new Promise<Update>((resolve) => {
        resolveCheck = resolve;
      }),
    );
    const pendingCheck = RenderHarness(true).checkForUpdates({ manual: true });
    RenderHarness(true, true);
    resolveCheck(update);
    await pendingCheck;
    let updater = RenderHarness(true, true);
    expect(updater.availableUpdate).toBeNull();
    expect(updater.overlayState).toBeNull();

    await updater.startUpdate();
    await vi.advanceTimersByTimeAsync(10_000);
    updater = RenderHarness(true, true);
    expect(updater.overlayState).toBeNull();
    expect(update.download).not.toHaveBeenCalled();
    expect(update.install).not.toHaveBeenCalled();
    expect(update.close).not.toHaveBeenCalled();

    // With backend operations confirmed idle, the held prompt becomes visible
    // after onboarding. Its countdown starts only when it is on screen.
    RenderHarness(true, false);
    await vi.advanceTimersByTimeAsync(0);
    updater = RenderHarness(true, false);
    expect(updater.availableUpdate?.version).toBe("0.3.0");
    expect(updater.overlayState).toMatchObject({ stage: "available", autoStart: true });
    expect(update.download).not.toHaveBeenCalled();
  });

  it("holds an existing update prompt when the guide is replayed", async () => {
    runtime.check.mockResolvedValue(release());
    await RenderHarness().checkForUpdates({ manual: true });
    expect(RenderHarness().overlayState?.stage).toBe("available");
    expect(RenderHarness(false, true).overlayState).toBeNull();
    expect(RenderHarness(false, true).availableUpdate).toBeNull();
    expect(RenderHarness().overlayState?.stage).toBe("available");
    expect(runtime.check).toHaveBeenCalledTimes(1);
  });

  it("keeps the release notification when an explicit installation prompt is dismissed", async () => {
    runtime.check.mockResolvedValue(release());
    await RenderHarness().checkForUpdates({ manual: true });
    expect(RenderHarness().overlayState?.stage).toBe("available");
    RenderHarness().dismiss();
    const updater = RenderHarness();
    expect(updater.overlayState).toBeNull();
    expect(updater.availableUpdate?.version).toBe("0.3.0");
  });

  it("retains a known release if a subsequent check fails", async () => {
    runtime.check.mockResolvedValueOnce(release()).mockRejectedValueOnce(new Error("timeout"));
    await RenderHarness().checkForUpdates({ manual: false });
    expect(await RenderHarness().checkForUpdates({ manual: false })).toMatchObject({
      status: "error",
    });
    expect(RenderHarness().availableUpdate?.version).toBe("0.3.0");
  });

  it("hides the notification when the server confirms there is no newer version", async () => {
    runtime.check.mockResolvedValueOnce(release()).mockResolvedValueOnce(null);
    await RenderHarness().checkForUpdates({ manual: false });
    expect(await RenderHarness().checkForUpdates({ manual: false })).toEqual({
      status: "up-to-date",
    });
    expect(RenderHarness().availableUpdate).toBeNull();
  });
});
