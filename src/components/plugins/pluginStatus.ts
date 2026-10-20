import { isPlainMessageKey, translateFor, type Locale } from "../../i18n/locale";

/** Status badges arrive as English codes such as "NEEDS URL"; unknown codes are shown as is. */
export function pluginStatusLabel(status: string, locale: Locale = "ru") {
  const code = status.toLowerCase().replace(/ (\w)/g, (_, letter: string) => letter.toUpperCase());
  const key = `pluginStatus.${code}`;
  return isPlainMessageKey(key) ? translateFor(locale, key) : status;
}
