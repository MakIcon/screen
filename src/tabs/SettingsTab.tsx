import { useState } from "react";
import { ElementSlider } from "../components/inputs/ElementSlider";
import { ElementToggle } from "../components/inputs/ElementToggle";
import { LauncherPluginsModal } from "../components/plugins/LauncherPluginsModal";
import { PluginIcon } from "../components/plugins/PluginIcon";
import {
  PLUGIN_DEFINITIONS,
  normalizeLauncherPluginsSettings,
} from "../components/plugins/pluginRegistry";
import { clampRamToSystem, getMinecraftRamMax, getRamSliderTicks } from "../utils/ram";
import type { Theme } from "../hooks/useTheme";
import type {
  LauncherPluginsSettings,
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
    <circle cx="5.5" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.2"/>
    <line x1="5.5" y1="0" x2="5.5" y2="1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="5.5" y1="9.5" x2="5.5" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="0" y1="5.5" x2="1.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="9.5" y1="5.5" x2="11" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="1.6" y1="1.6" x2="2.65" y2="2.65" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="8.35" y1="8.35" x2="9.4" y2="9.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="1.6" y1="9.4" x2="2.65" y2="8.35" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="8.35" y1="2.65" x2="9.4" y2="1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M9.5 7A4.5 4.5 0 0 1 4 1.5a4.5 4.5 0 1 0 5.5 5.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);

const VoidIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <circle cx="5.5" cy="5.5" r="3.5" fill="currentColor"/>
  </svg>
);

interface SettingsTabProps {
  systemRamGb: number;
  settingsRamDraft: number;
  setSettingsRamDraft: (v: number) => void;
  saveSettingsRam: () => Promise<void>;
  optimizedJavaArgs: boolean;
  saveOptimizedJavaArgs: (enabled: boolean) => Promise<void>;
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
}

export function SettingsTab({
  systemRamGb,
  settingsRamDraft,
  setSettingsRamDraft,
  saveSettingsRam,
  optimizedJavaArgs,
  saveOptimizedJavaArgs,
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
}: SettingsTabProps) {
  const minecraftRamMax = getMinecraftRamMax(systemRamGb);
  const ramSliderTicks = getRamSliderTicks(systemRamGb);
  const [pluginsModalOpen, setPluginsModalOpen] = useState(false);

  const commitMirrorMode = (mode: MirrorMode) => {
    if (mode === mirrorMode) return;
    void saveNetworkSettings(mode).catch(() => {});
  };

  const normalizedPlugins = normalizeLauncherPluginsSettings(pluginsSettings);
  const activePluginDefinitions = PLUGIN_DEFINITIONS.filter((definition) =>
    definition.getEnabled(normalizedPlugins),
  );

  return (
    <section className="launcher-panel">
      <div className="panel-grid simple-two-col-fixed settings-panel-grid">
        <div className="panel-card">
          <span className="panel-label">LAUNCHER SETTINGS</span>

          <div className="settings-memory-block">
            <div className="memory-readout">
              <span className="memory-number">{settingsRamDraft}</span>
              <span className="memory-unit">GB</span>
            </div>

            <div className="settings-element-slider">
              <ElementSlider
                showHeader={false}
                min={1}
                max={minecraftRamMax}
                step={1}
                value={settingsRamDraft}
                tickMode="custom"
                customTicks={ramSliderTicks}
                onChange={(value) => {
                  setSettingsRamDraft(clampRamToSystem(value, systemRamGb));
                }}
                onCommit={() => void saveSettingsRam()}
              />
            </div>
          </div>

          <div className="theme-switch-row">
            <span className="theme-switch-label">APPEARANCE</span>
            <div className="theme-switch">
              <button
                className={`theme-switch-btn${theme === "light" ? " active" : ""}`}
                type="button"
                onClick={() => theme !== "light" && setTheme("light")}
              >
                <SunIcon />
                LIGHT
              </button>
              <button
                className={`theme-switch-btn${theme === "dark" ? " active" : ""}`}
                type="button"
                onClick={() => theme !== "dark" && setTheme("dark")}
              >
                <MoonIcon />
                DARK
              </button>
              <button
                className={`theme-switch-btn${theme === "void" ? " active" : ""}`}
                type="button"
                onClick={() => theme !== "void" && setTheme("void")}
              >
                <VoidIcon />
                VOID
              </button>
            </div>
          </div>

          <div className="theme-switch-row">
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

        </div>

        <div className="panel-card">
          <span className="panel-label">PREFERENCES</span>

          <div className="settings-toggle-block settings-toggle-block--bare">
            <ElementToggle
              title="OPTIMIZED JAVA ARGUMENTS"
              note="Запуск с G1GC-настройками и фиксированным heap. Выключи для классического запуска."
              enabled={optimizedJavaArgs}
              onToggle={() => void saveOptimizedJavaArgs(!optimizedJavaArgs)}
            />

            <ElementToggle
              title="WHEEL TAB SWITCHING"
              note="Переключение вкладок движением колеса мыши."
              enabled={wheelTabSwitching}
              onToggle={() => setWheelTabSwitching((prev) => !prev)}
            />

            <ElementToggle
              title="SHOW SNAPSHOTS"
              note="Показывать snapshot версии в списке доступных установок."
              enabled={showSnapshots}
              onToggle={() => setShowSnapshots((prev) => !prev)}
            />

            <ElementToggle
              title="SHOW PRE-RELEASES"
              note="Показывать pre-release и release candidate версии."
              enabled={showPreReleases}
              onToggle={() => setShowPreReleases((prev) => !prev)}
            />

            <ElementToggle
              title="ADVANCED SETTINGS"
              note="Включает кнопку SETTINGS у сборок и в режиме создания для кастомного фона карточки версии."
              enabled={advancedSettingsEnabled}
              onToggle={onToggleAdvanced}
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
