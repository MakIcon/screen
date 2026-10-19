import { describe, expect, it } from "vitest";
import {
  createSpeedMeter,
  describeUpdateError,
  formatEta,
  formatMegabytes,
  formatReleaseDate,
  parseReleaseNotes,
  progressRatio,
} from "./updateProgress";

const MB = 1024 * 1024;

describe("progressRatio", () => {
  it("is unknown until the server reports a size", () => {
    expect(progressRatio(5 * MB, null)).toBeNull();
    expect(progressRatio(5 * MB, 0)).toBeNull();
  });

  it("clamps into 0..1", () => {
    expect(progressRatio(MB, 4 * MB)).toBe(0.25);
    expect(progressRatio(9 * MB, 4 * MB)).toBe(1);
  });
});

describe("formatting", () => {
  it("shows megabytes with one decimal in Russian notation", () => {
    expect(formatMegabytes(12.4 * MB)).toBe("12,4 МБ");
    expect(formatMegabytes(0)).toBe("0,0 МБ");
  });

  it("rounds the time left up and switches to minutes", () => {
    expect(formatEta(10 * MB, 2 * MB)).toBe("~5 с");
    expect(formatEta(300 * MB, 2 * MB)).toBe("~3 мин");
    expect(formatEta(MB, 4 * MB)).toBe("меньше секунды");
    expect(formatEta(MB, 0)).toBeNull();
  });
});

describe("createSpeedMeter", () => {
  it("waits for a measurable interval before reporting", () => {
    const meter = createSpeedMeter();
    meter.push(0, 0);
    meter.push(100, MB);
    expect(meter.read()).toBeNull();
  });

  it("averages over the sliding window only", () => {
    const meter = createSpeedMeter(1000);
    meter.push(0, 0);
    meter.push(500, 10 * MB); // early burst, should fall out of the window
    meter.push(2000, 11 * MB);
    meter.push(3000, 13 * MB);
    expect(meter.read()).toBe(2 * MB);
  });
});

describe("formatReleaseDate", () => {
  it("reads both Rust display strings and RFC 3339 dates", () => {
    expect(formatReleaseDate("2026-10-19 12:00:00.0 +00:00:00")).toBe("19 октября 2026");
    expect(formatReleaseDate("2026-01-02T08:00:00Z")).toBe("2 января 2026");
    expect(formatReleaseDate(null)).toBeNull();
  });
});

describe("parseReleaseNotes", () => {
  it("keeps headings, bullets and text without Markdown markup", () => {
    expect(
      parseReleaseNotes(
        "## Новое\r\n\n- **Автообновление** лаунчера\n* фикс `Fabric`\nСм. [релиз](https://x)",
      ),
    ).toEqual([
      { kind: "heading", text: "Новое" },
      { kind: "item", text: "Автообновление лаунчера" },
      { kind: "item", text: "фикс Fabric" },
      { kind: "text", text: "См. релиз" },
    ]);
  });
});

describe("describeUpdateError", () => {
  it("explains signature failures", () => {
    expect(describeUpdateError("signature verification failed")).toMatch(/Подпись/);
  });

  it("explains network failures", () => {
    expect(describeUpdateError(new Error("error sending request for url"))).toMatch(/связи/);
  });

  it("keeps unknown messages readable", () => {
    expect(describeUpdateError("disk is full")).toBe("disk is full");
  });
});
