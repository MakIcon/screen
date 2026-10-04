import { describe, expect, it } from "vitest";
import { getBuildCardResizeLimit, getBuildCardResizedScale } from "./buildCardResize";

describe("build card resizing", () => {
  it("enlarges proportionally and can resize an already enlarged tag again", () => {
    expect(getBuildCardResizedScale(1, 100, 20, 50, 10, 4)).toBe(1.5);
    expect(getBuildCardResizedScale(1.5, 150, 30, 50, 10, 4)).toBe(2);
  });

  it("limits growth to the space remaining below and to the right of a moved tag", () => {
    const maxScale = getBuildCardResizeLimit({
      width: 100,
      height: 20,
      scale: 1,
      availableWidth: 125,
      availableHeight: 60,
    });
    expect(getBuildCardResizedScale(1, 100, 20, 200, 40, maxScale)).toBe(1.25);

    const bottomLimit = getBuildCardResizeLimit({
      width: 150,
      height: 30,
      scale: 1.5,
      availableWidth: 300,
      availableHeight: 35,
    });
    expect(getBuildCardResizedScale(1.5, 150, 30, 200, 40, bottomLimit)).toBe(1.75);
  });

  it("keeps a tag usable when dragged past its origin and restores its original size", () => {
    expect(getBuildCardResizedScale(1, 100, 20, -200, -40, 4)).toBe(0.5);
    expect(getBuildCardResizedScale(2, 200, 40, -100, -20, 4)).toBe(1);
  });
});
