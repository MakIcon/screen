import type { ModDownloadProgressPayload, ModrinthProject } from "../../types";
import type { ModrinthContentKind } from "../../hooks/useModrinthContent";
import { ModrinthProjectIcon } from "./ModrinthProjectModal";
import { useTranslation } from "../../i18n/locale";

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
  const tr = useTranslation();
  const paused = progress.state === "paused";
  const percent = Math.round(progress.percent);
  return (
    <div className="mod-download-progress" onClick={(event) => event.stopPropagation()}>
      <div className="mod-download-progress-head">
        <strong>{paused ? tr("common.paused") : tr("common.downloading")}</strong>
        <span>{percent}%</span>
      </div>
      <div
        className="mod-download-progress-track"
        aria-label={`${tr("catalogProjectCard.download")} ${percent}%`}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="mod-download-progress-actions">
        <span data-tooltip={progress.filename}>
          {progress.filename || tr("catalogProjectCard.resolvingDependencies")}
        </span>
        <button type="button" onClick={() => void onPause(!paused)}>
          {paused ? tr("common.resume") : tr("common.pause")}
        </button>
        <button className="danger" type="button" onClick={() => void onCancel()}>
          {tr("common.cancel")}
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
  const tr = useTranslation();
  return (
    <div
      ref={(node) => {
        if (node) catalogProjects.set(node, item);
      }}
      className="mod-card modrinth-card"
      key={item.projectId}
      role="button"
      tabIndex={0}
      aria-label={tr("catalogProjectCard.openDetails", { title: item.title })}
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
                  {tr("catalogProjectCard.downloaded")}
                </button>
                <button
                  className="ghost-action danger catalog-action"
                  type="button"
                  disabled={contentBusy}
                  onClick={onUninstall}
                >
                  {busy ? tr("catalogProjectCard.removing") : tr("common.deleteCaps")}
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
                  {busy ? "..." : tr("common.remove")}
                </button>
                <button
                  className="ghost-action installed catalog-action"
                  type="button"
                  disabled={contentBusy}
                  onClick={onInstall}
                  data-mascot-stealable
                  data-mascot-label={tr("catalogProjectCard.update")}
                >
                  {busy ? "..." : tr("catalogProjectCard.update")}
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
              data-mascot-label={tr("common.install")}
            >
              {busy ? tr("catalogProjectCard.installing") : tr("common.install")}
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
        <span>
          {tr("catalogProjectCard.by")} {item.author.toUpperCase()}
        </span>
        <span>{tr("catalogProjectCard.downloads", { count: item.downloads })}</span>
        <span>{tr("catalogProjectCard.followers", { count: item.follows })}</span>
      </div>
    </div>
  );
}
