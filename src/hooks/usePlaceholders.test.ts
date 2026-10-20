import { describe, expect, it } from "vitest";
import { buildPlaceholderContext, type PlaceholderTarget } from "./usePlaceholders";
import { resolvePlaceholders } from "../utils/placeholders";

describe("build source placeholders", () => {
  it.each([
    { target: { source: "imported" }, ru: "Импортировано", en: "Imported" },
    { target: { source: "official" }, ru: "Официальный", en: "Official" },
    { target: { name: "Legacy build" }, ru: "Официальный", en: "Official" },
    { target: null, ru: "Официальный", en: "Official" },
  ] satisfies { target: PlaceholderTarget; ru: string; en: string }[])(
    "resolves $target in both interface languages",
    ({ target, ru, en }) => {
      for (const [locale, expected] of [
        ["ru", ru],
        ["en", en],
      ] as const) {
        const context = buildPlaceholderContext({ instances: [], target, systemRamGb: 16, locale });
        expect(resolvePlaceholders("%build_source%", context)).toBe(expected);
        expect(resolvePlaceholders("^%build_source%", context)).toBe(expected.toUpperCase());
      }
    },
  );
});
