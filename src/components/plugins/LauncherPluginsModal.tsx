import { useEffect, useState, type WheelEvent } from "react";
import type { LauncherPluginsSettings } from "../../types";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { ElementPopup } from "../popup/ElementPopup";
import { PluginCard } from "./PluginCard";
import { PluginIcon } from "./PluginIcon";
import {
  PLUGIN_DEFINITIONS,
  normalizeLauncherPluginsSettings,
  type PluginId,
} from "./pluginRegistry";
import "./LauncherPluginsModal.css";

type LauncherPluginsModalProps = {
  settings?: LauncherPluginsSettings | null;
  onClose: () => void;
  onSave: (plugins: LauncherPluginsSettings) => void | Promise<void>;
};

export function LauncherPluginsModal({
  settings,
  onClose,
  onSave,
}: LauncherPluginsModalProps) {
  const [draft, setDraft] = useState<LauncherPluginsSettings>(() =>
    normalizeLauncherPluginsSettings(settings),
  );
  const [selectedPluginId, setSelectedPluginId] = useState<PluginId>(
    PLUGIN_DEFINITIONS[0].id,
  );
  const selectedDefinition =
    PLUGIN_DEFINITIONS.find((definition) => definition.id === selectedPluginId) ??
    PLUGIN_DEFINITIONS[0];
  const selectedStatus = selectedDefinition.getStatus(draft);
  const selectedStatusTone =
    selectedStatus === "ON" ? "on" : selectedStatus === "OFF" ? "off" : "warning";
  const enabledCount = PLUGIN_DEFINITIONS.filter((definition) =>
    definition.getEnabled(draft),
  ).length;

  useEffect(() => {
    setDraft(normalizeLauncherPluginsSettings(settings));
  }, [settings]);

  const commitPlugins = (plugins: LauncherPluginsSettings) => {
    const next = normalizeLauncherPluginsSettings(plugins);
    setDraft(next);
    void onSave(next);
  };

  const stopWheelNavigation = (event: WheelEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <ElementPopup
      open
      onClose={onClose}
      className="launcher-plugins-dialog"
    >
      <div className="plugins-shell" onWheel={stopWheelNavigation}>
        <div className="plugins-header">
          <div>
            <span className="plugins-label">ADVANCED</span>
            <h2>EXTENSIONS</h2>
          </div>

          <div className="plugins-summary" aria-label="Plugin summary">
            <span>{PLUGIN_DEFINITIONS.length} TOTAL</span>
            <strong>{enabledCount} ACTIVE</strong>
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
                />
              ))}
            </div>
          </aside>

          <section className="plugin-detail" aria-live="polite">
            <div className="plugin-detail-hero">
              <PluginIcon
                definition={selectedDefinition}
                className="plugin-detail-mark"
              />

              <div className="plugin-detail-copy">
                <div className="plugin-detail-topline">
                  <span>{selectedDefinition.tag}</span>
                  <strong
                    className={`plugin-status plugin-status--${selectedStatusTone}`}
                  >
                    {selectedStatus}
                  </strong>
                </div>
                <h3>{selectedDefinition.title}</h3>
                <p>{selectedDefinition.description}</p>
              </div>

              <button
                className={[
                  "plugin-detail-toggle",
                  selectedDefinition.getEnabled(draft)
                    ? "plugin-detail-toggle--enabled"
                    : "",
                ].join(" ")}
                type="button"
                onClick={() =>
                  commitPlugins(
                    selectedDefinition.setEnabled(
                      draft,
                      !selectedDefinition.getEnabled(draft),
                    ),
                  )
                }
              >
                {selectedDefinition.getEnabled(draft) ? "DISABLE" : "ENABLE"}
              </button>
            </div>

            <div className="plugin-detail-meta">
              <span>LOCAL CONFIG</span>
              <span>LIVE RPC</span>
              <span>LAUNCH HOOK</span>
            </div>

            <CustomScrollArea
              className="plugin-detail-settings"
              onWheel={stopWheelNavigation}
            >
              <div className="plugin-detail-section-title">
                <span>SETTINGS</span>
                <strong>APPLIED ON CHANGE</strong>
              </div>
              {selectedDefinition.renderSettings(draft, commitPlugins)}
            </CustomScrollArea>
          </section>
        </div>
      </div>
    </ElementPopup>
  );
}
