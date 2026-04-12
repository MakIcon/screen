import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "screenlauncher-theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (window.localStorage.getItem(STORAGE_KEY) as Theme) || "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "";
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  return { theme, toggleTheme };
}
