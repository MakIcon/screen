import { describe, expect, it } from "vitest";
import { getPaletteContextLayout } from "./paletteContextLayout";

describe("palette context layout", () => {
  const anchor = { left: 24, top: 98, width: 132, height: 86 };
  it.each([
    [960, 540],
    [1280, 720],
    [560, 540],
  ])("keeps the original context uncovered at %sx%s", (width, height) => {
    const result = getPaletteContextLayout(anchor, width, height);
    expect(result.spotlight).not.toBeNull();
    const hole = result.spotlight!;
    expect(hole.left).toBeLessThan(anchor.left);
    expect(hole.top).toBeLessThan(anchor.top);
    expect(hole.left + hole.width).toBeGreaterThan(anchor.left + anchor.width);
    expect(hole.top + hole.height).toBeGreaterThan(anchor.top + anchor.height);
    expect(result.panel.left).toBeGreaterThan(hole.left + hole.width);
    expect(result.panel.left + result.panel.width).toBeLessThanOrEqual(width - 20);
    expect(result.panel.top + result.panel.height).toBeLessThanOrEqual(height - 20);
    expect(result.clipPath).toContain("evenodd");
    expect(result.connector).not.toBeNull();
    expect(result.connection?.edge).toBe("left");
    expect(result.connection?.end.x).toBe(result.panel.left);
    expect(result.connection!.end.y).toBeGreaterThanOrEqual(result.panel.top);
    expect(result.connection!.end.y).toBeLessThan(result.panel.top + result.panel.height);
  });
  it("puts the palette below the context when there is no room beside it", () => {
    const result = getPaletteContextLayout(anchor, 440, 700);
    expect(result.spotlight).not.toBeNull();
    expect(result.panel.top).toBeGreaterThan(anchor.top + anchor.height);
    expect(result.connection?.edge).toBe("top");
    expect(result.connection?.end.y).toBe(result.panel.top);
  });
  it("uses inline context when the anchor is absent, hidden or the window is too small", () => {
    expect(getPaletteContextLayout(null, 960, 540).spotlight).toBeNull();
    expect(getPaletteContextLayout({ ...anchor, width: 0 }, 960, 540).clipPath).toBeUndefined();
    expect(getPaletteContextLayout(anchor, 360, 300).spotlight).toBeNull();
    expect(getPaletteContextLayout({ ...anchor, left: -10 }, 960, 540).spotlight).toBeNull();
  });
});
