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
          rotate: -90,
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
      kind: "list",
      style: {
        width: 320,
        height: 64,
        minWidth: 120,
        minHeight: 32,
        radius: 40,
        opacity: 0.5,
        fontSize: 18,
        paddingX: 24,
        borderWidth: 2,
        shadow: "glow",
        scale: 1.08,
        rotate: 2,
        layout: "grid",
        columns: 3,
        gap: 12,
      },
    });

    expect(rule.split("\n")[0].match(/data-appearance-override/g)).toHaveLength(3);
    expect(rule).toContain("border-radius: 40px !important");
    expect(rule).toContain("width: 320px !important");
    expect(rule).toContain("height: 64px !important");
    expect(rule).toContain("grid-template-columns: repeat(3, minmax(0, 1fr)) !important");
    expect(rule).toContain("gap: 12px !important");
    expect(rule).toContain("opacity: 0.5 !important");
    expect(rule).toContain("font-size: 18px !important");
    expect(rule).toContain("padding-left: 24px !important");
    expect(rule).toContain("border-style: solid !important");
    expect(rule).toContain("box-shadow:");
    expect(rule).toContain("transform: rotate(2deg) scale(1.08) !important");
  });

  it("uses zero as AUTO only for dimensions detected as flexible", () => {
    const flexibleRule = buildElementOverrideRule({
      id: "element-flexible-slider",
      label: "DIV · SLIDER",
      path: [{ tag: "div", index: 0 }],
      defaults: {
        width: 760,
        height: 74,
        minWidth: 0,
        minHeight: 0,
        widthAuto: true,
        heightAuto: true,
      },
      style: { width: 0, height: 0 },
    });
    const fixedRule = buildElementOverrideRule({
      id: "element-fixed-toggle",
      label: "BUTTON · TOGGLE",
      path: [{ tag: "button", index: 0 }],
      defaults: {
        width: 64,
        height: 34,
        minWidth: 0,
        minHeight: 0,
        widthAuto: false,
        heightAuto: false,
      },
      style: { width: 0, height: 0 },
    });

    expect(flexibleRule).toContain("width: auto !important");
    expect(flexibleRule).toContain("height: auto !important");
    expect(fixedRule).toContain("width: 0px !important");
    expect(fixedRule).toContain("height: 0px !important");
  });

  it("ignores ambiguous legacy zero sizes until their sizing mode is remeasured", () => {
    const rule = buildElementOverrideRule({
      id: "element-legacy-zero",
      label: "BUTTON · TOGGLE",
      path: [{ tag: "button", index: 0 }],
      defaults: { width: 64, height: 34, minWidth: 0, minHeight: 0 },
      style: { width: 0, height: 0, opacity: 0.8 },
    });

    expect(rule).not.toContain("width:");
    expect(rule).not.toContain("height:");
    expect(rule).toContain("opacity: 0.8 !important");
  });

  it("preserves detected sizing modes in saved element targets", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-sizing-modes",
          label: "DIV · SLIDER",
          path: [{ tag: "div", index: 0 }],
          defaults: {
            width: 760,
            height: 74,
            minWidth: 0,
            minHeight: 0,
            widthAuto: true,
            heightAuto: true,
            minWidthAuto: false,
            minHeightAuto: false,
          },
          style: { opacity: 0.8 },
        },
      ],
    });

    expect(profile.elementOverrides[0].defaults).toEqual({
      width: 760,
      height: 74,
      minWidth: 0,
      minHeight: 0,
      widthAuto: true,
      heightAuto: true,
      minWidthAuto: false,
      minHeightAuto: false,
    });
  });

  it("does not replace an authored container layout unless the target is a real list", () => {
    const rule = buildElementOverrideRule({
      id: "element-scroll-shell",
      label: "DIV · SCROLL SHELL",
      path: [{ tag: "div", index: 0, marker: "class:csa-root" }],
      kind: "container",
      style: { opacity: 0.8, layout: "grid", columns: 2, gap: 0 },
    });

    expect(rule).toContain("opacity: 0.8 !important");
    expect(rule).not.toContain("display: grid !important");
    expect(rule).not.toContain("grid-template-columns");
  });

  it("keeps and clamps live component settings", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-ram-slider",
          label: "DIV · RAM",
          path: [{ tag: "div", index: 0, marker: "class:es-root" }],
          kind: "slider",
          component: {
            kind: "slider",
            props: {
              label: "RAM",
              min: 1,
              max: 64,
              step: 1,
              defaultValue: 4,
              tickMode: "custom",
              customTicks: [1, 21, 42, 64],
              showHeader: false,
            },
          },
          componentSettings: {
            kind: "slider",
            settings: {
              min: 64,
              max: 1,
              step: 0,
              defaultValue: 999,
              customTicks: [-10, 64, 999],
            },
          },
          style: { width: 9_999, height: -5, columns: 99, gap: 999 },
        },
      ],
    });

    expect(profile.elementOverrides[0]).toMatchObject({
      kind: "slider",
      component: {
        kind: "slider",
        props: { min: 1, max: 64, customTicks: [1, 21, 42, 64] },
      },
      componentSettings: {
        kind: "slider",
        settings: {
          min: 64,
          max: 65,
          step: 0.01,
          defaultValue: 65,
          customTicks: [-10, 64, 999],
        },
      },
      style: { width: 1600, height: 0, columns: 12, gap: 96 },
    });
  });

  it("preserves RAM tick labels outside the temporary active range", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-system-ram-reversible-ticks",
          label: "DIV · RAM",
          path: [{ tag: "div", index: 0, marker: "class:es-root" }],
          kind: "slider",
          component: {
            kind: "slider",
            props: {
              label: "RAM",
              min: 1,
              max: 64,
              step: 1,
              defaultValue: 12,
              constraint: "system-ram",
              maxMode: "system",
              systemMax: 64,
              tickMode: "custom",
              customTicks: [1, 21, 42, 64],
              showHeader: false,
            },
          },
          componentSettings: {
            kind: "slider",
            settings: {
              min: 24,
              max: 40,
              maxMode: "custom",
              customTicks: [1, 21, 42, 64],
            },
          },
          style: {},
        },
      ],
    });

    expect(profile.elementOverrides[0].componentSettings).toMatchObject({
      kind: "slider",
      settings: {
        min: 24,
        max: 40,
        customTicks: [1, 21, 42, 64],
      },
    });
  });

  it("never lets a system RAM slider profile exceed detected memory", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-system-ram-slider",
          label: "DIV · RAM",
          path: [{ tag: "div", index: 0, marker: "class:es-root" }],
          kind: "slider",
          component: {
            kind: "slider",
            props: {
              label: "RAM",
              min: 1,
              max: 64,
              step: 1,
              defaultValue: 12,
              constraint: "system-ram",
              maxMode: "system",
              systemMax: 64,
              tickMode: "custom",
              customTicks: [1, 21, 42, 64],
              showHeader: false,
            },
          },
          componentSettings: {
            kind: "slider",
            settings: {
              min: 1,
              max: 1_000,
              step: 6.42,
              defaultValue: 1_000,
              maxMode: "custom",
              customTicks: [1, 64, 1_000],
              showValue: false,
              valueEditable: true,
              keyboardEnabled: false,
              showDefaultMarker: true,
            },
          },
          style: {},
        },
      ],
    });

    expect(profile.elementOverrides[0].componentSettings).toMatchObject({
      kind: "slider",
      settings: {
        max: 64,
        step: 6,
        defaultValue: 64,
        maxMode: "custom",
        customTicks: [1, 64, 64],
        showValue: false,
        valueEditable: true,
        keyboardEnabled: false,
        showDefaultMarker: true,
      },
    });
  });

  it("keeps the RAM slider minimum at one gigabyte", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-system-ram-min",
          label: "DIV · RAM",
          path: [{ tag: "div", index: 0, marker: "class:es-root" }],
          kind: "slider",
          component: {
            kind: "slider",
            props: {
              label: "RAM",
              min: 1,
              max: 64,
              step: 1,
              defaultValue: 12,
              constraint: "system-ram",
              maxMode: "system",
              systemMax: 64,
              tickMode: "custom",
              customTicks: [1, 64],
              showHeader: false,
            },
          },
          componentSettings: {
            kind: "slider",
            settings: { min: -100 },
          },
          style: {},
        },
      ],
    });

    expect(profile.elementOverrides[0].componentSettings).toMatchObject({
      kind: "slider",
      settings: { min: 1 },
    });
  });

  it("keeps a text-only element override, including intentionally empty text", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-play",
          label: "BUTTON · PLAY LAST",
          path: [{ tag: "button", index: 0 }],
          textTarget: {
            path: [0, 1, 0],
            original: "My Build",
            template: "%build_name%",
          },
          defaults: { width: 64, height: 34, minWidth: 0, minHeight: 0 },
          text: "",
          style: {},
        },
      ],
    });

    expect(profile.elementOverrides[0]).toMatchObject({
      text: "",
      textTarget: {
        path: [0, 1, 0],
        original: "My Build",
        template: "%build_name%",
      },
      defaults: { width: 64, height: 34, minWidth: 0, minHeight: 0 },
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
