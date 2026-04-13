import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MicrosoftAccount } from "../../types";

interface Props {
  accounts: MicrosoftAccount[];
  activeAccountId: string | null;
  onSelect: (id: string) => void;
  onAccountsChange: (accounts: MicrosoftAccount[]) => void;
  onClose: () => void;
}

export function MicrosoftAccountsModal({
  accounts,
  activeAccountId,
  onSelect,
  onAccountsChange,
  onClose,
}: Props) {
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleAdd = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const account = await invoke<MicrosoftAccount>("start_microsoft_auth");
      const updated = [...accounts.filter((a) => a.uuid !== account.uuid), account];
      onAccountsChange(updated);
      onSelect(account.id);
    } catch (e) {
      const msg = String(e);
      if (!msg.includes("cancelled")) setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await invoke("remove_microsoft_account", { id });
      const updated = accounts.filter((a) => a.id !== id);
      onAccountsChange(updated);
      if (activeAccountId === id) {
        onSelect(updated[0]?.id ?? "");
      }
    } catch (e) {
      setAuthError(String(e));
    }
  };

  return (
    <div className="confirm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ms-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ms-modal-head">
          <span className="ms-modal-tag">ACCOUNTS</span>
          <span className="ms-modal-title">Microsoft Accounts</span>
          <button className="ms-modal-close" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Account list */}
        <div className="ms-modal-body">
          {accounts.length === 0 && !authLoading && (
            <div className="ms-modal-empty">
              <span>No Microsoft accounts added yet.</span>
              <span className="ms-modal-empty-sub">
                Click below to sign in with your Microsoft account.
              </span>
            </div>
          )}

          {accounts.map((acc) => {
            const isActive = acc.id === activeAccountId;
            return (
              <button
                key={acc.id}
                className={`ms-account-row${isActive ? " active" : ""}`}
                onClick={() => onSelect(acc.id)}
              >
                <div className="ms-account-avatar">
                  <img
                    src={`https://mc-heads.net/avatar/${acc.uuid}/32`}
                    alt={acc.username}
                    width={32}
                    height={32}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="ms-account-info">
                  <span className="ms-account-name">{acc.username}</span>
                  <span className="ms-account-uuid">{acc.uuid}</span>
                </div>
                <div className="ms-account-actions">
                  {isActive && (
                    <span className="ms-account-badge">ACTIVE</span>
                  )}
                  <button
                    className="ms-account-remove"
                    title="Remove account"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(acc.id);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M1.5 3H10.5M4.5 3V2H7.5V3M2.5 3L3 10H9L9.5 3"
                        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </button>
            );
          })}

          {authLoading && (
            <div className="ms-auth-loading">
              <div className="ms-auth-spinner" />
              <span>Waiting for sign-in…</span>
              <span className="ms-auth-loading-sub">Complete login in the Microsoft window</span>
            </div>
          )}

          {authError && (
            <div className="ms-auth-error">{authError}</div>
          )}
        </div>

        {/* Footer */}
        <div className="ms-modal-footer">
          <button
            className="ms-add-btn"
            onClick={handleAdd}
            disabled={authLoading}
          >
            {authLoading ? (
              <>
                <div className="ms-add-spinner" />
                Signing in…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                ADD MICROSOFT ACCOUNT
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
