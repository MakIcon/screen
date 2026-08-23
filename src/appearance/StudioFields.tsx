import { useEffect, useState, type ReactNode } from "react";

type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [textValue, setTextValue] = useState(value.toUpperCase());

  useEffect(() => {
    setTextValue(value.toUpperCase());
  }, [value]);

  return (
    <label className="studio-color-field">
      <span>{label}</span>
      <div>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input
          value={textValue}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value;
            setTextValue(next);
            if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next);
          }}
          onBlur={() => setTextValue(value.toUpperCase())}
        />
      </div>
    </label>
  );
}

type RangeFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
};

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: RangeFieldProps) {
  return (
    <label className="studio-range-field">
      <div>
        <span>{label}</span>
        <strong>
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix}
        </strong>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
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
  return (
    <label className="studio-select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
