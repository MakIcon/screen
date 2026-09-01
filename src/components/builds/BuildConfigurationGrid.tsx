import type { PlaceholderAppearanceAttributes } from "../../utils/placeholders";
import { InfoPanel } from "../display/InfoPanel";
import { InlineDropdown } from "../inputs/InlineDropdown";

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
  return (
    <div className={`inline-dropdown-grid${className ? ` ${className}` : ""}`}>
      <InlineDropdown
        label="SELECT BUILD"
        value={buildName}
        options={buildOptions}
        isOpen={isOpen}
        inlineMenu={inlineDropdownMenu}
        onToggle={onToggle}
        onSelect={onSelect}
      />

      <InfoPanel
        label="MC VERSION"
        value={version}
        placeholder="SELECT VERSION"
        bottomSpace={bottomSpace}
        valueAppearance={valueAppearances?.version}
      />

      <InfoPanel
        label="LOADER"
        value={loader}
        placeholder="SELECT LOADER"
        bottomSpace={bottomSpace}
        valueAppearance={valueAppearances?.loader}
      />

      <InfoPanel
        label="SOURCE"
        value={source}
        bottomSpace={bottomSpace}
        valueAppearance={valueAppearances?.source}
      />

      <InfoPanel
        className="info-panel--right-column"
        label="TIME IN BUILD"
        value={playtime}
        placeholder="0 hrs on record"
        bottomSpace={bottomSpace}
        valueAppearance={valueAppearances?.playtime}
      />
    </div>
  );
}
