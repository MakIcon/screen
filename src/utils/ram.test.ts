import { describe, expect, it } from "vitest";
import { clampRamToSystem, getMinecraftRamMax, getRamSliderTicks } from "./ram";

describe("getMinecraftRamMax", () => {
  it("floors fractional system memory", () => {
    expect(getMinecraftRamMax(15.7)).toBe(15);
  });

  it("never drops below 1 GB", () => {
    expect(getMinecraftRamMax(0)).toBe(1);
    expect(getMinecraftRamMax(-4)).toBe(1);
  });
});

describe("clampRamToSystem", () => {
  it("keeps values within [1, systemMax]", () => {
    expect(clampRamToSystem(8, 16)).toBe(8);
    expect(clampRamToSystem(99, 16)).toBe(16);
    expect(clampRamToSystem(0, 16)).toBe(1);
  });
});

describe("getRamSliderTicks", () => {
  it("returns sorted, de-duplicated ticks", () => {
    const ticks = getRamSliderTicks(12);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks[0]).toBe(1);
    expect(ticks[ticks.length - 1]).toBe(12);
  });

  it("collapses to a single tick for tiny systems", () => {
    expect(getRamSliderTicks(1)).toEqual([1]);
  });
});
