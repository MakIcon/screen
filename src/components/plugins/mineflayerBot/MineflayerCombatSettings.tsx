import { useEffect, useState, type ComponentProps } from "react";
import type { MineflayerCombatSettings } from "../../../types";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { ElementSlider } from "../../inputs/ElementSlider";
import { ElementToggle } from "../../inputs/ElementToggle";
import { InlineDropdown } from "../../inputs/InlineDropdown";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { DEFAULT_MINEFLAYER_COMBAT_SETTINGS } from "../pluginSettings";
import { useTranslation } from "../../../i18n/locale";

type Props = {
  settings: MineflayerCombatSettings;
  onChange: (settings: MineflayerCombatSettings) => void;
  commandPrefix: string;
};

const PRESETS: Array<{
  id: "novice" | "regular" | "expert" | "aggressive";
  patch: Partial<MineflayerCombatSettings>;
}> = [
  {
    id: "novice",
    patch: {
      meleeSkill: 35,
      reactionMs: 1000,
      cps: 5,
      strafe: "off",
      criticals: "off",
      sprintTap: "off",
      shield: false,
      shieldBreak: false,
      smoothAimSpeed: 50,
      bowAccuracy: 35,
      bowPredict: false,
      bowIntervalMs: 3000,
    },
  },
  {
    id: "regular",
    patch: {
      meleeSkill: 80,
      reactionMs: 250,
      cps: 12,
      strafe: "intelligent",
      criticals: "hop",
      sprintTap: "wtap",
      shield: true,
      shieldBreak: true,
      smoothAimSpeed: 100,
      bowAccuracy: 90,
      bowPredict: true,
      bowIntervalMs: 1500,
    },
  },
  {
    id: "expert",
    patch: {
      meleeSkill: 100,
      reactionMs: 0,
      smoothAimSpeed: 175,
      cps: 20,
      strafe: "intelligent",
      criticals: "shorthop",
      sprintTap: "wtap",
      shield: true,
      shieldBreak: true,
      bowAccuracy: 100,
      bowPredict: true,
      bowIntervalMs: 1200,
    },
  },
  {
    id: "aggressive",
    patch: {
      adaptiveCombat: true,
      combatHealing: true,
      pearlEscape: true,
      pearlEnabled: true,
      crystalEnabled: true,
      style: "auto",
      engine: "custom",
      reactionMs: 0,
      meleeSkill: 100,
      cps: 20,
      smoothAimSpeed: 175,
      strafe: "intelligent",
      criticals: "hop",
      sprintTap: "sprintcancel",
      shield: true,
      shieldBreak: true,
    },
  },
];

function CombatSettingsGroup({
  disabled = false,
  ...props
}: ComponentProps<typeof PluginSettingsGroup> & { disabled?: boolean }) {
  return (
    <fieldset className="mineflayer-bot-combat-group" disabled={disabled}>
      <PluginSettingsGroup {...props} />
    </fieldset>
  );
}

