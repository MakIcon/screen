import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InstanceItem,
  ModDownloadProgressPayload,
  ModrinthProject,
  ModrinthSearchResponse,
} from "../types";
import type { ModrinthContentKind } from "./useModrinthContent";

// Exercise the hook's async handlers without a browser or a new DOM dependency.
// State/ref slots persist across renders; effects run when their dependencies change.
const runtime = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  pending: [] as (() => void)[],
  invoke: vi.fn(),
  progressListeners: new Set<(event: { payload: ModDownloadProgressPayload }) => void>(),
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
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (_name: string, listener: (event: { payload: ModDownloadProgressPayload }) => void) => {
      runtime.progressListeners.add(listener);
      return () => runtime.progressListeners.delete(listener);
    },
  ),
}));

import { useModrinthContent } from "./useModrinthContent";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function page(id: string): ModrinthSearchResponse {
  return {
    hits: [{ projectId: id, title: id } as ModrinthProject],
    totalHits: 100,
  } as ModrinthSearchResponse;
}
const build = { id: "one", version: "1.21.1", loader: "Fabric" } as InstanceItem;
const callbacks = { setActionError: vi.fn(), setBusyMessage: vi.fn(), pushToast: vi.fn() };
function RenderHookHarness(
  target: InstanceItem | null = build,
  kind: ModrinthContentKind = "resourcepacks",
) {
  runtime.cursor = 0;
  const controller = useModrinthContent({
    kind,
    activeTab: kind,
    target,
    ...callbacks,
  });
  for (const effect of runtime.pending.splice(0)) effect();
  return controller;
}
async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

