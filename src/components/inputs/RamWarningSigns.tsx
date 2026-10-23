import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../../i18n/locale";
import { RAM_SIGN_PUSH_EVENT, type RamSignPushDetail } from "./ramSignEvents";
import {
  advanceRope,
  createRope,
  nudgeRope,
  pushRope,
  resizeRope,
  signPose,
  type Point,
  type Rope,
} from "./ramSignRope";

type SignId = "stop" | "system" | "maximum";
type Sign = {
  id: SignId;
  x: number;
  y: number;
  start: Point;
  target: Point;
  /** Sideways bulge as a share of the arrow length; the sign picks the side. */
  bow: number;
  /** Radius of an optional curl halfway along the arrow. */
  curl?: number;
  /** Cord length once knocked loose; differs per sign so neighbours hang at different heights. */
  cord: number;
};
type Layout = {
  signs: Sign[];
  theme: CSSProperties;
};

const SIGN_WIDTH = 260;
const MARGIN = 12;
const CURL_FROM = 0.3;
const CURL_TO = 0.58;

const round = (n: number) => Math.round(n * 10) / 10;

/** A single smooth arc from the sign to the target, optionally with a cursive loop. */
function arrowCurve({ start, target, bow, curl = 0 }: Sign) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const at = (s: number): Point => {
    let along = length * s;
    // Cubic profile: gentle at the sign, tighter towards the target.
    let side = bow * length * 1.5 * s * (1 - s * s);
    if (curl && s > CURL_FROM && s < CURL_TO) {
      // A prolate trochoid eased in and out, so the loop joins the arc without kinks.
      const w = (s - CURL_FROM) / (CURL_TO - CURL_FROM);
      const phase = Math.PI * (1 + 2 * w * w * (3 - 2 * w));
      along -= curl * Math.sin(phase);
      side -= Math.sign(bow || 1) * curl * (1 + Math.cos(phase));
    }
    return { x: start.x + ux * along - uy * side, y: start.y + uy * along + ux * side };
  };
  const steps = curl ? 96 : 48;
  return Array.from({ length: steps + 1 }, (_, i) => at(i / steps));
}

/** Open chevron at `tip`, facing away from `from`. */
function headPath(tip: Point, from: Point) {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const wing = (side: number) =>
    `${round(tip.x - 14 * Math.cos(angle + side * 0.5))} ${round(tip.y - 14 * Math.sin(angle + side * 0.5))}`;
  return `M${wing(1)}L${round(tip.x)} ${round(tip.y)}L${wing(-1)}`;
}

function arrowPaths(sign: Sign) {
  const points = arrowCurve(sign);
  return {
    line: `M${points.map((p) => `${round(p.x)} ${round(p.y)}`).join("L")}`,
    head: headPath(sign.target, points[points.length - 4]),
  };
}

