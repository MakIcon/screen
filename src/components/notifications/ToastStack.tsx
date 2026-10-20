import type { Toast, ToastKind } from "../../hooks/useToasts";
import { useTranslation } from "../../i18n/locale";

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === "error") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 7v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "warning") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3.5 21 19H3L12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M12 9v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8.5 12.2 11 14.7l4.5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  const tr = useTranslation();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="region" aria-label={tr("toast.notifications")}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          <span className="toast-icon">
            <ToastIcon kind={toast.kind} />
          </span>
          <div className="toast-body">
            <span className="toast-title">{toast.title ?? tr(`toast.default.${toast.kind}`)}</span>
            <span className="toast-message">{toast.message}</span>
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label={tr("toast.dismiss")}
            onClick={() => onDismiss(toast.id)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
