import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AppearanceComponentKind, AppearanceComponentSettingsMap } from "./types";

export const APPEARANCE_COMPONENT_ATTRIBUTE = "data-appearance-component";
export const APPEARANCE_COMPONENT_PROPS_ATTRIBUTE = "data-appearance-component-props";
export const APPEARANCE_COMPONENT_SETTINGS_ATTRIBUTE = "data-appearance-component-settings";

type AppearanceDataProps<Element extends HTMLElement> = {
  ref: RefObject<Element | null>;
  "data-appearance-component": AppearanceComponentKind;
  "data-appearance-component-props": string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Bridges a persisted appearance override back into a live React component.
 * The appearance runtime writes one small JSON attribute to the selected root;
 * this hook observes it and merges the override with the component's real props.
 */
export function useAppearanceComponentSettings<
  Kind extends AppearanceComponentKind,
  Element extends HTMLElement = HTMLDivElement,
>(kind: Kind, defaults: AppearanceComponentSettingsMap[Kind]) {
  const rootRef = useRef<Element>(null);
  const [override, setOverride] = useState<Partial<AppearanceComponentSettingsMap[Kind]>>({});
  const lastRawRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      const raw = root.getAttribute(APPEARANCE_COMPONENT_SETTINGS_ATTRIBUTE);
      if (raw === lastRawRef.current) return;
      lastRawRef.current = raw;
      if (!raw) {
        setOverride({});
        return;
      }
      try {
        const parsed = JSON.parse(raw) as unknown;
        setOverride(
          isRecord(parsed) ? (parsed as Partial<AppearanceComponentSettingsMap[Kind]>) : {},
        );
      } catch {
        setOverride({});
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: [APPEARANCE_COMPONENT_SETTINGS_ATTRIBUTE],
    });
    return () => observer.disconnect();
  }, []);

  const settings = useMemo(() => ({ ...defaults, ...override }), [defaults, override]);
  const appearanceProps: AppearanceDataProps<Element> = {
    ref: rootRef,
    "data-appearance-component": kind,
    "data-appearance-component-props": JSON.stringify(defaults),
  };

  return { rootRef, settings, appearanceProps };
}
