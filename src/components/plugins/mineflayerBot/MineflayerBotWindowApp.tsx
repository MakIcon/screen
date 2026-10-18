import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppearance } from "../../../appearance/useAppearance";
import { RuntimeMonitorScope, useRuntimeMonitorController } from "../../../hooks/useRuntimeMonitor";
import type { LauncherPluginsSettings, LauncherSettings } from "../../../types";
import { toErrorMessage } from "../../../utils/errors";
import { logger } from "../../../utils/logger";
import { LauncherPluginsModal } from "../LauncherPluginsModal";
import { savePluginSettings, subscribePluginSettings } from "../pluginSettingsSync";
import { readBotWindowContext, subscribeBotWindowContext } from "./botWindowContext";
import "../../../App.css";

function closeBotWindow() {
  if (isTauri()) void getCurrentWindow().close().catch(logger.error);
  else window.close();
}

export function MineflayerBotWindowApp() {
  useAppearance();
  const monitor = useRuntimeMonitorController([], true, false);
  const [plugins, setPlugins] = useState<LauncherPluginsSettings | null>(null);
  const [context, setContext] = useState(readBotWindowContext);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => subscribeBotWindowContext(setContext), []);

  useEffect(() => {
    let disposed = false;
    let changed = false;
    setLoading(true);
    setError("");
    const subscription = subscribePluginSettings((next) => {
      changed = true;
      setPlugins(next);
    });
    // Subscribe before loading so an edit in the launcher cannot fall into a gap.
    void subscription.ready
      .catch(logger.error)
      .then(() => invoke<LauncherSettings>("get_launcher_settings"))
      .then((settings) => {
        if (!disposed && !changed) setPlugins(settings.plugins);
      })
      .catch((cause) => {
        if (!disposed) setError(toErrorMessage(cause));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      subscription.dispose();
    };
  }, [loadAttempt]);

  const save = useCallback(async (next: LauncherPluginsSettings) => {
    try {
      setError("");
      await savePluginSettings(next, ["mineflayerBot"]);
    } catch (cause) {
      logger.error(cause);
      setError(`Не удалось сохранить настройки: ${toErrorMessage(cause)}`);
    }
  }, []);

  return (
    <RuntimeMonitorScope controller={monitor}>
      <div className="mineflayer-bot-window-root">
        {plugins ? (
          <LauncherPluginsModal
            standalone
            settings={plugins}
            {...context}
            onSave={save}
            onClose={closeBotWindow}
          />
        ) : (
          <main className="mineflayer-bot-window-loading">
            <strong>Управление ботом</strong>
            <p>{loading ? "Загружаем настройки…" : "Не удалось загрузить настройки бота."}</p>
            {!loading && (
              <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>
                Повторить
              </button>
            )}
            <button type="button" onClick={closeBotWindow}>
              Закрыть окно
            </button>
          </main>
        )}
        {error && (
          <div className="mineflayer-bot-window-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </RuntimeMonitorScope>
  );
}
