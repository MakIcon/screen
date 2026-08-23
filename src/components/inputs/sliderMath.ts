export function projectPointerToSliderRatio(
  clientX: number,
  clientY: number,
  centerX: number,
  centerY: number,
  visualWidth: number,
  axisX: number,
  axisY: number,
) {
  const projected = (clientX - centerX) * axisX + (clientY - centerY) * axisY;
  return Math.max(0, Math.min(1, 0.5 + projected / Math.max(1, visualWidth)));
}

export function magnetizeSliderRatio(
  ratio: number,
  defaultRatio: number,
  visualWidth: number,
  captureDistance = 12,
) {
  const distanceInPixels = Math.abs(ratio - defaultRatio) * Math.max(1, visualWidth);
  return distanceInPixels <= Math.max(0, captureDistance) ? defaultRatio : ratio;
}

export function normalizeCustomSliderTicks(
  ticks: number[],
  min: number,
  max: number,
  integersOnly = false,
) {
  return [...new Set(ticks.map((tick) => (integersOnly ? Math.round(tick) : tick)))]
    .filter((tick) => Number.isFinite(tick) && tick >= min && tick <= max)
    .sort((left, right) => left - right);
}
