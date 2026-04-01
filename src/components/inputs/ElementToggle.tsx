import "./ElementToggle.css";

interface ElementToggleProps {
  title: string;
  note: string;
  enabled: boolean;
  onToggle: () => void;
}

export function ElementToggle({
  title,
  note,
  enabled,
  onToggle,
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
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}
