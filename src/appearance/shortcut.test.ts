import { describe, expect, it } from "vitest";
import { isAppearanceStudioShortcut } from "./shortcut";

const shortcut = (overrides: Partial<KeyboardEvent> = {}) =>
  isAppearanceStudioShortcut({
    altKey: false,
    code: "KeyA",
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    ...overrides,
  });

describe("Appearance Studio shortcut", () => {
  it("accepts Ctrl+Shift+A and Cmd+Shift+A", () => {
    expect(shortcut()).toBe(true);
    expect(shortcut({ ctrlKey: false, metaKey: true })).toBe(true);
  });

  it("rejects incomplete and conflicting shortcuts", () => {
    expect(shortcut({ shiftKey: false })).toBe(false);
    expect(shortcut({ altKey: true })).toBe(false);
    expect(shortcut({ code: "KeyS" })).toBe(false);
  });
});
