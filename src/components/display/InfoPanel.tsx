import type { CSSProperties, ReactNode } from "react";
import type { PlaceholderAppearanceAttributes } from "../../utils/placeholders";
import "./InfoPanel.css";

type InfoPanelProps = {
  label: string;
  value?: ReactNode;
  placeholder?: ReactNode;
  bottomSpace?: number | string;
  className?: string;
  valueAppearance?: PlaceholderAppearanceAttributes;
};

export function InfoPanel({
  label,
  value,
  placeholder = "...",
  bottomSpace,
  className = "",
  valueAppearance,
}: InfoPanelProps) {
  const isEmpty = value === null || value === undefined || value === "";
  const resolvedValue = isEmpty ? placeholder : value;
  const style =
    bottomSpace === undefined
      ? undefined
      : ({
          "--info-panel-bottom-space":
            typeof bottomSpace === "number" ? `${bottomSpace}px` : bottomSpace,
        } as CSSProperties);

  return (
    <div className={`info-panel ${className}`.trim()} style={style}>
      <span className="info-panel-label">{label}</span>
      <strong className="info-panel-value" {...valueAppearance}>
        {resolvedValue}
      </strong>
    </div>
  );
}
