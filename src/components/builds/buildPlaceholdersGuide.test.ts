import { describe, expect, it } from "vitest";
import { AVAILABLE_PLACEHOLDERS } from "../../utils/placeholders";
import {
  findGuidePlaceholders,
  getPlaceholderGuideDescription,
  PLACEHOLDER_GUIDE_GROUPS,
} from "./buildPlaceholdersGuide";

describe("placeholder guide catalogue", () => {
  it("includes every supported placeholder with a short Russian description", () => {
    expect(findGuidePlaceholders("", "all")).toEqual(AVAILABLE_PLACEHOLDERS);
    for (const placeholder of AVAILABLE_PLACEHOLDERS) {
      expect(getPlaceholderGuideDescription(placeholder)).toMatch(/[а-яё]/i);
      expect(PLACEHOLDER_GUIDE_GROUPS.map((group) => group.id)).toContain(placeholder.group);
    }
  });

  it("finds placeholders by Russian meaning and respects the selected group", () => {
    const matches = findGuidePlaceholders("ПАМЯТЬ", "build");
    expect(matches.map((placeholder) => placeholder.key)).toEqual(["build_ram", "build_ram_value"]);
    expect(findGuidePlaceholders("память", "player")).toEqual([]);
  });

  it("finds legacy aliases and uppercase placeholder tokens", () => {
    for (const placeholder of AVAILABLE_PLACEHOLDERS) {
      for (const alias of placeholder.aliases ?? []) {
        expect(findGuidePlaceholders(`%${alias}%`, "all")).toContain(placeholder);
      }
    }
    expect(findGuidePlaceholders("^%build_loader%", "all").map((item) => item.key)).toEqual([
      "build_loader",
    ]);
  });

  it("matches all search words and returns an empty list for an unknown query", () => {
    expect(findGuidePlaceholders("только число", "build").map((item) => item.key)).toEqual([
      "build_ram_value",
    ]);
    expect(findGuidePlaceholders("несуществующий плейсхолдер", "all")).toEqual([]);
  });
});
