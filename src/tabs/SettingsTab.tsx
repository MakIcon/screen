import { useEffect, useState } from "react";
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

const MIRROR_OPTIONS: { value: MirrorMode; label: string }[] = [
  { value: "official", label: "OFFICIAL" },
  { value: "auto", label: "AUTO" },
  { value: "mirror", label: "MIRROR" },
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
  savePluginsSettings: (plugins: LauncherPluginsSettings) => Promise<void>;
  launcherNickname: string;
  launcherAccountType: string;
  launcherMsAccountId: string | null;
  microsoftAccounts: MicrosoftAccount[];
  theme: Theme;
  setTheme: (t: Theme) => void;
  appearanceCustomized: boolean;
  onCustomizeAppearance: () => void;
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
        <div className="panel-card" data-guide-target="settings-main">
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
            <div className="theme-switch theme-switch--appearance">
              <button
                className={`theme-switch-btn${!appearanceCustomized && theme === "light" ? " active" : ""}`}
                type="button"
                aria-pressed={!appearanceCustomized && theme === "light"}
                onClick={() => (appearanceCustomized || theme !== "light") && setTheme("light")}
              >
                <SunIcon />
                LIGHT
              </button>
              <button
                className={`theme-switch-btn${!appearanceCustomized && theme === "dark" ? " active" : ""}`}
                type="button"
                aria-pressed={!appearanceCustomized && theme === "dark"}
                onClick={() => (appearanceCustomized || theme !== "dark") && setTheme("dark")}
              >
                <MoonIcon />
                DARK
              </button>
              <button
                className={`theme-switch-btn${!appearanceCustomized && theme === "void" ? " active" : ""}`}
                type="button"
                aria-pressed={!appearanceCustomized && theme === "void"}
                onClick={() => (appearanceCustomized || theme !== "void") && setTheme("void")}
              >
                <VoidIcon />
                VOID
              </button>
              {(advancedSettingsEnabled || appearanceCustomized) && (
                <button
                  className={`theme-switch-btn theme-switch-btn--studio${appearanceCustomized ? " active" : ""}`}
                  type="button"
                  aria-pressed={appearanceCustomized}
                  data-tooltip={
                    appearanceCustomized
                      ? "Custom design active · edit in Appearance Studio (Ctrl+Shift+A)"
                      : "Edit design in Appearance Studio (Ctrl+Shift+A)"
                  }
                  aria-keyshortcuts="Control+Shift+A Meta+Shift+A"
                  onClick={onCustomizeAppearance}
                >
                  <StudioIcon />
                  STUDIO
                </button>
              )}
            </div>
          </div>

          <div className="theme-switch-row" data-guide-target="settings-source">
            <span className="theme-switch-label">DOWNLOAD SOURCE</span>
            <div className="theme-switch">
              {MIRROR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`theme-switch-btn${mirrorMode === option.value ? " active" : ""}`}
                  type="button"
                  onClick={() => commitMirrorMode(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="theme-switch-row" data-guide-target="settings-auto-java">
            <span className="theme-switch-label">AUTO-DOWNLOAD JAVA</span>
            <div className="theme-switch">
              <button
                className={`theme-switch-btn${autoDownloadJava ? " active" : ""}`}
                type="button"
                onClick={() => !autoDownloadJava && void saveAutoDownloadJava(true)}
              >
                <JavaIcon />
                ON
              </button>
              <button
                className={`theme-switch-btn${!autoDownloadJava ? " active" : ""}`}
                type="button"
                onClick={() => autoDownloadJava && void saveAutoDownloadJava(false)}
              >
                OFF
              </button>
            </div>
          </div>

          <div className="theme-switch-row" data-guide-target="settings-language">
            <span className="theme-switch-label">LANGUAGE</span>
            <div className="theme-switch">
              <button className="theme-switch-btn active" type="button">
                <FlagRuIcon />
                RU
              </button>
              <button className="theme-switch-btn" type="button">
                <FlagUsIcon />
                EN
              </button>
            </div>
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
