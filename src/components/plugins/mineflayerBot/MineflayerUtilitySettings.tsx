import { useState, type ReactNode } from "react";
import type { MineflayerCombatSettings } from "../../../types";
import { useTranslation, type PlainMessageKey } from "../../../i18n/locale";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { ElementToggle } from "../../inputs/ElementToggle";
import { InlineDropdown } from "../../inputs/InlineDropdown";
import { CombatSettingsGroup } from "./CombatSettingsGroup";
import options from "../../../../extensions/mineflayer-bot/combat-utility-options.json";

const labels = {
  lavaMinHealth: "bot.utility.lavaMinHealth",
  lavaMaxDistance: "bot.utility.lavaMaxDistance",
  lavaCooldownMs: "bot.utility.lavaCooldownMs",
  lavaHoldMs: "bot.utility.lavaHoldMs",
  webTrapDistance: "bot.utility.webTrapDistance",
  webTrapCooldownMs: "bot.utility.webTrapCooldownMs",
  webPredictionTicks: "bot.utility.webPredictionTicks",
  webComboWaitMs: "bot.utility.webComboWaitMs",
  webEscapeMode: "bot.utility.webEscapeMode",
  webEscapeTimeoutMs: "bot.utility.webEscapeTimeoutMs",
  webEscapeMoveMs: "bot.utility.webEscapeMoveMs",
  webEscapePickupWater: "bot.utility.webEscapePickupWater",
  autoExtinguish: "bot.utility.autoExtinguish",
  extinguishHealth: "bot.utility.extinguishHealth",
  extinguishDelayMs: "bot.utility.extinguishDelayMs",
  extinguishCooldownMs: "bot.utility.extinguishCooldownMs",
  extinguishPickupWater: "bot.utility.extinguishPickupWater",
  extinguishSkipResistance: "bot.utility.extinguishSkipResistance",
  extinguishLava: "bot.utility.extinguishLava",
  autoTotem: "bot.utility.autoTotem",
  totemMode: "bot.utility.totemMode",
  totemHealth: "bot.utility.totemHealth",
  totemReleaseHealth: "bot.utility.totemReleaseHealth",
  totemHoldMs: "bot.utility.totemHoldMs",
  totemRestoreOffhand: "bot.utility.totemRestoreOffhand",
  totemUseAbsorption: "bot.utility.totemUseAbsorption",
  totemOnCrystal: "bot.utility.totemOnCrystal",
  totemDangerRange: "bot.utility.totemDangerRange",
  retreatWeb: "bot.utility.retreatWeb",
  retreatWebHealth: "bot.utility.retreatWebHealth",
  retreatWebDistance: "bot.utility.retreatWebDistance",
  retreatWebCooldownMs: "bot.utility.retreatWebCooldownMs",
  retreatWebReserve: "bot.utility.retreatWebReserve",
  utilityConfirmTimeoutMs: "bot.utility.utilityConfirmTimeoutMs",
  utilityPickupRetries: "bot.utility.utilityPickupRetries",
  utilitySourceLifetimeMs: "bot.utility.utilitySourceLifetimeMs",
} as const;

