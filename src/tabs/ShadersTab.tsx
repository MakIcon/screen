import { CustomScrollArea } from "../components/layout/CustomScrollArea";
import { InlineDropdown } from "../components/inputs/InlineDropdown";
import type { DropdownKey, InstanceItem, InstalledModView, ModrinthProject } from "../types";
import type { PlaceholderTarget } from "../hooks/usePlaceholders";

interface ShadersTabProps {
  shaderSearch: string;
  setShaderSearch: (v: string) => void;

  shaderItems: ModrinthProject[];
  shaderTotalHits: number;
  shaderLoading: boolean;
  shaderLoadingMore: boolean;
  shaderError: string;
  shaderInstallBusyId: string | null;

  installedShaders: InstalledModView[];
  installedShadersLoading: boolean;

  instances: InstanceItem[];
  selectedShaderTarget: InstanceItem | null;
  setSelectedInstanceId: (id: string) => void;

  openDropdown: DropdownKey;
  setOpenDropdown: (key: DropdownKey) => void;

  resolveForTarget: (
    template: string,
    target: PlaceholderTarget | null | undefined,
    overrides?: { accountType?: string; buildState?: string },
  ) => string;

  handleLoadMoreShaders: () => Promise<void>;
  handleInstallShader: (projectId: string) => Promise<void>;
  handleUninstallShader: (projectId: string) => Promise<void>;
}

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

export function ShadersTab({
  shaderSearch, setShaderSearch,
  shaderItems, shaderTotalHits, shaderLoading, shaderLoadingMore, shaderError, shaderInstallBusyId,
  installedShaders, installedShadersLoading,
  instances, selectedShaderTarget, setSelectedInstanceId,
  openDropdown, setOpenDropdown,
  resolveForTarget,
  handleLoadMoreShaders, handleInstallShader, handleUninstallShader,
}: ShadersTabProps) {
  return (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-catalog-fixed">
        {/* Toolbar */}
        <div className="panel-card catalog-toolbar-card">
          <div className="toolbar-row toolbar-row-single">
            <label className="field compact-field search-field">
              <span>SHADER SEARCH</span>
              <input
                placeholder="Search shaders..."
                value={shaderSearch}
                onChange={(e) => setShaderSearch(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* Catalog */}
        <div className="panel-card mod-list-card">
          <div className="card-topline">
            <span className="panel-label">SHADERPACKS</span>
            <span className="status-code">{shaderItems.length} / {shaderTotalHits} RESULTS</span>
          </div>

          {shaderError && (
            <p className="panel-text" style={{ color: "var(--accent)", marginTop: 0 }}>
              {shaderError}
            </p>
          )}

          {!selectedShaderTarget ? (
            <div className="empty-state-box">
              <strong>NO BUILDS</strong>
              <p>Создай сборку во вкладке BUILDS, чтобы ставить shaderpacks с Modrinth.</p>
            </div>
          ) : (
            <CustomScrollArea
              className="mod-list mods-feed"
              onWheel={(e: any) => e.stopPropagation()}
              onScroll={(e) => {
                const target = e.currentTarget;
                const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
                if (remaining < 280) void handleLoadMoreShaders();
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
              {shaderLoading && shaderItems.length === 0 ? (
                <div className="empty-state-box loading-state-box">
                  <strong>LOADING SHADERS</strong>
                  <p>Подгружаю каталог shaderpacks.</p>
                </div>
              ) : shaderItems.length === 0 ? (
                <div className="empty-state-box">
                  <strong>NOTHING FOUND</strong>
                  <p>Попробуй другой запрос или другую версию Minecraft.</p>
                </div>
              ) : (
                <>
                  {shaderItems.map((item) => {
                    const category = item.displayCategories?.[0] || item.categories?.[0] || "Shader";
                    const installing = shaderInstallBusyId === item.projectId;
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
                                <button className="ghost-action installed" type="button" disabled>
                                  DOWNLOADED
                                </button>
                                <button
                                  className="ghost-action"
                                  type="button"
                                  disabled={installing}
                                  onClick={() => void handleUninstallShader(item.projectId)}
                                >
                                  {installing ? "REMOVING..." : "DELETE"}
                                </button>
                              </>
                            ) : (
                              <button
                                className="ghost-action"
                                type="button"
                                disabled={installing}
                                onClick={() => void handleInstallShader(item.projectId)}
                              >
                                {installing ? "INSTALLING..." : "INSTALL"}
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mod-description">
                          {item.description.length > 160
                            ? `${item.description.slice(0, 160)}...`
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
                  {shaderLoadingMore && (
                    <div className="catalog-loading-row">Loading more shaders...</div>
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
              value={selectedShaderTarget?.name || "SELECT BUILD"}
              options={instances.map((i) => i.name)}
              isOpen={openDropdown === "target-shaders"}
              onToggle={() => setOpenDropdown(openDropdown === "target-shaders" ? null : "target-shaders")}
              onSelect={(value) => {
                const found = instances.find((i) => i.name === value);
                if (found) setSelectedInstanceId(found.id);
                setOpenDropdown(null);
              }}
              instanceInfos={instances.map((i) => ({
                name: i.name,
                id: i.id,
                loader: i.loader,
              }))}
            />
          </div>

          <div className="detail-grid detail-grid--sidebar">
            <div className="detail-block">
              <span className="detail-title">TARGET VERSION</span>
              <span className="detail-value">
                {resolveForTarget("%build_version%", selectedShaderTarget)}
              </span>
            </div>
            <div className="detail-block">
              <span className="detail-title">FOLDER</span>
              <span className="detail-value">SHADERPACKS</span>
            </div>
          </div>

          <div className="installed-mods-block">
            <div className="card-topline installed-mods-head">
              <span className="panel-label">INSTALLED SHADERS</span>
              <span className="status-code">{installedShaders.length}</span>
            </div>

            <div className="installed-mods-list">
              {installedShadersLoading ? (
                <div className="catalog-loading-row">Reading installed shaders...</div>
              ) : installedShaders.length === 0 ? (
                <div className="empty-state-box compact-empty">
                  <strong>EMPTY</strong>
                  <p>Пока что в этой сборке нет установленных shaderpacks.</p>
                </div>
              ) : (
                installedShaders.map((shader) => {
                  const uninstalling = shaderInstallBusyId === shader.projectId;
                  return (
                    <div className="installed-mod-swipe" key={shader.filename}>
                      <div
                        className="installed-mod-delete-slot"
                        style={{ opacity: 1, pointerEvents: "auto" }}
                      >
                        <button
                          className="installed-mod-delete-btn"
                          type="button"
                          title="Удалить шейдер"
                          disabled={!shader.projectId || uninstalling}
                          onClick={() => shader.projectId && void handleUninstallShader(shader.projectId)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <div className="installed-mod-row">
                        <div>
                          <strong>{shader.title}</strong>
                          <span>{shader.versionNumber || shader.filename}</span>
                        </div>
                        <em>{shader.source.toUpperCase()}</em>
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
