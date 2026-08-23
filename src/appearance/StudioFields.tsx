import { useEffect, useRef, useState, type ReactNode } from "react";
import { ColorPicker } from "../components/color-picker/ColorPicker";
import { CustomNumberInput } from "../components/inputs/CustomNumberInput";
import { ElementSlider } from "../components/inputs/ElementSlider";
import { InlineDropdown } from "../components/inputs/InlineDropdown";

type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div className="studio-color-field">
      <span>{label}</span>
      <ColorPicker value={value} onChange={onChange} label={label} />
    </div>
  );
}

type RangeFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  zeroSuffix?: string;
  disabled?: boolean;
  defaultValue?: number;
  valueEditable?: boolean;
  onChange: (value: number) => void;
};

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  zeroSuffix,
  disabled = false,
  defaultValue,
  valueEditable = true,
  onChange,
}: RangeFieldProps) {
  const displayedSuffix = value === 0 && zeroSuffix ? zeroSuffix : suffix;
  const updateValue = (nextValue: number) => {
    const safeStep = step > 0 ? step : 1;
    const stepped = min + Math.round((nextValue - min) / safeStep) * safeStep;
    const precision = Math.min(8, Math.max(0, String(safeStep).split(".")[1]?.length ?? 0));
    onChange(Math.min(max, Math.max(min, Number(stepped.toFixed(precision)))));
  };

  return (
    <div className="studio-range-field">
      <div>
        <span>{label}</span>
        <div className="studio-range-value-editor">
          <CustomNumberInput
            value={value}
            min={min}
            max={max}
            step={step}
            showArrows={false}
            disabled={disabled || !valueEditable}
            ariaLabel={`${label} value`}
            onChange={updateValue}
          />
          {displayedSuffix && <span>{displayedSuffix.trim()}</span>}
        </div>
      </div>
      <ElementSlider
        className="studio-field-slider"
        showHeader={false}
        showValue={false}
        valueEditable={false}
        showDefaultMarker={defaultValue !== undefined}
        defaultValue={defaultValue ?? value}
        tickMode="none"
        value={value}
        min={min}
        max={max}
        step={step}
        keyboardEnabled={!disabled}
        disabled={disabled}
        onChange={updateValue}
      />
    </div>
  );
}

type SelectFieldProps<T extends string> = {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
};

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((option) => option.id === value)?.label ?? value;

  useEffect(() => {
    if (!isOpen) return;

    const closeOutside = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".inline-dropdown-menu-portal")) return;
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [isOpen]);

  return (
    <div className="studio-select-field" ref={rootRef}>
      <span>{label}</span>
      <InlineDropdown
        compact
        label={label}
        value={selectedLabel}
        options={options.map((option) => option.label)}
        isOpen={isOpen}
        onToggle={() => setIsOpen((current) => !current)}
        onSelect={(nextLabel) => {
          const nextOption = options.find((option) => option.label === nextLabel);
          if (nextOption) onChange(nextOption.id);
          setIsOpen(false);
        }}
      />
    </div>
  );
}

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="studio-section">
      <div className="studio-section-heading">
        <span>{title}</span>
        {note && <p>{note}</p>}
      </div>
      {children}
    </section>
  );
}
