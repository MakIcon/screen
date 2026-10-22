import { useEffect, useRef, useState } from "react";
import type { SettingsCommandTarget } from "../components/command-palette/settingsCommands";
import { SettingsChoiceSwitch } from "../components/settings/SettingsChoiceSwitch";
import {
  APPEARANCE_CHOICES,
  MIRROR_OPTIONS,
  JAVA_CHOICES,
  LANGUAGE_CHOICES,
  localizeChoices,
} from "../components/settings/settingsChoices";
import { RamAllocationWarning } from "../components/inputs/RamAllocationWarning";
import { ElementSlider } from "../components/inputs/ElementSlider";
import { ElementToggle } from "../components/inputs/ElementToggle";
import { CustomScrollArea } from "../components/layout/CustomScrollArea";
import { LauncherPluginsModal } from "../components/plugins/LauncherPluginsModal";
import { PluginIcon } from "../components/plugins/PluginIcon";
import { ExpandableSettingsGroup } from "../components/settings/ExpandableSettingsGroup";
import {
  PLUGIN_DEFINITIONS,
  normalizeLauncherPluginsSettings,
} from "../components/plugins/pluginRegistry";
import {
  clampRamToSystem,
  exceedsUsableRam,
  getMinecraftRamMax,
  getRamSliderTicks,
} from "../utils/ram";
import { createPlaceholderAppearanceAttributes } from "../utils/placeholders";
import { useLocale, useTranslation, saveLocale, type Locale } from "../i18n/locale";
import type { Theme } from "../appearance/types";
import type {
  LauncherPluginsSettings,
  MascotSettings,
  MicrosoftAccount,
  MirrorMode,
} from "../types";

interface SettingsTabProps {
  commandTarget?: SettingsCommandTarget | null;
  systemRamGb: number;
  usableRamGb: number | null;
  settingsRamDraft: number;
  resolve: (template: string) => string;
  setSettingsRamDraft: (v: number) => void;
  saveSettingsRam: (value: number) => Promise<void>;
  optimizedJavaArgs: boolean;
  saveOptimizedJavaArgs: (enabled: boolean) => Promise<void>;
  autoDownloadJava: boolean;
  saveAutoDownloadJava: (enabled: boolean) => Promise<void>;
  mascotEnabled: boolean;
  saveMascotEnabled: (enabled: boolean) => Promise<void>;
  mascotSettings: MascotSettings;
  saveMascotSettings: (settings: MascotSettings) => Promise<void>;
  mirrorMode: MirrorMode;
  saveNetworkSettings: (mirror: string) => Promise<void>;
  wheelTabSwitching: boolean;
  setWheelTabSwitching: (fn: (prev: boolean) => boolean) => void;
  showSnapshots: boolean;
  setShowSnapshots: (fn: (prev: boolean) => boolean) => void;
  showPreReleases: boolean;
  setShowPreReleases: (fn: (prev: boolean) => boolean) => void;
  advancedSettingsEnabled: boolean;
  onToggleAdvanced: () => void;
  pluginsSettings?: LauncherPluginsSettings | null;
  savePluginsSettings: (
    plugins: LauncherPluginsSettings,
    pluginIds?: (keyof LauncherPluginsSettings)[],
  ) => Promise<void>;
  launcherNickname: string;
  launcherAccountType: string;
  launcherMsAccountId: string | null;
  microsoftAccounts: MicrosoftAccount[];
  theme: Theme;
  setTheme: (t: Theme) => void;
  appearanceCustomized: boolean;
  onCustomizeAppearance: () => void;
  launcherVersion: string | null;
  updateChecking: boolean;
  onCheckUpdates: () => void;
}

