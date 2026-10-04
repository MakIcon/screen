import { useState } from "react";
import type { InstanceItem } from "../../types";
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
