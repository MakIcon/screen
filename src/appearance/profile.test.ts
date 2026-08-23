import { describe, expect, it } from "vitest";
import {
  applyAppearanceToElement,
  buildAppearanceStyle,
  createDefaultAppearance,
  normalizeAppearanceProfile,
  resolveTabAnimation,
} from "./profile";
import { buildElementOverrideRule, mapDrawingCursorToCover } from "./elementOverrides";

describe("appearance profile", () => {
  it("creates safe complete defaults for each base theme", () => {
    const profile = createDefaultAppearance("void");

    expect(profile.baseTheme).toBe("void");
    expect(profile.colors.background).toBe("#000000");
    expect(profile.shape.radius).toBe(0);
    expect(profile.opacity.panels).toBe(0);
    expect(profile.motion.tabByTarget.instances).toBeTruthy();
    expect(profile.elementOverrides).toEqual([]);
    expect(profile.customized).toBe(false);
  });

  it("normalizes invalid values and clamps user-controlled numbers", () => {
    const profile = normalizeAppearanceProfile({
      baseTheme: "unknown",
      customized: true,
      colors: { accent: "javascript:red", text: "#ABCDEF" },
      background: {
        kind: "image",
        imageDataUrl: "data:text/html;base64,PHNjcmlwdD4=",
        dim: 9,
        blur: -10,
      },
      shape: { radius: 1000 },
      opacity: { window: 0, panels: 8, controls: -4 },
      motion: { opening: "explode", closeButton: "delete" },
    });

    expect(profile.baseTheme).toBe("light");
    expect(profile.colors.accent).toBe("#c2410c");
    expect(profile.colors.text).toBe("#abcdef");
    expect(profile.background.imageDataUrl).toBe("");
    expect(profile.background.dim).toBe(0.9);
    expect(profile.background.blur).toBe(0);
    expect(profile.shape.radius).toBe(28);
    expect(profile.opacity).toEqual({ window: 0.55, panels: 1, controls: 0.35 });
    expect(profile.motion.opening).toBe("unfold");
    expect(profile.motion.closeButton).toBe("tear");
  });

  it("resolves global and per-target tab animations", () => {
    const profile = createDefaultAppearance("dark", true);
    profile.motion.tabDefault = "blur";
    expect(resolveTabAnimation(profile, "instances")).toBe("blur");

    profile.motion.tabMode = "per-tab";
    profile.motion.tabByTarget.instances = "slide-right";
    expect(resolveTabAnimation(profile, "instances")).toBe("slide-right");

    profile.motion.enabled = false;
    expect(resolveTabAnimation(profile, "instances")).toBe("none");
  });

  it("keeps safe element overrides and rejects unsafe target data", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-card123",
          label: "BUTTON · PLAY",
          tab: "instances",
          path: [
            { tag: "div", index: 0, marker: "class:content-wrap" },
            { tag: "button", index: 2 },
          ],
          textTarget: { path: [0, 0], original: "PLAY LAST" },
          text: "PLAY CUSTOM",
          style: {
            opacity: -4,
            radius: 200,
            fontFamily: '"Inter", sans-serif',
            fontSize: 500,
            fontWeight: 643,
            letterSpacing: -8,
            paddingX: 999,
            borderWidth: 20,
            shadow: "glow",
            scale: 3,
            rotate: -90,
            backgroundColor: "#ABCDEF",
          },
        },
        {
          id: 'element-bad"] { display: none }',
          path: [{ tag: "style", index: 0 }],
          style: { opacity: 0 },
        },
      ],
    });

    expect(profile.elementOverrides).toEqual([
      {
        id: "element-card123",
        label: "BUTTON · PLAY",
        tab: "instances",
        path: [
          { tag: "div", index: 0, marker: "class:content-wrap" },
          { tag: "button", index: 2 },
        ],
        textTarget: { path: [0, 0], original: "PLAY LAST" },
        text: "PLAY CUSTOM",
        style: {
          opacity: 0,
          radius: 40,
          fontFamily: '"Inter", sans-serif',
          fontSize: 96,
          fontWeight: 600,
          letterSpacing: -2,
          paddingX: 64,
          borderWidth: 8,
          shadow: "glow",
          scale: 1.5,
          rotate: -15,
          backgroundColor: "#abcdef",
        },
      },
    ]);
  });

  it("gives an individual element rule priority over global appearance rules", () => {
    const rule = buildElementOverrideRule({
      id: "element-play",
      label: "BUTTON · PLAY BUILD",
      path: [{ tag: "button", index: 0, marker: "class:primary-action" }],
      style: {
        radius: 40,
        opacity: 0.5,
        fontSize: 18,
        paddingX: 24,
        borderWidth: 2,
        shadow: "glow",
        scale: 1.08,
        rotate: 2,
      },
    });

    expect(rule.match(/data-appearance-override/g)).toHaveLength(3);
    expect(rule).toContain("border-radius: 40px !important");
    expect(rule).toContain("opacity: 0.5 !important");
    expect(rule).toContain("font-size: 18px !important");
    expect(rule).toContain("padding-left: 24px !important");
    expect(rule).toContain("border-style: solid !important");
    expect(rule).toContain("box-shadow:");
    expect(rule).toContain("transform: rotate(2deg) scale(1.08) !important");
  });

  it("keeps a text-only element override, including intentionally empty text", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-play",
          label: "BUTTON · PLAY LAST",
          path: [{ tag: "button", index: 0 }],
          textTarget: { path: [0, 1, 0], original: "PLAY LAST" },
          text: "",
          style: {},
        },
      ],
    });

    expect(profile.elementOverrides[0]).toMatchObject({
      text: "",
      textTarget: { path: [0, 1, 0], original: "PLAY LAST" },
      style: {},
    });
  });

  it("maps the drawing cursor through the same cover transform as the launcher background", () => {
    const square = mapDrawingCursorToCover({ x: 0.5, y: 0.5, size: 12 }, 1000, 1000);
    expect(square.x).toBeCloseTo(500);
    expect(square.y).toBeCloseTo(500);
    expect(square.diameter).toBeCloseTo(22.2222);

    expect(mapDrawingCursorToCover({ x: 0.75, y: 0.25, size: 12 }, 960, 540)).toEqual({
      x: 720,
      y: 135,
      diameter: 12,
    });
  });

  it("does not darken a solid background", () => {
    const style = buildAppearanceStyle(createDefaultAppearance("light")) as Record<string, string>;
    expect(style["--appearance-background-image"]).toBe("none");
    expect(style["--appearance-background-dim"]).toBe("rgba(0, 0, 0, 0.000)");
  });

  it("removes every live override when returning to the original appearance", () => {
    const properties = new Map<string, string>();
    const element = {
      dataset: {},
      style: {
        setProperty: (property: string, value: string) => properties.set(property, value),
        removeProperty: (property: string) => properties.delete(property),
      },
    } as unknown as HTMLElement;

    applyAppearanceToElement(element, createDefaultAppearance("dark", true));
    expect(properties.size).toBeGreaterThan(0);

    applyAppearanceToElement(element, createDefaultAppearance("light"));
    expect(properties.size).toBe(0);
    expect(element.dataset.appearanceCustom).toBe("false");
  });
});
