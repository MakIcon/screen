import { useEffect, useState } from "react";
import { SettingsChoiceSwitch } from "../components/settings/SettingsChoiceSwitch";
import {
  APPEARANCE_CHOICES,
  MIRROR_OPTIONS,
  JAVA_CHOICES,
  LANGUAGE_CHOICES,
} from "../components/settings/settingsChoices";
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
import { clampRamToSystem, getMinecraftRamMax, getRamSliderTicks } from "../utils/ram";
import { createPlaceholderAppearanceAttributes } from "../utils/placeholders";
import type { Theme } from "../appearance/types";
import type {
  LauncherPluginsSettings,
  MascotSettings,
  MicrosoftAccount,
  MirrorMode,
} from "../types";

interface SettingsTabProps {
  systemRamGb: number;
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
  systemRamGb,
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
  const minecraftRamMax = getMinecraftRamMax(systemRamGb);
  const ramSliderTicks = getRamSliderTicks(systemRamGb);
  const [pluginsModalOpen, setPluginsModalOpen] = useState(false);
  const [mascotSettingsOpen, setMascotSettingsOpen] = useState(false);
  const [mascotNameDraft, setMascotNameDraft] = useState(mascotSettings.name);

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
    <section className="launcher-panel">
      <div className="panel-grid simple-two-col-fixed settings-panel-grid">
        <div className="panel-card settings-main-card" data-guide-target="settings-main">
          <CustomScrollArea className="settings-main-scroll">
            <div className="settings-main-content">
              <span className="panel-label">LAUNCHER SETTINGS</span>

              <div className="settings-memory-block" data-guide-target="settings-ram">
                <div className="memory-readout">
                  <span
                    className="memory-number"
                    {...createPlaceholderAppearanceAttributes("%launcher_ram_value%", resolve)}
                  >
                    {resolve("%launcher_ram_value%")}
                  </span>
                  <span className="memory-unit">GB</span>
                </div>

