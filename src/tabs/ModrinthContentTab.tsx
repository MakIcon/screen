import { useEffect, useState } from "react";
import {
  ModrinthProjectIcon,
  ModrinthProjectModal,
} from "../components/modrinth/ModrinthProjectModal";
import { InlineDropdown } from "../components/inputs/InlineDropdown";
import { CustomScrollArea } from "../components/layout/CustomScrollArea";
import type { ModrinthContentController, ModrinthContentKind } from "../hooks/useModrinthContent";
import type { PlaceholderTarget } from "../hooks/usePlaceholders";
import type { DropdownKey, InstanceItem } from "../types";
import type { ModDownloadProgressPayload } from "../types";
import {
  createPlaceholderAppearanceAttributes,
  createPlaceholderValueAttributes,
} from "../utils/placeholders";

type ContentPresentation = {
  searchLabel: string;
  searchPlaceholder: string;
  catalogLabel: string;
  noTargetTitle: string;
  noTargetText: string;
  loadingTitle: string;
  loadingText: string;
  emptyText: string;
  loadingMoreText: string;
  targetSectionLabel: string;
  targetDropdownLabel: string;
  targetPlaceholder: string;
  dropdownKey: Exclude<DropdownKey, null>;
  detailLabel: string;
  detailValue: (target: InstanceItem | null) => string;
  installedLabel: string;
  installedLoadingText: string;
  installedEmptyText: string;
  deleteTitle: string;
  fallbackCategory: (target: InstanceItem | null) => string;
  installedCatalogMode: "update" | "downloaded";
  showInstanceInfo?: boolean;
};

const CONTENT_PRESENTATION: Record<ModrinthContentKind, ContentPresentation> = {
  mods: {
    searchLabel: "MODRINTH SEARCH",
    searchPlaceholder: "Search compatible mods...",
    catalogLabel: "DISCOVER / INSTALL",
    noTargetTitle: "NO MODDED BUILDS",
    noTargetText: "Создай Fabric, Quilt или NeoForge-сборку во вкладке BUILDS.",
    loadingTitle: "LOADING MODS",
    loadingText: "Подтягиваю список модов с Modrinth.",
    emptyText: "Попробуй другой запрос или другую сборку.",
    loadingMoreText: "Loading more mods...",
    targetSectionLabel: "CURRENT TARGET",
    targetDropdownLabel: "MODDED BUILD",
    targetPlaceholder: "SELECT MODDED BUILD",
    dropdownKey: "target-mods",
    detailLabel: "LOADER",
    detailValue: (target) => target?.loader ?? "—",
    installedLabel: "INSTALLED MODS",
    installedLoadingText: "Reading installed mods...",
    installedEmptyText: "Пока что в этой сборке нет установленных модов.",
    deleteTitle: "Удалить мод",
    fallbackCategory: (target) => target?.loader ?? "Mod",
    installedCatalogMode: "update",
  },
  resourcepacks: {
    searchLabel: "PACK SEARCH",
    searchPlaceholder: "Search resource packs...",
    catalogLabel: "RESOURCE PACKS",
    noTargetTitle: "NO BUILDS",
    noTargetText: "Создай сборку во вкладке BUILDS, чтобы ставить resource packs с Modrinth.",
    loadingTitle: "LOADING RESOURCE PACKS",
    loadingText: "Подгружаю каталог resource packs.",
    emptyText: "Попробуй другой запрос или другую версию Minecraft.",
    loadingMoreText: "Loading more packs...",
    targetSectionLabel: "ACTIVE PROFILE",
    targetDropdownLabel: "TARGET BUILD",
    targetPlaceholder: "SELECT BUILD",
    dropdownKey: "target-packs",
    detailLabel: "FOLDER",
    detailValue: () => "RESOURCEPACKS",
    installedLabel: "INSTALLED PACKS",
    installedLoadingText: "Reading installed resource packs...",
    installedEmptyText: "Пока что в этой сборке нет установленных resource packs.",
    deleteTitle: "Удалить ресурс-пак",
    fallbackCategory: () => "Resource Pack",
    installedCatalogMode: "update",
  },
  shaders: {
    searchLabel: "SHADER SEARCH",
    searchPlaceholder: "Search shaders...",
    catalogLabel: "SHADERPACKS",
    noTargetTitle: "NO BUILDS",
    noTargetText: "Создай сборку во вкладке BUILDS, чтобы ставить shaderpacks с Modrinth.",
    loadingTitle: "LOADING SHADERS",
    loadingText: "Подгружаю каталог shaderpacks.",
    emptyText: "Попробуй другой запрос или другую версию Minecraft.",
    loadingMoreText: "Loading more shaders...",
    targetSectionLabel: "ACTIVE PROFILE",
    targetDropdownLabel: "TARGET BUILD",
    targetPlaceholder: "SELECT BUILD",
    dropdownKey: "target-shaders",
    detailLabel: "FOLDER",
    detailValue: () => "SHADERPACKS",
    installedLabel: "INSTALLED SHADERS",
    installedLoadingText: "Reading installed shaders...",
    installedEmptyText: "Пока что в этой сборке нет установленных shaderpacks.",
    deleteTitle: "Удалить шейдер",
    fallbackCategory: () => "Shader",
    installedCatalogMode: "downloaded",
    showInstanceInfo: true,
  },
};

