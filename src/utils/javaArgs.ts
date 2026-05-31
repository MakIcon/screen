import { clampRamToSystem } from "./ram";
import type { BuildRuntimeSettingsDraft } from "../types";

export const DEFAULT_WINDOW_WIDTH = 1280;
export const DEFAULT_WINDOW_HEIGHT = 720;

function getG1HeapRegionSizeMb(ramGb: number) {
  if (ramGb <= 4) return 4;
  if (ramGb <= 12) return 8;
  return 16;
}

export function getOptimizedMinecraftJvmArgs(ramGb: number) {
  const regionSize = getG1HeapRegionSizeMb(ramGb);

  return [
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=200",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+DisableExplicitGC",
    "-XX:+AlwaysPreTouch",
    "-XX:+UseStringDeduplication",
    "-XX:G1NewSizePercent=30",
    "-XX:G1MaxNewSizePercent=40",
    `-XX:G1HeapRegionSize=${regionSize}M`,
    "-XX:G1ReservePercent=20",
    "-XX:G1HeapWastePercent=5",
    "-XX:G1MixedGCCountTarget=4",
    "-XX:InitiatingHeapOccupancyPercent=15",
    "-XX:G1MixedGCLiveThresholdPercent=90",
    "-XX:G1RSetUpdatingPauseTimePercent=5",
    "-XX:SurvivorRatio=32",
    "-XX:+PerfDisableSharedMem",
    "-XX:MaxTenuringThreshold=1",
    "-Dsun.rmi.dgc.server.gcInterval=2147483646",
    "-Dsun.rmi.dgc.client.gcInterval=2147483646",
  ];
}

export function getDefaultJavaArgsText(ramGb: number, optimizedEnabled: boolean) {
  if (!optimizedEnabled) return "";
  return getOptimizedMinecraftJvmArgs(ramGb).join("\n");
}

export function getDefaultRuntimeSettingsDraft(
  ramGb: number,
  systemRamGb: number,
  optimizedJavaArgs: boolean,
): BuildRuntimeSettingsDraft {
  const normalizedRam = clampRamToSystem(ramGb, systemRamGb);

  return {
    ram: normalizedRam,
    javaArgs: getDefaultJavaArgsText(normalizedRam, optimizedJavaArgs),
    javaPath: "",
    windowWidth: DEFAULT_WINDOW_WIDTH,
    windowHeight: DEFAULT_WINDOW_HEIGHT,
    fullscreen: false,
  };
}

export function parseJavaMemoryArgGb(value: string): number | null {
  const match = value.trim().match(/^-Xm[sx](\d+)([gGmMkK]?)$/);
  if (!match) return null;

  const rawAmount = Number(match[1]);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return null;

  const unit = match[2]?.toLowerCase() || "b";
  if (unit === "g") return rawAmount;
  if (unit === "m") return Math.max(1, Math.ceil(rawAmount / 1024));
  if (unit === "k") return Math.max(1, Math.ceil(rawAmount / 1024 / 1024));
  return Math.max(1, Math.ceil(rawAmount / 1024 / 1024 / 1024));
}

export function getRamFromJavaArgsText(javaArgs: string): number | null {
  const lines = javaArgs.replace(/\r\n/g, "\n").split("\n");
  const xms = [...lines].reverse().find((line) => line.trim().startsWith("-Xms"));
  if (xms) return parseJavaMemoryArgGb(xms);

  const xmx = [...lines].reverse().find((line) => line.trim().startsWith("-Xmx"));
  if (xmx) return parseJavaMemoryArgGb(xmx);

  return null;
}

export function normalizeWindowDimension(
  value: number,
  fallback: number,
  min = 320,
  max = 7680,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeRuntimeSettingsDraft(
  draft: BuildRuntimeSettingsDraft,
  systemRamGb: number,
): BuildRuntimeSettingsDraft {
  const javaArgs = draft.javaArgs.replace(/\r\n/g, "\n");
  const ramFromArgs = getRamFromJavaArgsText(javaArgs);

  return {
    ram: clampRamToSystem(ramFromArgs ?? draft.ram, systemRamGb),
    javaArgs,
    javaPath: draft.javaPath.trim(),
    windowWidth: normalizeWindowDimension(draft.windowWidth, DEFAULT_WINDOW_WIDTH, 320, 7680),
    windowHeight: normalizeWindowDimension(draft.windowHeight, DEFAULT_WINDOW_HEIGHT, 240, 4320),
    fullscreen: draft.fullscreen,
  };
}
