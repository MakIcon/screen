import { describe, expect, it } from "vitest";
import {
  CANVAS_UI_EFFECTS,
  canvasUiOptions,
  createDefaultCanvasUi,
  normalizeCanvasUi,
} from "./canvasUi";
import { createDefaultAppearance, normalizeAppearanceProfile } from "./profile";
import { appearanceHistoryReducer, createAppearanceHistory } from "./history";

describe("Canvas UI appearance profiles", () => {
  it("keeps existing profiles disabled until an effect is enabled", () => {
    expect(normalizeAppearanceProfile({ version: 2, customized: true }).canvasUi).toEqual(
      createDefaultCanvasUi(),
    );
    expect(normalizeCanvasUi({ enabled: true, effect: "missing-effect" }).enabled).toBe(false);
  });

  it("round-trips every editable option of every registry effect", () => {
    for (const effect of CANVAS_UI_EFFECTS) {
      const config = {
        ...createDefaultCanvasUi(),
        enabled: true,
        effect: effect.id,
        settings: {
          [effect.id]: Object.fromEntries(effect.fields.map((field) => [field.key, field.default])),
        },
      };
      expect(canvasUiOptions(normalizeCanvasUi(config)), effect.id).toEqual(
        canvasUiOptions(config),
      );
      const profile = normalizeAppearanceProfile(
        JSON.parse(JSON.stringify({ ...createDefaultAppearance("dark", true), canvasUi: config })),
      );
      expect(profile.canvasUi, effect.id).toEqual(config);
    }
  });

  it("clamps untrusted numeric settings and rejects unknown keys, unsafe assets and malformed colors", () => {
    const settings = normalizeCanvasUi({
      enabled: true,
      effect: "liquid",
      opacity: 12,
      settings: {
        liquid: { force: Infinity, radius: -9, color: [NaN, 0, 1], rainbow: "true", unknown: 10 },
        "glass-object": {
          src: "javascript:alert(1)",
          backgroundImage: "file:///secret",
          tint: "url(http://example.com/)",
        },
        unknown: { force: 2 },
      },
    });
    expect(settings.opacity).toBe(1);
    expect(settings.settings.liquid).toEqual({ radius: 0.05 });
    expect(settings.settings).not.toHaveProperty("unknown");
    expect(settings.settings).not.toHaveProperty("glass-object");
  });

  it("retains individual effect settings when switching, undoing and redoing", () => {
    const initial = {
      ...createDefaultAppearance("dark", true),
      canvasUi: { ...createDefaultCanvasUi(), enabled: true, settings: { liquid: { force: 2.5 } } },
    };
    const history = appearanceHistoryReducer(createAppearanceHistory(initial), {
      type: "apply",
      update: (profile) => ({
        ...profile,
        canvasUi: {
          ...profile.canvasUi,
          effect: "glitch",
          settings: { ...profile.canvasUi.settings, glitch: { intensity: 0.5 } },
        },
      }),
    });
    const undone = appearanceHistoryReducer(history, { type: "undo" });
    expect(undone.present.canvasUi.effect).toBe("liquid");
    expect(
      appearanceHistoryReducer(undone, { type: "redo" }).present.canvasUi.settings.liquid.force,
    ).toBe(2.5);
  });
});
