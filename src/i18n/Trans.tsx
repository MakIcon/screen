import { Fragment, type ReactNode } from "react";
import { useLocale } from "./store";
import { formatMessage, type MessageKey } from "./translate";

/**
 * Renders a message whose placeholders hold markup, so a sentence with inline
 * `<code>` stays one translatable string instead of being cut into pieces.
 */
export function Trans({ k, values }: { k: MessageKey; values: Record<string, ReactNode> }) {
  const locale = useLocale();
  const parts = formatMessage(locale, k).split(/\{(\w+)\}/);
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{index % 2 ? (values[part] ?? `{${part}}`) : part}</Fragment>
      ))}
    </>
  );
}
