import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LauncherSettings } from "../types";

const runtime = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as (() => void)[],
  invoke: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = runtime.cursor++;
    runtime.slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
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
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i])))
      runtime.slots[index] = { callback, dependencies };
    return runtime.slots[index].callback;
  },
  useEffect(effect: () => void, dependencies: unknown[]) {
    const index = runtime.cursor++;
    const previous = runtime.slots[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      runtime.slots[index] = { dependencies };
      runtime.effects.push(effect);
    }
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: runtime.invoke }));
vi.mock("../utils/logger", () => ({ logger: { error: runtime.logError } }));

import { useAccounts } from "./useAccounts";

let storage: Map<string, string>;
function RenderHarness(settings: Partial<LauncherSettings> | null = null) {
  runtime.cursor = 0;
  const accounts = useAccounts(settings as LauncherSettings | null);
  for (const effect of runtime.effects.splice(0)) effect();
  return accounts;
}
function restart() {
  runtime.slots = [];
  runtime.effects = [];
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("offline player nickname persistence", () => {
  beforeEach(() => {
    restart();
    storage = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    runtime.invoke.mockReset().mockResolvedValue(undefined);
    runtime.logError.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("never saves the initial PLAYER placeholder over existing native settings", async () => {
    expect(RenderHarness().nickname).toBe("PLAYER");
    await flush();
    expect(runtime.invoke).not.toHaveBeenCalled();
    const saved = { playerNickname: "ReturningPlayer" };
    RenderHarness(saved);
    expect(RenderHarness(saved).nickname).toBe("ReturningPlayer");
    expect(runtime.invoke).not.toHaveBeenCalled();
  });

  it("restores the edited nickname after an update clears webview storage", async () => {
    let onDisk: string | null = null;
    runtime.invoke.mockImplementation(async (_command, { nickname }) => {
      onDisk = nickname;
    });
    RenderHarness({ playerNickname: null }).setNickname("SavedPlayer");
    await flush();
    expect(runtime.invoke).toHaveBeenCalledWith("set_player_nickname", { nickname: "SavedPlayer" });
    storage.clear();
    restart();
    const saved = { playerNickname: onDisk };
    RenderHarness(saved);
    expect(RenderHarness(saved).nickname).toBe("SavedPlayer");
  });

  it("preserves typing made before the startup settings response arrives", async () => {
    RenderHarness().setNickname("NewPlayer");
    const stale = { playerNickname: "OldPlayer" };
    RenderHarness(stale);
    expect(RenderHarness(stale).nickname).toBe("NewPlayer");
    await flush();
    expect(runtime.invoke.mock.calls).toEqual([["set_player_nickname", { nickname: "NewPlayer" }]]);
  });

  it("keeps rapid edits ordered and the last draft pending until its own save finishes", async () => {
    let finishFirst!: () => void;
    runtime.invoke.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const hook = RenderHarness({ playerNickname: null });
    hook.setNickname("First");
    hook.setNickname("FinalPlayer");
    await flush();
    expect(runtime.invoke).toHaveBeenCalledTimes(1);
    expect(storage.get("screen.pendingNickname")).toBe("FinalPlayer");
    finishFirst();
    await flush();
    expect(runtime.invoke.mock.calls.map(([, args]) => args.nickname)).toEqual([
      "First",
      "FinalPlayer",
    ]);
    expect(storage.get("screen.nickname")).toBe("FinalPlayer");
    expect(storage.has("screen.pendingNickname")).toBe(false);
  });

  it("retries a write interrupted by shutdown instead of loading an older disk value", async () => {
    storage.set("screen.nickname", "FinalPlayer");
    storage.set("screen.pendingNickname", "FinalPlayer");
    const stale = { playerNickname: "First" };
    RenderHarness(stale);
    expect(RenderHarness(stale).nickname).toBe("FinalPlayer");
    await flush();
    expect(runtime.invoke).toHaveBeenCalledWith("set_player_nickname", { nickname: "FinalPlayer" });
    expect(storage.has("screen.pendingNickname")).toBe(false);
  });

  it("migrates a cached nickname when older settings have no nickname field", async () => {
    storage.set("screen.nickname", "CachedPlayer");
    RenderHarness({});
    await flush();
    expect(runtime.invoke).toHaveBeenCalledWith("set_player_nickname", {
      nickname: "CachedPlayer",
    });
  });

  it("retains the offline name when switching account types or refreshing other settings", async () => {
    const saved = { playerNickname: "OfflinePlayer" };
    RenderHarness(saved);
    const hook = RenderHarness(saved);
    hook.setAccountType("MICROSOFT");
    expect(RenderHarness({ playerNickname: "StalePlayer" }).nickname).toBe("OfflinePlayer");
    expect(runtime.invoke).not.toHaveBeenCalled();
  });

  it("allows later edits to save after a failed write", async () => {
    runtime.invoke.mockRejectedValueOnce(new Error("temporary failure"));
    const hook = RenderHarness();
    hook.setNickname("First");
    await flush();
    expect(storage.get("screen.pendingNickname")).toBe("First");
    hook.setNickname("FinalPlayer");
    await flush();
    expect(runtime.invoke).toHaveBeenLastCalledWith("set_player_nickname", {
      nickname: "FinalPlayer",
    });
    expect(storage.has("screen.pendingNickname")).toBe(false);
  });
});
