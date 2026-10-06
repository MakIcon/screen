import type { PlaytimeSession } from "../../types";

export interface DayActivity {
  secs: number;
  sessions: number;
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function timestamp(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function formatStatsDuration(raw: number): string {
  const secs = Math.max(0, Math.floor(raw));
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  if (minutes > 0) return `${minutes} мин`;
  return secs > 0 ? `${secs} сек` : "0 мин";
}

export function statsCount(count: number, forms: [string, string, string]): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  const form =
    mod100 >= 11 && mod100 <= 14
      ? forms[2]
      : mod10 === 1
        ? forms[0]
        : mod10 >= 2 && mod10 <= 4
          ? forms[1]
          : forms[2];
  return `${count} ${form}`;
}

// The log records the END of each session. Split at local midnights so a
// session spanning two days contributes the actual time to both calendar days.
export function activityByDay(
  sessions: PlaytimeSession[],
  now = new Date(),
): Map<string, DayActivity> {
  const result = new Map<string, DayActivity>();
  for (const session of sessions) {
    if (
      !Number.isFinite(session.ts) ||
      !Number.isFinite(session.secs) ||
      session.ts <= 0 ||
      session.secs <= 0
    )
      continue;
    const end = Math.min(session.ts * 1000, now.getTime());
    let cursor = Math.max(0, (session.ts - session.secs) * 1000);
    while (cursor < end) {
      const date = new Date(cursor);
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
      const next = Math.min(midnight, end);
      const key = dayKey(date);
      const previous = result.get(key) ?? { secs: 0, sessions: 0 };
      result.set(key, {
        secs: previous.secs + (next - cursor) / 1000,
        sessions: previous.sessions + 1,
      });
      cursor = next;
    }
  }
  return result;
}

export function heatLevel(secs: number): number {
  if (secs <= 0) return 0;
  if (secs <= 1800) return 1;
  if (secs <= 3600) return 2;
  if (secs <= 10800) return 3;
  return 4;
}

export function calendarMonth(date: Date): (Date | null)[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= count; day++)
    cells.push(new Date(date.getFullYear(), date.getMonth(), day));
  while (cells.length < 42) cells.push(null);
  return cells;
}
