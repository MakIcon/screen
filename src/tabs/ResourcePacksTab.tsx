import { CustomScrollArea } from "../components/layout/CustomScrollArea";
import { InlineDropdown } from "../components/inputs/InlineDropdown";
import type { DropdownKey, InstanceItem, InstalledModView, ModrinthProject } from "../types";
import type { PlaceholderTarget } from "../hooks/usePlaceholders";

interface ResourcePacksTabProps {
  packSearch: string;
  setPackSearch: (v: string) => void;

  packItems: ModrinthProject[];
  packTotalHits: number;
  packLoading: boolean;
  packLoadingMore: boolean;
  packError: string;
  packInstallBusyId: string | null;

  installedPacks: InstalledModView[];
  installedPacksLoading: boolean;

  instances: InstanceItem[];
  selectedInstance: InstanceItem | null;
  setSelectedInstanceId: (id: string) => void;

  openDropdown: DropdownKey;
  setOpenDropdown: (key: DropdownKey) => void;

  resolveForTarget: (
    template: string,
    target: PlaceholderTarget | null | undefined,
    overrides?: { accountType?: string; buildState?: string },
  ) => string;

  handleLoadMorePacks: () => Promise<void>;
  handleInstallPack: (projectId: string) => Promise<void>;
  handleUninstallPack: (projectId: string) => Promise<void>;
}

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

