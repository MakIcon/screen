import { Suspense, useEffect, useState, type WheelEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
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
import "./LauncherPluginsModal.css";

type LauncherPluginsModalProps = {
  settings?: LauncherPluginsSettings | null;
  launcherNickname: string;
  launcherAccountType: string;
  launcherMsAccountId: string | null;
  microsoftAccounts: MicrosoftAccount[];
  onClose: () => void;
  onSave: (plugins: LauncherPluginsSettings) => void | Promise<void>;
};

export function LauncherPluginsModal({
  settings,
  launcherNickname,
  launcherAccountType,
  launcherMsAccountId,
  microsoftAccounts,
  onClose,
  onSave,
}: LauncherPluginsModalProps) {
  const [draft, setDraft] = useState<LauncherPluginsSettings>(() =>
    normalizeLauncherPluginsSettings(settings),
  );
  const runtimeMonitor = useRuntimeMonitor();
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
  const [selectedPluginId, setSelectedPluginId] = useState<PluginId>(PLUGIN_DEFINITIONS[0].id);
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
    setDraft(normalizeLauncherPluginsSettings(settings));
  }, [settings]);

  useEffect(() => {
    setConfirmUninstallId(null);
  }, [selectedPluginId]);

  useEffect(() => {
    if (!confirmUninstallId) return;
    const timer = window.setTimeout(() => setConfirmUninstallId(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [confirmUninstallId]);

  const commitPlugins = (plugins: LauncherPluginsSettings) => {
    const next = normalizeLauncherPluginsSettings(plugins);
    setDraft(next);
    void onSave(next);
  };

  useEffect(() => {
    if (!runtimeMonitor.snapshot) return;
    let next = draft;
    for (const definition of PLUGIN_DEFINITIONS) {
      if (!definition.optionalExtensionId || !definition.getEnabled(next)) continue;
      const extension = runtimeMonitor.snapshot.optionalExtensions.find(
        (candidate) => candidate.id === definition.optionalExtensionId,
      );
      if (!extension?.installed) {
        next = definition.setEnabled(next, false);
      }
    }
    if (next !== draft) {
      const normalized = normalizeLauncherPluginsSettings(next);
      setDraft(normalized);
      void onSave(normalized);
    }
  }, [draft, onSave, runtimeMonitor.snapshot]);

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

  return (
    <ElementPopup open onClose={onClose} className="launcher-plugins-dialog">
      <div className="plugins-shell" onWheel={stopWheelNavigation}>
        <div className="plugins-header">
          <div>
            <span className="plugins-label">ADVANCED</span>
            <h2>EXTENSIONS</h2>
          </div>

          <div className="plugins-summary" aria-label="Plugin summary">
            <span>{PLUGIN_DEFINITIONS.length} TOTAL</span>
            <strong>{enabledCount} ENABLED</strong>
          </div>

          <button
            className="plugins-close"
            type="button"
            onClick={onClose}
            aria-label="Close extensions"
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

        <div className="plugins-layout">
          <aside className="plugins-catalog">
            <div className="plugins-catalog-head">
              <span>PLUGIN LIBRARY</span>
              <strong>{PLUGIN_DEFINITIONS.length}</strong>
            </div>

            <div className="plugins-list">
              {PLUGIN_DEFINITIONS.map((definition) => (
                <PluginCard
                  key={definition.id}
                  definition={definition}
                  plugins={draft}
                  active={selectedPluginId === definition.id}
                  onSelect={setSelectedPluginId}
                  onPluginsChange={commitPlugins}
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
                  onDownload={
                    definition.optionalExtensionId
                      ? () => void installExtension(definition.optionalExtensionId!)
                      : undefined
                  }
                />
              ))}
            </div>
          </aside>

          <section className="plugin-detail" aria-live="polite">
            <div className="plugin-detail-hero">
              <PluginIcon definition={selectedDefinition} className="plugin-detail-mark" />

              <div className="plugin-detail-copy">
                <div className="plugin-detail-topline">
                  <span>{selectedDefinition.tag}</span>
                  {selectedPackageReady && (
                    <strong className={`plugin-status plugin-status--${selectedStatusTone}`}>
                      {selectedStatus}
                    </strong>
                  )}
                </div>
                <h3>{selectedDefinition.title}</h3>
                <p>{selectedDefinition.description}</p>
                {selectedExtensionId && installError?.id === selectedExtensionId && (
                  <span className="plugin-install-error">{installError.message}</span>
                )}
              </div>

              <div className="plugin-detail-actions">
                <button
                  className={[
                    "plugin-detail-toggle",
                    selectedEnabled && selectedPackageReady ? "plugin-detail-toggle--enabled" : "",
                    !selectedPackageReady ? "plugin-detail-toggle--download" : "",
                  ].join(" ")}
                  type="button"
                  disabled={selectedExtensionChecking || selectedInstalling || selectedUninstalling}
                  onClick={() => {
                    if (!selectedPackageReady && selectedExtensionId) {
                      void installExtension(selectedExtensionId);
                      return;
                    }
                    commitPlugins(selectedDefinition.setEnabled(draft, !selectedEnabled));
                  }}
                >
                  {selectedExtensionChecking
                    ? "CHECKING..."
                    : selectedInstalling
                      ? "DOWNLOADING..."
                      : !selectedPackageReady
                        ? "DOWNLOAD"
                        : selectedEnabled
                          ? "DISABLE"
                          : "ENABLE"}
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
                    disabled={selectedInstalling || selectedUninstalling}
                    onClick={() => {
                      if (confirmUninstallId === selectedExtensionId) {
                        void uninstallExtension(selectedExtensionId);
                      } else {
                        setConfirmUninstallId(selectedExtensionId);
                      }
                    }}
                  >
                    {selectedUninstalling
                      ? "REMOVING..."
                      : confirmUninstallId === selectedExtensionId
                        ? "CONFIRM REMOVE"
                        : "UNINSTALL"}
                  </button>
                )}
              </div>
            </div>

            <CustomScrollArea className="plugin-detail-settings" onWheel={stopWheelNavigation}>
              <Suspense
                fallback={<div className="plugin-settings-loading">LOADING SETTINGS...</div>}
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
      </div>
    </ElementPopup>
  );
}
