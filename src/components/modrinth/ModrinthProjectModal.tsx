import { ProgressBar } from "../display/ProgressBar";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ModrinthContentKind } from "../../hooks/useModrinthContent";
import type {
  InstanceItem,
  ModDownloadProgressPayload,
  ModrinthProject,
  ModrinthProjectDetails,
} from "../../types";
import { toErrorMessage } from "../../utils/errors";
import { ModrinthProjectIcon } from "./ModrinthProjectIcon";
import { ModrinthDependenciesSection } from "./ModrinthDependenciesSection";
import { intlLocale, useLocale, useTranslation, type Locale } from "../../i18n/locale";
export { ModrinthProjectIcon } from "./ModrinthProjectIcon";

type ModrinthProjectModalProps = {
  kind: ModrinthContentKind;
  project: ModrinthProject | null;
  target: InstanceItem | null;
  busy: boolean;
  onClose: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  downloadProgress?: ModDownloadProgressPayload | null;
  onDownloadPause?: (paused: boolean) => Promise<void>;
  onDownloadCancel?: () => Promise<void>;
};

function formatCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    year: "numeric",
  }).format(date);
}

function toReadableText(body: string) {
  // Project bodies on Modrinth are normally Markdown, but authors can mix in
  // HTML. Convert that markup to text before applying the lightweight
  // Markdown cleanup so a literal `<div>` or `<a>` never reaches the sheet.
  const bodyWithMarkdownLinks = body.replace(
    /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, url: string, label: string) => {
      const text = new DOMParser().parseFromString(label, "text/html").body.textContent?.trim();
      return `[${text || url}](${url})`;
    },
  );
  const bodyWithBlockBreaks = bodyWithMarkdownLinks
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?(?:p|div|section|article|h[1-6]|ul|ol|pre|blockquote)[^>]*>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "");
  const htmlAsText = new DOMParser().parseFromString(bodyWithBlockBreaks, "text/html").body
    .textContent;

  return (htmlAsText || bodyWithBlockBreaks)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[`*_>]/g, "")
    .replace(/^---+$/gm, "")
    .replace(/\\\n/g, "\n")
    .trim();
}

function getLinkLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ProjectLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <a
      className="modrinth-detail-link"
      href={url}
      onClick={(event) => {
        event.preventDefault();
        void openUrl(url);
      }}
    >
      {children}
    </a>
  );
}

function InstallIcon() {
  return (
    <svg className="modrinth-install-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.25v7.5M4.75 7.25 8 10.5l3.25-3.25M3 13.25h10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function appendTextWithLinks(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  const bareLinkPattern = /https?:\/\/[^\s<]+/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = bareLinkPattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const url = match[0].replace(/[),.;!?]+$/, "");
    const trailingText = match[0].slice(url.length);
    nodes.push(
      <ProjectLink key={`${keyPrefix}-url-${index}`} url={url}>
        {getLinkLabel(url)}
      </ProjectLink>,
    );
    if (trailingText) nodes.push(trailingText);
    cursor = match.index + match[0].length;
    index += 1;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderMarkdownText(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  const markdownLinkPattern = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = markdownLinkPattern.exec(text)) !== null) {
    nodes.push(
      ...appendTextWithLinks(text.slice(cursor, match.index), `${keyPrefix}-text-${index}`),
    );
    const url = match[2];
    nodes.push(
      <ProjectLink key={`${keyPrefix}-markdown-${index}`} url={url}>
        {match[1].trim() || getLinkLabel(url)}
      </ProjectLink>,
    );
    cursor = match.index + match[0].length;
    index += 1;
  }

  nodes.push(...appendTextWithLinks(text.slice(cursor), `${keyPrefix}-tail`));
  return nodes;
}

function DetailChips({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  const visibleValues = values.slice(0, 8);
  const hiddenCount = values.length - visibleValues.length;

  return (
    <section className="modrinth-detail-chip-section">
      <span className="modrinth-detail-section-label">{label}</span>
      <div className="modrinth-detail-chips">
        {visibleValues.map((value) => (
          <span key={value} className="modrinth-detail-chip">
            {value}
          </span>
        ))}
        {hiddenCount > 0 && <span className="modrinth-detail-chip">+{hiddenCount}</span>}
      </div>
    </section>
  );
}

export function ModrinthProjectModal({
  kind,
  project,
  target,
  busy,
  onClose,
  onInstall,
  onUninstall,
  downloadProgress,
  onDownloadPause,
  onDownloadCancel,
}: ModrinthProjectModalProps) {
  const locale = useLocale();
  const tr = useTranslation();
  const [details, setDetails] = useState<ModrinthProjectDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const projectId = project?.projectId;

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setDetails(null);
    setError("");
    setLoading(true);

    void invoke<ModrinthProjectDetails>("get_modrinth_project_details", {
      projectId,
    })
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch((caught) => {
        if (!cancelled) setError(toErrorMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, project]);

  const projectDetails = details?.projectId === project?.projectId ? details : null;
  const fullProject = useMemo(() => {
    if (!project) return null;
    if (!projectDetails) return project;
    return {
      ...project,
      ...projectDetails,
      iconUrl: projectDetails.iconUrl ?? project.iconUrl,
    };
  }, [project, projectDetails]);

  if (!project || !fullProject) return null;

  const body = toReadableText(projectDetails?.body ?? "");
  const description = projectDetails?.description ?? project.description;
  const category =
    projectDetails?.categories[0] ??
    project.displayCategories[0] ??
    project.categories[0] ??
    tr(`modrinthProject.kind.${kind}`);
  const showRemove = project.installed;
  const isShader = kind === "shaders";

  const modal = (
    <div className="modrinth-detail-overlay" onMouseDown={onClose}>
      <article
        className="modrinth-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modrinth-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="modrinth-detail-close"
          type="button"
          onClick={onClose}
          aria-label={tr("common.close2")}
        >
          <span />
          <span />
        </button>

        <header className="modrinth-detail-header">
          <ModrinthProjectIcon
            iconUrl={fullProject.iconUrl}
            title={fullProject.title}
            className="modrinth-project-icon--large"
          />
          <div className="modrinth-detail-heading">
            <span className="modrinth-detail-kicker">
              {tr(`modrinthProject.kind.${kind}`)} / MODRINTH
            </span>
            <h2 id="modrinth-detail-title">{fullProject.title}</h2>
            <p>
              {tr("modrinthProject.by")} {fullProject.author.toUpperCase()} ·{" "}
              {category.toUpperCase()}
            </p>
          </div>
        </header>

        <div className="modrinth-detail-summary">
          {description || tr("modrinthProject.noShortDescriptionWas")}
        </div>

        <div className="modrinth-detail-stats" aria-label={tr("modrinthProject.projectStatistics")}>
          <div>
            <strong>{formatCount(projectDetails?.downloads ?? project.downloads, locale)}</strong>
            <span>{tr("modrinthProject.downloads")}</span>
          </div>
          <div>
            <strong>{formatCount(projectDetails?.follows ?? project.follows, locale)}</strong>
            <span>{tr("modrinthProject.followers")}</span>
          </div>
          <div>
            <strong>{formatDate(projectDetails?.updated, locale)}</strong>
            <span>{tr("modrinthProject.updated")}</span>
          </div>
          <div>
            <strong>{projectDetails?.license ?? "—"}</strong>
            <span>{tr("modrinthProject.license")}</span>
          </div>
        </div>

        <div className="modrinth-detail-scroll" onWheel={(event) => event.stopPropagation()}>
          {loading && (
            <div className="modrinth-detail-loading">
              <span className="catalog-loading-spinner" aria-hidden="true" />
              {tr("modrinthProject.loadingProjectDetails")}
            </div>
          )}

          {error && <p className="modrinth-detail-error">{error}</p>}

          {kind === "mods" && (
            <ModrinthDependenciesSection
              key={`${project.projectId}:${target?.id}:${target?.version}:${target?.loader}`}
              projectId={project.projectId}
              target={target}
              busy={busy}
            />
          )}

          {body && (
            <section className="modrinth-detail-description">
              <span className="modrinth-detail-section-label">
                {tr("modrinthProject.aboutThisProject")}
              </span>
              {body.split(/\n{2,}/).map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`}>
                  {renderMarkdownText(paragraph, `paragraph-${index}`)}
                </p>
              ))}
            </section>
          )}

          <DetailChips
            label={tr("modrinthProject.categories")}
            values={projectDetails?.categories ?? project.categories}
          />
        </div>

        {busy && downloadProgress && (
          <div className="modrinth-detail-download-progress">
            <ProgressBar
              value={
                downloadProgress.totalBytes > 0 || downloadProgress.state === "completed"
                  ? downloadProgress.percent
                  : null
              }
              label={
                downloadProgress.state === "paused" ? tr("common.paused") : tr("common.downloading")
              }
              state={downloadProgress.state === "paused" ? "paused" : "running"}
              settings={{ height: 4 }}
            />
            <div>
              <button
                type="button"
                onClick={() => void onDownloadPause?.(downloadProgress.state !== "paused")}
              >
                {downloadProgress.state === "paused" ? tr("common.resume") : tr("common.pause")}
              </button>
              <button type="button" onClick={() => void onDownloadCancel?.()}>
                {tr("common.cancel")}
              </button>
            </div>
          </div>
        )}

        <footer className="modrinth-detail-actions">
          {showRemove && (
            <button
              className="modrinth-detail-secondary"
              type="button"
              disabled={busy}
              onClick={onUninstall}
            >
              {busy ? tr("common.working") : tr("common.remove")}
            </button>
          )}
          <button
            className="modrinth-detail-primary"
            type="button"
            disabled={busy || (isShader && project.installed)}
            onClick={onInstall}
          >
            {busy
              ? tr("modrinthProject.installing")
              : project.installed
                ? isShader
                  ? tr("modrinthProject.downloaded")
                  : tr("modrinthProject.update")
                : tr("common.install")}
            {!busy && !(isShader && project.installed) && <InstallIcon />}
          </button>
        </footer>
      </article>
    </div>
  );

  // The project sheet is opened from inside the animated, overflow-hidden tab
  // content. Portal it to the launcher root so its fixed backdrop covers the
  // complete window (header, sidebar, content and footer) for every content kind.
  const launcherRoot = document.querySelector<HTMLElement>(".gallery-root");
  return launcherRoot ? createPortal(modal, launcherRoot) : modal;
}
