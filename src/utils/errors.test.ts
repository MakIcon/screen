import { describe, expect, it } from "vitest";
import {
  LauncherError,
  getErrorCode,
  isCancelledError,
  toErrorDetails,
  toErrorMessage,
} from "./errors";

describe("error diagnostics", () => {
  it("unwraps Error instances to their message", () => {
    expect(toErrorDetails(new Error("boom"))).toBe("boom");
  });

  it("passes plain strings through", () => {
    expect(toErrorDetails("just a string")).toBe("just a string");
  });

  it("serializes other objects to JSON", () => {
    expect(toErrorDetails({ code: 42 })).toBe('{"code":42}');
  });

  it("falls back to String() for non-serializable values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(toErrorDetails(circular)).toBe("[object Object]");
  });
});

describe("localized errors", () => {
  it("uses the stable code and preserves the backend detail", () => {
    const error = { code: "build_not_found", detail: "diagnostic with private path" };
    expect(toErrorMessage(error, "ru")).toBe("Сборка не найдена. Обновите список сборок.");
    expect(toErrorMessage(error, "en")).toBe("Build not found. Refresh the build list.");
    expect(toErrorDetails(error)).toBe(error.detail);
  });

  it("keeps technical diagnostics out of unknown error messages", () => {
    const error = { code: "unrecognized_future_code", detail: "SQL internals /private/file" };
    expect(toErrorMessage(error, "ru")).not.toContain(error.detail);
    expect(toErrorMessage(error, "en")).toContain("Technical details");
  });

  it("recognizes cancellation independently of the display language", () => {
    for (const error of [
      new LauncherError("cancelled", "Импорт остановлен"),
      new DOMException("Операция остановлена", "AbortError"),
      { code: "cancelled", detail: "stopped" },
    ])
      expect(isCancelledError(error)).toBe(true);
    expect(isCancelledError("Instance not found")).toBe(false);
  });

  it("does not infer categories from diagnostic wording", () => {
    for (const detail of [
      "download cancelled",
      "Instance not found",
      "Ошибка сети",
      "network timeout",
    ]) {
      expect(getErrorCode(detail)).toBe("unknown");
      expect(getErrorCode({ code: "future_code", detail })).toBe("unknown");
      expect(getErrorCode({ code: "invalid_input", detail })).toBe("invalid_input");
      expect(getErrorCode(new LauncherError("network", detail))).toBe("network");
    }
  });

  it("translates typed UI validation and preserves localized legacy validation", () => {
    const error = new LauncherError("name_required", "Любая диагностическая формулировка");
    expect(toErrorMessage(error, "ru")).toBe("Введите название сборки.");
    expect(toErrorDetails(error)).toBe(error.detail);
    expect(toErrorMessage("Выберите версию Minecraft", "ru")).toBe("Выберите версию Minecraft");
  });
});
