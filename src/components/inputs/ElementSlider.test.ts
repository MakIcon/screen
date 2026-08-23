import { describe, expect, it } from "vitest";
import {
  magnetizeSliderRatio,
  normalizeCustomSliderTicks,
  projectPointerToSliderRatio,
} from "./sliderMath";

describe("ElementSlider rotated pointer mapping", () => {
  it("maps a horizontal pointer along the normal slider axis", () => {
    expect(projectPointerToSliderRatio(100, 50, 100, 50, 200, 1, 0)).toBe(0.5);
    expect(projectPointerToSliderRatio(200, 50, 100, 50, 200, 1, 0)).toBe(1);
  });

  it("maps dragging along a 45 degree visual axis instead of the old horizontal axis", () => {
    const axis = Math.SQRT1_2;
    const halfWidth = 100;
    const centerX = 200;
    const centerY = 200;

    expect(
      projectPointerToSliderRatio(
        centerX + axis * halfWidth,
        centerY + axis * halfWidth,
        centerX,
        centerY,
        halfWidth * 2,
        axis,
        axis,
      ),
    ).toBeCloseTo(1);
    expect(
      projectPointerToSliderRatio(
        centerX + axis * halfWidth,
        centerY - axis * halfWidth,
        centerX,
        centerY,
        halfWidth * 2,
        axis,
        axis,
      ),
    ).toBeCloseTo(0.5);
  });
});

describe("ElementSlider custom ticks", () => {
  it("keeps RAM labels independent from a previously corrupted fractional step", () => {
    expect(normalizeCustomSliderTicks([64, 1, 21, 42, 21], 1, 64, true)).toEqual([1, 21, 42, 64]);
  });

  it("drops labels outside the active slider range", () => {
    expect(normalizeCustomSliderTicks([-10, 1, 32, 100], 1, 64)).toEqual([1, 32]);
  });

  it("only hides out-of-range labels without mutating the stored list", () => {
    const storedTicks = [1, 21, 42, 64];

    expect(normalizeCustomSliderTicks(storedTicks, 24, 64, true)).toEqual([42, 64]);
    expect(storedTicks).toEqual([1, 21, 42, 64]);
    expect(normalizeCustomSliderTicks(storedTicks, 1, 64, true)).toEqual([1, 21, 42, 64]);
  });
});

describe("ElementSlider default marker magnet", () => {
  it("snaps a drag inside the marker capture radius", () => {
    expect(magnetizeSliderRatio(0.51, 0.5, 800)).toBe(0.5);
  });

  it("releases the drag after it leaves the marker capture radius", () => {
    expect(magnetizeSliderRatio(0.52, 0.5, 800)).toBe(0.52);
  });
});
