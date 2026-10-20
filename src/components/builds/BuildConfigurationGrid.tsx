import type { PlaceholderAppearanceAttributes } from "../../utils/placeholders";
import { InfoPanel } from "../display/InfoPanel";
import { InlineDropdown } from "../inputs/InlineDropdown";
import { useTranslation } from "../../i18n/locale";

interface BuildConfigurationGridProps {
  buildName: string;
  buildOptions: string[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
  version?: string;
  loader?: string;
  source?: string;
  playtime?: string;
  bottomSpace?: number | string;
  inlineDropdownMenu?: boolean;
  className?: string;
  valueAppearances?: {
    version?: PlaceholderAppearanceAttributes;
    loader?: PlaceholderAppearanceAttributes;
    source?: PlaceholderAppearanceAttributes;
    playtime?: PlaceholderAppearanceAttributes;
  };
}

export function BuildConfigurationGrid({
  buildName,
  buildOptions,
  isOpen,
  onToggle,
  onSelect,
  version,
  loader,
  source,
  playtime,
  bottomSpace,
  inlineDropdownMenu = false,
  className = "",
  valueAppearances,
}: BuildConfigurationGridProps) {
  const tr = useTranslation();
  return (
    <div className={`inline-dropdown-grid${className ? ` ${className}` : ""}`}>
      <InlineDropdown
        label={tr("buildConfigurationGrid.selectBuild")}
        value={buildName}
        options={buildOptions}
        isOpen={isOpen}
        inlineMenu={inlineDropdownMenu}
        onToggle={onToggle}
        onSelect={onSelect}
      />

      <InfoPanel
        label={tr("buildConfigurationGrid.mcVersion")}
        value={version}
        placeholder={tr("buildConfigurationGrid.selectVersion")}
        bottomSpace={bottomSpace}
        valueAppearance={valueAppearances?.version}
      />

      <InfoPanel
        label={tr("buildConfigurationGrid.loader")}
        value={loader}
        placeholder={tr("buildConfigurationGrid.selectLoader")}
        bottomSpace={bottomSpace}
        valueAppearance={valueAppearances?.loader}
      />

      <InfoPanel
        label={tr("buildConfigurationGrid.source")}
        value={source}
        bottomSpace={bottomSpace}
        valueAppearance={valueAppearances?.source}
      />

      <InfoPanel
        className="info-panel--right-column"
        label={tr("buildConfigurationGrid.timeInBuild")}
        value={playtime}
        placeholder={tr("buildConfigurationGrid.0HrsOnRecord")}
        bottomSpace={bottomSpace}
        valueAppearance={valueAppearances?.playtime}
      />
    </div>
  );
}
