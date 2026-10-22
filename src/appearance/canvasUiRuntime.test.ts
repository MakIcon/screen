import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canvasUiClipInsets,
  canvasUiLocalBounds,
  canvasUiReplacesContent,
  canvasUiMutationAffectsCapture,
} from "./canvasUiRuntime";

describe("Canvas UI element geometry", () => {
  it("uses local coordinates inside a scaled launcher", () => {
    expect(
      canvasUiLocalBounds(
        { left: 140, top: 100, width: 240, height: 80 },
        { left: 60, top: 60, width: 800, height: 480 },
        1000,
        600,
      ),
    ).toEqual({ left: 100, top: 50, width: 300, height: 100 });
  });

  it("clips a partially scrolled card against every scroll container", () => {
    expect(
      canvasUiClipInsets({ left: 100, top: 20, width: 400, height: 200 }, [
        { left: 0, top: 0, width: 450, height: 600 },
        { left: 80, top: 70, width: 400, height: 300 },
      ]),
    ).toEqual({ left: 0, top: 50, right: 50, bottom: 0, visible: true });
  });

  it("hides an effect when its element scrolls completely out of view", () => {
    expect(
      canvasUiClipInsets({ left: 10, top: -120, width: 80, height: 60 }, [
        { left: 0, top: 0, width: 200, height: 200 },
      ]).visible,
    ).toBe(false);
  });
});

describe("native Canvas UI invalidation", () => {
  class ElementStub {
    constructor(
      public renderer = false,
      public style = "",
    ) {}
    closest() {
      return this.renderer ? this : null;
    }
    matches() {
      return this.renderer;
    }
    getAttribute() {
      return this.style;
    }
  }

  afterEach(() => vi.unstubAllGlobals());

  function mutation(record: Record<string, unknown>) {
    vi.stubGlobal("Element", ElementStub);
    return canvasUiMutationAffectsCapture({
      target: new ElementStub(),
      type: "attributes",
      addedNodes: [],
      removedNodes: [],
      ...record,
    } as unknown as MutationRecord);
  }

  it("ignores concealment and renderer changes to prevent feedback loops", () => {
    expect(mutation({ attributeName: "data-canvas-ui-replaced" })).toBe(false);
    expect(mutation({ attributeName: "data-canvas-ui-ready" })).toBe(false);
    expect(mutation({ target: new ElementStub(true), type: "childList" })).toBe(false);
  });

  it("ignores insertion of an effect layer but tracks real content insertion", () => {
    expect(mutation({ type: "childList", addedNodes: [new ElementStub(true)] })).toBe(false);
    expect(mutation({ type: "childList", addedNodes: [new ElementStub()] })).toBe(true);
  });

  it("keeps source text and appearance updates live", () => {
    expect(mutation({ type: "characterData" })).toBe(true);
    expect(mutation({ attributeName: "class" })).toBe(true);
    expect(
      mutation({
        attributeName: "style",
        target: new ElementStub(false, "color: red"),
        oldValue: "color: blue",
      }),
    ).toBe(true);
    expect(
      mutation({
        attributeName: "style",
        target: new ElementStub(false, "color: red"),
        oldValue: "color: red",
      }),
    ).toBe(false);
  });

  it("ignores repeated attribute writes from applying the same appearance", () => {
    expect(
      mutation({
        attributeName: "class",
        target: new ElementStub(false, "selected"),
        oldValue: "selected",
      }),
    ).toBe(false);
    expect(
      mutation({
        attributeName: "data-appearance-override",
        target: new ElementStub(false, "element-1"),
        oldValue: "element-1",
      }),
    ).toBe(false);
    expect(
      mutation({
        attributeName: "class",
        target: new ElementStub(false, "selected"),
        oldValue: "",
      }),
    ).toBe(true);
  });
});

describe("Canvas UI composition", () => {
  it("retains the DOM under lenses, and replaces it under full texture effects", () => {
    for (const effect of [
      "bubble",
      "glass",
      "magnify",
      "clouds",
      "asciify",
      "ascii-sweep",
      "laser",
    ] as const) {
      expect(canvasUiReplacesContent(effect)).toBe(false);
    }
    for (const effect of ["glitch", "ripple", "cloth", "peel"] as const) {
      expect(canvasUiReplacesContent(effect)).toBe(true);
    }
  });
});
