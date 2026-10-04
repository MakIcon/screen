import { useEffect, useMemo, useState, type CSSProperties } from "react";
import pinIconUrl from "../assets/pin.svg";
import { CustomScrollArea } from "../components/layout/CustomScrollArea";
import { InlineDropdown } from "../components/inputs/InlineDropdown";
import {
  SettingsGearIcon,
  getBuildCardAppearanceStyle,
  getBuildCardBadgeStyle,
  getBuildCardBadgeText,
  getBuildCardBadgeVisibility,
  getBuildCardElementStyle,
  hasBuildCardBackgroundImage,
  shouldShowBuildCardBadge,
  type BuildCardAppearance,
  type BuildCardContentTag,
  type BuildCardPreviewSize,
} from "../components/builds/BuildCardSettingsPopup";
import { BuildCardContentView } from "../components/builds/BuildCardContentView";
import { BuildCardVerticalBody } from "../components/builds/BuildCardVerticalBody";
import { BuildConfigurationGrid } from "../components/builds/BuildConfigurationGrid";
import { LOADER_OPTIONS } from "../constants/tabs";
import {
  createPlaceholderAppearanceAttributes,
  createPlaceholderValueAttributes,
} from "../utils/placeholders";
import type { DropdownKey, InstanceItem, InstallProgressPayload, LoaderType } from "../types";
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
  failedBuildAction: { id: string; action: "install" | "launch" } | null;
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
  handleStopGame: (id: string) => Promise<void>;
  handleDeleteInstance: (id: string) => void;
  handleExportInstance: (id: string) => void;
  handleImportBuild: () => void;
  onOpenTrash: () => void;
  onOpenWorldBackups: (id: string) => void;
  handleOpenFolder: () => Promise<void>;
  handleRenameInstance: (id: string, name: string) => Promise<boolean>;
  handleTogglePin: (id: string, pinned: boolean) => Promise<boolean>;
  setStatsInstanceId: (id: string | null) => void;
  setScreenshotsInstanceId: (id: string | null) => void;
  openBuildCardSettings: (targetId?: string | null) => void;
}

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <span
      className={`pin-icon ${className}`.trim()}
      style={{ "--pin-icon-url": `url("${pinIconUrl}")` } as CSSProperties}
      aria-hidden="true"
    />
  );
}

function RenameIcon() {
  return <span className="build-rename-icon" aria-hidden="true" />;
}

function ConfirmIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m2.8 8.2 3.2 3.2 7.2-7.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="m3 3 9 9M12 3l-9 9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
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
  failedBuildAction,
  installProgress,
  dragOverInstanceId,
  dragContentActive,
  advancedSettingsEnabled,
  getBuildCardAppearance,
  buildCardPreviewTarget,
  createPreviewName,
  createMeasureAppearance,
  resolveBuildCardContentTags,
  resolveForTarget,
  isRunning,
  handleCreateBuild,
  handleInstallSelected,
  handleLaunchSelected,
  handleStopGame,
  handleDeleteInstance,
  handleExportInstance,
  handleImportBuild,
  onOpenTrash,
  onOpenWorldBackups,
  handleOpenFolder,
  handleRenameInstance,
  handleTogglePin,
  setStatsInstanceId,
  setScreenshotsInstanceId,
  openBuildCardSettings,
}: InstancesTabProps) {
  const [buildNameDraft, setBuildNameDraft] = useState(selectedInstance?.name ?? "");
  const [renamingBuild, setRenamingBuild] = useState(false);
  useEffect(() => {
    setBuildNameDraft(selectedInstance?.name ?? "");
    setRenamingBuild(false);
  }, [selectedInstance?.id, selectedInstance?.name]);

  const cancelBuildRename = () => {
    setBuildNameDraft(selectedInstance?.name ?? "");
    setRenamingBuild(false);
  };

  const commitBuildRename = async () => {
    if (!selectedInstance || !buildNameDraft.trim()) return;
    const renamed = await handleRenameInstance(selectedInstance.id, buildNameDraft);
    if (renamed) setRenamingBuild(false);
  };

  const sortedInstances = [...instances]
    .reverse()
    .sort((left, right) => Number(right.pinned) - Number(left.pinned));
  const showCreator = createMode || instances.length === 0 || !selectedInstance;
  const buildInfoBottomSpace = 8;
  const resolveSelectedTemplate = (template: string) =>
    resolveForTarget(template, selectedInstance, {
      buildState: selectedInstance && isRunning(selectedInstance.id) ? "RUNNING" : "",
    });
  const instancePlaceholderContexts = useMemo(
    () =>
      new Map(
        instances.map((instance) => {
          const resolve = (template: string) =>
            resolveForTarget(template, instance, {
              buildState: isRunning(instance.id) ? "RUNNING" : "",
            });
          return [
            instance.id,
            { resolve, attributes: createPlaceholderValueAttributes(resolve) },
          ] as const;
        }),
      ),
    [instances, isRunning, resolveForTarget],
  );

  return (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-instances-fixed">
        {/* ── Instance list ── */}
        <div className="panel-card instances-list-card" data-guide-target="build-library">
          <div className="card-topline build-library-heading">
            <span className="panel-label">INSTANCE LIBRARY</span>
            <div className="build-library-actions" data-guide-target="build-library-actions">
              <button
                className="ghost-action build-library-trash-action"
                type="button"
                title="Корзина сборок"
                aria-label="Корзина сборок"
                onClick={onOpenTrash}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>TRASH</span>
              </button>
              <button
                className="ghost-action icon-square-action"
                type="button"
                title="Импортировать сборку из файла"
                aria-label="Импортировать сборку из файла"
                onClick={handleImportBuild}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 9.5L4.5 7M7 9.5L9.5 7M7 9.5V3.5M2.5 11.5h9"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
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
            <div
              style={{ height: 0, overflow: "hidden", pointerEvents: "none" }}
              aria-hidden="true"
              data-appearance-grid-ignore="true"
            >
              <div
                ref={createCardMeasureRef}
                className={`instance-card ${hasBuildCardBackgroundImage(createMeasureAppearance) ? "instance-card-with-image" : ""}`}
                style={getBuildCardAppearanceStyle(createMeasureAppearance)}
              >
                <div className="instance-card-top">
                  <span className="instance-name">{createPreviewName}</span>
                </div>
                <div className="instance-card-meta instance-card-meta--content">
                  <BuildCardContentView
                    mode={createMeasureAppearance.contentMode}
                    align={createMeasureAppearance.contentTextAlign}
                    strokeEnabled={createMeasureAppearance.contentTextStrokeEnabled}
                    appearance={createMeasureAppearance}
                    tags={resolveBuildCardContentTags(
                      createMeasureAppearance,
                      buildCardPreviewTarget,
                      { buildState: "RUNNING" },
                    )}
                  />
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
                const cardStyle: CSSProperties | undefined =
                  getBuildCardAppearanceStyle(cardAppearance);
                const resolvedContentTags = resolveBuildCardContentTags(cardAppearance, instance, {
                  buildState: isRunning(instance.id) ? "RUNNING" : "",
                });
                const placeholderContext = instancePlaceholderContexts.get(instance.id)!;
                const resolveInstanceTemplate = placeholderContext.resolve;
                const badgeTemplate = getBuildCardBadgeText(cardAppearance);
                const resolveBadgeTemplate = (template: string) =>
                  resolveForTarget(template, instance, {
                    buildState:
                      isRunning(instance.id) ||
                      getBuildCardBadgeVisibility(cardAppearance) === "always"
                        ? "RUNNING"
                        : "",
                  });
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
                    className={`instance-card ${selectedInstanceId === instance.id ? "selected" : ""} ${hasBuildCardBackgroundImage(cardAppearance) ? "instance-card-with-image" : ""} ${isDropTarget ? "drag-target" : ""}`}
                    style={cardStyle}
                    data-instance-id={instance.id}
                    data-mascot-stealable
                    {...placeholderContext.attributes}
                    onClick={() => {
                      setSelectedInstanceId(instance.id);
                      setCreateMode(false);
                    }}
                    type="button"
                  >
                    {isDropTarget && <div className="card-drop-overlay">ОТПУСТИ ФАЙЛ</div>}
                    <BuildCardVerticalBody appearance={cardAppearance}>
                      <div className="instance-card-top">
                        <span
                          className="instance-name"
                          data-card-layout-element
                          style={getBuildCardElementStyle(cardAppearance, "title")}
                          {...createPlaceholderAppearanceAttributes(
                            "%build_name%",
                            resolveInstanceTemplate,
                          )}
                        >
                          {resolveInstanceTemplate("%build_name%")}
                        </span>
                        {instance.pinned && (
                          <span
                            className="instance-pin-badge"
                            title="Закреплённая сборка"
                            aria-label="Закреплённая сборка"
                          >
                            <PinIcon />
                          </span>
                        )}
                        {shouldShowBuildCardBadge(cardAppearance, isRunning(instance.id)) && (
                          <span
                            className="instance-running-badge"
                            data-card-layout-element
                            style={{
                              ...getBuildCardBadgeStyle(cardAppearance),
                              ...getBuildCardElementStyle(cardAppearance, "badge"),
                            }}
                            {...createPlaceholderAppearanceAttributes(
                              badgeTemplate,
                              resolveBadgeTemplate,
                            )}
                          >
                            {resolveBadgeTemplate(badgeTemplate)}
                          </span>
                        )}
                      </div>
                      <div className="instance-card-meta instance-card-meta--content">
                        <BuildCardContentView
                          mode={cardAppearance.contentMode}
                          align={cardAppearance.contentTextAlign}
                          strokeEnabled={cardAppearance.contentTextStrokeEnabled}
                          appearance={cardAppearance}
                          tags={resolvedContentTags}
                        />
                      </div>
                    </BuildCardVerticalBody>
                  </button>
                );
              })
            )}
          </CustomScrollArea>
        </div>

        {/* ── Details / Creator panel ── */}
        <div className="instance-details-column">
          <div className="panel-card instance-details-card" data-guide-target="build-details">
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

                <div
                  className="inline-dropdown-grid"
                  style={{ marginTop: 24 }}
                  data-guide-target="build-create-fields"
                >
                  <InlineDropdown
                    label="MC VERSION"
                    value={createVersion || "SELECT VERSION"}
                    options={minecraftVersions}
                    isOpen={openDropdown === "create-version"}
                    onToggle={() =>
                      setOpenDropdown(openDropdown === "create-version" ? null : "create-version")
                    }
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
                      onToggle={() =>
                        setOpenDropdown(openDropdown === "create-loader" ? null : "create-loader")
                      }
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
                      <span className="detail-title">
                        {createLoader.toUpperCase()} LOADER VERSION
                      </span>
                      <InlineDropdown
                        label=""
                        value={
                          loaderVersionsLoading
                            ? "LOADING..."
                            : createLoaderVersion ||
                              "SELECT " + createLoader.toUpperCase() + " VERSION"
                        }
                        options={loaderVersions}
                        isOpen={openDropdown === "create-loader-version"}
                        onToggle={() =>
                          setOpenDropdown(
                            openDropdown === "create-loader-version"
                              ? null
                              : "create-loader-version",
                          )
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
                  <p className="panel-text" style={{ color: "var(--accent)" }}>
                    {createError}
                  </p>
                )}

                <div className="instance-actions" data-guide-target="build-create-actions">
                  <button
                    className="primary-action"
                    type="button"
                    onClick={handleCreateBuild}
                    disabled={working}
                    data-mascot-stealable
                    data-mascot-label="CREATE BUILD"
                  >
                    {working ? "WORKING..." : "CREATE BUILD"}
                  </button>
                  {instances.length > 0 && (
                    <button className="ghost-action" onClick={() => setCreateMode(false)}>
                      CANCEL
                    </button>
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
                <div className="card-topline">
                  <span className="panel-label">BUILD CONFIGURATION</span>
                  {selectedInstance && (
                    <button
                      className="ghost-action"
                      type="button"
                      onClick={() => onOpenWorldBackups(selectedInstance.id)}
                    >
                      WORLD BACKUPS
                    </button>
                  )}
                </div>

                {selectedInstance && (
                  <div className="build-identity-row">
                    {renamingBuild ? (
                      <>
                        <label className="field build-name-field">
                          <span>RENAME BUILD</span>
                          <input
                            autoFocus
                            value={buildNameDraft}
                            onChange={(event) => setBuildNameDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void commitBuildRename();
                              if (event.key === "Escape") cancelBuildRename();
                            }}
                            disabled={working}
                          />
                        </label>
                        <button
                          className="ghost-action build-identity-action build-confirm-action"
                          type="button"
                          disabled={
                            working ||
                            !buildNameDraft.trim() ||
                            buildNameDraft.trim() === selectedInstance.name
                          }
                          aria-label="Сохранить новое имя"
                          title="Сохранить новое имя"
                          onClick={() => void commitBuildRename()}
                        >
                          <ConfirmIcon />
                        </button>
                        <button
                          className="ghost-action build-identity-action"
                          type="button"
                          disabled={working}
                          aria-label="Отменить переименование"
                          title="Отменить переименование"
                          onClick={cancelBuildRename}
                        >
                          <CancelIcon />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="field build-name-field">
                          <span>BUILD NAME</span>
                          <div className="build-name-value">{selectedInstance.name}</div>
                        </div>
                        <button
                          className="ghost-action build-identity-action"
                          type="button"
                          disabled={working || isRunning(selectedInstance.id)}
                          aria-label="Переименовать сборку"
                          title={
                            isRunning(selectedInstance.id)
                              ? "Останови сборку перед переименованием"
                              : "Переименовать сборку"
                          }
                          onClick={() => setRenamingBuild(true)}
                        >
                          <RenameIcon />
                        </button>
                        <button
                          className={`ghost-action build-identity-action build-pin-action${selectedInstance.pinned ? " active" : ""}`}
                          type="button"
                          disabled={working}
                          aria-pressed={selectedInstance.pinned}
                          aria-label={
                            selectedInstance.pinned ? "Открепить сборку" : "Закрепить сборку"
                          }
                          title={selectedInstance.pinned ? "Открепить сборку" : "Закрепить сборку"}
                          onClick={() =>
                            void handleTogglePin(selectedInstance.id, !selectedInstance.pinned)
                          }
                        >
                          <PinIcon />
                        </button>
                      </>
                    )}
                  </div>
                )}

                <BuildConfigurationGrid
                  buildName={selectedInstance?.name || "NO BUILD"}
                  buildOptions={instances.map((instance) => instance.name)}
                  isOpen={openDropdown === "build"}
                  onToggle={() => setOpenDropdown(openDropdown === "build" ? null : "build")}
                  onSelect={(value) => {
                    const found = instances.find((instance) => instance.name === value);
                    if (found) setSelectedInstanceId(found.id);
                    setOpenDropdown(null);
                  }}
                  version={
                    selectedInstance ? resolveSelectedTemplate("%build_version%") : undefined
                  }
                  loader={
                    selectedInstance ? resolveSelectedTemplate("%build_full_loader%") : undefined
                  }
                  source={resolveSelectedTemplate("%build_source%")}
                  playtime={resolveSelectedTemplate("%build_playtime%")}
                  bottomSpace={buildInfoBottomSpace}
                  valueAppearances={{
                    version: createPlaceholderAppearanceAttributes(
                      "%build_version%",
                      resolveSelectedTemplate,
                    ),
                    loader: createPlaceholderAppearanceAttributes(
                      "%build_full_loader%",
                      resolveSelectedTemplate,
                    ),
                    source: createPlaceholderAppearanceAttributes(
                      "%build_source%",
                      resolveSelectedTemplate,
                    ),
                    playtime: createPlaceholderAppearanceAttributes(
                      "%build_playtime%",
                      resolveSelectedTemplate,
                    ),
                  }}
                />

                <div
                  className="instance-actions instance-actions-build"
                  data-guide-target="build-actions"
                >
                  {selectedInstance && isRunning(selectedInstance.id) ? (
                    <button
                      className="primary-action kill-action build-play-action"
                      type="button"
                      onClick={() => handleStopGame(selectedInstance.id)}
                    >
                      <span className="bpa-stack">
                        <span className="bpa-label">■ STOP GAME</span>
                        <span className="bpa-sizer" aria-hidden="true">
                          ■ STOP GAME
                        </span>
                      </span>
                    </button>
                  ) : (
                    <button
                      className="primary-action build-play-action"
                      type="button"
                      onClick={() => handleLaunchSelected()}
                      disabled={working}
                      data-mascot-stealable
                      data-mascot-label="PLAY BUILD"
                    >
                      <span className="bpa-stack">
                        <span className="bpa-label">{working ? "WORKING..." : "PLAY BUILD"}</span>
                        <span className="bpa-sizer" aria-hidden="true">
                          ■ STOP GAME
                        </span>
                      </span>
                    </button>
                  )}
                  <button
                    className="ghost-action"
                    type="button"
                    onClick={handleInstallSelected}
                    disabled={working}
                    data-mascot-stealable
                    data-mascot-label="INSTALL"
                  >
                    INSTALL
                  </button>
                  <button className="ghost-action" type="button" onClick={handleOpenFolder}>
                    FOLDER
                  </button>
                  <button
                    className="ghost-action"
                    type="button"
                    onClick={() => selectedInstance && setStatsInstanceId(selectedInstance.id)}
                  >
                    STATS
                  </button>
                  <div className="instance-side-actions">
                    <button
                      className="ghost-action icon-square-action export-action"
                      type="button"
                      title="Экспортировать сборку"
                      onClick={() => selectedInstance && handleExportInstance(selectedInstance.id)}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M7 3.5L9.5 6M7 3.5L4.5 6M7 3.5V9.5M2.5 11.5h9"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
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
                      onClick={() =>
                        selectedInstance && setScreenshotsInstanceId(selectedInstance.id)
                      }
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M4.7 3.2l.7-1.1h3.2l.7 1.1h2.2a1 1 0 011 1v6.4a1 1 0 01-1 1h-9a1 1 0 01-1-1V4.2a1 1 0 011-1h2.2z"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                        <circle cx="7" cy="7.3" r="2.1" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                    </button>
                    <button
                      className="ghost-action icon-square-action trash-action"
                      type="button"
                      title="Удалить сборку"
                      disabled={
                        working || (selectedInstance ? isRunning(selectedInstance.id) : false)
                      }
                      data-mascot-instance-id={selectedInstance?.id}
                      data-mascot-instance-name={selectedInstance?.name}
                      onClick={() => selectedInstance && handleDeleteInstance(selectedInstance.id)}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {((busyMessage && !installProgress) || actionError) && (
            <div className="build-status-stack">
              <div className="status-box">
                {busyMessage && !installProgress && <p className="panel-text">{busyMessage}</p>}
                {actionError && (
                  <p className="panel-text" style={{ color: "var(--accent)" }}>
                    {actionError}
                  </p>
                )}
                {actionError &&
                  failedBuildAction &&
                  failedBuildAction.id === selectedInstance?.id &&
                  !working && (
                    <button
                      className="ghost-action"
                      type="button"
                      onClick={() =>
                        void (failedBuildAction.action === "install"
                          ? handleInstallSelected()
                          : handleLaunchSelected())
                      }
                    >
                      {failedBuildAction.action === "install"
                        ? "ПОВТОРИТЬ УСТАНОВКУ"
                        : "ПОВТОРИТЬ ЗАПУСК"}
                    </button>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
