import type { CSSProperties } from "react";
import { useAppearanceComponentSettings } from "../../appearance/useAppearanceComponentSettings";
import "./ElementToggle.css";

interface ElementToggleProps {
  title: string;
  note: string;
  enabled: boolean;
  onToggle: () => void;
  mascotOffSwitch?: boolean;
}

export function ElementToggle({
  title,
  note,
  enabled,
  onToggle,
  mascotOffSwitch = false,
}: ElementToggleProps) {
  const { settings, appearanceProps } = useAppearanceComponentSettings("toggle", {
    title,
    note,
    showNote: true,
    compact: false,
    switchScale: 1,
  });
  const style = {
    "--element-toggle-scale": settings.switchScale,
  } as CSSProperties;

  return (
    <div
      {...appearanceProps}
      className={`settings-toggle-row${settings.compact ? " settings-toggle-row--compact" : ""}`}
      style={style}
    >
      <div className="settings-toggle-copy">
        <span className="settings-toggle-title">{settings.title}</span>
        {settings.showNote && <p className="settings-toggle-note">{settings.note}</p>}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={settings.title}
        className={`toggle-switch ${enabled ? "enabled" : ""}`}
        onClick={onToggle}
        data-mascot-off-switch={mascotOffSwitch ? "true" : undefined}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}
