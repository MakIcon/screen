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
}: CustomScrollAreaProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ y: 0, scrollTop: 0 });

  const [thumb, setThumb] = useState({ height: 0, top: 0, visible: false });

  const recalc = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    const { scrollHeight, clientHeight, scrollTop } = el;

    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => ({ ...t, visible: false }));
      return;
    }

    const trackH = clientHeight - TRACK_INSET * 2;
    const ratio = clientHeight / scrollHeight;
    const height = Math.max(28, ratio * trackH);
    const maxThumbTop = trackH - height;
    const maxScrollTop = scrollHeight - clientHeight;
    const top =
      maxScrollTop > 0
        ? TRACK_INSET + (scrollTop / maxScrollTop) * maxThumbTop
        : TRACK_INSET;

    setThumb({ height, top, visible: true });
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    el.addEventListener("scroll", recalc, { passive: true });
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    recalc();

    return () => {
      el.removeEventListener("scroll", recalc);
      ro.disconnect();
    };
  }, [recalc]);

  const onThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    isDragging.current = true;
    dragStart.current = {
      y: e.clientY,
      scrollTop: contentRef.current?.scrollTop ?? 0,
    };

    const onMove = (ev: PointerEvent) => {
      if (!isDragging.current) return;
      const el = contentRef.current;
      if (!el) return;

      const dy = ev.clientY - dragStart.current.y;
      const { scrollHeight, clientHeight } = el;
      const trackH = clientHeight - TRACK_INSET * 2;
      const thumbH = Math.max(28, (clientHeight / scrollHeight) * trackH);
      const maxThumbTravel = trackH - thumbH;
      const maxScrollTop = scrollHeight - clientHeight;

      if (maxThumbTravel <= 0) return;

      const scrollDelta = (dy / maxThumbTravel) * maxScrollTop;
      el.scrollTop = Math.max(
        0,
        Math.min(maxScrollTop, dragStart.current.scrollTop + scrollDelta)
      );
    };

    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* Click on the track (outside the thumb) — jump to position */
  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = contentRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top - TRACK_INSET;
    const trackH = rect.height - TRACK_INSET * 2;
    const ratio = Math.max(0, Math.min(1, clickY / trackH));
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    el.scrollTop = ratio * maxScrollTop;
  };

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    recalc();
    onScroll?.(e);
  };

  return (
    <div
      className={`csa-root ${className}`}
      style={{ position: "relative", display: "flex", minHeight: 0, ...style }}
    >
      {/* scrollable viewport — native bar hidden */}
      <div
        ref={contentRef}
        className="csa-content"
        onWheel={onWheel}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "scroll",
          overflowX: "hidden",
          minHeight: 0,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        } as CSSProperties}
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
            right: 0,
            top: 0,
            bottom: 0,
            /* wider click-target than the visual thumb */
            width: 14,
            cursor: "default",
          }}
        >
          {/* thin square thumb — no border-radius, matches sharp-corner style */}
          <div
            className="csa-thumb"
            onPointerDown={onThumbPointerDown}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background =
                "rgba(26,26,26,0.48)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background =
                "rgba(26,26,26,0.2)";
            }}
            style={{
              position: "absolute",
              /* centered in the 14px track */
              right: 4,
              top: thumb.top,
              width: 3,
              height: thumb.height,
              borderRadius: 0,
              background: "rgba(26,26,26,0.2)",
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
