import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUILD_CARD_APPEARANCE,
  getBuildCardAppearanceStyle,
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
