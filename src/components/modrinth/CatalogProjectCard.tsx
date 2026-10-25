import type { CSSProperties } from "react";
import { ProgressBar } from "../display/ProgressBar";
import { Badge } from "../display/Badge";
import { Button } from "../inputs/Button";
import { IconButton } from "../inputs/IconButton";
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
  percent,
  determinate,
  onPause,
  onCancel,
}: {
  progress: ModDownloadProgressPayload;
  percent: number;
  determinate: boolean;
  onPause: (paused: boolean) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const tr = useTranslation();
  const paused = progress.state === "paused";
  const finished = progress.state === "completed" || progress.state === "cancelled";
  const label = paused
    ? tr("common.paused")
    : progress.state === "completed"
      ? tr("catalogProjectCard.downloaded")
      : progress.state === "cancelled"
        ? tr("common.working")
        : tr("common.downloading");
  return (
    <div className="catalog-download-controls">
      <ProgressBar
        className="catalog-download-status"
        value={determinate ? percent : null}
        label={label}
        settings={{ height: 2 }}
        state={paused ? "paused" : "running"}
        style={{ "--progress-screen-fill": "var(--catalog-progress-color)" } as CSSProperties}
        aria-label={tr("catalogProjectCard.download")}
        data-tooltip={progress.filename || tr("catalogProjectCard.resolvingDependencies")}
        aria-valuetext={`${label}${determinate ? ` ${Math.round(percent)}%` : ""}`}
      />
      <IconButton
        size="sm"
        variant="ghost"
        className="catalog-download-control"
        type="button"
        aria-label={paused ? tr("common.resume") : tr("common.pause")}
        data-tooltip={paused ? tr("common.resume") : tr("common.pause")}
        disabled={finished}
        onClick={() => void onPause(!paused)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          {paused ? <path d="m5 3 8 5-8 5Z" /> : <path d="M4 3h3v10H4zm5 0h3v10H9z" />}
        </svg>
      </IconButton>
      <IconButton
        size="sm"
        variant="ghost"
        className="catalog-download-control catalog-download-control--cancel"
        type="button"
        aria-label={tr("common.cancel")}
        data-tooltip={tr("common.cancel")}
        disabled={finished}
        onClick={() => void onCancel()}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="m4 4 8 8m0-8-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </IconButton>
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
  const progress = busy && downloadProgress?.projectId === item.projectId ? downloadProgress : null;
  const percent = progress
    ? progress.state === "completed"
      ? 100
      : Number.isFinite(progress.percent)
        ? Math.max(0, Math.min(100, progress.percent))
        : 0
    : 0;
  const determinate = Boolean(
    progress && (progress.state === "completed" || progress.totalBytes > 0),
  );
  return (
    <div
      ref={(node) => {
        if (node) catalogProjects.set(node, item);
      }}
      className="mod-card modrinth-card"
      data-download-state={progress?.state}
      data-download-indeterminate={progress && !determinate ? "true" : undefined}
      style={
        progress ? ({ "--catalog-download-progress": percent / 100 } as CSSProperties) : undefined
      }
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
      <Badge
        className="mod-category"
        tone="accent"
        variant="soft"
        size="sm"
        settings={{ fontSize: 9, paddingX: 14, borderRadius: 0 }}
        title={category.toUpperCase()}
        data-tooltip={category.toUpperCase()}
      >
        {category.toUpperCase()}
      </Badge>
      <div className="mod-card-head">
        <div className="mod-card-project">
          <ModrinthProjectIcon iconUrl={item.iconUrl} title={item.title} />
          <div className="mod-title-row">
            <h3>{item.title}</h3>
          </div>
        </div>
        <div className="mod-card-actions" onClick={(event) => event.stopPropagation()}>
          {progress ? (
            <ModDownloadControls
              progress={progress}
              percent={percent}
              determinate={determinate}
              onPause={setDownloadPaused}
              onCancel={cancelDownload}
            />
          ) : item.installed ? (
            installedCatalogMode === "downloaded" ? (
              <>
                <Button
                  variant="inherit"
                  className="ghost-action installed catalog-action"
                  disabled
                >
                  {tr("catalogProjectCard.downloaded")}
                </Button>
                <Button
                  variant="danger"
                  className="catalog-action"
                  type="button"
                  disabled={contentBusy}
                  loading={busy}
                  loadingLabel={tr("catalogProjectCard.removing")}
                  onClick={onUninstall}
                >
                  {tr("common.deleteCaps")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="danger"
                  className="catalog-action"
                  type="button"
                  disabled={contentBusy}
                  loading={busy}
                  loadingLabel={tr("catalogProjectCard.removing")}
                  onClick={onUninstall}
                >
                  {tr("common.remove")}
                </Button>
                <Button
                  variant="inherit"
                  className="ghost-action installed catalog-action"
                  type="button"
                  disabled={contentBusy}
                  loading={busy}
                  loadingLabel={tr("catalogProjectCard.installing")}
                  onClick={onInstall}
                  data-mascot-stealable
                  data-mascot-label={tr("catalogProjectCard.update")}
                >
                  {tr("catalogProjectCard.update")}
                </Button>
              </>
            )
          ) : (
            <Button
              variant="primary"
              className="catalog-action"
              type="button"
              disabled={contentBusy}
              loading={busy}
              loadingLabel={tr("catalogProjectCard.installing")}
              onClick={onInstall}
              data-mascot-stealable
              data-mascot-label={tr("common.install")}
            >
              {tr("common.install")}
            </Button>
          )}
        </div>
      </div>
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
