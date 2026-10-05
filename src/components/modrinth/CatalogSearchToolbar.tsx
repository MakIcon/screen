import type { ComponentProps } from "react";
import { CatalogSearchField } from "./CatalogSearchField";

export function CatalogSearchToolbar({
  guideTarget,
  ...fieldProps
}: ComponentProps<typeof CatalogSearchField> & { guideTarget?: string }) {
  return (
    <div className="panel-card catalog-toolbar-card" data-guide-target={guideTarget}>
      <div className="toolbar-row toolbar-row-single modrinth-toolbar-grid">
        <CatalogSearchField {...fieldProps} />
      </div>
    </div>
  );
}
