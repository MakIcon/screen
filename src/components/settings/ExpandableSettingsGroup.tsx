import type { ReactNode } from "react";
import { ElementToggle } from "../inputs/ElementToggle";
import "./ExpandableSettingsGroup.css";

interface ExpandableSettingsGroupProps {
  title: string;
  note: string;
  enabled: boolean;
  expanded: boolean;
  onToggle: () => void;
  onToggleExpanded: () => void;
  children: ReactNode;
  mascotOffSwitch?: boolean;
  className?: string;
}

export function ExpandableSettingsGroup({
  title,
  note,
  enabled,
  expanded,
  onToggle,
  onToggleExpanded,
  children,
  mascotOffSwitch = false,
  className = "",
}: ExpandableSettingsGroupProps) {
  return (
    <div
      className={`expandable-settings-group${expanded ? " expanded" : ""}${className ? ` ${className}` : ""}`}
    >
      <ElementToggle
        title={title}
        note={note}
        enabled={enabled}
        onToggle={onToggle}
        mascotOffSwitch={mascotOffSwitch}
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
      />

      {expanded && <div className="expandable-settings-panel">{children}</div>}
    </div>
  );
}
