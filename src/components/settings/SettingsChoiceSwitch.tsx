import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface SettingsChoiceOption {
  value: string;
  label: string;
  icon?: ReactNode;
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement> & { "data-tooltip"?: string };
}

export function SettingsChoiceSwitch({
  options,
  value,
  onChange,
  className = "",
}: {
  options: SettingsChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`theme-switch${className ? ` ${className}` : ""}`}>
      {options.map((option) => (
        <button
          {...option.buttonProps}
          key={option.value}
          className={`theme-switch-btn${option.buttonProps?.className ? ` ${option.buttonProps.className}` : ""}${value === option.value ? " active" : ""}`}
          type="button"
          aria-pressed={value === option.value}
          data-choice-value={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
