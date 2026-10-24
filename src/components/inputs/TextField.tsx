import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type Ref,
} from "react";
import { useAppearanceComponentSettings } from "../../appearance/useAppearanceComponentSettings";
import { TEXT_FIELD_DEFAULTS } from "../../appearance/componentDefaults";
import type { AppearanceTextFieldSettings } from "../../appearance/types";
import { useTranslation } from "../../i18n/locale";
import "./TextField.css";

type Extras = {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
  settings?: Partial<AppearanceTextFieldSettings>;
};
export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> &
  Extras & { ref?: Ref<HTMLInputElement> };
export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  Extras & { ref?: Ref<HTMLTextAreaElement> };

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/** Use a real input event so existing controlled fields keep their validation and saved state. */
export function changeTextControlValue(
  control: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

function TextControl({
  multiline,
  ...props
}: (TextFieldProps | TextAreaProps) & { multiline: boolean }) {
  const {
    label = "",
    hint = "",
    error,
    containerClassName = "",
    settings: defaults,
    ref: forwardedRef,
    ...native
  } = props;
  const generatedId = useId();
  const id = native.id ?? generatedId;
  const tr = useTranslation();
  const controlRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [length, setLength] = useState(String(native.value ?? native.defaultValue ?? "").length);
  const [copied, setCopied] = useState(false);
  const sensitive = !multiline && (native as TextFieldProps).type === "password";
  const { settings, appearanceProps } = useAppearanceComponentSettings<
    "textfield",
    HTMLSpanElement
  >("textfield", {
    ...TEXT_FIELD_DEFAULTS,
    label,
    hint,
    placeholder: native.placeholder ?? "",
    defaultValue: sensitive ? "" : String(native.defaultValue ?? ""),
    maxLength: native.maxLength ?? 0,
    rows: multiline ? ((native as TextAreaProps).rows ?? 2) : 3,
    ...defaults,
  });
  // A profile may tighten a field limit, but cannot relax the screen's validation contract.
  const limit = Math.min(
    native.maxLength ?? Infinity,
    settings.maxLength > 0 ? settings.maxLength : Infinity,
  );
  const count = native.value !== undefined ? String(native.value).length : length;
  const editable = !native.disabled && !native.readOnly;
  const actions = [
    settings.showClear && editable,
    settings.showCopy,
    settings.showReset && editable && !sensitive,
    settings.showPasswordToggle && sensitive,
  ].filter(Boolean).length;
  const style: CSSProperties = {
    ...native.style,
    ...(settings.height > 0 ? { height: settings.height } : {}),
    ...(settings.paddingX >= 0 ? { paddingInline: settings.paddingX } : {}),
    ...(settings.fontSize > 0 ? { fontSize: settings.fontSize } : {}),
    ...(settings.borderRadius >= 0 ? { borderRadius: settings.borderRadius } : {}),
    ...(settings.textAlign !== "inherit" ? { textAlign: settings.textAlign } : {}),
    ...(multiline && settings.resize !== "inherit" ? { resize: settings.resize } : {}),
    ...(actions ? { paddingRight: actions * 28 + 10 } : {}),
  };
  const shared = {
    ...native,
    autoComplete: native.autoComplete ?? "off",
    id,
    style,
    className: `text-field-control ${native.className ?? ""}`,
    placeholder: settings.showPlaceholder ? settings.placeholder : undefined,
    defaultValue:
      native.value === undefined
        ? sensitive
          ? native.defaultValue
          : settings.defaultValue
        : undefined,
    maxLength: Number.isFinite(limit) ? limit : undefined,
    "aria-invalid": error ? true : native["aria-invalid"],
    "aria-labelledby":
      native["aria-labelledby"] ||
      (settings.showLabel && settings.label ? `${id}-label` : undefined),
    "aria-describedby":
      [
        native["aria-describedby"],
        error || (settings.showHint && settings.hint) ? `${id}-hint` : "",
        settings.showCounter ? `${id}-counter` : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      controlRef.current = element;
      assignRef(forwardedRef as Ref<HTMLInputElement | HTMLTextAreaElement> | undefined, element);
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setLength(event.currentTarget.value.length);
      setCopied(false);
      (native.onChange as ((change: typeof event) => void) | undefined)?.(event);
    },
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (settings.selectOnFocus) event.currentTarget.select();
      (native.onFocus as ((focus: typeof event) => void) | undefined)?.(event);
    },
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (
        settings.trimOnBlur &&
        editable &&
        !sensitive &&
        event.currentTarget.value !== event.currentTarget.value.trim()
      )
        changeTextControlValue(event.currentTarget, event.currentTarget.value.trim());
      (native.onBlur as ((blur: typeof event) => void) | undefined)?.(event);
    },
  };
  const setValue = (value: string) => {
    if (!controlRef.current) return;
    changeTextControlValue(
      controlRef.current,
      value.slice(0, Number.isFinite(limit) ? limit : undefined),
    );
    setLength(controlRef.current.value.length);
    controlRef.current.focus();
  };
  return (
    <span
      {...appearanceProps}
      className={`text-field ${containerClassName}`}
      data-label={settings.label || native["aria-label"] || native.placeholder}
      style={{
        font: "inherit",
        color: "inherit",
        letterSpacing: "inherit",
        textTransform: "inherit",
      }}
      data-invalid={error ? "true" : undefined}
    >
      {settings.showLabel && settings.label && (
        <span className="text-field-label" id={`${id}-label`}>
          {settings.label}
        </span>
      )}
      <span
        className="text-field-body"
        style={{
          font: "inherit",
          color: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
        }}
      >
        {multiline ? (
          <textarea {...(shared as TextAreaProps)} rows={settings.rows} />
        ) : (
          <input
            {...(shared as TextFieldProps)}
            type={sensitive && revealed ? "text" : (native as TextFieldProps).type}
          />
        )}
        {actions > 0 && (
          <span
            className="text-field-actions"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {settings.showClear && editable && (
              <button
                type="button"
                aria-label={tr("components.clear")}
                data-tooltip={tr("components.clear")}
                disabled={!count}
                onClick={() => setValue("")}
              >
                ×
              </button>
            )}
            {settings.showReset && editable && !sensitive && (
              <button
                type="button"
                aria-label={tr("components.reset")}
                data-tooltip={tr("components.reset")}
                onClick={() => setValue(settings.defaultValue)}
              >
                ↺
              </button>
            )}
            {settings.showCopy && (
              <button
                type="button"
                aria-label={tr("components.copy")}
                data-tooltip={tr(copied ? "components.copied" : "components.copy")}
                disabled={native.disabled || (sensitive && !revealed)}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(controlRef.current?.value ?? "")
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
              >
                ⧉
              </button>
            )}
            {settings.showPasswordToggle && sensitive && (
              <button
                type="button"
                aria-label={tr(revealed ? "components.hidePassword" : "components.showPassword")}
                aria-pressed={revealed}
                onClick={() => setRevealed((current) => !current)}
              >
                ◉
              </button>
            )}
          </span>
        )}
      </span>
      {(error || (settings.showHint && settings.hint)) && (
        <span id={`${id}-hint`} className="text-field-hint" role={error ? "alert" : undefined}>
          {error || settings.hint}
        </span>
      )}
      {settings.showCounter && (
        <span id={`${id}-counter`} className="text-field-counter">
          {count}
          {Number.isFinite(limit) ? ` / ${limit}` : ""}
        </span>
      )}
    </span>
  );
}

export function TextField(props: TextFieldProps) {
  return <TextControl {...props} multiline={false} />;
}
export function TextArea(props: TextAreaProps) {
  return <TextControl {...props} multiline />;
}