export function SettingsTab({
  commandTarget,
  systemRamGb,
  usableRamGb,
  settingsRamDraft,
  resolve,
  setSettingsRamDraft,
  saveSettingsRam,
  optimizedJavaArgs,
  saveOptimizedJavaArgs,
  autoDownloadJava,
  saveAutoDownloadJava,
  mascotEnabled,
  saveMascotEnabled,
  mascotSettings,
  saveMascotSettings,
  mirrorMode,
  saveNetworkSettings,
  wheelTabSwitching,
  setWheelTabSwitching,
  showSnapshots,
  setShowSnapshots,
  showPreReleases,
  setShowPreReleases,
  advancedSettingsEnabled,
  onToggleAdvanced,
  pluginsSettings,
  savePluginsSettings,
  launcherNickname,
  launcherAccountType,
  launcherMsAccountId,
  microsoftAccounts,
  theme,
  setTheme,
  appearanceCustomized,
  onCustomizeAppearance,
  launcherVersion,
  updateChecking,
  onCheckUpdates,
}: SettingsTabProps) {
  const locale = useLocale();
  const tr = useTranslation();
  const minecraftRamMax = getMinecraftRamMax(systemRamGb);
  const ramSliderTicks = getRamSliderTicks(systemRamGb);
  const ramOverUsable = exceedsUsableRam(settingsRamDraft, usableRamGb);
  const [pluginsModalOpen, setPluginsModalOpen] = useState(false);
  const [mascotSettingsOpen, setMascotSettingsOpen] = useState(false);
  const [mascotNameDraft, setMascotNameDraft] = useState(mascotSettings.name);
  const sectionRef = useRef<HTMLElement>(null);
  const requestedPlugin = PLUGIN_DEFINITIONS.find(
    (definition) => commandTarget?.id === `plugin:${definition.id}`,
  );

  useEffect(() => {
    if (!commandTarget) return;
    if (commandTarget.id === "settings-extensions" || commandTarget.id.startsWith("plugin:")) {
      setPluginsModalOpen(true);
      return;
    }
    setPluginsModalOpen(false);
    if (commandTarget.id.startsWith("settings-mascot-")) setMascotSettingsOpen(true);
    let frame = 0;
    let timer = 0;
    let attempts = 0;
    let highlighted: HTMLElement | null = null;
    const reveal = () => {
      const target = sectionRef.current?.querySelector<HTMLElement>(
        `[data-guide-target="${commandTarget.id}"]`,
      );
      if (!target && attempts++ < 30) {
        frame = window.requestAnimationFrame(reveal);
        return;
      }
      if (!target) return;
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
      target
        .querySelector<HTMLElement>("input, button, select, [tabindex]")
        ?.focus({ preventScroll: true });
      target.classList.add("command-target-highlight");
      highlighted = target;
      timer = window.setTimeout(() => target.classList.remove("command-target-highlight"), 2400);
    };
    frame = window.requestAnimationFrame(reveal);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      highlighted?.classList.remove("command-target-highlight");
    };
  }, [commandTarget]);

  useEffect(() => {
    setMascotNameDraft(mascotSettings.name);
  }, [mascotSettings.name]);

  const commitMirrorMode = (mode: MirrorMode) => {
    if (mode === mirrorMode) return;
    void saveNetworkSettings(mode).catch(() => {});
  };

  const normalizedPlugins = normalizeLauncherPluginsSettings(pluginsSettings);
  const activePluginDefinitions = PLUGIN_DEFINITIONS.filter((definition) =>
    definition.getEnabled(normalizedPlugins),
  );

  const updateMascotFlag = (key: Exclude<keyof MascotSettings, "name">, enabled: boolean) => {
    if (mascotSettings[key] === enabled) return;
    void saveMascotSettings({ ...mascotSettings, [key]: enabled });
  };

  const commitMascotName = () => {
    const trimmed = Array.from(mascotNameDraft.trim()).slice(0, 24).join("");
    const name = trimmed || "PIXEL";
    setMascotNameDraft(name);
    if (name !== mascotSettings.name) {
      void saveMascotSettings({ ...mascotSettings, name });
    }
  };

  return (
    <section ref={sectionRef} className="launcher-panel">
      <div className="panel-grid simple-two-col-fixed settings-panel-grid">
        <div className="panel-card settings-main-card" data-guide-target="settings-main">
          <CustomScrollArea className="settings-main-scroll">
            <div className="settings-main-content">
              <span className="panel-label">{tr("settings.launcherSettings")}</span>

              <div
                className={`settings-memory-block${ramOverUsable ? " ram-allocation--danger" : ""}`}
                data-guide-target="settings-ram"
              >
                <div className="memory-readout">
                  <div className="memory-value">
                    <span
                      className="memory-number"
                      {...createPlaceholderAppearanceAttributes("%launcher_ram_value%", resolve)}
                    >
                      {resolve("%launcher_ram_value%")}
                    </span>
                    <span className="memory-unit">GB</span>
                  </div>
                  <RamAllocationWarning
                    ramGb={settingsRamDraft}
                    usableRamGb={usableRamGb}
                    maxRamGb={minecraftRamMax}
                    variant="signs"
                  />
                </div>

                <div className="settings-element-slider">
                  <ElementSlider
                    label={tr("ui.ram")}
                    showHeader={false}
                    min={1}
                    max={minecraftRamMax}
                    defaultValue={4}
                    appearanceConstraint="system-ram"
                    appearanceSystemMax={minecraftRamMax}
                    step={1}
                    value={settingsRamDraft}
                    tickMode="custom"
                    customTicks={ramSliderTicks}
                    onChange={(value) => {
                      setSettingsRamDraft(clampRamToSystem(value, systemRamGb));
                    }}
                    onCommit={(value) => void saveSettingsRam(value)}
                  />
                </div>
              </div>

              <div
                className="theme-switch-row theme-switch-row--appearance"
                data-guide-target="settings-appearance"
              >
                <span className="theme-switch-label">{tr("settings.appearance")}</span>
                <SettingsChoiceSwitch
                  className="theme-switch--appearance"
                  value={appearanceCustomized ? "studio" : theme}
                  options={localizeChoices(
                    APPEARANCE_CHOICES.filter(
                      (option) =>
                        option.value !== "studio" ||
                        advancedSettingsEnabled ||
                        appearanceCustomized,
                    ),
                    tr,
                  ).map((option) =>
                    option.value === "studio"
                      ? {
                          ...option,
                          buttonProps: {
                            ...option.buttonProps,
                            "data-tooltip": appearanceCustomized
                              ? tr("settings.customDesignActiveEdit")
                              : tr("settings.editDesignInAppearance"),
                            "aria-keyshortcuts": "Control+Shift+A Meta+Shift+A",
                          },
                        }
                      : option,
                  )}
                  onChange={(value) => {
                    if (value === "studio") onCustomizeAppearance();
                    else if (appearanceCustomized || value !== theme) setTheme(value as Theme);
                  }}
                />
              </div>

              <div className="theme-switch-row" data-guide-target="settings-source">
                <span className="theme-switch-label">{tr("settings.downloadSource")}</span>
                <SettingsChoiceSwitch
                  value={mirrorMode}
                  options={localizeChoices(MIRROR_OPTIONS, tr)}
                  onChange={(value) => commitMirrorMode(value as MirrorMode)}
                />
              </div>

              <div className="theme-switch-row" data-guide-target="settings-auto-java">
                <span className="theme-switch-label">{tr("settings.autoDownloadJava")}</span>
                <SettingsChoiceSwitch
                  value={autoDownloadJava ? "on" : "off"}
                  options={localizeChoices(JAVA_CHOICES, tr)}
                  onChange={(value) => {
                    const enabled = value === "on";
                    if (enabled !== autoDownloadJava) void saveAutoDownloadJava(enabled);
                  }}
                />
              </div>

              <div className="theme-switch-row" data-guide-target="settings-language">
                <span className="theme-switch-label">{tr("settings.language")}</span>
                <SettingsChoiceSwitch
                  value={locale}
                  options={localizeChoices(LANGUAGE_CHOICES, tr)}
                  onChange={(value) => saveLocale(value as Locale)}
                />
              </div>
            </div>
          </CustomScrollArea>

          <div className="settings-update-row" data-guide-target="settings-updates">
            <div className="settings-update-copy">
              <span className="settings-update-title">{tr("settings.launcherUpdates")}</span>
              <span className="settings-update-note">
                {launcherVersion ? `${tr("settings.version")} ${launcherVersion}. ` : ""}
                {tr("settings.newVersionsAreChecked")}
              </span>
            </div>
            <button
              className="settings-update-check"
              type="button"
              onClick={onCheckUpdates}
              disabled={updateChecking}
            >
              {updateChecking ? tr("settings.checking") : tr("settings.checkNow")}
            </button>
          </div>
        </div>

        <div
          className="panel-card settings-preferences-card"
          data-guide-target="settings-preferences"
        >
          <CustomScrollArea className="settings-preferences-scroll">
            <div className="settings-preferences-content">
              <span className="panel-label">{tr("settings.preferences")}</span>

              <div className="settings-toggle-block settings-toggle-block--bare">
                <ElementToggle
                  title={tr("settings.optimizedJavaArguments")}
                  note={tr("settings.launchWithG1gcSettings")}
                  enabled={optimizedJavaArgs}
                  onToggle={() => void saveOptimizedJavaArgs(!optimizedJavaArgs)}
                  guideTarget="settings-optimized"
                />

                <ElementToggle
                  title={tr("settings.wheelTabSwitching")}
                  note={tr("settings.switchTabsWithThe")}
                  enabled={wheelTabSwitching}
                  onToggle={() => setWheelTabSwitching((prev) => !prev)}
                  guideTarget="settings-wheel"
                />

                <ExpandableSettingsGroup
                  title={tr("settings.launcherMascot")}
                  note={tr("settings.theMascotWalksAround")}
                  enabled={mascotEnabled}
                  expanded={mascotSettingsOpen}
                  onToggle={() => void saveMascotEnabled(!mascotEnabled)}
                  onToggleExpanded={() => setMascotSettingsOpen((open) => !open)}
                  mascotOffSwitch
                  guideTarget="settings-mascot"
                >
                  <label className="mascot-name-field" data-guide-target="settings-mascot-name">
                    <span>{tr("settings.mascotName")}</span>
                    <input
                      type="text"
                      value={mascotNameDraft}
                      maxLength={24}
                      spellCheck={false}
                      placeholder="PIXEL"
                      aria-label={tr("settings.mascotName2")}
                      onChange={(event) => setMascotNameDraft(event.target.value)}
                      onBlur={commitMascotName}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") {
                          setMascotNameDraft(mascotSettings.name);
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </label>

                  <ElementToggle
                    title={tr("settings.showMascotName")}
                    guideTarget="settings-mascot-show-name"
                    note={tr("settings.showTheMascotsName")}
                    enabled={mascotSettings.showName}
                    onToggle={() => updateMascotFlag("showName", !mascotSettings.showName)}
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title={tr("settings.rageMode")}
                    guideTarget="settings-mascot-rage"
                    note={tr("settings.hardThrowsBuildUp")}
                    enabled={mascotSettings.rageEnabled}
                    onToggle={() => updateMascotFlag("rageEnabled", !mascotSettings.rageEnabled)}
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title={tr("settings.waterBowl")}
                    guideTarget="settings-mascot-bowl"
                    note={tr("settings.showABowlThe")}
                    enabled={mascotSettings.bowlEnabled}
                    onToggle={() => updateMascotFlag("bowlEnabled", !mascotSettings.bowlEnabled)}
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title={tr("settings.autonomousMovement")}
                    guideTarget="settings-mascot-movement"
                    note={tr("settings.allowTheMascotTo")}
                    enabled={mascotSettings.movementEnabled}
                    onToggle={() =>
                      updateMascotFlag("movementEnabled", !mascotSettings.movementEnabled)
                    }
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title={tr("settings.playWithControls")}
                    guideTarget="settings-mascot-interactions"
                    note={tr("settings.jumpOntoButtonsFields")}
                    enabled={mascotSettings.interactionsEnabled}
                    onToggle={() =>
                      updateMascotFlag("interactionsEnabled", !mascotSettings.interactionsEnabled)
                    }
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title={tr("settings.carryUiElements")}
                    guideTarget="settings-mascot-carry"
                    note={tr("settings.pickUpAndCarry")}
                    enabled={mascotSettings.carryElementsEnabled}
                    onToggle={() =>
                      updateMascotFlag("carryElementsEnabled", !mascotSettings.carryElementsEnabled)
                    }
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title={tr("settings.scrollLists")}
                    guideTarget="settings-mascot-scroll"
                    note={tr("settings.walkUpToLists")}
                    enabled={mascotSettings.scrollListsEnabled}
                    onToggle={() =>
                      updateMascotFlag("scrollListsEnabled", !mascotSettings.scrollListsEnabled)
                    }
                    size="small"
                    mascotOffSwitch
                  />
                </ExpandableSettingsGroup>

                <ElementToggle
                  title={tr("settings.showSnapshots")}
                  note={tr("settings.showSnapshotVersionsIn")}
                  enabled={showSnapshots}
                  onToggle={() => setShowSnapshots((prev) => !prev)}
                  guideTarget="settings-snapshots"
                />

                <ElementToggle
                  title={tr("settings.showPreReleases")}
                  note={tr("settings.showPreReleaseAnd")}
                  enabled={showPreReleases}
                  onToggle={() => setShowPreReleases((prev) => !prev)}
                  guideTarget="settings-prereleases"
                />

                <ElementToggle
                  title={tr("settings.advancedSettings")}
                  note={tr("settings.enablesBuildSettingsAnd")}
                  enabled={advancedSettingsEnabled}
                  onToggle={onToggleAdvanced}
                  guideTarget="settings-advanced"
                />
              </div>

              {advancedSettingsEnabled && (
                <div className="runtime-advanced-zone">
                  <button
                    className="runtime-extension-button"
                    type="button"
                    onClick={() => setPluginsModalOpen(true)}
                  >
                    <span>{tr("settings.extensions")}</span>
                    <strong>{tr("settings.manage")}</strong>
                    {activePluginDefinitions.length > 0 && (
                      <span className="runtime-extension-icons" aria-hidden="true">
                        {activePluginDefinitions.slice(0, 4).map((definition) => (
                          <PluginIcon
                            key={definition.id}
                            definition={definition}
                            className="runtime-extension-icon"
                          />
                        ))}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </CustomScrollArea>
        </div>
      </div>

      {pluginsModalOpen && (
        <LauncherPluginsModal
          initialPluginId={requestedPlugin?.id}
          settings={pluginsSettings}
          launcherNickname={launcherNickname}
          launcherAccountType={launcherAccountType}
          launcherMsAccountId={launcherMsAccountId}
          microsoftAccounts={microsoftAccounts}
          onClose={() => setPluginsModalOpen(false)}
          onSave={savePluginsSettings}
        />
      )}
    </section>
  );
}
