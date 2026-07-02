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
  return (
    <div className="settings-toggle-row">
      <div>
        <span className="settings-toggle-title">{title}</span>
        <p className="settings-toggle-note">{note}</p>
      </div>

      <button
        type="button"
        className={`toggle-switch ${enabled ? "enabled" : ""}`}
        onClick={onToggle}
        data-mascot-off-switch={mascotOffSwitch ? "true" : undefined}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}
