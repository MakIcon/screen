import { useId, useState, type ReactNode } from "react";
import { ElementToggle } from "../inputs/ElementToggle";

type PluginSettingsGroupProps = {
  title: string;
  description?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  enabled?: boolean;
  onToggle?: () => void;
};

export function PluginSettingsGroup({
  title,
  description,
  children,
  collapsible = true,
  defaultExpanded = false,
  enabled,
  onToggle,
}: PluginSettingsGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const visible = !collapsible || expanded;
  const contentId = useId();
  return (
    <section
      className={`plugin-settings-group${visible ? " is-expanded" : ""}${!collapsible ? " plugin-settings-group--static" : ""}${!collapsible && onToggle && !enabled ? " plugin-settings-group--inactive" : ""}`}
    >
      <div className="plugin-settings-group-head">
        {onToggle ? (
          <ElementToggle
            title={title}
            note={description ?? ""}
            size={0.75}
            enabled={Boolean(enabled)}
            onToggle={onToggle}
            expanded={collapsible ? expanded : undefined}
            expandedControls={collapsible ? contentId : undefined}
            onToggleExpanded={collapsible ? () => setExpanded((current) => !current) : undefined}
          />
        ) : !collapsible ? (
          <h4 className="plugin-settings-group-title">{title}</h4>
        ) : (
          <button
            type="button"
            className="plugin-settings-group-trigger"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((current) => !current)}
          >
            <span className="plugin-settings-group-copy">
              <strong>{title}</strong>
              {description && <span>{description}</span>}
            </span>
            <span className="plugin-settings-group-arrow" aria-hidden="true">
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                <path d="m1 1.5 5 5 5-5" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <div id={contentId} className="plugin-settings-group-body" hidden={!visible}>
        {children}
      </div>
    </section>
  );
}
