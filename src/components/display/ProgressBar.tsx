import { type CSSProperties, type ReactNode } from "react";
import { useAppearanceComponentSettings } from "../../appearance/useAppearanceComponentSettings";
import { PROGRESS_BAR_DEFAULTS } from "../../appearance/componentDefaults";
import type { AppearanceProgressBarSettings } from "../../appearance/types";
import { useTranslation } from "../../i18n/locale";
import "./ProgressBar.css";

export type ProgressBarProps = {
  value: number | null;
  min?: number;
  max?: number;
  label?: string;
  detail?: ReactNode;
  valueLabel?: ReactNode;
  state?: "running" | "paused" | "error" | "success";
  className?: string;
  headerClassName?: string;
  trackClassName?: string;
  fillClassName?: string;
  detailClassName?: string;
  style?: CSSProperties;
  settings?: Partial<AppearanceProgressBarSettings>;
  "aria-label"?: string;
  "aria-valuetext"?: string;
  "data-tooltip"?: string;
};

export function progressMetrics(value: number | null, min: number, max: number) {
  const lower = Number.isFinite(min) ? min : 0;
  const upper = Number.isFinite(max) && max > lower ? max : lower + 1;
  const determinate = value !== null && Number.isFinite(value);
  const current = determinate ? Math.max(lower, Math.min(upper, value)) : lower;
  return {
    min: lower,
    max: upper,
    value: current,
    determinate,
    percent: ((current - lower) / (upper - lower)) * 100,
  };
}

export function progressTicks(
  settings: Pick<AppearanceProgressBarSettings, "tickMode" | "customTicks">,
) {
  const ticks =
    settings.tickMode === "quarters"
      ? [0, 25, 50, 75, 100]
      : settings.tickMode === "tenths"
        ? Array.from({ length: 11 }, (_, index) => index * 10)
        : settings.tickMode === "custom"
          ? settings.customTicks
          : [];
  return [
    ...new Set(ticks.filter((tick) => Number.isFinite(tick) && tick >= 0 && tick <= 100)),
  ].sort((a, b) => a - b);
}

export function ProgressBar({
  value,
  min = 0,
  max = 100,
  label = "",
  detail,
  valueLabel,
  state = "running",
  className = "",
  headerClassName = "",
  trackClassName = "",
  fillClassName = "",
  detailClassName = "",
  style,
  settings: defaults,
  "aria-label": ariaLabel,
  "aria-valuetext": ariaValueText,
  "data-tooltip": tooltip,
}: ProgressBarProps) {
  const tr = useTranslation();
  const { settings, appearanceProps } = useAppearanceComponentSettings("progressbar", {
    ...PROGRESS_BAR_DEFAULTS,
    label,
    showLabel: Boolean(label),
    showDetail: Boolean(detail),
    ...defaults,
  });
  const metrics = progressMetrics(value, min, max);
  const precision = Math.max(0, Math.min(3, Math.round(settings.precision)));
  const formatted = !metrics.determinate
    ? "…"
    : settings.valueFormat === "fraction"
      ? `${metrics.value.toFixed(precision)} / ${metrics.max.toFixed(precision)}`
      : settings.valueFormat === "value"
        ? metrics.value.toFixed(precision)
        : `${metrics.percent.toFixed(precision)}%`;
  // A custom screen label supplies its original format until a profile explicitly changes it.
  const displayValue =
    valueLabel !== undefined &&
    settings.valueFormat === (defaults?.valueFormat ?? "percent") &&
    precision === (defaults?.precision ?? 0)
      ? valueLabel
      : formatted;
  const ticks = progressTicks(settings);
  const marker = Math.max(0, Math.min(100, settings.defaultValue));
  const segment = 100 / Math.max(2, Math.round(settings.segmentCount));
  const variables = {
    "--progress-height": `${Math.max(1, settings.height)}px`,
    "--progress-radius":
      settings.borderRadius >= 0
        ? `${settings.borderRadius}px`
        : settings.variant === "rounded"
          ? "999px"
          : "0px",
    "--progress-duration": `${settings.animated ? settings.animationDuration : 0}ms`,
    "--progress-stripe-width": `${settings.stripeWidth}px`,
    "--progress-fill": settings.fillColor || undefined,
    "--progress-track": settings.trackColor || undefined,
    "--progress-marker": settings.markerColor || undefined,
    ...style,
  } as CSSProperties;
  const mask =
    settings.variant === "segmented"
      ? `repeating-linear-gradient(to right, #000 0, #000 calc(${segment}% - ${settings.segmentGap}px), transparent calc(${segment}% - ${settings.segmentGap}px), transparent ${segment}%)`
      : undefined;
  return (
    <div
      {...appearanceProps}
      className={`element-progress ${className}`}
      data-label={settings.label || ariaLabel}
      data-tooltip={tooltip}
      style={variables}
      data-progress-state={state}
      data-indeterminate={!metrics.determinate || undefined}
      data-animated={settings.animated ? "true" : "false"}
    >
      {((settings.showLabel && settings.label) || settings.showValue) && (
        <div className={`element-progress-header ${headerClassName}`}>
          {settings.showLabel && <span>{settings.label}</span>}
          {settings.showValue && <strong>{displayValue}</strong>}
        </div>
      )}
      <div
        className={`element-progress-track ${trackClassName}`}
        role="progressbar"
        aria-label={ariaLabel || settings.label || tr("components.progress")}
        aria-valuemin={metrics.min}
        aria-valuemax={metrics.max}
        aria-valuenow={metrics.determinate ? metrics.value : undefined}
        aria-valuetext={
          ariaValueText || (metrics.determinate ? formatted : tr("components.indeterminate"))
        }
      >
        <span className="element-progress-meter" style={{ maskImage: mask }}>
          <span
            className={`element-progress-fill ${fillClassName}`}
            style={{ width: metrics.determinate ? `${metrics.percent}%` : "34%" }}
          >
            {settings.striped && <span className="element-progress-stripes" />}
          </span>
        </span>
        {settings.showDefaultMarker && (
          <span
            className="element-progress-marker"
            style={{ left: `${marker}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      {ticks.length > 0 && (
        <div
          className={`element-progress-ticks ${settings.showTickLabels ? "with-labels" : ""}`}
          aria-hidden="true"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className={`element-progress-tick ${metrics.determinate && settings.highlightPassedTicks && tick <= metrics.percent ? "passed" : ""}`}
              style={{ left: `${tick}%` }}
            >
              {settings.showTickLabels && `${tick}%`}
            </span>
          ))}
        </div>
      )}
      {settings.showDetail && detail && (
        <div className={`element-progress-detail ${detailClassName}`}>{detail}</div>
      )}
    </div>
  );
}
