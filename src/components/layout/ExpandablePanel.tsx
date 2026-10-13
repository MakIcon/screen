import { useId, useState, type ReactNode } from "react";
import "./ExpandablePanel.css";

export type ExpandablePanelProps = {
  title: string;
  /** Any custom SVG, image or React element. Omit for a panel without an icon. */
  icon?: ReactNode;
  children: ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function ExpandablePanel({
  title,
  icon,
  children,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  disabled = false,
  className = "",
}: ExpandablePanelProps) {
  const contentId = useId();
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const open = expanded ?? localExpanded;

  return (
    <div className={`expandable-panel${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className="expandable-panel-trigger"
        aria-expanded={open}
        aria-controls={contentId}
        disabled={disabled}
        onClick={() => {
          if (expanded === undefined) setLocalExpanded(!open);
          onExpandedChange?.(!open);
        }}
      >
        {icon != null && icon !== false && (
          <span className="expandable-panel-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="expandable-panel-title">{title}</span>
        <svg className="expandable-panel-indicator" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="7" width="12" height="2" />
          <rect className="expandable-panel-indicator-vertical" x="7" y="2" width="2" height="12" />
        </svg>
      </button>
      <div id={contentId} className="expandable-panel-content" hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}
