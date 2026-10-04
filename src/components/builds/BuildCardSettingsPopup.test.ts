import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUILD_CARD_APPEARANCE,
  getBuildCardAppearanceStyle,
  getBuildCardElementStyle,
  hasBuildCardBackgroundImage,
  normalizeBuildCardAppearance,
} from "./BuildCardSettingsPopup";

describe("build card drawing background", () => {
  it("migrates legacy data images to the image background mode", () => {
    const appearance = normalizeBuildCardAppearance("data:image/png;base64,legacy");

    expect(appearance.backgroundMode).toBe("image");
    expect(hasBuildCardBackgroundImage(appearance)).toBe(true);
  });

  it("keeps a drawing separate from uploaded images", () => {
    const drawingImage = "data:image/png;base64,drawing";
    const appearance = normalizeBuildCardAppearance({
      ...DEFAULT_BUILD_CARD_APPEARANCE,
      backgroundMode: "draw",
      image: "data:image/png;base64,upload",
      drawingImage,
    });

    expect(appearance.image).toContain("upload");
    expect(appearance.drawingImage).toBe(drawingImage);
    const style = getBuildCardAppearanceStyle(appearance);
    expect(style?.backgroundImage).toContain(drawingImage);
    expect(style?.backgroundSize).toBe("100% 100%, 100% 100%");
  });

  it("does not render a stored drawing while color mode is selected", () => {
    const appearance = normalizeBuildCardAppearance({
      ...DEFAULT_BUILD_CARD_APPEARANCE,
      backgroundMode: "color",
      drawingImage: "data:image/png;base64,drawing",
    });

    expect(hasBuildCardBackgroundImage(appearance)).toBe(false);
    expect(getBuildCardAppearanceStyle(appearance)?.backgroundImage).toBeUndefined();
  });
});

describe("build card element sizes", () => {
  it("keeps older cards at their original size", () => {
    const appearance = normalizeBuildCardAppearance({ layoutOffsets: { title: { x: 12, y: 0 } } });

    expect(appearance.elementScales).toEqual({});
    expect(getBuildCardElementStyle(appearance, "title")?.transform).toBeUndefined();
  });

  it("preserves resized elements and their grid positions through save and reload", () => {
    const draft = {
      ...DEFAULT_BUILD_CARD_APPEARANCE,
      elementScales: { title: 1.5, badge: 0.75, "build-card-tag-version": 2, "meta-ram": 1.25 },
      layoutOffsets: { "build-card-tag-version": { x: 24, y: 12 } },
    };
    const restored = normalizeBuildCardAppearance(JSON.parse(JSON.stringify(draft)));

    expect(restored.elementScales).toEqual(draft.elementScales);
    expect(getBuildCardElementStyle(restored, "build-card-tag-version")).toMatchObject({
      left: "24px",
      top: "12px",
      transform: "scale(2)",
      transformOrigin: "top left",
    });
  });

  it("rejects invalid sizes and bounds stored scales", () => {
    const appearance = normalizeBuildCardAppearance({
      elementScales: {
        title: Infinity,
        badge: "2",
        "meta-version": NaN,
        "meta-loader": -1,
        "meta-ram": 100,
        "meta-last-played": 1,
      },
    });

    expect(appearance.elementScales).toEqual({ "meta-loader": 0.5, "meta-ram": 4 });
  });
});

describe("build card grid positions", () => {
  it("keeps the existing layout as the zero position for older cards", () => {
    const appearance = normalizeBuildCardAppearance({ backgroundMode: "color" });

    expect(appearance.layoutOffsets).toEqual({});
    expect(getBuildCardElementStyle(appearance, "title")).toBeUndefined();
    expect(getBuildCardElementStyle(appearance, "meta-version")).toBeUndefined();
  });

  it("restores saved title and tag offsets", () => {
    const appearance = normalizeBuildCardAppearance({
      ...DEFAULT_BUILD_CARD_APPEARANCE,
      layoutOffsets: {
        title: { x: 24, y: 36 },
        "build-card-tag-version": { x: -12, y: 12 },
      },
    });

    expect(getBuildCardElementStyle(appearance, "title")).toMatchObject({
      left: "24px",
      top: "36px",
    });
    expect(getBuildCardElementStyle(appearance, "build-card-tag-version")).toMatchObject({
      left: "-12px",
      top: "12px",
    });
  });
});

describe("build card vertical alignment", () => {
  it("uses top alignment for cards saved before the setting existed", () => {
    const appearance = normalizeBuildCardAppearance({ cardHeight: 260 });

    expect(appearance.contentVerticalAlign).toBe("top");
  });

  it("keeps an explicitly centered card centered in preview and list styling", () => {
    const appearance = normalizeBuildCardAppearance({
      ...DEFAULT_BUILD_CARD_APPEARANCE,
      cardHeight: 260,
      contentVerticalAlign: "center",
    });

    expect(appearance.contentVerticalAlign).toBe("center");
  });
});
