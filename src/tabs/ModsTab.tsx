import { CustomScrollArea } from "../components/layout/CustomScrollArea";
import { InlineDropdown } from "../components/inputs/InlineDropdown";
import type { DropdownKey, InstanceItem, InstalledModView, ModrinthProject } from "../types";
import type { PlaceholderTarget } from "../hooks/usePlaceholders";

interface ModsTabProps {
  // Search
  modSearch: string;
  setModSearch: (v: string) => void;

  // Catalog
  modrinthItems: ModrinthProject[];
  modrinthTotalHits: number;
  modrinthLoading: boolean;
  modrinthLoadingMore: boolean;
  modrinthError: string;
  modrinthInstallBusyId: string | null;

  // Installed
  installedMods: InstalledModView[];
  installedModsLoading: boolean;

  // Target
  fabricInstances: InstanceItem[];
  selectedModTarget: InstanceItem | null;
  selectedModrinthVersion: string;
  setSelectedModrinthVersion: (v: string) => void;
  setSelectedInstanceId: (id: string) => void;

  // Dropdown
  openDropdown: DropdownKey;
  setOpenDropdown: (key: DropdownKey) => void;

  // Resolvers
  resolveForTarget: (
    template: string,
    target: PlaceholderTarget | null | undefined,
    overrides?: { accountType?: string; buildState?: string },
  ) => string;

  // Handlers
  handleLoadMoreMods: () => Promise<void>;
  handleInstallMod: (projectId: string) => Promise<void>;
  handleUninstallMod: (projectId: string) => Promise<void>;
}

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

export function ModsTab({
  modSearch, setModSearch,
  modrinthItems, modrinthTotalHits, modrinthLoading, modrinthLoadingMore, modrinthError, modrinthInstallBusyId,
  installedMods, installedModsLoading,
  fabricInstances, selectedModTarget, selectedModrinthVersion, setSelectedModrinthVersion,
  setSelectedInstanceId,
  openDropdown, setOpenDropdown,
  resolveForTarget,
  handleLoadMoreMods, handleInstallMod, handleUninstallMod,
}: ModsTabProps) {
  return (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-catalog-fixed">
        {/* Toolbar */}
        <div className="panel-card catalog-toolbar-card">
          <div className="toolbar-row toolbar-row-single modrinth-toolbar-grid">
            <label className="field compact-field search-field">
              <span>MODRINTH SEARCH</span>
              <input
                placeholder="Search Fabric mods..."
                value={modSearch}
                onChange={(e) => setModSearch(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* Catalog */}
        <div className="panel-card mod-list-card">
          <div className="card-topline">
            <span className="panel-label">DISCOVER / INSTALL</span>
            <span className="status-code">{modrinthItems.length} / {modrinthTotalHits} RESULTS</span>
          </div>

          {modrinthError && (
            <p className="panel-text" style={{ color: "var(--accent)", marginTop: 0 }}>
              {modrinthError}
            </p>
          )}

          {!selectedModTarget ? (
            <div className="empty-state-box">
              <strong>NO FABRIC BUILDS</strong>
              <p>Создай Fabric-сборку во вкладке BUILDS, чтобы устанавливать моды с Modrinth.</p>
            </div>
          ) : (
            <CustomScrollArea
              className="mod-list mods-feed"
              onWheel={(e: any) => e.stopPropagation()}
              onScroll={(e) => {
                const target = e.currentTarget;
                const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
                if (remaining < 280) void handleLoadMoreMods();
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
              {modrinthLoading && modrinthItems.length === 0 ? (
                <div className="empty-state-box">
                  <strong>LOADING MODS</strong>
                  <p>Подтягиваю список модов с Modrinth.</p>
                </div>
              ) : modrinthItems.length === 0 ? (
                <div className="empty-state-box">
                  <strong>NOTHING FOUND</strong>
                  <p>Попробуй другой запрос или другую Fabric-версию.</p>
                </div>
              ) : (
                <>
                  {modrinthItems.map((item) => {
                    const category = item.displayCategories?.[0] || item.categories?.[0] || "Fabric";
                    const installing = modrinthInstallBusyId === item.projectId;
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
                                  onClick={() => void handleUninstallMod(item.projectId)}
                                  disabled={installing}
                                >
                                  {installing ? "..." : "REMOVE"}
                                </button>
                                <button
                                  className="ghost-action installed"
                                  type="button"
                                  onClick={() => void handleInstallMod(item.projectId)}
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
                                onClick={() => void handleInstallMod(item.projectId)}
                                disabled={installing || !selectedModTarget}
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
                  {modrinthLoadingMore && (
                    <div className="catalog-loading-row">Loading more mods...</div>
                  )}
                </>
              )}
            </CustomScrollArea>
          )}
        </div>

        {/* Sidebar */}
        <div className="panel-card install-sidebar-card">
          <span className="panel-label">CURRENT TARGET</span>

          <div style={{ marginBottom: 24 }}>
            <InlineDropdown
              label="FABRIC BUILD"
              value={selectedModTarget?.name || "SELECT FABRIC BUILD"}
              options={fabricInstances.map((i) => i.name)}
              isOpen={openDropdown === "target-mods"}
              onToggle={() => setOpenDropdown(openDropdown === "target-mods" ? null : "target-mods")}
              onSelect={(value) => {
                const found = fabricInstances.find((i) => i.name === value);
                if (found) {
                  setSelectedInstanceId(found.id);
                  setSelectedModrinthVersion(found.version);
                }
                setOpenDropdown(null);
              }}
            />
          </div>

          <div className="detail-grid detail-grid--sidebar">
            <div className="detail-block">
              <span className="detail-title">TARGET VERSION</span>
              <span className="detail-value">
                {resolveForTarget(
                  "%build_version%",
                  selectedModTarget ?? { version: selectedModrinthVersion, loader: "Fabric" },
                )}
              </span>
            </div>
            <div className="detail-block">
              <span className="detail-title">LOADER</span>
              <span className="detail-value">
                {resolveForTarget(
                  "%build_loader%",
                  selectedModTarget ?? { version: selectedModrinthVersion, loader: "Fabric" },
                )}
              </span>
            </div>
          </div>

          <div className="installed-mods-block">
            <div className="card-topline installed-mods-head">
              <span className="panel-label">INSTALLED MODS</span>
              <span className="status-code">{installedMods.length}</span>
            </div>

            <div className="installed-mods-list">
              {installedModsLoading ? (
                <div className="catalog-loading-row">Reading installed mods...</div>
              ) : installedMods.length === 0 ? (
                <div className="empty-state-box compact-empty">
                  <strong>EMPTY</strong>
                  <p>Пока что в этой сборке нет установленных модов.</p>
                </div>
              ) : (
                installedMods.map((mod) => {
                  const uninstalling = modrinthInstallBusyId === mod.projectId;
                  return (
                    <div
                      className="installed-mod-swipe"
                      key={`${mod.filename}-${mod.projectId ?? "local"}`}
                    >
                      <div className="installed-mod-delete-slot">
                        <button
                          className="installed-mod-delete-btn"
                          type="button"
                          title="Удалить мод"
                          disabled={uninstalling || !mod.projectId}
                          onClick={() => mod.projectId && void handleUninstallMod(mod.projectId)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <div className="installed-mod-row">
                        <div>
                          <strong>{mod.title}</strong>
                          <span>{mod.versionNumber || mod.filename}</span>
                        </div>
                        <em>{mod.source.toUpperCase()}</em>
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
