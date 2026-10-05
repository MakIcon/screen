import type { EnvironmentVariable } from "../types";

export function environmentVariablesToEntries(variables: Record<string, string> = {}) {
  return Object.entries(variables).map(([name, value]) => ({ name, value }));
}

export function getEnvironmentVariablesError(entries: EnvironmentVariable[]) {
  const names = new Set<string>();
  for (const { name: rawName, value } of entries) {
    const name = rawName.trim();
    if (!name && !value) continue;
    if (!name || /[=\0]/.test(name)) {
      return "Укажите имя переменной без знака = и символа NUL.";
    }
    if (value.includes("\0")) return `Значение переменной ${name} содержит NUL.`;
    const key = name.toLowerCase();
    if (names.has(key)) return `Переменная ${name} уже добавлена (регистр букв не учитывается).`;
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
