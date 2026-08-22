import type { KeyboardEvent } from "react";
import type { LauncherPluginsSettings } from "../../types";
import type { PluginDefinition, PluginId } from "./pluginTypes";
import { PluginIcon } from "./PluginIcon";

type PluginCardProps = {
  definition: PluginDefinition;
  plugins: LauncherPluginsSettings;
  active: boolean;
  onSelect: (id: PluginId) => void;
  onPluginsChange: (plugins: LauncherPluginsSettings) => void;
  packageReady: boolean;
  packageChecking: boolean;
  installing: boolean;
  uninstalling: boolean;
  onDownload?: () => void;
};

export function PluginCard({
  definition,
  plugins,
  active,
  onSelect,
  onPluginsChange,
  packageReady,
  packageChecking,
  installing,
  uninstalling,
  onDownload,
}: PluginCardProps) {
  const enabled = definition.getEnabled(plugins);
  const effectiveEnabled = enabled && packageReady;
  const downloadRequired = Boolean(definition.optionalExtensionId && !packageReady);
  const status = uninstalling ? "REMOVING" : definition.getStatus(plugins);
  const statusTone = status === "ON" ? "on" : status === "OFF" ? "off" : "warning";

  const selectPlugin = () => {
    onSelect(definition.id);
  };

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectPlugin();
  };

  return (
    <article
      className={[
        "plugin-card",
        effectiveEnabled ? "plugin-card--enabled" : "",
        active ? "plugin-card--active" : "",
      ].join(" ")}
      aria-current={active ? "true" : undefined}
    >
      <div
        className="plugin-card-main"
        role="button"
        tabIndex={0}
        onClick={selectPlugin}
        onKeyDown={onCardKeyDown}
      >
        <PluginIcon definition={definition} className="plugin-card-mark" />

        <div className="plugin-card-copy">
          <div className="plugin-card-topline">
            <span>{definition.tag}</span>
          </div>
          <h3>{definition.title}</h3>
          <p>{definition.description}</p>
        </div>

        <div className="plugin-card-actions">
          {downloadRequired ? (
            <button
              className="plugin-card-download"
              type="button"
              disabled={packageChecking || installing}
              onClick={(event) => {
                event.stopPropagation();
                onDownload?.();
              }}
            >
              {packageChecking ? "CHECKING" : installing ? "LOADING..." : "DOWNLOAD"}
            </button>
          ) : (
            <>
              <strong className={`plugin-status plugin-status--${statusTone}`}>{status}</strong>

              <button
                className={`plugin-card-toggle ${enabled ? "plugin-card-toggle--enabled" : ""}`}
                type="button"
                disabled={uninstalling}
                aria-pressed={enabled}
                aria-label={`${enabled ? "Disable" : "Enable"} ${definition.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onPluginsChange(definition.setEnabled(plugins, !enabled));
                }}
              >
                <span className="plugin-toggle-glyph" aria-hidden="true">
                  <span />
                  {!enabled && <span />}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
