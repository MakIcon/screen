import type { InstanceItem } from "../types";

export function formatLastPlayed(raw: string): string {
  const ts = parseInt(raw, 10);
  if (isNaN(ts) || ts <= 0) return "Never played";
  const nowSec = Date.now() / 1000;
  const diffDays = Math.floor((nowSec - ts) / 86400);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 30) return `${diffDays} days ago`;
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatPlaytime(secs: number): string {
  if (secs <= 0) return "No playtime recorded";
  return `${(secs / 3600).toFixed(1)} hrs on record`;
}

export function sumPlaytimeSecs(instances: InstanceItem[]): number {
  return instances.reduce((acc, i) => acc + (i.playtimeSecs ?? 0), 0);
}
