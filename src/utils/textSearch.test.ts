import { describe, expect, it } from "vitest";
import {
  getTextSearchMatches,
  normalizeSearchText,
  replaceAllTextSearchMatches,
  replaceTextSearchMatch,
} from "./textSearch";

describe("normalizeSearchText", () => {
  it("collapses CRLF and lone CR to LF", () => {
    expect(normalizeSearchText("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("getTextSearchMatches", () => {
  it("returns nothing for a blank query", () => {
    expect(getTextSearchMatches("hello", "  ")).toEqual([]);
  });

  it("finds case-insensitive matches with line numbers", () => {
    const matches = getTextSearchMatches("Foo\nbar foo", "foo");
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ start: 0, end: 3, line: 0 });
    expect(matches[1]).toMatchObject({ line: 1 });
  });

  it("does not overlap repeated matches", () => {
    const matches = getTextSearchMatches("aaaa", "aa");
    expect(matches.map((m) => m.start)).toEqual([0, 2]);
  });
});

describe("replace helpers", () => {
  it("replaces a single match by range", () => {
    const [match] = getTextSearchMatches("hello world", "world");
    expect(replaceTextSearchMatch("hello world", match, "there")).toBe("hello there");
  });

  it("replaces every match without index drift", () => {
    expect(replaceAllTextSearchMatches("foo foo foo", "foo", "bar")).toBe("bar bar bar");
  });
});
