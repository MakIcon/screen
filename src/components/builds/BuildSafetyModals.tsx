import { useState } from "react";
import type { InstanceItem, WorldBackupInfo } from "../../types";
import "./BuildSafetyModals.css";

type TrashProps = {
  items: InstanceItem[];
  working: boolean;
  error: string;
  onClose: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
};

export function DeletedBuildsModal({
  items,
  working,
  error,
  onClose,
  onRestore,
  onPurge,
}: TrashProps) {
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  return (
    <div className="confirm-overlay" onClick={() => !working && onClose()}>
      <div
        className="confirm-dialog build-safety-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Корзина сборок"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="confirm-label">BUILD TRASH</span>
        <p className="confirm-title">Удалённые сборки</p>
        <p className="confirm-body">
          Файлы остаются на диске до окончательного удаления. Оно также удалит резервные копии миров
          этой сборки.
        </p>
        <div className="build-safety-list">
          {items.length === 0 && <p className="panel-text">Корзина пуста.</p>}
          {items.map((item) => (
            <div className="build-safety-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>
                  {item.version} / {item.loader}
                </span>
              </div>
              <div className="build-safety-actions">
                <button
                  className="ghost-action"
                  type="button"
                  disabled={working}
                  onClick={() => onRestore(item.id)}
                >
                  RESTORE
                </button>
                {confirmPurge === item.id ? (
                  <button
                    className="ghost-action build-safety-danger"
                    type="button"
                    disabled={working}
                    onClick={() => {
                      setConfirmPurge(null);
                      onPurge(item.id);
                    }}
                  >
                    CONFIRM DELETE
                  </button>
                ) : (
                  <button
                    className="ghost-action build-safety-danger"
                    type="button"
                    disabled={working}
                    onClick={() => setConfirmPurge(item.id)}
                  >
                    DELETE FOREVER
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {error && (
          <p className="build-safety-error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          <button className="ghost-action" type="button" disabled={working} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

type BackupsProps = {
  instance: InstanceItem;
  backups: WorldBackupInfo[];
  working: boolean;
  running: boolean;
  error: string;
  onClose: () => void;
  onCreate: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
};

export function WorldBackupsModal({
  instance,
  backups,
  working,
  running,
  error,
  onClose,
  onCreate,
  onRestore,
  onDelete,
}: BackupsProps) {
  const [confirmation, setConfirmation] = useState<{
    id: string;
    action: "restore" | "delete";
  } | null>(null);
  const formatDate = (seconds: string) => {
    const value = Number(seconds);
    return Number.isFinite(value) ? new Date(value * 1000).toLocaleString() : seconds;
  };
  const cancelConfirmationButton = (
    <button
      className="ghost-action"
      type="button"
      disabled={working}
      onClick={() => setConfirmation(null)}
    >
      CANCEL
    </button>
  );
  return (
    <div className="confirm-overlay" onClick={() => !working && onClose()}>
      <div
        className="confirm-dialog build-safety-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Резервные копии миров"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="confirm-label">WORLD BACKUPS</span>
        <p className="confirm-title">{instance.name}</p>
        <p className="confirm-body">
          Сохраняются миры из папки saves. Перед восстановлением текущие миры копируются
          автоматически.
        </p>
        {running && (
          <p className="build-safety-error">
            Останови игру, чтобы создавать или восстанавливать копии.
          </p>
        )}
        <button
          className="primary-action"
          type="button"
          disabled={working || running}
          onClick={onCreate}
        >
          {working ? "WORKING..." : "CREATE BACKUP"}
        </button>
        <div className="build-safety-list">
          {backups.length === 0 && <p className="panel-text">Копий пока нет.</p>}
          {backups.map((backup) => {
            const action = confirmation?.id === backup.id ? confirmation.action : null;
            return (
              <div className="build-safety-row" key={backup.id}>
                <div>
                  <strong>{formatDate(backup.createdAt)}</strong>
                  <span>Миров: {backup.worldCount}</span>
                </div>
                <div className="build-safety-actions">
                  {action ? (
                    <>
                      {action === "delete" && cancelConfirmationButton}
                      <button
                        className="ghost-action build-safety-danger"
                        type="button"
                        disabled={working || (action === "restore" && running)}
                        onClick={() => {
                          setConfirmation(null);
                          if (action === "delete") onDelete(backup.id);
                          else onRestore(backup.id);
                        }}
                      >
                        {action === "delete" ? "CONFIRM DELETE" : "CONFIRM RESTORE"}
                      </button>
                      {action === "restore" && cancelConfirmationButton}
                    </>
                  ) : (
                    <>
                      <button
                        className="ghost-action"
                        type="button"
                        disabled={working || running}
                        onClick={() => setConfirmation({ id: backup.id, action: "restore" })}
                      >
                        RESTORE
                      </button>
                      <button
                        className="ghost-action build-safety-danger"
                        type="button"
                        disabled={working}
                        onClick={() => setConfirmation({ id: backup.id, action: "delete" })}
                      >
                        DELETE
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {error && (
          <p className="build-safety-error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          <button className="ghost-action" type="button" disabled={working} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
