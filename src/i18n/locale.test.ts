import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocale, saveLocale } from "./locale";

afterEach(() => vi.unstubAllGlobals());

describe("launcher language", () => {
  it("defaults to Russian and persists an English choice", () => {
    const values = new Map<string, string>();
    const events: string[] = [];
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      dispatchEvent: (event: Event) => events.push(event.type),
    });

    expect(readLocale()).toBe("ru");
    saveLocale("en");
    expect(readLocale()).toBe("en");
    expect(values.get("screenlauncher-language")).toBe("en");
    expect(events).toContain("screenlauncher-language-changed");
  });

  it("ignores unsupported stored values", () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => "fr" },
    });
    expect(readLocale()).toBe("ru");
  });
});
