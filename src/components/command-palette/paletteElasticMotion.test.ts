import { describe, expect, it } from "vitest";
import {
  advancePaletteMesh,
  getPaletteElasticConnector,
  getPaletteMeshOffset,
  getPaletteMeshTransform,
  getPaletteMeshWeights,
  isPaletteMeshSettled,
  pinPaletteMesh,
  resistPaletteDrag,
  restingPaletteMesh,
  uniformPaletteMesh,
  PALETTE_GRID,
  type PaletteConnection,
} from "./paletteElasticMotion";

const size = { width: 640, height: 400 };
const grabbedTopEdge = getPaletteMeshWeights({ u: 0.5, v: 0.05 }, size);
const origin = { x: 0, y: 0 };

describe("elastic palette motion", () => {
  it("resists long pulls and never exceeds the available travel", () => {
    expect(resistPaletteDrag(10, 200)).toBe(10);
    expect(resistPaletteDrag(140, 200)).toBe(140);
    expect(resistPaletteDrag(200, 200)).toBe(175);
    expect(resistPaletteDrag(10000, 200)).toBeLessThan(200);
    expect(resistPaletteDrag(-200, 200)).toBe(-175);
    expect(resistPaletteDrag(200, 0)).toBe(0);
  });

  it("makes corners far from the grabbed point looser than the near ones", () => {
    const weights = getPaletteMeshWeights({ u: 0, v: 0 }, size);
    expect(weights[0]).toBe(0);
    expect(weights[weights.length - 1]).toBe(1);
    expect(grabbedTopEdge[grabbedTopEdge.length - 1]).toBeGreaterThan(grabbedTopEdge[0]);
  });

  it("lets the far corners lag behind the grabbed corner, then catches up", () => {
    const grabbedCorner = getPaletteMeshWeights({ u: 0, v: 0 }, size);
    const target = { x: 120, y: 0 };
    let mesh = restingPaletteMesh();
    for (let i = 0; i < 6; i++)
      mesh = advancePaletteMesh(mesh, target, grabbedCorner, 1 / 60, true);
    expect(mesh[0].x).toBeGreaterThan(mesh[mesh.length - 1].x + 5);
    for (let i = 0; i < 60; i++)
      mesh = advancePaletteMesh(mesh, target, grabbedCorner, 1 / 60, true);
    expect(mesh.every((corner) => Math.abs(corner.x - 120) < 0.5)).toBe(true);
  });

  it("bends gradually instead of snapping when shaken quickly", () => {
    let mesh = restingPaletteMesh();
    let previous = 0;
    let largest = 0;
    let fastest = 0;
    for (let i = 0; i < 120; i++) {
      const target = { x: 150 * Math.sin(2 * Math.PI * 3 * (i / 60)), y: 0 };
      mesh = advancePaletteMesh(mesh, target, grabbedTopEdge, 1 / 60, true);
      const shear =
        getPaletteMeshOffset(mesh, size, 0.5, 0).x - getPaletteMeshOffset(mesh, size, 0.5, 1).x;
      largest = Math.max(largest, Math.abs(shear));
      fastest = Math.max(fastest, Math.abs(shear - previous));
      previous = shear;
    }
    expect(largest).toBeGreaterThan(20);
    expect(largest).toBeLessThan(80);
    expect(fastest).toBeLessThan(24);
  });

  it.each([30, 60, 144])("wobbles back through the origin then settles at %s Hz", (fps) => {
    let mesh = uniformPaletteMesh({ x: 120, y: -60 });
    let crossed = false;
    for (let i = 0; i < fps * 2.5; i++) {
      mesh = advancePaletteMesh(mesh, origin, grabbedTopEdge, 1 / fps);
      if (mesh[mesh.length - 1].x < -1) crossed = true;
    }
    expect(crossed).toBe(true);
    expect(isPaletteMeshSettled(mesh, origin)).toBe(true);
  });

  it("has a visible rebound while keeping the return controlled", () => {
    let mesh = uniformPaletteMesh({ x: 200, y: 0 });
    let overshoot = 0;
    for (let i = 0; i < 360; i++) {
      mesh = advancePaletteMesh(mesh, origin, grabbedTopEdge, 1 / 60);
      overshoot = Math.min(overshoot, ...mesh.map((corner) => corner.x));
    }
    expect(overshoot).toBeLessThan(-15);
    expect(overshoot).toBeGreaterThan(-65);
  });

  it("does not explode after a suspended animation frame", () => {
    const mesh = advancePaletteMesh(
      uniformPaletteMesh({ x: 100, y: 20 }),
      origin,
      grabbedTopEdge,
      60,
    );
    expect(mesh.every((c) => Object.values(c).every(Number.isFinite))).toBe(true);
    expect(isPaletteMeshSettled(mesh, origin)).toBe(true);
  });

  it("allows the middle of an edge to bend while both corners stay still", () => {
    const mesh = restingPaletteMesh();
    mesh[2 * PALETTE_GRID + PALETTE_GRID - 1].x = 40;
    mesh[3 * PALETTE_GRID + PALETTE_GRID - 1].x = 40;
    expect(getPaletteMeshOffset(mesh, size, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(getPaletteMeshOffset(mesh, size, 1, 0)).toEqual({ x: 0, y: 0 });
    expect(getPaletteMeshOffset(mesh, size, 1, 1)).toEqual({ x: 0, y: 0 });
    const edge = getPaletteMeshOffset(mesh, size, 1, 0.5);
    expect(edge).toEqual({ x: 40, y: 0 });
  });

  it("uses a plain translation when the panel moves rigidly", () => {
    expect(getPaletteMeshTransform(uniformPaletteMesh({ x: 80, y: 40 }), size)).toBe(
      "translate3d(80.000px, 40.000px, 0)",
    );
  });

  it("keeps the grabbed point on the pointer while other corners bend", () => {
    const grab = { u: 0.2, v: 0.06 };
    const target = { x: 120, y: 60 };
    const weights = getPaletteMeshWeights(grab, size);
    const mesh = advancePaletteMesh(restingPaletteMesh(), target, weights, 0.04, true);
    const pinned = pinPaletteMesh(mesh, size, grab, target);
    const held = getPaletteMeshOffset(pinned, size, grab.u, grab.v);
    expect(held.x).toBeCloseTo(target.x, 8);
    expect(held.y).toBeCloseTo(target.y, 8);
    expect(pinned[0].x - pinned[pinned.length - 1].x).toBeGreaterThan(1);
    expect(mesh[0].x).toBeLessThan(120);
  });

  it("keeps the grabbed point fixed even on a short panel during a strong pull", () => {
    const short = { width: 640, height: 180 };
    const grab = { u: 0.2, v: 0.08 };
    const mesh = pinPaletteMesh(
      advancePaletteMesh(
        restingPaletteMesh(),
        { x: 100, y: 40 },
        getPaletteMeshWeights(grab, short),
        0.03,
        true,
      ),
      short,
      grab,
      { x: 100, y: 40 },
    );
    const held = getPaletteMeshOffset(mesh, short, grab.u, grab.v);
    expect(held.x).toBeCloseTo(100, 6);
    expect(held.y).toBeCloseTo(40, 6);
    expect(Math.max(...mesh.map((p) => Math.abs(p.x - held.x)))).toBeLessThanOrEqual(72);
  });

  it("propagates a local impulse through neighbouring points", () => {
    let mesh = restingPaletteMesh();
    mesh[0].vx = 600;
    mesh = advancePaletteMesh(mesh, origin, grabbedTopEdge, 0.05, true);
    expect(mesh[1].x).toBeGreaterThan(0.2);
    expect(mesh[PALETTE_GRID].x).toBeGreaterThan(0.2);
    expect(mesh[mesh.length - 1].x).toBeLessThan(mesh[1].x * 0.1);
  });

  it("creates a clearly visible bend during the return", () => {
    let mesh = uniformPaletteMesh({ x: 200, y: 0 });
    for (let i = 0; i < 6; i++) mesh = advancePaletteMesh(mesh, origin, grabbedTopEdge, 1 / 60);
    const center = getPaletteMeshOffset(mesh, size, 0.5, 0.5);
    const bend = Math.max(...mesh.map((p) => Math.abs(p.x - center.x)));
    expect(bend).toBeGreaterThan(25);
    expect(bend).toBeLessThan(80);
  });

  it.each(["left", "top"] as const)("keeps the %s attachment fixed to the moving panel", (edge) => {
    const connection: PaletteConnection = {
      start: { x: 180, y: 140 },
      end: { x: 220, y: 160 },
      edge,
    };
    const curve = getPaletteElasticConnector(connection, { x: 75, y: -25 });
    expect(curve.path).toMatch(/^M 180 140 C /);
    expect(curve.end).toEqual({ x: 295, y: 135 });
    expect(curve.path.endsWith(", 295 135")).toBe(true);
    expect(connection.start).toEqual({ x: 180, y: 140 });
    expect(connection.end).toEqual({ x: 220, y: 160 });
  });
});