export function MineflayerCombatSettingsEditor({ settings, onChange, commandPrefix }: Props) {
  const tr = useTranslation();
  const [openDropdown, setOpenDropdown] = useState<keyof MineflayerCombatSettings | null>(null);
  useEffect(() => {
    const closeMenu = () => setOpenDropdown(null);
    const escapeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", escapeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", escapeMenu);
    };
  }, []);
  const update = (patch: Partial<MineflayerCombatSettings>) => onChange({ ...settings, ...patch });
  const choice = <K extends keyof MineflayerCombatSettings>(
    key: K,
    label: string,
    values: Array<[MineflayerCombatSettings[K], string]>,
    disabled = false,
  ) => {
    const unavailable =
      disabled || !settings.enabled || (key === "bowEngine" && !settings.bowEnabled);
    return (
      <fieldset className="mineflayer-bot-choice" key={key} disabled={unavailable}>
        <InlineDropdown
          label={label}
          value={values.find(([value]) => value === settings[key])?.[1] ?? ""}
          options={values.map(([, title]) => title)}
          isOpen={!unavailable && openDropdown === key}
          onToggle={() => setOpenDropdown(openDropdown === key ? null : key)}
          onSelect={(title) => {
            const selected = values.find(([, option]) => option === title);
            if (selected && !unavailable) update({ [key]: selected[0] });
            setOpenDropdown(null);
          }}
        />
      </fieldset>
    );
  };
  const number = (
    key: keyof MineflayerCombatSettings,
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label className="mineflayer-bot-field" key={key}>
      <span>{label}</span>
      <CustomNumberInput
        ariaLabel={label}
        background="transparent"
        min={min}
        max={max}
        step={step}
        value={Number(settings[key])}
        onChange={(value) => update({ [key]: value })}
      />
    </label>
  );
  const toggle = (key: keyof MineflayerCombatSettings, label: string, description: string) => (
    <ElementToggle
      key={key}
      size={0.75}
      title={label}
      note={description}
      enabled={Boolean(settings[key])}
      onToggle={() => update({ [key]: !settings[key] })}
    />
  );
  const skill = (key: "meleeSkill" | "bowAccuracy", label: string) => (
    <ElementSlider
      className="mineflayer-bot-slider"
      label={label}
      min={0}
      max={100}
      step={1}
      value={settings[key]}
      defaultValue={DEFAULT_MINEFLAYER_COMBAT_SETTINGS[key]}
      showDefaultMarker
      valueEditable
      showValueBorder={false}
      valueBackground="transparent"
      tickMode="custom"
      customTicks={[0, 25, 50, 75, 100]}
      disabled={!settings.enabled || (key === "bowAccuracy" && !settings.bowEnabled)}
      onChange={(value) => update({ [key]: value })}
    />
  );

  return (
    <>
      <div className="mineflayer-bot-toggle-grid">
        {toggle("enabled", tr("bot.combatSettings.enablePvp"), "")}
      </div>
      <div className="mineflayer-bot-combat-groups">
        <CombatSettingsGroup
          disabled={!settings.enabled}
          title={tr("bot.combatSettings.tacticsAndSkill")}
        >
          <div className="mineflayer-bot-toggle-grid">
            {toggle(
              "adaptiveCombat",
              tr("bot.combatSettings.adaptiveCombat"),
              tr("bot.combatSettings.aggressiveClosingInFinishing"),
            )}
            {toggle(
              "combatHealing",
              tr("bot.combatSettings.healingInCombat"),
              tr("bot.combatSettings.potionsGoldenApplesAnd"),
            )}
            {toggle(
              "pearlEscape",
              tr("bot.combatSettings.pearlRetreat"),
              tr("bot.combatSettings.createDistanceToHeal"),
            )}
          </div>
          <div className="mineflayer-bot-presets">
            {PRESETS.map((preset) => (
              <button type="button" key={preset.id} onClick={() => update(preset.patch)}>
                {tr(`bot.combatPreset.${preset.id}`)}
              </button>
            ))}
          </div>
          <div className="mineflayer-bot-grid">
            {choice("style", tr("bot.combatSettings.tactic"), [
              ["auto", tr("bot.combatSettings.autoPressureAndWeapon")],
              ["melee", tr("bot.combatSettings.meleeOnly")],
              ["ranged", tr("bot.combatSettings.bowOnly")],
              ["crystal", tr("bot.combatSettings.endCrystals")],
            ])}
            {choice("autoTarget", tr("bot.combatSettings.targetSelection"), [
              ["manual", tr("bot.combatSettings.onCommandOnly")],
              ["hostile", tr("bot.combatSettings.autoHostileMobs")],
            ])}
            {number("targetRange", tr("bot.combatSettings.searchChaseRange"), 4, 128)}
            {number("reactionMs", tr("bot.combatSettings.reactionMs"), 0, 3000)}
          </div>
        </CombatSettingsGroup>
        <CombatSettingsGroup disabled={!settings.enabled} title={tr("bot.combatSettings.melee")}>
          <div className="mineflayer-bot-grid">
            {choice("engine", tr("bot.combatSettings.combatEngine"), [
              ["custom", tr("bot.combatSettings.customPvpTacticsAnd")],
              ["basic", tr("bot.combatSettings.mineflayerPvpBasicCombat")],
            ])}
            {choice("weapon", tr("bot.combatSettings.weapon"), [
              ["sword", tr("bot.combatSettings.sword")],
              ["axe", tr("bot.combatSettings.axe")],
              ["mace", tr("bot.combatSettings.maceWindCharge")],
            ])}
            {skill("meleeSkill", tr("bot.combatSettings.meleeSkill"))}
            {number("cps", tr("bot.combatSettings.maxHitsPerSecond"), 1, 20)}
            {number("attackRange", tr("bot.combatSettings.hitRangeBlocks"), 1, 3, 0.1)}
            {choice(
              "strafe",
              tr("bot.combatSettings.strafe"),
              [
                ["off", tr("bot.combatSettings.off")],
                ["intelligent", tr("bot.combatSettings.smart")],
                ["circle", tr("bot.combatSettings.circle")],
                ["random", tr("bot.combatSettings.random")],
              ],
              settings.engine !== "custom",
            )}
            {choice(
              "criticals",
              tr("bot.combatSettings.criticalHits"),
              [
                ["off", tr("bot.combatSettings.off2")],
                ["hop", tr("bot.combatSettings.jump")],
                ["shorthop", tr("bot.combatSettings.shortJump")],
              ],
              settings.engine !== "custom",
            )}
            {choice(
              "sprintTap",
              tr("bot.combatSettings.sprintReset"),
              [
                ["off", tr("bot.combatSettings.off")],
                ["wtap", "W-tap"],
                ["stap", "S-tap"],
                ["sprintcancel", tr("bot.combatSettings.sprintCancel")],
              ],
              settings.engine !== "custom",
            )}
          </div>
          <p className="mineflayer-bot-combat-note">{tr("bot.combatSettings.aLowSkillAdds")}</p>
          {settings.weapon === "mace" && (
            <p className="mineflayer-bot-combat-note">
              {tr("bot.combatSettings.minecraftJava121")}
            </p>
          )}
          <div className="mineflayer-bot-toggle-grid">
            {toggle(
              "shield",
              tr("bot.combatSettings.useShield"),
              tr("bot.combatSettings.inTheInventoryOr"),
            )}
            {toggle(
              "shieldBreak",
              tr("bot.combatSettings.breakShields"),
              tr("bot.combatSettings.axeAndAJump"),
            )}
            {toggle(
              "maceDefense",
              tr("bot.combatSettings.maceDefense"),
              tr("bot.combatSettings.raiseTheShieldAnd"),
            )}
            {toggle(
              "pearlChase",
              tr("bot.combatSettings.pearlChase"),
              tr("bot.combatSettings.closeInOnA"),
            )}
          </div>
          <p className="mineflayer-bot-combat-note">{tr("bot.combatSettings.theBotThrowsA")}</p>
          <PluginSettingsGroup
            title={tr("bot.combatSettings.smoothAim")}
            description={tr("bot.combatSettings.turnSpeedTowardThe")}
            collapsible={false}
            enabled={settings.smoothAim}
            onToggle={() => update({ smoothAim: !settings.smoothAim })}
          >
            <ElementSlider
              className="mineflayer-bot-slider"
              label={tr("bot.combatSettings.aimSpeed")}
              min={10}
              max={300}
              step={1}
              value={settings.smoothAimSpeed}
              defaultValue={DEFAULT_MINEFLAYER_COMBAT_SETTINGS.smoothAimSpeed}
              showDefaultMarker
              valueEditable
              showValueBorder={false}
              valueBackground="transparent"
              tickMode="custom"
              customTicks={[10, 50, 100, 150, 200, 250, 300]}
              disabled={!settings.enabled}
              onChange={(value) => update({ smoothAimSpeed: value })}
            />
            <p className="mineflayer-bot-combat-note">{tr("bot.combatSettings.100IsTheNormal")}</p>
          </PluginSettingsGroup>
        </CombatSettingsGroup>
        <CombatSettingsGroup
          disabled={!settings.enabled}
          title={tr("bot.combatSettings.arrowDefense")}
          enabled={settings.bowDefense}
          onToggle={() => update({ bowDefense: !settings.bowDefense })}
        >
          <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.bowDefense}>
            <div className="mineflayer-bot-grid">
              {choice("bowDefenseMode", tr("bot.combatSettings.aimDetection"), [
                ["early", tr("bot.combatSettings.earlyDetection")],
                ["trajectory", tr("bot.combatSettings.byArrowTrajectory")],
              ])}
              {number("bowDefenseCheckMs", tr("bot.combatSettings.checkIntervalMs"), 0, 500, 50)}
              {number("bowDefenseRange", tr("bot.combatSettings.detectionRangeBlocks"), 4, 128)}
              {number(
                "bowDefenseMargin",
                tr("bot.combatSettings.sensitivityMarginBlocks"),
                0,
                2,
                0.05,
              )}
              {number(
                "bowDefenseHoldMs",
                tr("bot.combatSettings.shieldHoldAfterThreat"),
                100,
                2000,
                50,
              )}
            </div>
            <div className="mineflayer-bot-toggle-grid">
              {toggle(
                "bowDefenseRequireDraw",
                tr("bot.combatSettings.onlyWhenTheBow"),
                tr("bot.combatSettings.dontReactToA"),
              )}
            </div>
            <p className="mineflayer-bot-combat-note">
              {tr("bot.combatSettings.earlyModeNoticesThe")}
            </p>
          </fieldset>
        </CombatSettingsGroup>
        <CombatSettingsGroup
          disabled={!settings.enabled}
          title={tr("bot.combatSettings.bowShooting")}
          enabled={settings.bowEnabled}
          onToggle={() => update({ bowEnabled: !settings.bowEnabled })}
        >
          <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.bowEnabled}>
            <div className="mineflayer-bot-grid">
              {choice("bowEngine", tr("bot.combatSettings.trajectoryCalculation"), [
                ["custom", "Custom PvP"],
                ["hawkeye", "Minecraft HawkEye"],
              ])}
              {skill("bowAccuracy", tr("bot.combatSettings.aimAccuracy"))}
              {number("bowRange", tr("bot.combatSettings.bowRangeBlocks"), 4, 120)}
              {number("bowIntervalMs", tr("bot.combatSettings.shotIntervalMs"), 1200, 10000, 100)}
            </div>
            <div className="mineflayer-bot-toggle-grid">
              {toggle(
                "bowPredict",
                tr("bot.combatSettings.leadTarget"),
                tr("bot.combatSettings.accountForTargetMovement"),
              )}
              {toggle(
                "bowOffhand",
                tr("bot.combatSettings.bowInOffHand"),
                tr("bot.combatSettings.inVersionsWithAn"),
              )}
              {toggle(
                "meleeFallback",
                tr("bot.combatSettings.switchToSword"),
                tr("bot.combatSettings.whenOutOfBow"),
              )}
            </div>
          </fieldset>
          <p className="mineflayer-bot-combat-note">
            {tr("bot.combatSettings.accuracySetsTheAim")}
          </p>
        </CombatSettingsGroup>
        <CombatSettingsGroup
          disabled={!settings.enabled}
          title={tr("bot.combatSettings.endCrystals2")}
          enabled={settings.crystalEnabled}
          onToggle={() => update({ crystalEnabled: !settings.crystalEnabled })}
        >
          <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.crystalEnabled}>
            <div className="mineflayer-bot-toggle-grid">
              {toggle(
                "crystalPlace",
                tr("bot.combatSettings.placeCrystals"),
                tr("bot.combatSettings.onObsidianAndBedrock"),
              )}
              {toggle(
                "crystalBreak",
                tr("bot.combatSettings.detonateCrystals"),
                tr("bot.combatSettings.accountingForDamageAnd"),
              )}
              {toggle(
                "crystalBuildBase",
                tr("bot.combatSettings.buildABase"),
                tr("bot.combatSettings.placeObsidianFromThe"),
              )}
              {toggle(
                "crystalCover",
                tr("bot.combatSettings.coverBlock"),
                tr("bot.combatSettings.reduceSelfDamageBefore"),
              )}
              {toggle(
                "crystalFastAim",
                tr("bot.combatSettings.fastCrystalAim"),
                tr("bot.combatSettings.turnWithoutWaitingFor"),
              )}
              {toggle(
                "crystalPredict",
                tr("bot.combatSettings.targetMovementPrediction"),
                tr("bot.combatSettings.checkTheCurrentAnd"),
              )}
              {toggle(
                "crystalProtectOwners",
                tr("bot.combatSettings.protectOtherOwners"),
                tr("bot.combatSettings.dontDetonateNearThem"),
              )}
            </div>
            <div className="mineflayer-bot-grid">
              {choice("crystalPriority", tr("bot.combatSettings.positionChoice"), [
                ["damage", tr("bot.combatSettings.moreDamage")],
                ["closest", tr("bot.combatSettings.closerToTheBot")],
              ])}
              {choice("crystalCoverBlock", tr("bot.combatSettings.coverBlockType"), [
                ["auto", tr("bot.combatSettings.automatic")],
                ["obsidian", tr("bot.combatSettings.obsidian")],
                ["planks", tr("bot.combatSettings.planks")],
                ["cobblestone", tr("bot.combatSettings.cobblestone")],
              ])}
              {number("crystalPlaceRange", tr("bot.combatSettings.placeRangeBlocks"), 1, 4.5, 0.1)}
              {number("crystalBreakRange", tr("bot.combatSettings.breakRangeBlocks"), 1, 4.5, 0.1)}
              {number(
                "crystalIntervalMs",
                tr("bot.combatSettings.actionIntervalMs"),
                100,
                5000,
                50,
              )}
              {number("crystalMaxCoverBlocks", tr("bot.combatSettings.maxCoverBlocks"), 0, 4)}
              {number(
                "crystalSpawnTimeoutMs",
                tr("bot.combatSettings.waitForCrystalFrom"),
                300,
                5000,
                100,
              )}
              {number("crystalRetries", tr("bot.combatSettings.crystalPlacementAttempts"), 1, 5)}
              {number("crystalMinDamage", tr("bot.combatSettings.minTargetDamageHp"), 0, 100)}
              {number("crystalMaxSelfDamage", tr("bot.combatSettings.maxSelfDamageHp"), 0, 20)}
              {number("crystalMinHealth", tr("bot.combatSettings.keepHealthHp"), 1, 20)}
              {number("crystalPredictionTicks", tr("bot.combatSettings.predictTicksAhead"), 0, 10)}
            </div>
            <p className="mineflayer-bot-combat-note">
              {tr("bot.combatSettings.needsCrystalsAndFree")}
            </p>
          </fieldset>
        </CombatSettingsGroup>
        <CombatSettingsGroup
          title={tr("bot.combatSettings.enderPearl")}
          enabled={settings.pearlEnabled}
          onToggle={() => update({ pearlEnabled: !settings.pearlEnabled })}
        >
          <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.pearlEnabled}>
            <div className="mineflayer-bot-toggle-grid">
              {toggle(
                "pearlFollow",
                tr("bot.combatSettings.pearlForFollow"),
                tr("bot.combatSettings.shortenTheRouteAfter"),
              )}
              {toggle(
                "pearlCome",
                tr("bot.combatSettings.pearlForCome"),
                tr("bot.combatSettings.shortenTheRouteTo"),
              )}
              {toggle(
                "pearlGoto",
                tr("bot.combatSettings.pearlForGoto"),
                tr("bot.combatSettings.useOnTheWay"),
              )}
              {toggle(
                "pearlChain",
                tr("bot.combatSettings.repeatedThrows"),
                tr("bot.combatSettings.planTheNextLeg"),
              )}
            </div>
            <div className="mineflayer-bot-grid">
              {number("pearlMinDistance", tr("bot.combatSettings.minRouteShorteningBlocks"), 4, 64)}
              {number("pearlMaxDistance", tr("bot.combatSettings.maxThrowRangeBlocks"), 8, 64)}
              {number(
                "pearlCooldownMs",
                tr("bot.combatSettings.pauseBetweenThrowsMs"),
                1000,
                10000,
                100,
              )}
              {number("pearlMinHealth", tr("bot.combatSettings.minHealthBeforeThrowing"), 6, 20)}
              {number("pearlReserve", tr("bot.combatSettings.pearlsToKeepIn"), 0, 64)}
            </div>
            <p className="mineflayer-bot-combat-note">
              {tr("bot.combatSettings.theCalculationAccountsFor")}
            </p>
          </fieldset>
        </CombatSettingsGroup>
      </div>
      <p className="mineflayer-bot-combat-note">
        {tr("bot.combatSettings.stopHint", { stop: `${commandPrefix}stop` })}
      </p>
    </>
  );
}
