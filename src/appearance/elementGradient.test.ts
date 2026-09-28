import { describe, expect, it } from "vitest";
import {
  buildElementGradientImage,
  buildElementTextGradientImage,
  gradientCurveValue,
  interpolateGradientStopColor,
  resolveElementGradientStops,
  sampleGradientCurve,
} from "./elementGradient";

describe("element gradient", () => {
  it("uses a smooth perceptual blend by default", () => {
    const style = {
      backgroundGradientStart: "#123456",
      backgroundGradientEnd: "#abcdef",
      backgroundGradientAngle: 42,
      backgroundOpacity: 0.4,
    };

    const image = buildElementGradientImage(style, "#000000", "#ffffff");

    expect(image).toMatch(/^linear-gradient\(42deg in oklab, /);
    expect(image).toContain("color-mix(in oklab, #123456 40%, transparent) 0%");
    expect(image).toContain("color-mix(in oklab, #abcdef 40%, transparent) 100%");
  });

  it("builds multi-stop radial and conic gradients with professional controls", () => {
    const style = {
      backgroundGradientStops: [
        { color: "#ff0000", position: 0 },
        { color: "#00ff00", position: 35 },
        { color: "#0000ff", position: 100 },
      ],
      backgroundGradientType: "radial" as const,
      backgroundGradientCenterX: 24,
      backgroundGradientCenterY: 72,
      backgroundGradientScale: 145,
      backgroundGradientStrength: 0.65,
      backgroundGradientMidpoint: 0.35,
      backgroundGradientSoftness: 0.2,
    };

    const radial = buildElementGradientImage(style, "#000000", "#ffffff", {
      baseColor: "#202020",
    });
    const conic = buildElementGradientImage(
      { ...style, backgroundGradientType: "conic", backgroundGradientAngle: 18 },
      "#000000",
      "#ffffff",
      { baseColor: "#202020" },
    );
    const ellipse = buildElementGradientImage(
      {
        ...style,
        backgroundGradientRadialShape: "ellipse",
        backgroundGradientRadialAspect: 0.6,
      },
      "#000000",
      "#ffffff",
      { baseColor: "#202020" },
    );

    expect(radial).toMatch(/^radial-gradient\(circle at 24% 72% in oklab, /);
    expect(radial).toContain("color-mix(in oklab, #ff0000 65%, #202020) 0%");
    expect(radial).toContain("#00ff00");
    expect(radial).toContain("145%)");
    expect(ellipse).toMatch(/^radial-gradient\(ellipse 145% 87% at 24% 72% in oklab, /);
    expect(conic).toMatch(/^conic-gradient\(from 18deg at 24% 72% in oklab, /);
  });

  it("moves the curve midpoint and tightens its shoulders", () => {
    expect(gradientCurveValue(0)).toBe(0);
    expect(gradientCurveValue(1)).toBe(1);
    expect(gradientCurveValue(0.3, 0.3, 0.5)).toBeCloseTo(0.5);
    expect(gradientCurveValue(0.25, 0.5, 0)).toBeLessThan(gradientCurveValue(0.25, 0.5, 1));
  });

  it("resolves, orders and interpolates stop colors", () => {
    const style = {
      backgroundGradientStops: [
        { color: "#ffffff", position: 100 },
        { color: "#000000", position: 0 },
      ],
    };

    expect(resolveElementGradientStops(style, "#111111", "#eeeeee")).toEqual(
      style.backgroundGradientStops,
    );
    expect(
      interpolateGradientStopColor(
        { color: "#000000", position: 0 },
        { color: "#ffffff", position: 100 },
        50,
      ),
    ).toBe("#636363");
  });

  it("adapts CSS stops to the curve instead of always generating 24 samples", () => {
    const points = sampleGradientCurve(0.5, 0.5);
    const image = buildElementGradientImage(
      {
        backgroundGradientStart: "#fff7ed",
        backgroundGradientEnd: "#ea580c",
        backgroundGradientSoftness: 0.5,
      },
      "#fff7ed",
      "#ea580c",
    );

    expect(points.length).toBeLessThan(24);
    expect(points.length).toBeGreaterThan(5);
    expect(image.match(/color-mix\(in oklab/g)).toHaveLength(points.length - 2);

    for (const [midpoint, softness] of [
      [0.5, 0.5],
      [0.3, 0.2],
      [0.05, 0],
      [0.95, 0],
    ]) {
      const samples = sampleGradientCurve(midpoint, softness);
      for (let index = 0; index < samples.length - 1; index += 1) {
        const left = samples[index];
        const right = samples[index + 1];
        for (const fraction of [0.25, 0.5, 0.75]) {
          const position = left.position + (right.position - left.position) * fraction;
          const approximate = left.blend + (right.blend - left.blend) * fraction;
          expect(
            Math.abs(gradientCurveValue(position, midpoint, softness) - approximate),
          ).toBeLessThan(0.015);
        }
      }
    }
  });

  it("inserts a stop at the color produced by the current blend curve", () => {
    const dark = { color: "#000000", position: 0 };
    const light = { color: "#ffffff", position: 100 };
    expect(interpolateGradientStopColor(dark, light, 30, 0.3, 0.2)).toBe("#636363");
    expect(interpolateGradientStopColor(dark, light, 25, 0.5, 0)).not.toBe(
      interpolateGradientStopColor(dark, light, 25, 0.5, 1),
    );
  });

  it("maps text gradient controls to the shared gradient renderer", () => {
    const image = buildElementTextGradientImage(
      {
        textGradientStart: "#fb7185",
        textGradientEnd: "#8b5cf6",
        textGradientAngle: 315,
        textGradientSoftness: 1,
      },
      "#ffffff",
      "#000000",
    );

    expect(image).toBe("linear-gradient(315deg in oklab, #fb7185, #8b5cf6)");
  });
});