describe("Modrinth asynchronous results", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    runtime.slots = [];
    runtime.pending = [];
    runtime.invoke.mockReset();
    runtime.progressListeners.clear();
    runtime.invoke.mockImplementation(async (command: string) => {
      if (command.startsWith("list_")) return [];
      if (command.startsWith("search_")) return page("initial");
      return { ok: true, message: "installed" };
    });
  });
  afterEach(() => {
    for (const slot of runtime.slots) slot?.cleanup?.();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not append a page from the previous query", async () => {
    RenderHookHarness();
    await vi.advanceTimersByTimeAsync(180);
    const previousPage = deferred<ModrinthSearchResponse>();
    runtime.invoke.mockImplementation(
      (command: string, args: { query?: string; offset?: number }) => {
        if (command.startsWith("list_")) return Promise.resolve([]);
        return args.offset ? previousPage.promise : Promise.resolve(page(args.query || "initial"));
      },
    );
    let controller = RenderHookHarness();
    const pending = controller.loadMore();
    controller.setSearch("new-query");
    RenderHookHarness();
    await vi.advanceTimersByTimeAsync(180);
    previousPage.resolve(page("old-page"));
    await pending;
    controller = RenderHookHarness();
    expect(controller.items.map((item) => item.projectId)).toEqual(["new-query"]);
    expect(controller.loadingMore).toBe(false);
  });

  it("ignores page failures from a previously selected build", async () => {
    RenderHookHarness();
    await vi.advanceTimersByTimeAsync(180);
    const previousPage = deferred<ModrinthSearchResponse>();
    runtime.invoke.mockImplementation(
      (command: string, args: { instanceId?: string; offset?: number }) => {
        if (command.startsWith("list_")) return Promise.resolve([]);
        return args.offset
          ? previousPage.promise
          : Promise.resolve(page(args.instanceId || "none"));
      },
    );
    const pending = RenderHookHarness().loadMore();
    const second = { ...build, id: "two" };
    RenderHookHarness(second);
    await vi.advanceTimersByTimeAsync(180);
    previousPage.reject(new Error("old-build-error"));
    await pending;
    const controller = RenderHookHarness(second);
    expect(controller.items[0].projectId).toBe("two");
    expect(controller.error).toBe("");
    expect(controller.loading).toBe(false);
  });

  it("does not refresh the old build when an install completes after switching targets", async () => {
    RenderHookHarness();
    await vi.advanceTimersByTimeAsync(180);
    const installation = deferred<{ ok: boolean; message: string }>();
    runtime.invoke.mockImplementation((command: string, args: { instanceId?: string }) => {
      if (command.startsWith("list_")) return Promise.resolve([]);
      if (command.startsWith("install_")) return installation.promise;
      return Promise.resolve(page(args.instanceId || "none"));
    });
    const pending = RenderHookHarness().install("initial");
    const second = { ...build, id: "two" };
    RenderHookHarness(second);
    await vi.advanceTimersByTimeAsync(180);
    const calls = runtime.invoke.mock.calls.length;
    installation.resolve({ ok: true, message: "installed" });
    await pending;
    expect(runtime.invoke.mock.calls).toHaveLength(calls);
    expect(RenderHookHarness(second).items[0].projectId).toBe("two");
  });

  it("keeps a refreshed installed list when the initial request arrives later", async () => {
    const initialInstalled = deferred<unknown[]>();
    let listCalls = 0;
    runtime.invoke.mockImplementation((command: string) => {
      if (command.startsWith("list_")) {
        listCalls += 1;
        return listCalls === 1
          ? initialInstalled.promise
          : Promise.resolve([{ projectId: "new-install" }]);
      }
      if (command.startsWith("search_")) return Promise.resolve(page("initial"));
      return Promise.resolve({ ok: true, message: "installed" });
    });
    RenderHookHarness();
    await vi.advanceTimersByTimeAsync(180);
    await RenderHookHarness().install("initial");
    initialInstalled.resolve([{ projectId: "stale" }]);
    await flush();
    const controller = RenderHookHarness();
    expect(controller.installedItems.map((item) => item.projectId)).toEqual(["new-install"]);
    expect(controller.installedLoading).toBe(false);
  });

  it.each<ModrinthContentKind>(["mods", "resourcepacks", "shaders"])(
    "tracks the active %s download, supports pause/resume/cancel, and ignores unrelated events",
    async (kind) => {
      RenderHookHarness(build, kind);
      await vi.advanceTimersByTimeAsync(180);
      const installation = deferred<{ ok: boolean; message: string }>();
      runtime.invoke.mockImplementation((command: string) => {
        if (command.startsWith("install_")) return installation.promise;
        if (command.startsWith("list_")) return Promise.resolve([]);
        if (command.startsWith("search_")) return Promise.resolve(page("initial"));
        return Promise.resolve();
      });
      const pending = RenderHookHarness(build, kind).install("initial");
      const progress: ModDownloadProgressPayload = {
        instanceId: build.id,
        projectId: "initial",
        filename: "download.zip",
        receivedBytes: 42,
        totalBytes: 100,
        percent: 42,
        state: "downloading",
      };
      const emit = (payload: ModDownloadProgressPayload) => {
        for (const listener of runtime.progressListeners) listener({ payload });
      };
      emit({ ...progress, instanceId: "other-build" });
      emit({ ...progress, projectId: "other-project" });
      expect(RenderHookHarness(build, kind).downloadProgress?.percent).toBe(0);
      emit(progress);
      expect(RenderHookHarness(build, kind).downloadProgress?.percent).toBe(42);

      await RenderHookHarness(build, kind).setDownloadPaused(true);
      expect(runtime.invoke).toHaveBeenCalledWith("set_modrinth_download_paused", {
        instanceId: build.id,
        projectId: "initial",
        paused: true,
      });
      expect(RenderHookHarness(build, kind).downloadProgress?.state).toBe("paused");
      await RenderHookHarness(build, kind).setDownloadPaused(false);
      expect(RenderHookHarness(build, kind).downloadProgress?.state).toBe("downloading");
      await RenderHookHarness(build, kind).cancelDownload();
      expect(runtime.invoke).toHaveBeenCalledWith("cancel_modrinth_download", {
        instanceId: build.id,
        projectId: "initial",
      });
      expect(RenderHookHarness(build, kind).downloadProgress?.state).toBe("cancelled");

      installation.reject(
        Object.assign(new Error("MOD_DOWNLOAD_CANCELLED"), { code: "cancelled" }),
      );
      await pending;
      emit(progress);
      const controller = RenderHookHarness(build, kind);
      expect(controller.downloadProgress).toBeNull();
      expect(controller.busyProjectId).toBeNull();
    },
  );
});
