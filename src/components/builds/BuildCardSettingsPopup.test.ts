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

    expect(restored.elementScales).toEqual({
      title: 1.5,
      badge: 0.75,
      "build-card-tag-version": 2,
      "build-card-tag-ram": 1.25,
    });
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

    expect(appearance.elementScales).toEqual({
      "build-card-tag-loader": 0.5,
      "build-card-tag-ram": 4,
    });
  });
});

describe("unified build card content layout", () => {
  it("migrates the visible gray text layout to the shared tag ids", () => {
    const appearance = normalizeBuildCardAppearance({
      contentEnabled: false,
      layoutOffsets: {
        "meta-loader": { x: 12, y: 24 },
        "build-card-tag-loader": { x: 36, y: 48 },
      },
      elementScales: { "meta-loader": 1.5, "build-card-tag-loader": 2 },
    });

    expect(appearance.layoutOffsets).toEqual({ "build-card-tag-loader": { x: 12, y: 24 } });
    expect(appearance.elementScales).toEqual({ "build-card-tag-loader": 1.5 });
    const enabled = normalizeBuildCardAppearance({ ...appearance, contentEnabled: true });
    expect(enabled.layoutOffsets).toEqual(appearance.layoutOffsets);
    expect(enabled.elementScales).toEqual(appearance.elementScales);
  });

  it("preserves the visible styled tag layout when legacy text settings also exist", () => {
    const appearance = normalizeBuildCardAppearance({
      contentEnabled: true,
      layoutOffsets: {
        "meta-ram": { x: 12, y: 24 },
        "build-card-tag-ram": { x: 36, y: 48 },
      },
      elementScales: { "meta-ram": 1.5, "build-card-tag-ram": 2 },
    });

    expect(appearance.layoutOffsets).toEqual({ "build-card-tag-ram": { x: 36, y: 48 } });
    expect(appearance.elementScales).toEqual({ "build-card-tag-ram": 2 });
    expect(normalizeBuildCardAppearance(appearance)).toEqual(appearance);
  });

  it("recognizes legacy content with custom ids and leaves unrelated elements alone", () => {
    const appearance = normalizeBuildCardAppearance({
      contentTags: [{ id: "custom-loader", text: "^%build_loader%" }],
      layoutOffsets: {
        "meta-loader": { x: 12, y: 24 },
        title: { x: 36, y: 0 },
      },
      elementScales: { "meta-loader": 1.5, badge: 2 },
    });

    expect(appearance.layoutOffsets).toEqual({
      "custom-loader": { x: 12, y: 24 },
      title: { x: 36, y: 0 },
    });
    expect(appearance.elementScales).toEqual({ "custom-loader": 1.5, badge: 2 });
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