type ModrinthContentTabProps = {
  kind: ModrinthContentKind;
  controller: ModrinthContentController;
  targetInstances: InstanceItem[];
  selectedTarget: InstanceItem | null;
  setSelectedInstanceId: (id: string) => void;
  openDropdown: DropdownKey;
  setOpenDropdown: (key: DropdownKey) => void;
  resolveForTarget: (
    template: string,
    target: PlaceholderTarget,
    overrides?: { accountType?: string; buildState?: string },
  ) => string;
  mascotHiddenProjectIds?: string[];
};

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function truncateDescription(description: string) {
  return description.length > 160 ? `${description.slice(0, 160)}...` : description;
}

function ModDownloadControls({
  progress,
  onPause,
  onCancel,
}: {
  progress: ModDownloadProgressPayload;
  onPause: (paused: boolean) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const paused = progress.state === "paused";
  const percent = Math.round(progress.percent);
  return (
    <div className="mod-download-progress" onClick={(event) => event.stopPropagation()}>
      <div className="mod-download-progress-head">
        <strong>{paused ? "PAUSED" : "DOWNLOADING"}</strong>
        <span>{percent}%</span>
      </div>
      <div className="mod-download-progress-track" aria-label={`Download ${percent}%`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="mod-download-progress-actions">
        <span title={progress.filename}>{progress.filename || "Resolving dependencies…"}</span>
        <button type="button" onClick={() => void onPause(!paused)}>
          {paused ? "RESUME" : "PAUSE"}
        </button>
        <button className="danger" type="button" onClick={() => void onCancel()}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

export function ModrinthContentTab({
  kind,
  controller,
  targetInstances,
  selectedTarget,
  setSelectedInstanceId,
  openDropdown,
  setOpenDropdown,
  resolveForTarget,
  mascotHiddenProjectIds = [],
}: ModrinthContentTabProps) {
  const copy = CONTENT_PRESENTATION[kind];
  const {
    search,
    setSearch,
    items,
    totalHits,
    loading,
    loadingMore,
    error,
    busyProjectId,
    installedItems,
    installedLoading,
    downloadProgress,
    loadMore,
    install,
    uninstall,
    setDownloadPaused,
    cancelDownload,
  } = controller;
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const hiddenProjectIds = new Set(mascotHiddenProjectIds);
  const visibleItems = items.filter((item) => !hiddenProjectIds.has(item.projectId));
  const selectedProject = items.find((item) => item.projectId === selectedProjectId) ?? null;
  const visibleInstalledItems = installedItems.filter(
    (item) => !item.projectId || !hiddenProjectIds.has(item.projectId),
  );

  useEffect(() => {
    setSelectedProjectId(null);
  }, [kind, selectedTarget?.id]);

  return (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-catalog-fixed">
        <div className="panel-card catalog-toolbar-card">
          <div className="toolbar-row toolbar-row-single modrinth-toolbar-grid">
            <label className="field compact-field search-field">
              <span>{copy.searchLabel}</span>
              <input
                placeholder={copy.searchPlaceholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="panel-card mod-list-card">
          <div className="card-topline">
            <span className="panel-label">{copy.catalogLabel}</span>
            <span className="status-code">
              {visibleItems.length} / {totalHits} RESULTS
            </span>
          </div>

          {error && (
            <p className="panel-text" style={{ color: "var(--accent)", marginTop: 0 }}>
              {error}
            </p>
          )}

          {!selectedTarget ? (
            <div className="empty-state-box">
              <strong>{copy.noTargetTitle}</strong>
              <p>{copy.noTargetText}</p>
            </div>
          ) : (
            <CustomScrollArea
              className="mod-list mods-feed"
              onWheel={(event) => event.stopPropagation()}
              onScroll={(event) => {
                const element = event.currentTarget;
                const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
                if (remaining < 280) void loadMore();
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
              {loading && visibleItems.length === 0 ? (
                <div className="empty-state-box loading-state-box">
                  <strong>{copy.loadingTitle}</strong>
                  <p>{copy.loadingText}</p>
                </div>
              ) : visibleItems.length === 0 ? (
                <div className="empty-state-box">
                  <strong>NOTHING FOUND</strong>
                  <p>{copy.emptyText}</p>
                </div>
              ) : (
                <>
                  {visibleItems.map((item) => {
                    const category =
                      item.displayCategories?.[0] ||
                      item.categories?.[0] ||
                      copy.fallbackCategory(selectedTarget);
                    const busy = busyProjectId === item.projectId;
                    const contentBusy = busyProjectId !== null;

                    return (
                      <div
                        className="mod-card modrinth-card"
                        key={item.projectId}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open ${item.title} details`}
                        aria-haspopup="dialog"
                        onClick={() => setSelectedProjectId(item.projectId)}
                        onKeyDown={(event) => {
                          if (
                            event.target === event.currentTarget &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            setSelectedProjectId(item.projectId);
                          }
                        }}
                        data-mascot-content-kind={kind}
                        data-mascot-project-id={item.projectId}
                        data-mascot-content-title={item.title}
                        data-mascot-installed={item.installed ? "true" : "false"}
                      >
                        <div className="mod-card-head">
                          <div className="mod-card-project">
                            <ModrinthProjectIcon iconUrl={item.iconUrl} title={item.title} />
                            <div className="mod-title-row">
                              <h3>{item.title}</h3>
                              <span className="mod-category">{category.toUpperCase()}</span>
                            </div>
                          </div>
                          <div
                            style={{ display: "flex", gap: 8 }}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {item.installed ? (
                              copy.installedCatalogMode === "downloaded" ? (
                                <>
                                  <button
                                    className="ghost-action installed catalog-action"
                                    type="button"
                                    disabled
                                  >
                                    DOWNLOADED
                                  </button>
                                  <button
                                    className="ghost-action danger catalog-action"
                                    type="button"
                                    disabled={contentBusy}
                                    onClick={() => void uninstall(item.projectId)}
                                  >
                                    {busy ? "REMOVING..." : "DELETE"}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="ghost-action danger catalog-action"
                                    type="button"
                                    disabled={contentBusy}
                                    onClick={() => void uninstall(item.projectId)}
                                  >
                                    {busy ? "..." : "REMOVE"}
                                  </button>
                                  <button
                                    className="ghost-action installed catalog-action"
                                    type="button"
                                    disabled={contentBusy}
                                    onClick={() => void install(item.projectId)}
                                    data-mascot-stealable
                                    data-mascot-label="UPDATE"
                                  >
                                    {busy ? "..." : "UPDATE"}
                                  </button>
                                </>
                              )
                            ) : (
                              <button
                                className="catalog-action install"
                                type="button"
                                disabled={contentBusy}
                                onClick={() => void install(item.projectId)}
                                data-mascot-stealable
                                data-mascot-label="INSTALL"
                              >
                                {busy ? "INSTALLING..." : "INSTALL"}
                              </button>
                            )}
                          </div>
                        </div>
                        {kind === "mods" &&
                          busy &&
                          downloadProgress?.projectId === item.projectId && (
                            <ModDownloadControls
                              progress={downloadProgress}
                              onPause={setDownloadPaused}
                              onCancel={cancelDownload}
                            />
                          )}
                        <p className="mod-description">{truncateDescription(item.description)}</p>
                        <div className="mod-meta-strip">
                          <span>BY {item.author.toUpperCase()}</span>
                          <span>{item.downloads.toLocaleString()} DOWNLOADS</span>
                          <span>{item.follows.toLocaleString()} FOLLOWERS</span>
                        </div>
                      </div>
                    );
                  })}
                  {loadingMore && (
                    <div className="catalog-loading-row">
                      <span className="catalog-loading-spinner" aria-hidden="true" />
                      {copy.loadingMoreText}
                    </div>
                  )}
                </>
              )}
            </CustomScrollArea>
          )}
        </div>

        <div
          className="panel-card install-sidebar-card"
          {...createPlaceholderValueAttributes((template) =>
            resolveForTarget(template, selectedTarget),
          )}
        >
          <span className="panel-label">{copy.targetSectionLabel}</span>

          <div style={{ marginBottom: 24 }}>
            <InlineDropdown
              label={copy.targetDropdownLabel}
              value={selectedTarget?.name || copy.targetPlaceholder}
              options={targetInstances.map((instance) => instance.name)}
              isOpen={openDropdown === copy.dropdownKey}
              onToggle={() =>
                setOpenDropdown(openDropdown === copy.dropdownKey ? null : copy.dropdownKey)
              }
              onSelect={(value) => {
                const instance = targetInstances.find((candidate) => candidate.name === value);
                if (instance) setSelectedInstanceId(instance.id);
                setOpenDropdown(null);
              }}
              instanceInfos={
                copy.showInstanceInfo
                  ? targetInstances.map(({ id, name, loader }) => ({ id, name, loader }))
                  : undefined
              }
            />
          </div>

          <div className="detail-grid detail-grid--sidebar">
            <div className="detail-block">
              <span className="detail-title">TARGET VERSION</span>
              <span
                className="detail-value"
                {...createPlaceholderAppearanceAttributes("%build_version%", (template) =>
                  resolveForTarget(template, selectedTarget),
                )}
              >
                {resolveForTarget("%build_version%", selectedTarget)}
              </span>
            </div>
            <div className="detail-block">
              <span className="detail-title">{copy.detailLabel}</span>
              <span
                className="detail-value"
                {...(kind === "mods"
                  ? createPlaceholderAppearanceAttributes("%build_loader%", (template) =>
                      resolveForTarget(template, selectedTarget),
                    )
                  : {})}
              >
                {kind === "mods"
                  ? resolveForTarget("%build_loader%", selectedTarget)
                  : copy.detailValue(selectedTarget)}
              </span>
            </div>
          </div>

          <div className="installed-mods-block">
            <div className="card-topline installed-mods-head">
              <span className="panel-label">{copy.installedLabel}</span>
              <span className="status-code">{visibleInstalledItems.length}</span>
            </div>

            <div className="installed-mods-list">
              {installedLoading ? (
                <div className="catalog-loading-row">
                  <span className="catalog-loading-spinner" aria-hidden="true" />
                  {copy.installedLoadingText}
                </div>
              ) : visibleInstalledItems.length === 0 ? (
                <div className="empty-state-box compact-empty">
                  <strong>EMPTY</strong>
                  <p>{copy.installedEmptyText}</p>
                </div>
              ) : (
                visibleInstalledItems.map((item) => {
                  return (
                    <div
                      className="installed-mod-swipe"
                      key={item.filename}
                      data-mascot-content-kind={kind}
                      data-mascot-project-id={item.projectId || undefined}
                      data-mascot-content-title={item.title}
                    >
                      <div className="installed-mod-delete-slot">
                        <button
                          className="installed-mod-delete-btn"
                          type="button"
                          title={copy.deleteTitle}
                          disabled={!item.projectId || busyProjectId !== null}
                          onClick={() => item.projectId && void uninstall(item.projectId)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <div className="installed-mod-row">
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.versionNumber || item.filename}</span>
                        </div>
                        <em>{item.source.toUpperCase()}</em>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <ModrinthProjectModal
        kind={kind}
        project={selectedProject}
        busy={busyProjectId !== null}
        onClose={() => setSelectedProjectId(null)}
        onInstall={() => {
          if (selectedProject) void install(selectedProject.projectId);
        }}
        onUninstall={() => {
          if (selectedProject) void uninstall(selectedProject.projectId);
        }}
        downloadProgress={
          kind === "mods" && downloadProgress?.projectId === selectedProject?.projectId
            ? downloadProgress
            : null
        }
        onDownloadPause={setDownloadPaused}
        onDownloadCancel={cancelDownload}
      />
    </section>
  );
}
