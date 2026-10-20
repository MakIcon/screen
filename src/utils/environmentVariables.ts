import type { EnvironmentVariable } from "../types";
import { translateFor, type Locale } from "../i18n/locale";

export function environmentVariablesToEntries(variables: Record<string, string> = {}) {
  return Object.entries(variables).map(([name, value]) => ({ name, value }));
}

export function getEnvironmentVariablesError(
  entries: EnvironmentVariable[],
  locale: Locale = "ru",
) {
  const names = new Set<string>();
  for (const { name: rawName, value } of entries) {
    const name = rawName.trim();
    if (!name && !value) continue;
    if (!name || /[=\0]/.test(name)) {
      return translateFor(locale, "environmentVariables.invalidName");
    }
    if (value.includes("\0"))
      return translateFor(locale, "environmentVariables.valueHasNul", { name });
    const key = name.toLowerCase();
    if (names.has(key)) return translateFor(locale, "environmentVariables.duplicate", { name });
    names.add(key);
  }
  return null;
}

export function environmentVariablesToRecord(entries: EnvironmentVariable[]) {
  const error = getEnvironmentVariablesError(entries);
  if (error) throw new Error(error);
  return Object.fromEntries(
    entries
      .filter(({ name, value }) => name.trim() || value)
      .map(({ name, value }) => [name.trim(), value]),
  );
}
