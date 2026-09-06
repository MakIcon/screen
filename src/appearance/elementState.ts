import type {
  AppearanceElementInteractionState,
  AppearanceElementOverride,
  AppearanceElementStyle,
} from "./types";

type StatefulStyleKey =
  | "hoverStyle"
  | "pressedStyle"
  | "focusStyle"
  | "disabledStyle"
  | "selectedStyle";

export const ELEMENT_INTERACTION_STATES: readonly {
  id: AppearanceElementInteractionState;
  label: string;
  note: string;
}[] = [
  { id: "normal", label: "NORMAL", note: "The element's resting appearance." },
  { id: "hover", label: "HOVER", note: "While the pointer is over the element." },
  { id: "pressed", label: "PRESSED", note: "While the mouse or touch pointer is held down." },
  { id: "focus", label: "FOCUS", note: "When keyboard or programmatic focus is visible." },
  { id: "disabled", label: "DISABLED", note: "For disabled and aria-disabled controls." },
  { id: "selected", label: "SELECTED", note: "For active, selected or pressed-toggle items." },
];

const STATE_STYLE_KEYS: Record<Exclude<AppearanceElementInteractionState, "normal">, StatefulStyleKey> = {
  hover: "hoverStyle",
  pressed: "pressedStyle",
  focus: "focusStyle",
  disabled: "disabledStyle",
  selected: "selectedStyle",
};

export function getElementStateStyle(
  override: AppearanceElementOverride | undefined,
  state: AppearanceElementInteractionState,
): AppearanceElementStyle | undefined {
  return state === "normal" ? override?.style : override?.[STATE_STYLE_KEYS[state]];
}

export function setElementStateStyle(
  override: AppearanceElementOverride,
  state: AppearanceElementInteractionState,
  style: AppearanceElementStyle | undefined,
) {
  if (state === "normal") {
    override.style = style ?? {};
    return;
  }
  const key = STATE_STYLE_KEYS[state];
  if (style && Object.keys(style).length > 0) override[key] = style;
  else delete override[key];
}

export function hasElementStateStyles(override: AppearanceElementOverride) {
  return Object.values(STATE_STYLE_KEYS).some((key) => {
    const style = override[key];
    return Boolean(style && Object.keys(style).length > 0);
  });
}

export function mergeElementStateStyle(
  override: AppearanceElementOverride | undefined,
  state: AppearanceElementInteractionState,
) {
  if (!override) return undefined;
  return state === "normal" ? override.style : { ...override.style, ...getElementStateStyle(override, state) };
}
