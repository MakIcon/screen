import { ElementSlider } from "../components/inputs/ElementSlider";
import { ElementToggle } from "../components/inputs/ElementToggle";
import { clampRamToSystem } from "../utils/ram";

interface SettingsTabProps {
  systemRamGb: number;
  settingsRamDraft: number;
  setSettingsRamDraft: (v: number) => void;
  saveSettingsRam: () => Promise<void>;
  wheelTabSwitching: boolean;
  setWheelTabSwitching: (fn: (prev: boolean) => boolean) => void;
  showSnapshots: boolean;
  setShowSnapshots: (fn: (prev: boolean) => boolean) => void;
  showPreReleases: boolean;
  setShowPreReleases: (fn: (prev: boolean) => boolean) => void;
  advancedSettingsEnabled: boolean;
  onToggleAdvanced: () => void;
  resolve: (template: string) => string;
  manifestLoading: boolean;
  manifest: object | null;
}

export function SettingsTab({
  systemRamGb,
  settingsRamDraft,
  setSettingsRamDraft,
  saveSettingsRam,
  wheelTabSwitching,
  setWheelTabSwitching,
  showSnapshots,
  setShowSnapshots,
  showPreReleases,
  setShowPreReleases,
  advancedSettingsEnabled,
  onToggleAdvanced,
  resolve,
  manifestLoading,
  manifest,
}: SettingsTabProps) {
  return (
    <section className="launcher-panel">
      <div className="panel-grid simple-two-col-fixed">
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
                max={systemRamGb}
                step={1}
                value={settingsRamDraft}
                tickMode="custom"
                customTicks={Array.from(
                  new Set([1, Math.max(1, Math.floor(systemRamGb / 3)), Math.max(1, Math.floor((systemRamGb / 3) * 2)), systemRamGb])
                ).sort((a, b) => a - b)}
                onChange={(value) => {
                  setSettingsRamDraft(clampRamToSystem(value, systemRamGb));
                }}
                onCommit={() => void saveSettingsRam()}
              />
            </div>
          </div>

          <div className="settings-toggle-block">
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

          <div className="form-grid single-form-grid">
            <label className="field">
              <span>JAVA PATH</span>
              <input value="JAVA_HOME or PATH" readOnly />
            </label>
          </div>
        </div>

        <div className="panel-card">
          <span className="panel-label">RUNTIME</span>
          <div className="stat-list">
            <div className="stat-row">
              <span>WINDOW ENGINE</span>
              <strong>TAURI</strong>
            </div>
            <div className="stat-row">
              <span>CORE</span>
              <strong>RUST</strong>
            </div>
            <div className="stat-row">
              <span>FRONTEND</span>
              <strong>REACT</strong>
            </div>
            <div className="stat-row">
              <span>ACCOUNT</span>
              <strong>{resolve("%account_type%")}</strong>
            </div>
            <div className="stat-row">
              <span>SYSTEM RAM</span>
              <strong>{resolve("%system_ram_max%")}</strong>
            </div>
            <div className="stat-row">
              <span>DEFAULT BUILD RAM</span>
              <strong>{settingsRamDraft} GB</strong>
            </div>
            <div className="stat-row">
              <span>SNAPSHOTS</span>
              <strong>{showSnapshots ? "ON" : "OFF"}</strong>
            </div>
            <div className="stat-row">
              <span>PRE-RELEASES</span>
              <strong>{showPreReleases ? "ON" : "OFF"}</strong>
            </div>
            <div className="stat-row">
              <span>ADVANCED SETTINGS</span>
              <strong>{advancedSettingsEnabled ? "ON" : "OFF"}</strong>
            </div>
            <div className="stat-row">
              <span>MANIFEST</span>
              <strong>{manifestLoading ? "LOADING" : manifest ? "READY" : "ERROR"}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
