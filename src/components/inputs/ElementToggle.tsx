import type { CSSProperties } from "react";
import { useAppearanceComponentSettings } from "../../appearance/useAppearanceComponentSettings";
import "./ElementToggle.css";
import { useTranslation } from "../../i18n/locale";

interface ElementToggleProps {
  title: string;
  note: string;
  enabled: boolean;
  onToggle: () => void;
  size?: "normal" | "small" | "large" | number;
  mascotOffSwitch?: boolean;
  expanded?: boolean;
  expandedControls?: string;
  onToggleExpanded?: () => void;
  guideTarget?: string;
}

const TOGGLE_SIZE_SCALE = {
  normal: 1,
  small: 0.6,
  large: 1.25,
} as const;

function resolveToggleSizeScale(size: NonNullable<ElementToggleProps["size"]>) {
  if (typeof size !== "number") return TOGGLE_SIZE_SCALE[size];
  if (!Number.isFinite(size)) return TOGGLE_SIZE_SCALE.normal;
  return Math.min(2, Math.max(0.35, size));
}

export function ElementToggle({
  title,
  note,
  enabled,
  onToggle,
  size = "normal",
  mascotOffSwitch = false,
  expanded,
  expandedControls,
  onToggleExpanded,
  guideTarget,
}: ElementToggleProps) {
  const tr = useTranslation();
  const { settings, appearanceProps } = useAppearanceComponentSettings("toggle", {
    title,
    note,
    showNote: true,
    compact: false,
    switchScale: 1,
  });
  const sizeClass = typeof size === "number" ? "custom" : size;
  const style = {
    "--element-toggle-scale": settings.switchScale * resolveToggleSizeScale(size),
  } as CSSProperties;

  return (
    <div
      {...appearanceProps}
      className={`settings-toggle-row settings-toggle-row--${sizeClass}${settings.compact ? " settings-toggle-row--compact" : ""}`}
      data-guide-target={guideTarget}
      style={style}
    >
      <div className="settings-toggle-copy">
        <span className="settings-toggle-title">{settings.title}</span>
        {settings.showNote && <p className="settings-toggle-note">{settings.note}</p>}
      </div>

      <div className="settings-toggle-actions">
        {onToggleExpanded && (
          <button
            type="button"
            className={`settings-toggle-expand${expanded ? " expanded" : ""}`}
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            aria-controls={expandedControls}
            aria-label={tr("elementToggle.toggleSettings", {
              action: expanded ? tr("elementToggle.hide") : tr("elementToggle.show"),
              title: settings.title,
            })}
          >
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
              <path d="m1 1.5 5 5 5-5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={settings.title}
          className={`toggle-switch ${enabled ? "enabled" : ""}`}
          onClick={onToggle}
          data-mascot-off-switch={mascotOffSwitch ? "true" : undefined}
        >
          <span className="toggle-knob" />
        </button>
      </div>
    </div>
  );
}
