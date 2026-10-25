import { useState } from "react";
import type { InstanceItem } from "../../types";
import "./BuildSafetyModals.css";
import { useTranslation } from "../../i18n/locale";
import { Button } from "../inputs/Button";

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
  const tr = useTranslation();
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  return (
    <div className="confirm-overlay" onClick={() => !working && onClose()}>
      <div
        className="confirm-dialog build-safety-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr("buildSafetyModals.buildTrash")}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="confirm-label">{tr("buildSafetyModals.buildTrash2")}</span>
        <p className="confirm-title">{tr("buildSafetyModals.deletedBuilds")}</p>
        <p className="confirm-body">{tr("buildSafetyModals.filesRemainOnDisk")}</p>
        <div className="build-safety-list">
          {items.length === 0 && (
            <p className="panel-text">{tr("buildSafetyModals.trashIsEmpty")}</p>
          )}
          {items.map((item) => (
            <div className="build-safety-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>
                  {item.version} / {item.loader}
                </span>
              </div>
              <div className="build-safety-actions">
                <Button type="button" disabled={working} onClick={() => onRestore(item.id)}>
                  {tr("buildSafetyModals.restore")}
                </Button>
                {confirmPurge === item.id ? (
                  <Button
                    variant="danger"
                    type="button"
                    disabled={working}
                    onClick={() => {
                      setConfirmPurge(null);
                      onPurge(item.id);
                    }}
                  >
                    {tr("buildSafetyModals.confirmDelete")}
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    type="button"
                    disabled={working}
                    onClick={() => setConfirmPurge(item.id)}
                  >
                    {tr("buildSafetyModals.deleteForever")}
                  </Button>
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
          <Button type="button" disabled={working} onClick={onClose}>
            {tr("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
