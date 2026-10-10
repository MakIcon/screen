import type { LauncherPluginsSettings } from "../../types";
import type { PluginDefinition, PluginId } from "./pluginTypes";
import { PluginIcon } from "./PluginIcon";
import { pluginStatusLabel } from "./pluginStatus";

type PluginCardProps = {
  definition: PluginDefinition;
  plugins: LauncherPluginsSettings;
  active: boolean;
  onSelect: (id: PluginId) => void;
  packageReady: boolean;
  packageChecking: boolean;
  installing: boolean;
  uninstalling: boolean;
};

export function PluginCard({
  definition,
  plugins,
  active,
  onSelect,
  packageReady,
  packageChecking,
  installing,
  uninstalling,
}: PluginCardProps) {
  const status = uninstalling ? "REMOVING" : definition.getStatus(plugins);
  const statusTone = packageReady && status === "ON" ? "on" : status === "OFF" ? "off" : "warning";
  const statusLabel = packageChecking
    ? "Проверка…"
    : installing
      ? "Установка…"
      : !packageReady
        ? "Доступно для установки"
        : pluginStatusLabel(status);
  return (
    <button
      type="button"
      className={`plugin-card${active ? " plugin-card--active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(definition.id)}
    >
      <PluginIcon definition={definition} className="plugin-card-mark" />
      <span className="plugin-card-copy">
        <strong>{definition.title}</strong>
        <span className="plugin-card-category">{definition.tag}</span>
        <span className={`plugin-card-state plugin-card-state--${statusTone}`}>{statusLabel}</span>
      </span>
    </button>
  );
}