/** Quadratic segments through the midpoints, so the cord bends smoothly between particles. */
function cordPath(points: Point[]) {
  let d = `M${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    d += `Q${round(p.x)} ${round(p.y)} ${round((p.x + next.x) / 2)} ${round((p.y + next.y) / 2)}`;
  }
  const last = points[points.length - 1];
  return `${d}L${round(last.x)} ${round(last.y)}`;
}

function drawRope(rope: Rope, sign: HTMLElement | undefined, arrow: SVGGElement | undefined) {
  if (sign) {
    const pose = signPose(rope);
    sign.style.left = `${pose.left}px`;
    sign.style.top = `${pose.top}px`;
    sign.style.transformOrigin = `${pose.origin.x}px ${pose.origin.y}px`;
    sign.style.transform = `rotate(${pose.angle}rad)`;
  }
  if (arrow) {
    const line = cordPath(rope.points);
    const head = headPath(rope.points[0], rope.points[1]);
    arrow
      .querySelectorAll("path")
      .forEach((path, i) => path.setAttribute("d", i < 2 ? line : head));
  }
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
  // Signs knocked loose hang from their arrows; the simulation writes to the DOM directly.
  const [loose, setLoose] = useState<ReadonlySet<SignId>>(() => new Set());
  const ropes = useRef(new Map<SignId, Rope>());
  const tips = useRef(new Map<SignId, Point>());
  const signElements = useRef(new Map<SignId, HTMLDivElement>());
  const arrowElements = useRef(new Map<SignId, SVGGElement>());
  const grip = useRef<{ id: SignId; offset: Point } | null>(null);
  const frame = useRef(0);
  const resizes = useRef<ResizeObserver | null>(null);

  const wake = useCallback(() => {
    if (frame.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      let swinging = false;
      for (const [id, rope] of ropes.current) {
        const tip = tips.current.get(id);
        if (!tip) continue;
        if (advanceRope(rope, tip, elapsed)) swinging = true;
        drawRope(rope, signElements.current.get(id), arrowElements.current.get(id));
      }
      frame.current = swinging ? requestAnimationFrame(tick) : 0;
    };
    frame.current = requestAnimationFrame(tick);
  }, []);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  useEffect(() => {
    // A language switch changes a sign's size; a hanging sign must stay hooked at its middle.
    const observer = new ResizeObserver((entries) => {
      for (const { target } of entries) {
        const element = target as HTMLElement;
        const rope = ropes.current.get(element.dataset.sign as SignId);
        if (rope) resizeRope(rope, element.offsetWidth, element.offsetHeight);
      }
      wake();
    });
    resizes.current = observer;
    signElements.current.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      resizes.current = null;
    };
  }, [wake]);

  useLayoutEffect(() => {
    if (!layout) return;
    const shown = new Set(layout.signs.map((sign) => sign.id));
    for (const id of ropes.current.keys()) if (!shown.has(id)) ropes.current.delete(id);
    if ([...loose].some((id) => !shown.has(id))) {
      setLoose(new Set([...loose].filter((id) => shown.has(id))));
    }
    for (const sign of layout.signs) {
      tips.current.set(sign.id, sign.target);
      const rope = ropes.current.get(sign.id);
      if (!rope) continue;
      nudgeRope(rope);
      drawRope(rope, signElements.current.get(sign.id), arrowElements.current.get(sign.id));
    }
    if (ropes.current.size) wake();
  }, [layout, loose, wake]);

  /** Swaps a pinned sign for a hanging one; a sign that already hangs keeps its rope. */
  const loosen = useCallback((sign: Sign, element: HTMLElement) => {
    const existing = ropes.current.get(sign.id);
    if (existing) return existing;
    const style = getComputedStyle(element);
    const [originX, originY] = style.transformOrigin.split(" ").map(parseFloat);
    const rope = createRope(
      arrowCurve(sign),
      {
        left: sign.x,
        top: sign.y,
        width: element.offsetWidth,
        height: element.offsetHeight,
        origin: { x: originX, y: originY },
        angle: ((parseFloat(style.getPropertyValue("--ram-sign-angle")) || 0) * Math.PI) / 180,
      },
      // Short enough for the hanging sign to stay on screen below the tip.
      Math.max(
        48,
        Math.min(sign.cord, window.innerHeight - sign.target.y - element.offsetHeight - 24),
      ),
    );
    ropes.current.set(sign.id, rope);
    setLoose((current) => new Set(current).add(sign.id));
    return rope;
  }, []);

  useEffect(() => {
    if (!layout) return;
    const push = (event: Event) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>(".ram-warning-sign");
      const sign = layout.signs.find(({ id }) => id === element?.dataset.sign);
      if (!element || !sign) return;
      const { x, y } = (event as CustomEvent<RamSignPushDetail>).detail;
      pushRope(loosen(sign, element), x, y);
      wake();
    };
    document.addEventListener(RAM_SIGN_PUSH_EVENT, push);
    return () => document.removeEventListener(RAM_SIGN_PUSH_EVENT, push);
  }, [layout, loosen, wake]);

  const grab = (sign: Sign, event: PointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const rope = loosen(sign, element);
    grip.current = {
      id: sign.id,
      offset: { x: event.clientX - rope.centre.x, y: event.clientY - rope.centre.y },
    };
    rope.pull = { x: rope.centre.x, y: rope.centre.y };
    wake();
  };

  const drag = (sign: Sign, event: PointerEvent<HTMLDivElement>) => {
    const rope = ropes.current.get(sign.id);
    if (!rope || grip.current?.id !== sign.id) return;
    const { offset } = grip.current;
    rope.pull = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    wake();
  };

  const drop = (sign: Sign) => {
    const rope = ropes.current.get(sign.id);
    if (rope) rope.pull = null;
    if (grip.current?.id === sign.id) grip.current = null;
    wake();
  };

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
          bow: -0.3,
          cord: 64,
        },
      ];
      if (level >= 2) {
        signs.push({
          id: "system",
          ...system,
          start: { x: system.x + 22, y: system.y + 20 },
          target: { x: thumbBounds.left + thumbBounds.width / 2, y: thumbBounds.top - 8 },
          bow: -0.28,
          curl: 17,
          cord: 120,
        });
      }
      if (level >= 3) {
        signs.push({
          id: "maximum",
          ...maximum,
          start: { x: maximum.x + 22, y: maximum.y + 30 },
          target: { x: valueBounds.left - 8, y: valueBounds.top + valueBounds.height * 0.55 },
          bow: 0.32,
          cord: 150,
        });
      }
      const style = getComputedStyle(anchor);
      setLayout({
        signs,
        theme: {
          "--danger": style.getPropertyValue("--danger"),
          "--accent": style.getPropertyValue("--accent"),
          "--bg": style.getPropertyValue("--bg"),
          "--bg-elevated": style.getPropertyValue("--bg-elevated"),
          "--ram-ink": style.getPropertyValue("--ink"),
          "--ram-text": style.getPropertyValue("--text-soft"),
          "--surface-shadow-strong": style.getPropertyValue("--surface-shadow-strong"),
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
          <div
            className="ram-warning-overlay"
            style={layout.theme}
            aria-hidden="true"
            data-language-flip
          >
            <svg className="ram-warning-arrows" fill="none">
              {layout.signs.map((sign, index) => {
                const isLoose = loose.has(sign.id);
                const { line, head } = isLoose
                  ? { line: undefined, head: undefined }
                  : arrowPaths(sign);
                return (
                  <g
                    key={sign.id}
                    ref={(element) => {
                      if (element) arrowElements.current.set(sign.id, element);
                      else arrowElements.current.delete(sign.id);
                    }}
                    className={`ram-warning-arrow${isLoose ? " ram-warning-arrow--loose" : ""}`}
                    style={{ "--ram-sign-delay": `${index * 110}ms` } as CSSProperties}
                  >
                    <path
                      className="ram-warning-arrow-line ram-warning-arrow-halo"
                      pathLength={1}
                      d={line}
                    />
                    <path className="ram-warning-arrow-line" pathLength={1} d={line} />
                    <path
                      className="ram-warning-arrow-head ram-warning-arrow-halo"
                      pathLength={1}
                      d={head}
                    />
                    <path className="ram-warning-arrow-head" pathLength={1} d={head} />
                  </g>
                );
              })}
            </svg>
            {layout.signs.map((sign, index) => (
              <div
                key={sign.id}
                ref={(element) => {
                  const previous = signElements.current.get(sign.id);
                  if (previous) resizes.current?.unobserve(previous);
                  if (element) {
                    signElements.current.set(sign.id, element);
                    resizes.current?.observe(element);
                  } else signElements.current.delete(sign.id);
                }}
                data-sign={sign.id}
                className={`ram-warning-sign ram-warning-sign--${sign.id}${loose.has(sign.id) ? " ram-warning-sign--loose" : ""}`}
                style={
                  {
                    ...(loose.has(sign.id) ? {} : { left: sign.x, top: sign.y }),
                    "--ram-sign-delay": `${index * 110}ms`,
                  } as CSSProperties
                }
                onPointerDown={(event) => grab(sign, event)}
                onPointerMove={(event) => drag(sign, event)}
                onPointerUp={() => drop(sign)}
                onPointerCancel={() => drop(sign)}
              >
                <i
                  className={`ram-warning-badge${sign.id === "system" ? " ram-warning-badge--memory" : ""}`}
                >
                  {sign.id === "system" && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="4" y="7" width="16" height="10" rx="1" />
                      <path d="M8 10v4m4-4v4m4-4v4M7 4v3m5-3v3m5-3v3M7 17v3m5-3v3m5-3v3M1 10h3m-3 4h3m16-4h3m-3 4h3" />
                    </svg>
                  )}
                </i>
                <div className="ram-warning-copy">
                  {sign.id === "stop" ? (
                    <>
                      <strong>{tr("ram.warningSignTitle")}</strong>
                      <span>{tr("ram.warningSignRisk")}</span>
                    </>
                  ) : sign.id === "system" ? (
                    <strong>{tr("ram.warningSignAction")}</strong>
                  ) : (
                    <>
                      <strong>{tr("ram.warningSignMaximum")}</strong>
                      <span>{tr("ram.warningSignReduce")}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
