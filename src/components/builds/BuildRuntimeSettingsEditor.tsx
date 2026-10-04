import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { ElementSlider } from "../inputs/ElementSlider";
import { CustomNumberInput } from "../inputs/CustomNumberInput";
import { JavaArgsEditor, type JavaArgsTextEditRequest } from "../inputs/JavaArgsEditor";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { clampRamToSystem, getMinecraftRamMax, getRamSliderTicks } from "../../utils/ram";
import { getDefaultJavaArgsText } from "../../utils/javaArgs";
import { toErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import {
  createPlaceholderAppearanceAttributes,
  createPlaceholderValueAttributes,
} from "../../utils/placeholders";
import { getTextSearchMatches, replaceAllTextSearchMatches } from "../../utils/textSearch";
import { invoke } from "@tauri-apps/api/core";
import type { BuildRuntimeSettingsDraft, JavaInstallation } from "../../types";

const JAVA_ARGS_EXPORT_KIND = "screen.java-args";

type JavaArgsExportData = {
  schemaVersion?: number;
  kind?: string;
  ram?: number;
  javaArgs?: string | null;
  args?: string[] | string;
};

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function readImportedJavaArgs(raw: string) {
  try {
    const data = JSON.parse(raw) as JavaArgsExportData;

    if (typeof data.javaArgs === "string") return data.javaArgs;
    if (typeof data.args === "string") return data.args;
    if (Array.isArray(data.args)) return data.args.join("\n");
  } catch {
    return raw.trimStart().startsWith("{") ? null : raw;
  }

  return null;
}

type Props = {
  systemRamGb: number;
  optimizedJavaArgs: boolean;
  draft: BuildRuntimeSettingsDraft;
  resolvePreviewText: (template: string) => string;
  onDraftChange: Dispatch<SetStateAction<BuildRuntimeSettingsDraft>>;
  onOpenLogs?: () => void;
};

export function BuildRuntimeSettingsEditor({
  systemRamGb,
  optimizedJavaArgs,
  draft,
  resolvePreviewText,
  onDraftChange,
  onOpenLogs,
}: Props) {
  const [argsSearchQuery, setArgsSearchQuery] = useState("");
  const [argsReplaceValue, setArgsReplaceValue] = useState("");
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [textEditRequest, setTextEditRequest] = useState<JavaArgsTextEditRequest | null>(null);
  const [argsImportError, setArgsImportError] = useState("");
  const [javaList, setJavaList] = useState<JavaInstallation[]>([]);
  const [javaScanning, setJavaScanning] = useState(false);
  const [javaScanError, setJavaScanError] = useState("");
  const [javaScanned, setJavaScanned] = useState(false);
  const importArgsInputRef = useRef<HTMLInputElement>(null);
  const textEditRequestId = useRef(0);
  const minecraftRamMax = getMinecraftRamMax(systemRamGb);
  const ramSliderTicks = getRamSliderTicks(systemRamGb);
  const argsSearchMatches = useMemo(
    () => getTextSearchMatches(draft.javaArgs, argsSearchQuery),
    [argsSearchQuery, draft.javaArgs],
  );
  const activeSearchIndex =
    argsSearchMatches.length > 0
      ? Math.min(activeSearchMatchIndex, argsSearchMatches.length - 1)
      : -1;
  const activeSearchMatch = activeSearchIndex >= 0 ? argsSearchMatches[activeSearchIndex] : null;

  useEffect(() => {
    setActiveSearchMatchIndex(0);
  }, [argsSearchQuery]);

  useEffect(() => {
    setActiveSearchMatchIndex((prev) =>
      argsSearchMatches.length > 0 ? Math.min(prev, argsSearchMatches.length - 1) : 0,
    );
  }, [argsSearchMatches.length]);

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
    onDraftChange((prev) => ({
      ...prev,
      javaArgs: value,
    }));
  };

  const setJavaPath = (value: string) => {
    onDraftChange((prev) => ({ ...prev, javaPath: value }));
  };

  const scanJavaInstallations = async () => {
    if (javaScanning) return;

    try {
      setJavaScanning(true);
      setJavaScanError("");
      const result = await invoke<JavaInstallation[]>("scan_java_installations");
      setJavaList(result);
      setJavaScanned(true);
    } catch (error) {
      logger.error(error);
      setJavaScanError(toErrorMessage(error));
    } finally {
      setJavaScanning(false);
    }
  };

  const requestTextEdit = (start: number, end: number, replacement: string) => {
    textEditRequestId.current += 1;
    setTextEditRequest({
      id: textEditRequestId.current,
      start,
      end,
      replacement,
    });
  };

  const moveSearchMatch = (direction: -1 | 1) => {
    if (argsSearchMatches.length === 0) return;

    setActiveSearchMatchIndex((prev) => {
      const normalizedPrev = Math.min(prev, argsSearchMatches.length - 1);
      return (normalizedPrev + direction + argsSearchMatches.length) % argsSearchMatches.length;
    });
    setSearchFocusToken((prev) => prev + 1);
  };

  const replaceCurrentSearchMatch = () => {
    if (!activeSearchMatch) return;

    requestTextEdit(activeSearchMatch.start, activeSearchMatch.end, argsReplaceValue);
  };

  const replaceAllSearchMatches = () => {
    if (argsSearchMatches.length === 0) return;

    const normalizedArgs = normalizeNewlines(draft.javaArgs);
    const nextArgs = replaceAllTextSearchMatches(normalizedArgs, argsSearchQuery, argsReplaceValue);
    if (nextArgs === normalizedArgs) return;

    requestTextEdit(0, normalizedArgs.length, nextArgs);
    setActiveSearchMatchIndex(0);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    moveSearchMatch(event.shiftKey ? -1 : 1);
  };

  const handleReplaceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    if (event.shiftKey) {
      replaceAllSearchMatches();
      return;
    }

    replaceCurrentSearchMatch();
  };

  const exportJavaArgs = () => {
    const out = {
      schemaVersion: 1,
      kind: JAVA_ARGS_EXPORT_KIND,
      ram: draft.ram,
      javaArgs: normalizeNewlines(draft.javaArgs),
    };
    const json = JSON.stringify(out, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "java-args.slargs";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importJavaArgs = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (readerEvent) => {
      const raw = String(readerEvent.target?.result ?? "");
      const importedArgs = readImportedJavaArgs(raw);

      if (importedArgs === null) {
        setArgsImportError("IMPORT ERROR");
        return;
      }

      updateJavaArgs(normalizeNewlines(importedArgs));
      setArgsImportError("");
    };
    reader.onerror = () => setArgsImportError("IMPORT ERROR");
    reader.readAsText(file);
  };

  return (
    <div className="brs-editor" {...createPlaceholderValueAttributes(resolvePreviewText)}>
      <div className="brs-layout">
        <div className="brs-args-panel">
          <div className="brs-panel-head">
            <div className="brs-panel-title">
              <span className="brs-panel-kicker">JVM</span>
              <strong>JAVA ARGUMENTS</strong>
            </div>
            <div className="brs-args-actions">
              <button
                className="brs-icon-action"
                type="button"
                data-tooltip="Export arguments"
                aria-label="Export arguments"
                onClick={exportJavaArgs}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M7 3.5L9.5 6M7 3.5L4.5 6M7 3.5V9.5M2.5 11.5h9"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                className="brs-icon-action"
                type="button"
                data-tooltip="Import arguments"
                aria-label="Import arguments"
                onClick={() => importArgsInputRef.current?.click()}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M7 10.5L9.5 8M7 10.5L4.5 8M7 10.5V4.5M2.5 2.5h9"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <input
                ref={importArgsInputRef}
                type="file"
                accept=".slargs,.slbuild,.json,.txt"
                style={{ display: "none" }}
                onChange={importJavaArgs}
              />
            </div>
          </div>
          <div className="brs-args-toolbar">
            <div className="brs-find-row">
              <label className="brs-search-field">
                <span>SEARCH</span>
                <input
                  value={argsSearchQuery}
                  placeholder="G1, gc, heap"
                  onChange={(event) => setArgsSearchQuery(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
              </label>
              <div className="brs-find-controls">
                {argsSearchQuery.trim() && (
                  <span className="brs-search-count">
                    {argsSearchMatches.length > 0
                      ? `${activeSearchIndex + 1}/${argsSearchMatches.length}`
                      : "NO MATCH"}
                  </span>
                )}
                <button
                  className="brs-icon-action brs-find-action"
                  type="button"
                  data-tooltip="Previous match"
                  aria-label="Previous match"
                  disabled={argsSearchMatches.length === 0}
                  onClick={() => moveSearchMatch(-1)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M7 4L3.75 7.25M7 4l3.25 3.25M7 4v6.5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  className="brs-icon-action brs-find-action"
                  type="button"
                  data-tooltip="Next match"
                  aria-label="Next match"
                  disabled={argsSearchMatches.length === 0}
                  onClick={() => moveSearchMatch(1)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M7 10L3.75 6.75M7 10l3.25-3.25M7 10V3.5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="brs-replace-row">
              <label className="brs-search-field">
                <span>REPLACE</span>
                <input
                  value={argsReplaceValue}
                  placeholder="new value"
                  onChange={(event) => setArgsReplaceValue(event.target.value)}
                  onKeyDown={handleReplaceKeyDown}
                />
              </label>
              <button
                className="brs-compact-action"
                type="button"
                disabled={argsSearchMatches.length === 0}
                onClick={replaceCurrentSearchMatch}
              >
                REPLACE
              </button>
              <button
                className="brs-compact-action"
                type="button"
                disabled={argsSearchMatches.length === 0}
                onClick={replaceAllSearchMatches}
              >
                ALL
              </button>
            </div>
            {argsImportError && <span className="brs-args-status">{argsImportError}</span>}
          </div>
          <JavaArgsEditor
            className="brs-args-editor"
            value={draft.javaArgs}
            onChange={updateJavaArgs}
            searchQuery={argsSearchQuery}
            activeSearchMatchIndex={activeSearchIndex}
            searchFocusToken={searchFocusToken}
            textEditRequest={textEditRequest}
          />
        </div>

        <CustomScrollArea className="brs-controls-scroll" style={{ minHeight: 0 }}>
          <div className="brs-controls">
            {onOpenLogs && (
              <section className="brs-section brs-logs-section">
                <div className="brs-section-head">
                  <span>LOGS</span>
                  <strong>MINECRAFT</strong>
                </div>
                <button className="brs-wide-action" type="button" onClick={onOpenLogs}>
                  OPEN LOG WINDOW
                </button>
              </section>
            )}

            <section className="brs-section">
              <div className="brs-section-head">
                <span>MEMORY</span>
                <strong
                  {...createPlaceholderAppearanceAttributes("%build_ram%", resolvePreviewText)}
                >
                  {resolvePreviewText("%build_ram%")}
                </strong>
              </div>
              <div className="brs-slider">
                <ElementSlider
                  label="RAM"
                  showHeader={false}
                  min={1}
                  max={minecraftRamMax}
                  defaultValue={4}
                  appearanceConstraint="system-ram"
                  appearanceSystemMax={minecraftRamMax}
                  step={1}
                  value={draft.ram}
                  tickMode="custom"
                  customTicks={ramSliderTicks}
                  onChange={updateRam}
                />
              </div>
            </section>

            <section className="brs-section">
              <div className="brs-section-head">
                <span>JAVA PATH</span>
                <div className="brs-java-actions">
                  {draft.javaPath.trim() && (
                    <button
                      className="brs-compact-action"
                      type="button"
                      data-tooltip="Use the launcher-managed Java"
                      onClick={() => setJavaPath("")}
                    >
                      AUTO
                    </button>
                  )}
                  <button
                    className="brs-compact-action"
                    type="button"
                    disabled={javaScanning}
                    onClick={() => void scanJavaInstallations()}
                  >
                    {javaScanning ? "SCANNING..." : "AUTO-SCAN"}
                  </button>
                </div>
              </div>

              <label className="brs-field">
                <input
                  value={draft.javaPath}
                  placeholder="AUTO (managed runtime) — or type a javaw.exe path"
                  onChange={(event) => setJavaPath(event.target.value)}
                />
              </label>

              {javaScanError && <span className="brs-args-status">{javaScanError}</span>}
              {javaScanned && javaList.length === 0 && !javaScanError && (
                <span className="brs-args-status">NO JAVA FOUND</span>
              )}

              {javaList.length > 0 && (
                <div className="brs-java-list">
                  {javaList.map((java) => {
                    const active = draft.javaPath.trim().toLowerCase() === java.path.toLowerCase();
                    return (
                      <button
                        key={java.path}
                        type="button"
                        className={`brs-java-item ${active ? "brs-java-item--active" : ""}`}
                        onClick={() => setJavaPath(java.path)}
                      >
                        <span className="brs-java-item-head">
                          <strong>
                            {java.vendor} · {java.version}
                          </strong>
                          {java.major > 0 && <em>JAVA {java.major}</em>}
                        </span>
                        <span className="brs-java-item-path">{java.path}</span>
                      </button>
                    );
                  })}
                </div>
              )}
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
                onClick={() => onDraftChange((prev) => ({ ...prev, fullscreen: !prev.fullscreen }))}
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
