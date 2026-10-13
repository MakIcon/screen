import { describe, expect, it } from "vitest";
import {
  formatBlockCoordinates,
  parseBlockCoordinates,
  gatheringAreaPreview,
} from "./gatheringCoordinates";

describe("gathering coordinate selection", () => {
  it("accepts pasted triples and floors negative player positions like Minecraft", () => {
    const point = parseBlockCoordinates(" -0.2, 64.8, -100.1 ");
    expect(point).toEqual({ x: -1, y: 64, z: -101 });
    expect(formatBlockCoordinates(point)).toBe("-1 64 -101");
    for (const text of ["", "10 20", "10 20 30 40", "NaN 64 0", "~ ~ ~", "1e300 0 0"])
      expect(parseBlockCoordinates(text)).toBeNull();
  });
  it("counts inclusive corners in either order and enforces the worker's volume limit", () => {
    expect(gatheringAreaPreview("4 66 2", "2 64 0")).toEqual({
      size: { x: 3, y: 3, z: 3 },
      volume: 27,
      valid: true,
    });
    expect(gatheringAreaPreview("0 0 0", "31 31 31")?.valid).toBe(true);
    expect(gatheringAreaPreview("0 0 0", "32 31 31")?.valid).toBe(false);
    expect(gatheringAreaPreview("1 2", "0 0 0")).toBeNull();
  });
});
