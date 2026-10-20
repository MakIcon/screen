import type { InstanceItem } from "../types";
import { intlLocale, translateFor, type Locale } from "../i18n/locale";

export function formatLastPlayed(raw: string, locale: Locale = "en"): string {
  const ts = parseInt(raw, 10);
  if (isNaN(ts) || ts <= 0) return translateFor(locale, "playtime.neverPlayed");
  const nowSec = Date.now() / 1000;
  const diffDays = Math.floor((nowSec - ts) / 86400);
  if (diffDays === 0) return translateFor(locale, "playtime.today");
  if (diffDays === 1) return translateFor(locale, "playtime.yesterday");
  if (diffDays <= 30) return translateFor(locale, "playtime.daysAgo", { count: diffDays });
  return new Date(ts * 1000).toLocaleDateString(intlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatPlaytime(secs: number, locale: Locale = "en"): string {
  if (secs <= 0) return translateFor(locale, "playtime.noPlaytime");
  const hours = (secs / 3600).toLocaleString(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return translateFor(locale, "playtime.hoursOnRecord", { hours });
}

export function sumPlaytimeSecs(instances: InstanceItem[]): number {
  return instances.reduce((acc, i) => acc + (i.playtimeSecs ?? 0), 0);
}
