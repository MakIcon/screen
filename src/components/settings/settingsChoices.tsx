import type { SettingsChoiceOption } from "./SettingsChoiceSwitch";
import type { MirrorMode } from "../../types";
import type { PlainMessageKey, useTranslation } from "../../i18n/locale";

/** A choice whose label is a message key; `localizeChoices` turns it into display text. */
export type SettingsChoiceDefinition = Omit<SettingsChoiceOption, "label"> & {
  label: PlainMessageKey;
};

export function localizeChoices(
  choices: SettingsChoiceDefinition[],
  tr: ReturnType<typeof useTranslation>,
): SettingsChoiceOption[] {
  return choices.map((choice) => ({ ...choice, label: tr(choice.label) }));
}

export const MIRROR_OPTIONS: (SettingsChoiceDefinition & { value: MirrorMode })[] = [
  { value: "official", label: "settings.choice.official" },
  { value: "auto", label: "settings.choice.auto" },
  { value: "mirror", label: "settings.choice.mirror" },
];

const SunIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <circle cx="5.5" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.2" />
    <line
      x1="5.5"
      y1="0"
      x2="5.5"
      y2="1.5"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <line
      x1="5.5"
      y1="9.5"
      x2="5.5"
      y2="11"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <line
      x1="0"
      y1="5.5"
      x2="1.5"
      y2="5.5"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <line
      x1="9.5"
      y1="5.5"
      x2="11"
      y2="5.5"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <line
      x1="1.6"
      y1="1.6"
      x2="2.65"
      y2="2.65"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <line
      x1="8.35"
      y1="8.35"
      x2="9.4"
      y2="9.4"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <line
      x1="1.6"
      y1="9.4"
      x2="2.65"
      y2="8.35"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <line
      x1="8.35"
      y1="2.65"
      x2="9.4"
      y2="1.6"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path
      d="M9.5 7A4.5 4.5 0 0 1 4 1.5a4.5 4.5 0 1 0 5.5 5.5z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

const VoidIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <circle cx="5.5" cy="5.5" r="3.5" fill="currentColor" />
  </svg>
);

const StudioIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
    <path
      d="M5.5 0.8 6.8 4.2 10.2 5.5 6.8 6.8 5.5 10.2 4.2 6.8 0.8 5.5 4.2 4.2Z"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
  </svg>
);

const JavaIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path
      d="M4 8.2c0 .6 1.1 1 2.5 1s2.5-.4 2.5-1"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <path
      d="M3.2 6.6c0 .8 1.5 1.3 3.3 1.3s3.3-.5 3.3-1.3"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <path
      d="M5.6 5.4c-.9-.9.6-1.5.2-2.6"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <path d="M7 5.4c-.7-.7.4-1.2.1-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

const FlagRuIcon = () => (
  <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
    <rect width="16" height="11" rx="1.5" fill="#fff" />
    <rect y="3.67" width="16" height="3.66" fill="#0039A6" />
    <rect y="7.33" width="16" height="3.67" rx="0 0 1.5 1.5" fill="#D52B1E" />
  </svg>
);

const FlagUsIcon = () => (
  <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
    <rect width="16" height="11" rx="1.5" fill="#B22234" />
    <rect y="0.846" width="16" height="0.846" fill="#fff" />
    <rect y="2.538" width="16" height="0.846" fill="#fff" />
    <rect y="4.23" width="16" height="0.846" fill="#fff" />
    <rect y="5.923" width="16" height="0.846" fill="#fff" />
    <rect y="7.615" width="16" height="0.846" fill="#fff" />
    <rect y="9.308" width="16" height="0.846" fill="#fff" />
    <rect width="7" height="5.077" rx="1" fill="#3C3B6E" />
  </svg>
);

export const APPEARANCE_CHOICES: SettingsChoiceDefinition[] = [
  { value: "light", label: "settings.choice.light", icon: <SunIcon /> },
  { value: "dark", label: "settings.choice.dark", icon: <MoonIcon /> },
  { value: "void", label: "settings.choice.void", icon: <VoidIcon /> },
  {
    value: "studio",
    label: "settings.choice.studio",
    icon: <StudioIcon />,
    buttonProps: { className: "theme-switch-btn--studio" },
  },
];
export const JAVA_CHOICES: SettingsChoiceDefinition[] = [
  { value: "on", label: "common.onCaps", icon: <JavaIcon /> },
  { value: "off", label: "common.offCaps" },
];
export const LANGUAGE_CHOICES: SettingsChoiceDefinition[] = [
  { value: "ru", label: "settings.choice.ru", icon: <FlagRuIcon /> },
  { value: "en", label: "settings.choice.en", icon: <FlagUsIcon /> },
];
