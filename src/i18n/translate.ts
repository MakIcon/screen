import { useCallback } from "react";
import { en } from "./messages/en";
import { ru, type RussianMessages } from "./messages/ru";
import type { EnglishPlural, RussianPlural } from "./messages/types";
import { intlLocale, readLocale, useLocale, type Locale } from "./store";

export type MessageKey = keyof RussianMessages;

type Message = string | RussianPlural | EnglishPlural;

type ParamNames<S> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | ParamNames<Rest>
  : never;
type MessageNames<M> = M extends string
  ? ParamNames<M>
  : M extends RussianPlural
    ? ParamNames<M["one"]> | ParamNames<M["few"]> | ParamNames<M["many"]> | "count"
    : never;

export type MessageParams<K extends MessageKey> = {
  [Name in MessageNames<RussianMessages[K]>]: Name extends "count" ? number : string | number;
};
/** Keys whose text has no placeholders, for props that carry a ready message key. */
export type PlainMessageKey = {
  [K in MessageKey]: [MessageNames<RussianMessages[K]>] extends [never] ? K : never;
}[MessageKey];
/** Keys without placeholders take no argument; the rest require every placeholder. */
export type MessageArgs<K extends MessageKey> = [MessageNames<RussianMessages[K]>] extends [never]
  ? []
  : [params: MessageParams<K>];

const CATALOGS: Record<Locale, Record<MessageKey, Message>> = { ru, en };
const pluralRules = new Map<Locale, Intl.PluralRules>();

function pluralForm(locale: Locale, message: RussianPlural | EnglishPlural, count: number) {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(intlLocale(locale));
    pluralRules.set(locale, rules);
  }
  const category = rules.select(count);
  if ("few" in message) {
    // Russian fractions select "other"; they read naturally with the genitive "few" form.
    return category === "one"
      ? message.one
      : category === "few" || category === "other"
        ? message.few
        : message.many;
  }
  return category === "one" ? message.one : message.other;
}

/** True for a key that exists in the catalog and takes no placeholders — for keys built at runtime. */
export function isPlainMessageKey(key: string): key is PlainMessageKey {
  const message = (ru as Record<string, Message>)[key];
  return typeof message === "string" && !message.includes("{");
}

export function formatMessage(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const message = CATALOGS[locale][key] ?? CATALOGS.ru[key] ?? key;
  const text =
    typeof message === "string" ? message : pluralForm(locale, message, Number(params?.count ?? 0));
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in params)) return match;
    const value = params[name];
    // Counts read as numbers ("32 768"); other placeholders such as ports stay verbatim.
    return name === "count" && typeof value === "number"
      ? value.toLocaleString(intlLocale(locale))
      : String(value);
  });
}

/** Translates for an explicit language, for formatters that receive the locale as an argument. */
export function translateFor<K extends MessageKey>(
  locale: Locale,
  key: K,
  ...args: MessageArgs<K>
): string {
  return formatMessage(locale, key, args[0] as Record<string, string | number> | undefined);
}

/**
 * Translates for the current language outside React rendering (event handlers, window titles).
 * Components should use `useTranslation` so the text updates when the language changes.
 */
export function translate<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string {
  return translateFor(readLocale(), key, ...args);
}

export function useTranslation() {
  const locale = useLocale();
  return useCallback(
    <K extends MessageKey>(key: K, ...args: MessageArgs<K>) => translateFor(locale, key, ...args),
    [locale],
  );
}
