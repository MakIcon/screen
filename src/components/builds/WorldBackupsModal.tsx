import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BackupWorldInfo, InstanceItem, WorldBackupInfo } from "../../types";
import type { PushToast } from "../../hooks/useToasts";
import { useWorldBackups } from "../../hooks/useWorldBackups";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { WorldPreview } from "./WorldPreview";
import "./WorldBackupsModal.css";

function BackupIcon({
  kind = "archive",
}: {
  kind?: "archive" | "refresh" | "close" | "check" | "trash" | "chevron";
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
    trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
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

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
  return `${(bytes / 1024 ** power).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ${units[power - 1]}`;
}

function formatDate(seconds: string, short = false) {
  const value = Number(seconds);
  if (!seconds || !Number.isFinite(value)) return "Дата неизвестна";
  return new Date(value * 1000).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(short ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

function worldCount(count: number) {
  const last = count % 10;
  const teen = count % 100 >= 11 && count % 100 <= 14;
  return `${count} ${teen ? "миров" : last === 1 ? "мир" : last >= 2 && last <= 4 ? "мира" : "миров"}`;
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
        <span>{formatSize(world.sizeBytes)}</span>
        <small>{detail ?? formatDate(world.modifiedAt, true)}</small>
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
    create: "Сохраняем миры…",
    restore: "Восстанавливаем миры…",
    delete: "Удаляем копию…",
    refresh: "Обновляем…",
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
          {confirmation.action === "restore" ? "Какие миры восстановить?" : "Удалить эту копию?"}
        </h4>
        {confirmation.action === "restore" ? (
          <>
            <p className="wb-restore-note">
              Выбранные миры заменят текущие в игре. Перед заменой сохраним их прежние версии.
            </p>
            <div className="wb-toolbar wb-toolbar--compact">
              <span>
                {confirmation.worlds.length} из {confirmation.backup.worlds.length} выбрано
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
                  ? "Снять выбор"
                  : "Выбрать все"}
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
                      ? "Заменить в игре"
                      : "Вернуть в игру"
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
          <p className="wb-restore-note">
            Удалится только эта резервная копия. Миры в игре останутся.
          </p>
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
            Отмена
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
              ? "Удалить копию"
              : `Восстановить · ${worldCount(confirmation.worlds.length)}`}
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
            <h2 id="wb-title">Резервные копии</h2>
          </div>
          <div className="wb-header-actions">
            <span className="wb-progress" role="status">
              {backups.operation ? busyText[backups.operation] : backups.loading ? "Загрузка…" : ""}
            </span>
            <button
              className="wb-icon-button"
              type="button"
              aria-label="Обновить миры и копии"
              title="Обновить"
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
              aria-label="Закрыть резервные копии"
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
        {running && (
          <div className="wb-message">Закрой игру, чтобы создать копию или восстановить миры.</div>
        )}

        <CustomScrollArea className="wb-body-scroll">
          <div className="wb-columns">
            <section
              className="wb-panel wb-panel--create"
              aria-labelledby="wb-worlds-heading"
              aria-busy={backups.working}
            >
              <div className="wb-section-heading">
                <h3 id="wb-worlds-heading">Миры для копии</h3>
              </div>
              <div className="wb-toolbar">
                <div>
                  <span>
                    {selected.size} из {backups.worlds.length} выбрано
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
                    ? "Снять выбор"
                    : "Выбрать все"}
                </button>
              </div>
              <CustomScrollArea className="wb-scroll" onWheel={(event) => event.stopPropagation()}>
                <div className="wb-world-grid">
                  {backups.loading ? (
                    <div className="wb-empty">Загружаем миры…</div>
                  ) : !backups.worlds.length ? (
                    <div className="wb-empty">
                      <BackupIcon />
                      <h3>Здесь появятся твои миры</h3>
                      <p>Создай мир в этой сборке и вернись, чтобы сохранить его.</p>
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
                  Название копии <span>необязательно</span>
                </label>
                <div className="wb-compose-row">
                  <input
                    id="wb-name"
                    maxLength={80}
                    value={name}
                    disabled={backups.working}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Например, перед обновлением модов"
                  />
                  <button
                    type="submit"
                    className="wb-primary"
                    disabled={backups.working || running || !selected.size}
                  >
                    <BackupIcon />
                    {backups.operation === "create" ? "Сохраняем…" : "Создать копию"}
                    <span>{formatSize(selectedSize)}</span>
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
                <h3 id="wb-history-heading">Сохранённые копии</h3>
                <span>{backups.backups.length}</span>
              </div>
              <div className="wb-toolbar">
                <div className="wb-filters" role="group" aria-label="Тип копий">
                  {(
                    [
                      ["all", "Все"],
                      ["manual", "Мои"],
                      ["beforeRestore", "Автоматические"],
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
                  {formatSize(backups.backups.reduce((size, backup) => size + backup.sizeBytes, 0))}
                </span>
              </div>
              <CustomScrollArea
                key={`${filter}:${historyRevision}`}
                className="wb-scroll wb-scroll--history"
                onWheel={(event) => event.stopPropagation()}
              >
                <div className="wb-history-list">
                  {backups.loading ? (
                    <div className="wb-empty">Загружаем копии…</div>
                  ) : !visible.length ? (
                    <div className="wb-empty">
                      <BackupIcon />
                      <h3>
                        {backups.backups.length
                          ? "Таких копий пока нет"
                          : "Пока нет сохранённых копий"}
                      </h3>
                      <p>
                        {filter === "beforeRestore"
                          ? "Они появятся после восстановления миров."
                          : "Сохрани нужные миры, чтобы вернуться к ним позже."}
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
                              <h3>{backup.name || "Копия миров"}</h3>
                              {backup.kind === "beforeRestore" && (
                                <span className="wb-badge">Авто</span>
                              )}
                              {backups.restoredId === backup.id && (
                                <span className="wb-restored">
                                  <BackupIcon kind="check" />
                                  Восстановлена
                                </span>
                              )}
                            </div>
                            <time>{formatDate(backup.createdAt)}</time>
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
                            <span>Состав копии</span>
                            <span>{worldCount(backup.worldCount)}</span>
                            <BackupIcon kind="chevron" />
                          </button>
                          {expanded.has(backup.id) && (
                            <ul
                              id={`wb-contents-${backup.id}`}
                              className="wb-saved-worlds"
                              aria-label="Миры в копии"
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
                                    <small>{formatDate(world.modifiedAt, true)}</small>
                                  </span>
                                  <small>{formatSize(world.sizeBytes)}</small>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="wb-backup-bottom">
                          <span>
                            {worldCount(backup.worldCount)}
                            <span className="wb-dot">·</span>
                            {formatSize(backup.sizeBytes)}
                            {backup.kind === "beforeRestore" && (
                              <span className="wb-auto-label"> · Перед восстановлением</span>
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
                                Восстановить
                              </button>
                              <button
                                type="button"
                                className="wb-icon-button wb-delete"
                                aria-label={`Удалить копию ${backup.name || formatDate(backup.createdAt)}`}
                                title="Удалить копию"
                                disabled={backups.working}
                                onClick={() => beginConfirmation(backup, "delete")}
                              >
                                <BackupIcon kind="trash" />
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
