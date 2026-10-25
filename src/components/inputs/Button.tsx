import type { ButtonHTMLAttributes, CSSProperties, ReactNode, Ref } from "react";
import { BUTTON_DEFAULTS } from "../../appearance/componentDefaults";
import type { AppearanceButtonSettings } from "../../appearance/types";
import { useAppearanceComponentSettings } from "../../appearance/useAppearanceComponentSettings";
import "./Button.css";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  /** Use inherit to keep an existing screen's colors and hover styles. */
  variant?: AppearanceButtonSettings["variant"];
  size?: AppearanceButtonSettings["size"];
  icon?: ReactNode;
  iconPosition?: AppearanceButtonSettings["iconPosition"];
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /** Used by IconButton; its icon and accessible name always remain available. */
  iconOnly?: boolean;
  settings?: Partial<AppearanceButtonSettings>;
  "data-tooltip"?: string;
};

/** A native button: appearance settings never override disabled or loading state. */
export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  iconPosition = "start",
  fullWidth = false,
  loading = false,
  loadingLabel,
  iconOnly = false,
  settings: defaults,
  disabled = false,
  type = "button",
  className = "",
  style,
  ref,
  "aria-label": ariaLabel,
  ...native
}: ButtonProps) {
  const label =
    typeof children === "string" || typeof children === "number" ? String(children) : "";
  const { rootRef, settings, appearanceProps } = useAppearanceComponentSettings<
    "button",
    HTMLButtonElement
  >("button", {
    ...BUTTON_DEFAULTS,
    variant,
    size,
    iconPosition,
    fullWidth,
    ...defaults,
    iconOnly,
  });
  const renderedLabel = settings.label || label;
  const accessibleLabel =
    loading && loadingLabel ? loadingLabel : iconOnly ? renderedLabel || ariaLabel : ariaLabel;
  const showIcon = icon != null && (iconOnly || settings.showIcon);
  const buttonStyle = {
    ...(settings.height > 0 ? { height: settings.height, minHeight: settings.height } : {}),
    ...(settings.paddingX >= 0 ? { paddingInline: settings.paddingX } : {}),
    ...(settings.fontSize > 0 ? { fontSize: settings.fontSize } : {}),
    ...(settings.borderRadius >= 0 ? { "--button-radius": `${settings.borderRadius}px` } : {}),
    "--button-icon-size": `${settings.iconSize}px`,
    "--button-gap": `${settings.gap}px`,
    ...style,
  } as CSSProperties;

  return (
    <button
      {...native}
      {...appearanceProps}
      ref={(node) => {
        rootRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type={type}
      className={`element-button${iconOnly ? " element-button--icon" : ""}${className ? ` ${className}` : ""}`}
      style={buttonStyle}
      disabled={disabled || loading}
      aria-label={accessibleLabel}
      aria-busy={loading || native["aria-busy"] || undefined}
      data-variant={settings.variant}
      data-size={settings.size}
      data-full-width={settings.fullWidth || undefined}
      data-loading={loading || undefined}
    >
      <span className="element-button-content" data-icon-position={settings.iconPosition}>
        {showIcon && (
          <span className="element-button-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {!iconOnly && <span className="element-button-label">{renderedLabel || children}</span>}
      </span>
      {loading && <span className="element-button-spinner" aria-hidden="true" />}
    </button>
  );
}
