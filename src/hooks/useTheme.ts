import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "void";
const STORAGE_KEY = "screenlauncher-theme";
const THEMES: Theme[] = ["light", "dark", "void"];

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored && THEMES.includes(stored) ? stored : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "light" ? "" : theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => THEMES[(THEMES.indexOf(prev) + 1) % THEMES.length]);

  return { theme, toggleTheme, setTheme };
}
