import { useEffect, useRef, type ReactNode } from "react";
import "./ElementPopup.css";

export type PopupPlacement = "top" | "bottom" | "left" | "right";

export interface ElementPopupProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    children?: ReactNode;
    placement?: PopupPlacement;
    triggerRef?: React.RefObject<HTMLElement | null>;
    className?: string;
}

export function ElementPopup({
    open,
    onClose,
    title,
    children,
    placement = "bottom",
    triggerRef,
    className,
}: ElementPopupProps) {
    const popupRef = useRef<HTMLDivElement>(null);

    /* close on Escape */
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        if (open) document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    /* close on outside click */
    useEffect(() => {
        function onDown(e: MouseEvent) {
            if (!open) return;
            const target = e.target as Node;
            if (popupRef.current?.contains(target)) return;
            if (triggerRef?.current?.contains(target)) return;
            // Don't close while interacting with portal-rendered sub-popups (e.g. ColorPicker)
            if ((target as Element).closest?.(".cp-popup")) return;
            onClose();
        }
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open, onClose, triggerRef]);

    const isModal = !triggerRef;

    return (
        <>
            {/* backdrop — only in modal mode */}
            {open && isModal && (
                <div className="ep-backdrop" onClick={onClose} />
            )}

            <div
                ref={popupRef}
                className={[
                    "ep-popup",
                    `ep-popup--${placement}`,
                    open ? "ep-popup--open" : "",
                    isModal ? "ep-popup--modal" : "",
                    className ?? "",
                ].join(" ")}
                role="dialog"
                aria-modal="true"
                aria-hidden={!open}
            >
                {title && (
                    <div className="ep-header">
                        <span className="ep-title">{title}</span>
                        <button className="ep-close" onClick={onClose} aria-label="Close">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                                 stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="1" y1="1" x2="13" y2="13" />
                                <line x1="13" y1="1" x2="1" y2="13" />
                            </svg>
                        </button>
                    </div>
                )}

                <div className="ep-body">{children}</div>
            </div>
        </>
    );
}
