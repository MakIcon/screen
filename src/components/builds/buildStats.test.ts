import { describe, expect, it } from "vitest";
import { activityByDay, calendarMonth, dayKey, formatStatsDuration, heatLevel } from "./buildStats";

describe("statistics calendar", () => {
  it("splits a session at local midnight and preserves its duration", () => {
    const end = new Date(2026, 9, 6, 0, 30);
    const days = activityByDay([{ ts: end.getTime() / 1000, secs: 3600 }], end);
    expect(days.get(dayKey(new Date(2026, 9, 5)))).toEqual({ secs: 1800, sessions: 1 });
    expect(days.get(dayKey(end))).toEqual({ secs: 1800, sessions: 1 });
    expect([...days.values()].reduce((sum, day) => sum + day.secs, 0)).toBe(3600);
  });

  it("counts multiple sessions and ignores invalid or future records", () => {
    const now = new Date(2026, 9, 6, 16);
    const ts = now.getTime() / 1000;
    const days = activityByDay(
      [
        { ts, secs: 30 },
        { ts: ts - 60, secs: 90 },
        { ts: NaN, secs: 30 },
        { ts, secs: -1 },
        { ts: ts + 7200, secs: 60 },
      ],
      now,
    );
    expect(days.size).toBe(1);
    expect(days.get(dayKey(now))).toEqual({ secs: 120, sessions: 2 });
    expect(activityByDay([]).size).toBe(0);
  });

  it("aligns leap months to Monday and keeps calendar rows stable", () => {
    const cells = calendarMonth(new Date(2024, 1, 1));
    expect(cells).toHaveLength(42);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells.filter(Boolean)).toHaveLength(29);
    expect(cells[3]?.getDay()).toBe(4);
  });

  it("keeps short playtime readable and uses a consistent intensity scale", () => {
    expect(formatStatsDuration(30)).toBe("30 сек");
    expect(formatStatsDuration(5400)).toBe("1 ч 30 мин");
    expect([0, 30, 1800, 1801, 3600, 3601, 10800, 10801].map(heatLevel)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4,
    ]);
  });
});
