import { useEffect, useMemo, useState } from "react";
import { ModrinthProjectModal } from "../components/modrinth/ModrinthProjectModal";
import { CatalogProjectCard } from "../components/modrinth/CatalogProjectCard";
import { CatalogSearchToolbar } from "../components/modrinth/CatalogSearchToolbar";
import { ExportedItemIcon } from "../components/transfer/ExportedItemIcon";
import type { ContentIconCandidate } from "../hooks/useContentIcons";
import type { ExportedItem, ModrinthProject } from "../types";
import { InlineDropdown } from "../components/inputs/InlineDropdown";
import { CustomScrollArea } from "../components/layout/CustomScrollArea";
import type { ModrinthContentController, ModrinthContentKind } from "../hooks/useModrinthContent";
import type { PlaceholderTarget } from "../hooks/usePlaceholders";
import type { DropdownKey, InstanceItem } from "../types";
import {
  createPlaceholderAppearanceAttributes,
  createPlaceholderValueAttributes,
} from "../utils/placeholders";
import { useTranslation } from "../i18n/locale";

/** Text fields resolve to `modrinthContent.<kind>.<field>` messages. */
const TEXT_FIELDS = [
  "searchLabel",
  "searchPlaceholder",
  "catalogLabel",
  "noTargetTitle",
  "noTargetText",
  "loadingTitle",
  "loadingText",
  "emptyText",
  "loadingMoreText",
  "targetSectionLabel",
  "targetDropdownLabel",
  "targetPlaceholder",
  "detailLabel",
  "installedLabel",
  "installedLoadingText",
  "installedEmptyText",
  "deleteTitle",
] as const;
type TextField = (typeof TEXT_FIELDS)[number];

type ContentPresentation = Record<TextField, string> & {
  dropdownKey: Exclude<DropdownKey, null>;
  detailValue: (target: InstanceItem | null) => string;
  fallbackCategory: (target: InstanceItem | null) => string;
  installedCatalogMode: "update" | "downloaded";
  showInstanceInfo?: boolean;
};

const CONTENT_BEHAVIOR: Record<
  ModrinthContentKind,
  Omit<ContentPresentation, TextField | "fallbackCategory">
> = {
  mods: {
    dropdownKey: "target-mods",
    detailValue: (target) => target?.loader ?? "—",
    installedCatalogMode: "update",
  },
  resourcepacks: {
    dropdownKey: "target-packs",
    detailValue: () => "RESOURCEPACKS",
    installedCatalogMode: "update",
  },
  shaders: {
    dropdownKey: "target-shaders",
    detailValue: () => "SHADERPACKS",
    installedCatalogMode: "downloaded",
    showInstanceInfo: true,
  },
};

function contentPresentation(
  kind: ModrinthContentKind,
  tr: ReturnType<typeof useTranslation>,
): ContentPresentation {
  const text = Object.fromEntries(
    TEXT_FIELDS.map((field) => [field, tr(`modrinthContent.${kind}.${field}`)]),
  ) as Record<TextField, string>;
  const category = tr(`modrinthContent.${kind}.fallbackCategory`);
  return {
    ...CONTENT_BEHAVIOR[kind],
    ...text,
    // Mods fall back to the loader name; the other kinds to their own category.
    fallbackCategory: (target) => (kind === "mods" ? (target?.loader ?? category) : category),
  };
}

