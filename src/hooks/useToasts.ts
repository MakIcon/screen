import { useCallback, useRef, useState } from "react";

export type ToastKind = "info" | "warning" | "error";

export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  title?: string;
};

export type PushToastOptions = {
  /** Title shown above the message in caps. Defaults per kind. */
  title?: string;
  /** Auto-dismiss delay in ms. Pass 0 to keep until dismissed. */
  duration?: number;
};

export type PushToast = (
  kind: ToastKind,
  message: string,
  options?: PushToastOptions,
) => number;

const DEFAULT_DURATION: Record<ToastKind, number> = {
  info: 4000,
  warning: 6000,
  error: 8000,
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (kind: ToastKind, message: string, options: PushToastOptions = {}) => {
      const id = (idRef.current += 1);
      const toast: Toast = { id, kind, message, title: options.title };
      // Keep the stack short so it never swallows the launcher.
      setToasts((prev) => [...prev.slice(-3), toast]);

      const duration = options.duration ?? DEFAULT_DURATION[kind];
      if (duration > 0) {
        const timer = window.setTimeout(() => dismissToast(id), duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismissToast],
  );

  return { toasts, pushToast, dismissToast };
}
