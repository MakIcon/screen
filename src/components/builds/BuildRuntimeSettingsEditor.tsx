import type { Dispatch, SetStateAction } from "react";
import { ElementSlider } from "../inputs/ElementSlider";
import { CustomNumberInput } from "../inputs/CustomNumberInput";
import { JavaArgsEditor } from "../inputs/JavaArgsEditor";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { clampRamToSystem, getMinecraftRamMax, getRamSliderTicks } from "../../utils/ram";
import {
  getDefaultJavaArgsText,
  getRamFromJavaArgsText,
} from "../../utils/javaArgs";
import type { BuildRuntimeSettingsDraft } from "../../types";

type Props = {
  systemRamGb: number;
  optimizedJavaArgs: boolean;
  draft: BuildRuntimeSettingsDraft;
  onDraftChange: Dispatch<SetStateAction<BuildRuntimeSettingsDraft>>;
};

export function BuildRuntimeSettingsEditor({
  systemRamGb,
  optimizedJavaArgs,
  draft,
  onDraftChange,
}: Props) {
  const minecraftRamMax = getMinecraftRamMax(systemRamGb);
  const ramSliderTicks = getRamSliderTicks(systemRamGb);

  const updateRam = (value: number) => {
    onDraftChange((prev) => {
      const nextRam = clampRamToSystem(value, systemRamGb);
      const prevDefaultArgs = getDefaultJavaArgsText(prev.ram, optimizedJavaArgs);
      const nextDefaultArgs = getDefaultJavaArgsText(nextRam, optimizedJavaArgs);
      const shouldRefreshArgs = prev.javaArgs.trim() === prevDefaultArgs.trim();

      return {
        ...prev,
        ram: nextRam,
        javaArgs: shouldRefreshArgs ? nextDefaultArgs : prev.javaArgs,
      };
    });
  };

  const updateJavaArgs = (value: string) => {
    onDraftChange((prev) => {
      const ramFromArgs = getRamFromJavaArgsText(value);

      return {
        ...prev,
        javaArgs: value,
        ram:
          ramFromArgs !== null
            ? clampRamToSystem(ramFromArgs, systemRamGb)
            : prev.ram,
      };
    });
  };

  return (
    <div className="brs-editor">
      <div className="brs-layout">
        <div className="brs-args-panel">
          <div className="brs-panel-head">
            <span className="brs-panel-kicker">JVM</span>
            <strong>JAVA ARGUMENTS</strong>
          </div>
          <JavaArgsEditor
            className="brs-args-editor"
            value={draft.javaArgs}
            onChange={updateJavaArgs}
          />
        </div>

        <CustomScrollArea className="brs-controls-scroll" style={{ minHeight: 0 }}>
          <div className="brs-controls">
            <section className="brs-section">
              <div className="brs-section-head">
                <span>MEMORY</span>
                <strong>{draft.ram} GB</strong>
              </div>
              <div className="brs-slider">
                <ElementSlider
                  showHeader={false}
                  min={1}
                  max={minecraftRamMax}
                  step={1}
                  value={draft.ram}
                  tickMode="custom"
                  customTicks={ramSliderTicks}
                  onChange={updateRam}
                />
              </div>
            </section>

            <section className="brs-section">
              <label className="brs-field">
                <span>JAVA PATH</span>
                <input
                  value={draft.javaPath}
                  placeholder="AUTO"
                  onChange={(event) =>
                    onDraftChange((prev) => ({ ...prev, javaPath: event.target.value }))
                  }
                />
              </label>
            </section>

            <section className="brs-section">
              <div className="brs-section-head">
                <span>WINDOW</span>
                <strong>{draft.fullscreen ? "FULLSCREEN" : "WINDOWED"}</strong>
              </div>

              <div className="brs-window-grid">
                <label className="brs-field">
                  <span>WIDTH</span>
                  <CustomNumberInput
                    min={320}
                    max={7680}
                    step={1}
                    value={draft.windowWidth}
                    showArrows
                    ariaLabel="Window width"
                    onChange={(value) =>
                      onDraftChange((prev) => ({
                        ...prev,
                        windowWidth: value,
                      }))
                    }
                  />
                </label>

                <label className="brs-field">
                  <span>HEIGHT</span>
                  <CustomNumberInput
                    min={240}
                    max={4320}
                    step={1}
                    value={draft.windowHeight}
                    showArrows
                    ariaLabel="Window height"
                    onChange={(value) =>
                      onDraftChange((prev) => ({
                        ...prev,
                        windowHeight: value,
                      }))
                    }
                  />
                </label>
              </div>

              <button
                type="button"
                className="brs-toggle-row"
                onClick={() =>
                  onDraftChange((prev) => ({ ...prev, fullscreen: !prev.fullscreen }))
                }
              >
                <span>FULLSCREEN</span>
                <span className={`toggle-switch ${draft.fullscreen ? "enabled" : ""}`}>
                  <span className="toggle-knob" />
                </span>
              </button>
            </section>
          </div>
        </CustomScrollArea>
      </div>
    </div>
  );
}
