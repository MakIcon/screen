import type { InstanceExportData } from "../types";
import { DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH } from "./javaArgs";

export type ImportProgress = {
  operationId: string;
  stage: "preparing" | "installing" | "downloading" | "extracting" | "complete";
  processed: number;
  total: number;
  filename: string;
};

/** Command success is authoritative even if the final IPC progress event arrives late. */
export function completedImportProgress(
  operationId: string,
  progress: ImportProgress | null,
  fallbackTotal: number,
): ImportProgress {
  const current = progress?.operationId === operationId ? progress : null;
  const total = Math.max(1, current?.total || fallbackTotal, current?.processed || 0);
  return { operationId, stage: "complete", processed: total, total, filename: "" };
}

export function hasEnvironmentVariablesData(
  data: Pick<InstanceExportData, "environmentVariables"> | null | undefined,
) {
  return Object.keys(data?.environmentVariables ?? {}).length > 0;
}

export function hasJavaArgsData(data: Pick<InstanceExportData, "javaArgs"> | null | undefined) {
  return Boolean(data?.javaArgs);
}

export function hasJavaPathData(data: Pick<InstanceExportData, "javaPath"> | null | undefined) {
  return Boolean(data?.javaPath);
}

export function hasWindowSettingsData(
  data: Pick<InstanceExportData, "windowWidth" | "windowHeight" | "fullscreen"> | null | undefined,
) {
  return Boolean(data && (data.windowWidth || data.windowHeight || data.fullscreen));
}

export function formatJavaArgsMeta(data: Pick<InstanceExportData, "javaArgs"> | null | undefined) {
  if (!data?.javaArgs) return undefined;
  const count = data.javaArgs.split(/\r?\n/).filter((line) => line.trim()).length;
  return `${count} ARG${count === 1 ? "" : "S"}`;
}

export function formatWindowSettingsMeta(
  data: Pick<InstanceExportData, "windowWidth" | "windowHeight" | "fullscreen"> | null | undefined,
) {
  if (!data || !hasWindowSettingsData(data)) return undefined;
  const size = `${data.windowWidth ?? DEFAULT_WINDOW_WIDTH}x${data.windowHeight ?? DEFAULT_WINDOW_HEIGHT}`;
  return data.fullscreen ? `${size} / FULLSCREEN` : size;
}
