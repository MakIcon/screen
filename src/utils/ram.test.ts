import { describe, expect, it } from "vitest";
import {
  BYTES_PER_GIB,
  clampRamToSystem,
  exceedsUsableRam,
  formatSystemRamGb,
  getMinecraftRamMax,
  getRamSliderTicks,
  getRamWarningLevel,
} from "./ram";

describe("getMinecraftRamMax", () => {
  it("floors fractional system memory", () => {
    expect(getMinecraftRamMax(15.7)).toBe(15);
  });

  it("never drops below 1 GB", () => {
    expect(getMinecraftRamMax(0)).toBe(1);
    expect(getMinecraftRamMax(-4)).toBe(1);
  });
});

describe("getRamWarningLevel", () => {
  it.each([
    [61, 0],
    [62, 1],
    [63, 2],
    [64, 3],
  ] as const)("chooses warning severity for %s GB with 61.6 GB usable out of 64 GB", (ram, level) =>
    expect(getRamWarningLevel(ram, 61.6, 64)).toBe(level),
  );

  it("starts with one sign and shows every sign at the maximum even with only two unsafe steps", () => {
    expect(getRamWarningLevel(15, 14.2, 16)).toBe(1);
    expect(getRamWarningLevel(16, 14.2, 16)).toBe(3);
  });

  it("shows every sign when the full capacity is the only unsafe choice", () => {
    expect(getRamWarningLevel(32, 31.8, 32)).toBe(3);
  });

  it("reserves the full-allocation sign for the maximum on systems with a wider warning range", () => {
    expect(getRamWarningLevel(49, 48.1, 64)).toBe(1);
    expect(getRamWarningLevel(57, 48.1, 64)).toBe(2);
    expect(getRamWarningLevel(63, 48.1, 64)).toBe(2);
    expect(getRamWarningLevel(64, 48.1, 64)).toBe(3);
  });

  it("does not warn without a usable memory measurement", () => {
    expect(getRamWarningLevel(64, null, 64)).toBe(0);
    expect(getRamWarningLevel(64, Number.NaN, 64)).toBe(0);
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

describe("physical memory and Minecraft allocation", () => {
  it("allows the full 64 GB and warns only above the usable 61.6 GB", () => {
    expect(getMinecraftRamMax(64)).toBe(64);
    const ticks = getRamSliderTicks(64);
    expect(ticks[ticks.length - 1]).toBe(64);
    expect(clampRamToSystem(64, 64)).toBe(64);
    expect(clampRamToSystem(128, 64)).toBe(64);
    expect(exceedsUsableRam(61, 61.6)).toBe(false);
    expect(exceedsUsableRam(61.6, 61.6)).toBe(false);
    expect(exceedsUsableRam(62, 61.6)).toBe(true);
    expect(exceedsUsableRam(64, 61.6)).toBe(true);
  });

  it("does not confuse missing memory measurements with a low limit", () => {
    expect(exceedsUsableRam(64, null)).toBe(false);
    expect(exceedsUsableRam(64, Number.NaN)).toBe(false);
    expect(exceedsUsableRam(64, 0)).toBe(false);
  });

  it.each([3, 6, 12, 24, 48, 96])("preserves a %i-GiB capacity", (gb) => {
    expect(getMinecraftRamMax(gb)).toBe(gb);
    expect(clampRamToSystem(256, gb)).toBe(gb);
    expect(formatSystemRamGb(gb)).toBe(String(gb));
  });

  it("keeps measured bytes, display, and the integer heap limit distinct", () => {
    const totalBytes = 24 * BYTES_PER_GIB - 128 * 1024 * 1024;
    const gb = totalBytes / BYTES_PER_GIB;
    expect(gb).toBe(23.875);
    expect(formatSystemRamGb(gb)).toBe("23.8");
    expect(getMinecraftRamMax(gb)).toBe(23);
    expect(clampRamToSystem(32, gb) * BYTES_PER_GIB).toBeLessThanOrEqual(totalBytes);
  });

  it("keeps explicit allocations separate from the conservative default", () => {
    expect(clampRamToSystem(12, 24)).toBe(12);
    expect(clampRamToSystem(4, 24)).toBe(4);
    expect(getRamSliderTicks(24)).toEqual([1, 8, 16, 24]);
  });

  it("normalizes invalid and fractional allocations to a finite integer", () => {
    expect(getMinecraftRamMax(Number.NaN)).toBe(1);
    expect(getMinecraftRamMax(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampRamToSystem(Number.NaN, 24)).toBe(1);
    expect(clampRamToSystem(-3, 24)).toBe(1);
    expect(clampRamToSystem(3.9, 24)).toBe(3);
    expect(formatSystemRamGb(Number.NaN)).toBe("0");
  });
});