export function MineflayerUtilitySettings({
  settings,
  onChange,
}: {
  settings: MineflayerCombatSettings;
  onChange: (settings: MineflayerCombatSettings) => void;
}) {
  const tr = useTranslation();
  const [openDropdown, setOpenDropdown] = useState<"webEscapeMode" | "totemMode" | null>(null);
  const update = (patch: Partial<MineflayerCombatSettings>) => onChange({ ...settings, ...patch });
  const number = (key: keyof typeof options.bounds, disabled = false) => {
    const [min, max] = options.bounds[key];
    return (
      <label className="mineflayer-bot-field" key={key}>
        <span>{tr(labels[key]).toUpperCase()}</span>
        <CustomNumberInput
          ariaLabel={tr(labels[key])}
          background="transparent"
          min={min}
          max={max}
          step={options.fractional.includes(key) ? 0.5 : key.endsWith("Ms") ? 50 : 1}
          value={settings[key]}
          onChange={(value) => update({ [key]: value })}
          disabled={disabled}
        />
      </label>
    );
  };
  const toggle = (key: keyof typeof labels) => (
    <ElementToggle
      key={key}
      size={0.75}
      title={tr(labels[key]).toUpperCase()}
      note=""
      enabled={Boolean(settings[key])}
      onToggle={() => update({ [key]: !settings[key] })}
    />
  );
  const choice = (
    key: "webEscapeMode" | "totemMode",
    choices: Array<[string, PlainMessageKey]>,
  ) => (
    <fieldset className="mineflayer-bot-choice" disabled={!settings.enabled}>
      <InlineDropdown
        label={tr(labels[key]).toUpperCase()}
        value={tr(choices.find(([value]) => value === settings[key])?.[1] ?? choices[0][1])}
        options={choices.map(([, label]) => tr(label))}
        isOpen={settings.enabled && openDropdown === key}
        onToggle={() => setOpenDropdown(openDropdown === key ? null : key)}
        onSelect={(label) => {
          const selected = choices.find(([, message]) => tr(message) === label);
          if (selected) update({ [key]: selected[0] });
          setOpenDropdown(null);
        }}
      />
    </fieldset>
  );
  const group = (
    title: PlainMessageKey,
    description: PlainMessageKey,
    enabled: keyof MineflayerCombatSettings,
    children: ReactNode,
    unavailable = false,
  ) => (
    <CombatSettingsGroup
      title={tr(title).toUpperCase()}
      disabled={!settings.enabled}
      enabled={Boolean(settings[enabled])}
      onToggle={() => update({ [enabled]: !settings[enabled] })}
    >
      <p className="mineflayer-bot-combat-note">{tr(description)}</p>
      <fieldset
        className="mineflayer-bot-combat-fields"
        disabled={unavailable || !settings[enabled]}
      >
        {children}
      </fieldset>
    </CombatSettingsGroup>
  );
  return (
    <div className="mineflayer-bot-utility-settings">
      <p className="mineflayer-bot-combat-note">{tr("bot.utility.hpNote")}</p>
      {group(
        "bot.utility.groupLava",
        "bot.utility.groupLavaNote",
        "lavaBucket",
        <div className="mineflayer-bot-grid">
          {number("lavaMinHealth")}
          {number("lavaMaxDistance")}
          {number("lavaCooldownMs")}
          {number("lavaHoldMs")}
        </div>,
      )}
      {group(
        "bot.utility.groupWeb",
        "bot.utility.groupWebNote",
        "webTrap",
        <div className="mineflayer-bot-grid">
          {number("webTrapDistance")}
          {number("webTrapCooldownMs")}
          {number("webPredictionTicks")}
        </div>,
      )}
      {group(
        "bot.utility.groupCombo",
        "bot.utility.groupComboNote",
        "webLavaCombo",
        <div className="mineflayer-bot-grid">{number("webComboWaitMs")}</div>,
        !settings.lavaBucket,
      )}
      {group(
        "bot.utility.groupEscape",
        "bot.utility.groupEscapeNote",
        "webEscape",
        <>
          <div className="mineflayer-bot-toggle-grid">
            <ElementToggle
              size={0.75}
              title={tr("bot.utility.allowSword").toUpperCase()}
              note=""
              enabled={settings.webEscapeSword}
              onToggle={() => update({ webEscapeSword: !settings.webEscapeSword })}
            />
            <ElementToggle
              size={0.75}
              title={tr("bot.utility.allowWater").toUpperCase()}
              note=""
              enabled={settings.webEscapeWater}
              onToggle={() => update({ webEscapeWater: !settings.webEscapeWater })}
            />
          </div>
          <fieldset
            className="mineflayer-bot-combat-fields"
            disabled={!settings.webEscapeSword && !settings.webEscapeWater}
          >
            {choice("webEscapeMode", [
              ["auto", "bot.utility.automatic"],
              ["sword", "bot.utility.preferSword"],
              ["water", "bot.utility.preferWater"],
            ])}
            <div className="mineflayer-bot-grid">
              {number("webEscapeTimeoutMs")}
              {number("webEscapeMoveMs", !settings.webEscapeWater)}
            </div>
            <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.webEscapeWater}>
              {toggle("webEscapePickupWater")}
            </fieldset>
          </fieldset>
        </>,
      )}
      {group(
        "bot.utility.groupExtinguish",
        "bot.utility.groupExtinguishNote",
        "autoExtinguish",
        <>
          <div className="mineflayer-bot-grid">
            {number("extinguishHealth")}
            {number("extinguishDelayMs")}
            {number("extinguishCooldownMs")}
          </div>
          <div className="mineflayer-bot-toggle-grid">
            {toggle("extinguishPickupWater")}
            {toggle("extinguishSkipResistance")}
            {toggle("extinguishLava")}
          </div>
        </>,
      )}
      {group(
        "bot.utility.groupTotem",
        "bot.utility.groupTotemNote",
        "autoTotem",
        <>
          {choice("totemMode", [
            ["danger", "bot.utility.whenDanger"],
            ["always", "bot.utility.always"],
          ])}
          <fieldset
            className="mineflayer-bot-combat-fields"
            disabled={settings.totemMode === "always"}
          >
            <div className="mineflayer-bot-grid">
              {number("totemHealth")}
              {number("totemReleaseHealth")}
              {number("totemHoldMs")}
            </div>
            <div className="mineflayer-bot-toggle-grid">
              {toggle("totemRestoreOffhand")}
              {toggle("totemUseAbsorption")}
              {toggle("totemOnCrystal")}
            </div>
            {number("totemDangerRange", !settings.totemOnCrystal)}
          </fieldset>
        </>,
      )}
      {group(
        "bot.utility.groupRetreat",
        "bot.utility.groupRetreatNote",
        "retreatWeb",
        <div className="mineflayer-bot-grid">
          {number("retreatWebHealth")}
          {number("retreatWebDistance")}
          {number("retreatWebCooldownMs")}
          {number("retreatWebReserve")}
        </div>,
      )}
      {group(
        "bot.utility.groupGeneral",
        "bot.utility.groupGeneralNote",
        "utilityRecoverySettings",
        <div className="mineflayer-bot-grid">
          {number("utilityConfirmTimeoutMs")}
          {number("utilityPickupRetries")}
          {number("utilitySourceLifetimeMs")}
        </div>,
      )}
    </div>
  );
}
