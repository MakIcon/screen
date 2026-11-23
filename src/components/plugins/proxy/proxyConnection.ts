import { invoke } from "@tauri-apps/api/core";

export type ProxyTestResult = {
  ok: boolean;
  status?: number | null;
  latencyMs: number;
  failure?: "timeout" | "authentication" | "http" | "connection" | null;
};

export type ProxyConnectionState =
  | { status: "checking" }
  | { status: "connected"; latencyMs: number }
  | { status: "unavailable" };

const REFRESH_MS = 30_000;

/** Probe the saved proxy, without letting old requests outlive a settings change. */
export function watchProxyConnection(
  proxyUrl: string,
  onChange: (state: ProxyConnectionState) => void,
) {
  let disposed = false;
  let pending = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastCheck = -Infinity;

  const check = async () => {
    if (disposed || pending) return;
    clearTimeout(timer);
    if (!navigator.onLine) {
      onChange({ status: "unavailable" });
      return;
    }
    pending = true;
    lastCheck = Date.now();
    const request = ++generation;
    try {
      const result = await invoke<ProxyTestResult>("test_proxy_connection", { proxyUrl });
      if (disposed || request !== generation) return;
      onChange(
        result.ok
          ? { status: "connected", latencyMs: result.latencyMs }
          : { status: "unavailable" },
      );
    } catch {
      if (!disposed && request === generation) onChange({ status: "unavailable" });
    } finally {
      if (!disposed && request === generation) {
        pending = false;
        timer = setTimeout(() => void check(), REFRESH_MS);
      }
    }
  };

  const offline = () => {
    ++generation;
    pending = false;
    clearTimeout(timer);
    onChange({ status: "unavailable" });
  };
  const online = () => {
    onChange({ status: "checking" });
    void check();
  };
  const focus = () => {
    if (Date.now() - lastCheck >= REFRESH_MS) void check();
  };

  window.addEventListener("offline", offline);
  window.addEventListener("online", online);
  window.addEventListener("focus", focus);
  onChange({ status: "checking" });
  void check();

  return () => {
    disposed = true;
    clearTimeout(timer);
    window.removeEventListener("offline", offline);
    window.removeEventListener("online", online);
    window.removeEventListener("focus", focus);
  };
}
