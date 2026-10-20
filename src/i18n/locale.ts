// Public entry point for the launcher's localisation: the language store and translation helpers.
export { intlLocale, readLocale, saveLocale, useLocale, type Locale } from "./store";
export {
  isPlainMessageKey,
  translate,
  translateFor,
  useTranslation,
  type MessageKey,
  type MessageParams,
  type PlainMessageKey,
} from "./translate";
export { Trans } from "./Trans";
