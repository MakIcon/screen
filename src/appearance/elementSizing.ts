import type { AppearanceElementTarget, AppearanceProfile } from "./types";

const SIZE_MODE_KEYS = [
  ["width", "widthAuto"],
  ["height", "heightAuto"],
  ["minWidth", "minWidthAuto"],
  ["minHeight", "minHeightAuto"],
] as const;

export function refreshElementSizingTarget(
  profile: AppearanceProfile,
  target: AppearanceElementTarget,
) {
  const existing = profile.elementOverrides.find((override) => override.id === target.id);
  if (!existing) return profile;

  const style = { ...existing.style };
  for (const [property, mode] of SIZE_MODE_KEYS) {
    if (style[property] === 0 && existing.defaults?.[mode] === undefined) {
      delete style[property];
    }
  }

  const hasTextOverride = Object.prototype.hasOwnProperty.call(existing, "text");
  if (
    Object.keys(style).length === 0 &&
    !existing.hoverStyle &&
    !hasTextOverride &&
    !existing.componentSettings &&
    !existing.canvasUi
  ) {
    return {
      ...profile,
      elementOverrides: profile.elementOverrides.filter((override) => override.id !== target.id),
    };
  }

  return {
    ...profile,
    elementOverrides: profile.elementOverrides.map((override) =>
      override.id === target.id ? { ...existing, ...target, style } : override,
    ),
  };
}
