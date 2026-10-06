import "./CustomScrollArea.css";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type WheelEvent,
  type CSSProperties,
  type UIEvent,
} from "react";

interface CustomScrollAreaProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onWheel?: (e: WheelEvent<HTMLDivElement>) => void;
  onScroll?: (e: UIEvent<HTMLDivElement>) => void;
  orientation?: "vertical" | "horizontal";
  thumbThickness?: number;
  tabIndex?: number;
  "aria-label"?: string;
}

/* How many px to inset the thumb track from top and bottom.
   Acts as visual breathing room instead of scroll arrows. */
const TRACK_INSET = 6;

export function CustomScrollArea({
  children,
  className = "",
  style = {},
  onWheel,
  onScroll,
  orientation = "vertical",
  thumbThickness = 3,
  tabIndex,
  "aria-label": ariaLabel,
}: CustomScrollAreaProps) {
  const horizontal = orientation === "horizontal";
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ pointer: 0, scroll: 0 });
  const stopDragRef = useRef<(() => void) | null>(null);

  const [thumb, setThumb] = useState({ height: 0, top: 0, visible: false });

  const recalc = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    const scrollHeight = horizontal ? el.scrollWidth : el.scrollHeight;
    const clientHeight = horizontal ? el.clientWidth : el.clientHeight;
    const scrollTop = horizontal ? el.scrollLeft : el.scrollTop;

    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => ({ ...t, visible: false }));
      return;
    }

    const trackH = Math.max(0, clientHeight - TRACK_INSET * 2);
    const ratio = clientHeight / scrollHeight;
    const height = Math.min(trackH, Math.max(28, ratio * trackH));
    const maxThumbTop = trackH - height;
    const maxScrollTop = scrollHeight - clientHeight;
    const top =
      maxScrollTop > 0 ? TRACK_INSET + (scrollTop / maxScrollTop) * maxThumbTop : TRACK_INSET;

    setThumb({ height, top, visible: true });
  }, [horizontal]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    el.addEventListener("scroll", recalc, { passive: true });
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    const observeChildren = () => {
      ro.disconnect();
      ro.observe(el);
      Array.from(el.children).forEach((child) => ro.observe(child));
      recalc();
    };
    const mo = new MutationObserver(observeChildren);
    mo.observe(el, { childList: true });
    observeChildren();
    recalc();

    return () => {
      el.removeEventListener("scroll", recalc);
      ro.disconnect();
      mo.disconnect();
      stopDragRef.current?.();
    };
  }, [recalc]);

  useEffect(() => {
    const root = rootRef.current;
    const el = contentRef.current;
    if (!horizontal || !root || !el) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (maxScroll <= 1 || !delta) return;
      const unit =
        event.deltaMode === 1
          ? parseFloat(getComputedStyle(el).lineHeight) || 16
          : event.deltaMode === 2
            ? el.clientWidth
            : 1;
      event.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(maxScroll, el.scrollLeft + delta * unit));
    };

    // React's delegated wheel listener is passive; use a native listener so
    // a vertical wheel scrolls the horizontal viewport without scrolling its parent.
    root.addEventListener("wheel", handleWheel, { passive: false });
    return () => root.removeEventListener("wheel", handleWheel);
  }, [horizontal]);

  const onThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    stopDragRef.current?.();
    isDragging.current = true;
    dragStart.current = {
      pointer: horizontal ? e.clientX : e.clientY,
      scroll: (horizontal ? contentRef.current?.scrollLeft : contentRef.current?.scrollTop) ?? 0,
    };

    const onMove = (ev: PointerEvent) => {
      if (!isDragging.current) return;
      const el = contentRef.current;
      if (!el) return;

      const dy = (horizontal ? ev.clientX : ev.clientY) - dragStart.current.pointer;
      const scrollHeight = horizontal ? el.scrollWidth : el.scrollHeight;
      const clientHeight = horizontal ? el.clientWidth : el.clientHeight;
      const trackH = Math.max(0, clientHeight - TRACK_INSET * 2);
      const thumbH = Math.min(trackH, Math.max(28, (clientHeight / scrollHeight) * trackH));
      const maxThumbTravel = trackH - thumbH;
      const maxScrollTop = scrollHeight - clientHeight;

      if (maxThumbTravel <= 0) return;

      const scrollDelta = (dy / maxThumbTravel) * maxScrollTop;
      const next = Math.max(0, Math.min(maxScrollTop, dragStart.current.scroll + scrollDelta));
      if (horizontal) el.scrollLeft = next;
      else el.scrollTop = next;
    };

    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      stopDragRef.current = null;
    };

    stopDragRef.current = onUp;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  /* Click on the track (outside the thumb) — jump to position */
  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = contentRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const rect = track.getBoundingClientRect();
    if (e.target !== track) return;
    const clickY = (horizontal ? e.clientX - rect.left : e.clientY - rect.top) - TRACK_INSET;
    const trackH = (horizontal ? rect.width : rect.height) - TRACK_INSET * 2;
    if (trackH <= 0) return;
    const ratio = Math.max(0, Math.min(1, clickY / trackH));
    const maxScrollTop = horizontal
      ? el.scrollWidth - el.clientWidth
      : el.scrollHeight - el.clientHeight;
    if (horizontal) el.scrollLeft = ratio * maxScrollTop;
    else el.scrollTop = ratio * maxScrollTop;
  };

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    recalc();
    onScroll?.(e);
  };

  return (
    <div
      ref={rootRef}
      className={`csa-root${horizontal ? " csa-horizontal" : ""} ${className}`}
      style={{ position: "relative", display: "flex", minHeight: 0, ...style }}
    >
      {/* scrollable viewport — native bar hidden */}
      <div
        ref={contentRef}
        className="csa-content"
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        data-appearance-layout-container="true"
        onWheel={onWheel}
        onScroll={handleScroll}
        style={
          {
            flex: 1,
            overflowY: horizontal ? "hidden" : "scroll",
            overflowX: horizontal ? "auto" : "hidden",
            minHeight: 0,
            minWidth: 0,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          } as CSSProperties
        }
      >
        {children}
      </div>

      {/* custom track */}
      {thumb.visible && (
        <div
          ref={trackRef}
          className="csa-track"
          onClick={onTrackClick}
          style={{
            position: "absolute",
            ...(horizontal
              ? { left: 0, right: 0, bottom: 0, height: 16 }
              : { right: 0, top: 0, bottom: 0, width: 14 }),
            /* wider click-target than the visual thumb */
            cursor: "default",
          }}
        >
          {/* thin square thumb — no border-radius, matches sharp-corner style */}
          <div
            className="csa-thumb"
            data-mascot-scroll-thumb
            onPointerDown={onThumbPointerDown}
            style={{
              position: "absolute",
              /* centered in the 14px track */
              ...(horizontal
                ? { left: thumb.top, bottom: 4, width: thumb.height, height: thumbThickness }
                : { right: 4, top: thumb.top, width: thumbThickness, height: thumb.height }),
              borderRadius: 0,
              cursor: "grab",
              userSelect: "none",
              transition: "background 0.18s",
            }}
          />
        </div>
      )}
    </div>
  );
}
