import { translateFor, type Locale } from "../../i18n/locale";
import type { PluginDefinition } from "./pluginTypes";

/** Category tag and description of an extension, in the interface language. */
export function pluginCopy(definition: PluginDefinition, locale: Locale) {
  return {
    tag: translateFor(locale, `plugins.${definition.id}.tag`),
    description: translateFor(locale, `plugins.${definition.id}.description`),
  };
}
