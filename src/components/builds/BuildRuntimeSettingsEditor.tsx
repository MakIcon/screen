import { useEffect, useRef } from "react";
import type {
  Dispatch,
  FormEvent,
  KeyboardEvent,
  SetStateAction,
} from "react";
import { ElementSlider } from "../inputs/ElementSlider";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { clampRamToSystem, getMinecraftRamMax, getRamSliderTicks } from "../../utils/ram";
import {
  getDefaultJavaArgsText,
  getRamFromJavaArgsText,
  normalizeWindowDimension,
} from "../../utils/javaArgs";
import type { BuildRuntimeSettingsDraft } from "../../types";

type Props = {
  systemRamGb: number;
  optimizedJavaArgs: boolean;
  draft: BuildRuntimeSettingsDraft;
  onDraftChange: Dispatch<SetStateAction<BuildRuntimeSettingsDraft>>;
};

type JavaArgsLineEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

function toLines(value: string) {
  const lines = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return lines.length > 0 ? lines : [""];
}

function JavaArgsLineEditor({ value, onChange }: JavaArgsLineEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;

    const nextText = toLines(value).join("\n");
    if (editor.textContent !== nextText) {
      editor.textContent = nextText;
    }
  }, [value]);

  const selectAll = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) return;

    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleInput = (event: FormEvent<HTMLDivElement>) => {
    onChange((event.currentTarget.textContent ?? "").replace(/\r/g, ""));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll();
    }
  };

  return (
    <CustomScrollArea className="brs-args-scroll" style={{ minHeight: 0 }}>
      <div
        ref={editorRef}
        className="brs-args-editor"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-label="Java arguments"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
      />
    </CustomScrollArea>
  );
}

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
          <JavaArgsLineEditor value={draft.javaArgs} onChange={updateJavaArgs} />
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
                  <input
                    type="number"
                    min={320}
                    max={7680}
                    value={draft.windowWidth}
                    onChange={(event) =>
                      onDraftChange((prev) => ({
                        ...prev,
                        windowWidth: normalizeWindowDimension(
                          Number(event.target.value),
                          prev.windowWidth,
                        ),
                      }))
                    }
                  />
                </label>

                <label className="brs-field">
                  <span>HEIGHT</span>
                  <input
                    type="number"
                    min={240}
                    max={4320}
                    value={draft.windowHeight}
                    onChange={(event) =>
                      onDraftChange((prev) => ({
                        ...prev,
                        windowHeight: normalizeWindowDimension(
                          Number(event.target.value),
                          prev.windowHeight,
                          240,
                          4320,
                        ),
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
