import { Suspense, useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  LauncherPluginsSettings,
  MicrosoftAccount,
  OptionalExtensionId,
  OptionalExtensionStatus,
} from "../../types";
import { useRuntimeMonitor } from "../../hooks/useRuntimeMonitor";
import { toErrorMessage } from "../../utils/errors";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { ElementPopup } from "../popup/ElementPopup";
import { PluginCard } from "./PluginCard";
import { PluginIcon } from "./PluginIcon";
import { PLUGIN_DEFINITIONS, normalizeLauncherPluginsSettings } from "./pluginRegistry";
import type { PluginId } from "./pluginTypes";
import { pluginStatusLabel } from "./pluginStatus";
import { openMineflayerBotWindow } from "./mineflayerBot/mineflayerBotWindow";
import { logger } from "../../utils/logger";
import "./LauncherPluginsModal.css";

type LauncherPluginsModalProps = {
  settings?: LauncherPluginsSettings | null;
  launcherNickname: string;
  launcherAccountType: string;
  launcherMsAccountId: string | null;
  microsoftAccounts: MicrosoftAccount[];
  standalone?: boolean;
  onClose: () => void;
  onSave: (plugins: LauncherPluginsSettings, pluginIds?: PluginId[]) => void | Promise<void>;
};

export function LauncherPluginsModal({
  settings,
  launcherNickname,
  launcherAccountType,
  launcherMsAccountId,
  microsoftAccounts,
  standalone = false,
  onClose,
  onSave,
}: LauncherPluginsModalProps) {
  const [draft, setDraft] = useState<LauncherPluginsSettings>(() =>
    normalizeLauncherPluginsSettings(settings),
  );
  const pendingEdits = useRef<Partial<LauncherPluginsSettings>>({});
  const runtimeMonitor = useRuntimeMonitor();
  const [openingWindow, setOpeningWindow] = useState(false);
  const [windowError, setWindowError] = useState("");
  const [installingExtensionId, setInstallingExtensionId] = useState<OptionalExtensionId | null>(
    null,
  );
  const [uninstallingExtensionId, setUninstallingExtensionId] =
    useState<OptionalExtensionId | null>(null);
  const [confirmUninstallId, setConfirmUninstallId] = useState<OptionalExtensionId | null>(null);
  const [installError, setInstallError] = useState<{
    id: OptionalExtensionId;
    message: string;
  } | null>(null);
  const [selectedPluginId, setSelectedPluginId] = useState<PluginId>(
    standalone ? "mineflayerBot" : PLUGIN_DEFINITIONS[0].id,
  );
  const selectedDefinition =
    PLUGIN_DEFINITIONS.find((definition) => definition.id === selectedPluginId) ??
    PLUGIN_DEFINITIONS[0];
  const selectedExtensionId = selectedDefinition.optionalExtensionId;
  const selectedExtensionStatus = selectedExtensionId
    ? runtimeMonitor.snapshot?.optionalExtensions.find(
        (extension) => extension.id === selectedExtensionId,
      )
    : null;
  const selectedExtensionChecking = Boolean(selectedExtensionId && !runtimeMonitor.snapshot);
  const selectedPackageReady = !selectedExtensionId || Boolean(selectedExtensionStatus?.installed);
  const selectedInstalling = selectedExtensionId === installingExtensionId;
  const selectedUninstalling = selectedExtensionId === uninstallingExtensionId;
  const selectedEnabled = selectedDefinition.getEnabled(draft);
  const selectedStatus = selectedUninstalling ? "REMOVING" : selectedDefinition.getStatus(draft);
  const SelectedPluginSettings = selectedDefinition.SettingsComponent;
  const selectedStatusTone =
    selectedStatus === "ON" ? "on" : selectedStatus === "OFF" ? "off" : "warning";
  const enabledCount = PLUGIN_DEFINITIONS.filter((definition) =>
    definition.getEnabled(draft),
  ).length;
  const pluginContext = {
    launcherNickname,
    launcherAccountType,
    launcherMsAccountId,
    microsoftAccounts,
  };

  useEffect(() => {
    setDraft({ ...normalizeLauncherPluginsSettings(settings), ...pendingEdits.current });
  }, [settings]);

  useEffect(() => {
    setConfirmUninstallId(null);
  }, [selectedPluginId]);

  useEffect(() => {
    if (!confirmUninstallId) return;
    const timer = window.setTimeout(() => setConfirmUninstallId(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [confirmUninstallId]);

  const persistPlugins = useCallback(
    (next: LauncherPluginsSettings, changedIds: PluginId[]) => {
      if (!changedIds.length) return;
      const patch = Object.fromEntries(changedIds.map((id) => [id, next[id]]));
      pendingEdits.current = { ...pendingEdits.current, ...patch };
      void Promise.resolve(onSave(next, changedIds))
        .finally(() => {
          for (const id of changedIds) {
            if (pendingEdits.current[id] === next[id]) delete pendingEdits.current[id];
          }
        })
        .catch(logger.error);
    },
    [onSave],
  );

  const commitPlugins = (plugins: LauncherPluginsSettings) => {
    const next = normalizeLauncherPluginsSettings(plugins);
    const changedIds = PLUGIN_DEFINITIONS.filter(
      ({ id }) => JSON.stringify(next[id]) !== JSON.stringify(draft[id]),
    ).map(({ id }) => id);
    setDraft(next);
    persistPlugins(next, changedIds);
  };

  useEffect(() => {
    if (!runtimeMonitor.snapshot) return;
    let next = draft;
    const changedIds: PluginId[] = [];
    for (const definition of PLUGIN_DEFINITIONS) {
      if (standalone && definition.id !== "mineflayerBot") continue;
      if (!definition.optionalExtensionId || !definition.getEnabled(next)) continue;
      const extension = runtimeMonitor.snapshot.optionalExtensions.find(
        (candidate) => candidate.id === definition.optionalExtensionId,
      );
      if (!extension?.installed) {
        next = definition.setEnabled(next, false);
        changedIds.push(definition.id);
      }
    }
    if (next !== draft) {
      const normalized = normalizeLauncherPluginsSettings(next);
      setDraft(normalized);
      persistPlugins(normalized, changedIds);
    }
  }, [draft, persistPlugins, runtimeMonitor.snapshot, standalone]);

  const detachBot = async () => {
    setOpeningWindow(true);
    setWindowError("");
    try {
      await openMineflayerBotWindow();
      onClose();
    } catch (error) {
      logger.error(error);
      setWindowError(toErrorMessage(error));
    } finally {
      setOpeningWindow(false);
    }
  };

  const installExtension = async (extensionId: OptionalExtensionId) => {
    if (installingExtensionId || uninstallingExtensionId) return;
    try {
      setInstallingExtensionId(extensionId);
      setInstallError(null);
      await invoke<OptionalExtensionStatus>("install_optional_extension", { extensionId });
      await runtimeMonitor.refresh();
    } catch (caught) {
      setInstallError({ id: extensionId, message: toErrorMessage(caught) });
    } finally {
      setInstallingExtensionId(null);
    }
  };

  const uninstallExtension = async (extensionId: OptionalExtensionId) => {
    if (installingExtensionId || uninstallingExtensionId) return;
    try {
      setUninstallingExtensionId(extensionId);
      setConfirmUninstallId(null);
      setInstallError(null);
      await invoke<OptionalExtensionStatus>("uninstall_optional_extension", { extensionId });
      await runtimeMonitor.refresh();

      const definition = PLUGIN_DEFINITIONS.find(
        (candidate) => candidate.optionalExtensionId === extensionId,
      );
      if (definition) {
        let next = definition.setEnabled(draft, false);
        if (extensionId === "blue-map-server") {
          next = { ...next, blueMap: { ...next.blueMap, cliJarPath: "" } };
        }
        commitPlugins(next);
      }
    } catch (caught) {
      setInstallError({ id: extensionId, message: toErrorMessage(caught) });
    } finally {
      setUninstallingExtensionId(null);
    }
  };

  const stopWheelNavigation = (event: WheelEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const content = (
    <div className="plugins-shell" onWheel={stopWheelNavigation}>
      <div
        className="plugins-header"
        onPointerDown={(event) => {
          if (
            standalone &&
            isTauri() &&
            event.button === 0 &&
            !(event.target as HTMLElement).closest("button")
          ) {
            void getCurrentWindow().startDragging().catch(logger.error);
          }
        }}
        onDoubleClick={(event) => {
          if (standalone && isTauri() && !(event.target as HTMLElement).closest("button")) {
            void getCurrentWindow().toggleMaximize().catch(logger.error);
          }
        }}
      >
        <div>
          <h2>{standalone ? "УПРАВЛЕНИЕ БОТОМ" : "РАСШИРЕНИЯ"}</h2>
        </div>

        {!standalone && (
          <div className="plugins-summary" aria-label="Состояние расширений">
            <span>{PLUGIN_DEFINITIONS.length} всего</span>
            <strong>{enabledCount} включено</strong>
          </div>
        )}

        <div className="plugins-window-actions">
          {standalone && isTauri() && (
            <>
              <button
                type="button"
                className="plugins-close"
                aria-label="Свернуть окно"
                onClick={() => void getCurrentWindow().minimize().catch(logger.error)}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M1 9h10" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
              <button
                type="button"
                className="plugins-close"
                aria-label="Развернуть или восстановить окно"
                onClick={() => void getCurrentWindow().toggleMaximize().catch(logger.error)}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <rect x="1.5" y="1.5" width="9" height="9" stroke="currentColor" />
                </svg>
              </button>
            </>
          )}
          <button
            className="plugins-close"
            type="button"
            onClick={onClose}
            aria-label={standalone ? "Закрыть окно управления ботом" : "Закрыть расширения"}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="1" y1="1" x2="10" y2="10" />
              <line x1="10" y1="1" x2="1" y2="10" />
            </svg>
          </button>
        </div>
      </div>

      <div className="plugins-layout">
        {!standalone && (
          <aside className="plugins-catalog">
            <nav className="plugins-list" aria-label="Расширения">
              {PLUGIN_DEFINITIONS.map((definition) => (
                <PluginCard
                  key={definition.id}
                  definition={definition}
                  plugins={draft}
                  active={selectedPluginId === definition.id}
                  onSelect={setSelectedPluginId}
                  packageReady={
                    !definition.optionalExtensionId ||
                    Boolean(
                      runtimeMonitor.snapshot?.optionalExtensions.find(
                        (extension) => extension.id === definition.optionalExtensionId,
                      )?.installed,
                    )
                  }
                  packageChecking={Boolean(
                    definition.optionalExtensionId && !runtimeMonitor.snapshot,
                  )}
                  installing={definition.optionalExtensionId === installingExtensionId}
                  uninstalling={definition.optionalExtensionId === uninstallingExtensionId}
                />
              ))}
            </nav>
          </aside>
        )}

        <section className="plugin-detail" aria-labelledby="plugin-detail-title">
          <div className="plugin-detail-hero">
            <PluginIcon definition={selectedDefinition} className="plugin-detail-mark" />

            <div className="plugin-detail-copy">
              <div className="plugin-detail-topline">
                <h3 id="plugin-detail-title">{selectedDefinition.title}</h3>
                {selectedPackageReady && (
                  <strong className={`plugin-status plugin-status--${selectedStatusTone}`}>
                    {pluginStatusLabel(selectedStatus)}
                  </strong>
                )}
              </div>
              <p>{selectedDefinition.description}</p>
              {selectedExtensionId && installError?.id === selectedExtensionId && (
                <span className="plugin-install-error">{installError.message}</span>
              )}
              {windowError && (
                <span className="plugin-install-error" role="alert">
                  {windowError}
                </span>
              )}
            </div>

            <div className="plugin-detail-actions">
              {!standalone && selectedPluginId === "mineflayerBot" && (
                <button
                  type="button"
                  className="plugin-detail-detach"
                  disabled={openingWindow}
                  aria-busy={openingWindow}
                  onClick={() => void detachBot()}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M9 2h5v5M14 2 7 9M6 3H2v11h11v-4"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                  </svg>
                  {openingWindow ? "Открываем…" : "В отдельном окне"}
                </button>
              )}
              <button
                className={[
                  "plugin-detail-toggle",
                  selectedEnabled && selectedPackageReady ? "plugin-detail-toggle--enabled" : "",
                  !selectedPackageReady ? "plugin-detail-toggle--download" : "",
                ].join(" ")}
                type="button"
                aria-pressed={selectedPackageReady ? selectedEnabled : undefined}
                disabled={
                  selectedExtensionChecking ||
                  Boolean(installingExtensionId || uninstallingExtensionId)
                }
                onClick={() => {
                  if (!selectedPackageReady && selectedExtensionId) {
                    void installExtension(selectedExtensionId);
                    return;
                  }
                  commitPlugins(selectedDefinition.setEnabled(draft, !selectedEnabled));
                }}
              >
                {selectedExtensionChecking
                  ? "Проверка…"
                  : selectedInstalling
                    ? "Установка…"
                    : selectedUninstalling
                      ? "Удаление…"
                      : !selectedPackageReady
                        ? "Установить"
                        : selectedEnabled
                          ? "Выключить"
                          : "Включить"}
              </button>

              {selectedExtensionId && selectedPackageReady && (
                <button
                  className={[
                    "plugin-detail-uninstall",
                    confirmUninstallId === selectedExtensionId
                      ? "plugin-detail-uninstall--confirm"
                      : "",
                  ].join(" ")}
                  type="button"
                  disabled={Boolean(installingExtensionId || uninstallingExtensionId)}
                  onClick={() => {
                    if (confirmUninstallId === selectedExtensionId) {
                      void uninstallExtension(selectedExtensionId);
                    } else {
                      setConfirmUninstallId(selectedExtensionId);
                    }
                  }}
                >
                  {selectedUninstalling
                    ? "Удаление…"
                    : confirmUninstallId === selectedExtensionId
                      ? "Подтвердить удаление"
                      : "Удалить пакет"}
                </button>
              )}
            </div>
          </div>

          <CustomScrollArea
            key={selectedPluginId}
            className="plugin-detail-settings"
            onWheel={stopWheelNavigation}
            aria-label={`Настройки ${selectedDefinition.title}`}
          >
            {!selectedPackageReady && (
              <div className="plugin-package-notice">
                {selectedExtensionChecking
                  ? "Проверяем, установлен ли пакет расширения…"
                  : "Установите пакет кнопкой выше, чтобы включить расширение. Настройки можно подготовить заранее."}
              </div>
            )}
            <Suspense
              fallback={<div className="plugin-settings-loading">Загружаем настройки…</div>}
            >
              <SelectedPluginSettings
                plugins={draft}
                onChange={commitPlugins}
                context={pluginContext}
              />
            </Suspense>
          </CustomScrollArea>
        </section>
      </div>
      <div className="plugins-footer">
        <span>Настройки сохраняются автоматически</span>
        <button type="button" onClick={onClose}>
          {standalone ? "Закрыть" : "Готово"}
        </button>
      </div>
    </div>
  );

  return standalone ? (
    <main className="launcher-plugins-dialog mineflayer-bot-window" lang="ru">
      {content}
    </main>
  ) : (
    <ElementPopup open onClose={onClose} className="launcher-plugins-dialog">
      {content}
    </ElementPopup>
  );
}
