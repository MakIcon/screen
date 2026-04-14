import "./OptionToggle.css";

interface OptionToggleProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function OptionToggle({ enabled, onToggle, disabled = false }: OptionToggleProps) {
  return (
    <button
      type="button"
      className={`option-toggle${enabled ? " on" : ""}${disabled ? " disabled" : ""}`}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(); }}
      tabIndex={-1}
    >
      <span className="option-toggle-knob" />
    </button>
  );
}
