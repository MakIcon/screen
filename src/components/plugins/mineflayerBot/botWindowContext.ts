import { emit, listen } from "@tauri-apps/api/event";
import type { PluginRenderContext } from "../pluginTypes";

const CONTEXT_KEY = "screenlauncher:mineflayer-window:context";
const CONTEXT_EVENT = "mineflayer-window-context";

const DEFAULT_CONTEXT: PluginRenderContext = {
  launcherNickname: "PLAYER",
  launcherAccountType: "OFFLINE",
  launcherMsAccountId: null,
  microsoftAccounts: [],
};

export function readBotWindowContext(): PluginRenderContext {
  try {
    return JSON.parse(localStorage.getItem(CONTEXT_KEY) || "null") ?? DEFAULT_CONTEXT;
  } catch {
    return DEFAULT_CONTEXT;
  }
}

export function publishBotWindowContext(context: PluginRenderContext) {
  try {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // The event bridge also supports webviews without persistent storage.
  }
  void emit(CONTEXT_EVENT, context).catch(() => {});
}

export function subscribeBotWindowContext(onChange: (context: PluginRenderContext) => void) {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void listen<PluginRenderContext>(CONTEXT_EVENT, ({ payload }) => {
    if (!disposed) onChange(payload);
  })
    .then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
      if (!disposed) onChange(readBotWindowContext());
    })
    .catch(() => {});
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONTEXT_KEY) onChange(readBotWindowContext());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    disposed = true;
    unlisten?.();
    window.removeEventListener("storage", onStorage);
  };
}
