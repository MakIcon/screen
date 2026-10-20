import { useSyncExternalStore } from "react";

export type Locale = "ru" | "en";

const STORAGE_KEY = "screenlauncher-language";
const CHANGE_EVENT = "screenlauncher-language-changed";
let volatileLocale: Locale = "ru";

export function readLocale(): Locale {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ru";
  } catch {
    return volatileLocale;
  }
}

export function saveLocale(locale: Locale): void {
  volatileLocale = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Keep the selected language active for this window when storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, readLocale, () => "ru");
}

/** BCP 47 tag for Intl date and number formatting. */
export function intlLocale(locale: Locale): string {
  return locale === "ru" ? "ru-RU" : "en-US";
}