type ModrinthContentTabProps = {
  requestedProject?: ModrinthProject | null;
  onCloseProject?: () => void;
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
  requestLocalIcons: (items: ContentIconCandidate[]) => Promise<void>;
  getLocalIconUrl: (item: ContentIconCandidate) => string | null;
  projectIcons: Record<string, string | null>;
  requestProjectIcons: (items: ExportedItem[]) => Promise<void>;
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

export function ModrinthContentTab({
  requestedProject,
  onCloseProject,
  kind,
  controller,
  targetInstances,
  selectedTarget,
  setSelectedInstanceId,
  openDropdown,
  setOpenDropdown,
  resolveForTarget,
  mascotHiddenProjectIds = [],
  requestLocalIcons,
  getLocalIconUrl,
  projectIcons,
  requestProjectIcons,
}: ModrinthContentTabProps) {
  const tr = useTranslation();
  const copy = useMemo(() => contentPresentation(kind, tr), [kind, tr]);
  const iconKind = kind === "resourcepacks" ? "resourcePacks" : kind;
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
  const [projectSelection, setProjectSelection] = useState<ModrinthProject | null>(null);
  const hiddenProjectIds = new Set(mascotHiddenProjectIds);
  const visibleItems = items.filter((item) => !hiddenProjectIds.has(item.projectId));
  const selectedProjectSource =
    items.find((item) => item.projectId === projectSelection?.projectId) ?? projectSelection;
  const selectedProject = useMemo(
    () =>
      selectedProjectSource
        ? {
            ...selectedProjectSource,
            installed: installedLoading
              ? selectedProjectSource.installed
              : installedItems.some((item) => item.projectId === selectedProjectSource.projectId),
          }
        : null,
    [selectedProjectSource, installedLoading, installedItems],
  );
  const visibleInstalledItems = installedItems.filter(
    (item) => !item.projectId || !hiddenProjectIds.has(item.projectId),
  );

  useEffect(() => {
    setProjectSelection(requestedProject ?? null);
  }, [kind, selectedTarget?.id, requestedProject]);

  useEffect(() => {
    void requestLocalIcons(
      installedItems
        .filter((item) => item.source === "local")
        .map((item) => ({ title: item.filename, kind: iconKind })),
    );
    void requestProjectIcons(
      installedItems
        .filter((item) => item.projectId && !item.iconUrl)
        .map((item) => ({
          projectId: item.projectId ?? null,
          title: item.title,
          source: "modrinth",
        })),
    );
    // Fetch artwork only when the installed file list or section changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installedItems, iconKind]);

  return (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-catalog-fixed">
        <CatalogSearchToolbar
          guideTarget={`${kind}-search`}
          label={copy.searchLabel}
          placeholder={copy.searchPlaceholder}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="panel-card mod-list-card" data-guide-target={`${kind}-catalog`}>
          <div className="card-topline">
            <span className="panel-label">{copy.catalogLabel}</span>
            <span className="status-code">
              {visibleItems.length} / {totalHits} {tr("modrinthContent.results")}
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
                  <strong>{tr("modrinthContent.nothingFound")}</strong>
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
                      <CatalogProjectCard
                        key={item.projectId}
                        item={item}
                        kind={kind}
                        category={category}
                        busy={busy}
                        contentBusy={contentBusy}
                        installedCatalogMode={copy.installedCatalogMode}
                        downloadProgress={downloadProgress}
                        onOpen={() => setProjectSelection(item)}
                        onInstall={() => void install(item.projectId)}
                        onUninstall={() => void uninstall(item.projectId)}
                        setDownloadPaused={setDownloadPaused}
                        cancelDownload={cancelDownload}
                      />
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
          data-guide-target={`${kind}-target`}
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
              <span className="detail-title">{tr("modrinthContent.targetVersion")}</span>
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

          <div className="installed-mods-block" data-guide-target={`${kind}-installed`}>
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
                  <strong>{tr("modrinthContent.empty")}</strong>
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
                          data-tooltip={copy.deleteTitle}
                          aria-label={copy.deleteTitle}
                          disabled={!item.projectId || busyProjectId !== null}
                          onClick={() => item.projectId && void uninstall(item.projectId)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <div className="installed-mod-row">
                        <ExportedItemIcon
                          src={
                            item.iconUrl ||
                            (item.projectId
                              ? projectIcons[item.projectId]
                              : getLocalIconUrl({ title: item.filename, kind: iconKind }))
                          }
                          title={item.filename}
                          source={item.source}
                        />
                        <div className="installed-mod-copy">
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
        target={selectedTarget}
        busy={busyProjectId !== null}
        onClose={() => {
          setProjectSelection(null);
          onCloseProject?.();
        }}
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
