import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUILD_CARD_APPEARANCE,
  getBuildCardAppearanceStyle,
  getBuildCardElementOffsetStyle,
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

describe("build card grid positions", () => {
  it("keeps the existing layout as the zero position for older cards", () => {
    const appearance = normalizeBuildCardAppearance({ backgroundMode: "color" });

    expect(appearance.layoutOffsets).toEqual({});
    expect(getBuildCardElementOffsetStyle(appearance, "title")).toBeUndefined();
    expect(getBuildCardElementOffsetStyle(appearance, "meta-version")).toBeUndefined();
  });

  it("restores saved title and tag offsets", () => {
    const appearance = normalizeBuildCardAppearance({
      ...DEFAULT_BUILD_CARD_APPEARANCE,
      layoutOffsets: {
        title: { x: 24, y: 36 },
        "build-card-tag-version": { x: -12, y: 12 },
      },
    });

    expect(getBuildCardElementOffsetStyle(appearance, "title")).toMatchObject({
      left: "24px",
      top: "36px",
    });
    expect(getBuildCardElementOffsetStyle(appearance, "build-card-tag-version")).toMatchObject({
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
