import { describe, expect, it } from "vitest";
import { toErrorMessage } from "./errors";

describe("toErrorMessage", () => {
  it("unwraps Error instances to their message", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("passes plain strings through", () => {
    expect(toErrorMessage("just a string")).toBe("just a string");
  });

  it("serializes other objects to JSON", () => {
    expect(toErrorMessage({ code: 42 })).toBe('{"code":42}');
  });

  it("falls back to String() for non-serializable values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(toErrorMessage(circular)).toBe("[object Object]");
  });
});
