import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { BADGE_DEFAULTS } from "../../appearance/componentDefaults";
import type { AppearanceBadgeSettings } from "../../appearance/types";
import { useAppearanceComponentSettings } from "../../appearance/useAppearanceComponentSettings";
import "./Badge.css";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  ref?: Ref<HTMLSpanElement>;
  tone?: AppearanceBadgeSettings["tone"];
  variant?: AppearanceBadgeSettings["variant"];
  size?: AppearanceBadgeSettings["size"];
  icon?: ReactNode;
  showDot?: boolean;
  pulse?: boolean;
  settings?: Partial<AppearanceBadgeSettings>;
  "data-tooltip"?: string;
};

/** Passive metadata that can safely appear inside a card or button. */
export function Badge({
  children,
  tone = "neutral",
  variant = "soft",
  size = "md",
  icon,
  showDot = false,
  pulse = false,
  settings: defaults,
  className = "",
  style,
  ref,
  ...native
}: BadgeProps) {
  const { rootRef, settings, appearanceProps } = useAppearanceComponentSettings<
    "badge",
    HTMLSpanElement
  >("badge", { ...BADGE_DEFAULTS, tone, variant, size, showDot, pulse, ...defaults });
  const badgeStyle = {
    ...(settings.paddingX >= 0 ? { paddingInline: settings.paddingX } : {}),
    ...(settings.fontSize > 0 ? { fontSize: settings.fontSize } : {}),
    ...(settings.borderRadius >= 0 ? { borderRadius: settings.borderRadius } : {}),
    ...style,
  } as CSSProperties;
  return (
    <span
      {...native}
      {...appearanceProps}
      ref={(node) => {
        rootRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={`element-badge${className ? ` ${className}` : ""}`}
      data-tone={settings.tone}
      data-variant={settings.variant}
      data-size={settings.size}
      data-pulse={settings.pulse || undefined}
      style={badgeStyle}
    >
      {settings.showDot && <span className="element-badge-dot" aria-hidden="true" />}
      {settings.showIcon && icon != null && (
        <span className="element-badge-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="element-badge-label">{settings.label || children}</span>
    </span>
  );
}
