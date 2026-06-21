import type { CSSProperties } from "react";
import { CustomScrollArea } from "../components/layout/CustomScrollArea";
import { InlineDropdown } from "../components/inputs/InlineDropdown";
import {
  SettingsGearIcon,
  getBuildCardAppearanceStyle,
  getBuildCardBadgeStyle,
  getBuildCardBadgeText,
  getBuildCardBadgeVisibility,
  shouldShowBuildCardBadge,
  type BuildCardAppearance,
  type BuildCardContentTag,
  type BuildCardPreviewSize,
} from "../components/builds/BuildCardSettingsPopup";
import { BuildCardContentView } from "../components/builds/BuildCardContentView";
import { InfoPanel } from "../components/display/InfoPanel";
import { LOADER_OPTIONS } from "../constants/tabs";
import { formatLastPlayed, formatPlaytime } from "../utils/playtime";
import type {
  DropdownKey,
  InstanceItem,
  InstallProgressPayload,
  LoaderType,
} from "../types";
import type { PlaceholderTarget } from "../hooks/usePlaceholders";

interface InstancesTabProps {
  // Instance list
  instances: InstanceItem[];
  selectedInstance: InstanceItem | null;
  selectedInstanceId: string;
  setSelectedInstanceId: (id: string) => void;
  instanceCardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
  createCardMeasureRef: React.MutableRefObject<HTMLDivElement | null>;

  // Create build form
  createMode: boolean;
  setCreateMode: (v: boolean) => void;
  createBuildName: string;
  setCreateBuildName: (v: string) => void;
  createVersion: string;
  setCreateVersion: (v: string) => void;
  createLoader: LoaderType;
  setCreateLoader: (v: LoaderType) => void;
  loaderVersions: string[];
  loaderVersionsLoading: boolean;
  createLoaderVersion: string;
  setCreateLoaderVersion: (v: string) => void;
  createError: string;
  setCreateError: (v: string) => void;

  // System
  minecraftVersions: string[];

  // UI state
  openDropdown: DropdownKey;
  setOpenDropdown: (key: DropdownKey) => void;
  working: boolean;
  busyMessage: string;
  actionError: string;
  installProgress: InstallProgressPayload | null;
  dragOverInstanceId: string | null;
  dragContentActive: boolean;
  advancedSettingsEnabled: boolean;

  // Build card appearance
  getBuildCardAppearance: (id: string | null | undefined) => BuildCardAppearance;
  buildCardSettingsOpen: boolean;
  buildSettingsTargetId: string | null;
  buildCardSettingsDraft: BuildCardAppearance;
  buildCardPreviewSize: BuildCardPreviewSize | null;
  buildCardPreviewTarget: PlaceholderTarget;
  createPreviewName: string;
  createPreviewVersion: string;
  createPreviewLoader: string;
  createPreviewRam: number;
  createMeasureAppearance: BuildCardAppearance;
  resolveBuildCardContentTags: (
    appearance: BuildCardAppearance,
    target: PlaceholderTarget,
    overrides?: { accountType?: string; buildState?: string },
  ) => BuildCardContentTag[];
  resolveForTarget: (
    template: string,
    target: PlaceholderTarget,
    overrides?: { accountType?: string; buildState?: string },
  ) => string;

  // Handlers
  isRunning: (id: string) => boolean;
  handleCreateBuild: () => Promise<void>;
  handleInstallSelected: () => Promise<void>;
  handleLaunchSelected: () => Promise<void>;
  handleKillGame: (id: string) => Promise<void>;
  handleDeleteInstance: (id: string) => void;
  handleExportInstance: (id: string) => void;
  handleImportBuild: () => void;
  handleOpenFolder: () => Promise<void>;
  setStatsInstanceId: (id: string | null) => void;
  setScreenshotsInstanceId: (id: string | null) => void;
  openBuildCardSettings: (targetId?: string | null) => void;
}

