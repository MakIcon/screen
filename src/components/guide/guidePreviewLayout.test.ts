import { describe, expect, it } from "vitest";
import {
  guideMaximumSceneHeight,
  guidePreviewLayout,
  measureGuideScene,
} from "./guidePreviewLayout";

describe("guide preview layout", () => {
  it.each([286.6667, 337.3333, 390])(
    "fits a fractional content width of %s without horizontal overflow",
    (contentWidth) => {
      const layout = guidePreviewLayout({
        contentWidth,
        availableHeight: 300,
        previewWidth: 900,
        previewHeight: 130,
        zoom: 1.28,
      });
      expect(layout.gridWidth + 2).toBeLessThanOrEqual(contentWidth);
      expect(900 * layout.scale + 18).toBeLessThanOrEqual(layout.gridWidth);
    },
  );

  it("fits a tall open menu in the available window height", () => {
    const layout = guidePreviewLayout({
      contentWidth: 338,
      availableHeight: 162,
      previewWidth: 320,
      previewHeight: 310,
      zoom: 1,
    });
    expect(layout.gridHeight + 2).toBeLessThanOrEqual(162);
    expect(310 * layout.scale + 18).toBeLessThanOrEqual(layout.gridHeight);
  });

  it.each([
    { id: "dropdown", heights: [123, 250] },
    { id: "catalog", heights: [199, 271, 225] },
    { id: "shaders", heights: [185, 185, 235] },
    { id: "preference", heights: [80, 150] },
  ])(
    "reserves the largest $id state before the first frame and keeps the scale fixed",
    ({ id, heights }) => {
      const maximum = guideMaximumSceneHeight(heights);
      const initial = measureGuideScene(null, id, maximum);
      expect(initial.viewportHeight).toBe(Math.max(...heights));
      const props = { contentWidth: 338, availableHeight: 350, previewWidth: 320, zoom: 1 };
      const initialLayout = guidePreviewLayout({ ...props, previewHeight: initial.viewportHeight });
      heights.forEach((height) => {
        const measured = measureGuideScene(initial, id, guideMaximumSceneHeight(heights));
        expect(measured).toBe(initial);
        expect(height).toBeLessThanOrEqual(measured.viewportHeight);
        const layout = guidePreviewLayout({ ...props, previewHeight: measured.viewportHeight });
        expect(layout).toEqual(initialLayout);
        expect(height * layout.scale + 18).toBeLessThanOrEqual(layout.gridHeight);
      });
    },
  );

  it("measures a new compact viewport when advancing to another step", () => {
    const previous = measureGuideScene(null, "catalog", 199);
    const next = measureGuideScene(previous, "dropdown", 123);
    expect(next.viewportHeight).toBe(123);
    expect(measureGuideScene(next, "dropdown", 123)).toBe(next);
  });

  it("rounds the largest DOM state up to keep fractional borders inside the preview", () => {
    expect(guideMaximumSceneHeight([122.6667, 250.3333, 187])).toBe(251);
  });
});
