import type { LauncherPluginsSettings } from "../../types";
import type { PluginDefinition, PluginId } from "./pluginTypes";
import { PluginIcon } from "./PluginIcon";
import { pluginStatusLabel } from "./pluginStatus";
import { pluginCopy } from "./pluginLocalization";
import { useLocale, useTranslation } from "../../i18n/locale";
import { StatusChip } from "../display/StatusChip";

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
  const locale = useLocale();
  const tr = useTranslation();
  const status = uninstalling ? "REMOVING" : definition.getStatus(plugins);
  const pending = packageChecking || installing || uninstalling;
  const statusTone = pending
    ? "warning"
    : packageReady && status === "ON"
      ? "success"
      : status === "OFF"
        ? "neutral"
        : "warning";
  const statusLabel = packageChecking
    ? tr("pluginCard.checking")
    : installing
      ? tr("pluginCard.installing")
      : !packageReady
        ? tr("pluginCard.availableToInstall")
        : pluginStatusLabel(status, locale);
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
        <span className="plugin-card-category">{pluginCopy(definition, locale).tag}</span>
        <StatusChip
          className="plugin-card-state plugin-card-status"
          tone={statusTone}
          size="sm"
          pulse={pending}
        >
          {statusLabel}
        </StatusChip>
      </span>
    </button>
  );
}
