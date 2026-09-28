import { describe, expect, it } from "vitest";
import { buildElementOverrideRule } from "./elementOverrides";
import {
  GRADIENT_ANIMATIONS,
  buildGradientAnimationKeyframes,
  resolveGradientAnimation,
} from "./gradientAnimation";
import { normalizeAppearanceProfile } from "./profile";

describe("gradient animation", () => {
  it("provides a renderable definition for every motion preset", () => {
    for (const option of GRADIENT_ANIMATIONS) {
      const definition = resolveGradientAnimation(option.id);
      if (option.id === "none") {
        expect(definition).toBeNull();
        continue;
      }
      expect(definition?.frames.length).toBeGreaterThanOrEqual(2);
      expect(definition?.backgroundSize).toMatch(/^\d+% \d+%$/);
    }
  });

  it("builds custom from/to frames and serializes them for the launcher", () => {
    const definition = resolveGradientAnimation("custom", {
      easing: "ease-in",
      startX: -20,
      startY: 15,
      endX: 140,
      endY: 85,
      scale: 310,
      hue: 120,
      saturation: 1.4,
      brightness: 0.8,
    });

    expect(definition).toMatchObject({ backgroundSize: "310% 310%", easing: "ease-in" });
    expect(definition?.frames).toEqual([
      {
        offset: 0,
        backgroundPosition: "-20% 15%",
        backgroundSize: "310% 310%",
        filter: "hue-rotate(0deg) saturate(1) brightness(1)",
      },
      {
        offset: 1,
        backgroundPosition: "140% 85%",
        backgroundSize: "310% 310%",
        filter: "hue-rotate(120deg) saturate(1.4) brightness(0.8)",
      },
    ]);
    expect(buildGradientAnimationKeyframes("custom-gradient", definition!)).toContain(
      "100% { background-position: 140% 85%; background-size: 310% 310%; filter: hue-rotate(120deg)",
    );
  });

  it("normalizes and applies custom gradient and entrance animation settings", () => {
    const profile = normalizeAppearanceProfile({
      elementOverrides: [
        {
          id: "element-custom-animation-card",
          label: "DIV · CUSTOM",
          path: [{ tag: "div", index: 0 }],
          style: {
            backgroundKind: "gradient",
            backgroundGradientStart: "#FF0000",
            backgroundGradientEnd: "#0000FF",
            backgroundGradientAnimation: "custom",
            backgroundGradientAnimationEasing: "ease-in",
            backgroundGradientAnimationStartX: -999,
            backgroundGradientAnimationStartY: 12,
            backgroundGradientAnimationEndX: 999,
            backgroundGradientAnimationEndY: 88,
            backgroundGradientAnimationScale: 999,
            backgroundGradientAnimationHue: 999,
            backgroundGradientAnimationSaturation: 0,
            backgroundGradientAnimationBrightness: 9,
            entranceAnimation: "custom",
            entranceFromOpacity: 9,
            entranceFromX: -9999,
            entranceFromY: 9999,
            entranceFromScale: 9,
            entranceFromRotate: -999,
            entranceFromBlur: 999,
          },
        },
      ],
    });
    const override = profile.elementOverrides[0];
    const rule = buildElementOverrideRule(override);

    expect(override.style).toMatchObject({
      backgroundGradientAnimation: "custom",
      backgroundGradientAnimationEasing: "ease-in",
      backgroundGradientAnimationStartX: -100,
      backgroundGradientAnimationStartY: 12,
      backgroundGradientAnimationEndX: 200,
      backgroundGradientAnimationEndY: 88,
      backgroundGradientAnimationScale: 500,
      backgroundGradientAnimationHue: 360,
      backgroundGradientAnimationSaturation: 0.25,
      backgroundGradientAnimationBrightness: 2.5,
      entranceAnimation: "custom",
      entranceFromOpacity: 1,
      entranceFromX: -800,
      entranceFromY: 600,
      entranceFromScale: 2,
      entranceFromRotate: -360,
      entranceFromBlur: 80,
    });
    expect(rule).toContain("background-size: 500% 500% !important");
    expect(rule).toContain("animation-timing-function: ease-in, ease-out !important");
    expect(rule).toContain("background-position: -100% 12%");
    expect(rule).toContain("hue-rotate(360deg) saturate(0.25) brightness(2.5)");
    expect(rule).toContain(
      "opacity: 1; translate: -800px 600px; scale: 2; rotate: -360deg; filter: blur(80px)",
    );
  });
});
