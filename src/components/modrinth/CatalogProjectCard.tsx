import type { ModDownloadProgressPayload, ModrinthProject } from "../../types";
import type { ModrinthContentKind } from "../../hooks/useModrinthContent";
import { ModrinthProjectIcon } from "./ModrinthProjectModal";

// Keep preview data with its card without serializing version lists into the DOM.
const catalogProjects = new WeakMap<HTMLElement, ModrinthProject>();

export function getCatalogPreviewProject(source: HTMLElement) {
  const card = source.matches(".modrinth-card")
    ? source
    : source.querySelector<HTMLElement>(".modrinth-card");
  return card ? catalogProjects.get(card) : undefined;
}

interface CatalogProjectCardProps {
  item: ModrinthProject;
  kind: ModrinthContentKind;
  category: string;
  busy: boolean;
  contentBusy: boolean;
  installedCatalogMode: "update" | "downloaded";
  downloadProgress?: ModDownloadProgressPayload | null;
  onOpen: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  setDownloadPaused: (paused: boolean) => Promise<void>;
  cancelDownload: () => Promise<void>;
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
        <span data-tooltip={progress.filename}>
          {progress.filename || "Resolving dependencies…"}
        </span>
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

export function CatalogProjectCard({
  item,
  kind,
  category,
  busy,
  contentBusy,
  installedCatalogMode,
  downloadProgress,
  onOpen,
  onInstall,
  onUninstall,
  setDownloadPaused,
  cancelDownload,
}: CatalogProjectCardProps) {
  return (
    <div
      ref={(node) => {
        if (node) catalogProjects.set(node, item);
      }}
      className="mod-card modrinth-card"
      key={item.projectId}
      role="button"
      tabIndex={0}
      aria-label={`Open ${item.title} details`}
      aria-haspopup="dialog"
      onClick={() => onOpen()}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen();
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
        <div className="mod-card-actions" onClick={(event) => event.stopPropagation()}>
          {item.installed ? (
            installedCatalogMode === "downloaded" ? (
              <>
                <button className="ghost-action installed catalog-action" type="button" disabled>
                  DOWNLOADED
                </button>
                <button
                  className="ghost-action danger catalog-action"
                  type="button"
                  disabled={contentBusy}
                  onClick={onUninstall}
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
                  onClick={onUninstall}
                >
                  {busy ? "..." : "REMOVE"}
                </button>
                <button
                  className="ghost-action installed catalog-action"
                  type="button"
                  disabled={contentBusy}
                  onClick={onInstall}
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
              onClick={onInstall}
              data-mascot-stealable
              data-mascot-label="INSTALL"
            >
              {busy ? "INSTALLING..." : "INSTALL"}
            </button>
          )}
        </div>
      </div>
      {kind === "mods" && busy && downloadProgress?.projectId === item.projectId && (
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
}
