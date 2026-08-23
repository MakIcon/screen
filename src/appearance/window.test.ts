import { describe, expect, it } from "vitest";
import { calculateAppearanceStudioPosition } from "./window";

describe("Appearance Studio placement", () => {
  it("places the studio to the left and vertically centers it against the launcher", () => {
    expect(
      calculateAppearanceStudioPosition(
        { x: 800, y: 100, width: 960, height: 800 },
        { width: 640, height: 760 },
        { x: 0, y: 0, width: 1920, height: 1080 },
        16,
      ),
    ).toEqual({ x: 144, y: 120 });
  });

  it("keeps the studio inside the monitor work area when there is little room", () => {
    expect(
      calculateAppearanceStudioPosition(
        { x: 100, y: 20, width: 900, height: 700 },
        { width: 640, height: 760 },
        { x: 0, y: 0, width: 1280, height: 720 },
        16,
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it("supports a monitor positioned to the left of the primary monitor", () => {
    expect(
      calculateAppearanceStudioPosition(
        { x: 0, y: 80, width: 960, height: 800 },
        { width: 640, height: 760 },
        { x: -1920, y: 0, width: 1920, height: 1080 },
        16,
      ),
    ).toEqual({ x: -656, y: 100 });
  });
});
