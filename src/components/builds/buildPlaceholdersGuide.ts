import {
  AVAILABLE_PLACEHOLDERS,
  type PlaceholderDefinition,
  type PlaceholderGroup,
} from "../../utils/placeholders";
import { isPlainMessageKey, translateFor, type Locale } from "../../i18n/locale";

export type GuidePlaceholderGroup = PlaceholderGroup | "bot";
export type GuidePlaceholder = Omit<PlaceholderDefinition, "group"> & {
  group: GuidePlaceholderGroup;
};

export const PLACEHOLDER_GUIDE_GROUPS: GuidePlaceholderGroup[] = [
  "build",
  "player",
  "launcher",
  "library",
  "bot",
];

const BOT_PLACEHOLDERS: readonly GuidePlaceholder[] = [
  {
    key: "owner",
    token: "%owner%",
    label: "",
    description: "",
    group: "bot",
  },
  {
    key: "bot",
    token: "%bot%",
    label: "",
    description: "",
    group: "bot",
  },
  {
    key: "server",
    token: "%server%",
    label: "",
    description: "",
    group: "bot",
  },
];

const GUIDE_PLACEHOLDERS: readonly GuidePlaceholder[] = [
  ...AVAILABLE_PLACEHOLDERS,
  ...BOT_PLACEHOLDERS,
];

/** Short description shown in the guide, from `placeholderGuide.<key>` messages. */
export function getPlaceholderGuideDescription(
  placeholder: GuidePlaceholder,
  locale: Locale = "ru",
): string {
  const key = `placeholderGuide.${placeholder.key}`;
  return isPlainMessageKey(key) ? translateFor(locale, key) : placeholder.description;
}

export function getPlaceholderGuideLabel(placeholder: GuidePlaceholder, locale: Locale): string {
  const key = `placeholderGuide.${placeholder.key}Label`;
  return isPlainMessageKey(key) ? translateFor(locale, key) : placeholder.label;
}

export function findGuidePlaceholders(
  query: string,
  group: GuidePlaceholderGroup | "all",
  locale: Locale = "ru",
) {
  const terms = query.replace(/\^%/g, "%").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return GUIDE_PLACEHOLDERS.filter((placeholder) => {
    if (group !== "all" && placeholder.group !== group) return false;
    const text = [
      placeholder.token,
      getPlaceholderGuideLabel(placeholder, locale),
      getPlaceholderGuideDescription(placeholder, locale),
      ...(placeholder.aliases ?? []).map((alias) => `%${alias}%`),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