                <div className="settings-element-slider">
                  <ElementSlider
                    label="RAM"
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
                <span className="theme-switch-label">APPEARANCE</span>
                <SettingsChoiceSwitch
                  className="theme-switch--appearance"
                  value={appearanceCustomized ? "studio" : theme}
                  options={APPEARANCE_CHOICES.filter(
                    (option) =>
                      option.value !== "studio" || advancedSettingsEnabled || appearanceCustomized,
                  ).map((option) =>
                    option.value === "studio"
                      ? {
                          ...option,
                          buttonProps: {
                            ...option.buttonProps,
                            "data-tooltip": appearanceCustomized
                              ? "Custom design active · edit in Appearance Studio (Ctrl+Shift+A)"
                              : "Edit design in Appearance Studio (Ctrl+Shift+A)",
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
                <span className="theme-switch-label">DOWNLOAD SOURCE</span>
                <SettingsChoiceSwitch
                  value={mirrorMode}
                  options={MIRROR_OPTIONS}
                  onChange={(value) => commitMirrorMode(value as MirrorMode)}
                />
              </div>

              <div className="theme-switch-row" data-guide-target="settings-auto-java">
                <span className="theme-switch-label">AUTO-DOWNLOAD JAVA</span>
                <SettingsChoiceSwitch
                  value={autoDownloadJava ? "on" : "off"}
                  options={JAVA_CHOICES}
                  onChange={(value) => {
                    const enabled = value === "on";
                    if (enabled !== autoDownloadJava) void saveAutoDownloadJava(enabled);
                  }}
                />
              </div>

              <div className="theme-switch-row" data-guide-target="settings-language">
                <span className="theme-switch-label">LANGUAGE</span>
                <SettingsChoiceSwitch value="ru" options={LANGUAGE_CHOICES} onChange={() => {}} />
              </div>
            </div>
          </CustomScrollArea>

          <div className="settings-update-row" data-guide-target="settings-updates">
            <div className="settings-update-copy">
              <span className="settings-update-title">LAUNCHER UPDATES</span>
              <span className="settings-update-note">
                {launcherVersion ? `Версия ${launcherVersion}. ` : ""}Новые версии проверяются при
                запуске и ставятся без установщика Windows.
              </span>
            </div>
            <button
              className="settings-update-check"
              type="button"
              onClick={onCheckUpdates}
              disabled={updateChecking}
            >
              {updateChecking ? "CHECKING…" : "CHECK NOW"}
            </button>
          </div>
        </div>

        <div
          className="panel-card settings-preferences-card"
          data-guide-target="settings-preferences"
        >
          <CustomScrollArea className="settings-preferences-scroll">
            <div className="settings-preferences-content">
              <span className="panel-label">PREFERENCES</span>

              <div className="settings-toggle-block settings-toggle-block--bare">
                <ElementToggle
                  title="OPTIMIZED JAVA ARGUMENTS"
                  note="Запуск с G1GC-настройками и фиксированным heap. Выключи для классического запуска."
                  enabled={optimizedJavaArgs}
                  onToggle={() => void saveOptimizedJavaArgs(!optimizedJavaArgs)}
                  guideTarget="settings-optimized"
                />

                <ElementToggle
                  title="WHEEL TAB SWITCHING"
                  note="Переключение вкладок движением колеса мыши."
                  enabled={wheelTabSwitching}
                  onToggle={() => setWheelTabSwitching((prev) => !prev)}
                  guideTarget="settings-wheel"
                />

                <ExpandableSettingsGroup
                  title="LAUNCHER MASCOT"
                  note="Маскот гуляет по меню. Нажми стрелку, чтобы настроить его характер и возможности."
                  enabled={mascotEnabled}
                  expanded={mascotSettingsOpen}
                  onToggle={() => void saveMascotEnabled(!mascotEnabled)}
                  onToggleExpanded={() => setMascotSettingsOpen((open) => !open)}
                  mascotOffSwitch
                  guideTarget="settings-mascot"
                >
                  <label className="mascot-name-field">
                    <span>MASCOT NAME</span>
                    <input
                      type="text"
                      value={mascotNameDraft}
                      maxLength={24}
                      spellCheck={false}
                      placeholder="PIXEL"
                      aria-label="Имя маскота"
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
                    title="SHOW MASCOT NAME"
                    note="Показывать имя маскота в плашке при наведении."
                    enabled={mascotSettings.showName}
                    onToggle={() => updateMascotFlag("showName", !mascotSettings.showName)}
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title="RAGE MODE"
                    note="Сильные броски копят предупреждения и могут вызвать ярость."
                    enabled={mascotSettings.rageEnabled}
                    onToggle={() => updateMascotFlag("rageEnabled", !mascotSettings.rageEnabled)}
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title="WATER BOWL"
                    note="Показывать миску: маскот сможет пить, а миску можно взять и бросить."
                    enabled={mascotSettings.bowlEnabled}
                    onToggle={() => updateMascotFlag("bowlEnabled", !mascotSettings.bowlEnabled)}
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title="AUTONOMOUS MOVEMENT"
                    note="Разрешить маскоту самостоятельно гулять по лаунчеру."
                    enabled={mascotSettings.movementEnabled}
                    onToggle={() =>
                      updateMascotFlag("movementEnabled", !mascotSettings.movementEnabled)
                    }
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title="PLAY WITH CONTROLS"
                    note="Прыгать на кнопки, поля и ползунки в спокойном режиме."
                    enabled={mascotSettings.interactionsEnabled}
                    onToggle={() =>
                      updateMascotFlag("interactionsEnabled", !mascotSettings.interactionsEnabled)
                    }
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title="CARRY UI ELEMENTS"
                    note="Брать элементы интерфейса в руки и уносить их."
                    enabled={mascotSettings.carryElementsEnabled}
                    onToggle={() =>
                      updateMascotFlag("carryElementsEnabled", !mascotSettings.carryElementsEnabled)
                    }
                    size="small"
                    mascotOffSwitch
                  />
                  <ElementToggle
                    title="SCROLL LISTS"
                    note="Подходить к спискам и самостоятельно листать их."
                    enabled={mascotSettings.scrollListsEnabled}
                    onToggle={() =>
                      updateMascotFlag("scrollListsEnabled", !mascotSettings.scrollListsEnabled)
                    }
                    size="small"
                    mascotOffSwitch
                  />
                </ExpandableSettingsGroup>

                <ElementToggle
                  title="SHOW SNAPSHOTS"
                  note="Показывать snapshot версии в списке доступных установок."
                  enabled={showSnapshots}
                  onToggle={() => setShowSnapshots((prev) => !prev)}
                  guideTarget="settings-snapshots"
                />

                <ElementToggle
                  title="SHOW PRE-RELEASES"
                  note="Показывать pre-release и release candidate версии."
                  enabled={showPreReleases}
                  onToggle={() => setShowPreReleases((prev) => !prev)}
                  guideTarget="settings-prereleases"
                />

                <ElementToggle
                  title="ADVANCED SETTINGS"
                  note="Включает кнопку SETTINGS у сборок и в режиме создания для кастомного фона карточки версии."
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
                    <span>EXTENSIONS</span>
                    <strong>MANAGE</strong>
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
