import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, CSSProperties, FocusEvent, KeyboardEvent } from "react";
import { NumberStepperArrows } from "./NumberStepperArrows";
import "./CustomNumberInput.css";

type CustomNumberInputProps = {
  value: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  showArrows?: boolean;
  showBorder?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  background?: CSSProperties["background"];
  focusBackground?: CSSProperties["background"];
};

function isFiniteMax(max: number | undefined): max is number {
  return typeof max === "number" && max !== -1;
}

function normalizeDraft(value: string) {
  return value.replace(",", ".").trim();
}

function isNumericDraft(value: string) {
  return /^-?\d*(?:[.,]\d*)?$/.test(value);
}

function clampValue(value: number, min: number, max: number | undefined) {
  const upper = isFiniteMax(max) ? max : Number.POSITIVE_INFINITY;
  return Math.min(upper, Math.max(min, value));
}

function isAtUpperBound(value: number, max: number | undefined) {
  return isFiniteMax(max) && value >= max;
}

function isAboveUpperBound(value: number, max: number | undefined) {
  return isFiniteMax(max) && value > max;
}

function decimalPlaces(value: number) {
  const [coefficient, exponent = "0"] = String(value).toLowerCase().split("e");
  return Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
}

function cleanNumber(value: number) {
  // Remove floating point noise while preserving integers and meaningful decimal digits.
  return Number.isInteger(value) ? value : Number(value.toPrecision(15));
}

export function CustomNumberInput({
  value,
  onChange,
  onCommit,
  min = 0,
  max = -1,
  step = 1,
  showArrows = true,
  showBorder = true,
  disabled = false,
  placeholder,
  ariaLabel,
  className,
  background,
  focusBackground,
}: CustomNumberInputProps) {
  const [draft, setDraft] = useState(() => String(cleanNumber(value)));
  const [focused, setFocused] = useState(false);
  const safeStep = step > 0 ? step : 1;

  const normalizedValue = useMemo(
    () => cleanNumber(clampValue(value, min, max)),
    [max, min, value],
  );

  useEffect(() => {
    if (!focused) {
      setDraft(String(normalizedValue));
    }
  }, [focused, normalizedValue]);

  const commitValue = (nextValue: number) => {
    const normalized = cleanNumber(clampValue(nextValue, min, max));
    setDraft(String(normalized));
    onChange(normalized);
    onCommit?.(normalized);
  };

  const stepValue = (direction: 1 | -1) => {
    const precision = Math.min(100, Math.max(decimalPlaces(normalizedValue), decimalPlaces(safeStep)));
    commitValue(Number((normalizedValue + direction * safeStep).toFixed(precision)));
  };

  const commitDraft = () => {
    const raw = normalizeDraft(draft);
    const parsed = Number(raw);

    if (!raw || raw === "-" || !Number.isFinite(parsed)) {
      setDraft(String(normalizedValue));
      return;
    }

    commitValue(parsed);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value;
    if (!isNumericDraft(nextDraft)) return;

    setDraft(nextDraft);
    const raw = normalizeDraft(nextDraft);
    if (!raw || raw === "-") return;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    if (parsed < min || isAboveUpperBound(parsed, max)) return;

    onChange(parsed);
  };

  const handleBlur = (_event: FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    commitDraft();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      stepValue(1);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      stepValue(-1);
    }
  };

  const incrementDisabled = disabled || isAtUpperBound(normalizedValue, max);
  const decrementDisabled = disabled || normalizedValue <= min;

  return (
    <div
      className={[
        "cni-root",
        showArrows ? "cni-root--with-arrows" : "",
        !showBorder ? "cni-root--borderless" : "",
        disabled ? "cni-root--disabled" : "",
        className,
      ].filter(Boolean).join(" ")}
      style={{
        "--cni-background": background,
        "--cni-focus-background": focusBackground ?? background,
      } as CSSProperties}
    >
      <input
        className="cni-input"
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {showArrows && (
        <NumberStepperArrows
          disabled={disabled}
          incrementDisabled={incrementDisabled}
          decrementDisabled={decrementDisabled}
          onIncrement={() => stepValue(1)}
          onDecrement={() => stepValue(-1)}
        />
      )}
    </div>
  );
}
