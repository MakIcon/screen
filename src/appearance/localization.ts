import { useCallback } from "react";
import { readLocale, useLocale, type Locale } from "../i18n/locale";
import { formatMessage } from "../i18n/translate";
import { APPEARANCE_TEXT_KEYS } from "./localizationKeys";

/** Localize editor metadata at render time; never pass user-authored text here. */
export function appearanceText(
  text: string,
  params?: Record<string, string | number>,
  locale: Locale = readLocale(),
): string {
  const key = APPEARANCE_TEXT_KEYS[text as keyof typeof APPEARANCE_TEXT_KEYS];
  return key ? formatMessage(locale, key, params) : text;
}

export function useAppearanceText() {
  const locale = useLocale();
  return useCallback(
    (text: string, params?: Record<string, string | number>) =>
      appearanceText(text, params, locale),
    [locale],
  );
}
