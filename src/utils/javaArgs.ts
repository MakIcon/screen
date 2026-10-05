import { clampRamToSystem } from "./ram";
import type { BuildRuntimeSettingsDraft } from "../types";
import {
  environmentVariablesToEntries,
  environmentVariablesToRecord,
} from "./environmentVariables";

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
    environmentVariables: [],
    windowWidth: DEFAULT_WINDOW_WIDTH,
    windowHeight: DEFAULT_WINDOW_HEIGHT,
    fullscreen: false,
  };
}

export function normalizeWindowDimension(value: number, fallback: number, min = 320, max = 7680) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeRuntimeSettingsDraft(
  draft: BuildRuntimeSettingsDraft,
  systemRamGb: number,
): BuildRuntimeSettingsDraft {
  const javaArgs = draft.javaArgs.replace(/\r\n/g, "\n");

  return {
    ram: clampRamToSystem(draft.ram, systemRamGb),
    javaArgs,
    javaPath: draft.javaPath.trim(),
    environmentVariables: environmentVariablesToEntries(
      environmentVariablesToRecord(draft.environmentVariables),
    ),
    windowWidth: normalizeWindowDimension(draft.windowWidth, DEFAULT_WINDOW_WIDTH, 320, 7680),
    windowHeight: normalizeWindowDimension(draft.windowHeight, DEFAULT_WINDOW_HEIGHT, 240, 4320),
    fullscreen: draft.fullscreen,
  };
}
