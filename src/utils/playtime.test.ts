import { describe, expect, it } from "vitest";
import { formatLastPlayed, formatPlaytime, sumPlaytimeSecs } from "./playtime";
import type { InstanceItem } from "../types";

const nowSec = () => Math.floor(Date.now() / 1000);

describe("formatLastPlayed", () => {
  it("handles never-played and invalid input", () => {
    expect(formatLastPlayed("0")).toBe("Never played");
    expect(formatLastPlayed("not-a-number")).toBe("Never played");
    expect(formatLastPlayed("-5")).toBe("Never played");
  });

  it("describes recent timestamps relatively", () => {
    expect(formatLastPlayed(String(nowSec()))).toBe("Today");
    expect(formatLastPlayed(String(nowSec() - 86400))).toBe("Yesterday");
    expect(formatLastPlayed(String(nowSec() - 5 * 86400))).toBe("5 days ago");
  });

  it("formats Russian play dates", () => {
    expect(formatLastPlayed("0", "ru")).toBe("Ещё не запускалась");
    expect(formatLastPlayed(String(nowSec()), "ru")).toBe("Сегодня");
  });

  it("falls back to an absolute date past a month", () => {
    expect(formatLastPlayed(String(nowSec() - 90 * 86400))).not.toMatch(/days ago|Today|Yesterday/);
  });
});

describe("formatPlaytime", () => {
  it("reports hours, or nothing when empty", () => {
    expect(formatPlaytime(0)).toBe("No playtime recorded");
    expect(formatPlaytime(3600)).toBe("1.0 hrs on record");
    expect(formatPlaytime(5400)).toBe("1.5 hrs on record");
  });

  it("formats Russian playtime", () => {
    expect(formatPlaytime(0, "ru")).toBe("Время игры не записано");
    expect(formatPlaytime(3600, "ru")).toBe("1,0 ч в игре");
  });
});

describe("sumPlaytimeSecs", () => {
  it("adds up playtime and tolerates missing values", () => {
    const instances = [
      { playtimeSecs: 100 },
      { playtimeSecs: undefined },
      { playtimeSecs: 50 },
    ] as InstanceItem[];
    expect(sumPlaytimeSecs(instances)).toBe(150);
    expect(sumPlaytimeSecs([])).toBe(0);
  });
});
