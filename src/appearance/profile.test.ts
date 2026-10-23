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
    expect(profile.background.scope).toBe("launcher");
    expect(profile.shape.radius).toBe(0);
    expect(profile.opacity.panels).toBe(1);
    expect(profile.navigation.legacyTabs).toEqual([]);
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

  it("keeps safe embedded custom fonts and makes them available to element overrides", () => {
    const fontStack = '"AppearanceCustom-demo", sans-serif';
    const profile = normalizeAppearanceProfile({
      customized: true,
      typography: {
        uiFont: fontStack,
        customFonts: [
          {
            id: "font-demo",
            name: "Demo Sans",
            family: "AppearanceCustom-demo",
            dataUrl: "data:font/woff2;base64,d09GMg==",
            format: "woff2",
          },
          {
            id: "../unsafe",
            name: "Unsafe",
            family: "bad;family",
            dataUrl: "data:text/html;base64,PHNjcmlwdD4=",
            format: "woff2",
          },
        ],
      },
      elementOverrides: [
        {
          id: "element-custom-font",
          label: "SPAN · CUSTOM FONT",
          path: [{ tag: "span", index: 0 }],
          style: { fontFamily: fontStack },
        },
      ],
    });

    expect(profile.typography.uiFont).toBe(fontStack);
    expect(profile.typography.customFonts).toHaveLength(1);
    expect(profile.typography.customFonts[0].name).toBe("Demo Sans");
    expect(profile.elementOverrides[0].style.fontFamily).toBe(fontStack);
  });

  it("persists known element material presets and rejects unknown preset ids", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-material-card",
          label: "DIV · MATERIAL",
          path: [{ tag: "div", index: 0 }],
          style: { materialPreset: "liquid-glass", liquidGlass: true },
        },
        {
          id: "element-material-unsafe",
          label: "DIV · UNKNOWN",
          path: [{ tag: "div", index: 1 }],
          style: { materialPreset: "javascript:gold", backgroundColor: "#ABCDEF" },
        },
      ],
    });

    expect(profile.elementOverrides[0].style).toMatchObject({
      materialPreset: "liquid-glass",
      liquidGlass: true,
    });
    expect(profile.elementOverrides[1].style).toEqual({ backgroundColor: "#abcdef" });
  });

  it("migrates the legacy transparent-panel default but preserves an intentional v2 zero", () => {
    const migrated = normalizeAppearanceProfile({
      version: 1,
      customized: true,
      opacity: { panels: 0 },
    });
    const explicit = normalizeAppearanceProfile({
      version: 2,
      customized: true,
      opacity: { panels: 0 },
    });

    expect(migrated.version).toBe(2);
    expect(migrated.opacity.panels).toBe(1);
    expect(explicit.opacity.panels).toBe(0);
  });

  it("normalizes the content-only background scope", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      baseTheme: "dark",
      colors: { background: "#123456" },
      background: { scope: "content" },
    });
    const style = buildAppearanceStyle(profile) as Record<string, string>;

    expect(profile.background.scope).toBe("content");
    expect(style["--appearance-background-color"]).toBe("#123456");
    expect(style["--bg"]).toBe("#111110");
  });

  it("keeps only known sidebar entries in the original-design list", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      navigation: {
        legacyTabs: ["shaders", "unknown", "instances", "shaders"],
      },
    });

    expect(profile.navigation.legacyTabs).toEqual(["instances", "shaders"]);
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
        fontFamily: '"Monocraft", monospace',
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
    expect(rule).toContain(
      '[data-appearance-override="element-play"][data-appearance-override="element-play"][data-appearance-override="element-play"] * { font-family: "Monocraft", monospace !important; font-size: 18px !important',
    );
    expect(rule).toContain("padding-left: 24px !important");
    expect(rule).toContain("border-style: solid !important");
    expect(rule).toContain("box-shadow:");
    expect(rule).toContain("transform: rotate(2deg) scale(1.08) !important");
  });

  it("normalizes independent normal and hover element appearances", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-sidebar-item",
          label: "BUTTON · OVERVIEW",
          path: [{ tag: "button", index: 0, marker: "class:side-nav-item" }],
          defaults: {
            width: 80,
            height: 20,
            minWidth: 0,
            minHeight: 0,
            elementOpacity: -2,
            hoverElementOpacity: 5,
          },
          style: { elementOpacity: -1 },
          hoverStyle: { elementOpacity: 4, scale: 3, rotate: -500 },
          hoverTransitionMs: 9_000,
          hoverEasing: "ease-out",
        },
      ],
    });

    expect(profile.elementOverrides[0]).toMatchObject({
      style: { elementOpacity: 0 },
      hoverStyle: { elementOpacity: 1, scale: 1.5, rotate: -180 },
      hoverTransitionMs: 2_000,
      hoverEasing: "ease-out",
      defaults: { elementOpacity: 0, hoverElementOpacity: 1 },
    });
  });

  it("builds real and pinned hover rules with a configurable transition", () => {
    const rule = buildElementOverrideRule({
      id: "element-sidebar-item",
      label: "BUTTON · OVERVIEW",
      path: [{ tag: "button", index: 0 }],
      kind: "button",
      style: { elementOpacity: 0.3, contentOpacity: 0.4 },
      hoverStyle: { elementOpacity: 0.85, contentOpacity: 1, scale: 1.06 },
      hoverTransitionMs: 350,
      hoverEasing: "ease-out",
    });

    expect(rule).toContain("opacity: 0.3 !important");
    expect(rule).toContain(":hover");
    expect(rule).toContain(".appearance-hover-preview");
    expect(rule).toContain("transition-duration: 350ms !important");
    expect(rule).toContain("transition-timing-function: ease-out !important");
    expect(rule).toContain('[data-appearance-override="element-sidebar-item"]::before');
    expect(rule).toContain('[data-appearance-override="element-sidebar-item"] *');
    expect(rule).toContain("opacity: 0.85 !important");
    expect(rule).toContain("transform: rotate(0deg) scale(1.06) !important");
    expect(rule).toContain("> * { opacity: 1 !important; }");
  });

  it("normalizes and builds pressed, focus, disabled and selected visual states", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-stateful-button",
          label: "BUTTON · STATEFUL",
          path: [{ tag: "button", index: 0 }],
          kind: "button",
          style: { scale: 1 },
          pressedStyle: { scale: 0.94 },
          focusStyle: { outlineWidth: 3, outlineColor: "#ABCDEF" },
          disabledStyle: { elementOpacity: 0.2 },
          selectedStyle: { glowIntensity: 4, glowColor: "#FF5500" },
          stateTransitionMs: 275,
          stateEasing: "ease-in-out",
        },
      ],
    });
    const override = profile.elementOverrides[0];
    const rule = buildElementOverrideRule(override);

    expect(override).toMatchObject({
      pressedStyle: { scale: 0.94 },
      focusStyle: { outlineWidth: 3, outlineColor: "#abcdef" },
      disabledStyle: { elementOpacity: 0.2 },
      selectedStyle: { glowIntensity: 1, glowColor: "#ff5500" },
      stateTransitionMs: 275,
      stateEasing: "ease-in-out",
    });
    expect(rule).toContain(":active");
    expect(rule).toContain(".appearance-pressed-preview");
    expect(rule).toContain(":focus-visible");
    expect(rule).toContain('[aria-disabled="true"]');
    expect(rule).toContain('[aria-selected="true"]');
    expect(rule).toContain(".appearance-selected-preview");
    expect(rule).toContain("transition-duration: 275ms !important");
  });

  it("applies positioning, stacking and advanced material effects", () => {
    const rule = buildElementOverrideRule({
      id: "element-glass-card",
      label: "DIV · GLASS",
      path: [{ tag: "div", index: 0 }],
      style: {
        offsetX: 28,
        offsetY: -12,
        marginTop: 14,
        marginLeft: -6,
        order: 3,
        alignSelf: "center",
        justifySelf: "end",
        zIndex: 24,
        shadowColor: "#112233",
        shadowX: 4,
        shadowY: 12,
        shadowBlur: 36,
        shadowSpread: 2,
        glowColor: "#55aaff",
        glowBlur: 42,
        glowIntensity: 0.65,
        backdropBlur: 22,
        outlineWidth: 2,
        outlineColor: "#ffffff",
        outlineOffset: 4,
        grainOpacity: 0.18,
        glassEffect: true,
        glassTint: "#dcecff",
        glassOpacity: 0.16,
        glassSaturation: 1.5,
      },
    });

    expect(rule).toContain("transform: translate(28px, -12px)");
    expect(rule).toContain("margin-top: 14px !important");
    expect(rule).toContain("margin-left: -6px !important");
    expect(rule).toContain("order: 3 !important");
    expect(rule).toContain("align-self: center !important");
    expect(rule).toContain("justify-self: end !important");
    expect(rule).toContain("z-index: 24 !important");
    expect(rule).toContain("4px 12px 36px 2px #112233");
    expect(rule).toContain("backdrop-filter: blur(22px) saturate(1.5) !important");
    expect(rule).toContain("outline-width: 2px !important");
    expect(rule).toContain("fractalNoise");
  });

  it("restores global and per-element Canvas UI settings together", () => {
    const elementEffect = { enabled: true, effect: "grid", settings: { grid: { tilt: 1 } } };
    const profile = normalizeAppearanceProfile({
      ...createDefaultAppearance("dark", true),
      canvasUi: elementEffect,
      elementOverrides: [
        {
          id: "element-effect-only",
          path: [{ tag: "div", index: 0 }],
          style: {},
          canvasUi: elementEffect,
        },
        {
          id: "element-styled-button",
          path: [{ tag: "button", index: 0 }],
          style: { radius: 12 },
          textTarget: { path: [0], original: "Before" },
          text: "My button",
          canvasUi: elementEffect,
        },
      ],
    });

    expect(profile.canvasUi).toMatchObject({ enabled: true, effect: "grid" });
    expect(profile.baseTheme).toBe("dark");
    expect(profile.elementOverrides).toHaveLength(2);
    expect(profile.elementOverrides[0]).toMatchObject({
      id: "element-effect-only",
      canvasUi: { enabled: true, effect: "grid" },
    });
    expect(profile.elementOverrides[1]).toMatchObject({
      id: "element-styled-button",
      text: "My button",
      style: { radius: 12 },
    });
    expect(profile.elementOverrides[1].canvasUi).toMatchObject(elementEffect);
  });

  it("controls an element background and its content opacity independently", () => {
    const rule = buildElementOverrideRule({
      id: "element-opacity-card",
      label: "DIV · CARD",
      path: [{ tag: "div", index: 0 }],
      defaults: {
        width: 320,
        height: 180,
        minWidth: 0,
        minHeight: 0,
        backgroundColor: "rgba(255, 255, 255, 0.65)",
        backgroundImage: "linear-gradient(rgb(255, 255, 255), transparent)",
        backgroundBefore: true,
        beforeOpacity: 1,
        textColor: "rgb(26, 26, 26)",
      },
      style: { backgroundOpacity: 0.25, contentOpacity: 0.7 },
    });

    expect(rule).toContain(
      "background-color: color-mix(in srgb, rgba(255, 255, 255, 0.65) 25%, transparent) !important",
    );
    expect(rule).toContain(
      "color: color-mix(in srgb, rgb(26, 26, 26) 70%, transparent) !important",
    );
    expect(rule).toContain("> * { opacity: 0.7 !important; }");
    expect(rule).toContain("::before");
    expect(rule).toContain("opacity: 0.25 !important");
    expect(rule).toContain(
      "linear-gradient(color-mix(in srgb, rgb(255, 255, 255) 25%, transparent), color-mix(in srgb, transparent 25%, transparent))",
    );
    expect(rule.split("\n")[0]).not.toMatch(/(?:^|; )opacity:/);
  });

  it("builds a custom gradient whose stops respect background opacity", () => {
    const rule = buildElementOverrideRule({
      id: "element-gradient-card",
      label: "DIV · GRADIENT CARD",
      path: [{ tag: "div", index: 0 }],
      defaults: {
        width: 320,
        height: 180,
        minWidth: 0,
        minHeight: 0,
        backgroundBefore: true,
      },
      style: {
        backgroundKind: "gradient",
        backgroundGradientStart: "#123456",
        backgroundGradientEnd: "#abcdef",
        backgroundGradientAngle: 42,
        backgroundOpacity: 0.4,
      },
    });

    expect(rule).toContain("background-image: linear-gradient(42deg in oklab");
    expect(rule).toContain("color-mix(in oklab, #123456 40%, transparent) 0%");
    expect(rule).toContain("color-mix(in oklab, #abcdef 40%, transparent) 100%");
    expect(rule).toContain("background-clip: padding-box !important");
    expect(rule).toContain("::before");
    expect(rule).toContain("background: transparent !important");
  });

  it("layers a text gradient over the existing element surface", () => {
    const rule = buildElementOverrideRule({
      id: "element-gradient-title",
      label: "BUTTON · GRADIENT TITLE",
      path: [{ tag: "button", index: 0 }],
      defaults: {
        width: 220,
        height: 48,
        minWidth: 0,
        minHeight: 0,
        backgroundColor: "#111827",
        textColor: "#f8fafc",
      },
      style: {
        backgroundKind: "solid",
        backgroundColor: "#111827",
        textKind: "gradient",
        textColor: "#f8fafc",
        textGradientAngle: 90,
        textGradientStops: [
          { color: "#f97316", position: 0 },
          { color: "#ec4899", position: 100 },
        ],
        contentOpacity: 0.6,
      },
    });

    expect(rule).toContain("background-image: linear-gradient(90deg in oklab");
    expect(rule).toContain("color-mix(in oklab, #f97316 60%, transparent) 0%");
    expect(rule).toContain(", linear-gradient(#111827, #111827) !important");
    expect(rule).toContain("background-clip: text, padding-box");
    expect(rule).toContain("-webkit-text-fill-color: transparent !important");
    expect(rule).toContain("caret-color: #f8fafc !important");
  });

  it("builds animated gradients, text decoration and an entrance effect", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-animated-title",
          label: "H1 · ANIMATED",
          path: [{ tag: "h1", index: 0 }],
          style: {
            textKind: "gradient",
            textGradientStart: "#FFFFFF",
            textGradientEnd: "#00AAFF",
            textGradientAnimation: "flow",
            textGradientAnimationDuration: 99_000,
            textGradientAnimationDirection: "reverse",
            textDecoration: "underline",
            textDecorationStyle: "wavy",
            textDecorationColor: "#AABBCC",
            textDecorationThickness: 99,
            textShadowColor: "#112233",
            textShadowX: -99,
            textShadowY: 99,
            textShadowBlur: 99,
            textStrokeColor: "#FFFFFF",
            textStrokeWidth: 99,
            entranceAnimation: "rise",
            entranceDuration: 99_000,
            entranceDelay: -50,
            entranceEasing: "ease-out",
            liquidGlass: true,
            liquidGlassRefraction: 9,
          },
        },
      ],
    });
    const style = profile.elementOverrides[0].style;
    const rule = buildElementOverrideRule(profile.elementOverrides[0]);

    expect(style).toMatchObject({
      textGradientAnimation: "flow",
      textGradientAnimationDuration: 30_000,
      textGradientAnimationDirection: "reverse",
      textDecoration: "underline",
      textDecorationStyle: "wavy",
      textDecorationColor: "#aabbcc",
      textDecorationThickness: 12,
      textShadowColor: "#112233",
      textShadowX: -40,
      textShadowY: 40,
      textShadowBlur: 80,
      textStrokeWidth: 8,
      entranceAnimation: "rise",
      entranceDuration: 5_000,
      entranceDelay: 0,
      entranceEasing: "ease-out",
      liquidGlass: true,
      liquidGlassRefraction: 1,
    });
    expect(rule).toContain("text-decoration-line: underline !important");
    expect(rule).toContain("text-shadow: -40px 40px 80px #112233 !important");
    expect(rule).toContain("animation-name: appearance-gradient-flow-");
    expect(rule).toContain("appearance-entrance-rise-");
    expect(rule).toContain("@keyframes appearance-gradient-flow-");
  });

  it("keeps safe text gradient settings", () => {
    const profile = normalizeAppearanceProfile({
      elementOverrides: [
        {
          id: "element-text-gradient-safe",
          label: "SPAN · SAFE",
          path: [{ tag: "span", index: 0 }],
          style: {
            textKind: "gradient",
            textColor: "#ABCDEF",
            textGradientStart: "#FF0000",
            textGradientEnd: "#0000FF",
            textGradientAngle: 999,
            textGradientType: "radial",
            textGradientStops: [
              { color: "#FFFFFF", position: 120 },
              { color: "invalid", position: 50 },
              { color: "#000000", position: -20 },
            ],
            textGradientCenterX: -10,
            textGradientCenterY: 150,
            textGradientScale: 999,
            textGradientRadialShape: "ellipse",
            textGradientRadialAspect: 9,
            textGradientStrength: -1,
            textGradientMidpoint: 2,
            textGradientSoftness: 4,
          },
        },
      ],
    });

    expect(profile.elementOverrides[0].style).toMatchObject({
      textKind: "gradient",
      textColor: "#abcdef",
      textGradientStart: "#ff0000",
      textGradientEnd: "#0000ff",
      textGradientAngle: 360,
      textGradientType: "radial",
      textGradientStops: [
        { color: "#000000", position: 0 },
        { color: "#ffffff", position: 100 },
      ],
      textGradientCenterX: 0,
      textGradientCenterY: 100,
      textGradientScale: 200,
      textGradientRadialShape: "ellipse",
      textGradientRadialAspect: 2,
      textGradientStrength: 0,
      textGradientMidpoint: 0.95,
      textGradientSoftness: 1,
    });
  });

  it("keeps safe gradient settings and computed background data", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          id: "element-gradient-safe",
          label: "DIV · SAFE",
          path: [{ tag: "div", index: 0 }],
          defaults: {
            width: 100,
            height: 100,
            minWidth: 0,
            minHeight: 0,
            backgroundColor: "rgba(255, 255, 255, 0.5)",
            backgroundImage: "linear-gradient(rgb(255, 255, 255), transparent)",
            textColor: "rgb(20, 20, 20)",
          },
          style: {
            backgroundKind: "gradient",
            backgroundGradientStart: "#ABCDEF",
            backgroundGradientEnd: "#123456",
            backgroundGradientAngle: 999,
            backgroundGradientType: "radial",
            backgroundGradientStops: [
              { color: "#FF0000", position: 120 },
              { color: "not-a-color", position: 50 },
              { color: "#00FF00", position: 40 },
              { color: "#0000FF", position: -20 },
            ],
            backgroundGradientCenterX: -10,
            backgroundGradientCenterY: 150,
            backgroundGradientScale: 999,
            backgroundGradientRadialShape: "ellipse",
            backgroundGradientRadialAspect: 9,
            backgroundGradientStrength: -1,
            backgroundGradientMidpoint: 2,
            backgroundGradientSoftness: 4,
            backgroundOpacity: -1,
            contentOpacity: 2,
          },
        },
      ],
    });

    expect(profile.elementOverrides[0].style).toMatchObject({
      backgroundKind: "gradient",
      backgroundGradientStart: "#abcdef",
      backgroundGradientEnd: "#123456",
      backgroundGradientAngle: 360,
      backgroundGradientType: "radial",
      backgroundGradientStops: [
        { color: "#0000ff", position: 0 },
        { color: "#00ff00", position: 40 },
        { color: "#ff0000", position: 100 },
      ],
      backgroundGradientCenterX: 0,
      backgroundGradientCenterY: 100,
      backgroundGradientScale: 200,
      backgroundGradientRadialShape: "ellipse",
      backgroundGradientRadialAspect: 2,
      backgroundGradientStrength: 0,
      backgroundGradientMidpoint: 0.95,
      backgroundGradientSoftness: 1,
      backgroundOpacity: 0,
      contentOpacity: 1,
    });
    expect(profile.elementOverrides[0].defaults?.backgroundImage).toBe(
      "linear-gradient(rgb(255, 255, 255), transparent)",
    );
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

    expect(mapDrawingCursorToCover({ x: 0.5, y: 0.5, size: 2 }, 960, 540).diameter).toBe(2);
  });

  it("does not darken a solid background", () => {
    const style = buildAppearanceStyle(createDefaultAppearance("light")) as Record<string, string>;
    expect(style["--appearance-background-image"]).toBe("none");
    expect(style["--appearance-background-dim"]).toBe("rgba(0, 0, 0, 0.000)");
  });

  it("saves a safe full-window gradient and renders it without image darkening", () => {
    const profile = normalizeAppearanceProfile({
      customized: true,
      background: {
        kind: "gradient",
        scope: "content",
        gradient: {
          backgroundGradientType: "radial",
          backgroundGradientStops: [
            { color: "#112233", position: -10 },
            { color: "url(javascript:alert(1))", position: 45 },
            { color: "#AABBCC", position: 110 },
          ],
          backgroundGradientCenterX: 120,
          backgroundGradientStrength: 0.8,
        },
      },
    });
    const style = buildAppearanceStyle(profile) as Record<string, string>;

    expect(profile.background.kind).toBe("gradient");
    expect(profile.background.scope).toBe("content");
    expect(profile.background.gradient.backgroundGradientStops).toEqual([
      { color: "#112233", position: 0 },
      { color: "#aabbcc", position: 100 },
    ]);
    expect(profile.background.gradient.backgroundGradientCenterX).toBe(100);
    expect(style["--appearance-background-image"]).toMatch(/^radial-gradient\(/);
    expect(style["--appearance-background-image"]).not.toContain("javascript");
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

    const customized = createDefaultAppearance("dark", true);
    customized.navigation.legacyTabs = ["instances", "shaders"];
    applyAppearanceToElement(element, customized);
    expect(properties.size).toBeGreaterThan(0);
    expect(element.dataset.appearanceLegacySidebar).toBe("instances shaders");

    applyAppearanceToElement(element, createDefaultAppearance("light"));
    expect(properties.size).toBe(0);
    expect(element.dataset.appearanceCustom).toBe("false");
    expect(element.dataset.appearanceLegacySidebar).toBe("");
  });
});
