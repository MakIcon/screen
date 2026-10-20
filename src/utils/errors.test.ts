import { describe, expect, it } from "vitest";
import { getErrorCode, isCancelledError, toErrorDetails, toErrorMessage } from "./errors";

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
      "IMPORT_CANCELLED",
      "MOD_DOWNLOAD_CANCELLED",
      { code: "cancelled", detail: "stopped" },
    ])
      expect(isCancelledError(error)).toBe(true);
    expect(isCancelledError("Instance not found")).toBe(false);
  });

  it("supports legacy backend errors and localized validation messages", () => {
    expect(getErrorCode("error sending request: timed out")).toBe("network");
    expect(toErrorMessage("Build name is empty", "ru")).toBe("Введите название сборки.");
    expect(toErrorMessage("Выберите версию Minecraft", "ru")).toBe("Выберите версию Minecraft");
  });
});
