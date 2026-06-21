import { useEffect, useState } from "react";

/**
 * A boolean backed by `localStorage`. Reads the stored value on mount and
 * writes through on every update, so callers just treat it like `useState`.
 */
export function useLocalStorageBoolean(key: string, defaultValue = false) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) setValue(raw === "true");
  }, [key]);

  const update = (next: boolean | ((prev: boolean) => boolean)) =>
    setValue((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      window.localStorage.setItem(key, String(resolved));
      return resolved;
    });

  return [value, update] as const;
}
