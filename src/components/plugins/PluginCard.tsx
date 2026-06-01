import type { KeyboardEvent } from "react";
import type { LauncherPluginsSettings } from "../../types";
import type { PluginDefinition, PluginId } from "./pluginRegistry";

type PluginCardProps = {
  definition: PluginDefinition;
  plugins: LauncherPluginsSettings;
  active: boolean;
  onSelect: (id: PluginId) => void;
  onPluginsChange: (plugins: LauncherPluginsSettings) => void;
};

export function PluginCard({
  definition,
  plugins,
  active,
  onSelect,
  onPluginsChange,
}: PluginCardProps) {
  const enabled = definition.getEnabled(plugins);
  const status = definition.getStatus(plugins);

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
        enabled ? "plugin-card--enabled" : "",
        active ? "plugin-card--active" : "",
      ].join(" ")}
    >
      <div
        className="plugin-card-main"
        role="button"
        tabIndex={0}
        onClick={selectPlugin}
        onKeyDown={onCardKeyDown}
      >
        <div className="plugin-card-mark" aria-hidden="true">
          {definition.mark}
        </div>

        <div className="plugin-card-copy">
          <div className="plugin-card-topline">
            <span>{definition.tag}</span>
            <strong>{status}</strong>
          </div>
          <h3>{definition.title}</h3>
          <p>{definition.description}</p>
        </div>

        <button
          className={`plugin-card-toggle ${enabled ? "plugin-card-toggle--enabled" : ""}`}
          type="button"
          aria-label={`${enabled ? "Disable" : "Enable"} ${definition.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onPluginsChange(definition.setEnabled(plugins, !enabled));
          }}
        >
          {enabled ? "-" : "+"}
        </button>
      </div>
    </article>
  );
}
