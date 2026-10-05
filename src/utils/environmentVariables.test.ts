import { describe, expect, it } from "vitest";
import {
  environmentVariablesToEntries,
  environmentVariablesToRecord,
  getEnvironmentVariablesError,
} from "./environmentVariables";

describe("instance environment variables", () => {
  it("preserves literal spaces, quotes, equals signs, empty values and special object keys", () => {
    const variables = environmentVariablesToRecord([
      { name: " SCREEN_TEST ", value: '  a=b "quoted" $PATH  ' },
      { name: "EMPTY", value: "" },
      { name: "__proto__", value: "literal" },
      { name: " ", value: "" },
    ]);
    expect(variables.SCREEN_TEST).toBe('  a=b "quoted" $PATH  ');
    expect(Object.prototype.hasOwnProperty.call(variables, "EMPTY")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(variables, "__proto__")).toBe(true);
    expect(environmentVariablesToEntries(variables)).toContainEqual({ name: "EMPTY", value: "" });
    expect(Object.getPrototypeOf(variables)).toBe(Object.prototype);
  });

  it("rejects ambiguous Windows overrides and values invalid for a process environment", () => {
    expect(
      getEnvironmentVariablesError([
        { name: "PATH", value: "one" },
        { name: " path ", value: "two" },
      ]),
    ).toContain("уже добавлена");
    for (const entry of [
      { name: "", value: "value" },
      { name: "A=B", value: "value" },
      { name: "A\0", value: "value" },
      { name: "A", value: "v\0" },
    ]) {
      expect(() => environmentVariablesToRecord([entry])).toThrow();
    }
  });
});
