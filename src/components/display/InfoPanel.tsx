import type { ReactNode } from "react";
import "./InfoPanel.css";

type InfoPanelProps = {
  label: string;
  value?: ReactNode;
  placeholder?: ReactNode;
  className?: string;
};

export function InfoPanel({
  label,
  value,
  placeholder = "...",
  className = "",
}: InfoPanelProps) {
  const isEmpty = value === null || value === undefined || value === "";
  const resolvedValue = isEmpty ? placeholder : value;

  return (
    <div className={`info-panel ${className}`.trim()}>
      <span className="info-panel-label">{label}</span>
      <strong className="info-panel-value">{resolvedValue}</strong>
    </div>
  );
}
