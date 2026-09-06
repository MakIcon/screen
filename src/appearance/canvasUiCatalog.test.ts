import { describe, expect, it } from "vitest";
import {
  CANVAS_UI_EFFECTS,
  CANVAS_UI_EFFECT_IDS,
  getCanvasUiDefaultSettings,
  fitCanvasUiEffectProps,
  normalizeCanvasUiEffectSettings,
  resolveCanvasUiEffectProps,
} from "./canvasUiCatalog";

describe("Canvas UI effect catalog", () => {
  it("fits spatial effects to buttons without shrinking their text glyphs", () => {
    const glass = fitCanvasUiEffectProps(
      "glass",
      resolveCanvasUiEffectProps("glass", undefined),
      180,
      48,
    );
    expect(glass.size).toBeLessThan(48);
    expect(glass.zoom).toBe(1.5);
    const original = resolveCanvasUiEffectProps("asciify", undefined);
    expect(fitCanvasUiEffectProps("asciify", original, 180, 48).scale).toBe(original.scale);
    const large = resolveCanvasUiEffectProps("grid", { tileSize: 150 });
    expect(fitCanvasUiEffectProps("grid", large, 960, 540)).toBe(large);
  });
  it("provides editable controls for every installed component", () => {
    expect(CANVAS_UI_EFFECTS).toHaveLength(35);
    expect(new Set(CANVAS_UI_EFFECT_IDS).size).toBe(35);
    for (const effect of CANVAS_UI_EFFECTS) {
      expect(effect.controls.length, effect.id).toBeGreaterThan(0);
      expect(new Set(effect.controls.map((control) => control.key)).size, effect.id).toBe(
        effect.controls.length,
      );
    }
  });

  it("ships visible, immediately reactive displacement defaults", () => {
    expect(getCanvasUiDefaultSettings("displacement")).toMatchObject({
      strength: 0.7,
      threshold: 0,
      shift: 2.2,
      scramble: 1.8,
    });
  });

  it("preserves captured element colors in Hex Float by default", () => {
    expect(resolveCanvasUiEffectProps("hex-float", {}).preserveColor).toBe(true);
  });

  it("sanitizes saved values and converts component RGB colors", () => {
    expect(
      normalizeCanvasUiEffectSettings("displacement", {
        strength: 4,
        threshold: -100,
        unknown: 123,
      }),
    ).toEqual({ strength: 1, threshold: 0 });

    expect(resolveCanvasUiEffectProps("liquid", { color: "#ff8000" }).color).toEqual([
      1,
      128 / 255,
      0,
    ]);
    expect(resolveCanvasUiEffectProps("ascii-sweep", { color: "#ff8000" }).color).toBe("#ff8000");
  });
});
