import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPaletteMeshOffset,
  advancePaletteMesh,
  constrainPaletteMesh,
  getPaletteMeshWeights,
  pinPaletteMesh,
  PALETTE_GRID,
  restingPaletteMesh,
  uniformPaletteMesh,
} from "./paletteElasticMotion";
import { createPaletteWaveFilter, paletteWaveSource } from "./paletteWaveFilter";

const size = { width: 640, height: 400 };
function bent() {
  const mesh = restingPaletteMesh();
  mesh[2 * PALETTE_GRID].x = 35;
  mesh[3 * PALETTE_GRID].x = 35;
  return mesh;
}

describe("live palette wave filter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [0, 0.5],
    [0.1, 0.4],
    [0.5, 0.5],
  ])("samples back to the original pixel at %s,%s", (u, v) => {
    const mesh = bent();
    const base = getPaletteMeshOffset(mesh, size, 0.5, 0.5);
    const offset = getPaletteMeshOffset(mesh, size, u, v);
    const source = paletteWaveSource(
      mesh,
      size,
      base,
      u * size.width + offset.x - base.x,
      v * size.height + offset.y - base.y,
    );
    expect(source.x).toBeCloseTo(u * size.width, 0);
    expect(source.y).toBeCloseTo(v * size.height, 0);
  });

  it("leaves pixels unchanged under a rigid translation", () => {
    expect(
      paletteWaveSource(uniformPaletteMesh({ x: 100, y: 50 }), size, { x: 100, y: 50 }, 42, 70),
    ).toEqual({ x: 42, y: 70 });
  });

  it.each([180, 400])(
    "keeps pixels continuous through sharp reversals on a %spx panel",
    (height) => {
      const dimensions = { width: 640, height };
      const grab = { u: 0.3, v: 0.04 };
      const weights = getPaletteMeshWeights(grab, dimensions);
      let mesh = restingPaletteMesh();
      let strongestBend = 0;
      for (let frame = 0; frame < 90; frame++) {
        const direction = Math.floor(frame / 4) % 2 ? -1 : 1;
        const target = { x: direction * 320, y: direction * 160 };
        mesh = constrainPaletteMesh(
          advancePaletteMesh(mesh, target, weights, 1 / 60, true),
          dimensions,
        );
        const visible = pinPaletteMesh(mesh, dimensions, grab, target);
        const base = getPaletteMeshOffset(visible, dimensions, 0.5, 0.5);
        const held = getPaletteMeshOffset(visible, dimensions, grab.u, grab.v);
        expect(held.x).toBeCloseTo(target.x, 8);
        expect(held.y).toBeCloseTo(target.y, 8);
        for (const u of [0, 0.2, 0.5, 0.8, 1]) {
          for (const v of [0, 0.2, 0.5, 0.8, 1]) {
            const offset = getPaletteMeshOffset(visible, dimensions, u, v);
            strongestBend = Math.max(strongestBend, Math.abs(offset.x - base.x));
            const source = paletteWaveSource(
              visible,
              dimensions,
              base,
              u * dimensions.width + offset.x - base.x,
              v * height + offset.y - base.y,
            );
            expect(Math.abs(source.x - u * dimensions.width)).toBeLessThan(0.2);
            expect(Math.abs(source.y - v * height)).toBeLessThan(0.2);
          }
        }
      }
      expect(strongestBend).toBeGreaterThan(15);
    },
  );

  it("keeps stable coordinates, waits for decoding and discards uploads after settling", async () => {
    const imageAttributes = new Map<string, string>();
    const image = {
      setAttribute: (key: string, value: string) => imageAttributes.set(key, value),
      removeAttribute: (key: string) => imageAttributes.delete(key),
    };
    const displacement = { setAttribute: vi.fn() };
    const filter = {
      id: "test-wave",
      setAttribute: vi.fn(),
      querySelector: (tag: string) => (tag === "feImage" ? image : displacement),
    };
    const context = {
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: vi.fn(),
    };
    let encoded = 0;
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => context,
        toDataURL: () => `data:image/png;base64,frame-${++encoded}`,
      }),
    });
    const uploads: (() => void)[] = [];
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode = () => new Promise<void>((resolve) => uploads.push(resolve));
      },
    );
    const dialog = { querySelector: () => filter } as unknown as HTMLDialogElement;
    const panel = { style: { filter: "" } } as unknown as HTMLElement;
    const waves = createPaletteWaveFilter(dialog, panel)!;
    waves.render(bent(), size);
    expect(panel.style.filter).toBe("");
    expect(imageAttributes.has("href")).toBe(false);
    uploads.shift()!();
    await vi.waitFor(() => expect(panel.style.filter).toContain("test-wave"));
    expect(panel.style.filter).toContain("test-wave");
    expect(imageAttributes.get("href")).toMatch(/^data:image\/png/);
    expect(context.putImageData).toHaveBeenCalledOnce();
    const coordinates = filter.setAttribute.mock.calls.map((call) => [...call]);
    const scale = displacement.setAttribute.mock.calls.map((call) => [...call]);
    const stronger = bent();
    stronger[2 * PALETTE_GRID].x = 60;
    waves.render(stronger, size);
    waves.render(stronger, size);
    expect(uploads).toHaveLength(1);
    expect(filter.setAttribute.mock.calls.slice(4, 8)).toEqual(coordinates);
    expect(displacement.setAttribute.mock.calls.slice(1, 2)).toEqual(scale);
    uploads.shift()!();
    await vi.waitFor(() => expect(uploads).toHaveLength(1));
    uploads.shift()!();
    await vi.waitFor(() =>
      expect(imageAttributes.get("href")).toBe("data:image/png;base64,frame-3"),
    );
    waves.render(stronger, size);
    waves.render(stronger, size);
    waves.render(uniformPaletteMesh({ x: 80, y: 40 }), size);
    expect(panel.style.filter).toBe("");
    expect(imageAttributes.has("href")).toBe(false);
    expect(context.putImageData).toHaveBeenCalledTimes(5);
    uploads.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(panel.style.filter).toBe("");
    expect(imageAttributes.has("href")).toBe(false);
    expect(uploads).toHaveLength(0);
  });
});
