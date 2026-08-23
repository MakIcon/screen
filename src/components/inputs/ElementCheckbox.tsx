import type { CSSProperties } from "react";
import { useAppearanceComponentSettings } from "../../appearance/useAppearanceComponentSettings";
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
  const { settings, appearanceProps } = useAppearanceComponentSettings<
    "checkbox",
    HTMLButtonElement
  >("checkbox", {
    label,
    indicatorSize: 16,
    labelGap: 10,
  });
  const style = {
    "--element-checkbox-size": `${settings.indicatorSize}px`,
    "--element-checkbox-gap": `${settings.labelGap}px`,
  } as CSSProperties;

  return (
    <button
      {...appearanceProps}
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
      style={style}
    >
      <span className="element-checkbox-box" aria-hidden="true">
        <span className="element-checkbox-mark" />
      </span>
      <span className="element-checkbox-label">{settings.label}</span>
    </button>
  );
}
