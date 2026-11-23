import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { watchProxyConnection, type ProxyTestResult } from "./proxyConnection";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("proxy connection monitoring", () => {
  let events: EventTarget;
  let online: boolean;
  let dispose: (() => void) | undefined;
  const changed = vi.fn();
  const proxyUrl = "socks5h://127.0.0.1:1080";

  beforeEach(() => {
    vi.useFakeTimers();
    events = new EventTarget();
    online = true;
    vi.stubGlobal("window", events);
    vi.stubGlobal("navigator", {
      get onLine() {
        return online;
      },
    });
    vi.mocked(invoke).mockReset().mockResolvedValue({ ok: true, latencyMs: 84 });
    changed.mockReset();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for a successful probe before showing connected, then detects failure and recovery", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ ok: true, latencyMs: 84 })
      .mockResolvedValueOnce({ ok: false, latencyMs: 15_000, failure: "timeout" })
      .mockResolvedValueOnce({ ok: true, latencyMs: 120 });
    dispose = watchProxyConnection(proxyUrl, changed);
    expect(changed).toHaveBeenLastCalledWith({ status: "checking" });
    expect(invoke).toHaveBeenCalledWith("test_proxy_connection", { proxyUrl });
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenLastCalledWith({ status: "connected", latencyMs: 84 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(changed).toHaveBeenLastCalledWith({ status: "unavailable" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(changed).toHaveBeenLastCalledWith({ status: "connected", latencyMs: 120 });
  });

  it("handles command errors and retries without an unhandled rejection", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("connection refused"));
    dispose = watchProxyConnection(proxyUrl, changed);
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenLastCalledWith({ status: "unavailable" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(changed).toHaveBeenLastCalledWith({ status: "connected", latencyMs: 84 });
  });

  it("does not overlap slow checks or probe repeatedly on window focus", async () => {
    let finish!: (value: ProxyTestResult) => void;
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise<ProxyTestResult>((resolve) => {
        finish = resolve;
      }),
    );
    dispose = watchProxyConnection(proxyUrl, changed);
    await vi.advanceTimersByTimeAsync(60_000);
    events.dispatchEvent(new Event("focus"));
    expect(invoke).toHaveBeenCalledTimes(1);
    finish({ ok: true, latencyMs: 60_000 });
    await vi.advanceTimersByTimeAsync(0);
    events.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).toHaveBeenCalledTimes(2);
    events.dispatchEvent(new Event("focus"));
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("ignores in-flight results after settings change or unmount", async () => {
    let finish!: (value: ProxyTestResult) => void;
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise<ProxyTestResult>((resolve) => {
        finish = resolve;
      }),
    );
    const stop = watchProxyConnection(proxyUrl, changed);
    stop();
    dispose = watchProxyConnection("http://127.0.0.1:8080", changed);
    await vi.advanceTimersByTimeAsync(0);
    const calls = changed.mock.calls.length;
    finish({ ok: false, latencyMs: 15_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenCalledTimes(calls);
    expect(changed).toHaveBeenLastCalledWith({ status: "connected", latencyMs: 84 });
  });

  it("marks offline immediately, ignores stale results and checks again on reconnect", async () => {
    let finish!: (value: ProxyTestResult) => void;
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise<ProxyTestResult>((resolve) => {
        finish = resolve;
      }),
    );
    dispose = watchProxyConnection(proxyUrl, changed);
    online = false;
    events.dispatchEvent(new Event("offline"));
    expect(changed).toHaveBeenLastCalledWith({ status: "unavailable" });
    online = true;
    events.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenLastCalledWith({ status: "connected", latencyMs: 84 });
    finish({ ok: false, latencyMs: 15_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenLastCalledWith({ status: "connected", latencyMs: 84 });
  });

  it("does not send requests while offline and removes timers and listeners on disposal", async () => {
    online = false;
    dispose = watchProxyConnection(proxyUrl, changed);
    expect(changed).toHaveBeenLastCalledWith({ status: "unavailable" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).not.toHaveBeenCalled();
    online = true;
    events.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).toHaveBeenCalledTimes(1);
    dispose();
    const calls = changed.mock.calls.length;
    events.dispatchEvent(new Event("offline"));
    events.dispatchEvent(new Event("online"));
    events.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(changed).toHaveBeenCalledTimes(calls);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
