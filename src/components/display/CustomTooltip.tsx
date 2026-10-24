import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./CustomTooltip.css";

interface TooltipState {
  target: HTMLElement;
  text: string;
}

const SHOW_DELAY = 600;
const HIDE_DELAY = 120;
const VIEWPORT_MARGIN = 12;
const TARGET_GAP = 8;

function tooltipTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>("[data-tooltip]");
  return element?.dataset.tooltip?.trim() ? element : null;
}

/** One tooltip layer for every launcher window, including controls inside portals. */
export function CustomTooltip() {
  const id = useId();
  const popupRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const activeTarget = tooltip?.target;

  useEffect(() => {
    let target: HTMLElement | null = null;
    let visible = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const clearShowTimer = () => {
      clearTimeout(showTimer);
      showTimer = undefined;
    };
    const clearHideTimer = () => {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    };

    const hide = () => {
      clearShowTimer();
      clearHideTimer();
      target = null;
      visible = false;
      setTooltip(null);
    };

    const show = (next: HTMLElement | null, immediate = false) => {
      if (!next) {
        hide();
        return;
      }
      if (next === target) {
        clearHideTimer();
        if (visible || (showTimer && !immediate)) return;
        clearShowTimer();
      } else {
        hide();
        target = next;
      }
      const reveal = () => {
        showTimer = undefined;
        const text = next.dataset.tooltip?.trim();
        if (next.isConnected && text) {
          visible = true;
          setTooltip({ target: next, text });
        }
      };
      if (immediate) reveal();
      else showTimer = setTimeout(reveal, SHOW_DELAY);
    };

    const insidePopup = (node: EventTarget | null) =>
      node instanceof Node && !!popupRef.current?.contains(node);

    const scheduleHide = () => {
      clearShowTimer();
      clearHideTimer();
      hideTimer = setTimeout(hide, HIDE_DELAY);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (insidePopup(event.target)) clearHideTimer();
      else {
        const next = tooltipTarget(event.target);
        if (next) show(next);
        else scheduleHide();
      }
    };

    const onPointerOut = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const next = event.relatedTarget;
      if (insidePopup(next) || (next instanceof Node && target?.contains(next))) return;
      scheduleHide();
    };

    const onFocusIn = (event: FocusEvent) => show(tooltipTarget(event.target), true);
    const onFocusOut = (event: FocusEvent) => {
      if (tooltipTarget(event.relatedTarget) !== target) hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    const onScroll = (event: Event) => {
      if (!insidePopup(event.target)) hide();
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("close", hide, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", hide);
    window.addEventListener("resize", hide);
    return () => {
      clearShowTimer();
      clearHideTimer();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("close", hide, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", hide);
      window.removeEventListener("resize", hide);
    };
  }, []);

  useEffect(() => {
    if (!activeTarget) return;
    const target = activeTarget;
    const describedBy = target.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) ?? [];
    target.setAttribute("aria-describedby", [...describedBy, id].join(" "));

    // Copy feedback and other changing hints update without leaving the control.
    const observer = new MutationObserver(() => {
      const text = target.dataset.tooltip?.trim();
      setTooltip((current) => {
        if (!current || current.target !== target) return current;
        if (!target.isConnected || !text) return null;
        return current.text === text ? current : { target, text };
      });
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-tooltip"],
    });
    return () => {
      observer.disconnect();
      const remaining = target
        .getAttribute("aria-describedby")
        ?.split(/\s+/)
        .filter((value) => value && value !== id);
      if (remaining?.length) target.setAttribute("aria-describedby", remaining.join(" "));
      else target.removeAttribute("aria-describedby");
    };
  }, [id, activeTarget]);

  useLayoutEffect(() => {
    if (!tooltip || !popupRef.current) return;
    const anchor = tooltip.target.getBoundingClientRect();
    const popup = popupRef.current.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(
        anchor.left + (anchor.width - popup.width) / 2,
        viewportWidth - popup.width - VIEWPORT_MARGIN,
      ),
    );
    const below = anchor.bottom + TARGET_GAP;
    const top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(
        below + popup.height <= viewportHeight - VIEWPORT_MARGIN
          ? below
          : anchor.top - popup.height - TARGET_GAP,
        viewportHeight - popup.height - VIEWPORT_MARGIN,
      ),
    );
    setPosition({ left, top, visibility: "visible" });
  }, [tooltip]);

  if (!tooltip) return null;
  return createPortal(
    <div ref={popupRef} id={id} className="custom-tooltip" role="tooltip" style={position}>
      {tooltip.text}
    </div>,
    // Native modal dialogs render above body portals, regardless of z-index.
    tooltip.target.closest("dialog[open]") ?? document.body,
  );
}
