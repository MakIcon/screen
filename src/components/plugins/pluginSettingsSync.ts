import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LauncherPluginsSettings, LauncherSettings } from "../../types";
import type { PluginId } from "./pluginTypes";

let saving: Promise<unknown> = Promise.resolve();

// Keep rapid edits ordered. Each window sends only the plugins it actually edited.
export function savePluginSettings(plugins: LauncherPluginsSettings, pluginIds?: PluginId[]) {
  const pending = saving.then(() =>
    invoke<LauncherSettings>("set_launcher_plugins", { plugins, pluginIds }),
  );
  saving = pending.catch(() => {});
  return pending;
}

export function subscribePluginSettings(onChange: (plugins: LauncherPluginsSettings) => void) {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  const ready = listen<LauncherPluginsSettings>("launcher-plugins-changed", ({ payload }) => {
    if (!disposed) onChange(payload);
  }).then((cleanup) => {
    if (disposed) cleanup();
    else unlisten = cleanup;
  });
  return {
    ready,
    dispose: () => {
      disposed = true;
      unlisten?.();
    },
  };
}
