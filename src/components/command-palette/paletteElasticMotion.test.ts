import { describe, expect, it } from "vitest";
import {
  advancePaletteSpring,
  getPaletteElasticConnector,
  getPaletteElasticTransform,
  isPaletteSpringSettled,
  resistPaletteDrag,
  restingPaletteSpring,
  type PaletteConnection,
} from "./paletteElasticMotion";

describe("elastic palette motion", () => {
  it("resists long pulls and never exceeds the available travel", () => {
    expect(resistPaletteDrag(10, 200)).toBeGreaterThan(9);
    expect(resistPaletteDrag(200, 200)).toBe(100);
    expect(resistPaletteDrag(10000, 200)).toBeLessThan(200);
    expect(resistPaletteDrag(-200, 200)).toBe(-100);
    expect(resistPaletteDrag(200, 0)).toBe(0);
  });

  it.each([30, 60, 144])("bounces through the origin then settles at %s Hz", (fps) => {
    let motion = { ...restingPaletteSpring(), x: 120, y: -60 };
    let crossedOrigin = false;
    for (let i = 0; i < fps * 2; i++) {
      motion = advancePaletteSpring(motion, { x: 0, y: 0 }, 1 / fps);
      if (motion.x < -1) crossedOrigin = true;
    }
    expect(crossedOrigin).toBe(true);
    expect(isPaletteSpringSettled(motion, { x: 0, y: 0 })).toBe(true);
  });

  it("follows a held pointer consistently across refresh rates", () => {
    const positions = [30, 60, 144].map((fps) => {
      let motion = restingPaletteSpring();
      for (let i = 0; i < fps / 2; i++)
        motion = advancePaletteSpring(motion, { x: 80, y: 40 }, 1 / fps);
      return motion.x;
    });
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(0.5);
  });

  it("does not explode after a suspended animation frame", () => {
    const motion = advancePaletteSpring({ x: 100, y: 20, vx: 400, vy: -200 }, { x: 0, y: 0 }, 60);
    expect(Object.values(motion).every(Number.isFinite)).toBe(true);
    expect(Math.abs(motion.x)).toBeLessThan(130);
    expect(Math.abs(motion.y)).toBeLessThan(30);
    expect(isPaletteSpringSettled(motion, { x: 0, y: 0 })).toBe(true);
  });

  it.each(["left", "top"] as const)("keeps the %s attachment fixed to the moving panel", (edge) => {
    const connection: PaletteConnection = {
      start: { x: 180, y: 140 },
      end: { x: 220, y: 160 },
      edge,
    };
    const curve = getPaletteElasticConnector(connection, { x: 75, y: -25, vx: 300, vy: 100 });
    expect(curve.path).toMatch(/^M 180 140 C /);
    expect(curve.end).toEqual({ x: 295, y: 135 });
    expect(curve.path.endsWith(", 295 135")).toBe(true);
    expect(connection.start).toEqual({ x: 180, y: 140 });
    expect(connection.end).toEqual({ x: 220, y: 160 });
  });

  it("removes deformation when motion is disabled", () => {
    const motion = { x: 80, y: 40, vx: 600, vy: 200 };
    expect(getPaletteElasticTransform(motion, true)).toContain("skewX(");
    expect(getPaletteElasticTransform(motion, false)).toBe("translate3d(80.000px, 40.000px, 0)");
  });
});