export function InstancesTab({
  instances,
  selectedInstance,
  selectedInstanceId,
  setSelectedInstanceId,
  instanceCardRefs,
  createCardMeasureRef,
  createMode,
  setCreateMode,
  createBuildName,
  setCreateBuildName,
  createVersion,
  setCreateVersion,
  createLoader,
  setCreateLoader,
  loaderVersions,
  loaderVersionsLoading,
  createLoaderVersion,
  setCreateLoaderVersion,
  createError,
  setCreateError,
  minecraftVersions,
  openDropdown,
  setOpenDropdown,
  working,
  busyMessage,
  actionError,
  installProgress,
  dragOverInstanceId,
  dragContentActive,
  advancedSettingsEnabled,
  getBuildCardAppearance,
  buildCardPreviewTarget,
  createPreviewName,
  createPreviewVersion,
  createPreviewLoader,
  createPreviewRam,
  createMeasureAppearance,
  resolveBuildCardContentTags,
  resolveForTarget,
  isRunning,
  handleCreateBuild,
  handleInstallSelected,
  handleLaunchSelected,
  handleKillGame,
  handleDeleteInstance,
  handleExportInstance,
  handleImportBuild,
  handleOpenFolder,
  setStatsInstanceId,
  setScreenshotsInstanceId,
  openBuildCardSettings,
}: InstancesTabProps) {
  const sortedInstances = [...instances].reverse();
  const showCreator = createMode || instances.length === 0 || !selectedInstance;
  const buildInfoBottomSpace = 8;

  return (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-instances-fixed">
        {/* ── Instance list ── */}
        <div className="panel-card instances-list-card">
          <div className="card-topline">
            <span className="panel-label">INSTANCE LIBRARY</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="ghost-action icon-square-action"
                type="button"
                title="Импортировать сборку из файла"
                onClick={handleImportBuild}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7 9.5L4.5 7M7 9.5L9.5 7M7 9.5V3.5M2.5 11.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                className="ghost-action"
                type="button"
                onClick={() => {
                  setCreateMode(true);
                  setCreateError("");
                }}
              >
                CREATE BUILD
              </button>
            </div>
          </div>

          <CustomScrollArea
            className="instance-stack"
            onWheel={(e: any) => e.stopPropagation()}
            style={{ flex: 1, minHeight: 0 }}
          >
            {/* Hidden measurement card */}
            <div style={{ height: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden="true">
              <div
                ref={createCardMeasureRef}
                className={`instance-card ${createMeasureAppearance.image ? "instance-card-with-image" : ""}`}
                style={getBuildCardAppearanceStyle(createMeasureAppearance)}
              >
                <div className="instance-card-top">
                  <span className="instance-name">{createPreviewName}</span>
                </div>
                <div
                  className={`instance-card-meta ${createMeasureAppearance.contentEnabled ? "instance-card-meta--content" : ""}`}
                >
                  {createMeasureAppearance.contentEnabled ? (
                    <BuildCardContentView
                      mode={createMeasureAppearance.contentMode}
                      align={createMeasureAppearance.contentTextAlign}
                      strokeEnabled={createMeasureAppearance.contentTextStrokeEnabled}
                      tags={resolveBuildCardContentTags(
                        createMeasureAppearance,
                        buildCardPreviewTarget,
                        { buildState: "RUNNING" },
                      )}
                    />
                  ) : (
                    <>
                      <span>{createPreviewVersion}</span>
                      <span>{createPreviewLoader}</span>
                      <span>{createPreviewRam} GB</span>
                      <span>NEVER</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {instances.length === 0 ? (
              <div className="empty-state-box">
                <strong>NO BUILDS YET</strong>
                <p>Создай первую сборку, чтобы начать установку.</p>
              </div>
            ) : (
              sortedInstances.map((instance) => {
                const cardAppearance = getBuildCardAppearance(instance.id);
                const cardStyle: CSSProperties | undefined = getBuildCardAppearanceStyle(cardAppearance);
                const resolvedContentTags = resolveBuildCardContentTags(
                  cardAppearance,
                  instance,
                  { buildState: isRunning(instance.id) ? "RUNNING" : "" },
                );
                const isDropTarget = dragContentActive && dragOverInstanceId === instance.id;

                return (
                  <button
                    key={instance.id}
                    ref={(node) => {
                      if (node) {
                        instanceCardRefs.current.set(instance.id, node);
                      } else {
                        instanceCardRefs.current.delete(instance.id);
                      }
                    }}
                    className={`instance-card ${selectedInstanceId === instance.id ? "selected" : ""} ${cardAppearance.image ? "instance-card-with-image" : ""} ${isDropTarget ? "drag-target" : ""}`}
                    style={cardStyle}
                    onClick={() => {
                      setSelectedInstanceId(instance.id);
                      setCreateMode(false);
                    }}
                    type="button"
                  >
                    {isDropTarget && (
                      <div className="card-drop-overlay">ОТПУСТИ ФАЙЛ</div>
                    )}
                    <div className="instance-card-top">
                      <span className="instance-name">{instance.name}</span>
                      {shouldShowBuildCardBadge(cardAppearance, isRunning(instance.id)) && (
                        <span
                          className="instance-running-badge"
                          style={getBuildCardBadgeStyle(cardAppearance)}
                        >
                          {resolveForTarget(
                            getBuildCardBadgeText(cardAppearance),
                            instance,
                            {
                              buildState:
                                isRunning(instance.id) ||
                                getBuildCardBadgeVisibility(cardAppearance) === "always"
                                  ? "RUNNING"
                                  : "",
                            },
                          )}
                        </span>
                      )}
                    </div>
                    <div
                      className={`instance-card-meta ${cardAppearance.contentEnabled ? "instance-card-meta--content" : ""}`}
                    >
                      {cardAppearance.contentEnabled ? (
                        <BuildCardContentView
                          mode={cardAppearance.contentMode}
                          align={cardAppearance.contentTextAlign}
                          strokeEnabled={cardAppearance.contentTextStrokeEnabled}
                          tags={resolvedContentTags}
                        />
                      ) : (
                        <>
                          <span>{instance.version}</span>
                          <span>{instance.loader}</span>
                          <span>{instance.ram} GB</span>
                          <span>{formatLastPlayed(instance.lastPlayed)}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </CustomScrollArea>
        </div>

        {/* ── Details / Creator panel ── */}
        <div className="instance-details-column">
          <div className="panel-card instance-details-card">
          {showCreator ? (
            <>
              <span className="panel-label">CREATE NEW BUILD</span>
              <div className="form-grid single-form-grid">
                <label className="field">
                  <span>BUILD NAME</span>
                  <input
                    placeholder="My Vanilla Build"
                    value={createBuildName}
                    onChange={(e) => setCreateBuildName(e.target.value)}
                  />
                </label>
              </div>

              <div className="inline-dropdown-grid" style={{ marginTop: 24 }}>
                <InlineDropdown
                  label="MC VERSION"
                  value={createVersion || "SELECT VERSION"}
                  options={minecraftVersions}
                  isOpen={openDropdown === "create-version"}
                  onToggle={() => setOpenDropdown(openDropdown === "create-version" ? null : "create-version")}
                  onSelect={(value) => {
                    setCreateVersion(value);
                    setOpenDropdown(null);
                  }}
                />

                <div className="create-loader-stack">
                  <InlineDropdown
                    label="LOADER"
                    value={createLoader}
                    options={LOADER_OPTIONS}
                    isOpen={openDropdown === "create-loader"}
                    onToggle={() => setOpenDropdown(openDropdown === "create-loader" ? null : "create-loader")}
                    onSelect={(value) => {
                      const nextLoader = value as LoaderType;
                      setCreateLoader(nextLoader);
                      setCreateLoaderVersion("");
                      setOpenDropdown(null);
                    }}
                  />
                </div>
              </div>

              {createLoader !== "Vanilla" ? (
                <div className="detail-grid detail-grid-create" style={{ marginTop: 24 }}>
                  <div className="detail-block create-loader-detail-block">
                    <span className="detail-title">{createLoader.toUpperCase()} LOADER VERSION</span>
                    <InlineDropdown
                      label=""
                      value={
                        loaderVersionsLoading
                          ? "LOADING..."
                          : createLoaderVersion || "SELECT " + createLoader.toUpperCase() + " VERSION"
                      }
                      options={loaderVersions}
                      isOpen={openDropdown === "create-loader-version"}
                      onToggle={() =>
                        setOpenDropdown(openDropdown === "create-loader-version" ? null : "create-loader-version")
                      }
                      onSelect={(value) => {
                        setCreateLoaderVersion(value);
                        setOpenDropdown(null);
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {createError && (
                <p className="panel-text" style={{ color: "var(--accent)" }}>{createError}</p>
              )}

              <div className="instance-actions">
                <button className="primary-action" type="button" onClick={handleCreateBuild} disabled={working}>
                  {working ? "WORKING..." : "CREATE BUILD"}
                </button>
                {instances.length > 0 && (
                  <button className="ghost-action" onClick={() => setCreateMode(false)}>CANCEL</button>
                )}
                {advancedSettingsEnabled && (
                  <button
                    className="ghost-action icon-square-action settings-icon-action"
                    type="button"
                    onClick={() => openBuildCardSettings(null)}
                    title="Build settings"
                  >
                    <SettingsGearIcon />
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="panel-label">BUILD CONFIGURATION</span>

              <div className="inline-dropdown-grid">
                <InlineDropdown
                  label="SELECT BUILD"
                  value={selectedInstance?.name || "NO BUILD"}
                  options={instances.map((i) => i.name)}
                  isOpen={openDropdown === "build"}
                  onToggle={() => setOpenDropdown(openDropdown === "build" ? null : "build")}
                  onSelect={(value) => {
                    const found = instances.find((i) => i.name === value);
                    if (found) {
                      setSelectedInstanceId(found.id);
                    }
                    setOpenDropdown(null);
                  }}
                />

                <InfoPanel
                  label="MC VERSION"
                  value={selectedInstance?.version}
                  placeholder="SELECT VERSION"
                  bottomSpace={buildInfoBottomSpace}
                />

                <InfoPanel
                  label="LOADER"
                  value={selectedInstance?.loaderVersion
                    ? selectedInstance.loader + " " + selectedInstance.loaderVersion
                    : selectedInstance?.loader}
                  placeholder="SELECT LOADER"
                  bottomSpace={buildInfoBottomSpace}
                />

                <InfoPanel label="SOURCE" value="OFFICIAL" bottomSpace={buildInfoBottomSpace} />

                <InfoPanel
                  className="info-panel--right-column"
                  label="TIME IN BUILD"
                  value={formatPlaytime(selectedInstance?.playtimeSecs ?? 0)}
                  placeholder="0 hrs on record"
                  bottomSpace={buildInfoBottomSpace}
                />
              </div>

              <div className="instance-actions instance-actions-build">
                {selectedInstance && isRunning(selectedInstance.id) ? (
                  <button className="primary-action kill-action build-play-action" type="button" onClick={() => handleKillGame(selectedInstance.id)}>
                    <span className="bpa-stack">
                      <span className="bpa-label">✕ KILL GAME</span>
                      <span className="bpa-sizer" aria-hidden="true">✕ KILL GAME</span>
                    </span>
                  </button>
                ) : (
                  <button className="primary-action build-play-action" type="button" onClick={() => handleLaunchSelected()} disabled={working}>
                    <span className="bpa-stack">
                      <span className="bpa-label">{working ? "WORKING..." : "PLAY BUILD"}</span>
                      <span className="bpa-sizer" aria-hidden="true">✕ KILL GAME</span>
                    </span>
                  </button>
                )}
                <button className="ghost-action" type="button" onClick={handleInstallSelected} disabled={working}>INSTALL</button>
                <button className="ghost-action" type="button" onClick={handleOpenFolder}>FOLDER</button>
                <button className="ghost-action" type="button" onClick={() => selectedInstance && setStatsInstanceId(selectedInstance.id)}>STATS</button>
                <div className="instance-side-actions">
                  <button
                    className="ghost-action icon-square-action export-action"
                    type="button"
                    title="Экспортировать сборку"
                    onClick={() => selectedInstance && handleExportInstance(selectedInstance.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M7 3.5L9.5 6M7 3.5L4.5 6M7 3.5V9.5M2.5 11.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {advancedSettingsEnabled && (
                    <button
                      className="ghost-action icon-square-action settings-icon-action"
                      type="button"
                      onClick={() => openBuildCardSettings(selectedInstance?.id ?? null)}
                      title="Build settings"
                    >
                      <SettingsGearIcon />
                    </button>
                  )}
                  <button
                    className="ghost-action icon-square-action screenshots-action"
                    type="button"
                    title="Screenshots"
                    onClick={() => selectedInstance && setScreenshotsInstanceId(selectedInstance.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4.7 3.2l.7-1.1h3.2l.7 1.1h2.2a1 1 0 011 1v6.4a1 1 0 01-1 1h-9a1 1 0 01-1-1V4.2a1 1 0 011-1h2.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      <circle cx="7" cy="7.3" r="2.1" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  </button>
                  <button
                    className="ghost-action icon-square-action trash-action"
                    type="button"
                    title="Удалить сборку"
                    onClick={() => selectedInstance && handleDeleteInstance(selectedInstance.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
          </div>

          {(busyMessage || actionError || installProgress) && (
            <div className="build-status-stack">
              {(busyMessage || actionError) && (
                <div className="status-box">
                  {busyMessage && <p className="panel-text">{busyMessage}</p>}
                  {actionError && <p className="panel-text" style={{ color: "var(--accent)" }}>{actionError}</p>}
                </div>
              )}
              {installProgress && (
                <div className="download-progress-box">
                  <div className="download-progress-head">
                    <span>{installProgress.phase.toUpperCase()}</span>
                    <strong>{Math.round(installProgress.percent)}%</strong>
                  </div>
                  <div className="download-progress-track">
                    <div className="download-progress-fill" style={{ width: `${installProgress.percent}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
