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
  }
  // Compatibility for old backend versions and errors raised by browser APIs.
  const text = toErrorDetails(error).toLowerCase();
  if (/cancelled|canceled|aborterror/.test(text)) return "cancelled";
  if (/instance not found|build not found/.test(text)) return "build_not_found";
  if (/name is empty/.test(text)) return "name_required";
  if (/name already exists/.test(text)) return "name_exists";
  if (/stop the|is running/.test(text)) return "build_running";
  if (/no compatible|not compatible/.test(text)) return "incompatible_version";
  if (/skin.*png/.test(text)) return "skin_format";
  if (/skin.*too large/.test(text)) return "skin_size";
  if (/choose a png, jpeg or webp/.test(text)) return "image_format";
  if (/image.*decoded|image processing/.test(text)) return "image_decode";
  if (/java.*(?:not found|missing)/.test(text)) return "java_missing";
  if (/java.*(?:failed|error)/.test(text)) return "java_failed";
  if (/account|oauth|authentication/.test(text)) return "authentication";
  if (/permission denied|access is denied/.test(text)) return "permission_denied";
  if (/checksum|hash mismatch|sha-1 mismatch/.test(text)) return "checksum_mismatch";
  if (/timeout|timed out|connect|network|dns|error sending request/.test(text)) return "network";
  if (/download/.test(text)) return "download_failed";
  if (/no such file|file not found|cannot find the file/.test(text)) return "file_not_found";
  if (/unsupported|not supported/.test(text)) return "unsupported";
  if (/invalid|unsafe|does not declare/.test(text))
    return /archive|mrpack|slbuild|file/.test(text) ? "invalid_file" : "invalid_input";
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
