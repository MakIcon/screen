import { readLocale, translateFor, type Locale, type PlainMessageKey } from "../i18n/locale";
import { logger } from "./logger";
import { invoke, isTauri } from "@tauri-apps/api/core";

const ERROR_MESSAGES = {
  cancelled: "errors.cancelled",
  build_not_found: "errors.build_not_found",
  name_required: "errors.name_required",
  name_exists: "errors.name_exists",
  build_running: "errors.build_running",
  incompatible_version: "errors.incompatible_version",
  java_missing: "errors.java_missing",
  java_failed: "errors.java_failed",
  authentication: "errors.authentication",
  network: "errors.network",
  permission_denied: "errors.permission_denied",
  file_not_found: "errors.file_not_found",
  invalid_file: "errors.invalid_file",
  invalid_input: "errors.invalid_input",
  download_failed: "errors.download_failed",
  checksum_mismatch: "errors.checksum_mismatch",
  unsupported: "errors.unsupported",
  unknown: "errors.unknown",
  skin_format: "errors.skin_format",
  skin_size: "errors.skin_size",
  image_format: "errors.image_format",
  image_decode: "errors.image_decode",
  log_window: "errors.log_window",
} as const satisfies Record<string, PlainMessageKey>;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

/** Errors created in the UI use the same stable codes as IPC errors. */
export class LauncherError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "LauncherError";
  }
}

const loggedErrors = new Set<string>();

/** Original diagnostics for logs, never translated or discarded. */
export function toErrorDetails(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    if ("detail" in error && typeof error.detail === "string") return error.detail;
    if ("message" in error && typeof error.message === "string") return error.message;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function getErrorCode(error: unknown): ErrorCode {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    if (Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, error.code))
      return error.code as ErrorCode;
    return "unknown";
  }
  // Browser cancellation has a structured name, independent of its message.
  if (error instanceof Error && error.name === "AbortError") return "cancelled";
  return "unknown";
}

export function isCancelledError(error: unknown): boolean {
  return getErrorCode(error) === "cancelled";
}

export function toErrorMessage(error: unknown, locale: Locale = readLocale()): string {
  const code = getErrorCode(error);
  const detail = toErrorDetails(error);
  const signature = `${code}\u0000${detail}`;
  if (code !== "cancelled" && !loggedErrors.has(signature)) {
    if (loggedErrors.size >= 200) loggedErrors.clear();
    loggedErrors.add(signature);
    logger.error("Launcher error", { code, detail });
    if (isTauri()) {
      void invoke("record_launcher_error", { code, detail }).catch((logError) =>
        logger.error("Could not write launcher diagnostic log", logError),
      );
    }
  }
  // Already-localized validation messages can pass through without losing context.
  if (
    code === "unknown" &&
    /[а-яё]/i.test(detail) &&
    !(error && typeof error === "object" && "code" in error)
  )
    return detail;
  return translateFor(locale, ERROR_MESSAGES[code]);
}
