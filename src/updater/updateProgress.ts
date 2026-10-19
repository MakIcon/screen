const BYTES_PER_MEGABYTE = 1024 * 1024;

const megabytesFormat = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Downloaded share in 0..1, or null while the server hasn't told us the size. */
export function progressRatio(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(1, Math.max(0, downloaded / total));
}

export function formatMegabytes(bytes: number): string {
  return `${megabytesFormat.format(Math.max(0, bytes) / BYTES_PER_MEGABYTE)} МБ`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${megabytesFormat.format(bytesPerSecond / BYTES_PER_MEGABYTE)} МБ/с`;
}

/** Rough time left, rounded so the label doesn't flicker on every chunk. */
export function formatEta(remainingBytes: number, bytesPerSecond: number): string | null {
  if (bytesPerSecond <= 0 || remainingBytes <= 0) return null;
  const seconds = remainingBytes / bytesPerSecond;
  if (seconds < 1) return "меньше секунды";
  if (seconds < 60) return `~${Math.ceil(seconds)} с`;
  return `~${Math.ceil(seconds / 60)} мин`;
}

/**
 * Download speed over a short sliding window. Chunk events arrive in bursts, so
 * a per-chunk rate would jump around; averaging the last couple of seconds
 * gives a number that is readable while it changes.
 */
export function createSpeedMeter(windowMs = 2000) {
  const samples: Array<{ at: number; bytes: number }> = [];

  return {
    push(at: number, totalBytes: number) {
      samples.push({ at, bytes: totalBytes });
      while (samples.length > 2 && at - samples[0].at > windowMs) samples.shift();
    },
    /** Bytes per second, or null until enough time has passed to measure. */
    read(): number | null {
      if (samples.length < 2) return null;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed = last.at - first.at;
      if (elapsed < 250) return null;
      return ((last.bytes - first.bytes) / elapsed) * 1000;
    },
  };
}

const releaseDateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * The updater hands the date over as Rust's `OffsetDateTime` display string
 * ("2026-10-19 12:00:00.0 +00:00:00"), which `Date` can't parse, so read the
 * calendar day off the front.
 */
export function formatReleaseDate(date: string | null): string | null {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return releaseDateFormat.format(new Date(year, month - 1, day)).replace(/\s?г\.$/, "");
}

export type ReleaseNoteLine = { kind: "heading" | "item" | "text"; text: string };

/**
 * Release notes come from GitHub as Markdown. The overlay only needs the
 * readable skeleton: headings, bullet items and plain lines, without markup.
 */
export function parseReleaseNotes(notes: string): ReleaseNoteLine[] {
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): ReleaseNoteLine => {
      const clean = (text: string) =>
        text
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .trim();
      if (/^#{1,6}\s/.test(line))
        return { kind: "heading", text: clean(line.replace(/^#+\s*/, "")) };
      if (/^[-*+]\s/.test(line)) return { kind: "item", text: clean(line.slice(2)) };
      return { kind: "text", text: clean(line) };
    })
    .filter((line) => line.text.length > 0);
}

/** Turns updater plugin errors (plain English strings) into launcher copy. */
export function describeUpdateError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : JSON.stringify(error ?? "");
  const text = raw.toLowerCase();

  if (text.includes("signature") || text.includes("minisign")) {
    return "Подпись обновления не прошла проверку. Файл не установлен.";
  }
  if (text.includes("timed out") || text.includes("timeout")) {
    return "Сервер обновлений не ответил вовремя. Проверь подключение и попробуй ещё раз.";
  }
  if (
    text.includes("error sending request") ||
    text.includes("dns") ||
    text.includes("connect") ||
    text.includes("network")
  ) {
    return "Нет связи с сервером обновлений. Проверь подключение или прокси.";
  }
  if (text.includes("status code") || text.includes("release json") || text.includes("404")) {
    return "Сервер обновлений вернул ошибку. Попробуй позже.";
  }
  return raw.trim() || "Неизвестная ошибка обновления.";
}
