import { describe, expect, it } from "vitest";
import {
  addMascotRage,
  BOWL_THROW_THRESHOLD,
  isBowlSpillThrow,
  isHardMascotThrow,
  MAX_RAGE,
  RAGE_PER_BOWL_SPILL,
  shouldSplashBowl,
  THROW_THRESHOLD,
} from "./mascotConfig";

describe("mascot throw strength", () => {
  it("ignores ordinary releases and only counts a deliberate fast fling", () => {
    expect(isHardMascotThrow(1.15)).toBe(false);
    expect(isHardMascotThrow(THROW_THRESHOLD - 0.01)).toBe(false);
    expect(isHardMascotThrow(THROW_THRESHOLD)).toBe(true);
    expect(isHardMascotThrow(2.4)).toBe(true);
  });
});

describe("mascot bowl gestures", () => {
  it("requires a deliberate throw before the bowl fully spills", () => {
    expect(isBowlSpillThrow(0.32)).toBe(false);
    expect(isBowlSpillThrow(BOWL_THROW_THRESHOLD - 0.01)).toBe(false);
    expect(isBowlSpillThrow(BOWL_THROW_THRESHOLD)).toBe(true);
  });

  it("only splashes a few drops after a fast direction change and cooldown", () => {
    expect(shouldSplashBowl(0.8, false, 1_000)).toBe(false);
    expect(shouldSplashBowl(0.3, true, 1_000)).toBe(false);
    expect(shouldSplashBowl(0.8, true, 100)).toBe(false);
    expect(shouldSplashBowl(-0.8, true, 1_000)).toBe(true);
  });
});

describe("mascot rage points", () => {
  it("adds two points for a spilled bowl and caps rage at five", () => {
    expect(addMascotRage(0, RAGE_PER_BOWL_SPILL)).toBe(2);
    expect(addMascotRage(4, RAGE_PER_BOWL_SPILL)).toBe(MAX_RAGE);
    expect(addMascotRage(MAX_RAGE, 1)).toBe(MAX_RAGE);
  });

  it("reaches five after a bowl spill and three hard throws without wrapping", () => {
    let rage = addMascotRage(0, RAGE_PER_BOWL_SPILL);
    rage = addMascotRage(rage, 1);
    rage = addMascotRage(rage, 1);
    rage = addMascotRage(rage, 1);

    expect(rage).toBe(MAX_RAGE);
  });
});
