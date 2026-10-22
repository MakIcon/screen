import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../../i18n/locale";

type Point = { x: number; y: number };
type Sign = {
  id: "stop" | "system" | "maximum";
  x: number;
  y: number;
  start: Point;
  target: Point;
};
type Layout = {
  signs: Sign[];
  theme: CSSProperties;
};

const SIGN_WIDTH = 232;
const MARGIN = 12;

function arrowPath(start: Point, target: Point) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const control1 = { x: start.x + dx * 0.3 - dy * 0.25, y: start.y + dy * 0.2 };
  const control2 = { x: start.x + dx * 0.65, y: start.y + dy * 0.85 - dx * 0.3 };
  const angle = Math.atan2(target.y - control2.y, target.x - control2.x);
  const wing = (side: number) => ({
    x: target.x - 16 * Math.cos(angle) + side * 9 * Math.sin(angle),
    y: target.y - 16 * Math.sin(angle) - side * 9 * Math.cos(angle),
  });
  const a = wing(1);
  const b = wing(-1);
  return `M${start.x} ${start.y}C${control1.x} ${control1.y} ${control2.x} ${control2.y} ${target.x} ${target.y}M${a.x} ${a.y}L${target.x} ${target.y} ${b.x} ${b.y}`;
}

/** The artwork lives outside the settings scroll viewport so neighbouring cards cannot clip it. */
export function RamWarningSigns({
  message,
  level,
  ramGb,
}: {
  message: string;
  level: 0 | 1 | 2 | 3;
  ramGb: number;
}) {
  const tr = useTranslation();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || level === 0) return;
    const block = anchor.closest(".settings-memory-block");
    const value = block?.querySelector(".memory-value");
    const thumb = block?.querySelector(".es-thumb");
    const viewport = anchor.closest(".csa-content");
    if (!value || !thumb) return;
    let frame = 0;
    const update = () => {
      const bounds = anchor.getBoundingClientRect();
      const clip = viewport?.getBoundingClientRect();
      if (
        bounds.width === 0 ||
        bounds.bottom <= Math.max(0, clip?.top ?? 0) ||
        bounds.top >= Math.min(window.innerHeight, clip?.bottom ?? window.innerHeight)
      ) {
        setLayout(null);
        return;
      }
      const valueBounds = value.getBoundingClientRect();
      const thumbBounds = thumb.getBoundingClientRect();
      const clampX = (x: number) =>
        Math.max(MARGIN, Math.min(x, window.innerWidth - SIGN_WIDTH - MARGIN));
      const clampY = (y: number) => Math.max(MARGIN, Math.min(y, window.innerHeight - 64 - MARGIN));
      const rightFits = bounds.right + 36 + SIGN_WIDTH < window.innerWidth - MARGIN;
      const stop = { x: clampX(bounds.left + 28), y: clampY(bounds.top - 18) };
      const system = {
        x: clampX(rightFits ? bounds.right + 36 : bounds.right - SIGN_WIDTH),
        y: clampY(rightFits ? bounds.top - 62 : bounds.bottom + 76),
      };
      const maximum = { x: clampX(bounds.left - 174), y: clampY(bounds.top - 90) };
      const signs: Sign[] = [
        {
          id: "stop",
          ...stop,
          start: { x: stop.x + 24, y: stop.y + 26 },
          target: { x: valueBounds.right + 8, y: valueBounds.top + valueBounds.height * 0.55 },
        },
      ];
      if (level >= 2) {
        signs.push({
          id: "system",
          ...system,
          start: { x: system.x + 22, y: system.y + 20 },
          target: { x: thumbBounds.left + thumbBounds.width / 2, y: thumbBounds.top - 8 },
        });
      }
      if (level >= 3) {
        signs.push({
          id: "maximum",
          ...maximum,
          start: { x: maximum.x + 22, y: maximum.y + 30 },
          target: { x: valueBounds.left - 8, y: valueBounds.top + valueBounds.height * 0.55 },
        });
      }
      const style = getComputedStyle(anchor);
      setLayout({
        signs,
        theme: {
          "--danger": style.getPropertyValue("--danger"),
          "--bg": style.getPropertyValue("--bg"),
          fontFamily: style.fontFamily,
        } as CSSProperties,
      });
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(anchor);
    observer.observe(value);
    if (viewport) observer.observe(viewport);
    const themeObserver = new MutationObserver(scheduleUpdate);
    for (let ancestor: HTMLElement | null = anchor; ancestor; ancestor = ancestor.parentElement) {
      themeObserver.observe(ancestor, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      });
    }
    window.addEventListener("resize", scheduleUpdate);
    document.addEventListener("scroll", scheduleUpdate, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      document.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [level, ramGb]);

  return (
    <>
      <div ref={anchorRef} className="ram-allocation-warning ram-warning-anchor" role="status">
        <span className="ram-warning-signs-description">{message}</span>
      </div>
      {layout &&
        createPortal(
          <div className="ram-warning-overlay" style={layout.theme} aria-hidden="true">
            <svg className="ram-warning-arrows" fill="none">
              {layout.signs.map((sign) => (
                <path
                  className="ram-warning-arrow"
                  key={sign.id}
                  d={arrowPath(sign.start, sign.target)}
                />
              ))}
            </svg>
            {layout.signs.map((sign) => (
              <div
                key={sign.id}
                className={`ram-warning-sign ram-warning-sign--${sign.id}`}
                style={{ left: sign.x, top: sign.y }}
              >
                {sign.id === "stop" ? (
                  <>
                    <strong>{tr("ram.warningSignTitle")}</strong>
                    <span>{tr("ram.warningSignRisk")}</span>
                  </>
                ) : sign.id === "system" ? (
                  tr("ram.warningSignAction")
                ) : (
                  <>
                    <strong>{tr("ram.warningSignMaximum")}</strong>
                    <span>{tr("ram.warningSignReduce")}</span>
                  </>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