export function ResourcePacksTab({
  packSearch, setPackSearch,
  packItems, packTotalHits, packLoading, packLoadingMore, packError, packInstallBusyId,
  installedPacks, installedPacksLoading,
  instances, selectedInstance, setSelectedInstanceId,
  openDropdown, setOpenDropdown,
  resolveForTarget,
  handleLoadMorePacks, handleInstallPack, handleUninstallPack,
}: ResourcePacksTabProps) {
  return (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-catalog-fixed">
        {/* Toolbar */}
        <div className="panel-card catalog-toolbar-card">
          <div className="toolbar-row toolbar-row-single">
            <label className="field compact-field search-field">
              <span>PACK SEARCH</span>
              <input
                placeholder="Search resource packs..."
                value={packSearch}
                onChange={(e) => setPackSearch(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* Catalog */}
        <div className="panel-card mod-list-card">
          <div className="card-topline">
            <span className="panel-label">RESOURCE PACKS</span>
            <span className="status-code">{packItems.length} / {packTotalHits} RESULTS</span>
          </div>

          {packError && (
            <p className="panel-text" style={{ color: "var(--accent)", marginTop: 0 }}>
              {packError}
            </p>
          )}

          {!selectedInstance ? (
            <div className="empty-state-box">
              <strong>NO BUILDS</strong>
              <p>Создай сборку во вкладке BUILDS, чтобы ставить resource packs с Modrinth.</p>
            </div>
          ) : (
            <CustomScrollArea
              className="mod-list mods-feed"
              onWheel={(e: any) => e.stopPropagation()}
              onScroll={(e) => {
                const target = e.currentTarget;
                const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
                if (remaining < 280) void handleLoadMorePacks();
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
              {packLoading && packItems.length === 0 ? (
                <div className="empty-state-box loading-state-box">
                  <strong>LOADING RESOURCE PACKS</strong>
                  <p>Подгружаю каталог resource packs.</p>
                </div>
              ) : packItems.length === 0 ? (
                <div className="empty-state-box">
                  <strong>NOTHING FOUND</strong>
                  <p>Попробуй другой запрос или другую версию Minecraft.</p>
                </div>
              ) : (
                <>
                  {packItems.map((item) => {
                    const category = item.displayCategories?.[0] || item.categories?.[0] || "Resource Pack";
                    const installing = packInstallBusyId === item.projectId;
                    return (
                      <div className="mod-card modrinth-card" key={item.projectId}>
                        <div className="mod-card-head">
                          <div className="mod-title-row">
                            <h3>{item.title}</h3>
                            <span className="mod-category">{category.toUpperCase()}</span>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
                            {item.installed ? (
                              <>
                                <button
                                  className="ghost-action"
                                  style={{ color: "var(--accent)", borderColor: "rgba(194, 65, 12, 0.2)" }}
                                  type="button"
                                  onClick={() => void handleUninstallPack(item.projectId)}
                                  disabled={installing}
                                >
                                  {installing ? "..." : "REMOVE"}
                                </button>
                                <button
                                  className="ghost-action installed"
                                  type="button"
                                  onClick={() => void handleInstallPack(item.projectId)}
                                  disabled={installing}
                                >
                                  {installing ? "..." : "UPDATE"}
                                </button>
                              </>
                            ) : (
                              <button
                                className="primary-action"
                                style={{ padding: "10px 20px", fontSize: "10px" }}
                                type="button"
                                onClick={() => void handleInstallPack(item.projectId)}
                                disabled={installing || !selectedInstance}
                              >
                                {installing ? "INSTALLING..." : "INSTALL"}
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mod-description" style={{ marginTop: "4px", marginBottom: "12px" }}>
                          {item.description.length > 160
                            ? item.description.substring(0, 160) + "..."
                            : item.description}
                        </p>
                        <div className="mod-meta-strip">
                          <span>BY {item.author.toUpperCase()}</span>
                          <span>{item.downloads.toLocaleString()} DOWNLOADS</span>
                          <span>{item.follows.toLocaleString()} FOLLOWERS</span>
                        </div>
                      </div>
                    );
                  })}
                  {packLoadingMore && (
                    <div className="catalog-loading-row">Loading more packs...</div>
                  )}
                </>
              )}
            </CustomScrollArea>
          )}
        </div>

        {/* Sidebar */}
        <div className="panel-card install-sidebar-card">
          <span className="panel-label">ACTIVE PROFILE</span>

          <div style={{ marginBottom: 24 }}>
            <InlineDropdown
              label="TARGET BUILD"
              value={selectedInstance?.name || "SELECT BUILD"}
              options={instances.map((i) => i.name)}
              isOpen={openDropdown === "target-packs"}
              onToggle={() => setOpenDropdown(openDropdown === "target-packs" ? null : "target-packs")}
              onSelect={(value) => {
                const found = instances.find((i) => i.name === value);
                if (found) setSelectedInstanceId(found.id);
                setOpenDropdown(null);
              }}
            />
          </div>

          <div className="detail-grid detail-grid--sidebar">
            <div className="detail-block">
              <span className="detail-title">TARGET VERSION</span>
              <span className="detail-value">
                {resolveForTarget("%build_version%", selectedInstance)}
              </span>
            </div>
            <div className="detail-block">
              <span className="detail-title">FOLDER</span>
              <span className="detail-value">RESOURCEPACKS</span>
            </div>
          </div>

          <div className="installed-mods-block">
            <div className="card-topline installed-mods-head">
              <span className="panel-label">INSTALLED PACKS</span>
              <span className="status-code">{installedPacks.length}</span>
            </div>

            <div className="installed-mods-list">
              {installedPacksLoading ? (
                <div className="catalog-loading-row">Reading installed resource packs...</div>
              ) : installedPacks.length === 0 ? (
                <div className="empty-state-box compact-empty">
                  <strong>EMPTY</strong>
                  <p>Пока что в этой сборке нет установленных resource packs.</p>
                </div>
              ) : (
                installedPacks.map((pack) => {
                  const uninstalling = packInstallBusyId === pack.projectId;
                  return (
                    <div className="installed-mod-swipe" key={pack.filename}>
                      <div
                        className="installed-mod-delete-slot"
                        style={{ opacity: 1, pointerEvents: "auto" }}
                      >
                        <button
                          className="installed-mod-delete-btn"
                          type="button"
                          title="Удалить ресурс пак"
                          disabled={!pack.projectId || uninstalling}
                          onClick={() => pack.projectId && void handleUninstallPack(pack.projectId)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <div className="installed-mod-row">
                        <div>
                          <strong>{pack.title}</strong>
                          <span>{pack.versionNumber || pack.filename}</span>
                        </div>
                        <em>{pack.source.toUpperCase()}</em>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
