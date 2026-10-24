import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ColorPicker } from "../components/color-picker/ColorPicker";
import { CustomNumberInput } from "../components/inputs/CustomNumberInput";
import { ElementSlider } from "../components/inputs/ElementSlider";
import { InlineDropdown } from "../components/inputs/InlineDropdown";
import { useAppearanceText } from "./localization";

type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const copy = useAppearanceText();
  return (
    <div className="studio-color-field">
      <span>{copy(label)}</span>
      <ColorPicker value={value} onChange={onChange} label={copy(label)} />
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
  const copy = useAppearanceText();
  const displayedSuffix = value === 0 && zeroSuffix ? zeroSuffix : suffix;
  const updateValue = (nextValue: number) => {
    const safeStep = step > 0 ? step : 1;
    const stepped = min + Math.round((nextValue - min) / safeStep) * safeStep;
    const precision = Math.min(8, Math.max(0, String(safeStep).split(".")[1]?.length ?? 0));
    onChange(Math.min(max, Math.max(min, Number(stepped.toFixed(precision)))));
  };

  return (
    <div className="studio-range-field">
      <div className="studio-range-field-heading">
        <span>{copy(label)}</span>
        <div className="studio-range-value-editor">
          <CustomNumberInput
            value={value}
            min={min}
            max={max}
            step={step}
            showArrows={false}
            disabled={disabled || !valueEditable}
            ariaLabel={copy("{label} value", { label: copy(label) })}
            onChange={updateValue}
          />
          {displayedSuffix && <span>{copy(displayedSuffix.trim())}</span>}
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
  translateOptions?: boolean;
  onChange: (value: T) => void;
};

export function SelectField<T extends string>({
  label,
  value,
  options,
  translateOptions = true,
  onChange,
}: SelectFieldProps<T>) {
  const copy = useAppearanceText();
  const displayedOptions = options.map((option) => ({
    ...option,
    label: translateOptions ? copy(option.label) : option.label,
  }));
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = displayedOptions.find((option) => option.id === value)?.label ?? value;

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
      <span>{copy(label)}</span>
      <InlineDropdown
        compact
        label={copy(label)}
        value={selectedLabel}
        options={displayedOptions.map((option) => option.label)}
        isOpen={isOpen}
        onToggle={() => setIsOpen((current) => !current)}
        onSelect={(nextLabel) => {
          const nextOption = displayedOptions.find((option) => option.label === nextLabel);
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
  defaultOpen = true,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const copy = useAppearanceText();
  const [expanded, setExpanded] = useState(defaultOpen);
  const contentId = useId();
  useEffect(() => setExpanded(defaultOpen), [title, defaultOpen]);
  return (
    <section className={`studio-section${expanded ? "" : " is-collapsed"}`}>
      <button
        className="studio-section-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="studio-section-heading">
          <span>{copy(title)}</span>
          {note && <span className="studio-section-note">{copy(note)}</span>}
        </span>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      <div className="studio-section-content" id={contentId} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
