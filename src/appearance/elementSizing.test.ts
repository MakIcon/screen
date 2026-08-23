import { describe, expect, it } from "vitest";
import { createDefaultAppearance } from "./profile";
import { refreshElementSizingTarget } from "./elementSizing";
import type { AppearanceElementOverride, AppearanceElementTarget } from "./types";

const target: AppearanceElementTarget = {
  id: "element-toggle",
  label: "BUTTON · TOGGLE",
  path: [{ tag: "button", index: 0 }],
  defaults: {
    width: 64,
    height: 34,
    minWidth: 0,
    minHeight: 0,
    widthAuto: false,
    heightAuto: false,
  },
};

function profileWith(override: AppearanceElementOverride) {
  const profile = createDefaultAppearance("light", true);
  profile.elementOverrides = [override];
  return profile;
}

describe("element sizing target refresh", () => {
  it("removes a legacy zero override whose AUTO/fixed meaning was unknown", () => {
    const profile = refreshElementSizingTarget(
      profileWith({ ...target, defaults: undefined, style: { width: 0, height: 0 } }),
      target,
    );

    expect(profile.elementOverrides).toEqual([]);
  });

  it("keeps an intentional zero after the sizing mode has been recorded", () => {
    const profile = refreshElementSizingTarget(
      profileWith({ ...target, style: { width: 0 } }),
      target,
    );

    expect(profile.elementOverrides[0].style).toEqual({ width: 0 });
    expect(profile.elementOverrides[0].defaults?.widthAuto).toBe(false);
  });
});
