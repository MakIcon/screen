import "./ElementCheckbox.css";

type ElementCheckboxProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function ElementCheckbox({
  label,
  checked,
  onChange,
  disabled = false,
  className,
}: ElementCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={[
        "element-checkbox",
        checked ? "element-checkbox--checked" : "",
        disabled ? "element-checkbox--disabled" : "",
        className ?? "",
      ].join(" ")}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="element-checkbox-box" aria-hidden="true">
        <span className="element-checkbox-mark" />
      </span>
      <span className="element-checkbox-label">{label}</span>
    </button>
  );
}
