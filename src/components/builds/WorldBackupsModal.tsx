import { TextField } from "../inputs/TextField";
import { TrashIcon } from "../display/TrashIcon";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BackupWorldInfo, InstanceItem, WorldBackupInfo } from "../../types";
import type { PushToast } from "../../hooks/useToasts";
import { useWorldBackups } from "../../hooks/useWorldBackups";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { WorldPreview } from "./WorldPreview";
import "./WorldBackupsModal.css";
import {
  useLocale,
  useTranslation,
  type Locale,
  intlLocale,
  translateFor,
} from "../../i18n/locale";

function BackupIcon({
  kind = "archive",
}: {
  kind?: "archive" | "refresh" | "close" | "check" | "chevron";
}) {
  const paths: Record<typeof kind, ReactNode> = {
    archive: (
      <>
        <path d="M4 9h16v11H4zM3 4h18v5H3z" />
        <path d="M9 13h6" />
      </>
    ),
    refresh: <path d="M20 10a8 8 0 0 0-14-5L3 8M3 3v5h5M4 14a8 8 0 0 0 14 5l3-3m0 5v-5h-5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

const SIZE_UNITS = [
  "units.kilobytes",
  "units.megabytes",
  "units.gigabytes",
  "units.terabytes",
] as const;

function formatSize(bytes: number, locale: Locale) {
  if (bytes < 1024) return translateFor(locale, "units.bytes", { value: bytes });
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length);
  const value = (bytes / 1024 ** power).toLocaleString(intlLocale(locale), {
    maximumFractionDigits: 1,
  });
  return translateFor(locale, SIZE_UNITS[power - 1], { value });
}

function formatDate(seconds: string, locale: Locale, short = false) {
  const value = Number(seconds);
  if (!seconds || !Number.isFinite(value)) return translateFor(locale, "worldBackups.unknownDate");
  return new Date(value * 1000).toLocaleString(intlLocale(locale), {
    day: "numeric",
    month: "short",
    ...(short ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

function worldCount(count: number, locale: Locale) {
  return translateFor(locale, "worldBackups.worlds", { count });
}

function WorldChoice({
  world,
  instanceId,
  backupId,
  checked,
  disabled,
  detail,
  onChange,
}: {
  world: BackupWorldInfo;
  instanceId: string;
  backupId?: string;
  checked: boolean;
  disabled: boolean;
  detail?: string;
  onChange: () => void;
}) {
  const locale = useLocale();
  return (
    <label className={`wb-world ${checked ? "wb-world--selected" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={world.folderName}
      />
      <WorldPreview
        instanceId={instanceId}
        worldName={world.folderName}
        backupId={backupId}
        revision={`${world.modifiedAt}:${world.sizeBytes}`}
      />
      <span className="wb-world-info">
        <strong title={world.folderName}>{world.folderName}</strong>
        <span>{formatSize(world.sizeBytes, locale)}</span>
        <small>{detail ?? formatDate(world.modifiedAt, locale, true)}</small>
      </span>
      <span className="wb-checkbox">
        <BackupIcon kind="check" />
      </span>
    </label>
  );
}

type Confirmation = { backup: WorldBackupInfo; action: "restore" | "delete"; worlds: string[] };
type Filter = "all" | "manual" | "beforeRestore";
type Props = {
  instance: InstanceItem;
  running: boolean;
  onClose: () => void;
  pushToast: PushToast;
};

export function WorldBackupsModal({ instance, running, onClose, pushToast }: Props) {
  const locale = useLocale();
  const tr = useTranslation();
  const backups = useWorldBackups(instance.id, running, pushToast);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [historyRevision, setHistoryRevision] = useState(0);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const restoreHeading = useRef<HTMLHeadingElement>(null);
  const selected = new Set(backups.selectedWorlds);
  const selectedSize = backups.worlds.reduce(
    (size, world) => size + (selected.has(world.folderName) ? world.sizeBytes : 0),
    0,
  );
  const visible = backups.backups.filter((backup) => filter === "all" || backup.kind === filter);
  const busyText = {
    create: tr("worldBackups.savingWorlds"),
    restore: tr("worldBackups.restoringWorlds"),
    delete: tr("worldBackups.deletingBackup"),
    refresh: tr("worldBackups.refreshing"),
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    restoreHeading.current?.focus();
  }, [confirmation?.backup.id, confirmation?.action]);

  const toggleWorld = (folder: string) =>
    backups.selectWorlds(
      selected.has(folder)
        ? backups.selectedWorlds.filter((item) => item !== folder)
        : [...backups.selectedWorlds, folder],
    );
  const confirm = async () => {
    if (!confirmation) return;
    const succeeded =
      confirmation.action === "delete"
        ? await backups.remove(confirmation.backup.id)
        : await backups.restore(confirmation.backup.id, confirmation.worlds);
    if (succeeded) {
      setConfirmation(null);
      dialog.current?.focus();
    }
  };

  const beginConfirmation = (backup: WorldBackupInfo, action: "restore" | "delete") => {
    setExpanded((current) => {
      const next = new Set(current);
      next.delete(backup.id);
      return next;
    });
    setConfirmation({
      backup,
      action,
      worlds: action === "restore" ? backup.worlds.map((world) => world.folderName) : [],
    });
  };

  const renderConfirmation = () =>
    confirmation && (
      <div className="wb-inline-confirmation">
        <h4 ref={restoreHeading} tabIndex={-1}>
          {confirmation.action === "restore"
            ? tr("worldBackups.whichWorldsShouldBe")
            : tr("worldBackups.deleteThisBackup")}
        </h4>
        {confirmation.action === "restore" ? (
          <>
            <p className="wb-restore-note">{tr("worldBackups.selectedWorldsWillReplace")}</p>
            <div className="wb-toolbar wb-toolbar--compact">
              <span>
                {tr("worldBackups.selectedOf", {
                  selected: confirmation.worlds.length,
                  total: confirmation.backup.worlds.length,
                })}
              </span>
              <button
                className="wb-text-button"
                type="button"
                disabled={backups.working}
                onClick={() =>
                  setConfirmation({
                    ...confirmation,
                    worlds:
                      confirmation.worlds.length === confirmation.backup.worlds.length
                        ? []
                        : confirmation.backup.worlds.map((world) => world.folderName),
                  })
                }
              >
                {confirmation.worlds.length === confirmation.backup.worlds.length
                  ? tr("worldBackups.clearSelection")
                  : tr("worldBackups.selectAll")}
              </button>
            </div>
            <div className="wb-world-grid">
              {confirmation.backup.worlds.map((world) => (
                <WorldChoice
                  key={world.folderName}
                  world={world}
                  instanceId={instance.id}
                  backupId={confirmation.backup.id}
                  checked={confirmation.worlds.includes(world.folderName)}
                  disabled={backups.working}
                  detail={
                    backups.worlds.some((item) => item.folderName === world.folderName)
                      ? tr("worldBackups.replaceInGame")
                      : tr("worldBackups.restoreToGame")
                  }
                  onChange={() =>
                    setConfirmation({
                      ...confirmation,
                      worlds: confirmation.worlds.includes(world.folderName)
                        ? confirmation.worlds.filter((item) => item !== world.folderName)
                        : [...confirmation.worlds, world.folderName],
                    })
                  }
                />
              ))}
            </div>
          </>
        ) : (
          <p className="wb-restore-note">{tr("worldBackups.onlyThisBackupWill")}</p>
        )}
        <div className="wb-confirm-actions">
          <button
            className="wb-secondary"
            type="button"
            disabled={backups.working}
            onClick={() => {
              setConfirmation(null);
              dialog.current?.focus();
            }}
          >
            {tr("worldBackups.cancel")}
          </button>
          <button
            className={`wb-primary ${confirmation.action === "delete" ? "wb-danger" : ""}`}
            type="button"
            disabled={
              backups.working ||
              (confirmation.action === "restore" && (running || !confirmation.worlds.length))
            }
            onClick={() => void confirm()}
          >
            {confirmation.action === "delete"
              ? tr("worldBackups.deleteBackup")
              : `${tr("worldBackups.restore")} · ${worldCount(confirmation.worlds.length, locale)}`}
          </button>
        </div>
      </div>
    );

  return (
    <div className="confirm-overlay wb-overlay" onClick={() => !backups.operation && onClose()}>
      <div
        ref={dialog}
        className="wb-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wb-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !backups.operation) {
            event.stopPropagation();
            if (confirmation) {
              setConfirmation(null);
              dialog.current?.focus();
            } else onClose();
          }
          if (event.key === "Tab") {
            const elements = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled):not([tabindex='-1']), input:not(:disabled), [tabindex='0']",
              ) ?? [],
            );
            const first = elements[0];
            const last = elements[elements.length - 1];
            if (!first) {
              event.preventDefault();
              return;
            }
            if (
              event.shiftKey &&
              (document.activeElement === first || document.activeElement === dialog.current)
            ) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              (document.activeElement === last || document.activeElement === dialog.current)
            ) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header className="wb-header">
          <div className="wb-heading">
            <span>{instance.name}</span>
            <h2 id="wb-title">{tr("worldBackups.worldBackups")}</h2>
          </div>
          <div className="wb-header-actions">
            <span className="wb-progress" role="status">
              {backups.operation
                ? busyText[backups.operation]
                : backups.loading
                  ? tr("common.loading")
                  : ""}
            </span>
            <button
              className="wb-icon-button"
              type="button"
              aria-label={tr("worldBackups.refreshWorldsAndBackups")}
              title={tr("worldBackups.refresh")}
              disabled={backups.working}
              onClick={() => {
                setConfirmation(null);
                void backups.refresh();
              }}
            >
              <BackupIcon kind="refresh" />
            </button>
            <button
              className="wb-icon-button"
              type="button"
              aria-label={tr("worldBackups.closeWorldBackups")}
              disabled={backups.operation !== null}
              onClick={onClose}
            >
              <BackupIcon kind="close" />
            </button>
          </div>
        </header>

        {backups.error && (
          <div className="wb-message wb-message--error" role="alert">
            {backups.error}
          </div>
        )}
        {running && <div className="wb-message">{tr("worldBackups.closeTheGameTo")}</div>}

        <CustomScrollArea className="wb-body-scroll">
          <div className="wb-columns">
            <section
              className="wb-panel wb-panel--create"
              aria-labelledby="wb-worlds-heading"
              aria-busy={backups.working}
            >
              <div className="wb-section-heading">
                <h3 id="wb-worlds-heading">{tr("worldBackups.worldsToBackUp")}</h3>
              </div>
              <div className="wb-toolbar">
                <div>
                  <span>
                    {tr("worldBackups.selectedOf", {
                      selected: selected.size,
                      total: backups.worlds.length,
                    })}
                  </span>
                </div>
                <button
                  className="wb-text-button"
                  type="button"
                  disabled={backups.working || !backups.worlds.length}
                  onClick={() =>
                    backups.selectWorlds(
                      selected.size === backups.worlds.length
                        ? []
                        : backups.worlds.map((world) => world.folderName),
                    )
                  }
                >
                  {selected.size && selected.size === backups.worlds.length
                    ? tr("worldBackups.clearSelection")
                    : tr("worldBackups.selectAll")}
                </button>
              </div>
              <CustomScrollArea className="wb-scroll" onWheel={(event) => event.stopPropagation()}>
                <div className="wb-world-grid">
                  {backups.loading ? (
                    <div className="wb-empty">{tr("worldBackups.loadingWorlds")}</div>
                  ) : !backups.worlds.length ? (
                    <div className="wb-empty">
                      <BackupIcon />
                      <h3>{tr("worldBackups.yourWorldsWillAppear")}</h3>
                      <p>{tr("worldBackups.createAWorldIn")}</p>
                    </div>
                  ) : (
                    backups.worlds.map((world) => (
                      <WorldChoice
                        key={world.folderName}
                        world={world}
                        instanceId={instance.id}
                        checked={selected.has(world.folderName)}
                        disabled={backups.working}
                        onChange={() => toggleWorld(world.folderName)}
                      />
                    ))
                  )}
                </div>
              </CustomScrollArea>
              <form
                className="wb-compose"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!selected.size || backups.working || running) return;
                  void backups.create(name).then((ok) => {
                    if (ok) {
                      setName("");
                      setFilter("all");
                      setConfirmation(null);
                      setHistoryRevision((current) => current + 1);
                      dialog.current?.focus();
                    }
                  });
                }}
              >
                <label htmlFor="wb-name">
                  {tr("worldBackups.backupName")} <span>{tr("worldBackups.optional")}</span>
                </label>
                <div className="wb-compose-row">
                  <TextField
                    id="wb-name"
                    maxLength={80}
                    value={name}
                    disabled={backups.working}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={tr("worldBackups.forExampleBeforeUpdating")}
                  />
                  <button
                    type="submit"
                    className="wb-primary"
                    disabled={backups.working || running || !selected.size}
                  >
                    <BackupIcon />
                    {backups.operation === "create"
                      ? tr("worldBackups.saving")
                      : tr("worldBackups.createBackup")}
                    <span>{formatSize(selectedSize, locale)}</span>
                  </button>
                </div>
              </form>
            </section>
            <section
              className="wb-panel wb-panel--history"
              aria-labelledby="wb-history-heading"
              aria-busy={backups.working}
            >
              <div className="wb-section-heading">
                <h3 id="wb-history-heading">{tr("worldBackups.savedBackups")}</h3>
                <span>{backups.backups.length}</span>
              </div>
              <div className="wb-toolbar">
                <div className="wb-filters" role="group" aria-label={tr("worldBackups.backupType")}>
                  {(
                    [
                      ["all", tr("worldBackups.all")],
                      ["manual", tr("worldBackups.mine")],
                      ["beforeRestore", tr("worldBackups.automatic")],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={filter === value}
                      disabled={backups.working}
                      onClick={() => {
                        setFilter(value);
                        setConfirmation(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span>
                  {formatSize(
                    backups.backups.reduce((size, backup) => size + backup.sizeBytes, 0),
                    locale,
                  )}
                </span>
              </div>
              <CustomScrollArea
                key={`${filter}:${historyRevision}`}
                className="wb-scroll wb-scroll--history"
                onWheel={(event) => event.stopPropagation()}
              >
                <div className="wb-history-list">
                  {backups.loading ? (
                    <div className="wb-empty">{tr("worldBackups.loadingBackups")}</div>
                  ) : !visible.length ? (
                    <div className="wb-empty">
                      <BackupIcon />
                      <h3>
                        {backups.backups.length
                          ? tr("worldBackups.noBackupsOfThis")
                          : tr("worldBackups.noSavedBackupsYet")}
                      </h3>
                      <p>
                        {filter === "beforeRestore"
                          ? tr("worldBackups.theyWillAppearAfter")
                          : tr("worldBackups.backUpYourWorlds")}
                      </p>
                    </div>
                  ) : (
                    visible.map((backup) => (
                      <article className="wb-backup" key={backup.id}>
                        <div className="wb-backup-main">
                          {backup.worlds[0] && (
                            <WorldPreview
                              instanceId={instance.id}
                              worldName={backup.worlds[0].folderName}
                              backupId={backup.id}
                            />
                          )}
                          <div className="wb-backup-info">
                            <div className="wb-backup-title">
                              <h3>{backup.name || tr("worldBackups.worldBackup")}</h3>
                              {backup.kind === "beforeRestore" && (
                                <span className="wb-badge">{tr("common.auto")}</span>
                              )}
                              {backups.restoredId === backup.id && (
                                <span className="wb-restored">
                                  <BackupIcon kind="check" />
                                  {tr("worldBackups.restored")}
                                </span>
                              )}
                            </div>
                            <time>{formatDate(backup.createdAt, locale)}</time>
                            <p title={backup.worlds.map((world) => world.folderName).join(", ")}>
                              {backup.worlds.map((world) => world.folderName).join(", ")}
                            </p>
                          </div>
                        </div>
                        <div className="wb-contents">
                          <button
                            type="button"
                            className="wb-contents-toggle"
                            aria-expanded={expanded.has(backup.id)}
                            aria-controls={`wb-contents-${backup.id}`}
                            onClick={() =>
                              setExpanded((current) => {
                                const next = new Set(current);
                                if (next.has(backup.id)) next.delete(backup.id);
                                else next.add(backup.id);
                                return next;
                              })
                            }
                          >
                            <span>{tr("worldBackups.backupContents")}</span>
                            <span>{worldCount(backup.worldCount, locale)}</span>
                            <BackupIcon kind="chevron" />
                          </button>
                          {expanded.has(backup.id) && (
                            <ul
                              id={`wb-contents-${backup.id}`}
                              className="wb-saved-worlds"
                              aria-label={tr("worldBackups.worldsInBackup")}
                            >
                              {backup.worlds.map((world) => (
                                <li key={world.folderName}>
                                  <WorldPreview
                                    instanceId={instance.id}
                                    worldName={world.folderName}
                                    backupId={backup.id}
                                  />
                                  <span>
                                    <strong>{world.folderName}</strong>
                                    <small>{formatDate(world.modifiedAt, locale, true)}</small>
                                  </span>
                                  <small>{formatSize(world.sizeBytes, locale)}</small>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="wb-backup-bottom">
                          <span>
                            {worldCount(backup.worldCount, locale)}
                            <span className="wb-dot">·</span>
                            {formatSize(backup.sizeBytes, locale)}
                            {backup.kind === "beforeRestore" && (
                              <span className="wb-auto-label">
                                {" "}
                                · {tr("worldBackups.beforeRestore")}
                              </span>
                            )}
                          </span>
                          {confirmation?.backup.id !== backup.id && (
                            <div className="wb-backup-actions">
                              <button
                                type="button"
                                className="wb-secondary"
                                disabled={backups.working || running}
                                onClick={() => beginConfirmation(backup, "restore")}
                              >
                                {tr("worldBackups.restore")}
                              </button>
                              <button
                                type="button"
                                className="wb-icon-button wb-delete"
                                aria-label={`${tr("worldBackups.deleteBackup")} ${backup.name || formatDate(backup.createdAt, locale)}`}
                                title={tr("worldBackups.deleteBackup")}
                                disabled={backups.working}
                                onClick={() => beginConfirmation(backup, "delete")}
                              >
                                <TrashIcon size={20} />
                              </button>
                            </div>
                          )}
                        </div>
                        {confirmation?.backup.id === backup.id && renderConfirmation()}
                      </article>
                    ))
                  )}
                </div>
              </CustomScrollArea>
            </section>
          </div>
        </CustomScrollArea>
      </div>
    </div>
  );
}
