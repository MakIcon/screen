import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportInstanceResult, InstanceExportData, InstanceItem } from "../types";
import type { ImportProgress } from "../utils/instanceTransfer";

const runtime = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as (() => void)[],
  invoke: vi.fn(),
  listen: vi.fn(),
  logError: vi.fn(),
  listeners: new Set<(event: { payload: ImportProgress }) => void>(),
}));
vi.mock("react", () => ({
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
  useEffect: (effect: () => (() => void) | undefined) => {
    const index = runtime.cursor++;
    if (runtime.slots[index]) return;
    runtime.slots[index] = {};
    runtime.effects.push(() => {
      runtime.slots[index].cleanup = effect();
    });
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: runtime.invoke, isTauri: () => false }));
vi.mock("@tauri-apps/api/event", () => ({ listen: runtime.listen }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("../utils/logger", () => ({ logger: { error: runtime.logError } }));

import { IMPORT_COMPLETION_HOLD_MS, useInstanceTransfers } from "./useInstanceTransfers";
import { completedImportProgress } from "../utils/instanceTransfer";

const data: InstanceExportData = {
  schemaVersion: 2,
  name: "Pack",
  version: "1.21.1",
  loader: "Fabric",
  ram: 4,
  mods: [
    { source: "modrinth", projectId: "one", title: "First mod" },
    { source: "modrinth", projectId: "two", title: "Second mod" },
  ],
  shaders: [],
  resourcePacks: [],
};
const instance = { id: "imported-pack", name: "Pack" } as InstanceItem;
const result: ImportInstanceResult = {
  instance,
  items: data.mods.map((item) => ({ category: "mods", item, success: true, message: "Installed" })),
};
const refreshInstances = vi.fn(async (_id?: string) => {});
const pushToast = vi.fn(() => 1);
function RenderTransferHookHarness() {
  runtime.cursor = 0;
  const hook = useInstanceTransfers({ defaultRamGb: 4, refreshInstances, pushToast });
  for (const effect of runtime.effects.splice(0)) effect();
  return hook;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
async function prepare(format: "mrpack" | "slbuild") {
  await RenderTransferHookHarness().importBuildFromPath(`C:\\packs\\test.${format}`);
  return RenderTransferHookHarness();
}
function emitProgress(payload: ImportProgress) {
  for (const listener of runtime.listeners) listener({ payload });
}
function operationId() {
  return runtime.invoke.mock.calls.find(
    ([command]) => command === "import_mrpack" || command === "import_instance",
  )![1].operationId as string;
}

describe("build import completion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    runtime.slots = [];
    runtime.effects = [];
    runtime.listeners.clear();
    runtime.invoke.mockReset();
    runtime.listen.mockReset();
    runtime.logError.mockReset();
    refreshInstances.mockReset().mockResolvedValue(undefined);
    pushToast.mockClear();
    runtime.listen.mockImplementation(async (_event, listener) => {
      runtime.listeners.add(listener);
      return () => runtime.listeners.delete(listener);
    });
    runtime.invoke.mockImplementation(async (command) => {
      if (command === "inspect_mrpack" || command === "read_slbuild_file") return data;
      if (command === "import_mrpack") return instance;
      if (command === "import_instance") return result;
      return null;
    });
  });
  afterEach(() => {
    for (const slot of runtime.slots) slot?.cleanup?.();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders MRPACK completion before closing, even without a final IPC event", async () => {
    const pending = deferred<InstanceItem>();
    const hook = await prepare("mrpack");
    runtime.invoke.mockImplementation((command) =>
      command === "import_mrpack" ? pending.promise : Promise.resolve(null),
    );
    const importing = hook.handleImportConfirm();
    await flush();
    const id = operationId();
    emitProgress({
      operationId: id,
      stage: "downloading",
      processed: 9,
      total: 10,
      filename: "last.jar",
    });
    pending.resolve(instance);
    await flush();
    expect(RenderTransferHookHarness()).toMatchObject({
      importModalOpen: true,
      importWorking: true,
      importProgress: { stage: "complete", processed: 10, total: 10 },
    });
    emitProgress({
      operationId: id,
      stage: "extracting",
      processed: 8,
      total: 10,
      filename: "late.json",
    });
    expect(RenderTransferHookHarness().importProgress?.stage).toBe("complete");
    await vi.advanceTimersByTimeAsync(IMPORT_COMPLETION_HOLD_MS - 1);
    expect(RenderTransferHookHarness().importModalOpen).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await importing;
    expect(RenderTransferHookHarness()).toMatchObject({
      importModalOpen: false,
      importWorking: false,
      importProgress: null,
    });
    expect(refreshInstances).toHaveBeenCalledWith(instance.id);
    expect(pushToast).toHaveBeenCalledWith("info", expect.any(String), expect.any(Object));
  });

  it("closes SLBUILD automatically without exposing a result dialog", async () => {
    const hook = await prepare("slbuild");
    const importing = hook.handleImportConfirm();
    await flush();
    expect(RenderTransferHookHarness().importProgress).toMatchObject({
      stage: "complete",
      processed: 2,
      total: 2,
    });
    await vi.advanceTimersByTimeAsync(IMPORT_COMPLETION_HOLD_MS);
    await importing;
    const complete = RenderTransferHookHarness();
    expect(complete.importModalOpen).toBe(false);
    expect(complete).not.toHaveProperty("importResult");
    expect(complete.importData).toBeNull();
  });

  it("reports partial SLBUILD failures in a notification without a results menu", async () => {
    const hook = await prepare("slbuild");
    runtime.invoke.mockResolvedValue({
      ...result,
      items: [{ ...result.items[0], success: false }],
    });
    const importing = hook.handleImportConfirm();
    await flush();
    await vi.advanceTimersByTimeAsync(IMPORT_COMPLETION_HOLD_MS);
    await importing;
    expect(RenderTransferHookHarness().importModalOpen).toBe(false);
    expect(pushToast).toHaveBeenCalledWith("warning", expect.any(String), expect.any(Object));
  });

  it("does not show completion after cancellation or a failed import", async () => {
    for (const code of ["cancelled", "download_failed"]) {
      const hook = await prepare("mrpack");
      runtime.invoke.mockRejectedValueOnce({ code, detail: "Import stopped" });
      await hook.handleImportConfirm();
      expect(RenderTransferHookHarness()).toMatchObject({
        importModalOpen: true,
        importWorking: false,
        importProgress: null,
      });
      expect(RenderTransferHookHarness().importError).not.toBe("");
    }
  });

  it("waits for progress subscription before starting a fast import", async () => {
    const ready = deferred<() => void>();
    runtime.listen.mockReturnValueOnce(ready.promise);
    const hook = await prepare("mrpack");
    const importing = hook.handleImportConfirm();
    await flush();
    expect(runtime.invoke.mock.calls.some(([command]) => command === "import_mrpack")).toBe(false);
    ready.resolve(() => {});
    await flush();
    expect(runtime.invoke.mock.calls.some(([command]) => command === "import_mrpack")).toBe(true);
    await vi.advanceTimersByTimeAsync(IMPORT_COMPLETION_HOLD_MS);
    await importing;
  });

  it("does not create two builds for duplicate confirmation clicks", async () => {
    const hook = await prepare("slbuild");
    const importing = hook.handleImportConfirm();
    await hook.handleImportConfirm();
    await flush();
    expect(
      runtime.invoke.mock.calls.filter(([command]) => command === "import_instance"),
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(IMPORT_COMPLETION_HOLD_MS);
    await importing;
  });

  it("does not offer to recreate a committed build when refreshing the list fails", async () => {
    const hook = await prepare("slbuild");
    refreshInstances.mockRejectedValueOnce(new Error("List refresh failed"));
    const importing = hook.handleImportConfirm();
    await flush();
    await vi.advanceTimersByTimeAsync(IMPORT_COMPLETION_HOLD_MS);
    await importing;
    expect(RenderTransferHookHarness()).toMatchObject({ importModalOpen: false, importError: "" });
    expect(runtime.logError).toHaveBeenCalled();
  });
});

describe("completed import counters", () => {
  it("handles empty packs and ignores progress from previous imports", () => {
    expect(completedImportProgress("empty", null, 0)).toMatchObject({ processed: 1, total: 1 });
    expect(
      completedImportProgress(
        "new",
        { operationId: "old", stage: "downloading", processed: 99, total: 100, filename: "" },
        2,
      ),
    ).toMatchObject({ processed: 2, total: 2 });
  });
});
