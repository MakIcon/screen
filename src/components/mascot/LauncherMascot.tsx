import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import angrySprite from "../../assets/mascot/sprites/angry.png";
import confusedSprite from "../../assets/mascot/sprites/confused.png";
import coolSprite from "../../assets/mascot/sprites/cool.png";
import excitedSprite from "../../assets/mascot/sprites/excited.png";
import happySprite from "../../assets/mascot/sprites/happy.png";
import loveSprite from "../../assets/mascot/sprites/love.png";
import neutralSprite from "../../assets/mascot/sprites/neutral.png";
import sadSprite from "../../assets/mascot/sprites/sad.png";
import shySprite from "../../assets/mascot/sprites/shy.png";
import sleepySprite from "../../assets/mascot/sprites/sleepy.png";
import surprisedSprite from "../../assets/mascot/sprites/surprised.png";
import leftArmPiskel from "../../assets/mascot/hands/left-arm.piskel?raw";
import pointHandPiskel from "../../assets/mascot/hands/point-hand.piskel?raw";
import rightArmPiskel from "../../assets/mascot/hands/right-arm.piskel?raw";
import "./LauncherMascot.css";

const MASCOT_SIZE = 64;
const ROAM_INTERVAL_MS = 3_800;
const WALK_SPEED = 205;
const RUN_SPEED = 355;
const CHAOS_SPEED = 1_600;
const THROW_THRESHOLD = 1.15;
const THROW_HISTORY_MS = 11_000;
const THROWS_TO_CHAOS = 3;
const MISCHIEF_DECAY_MS = 8_000;
const MIN_STEAL_DELAY_MS = 18_000;
const STEAL_DELAY_VARIANCE_MS = 14_000;
const STEAL_REACH_PX = 54;
const MAX_CHAOS_DEBRIS = 14;

const STEALABLE_SELECTOR = [
  "[data-mascot-stealable]",
  "button:not(:disabled)",
  ".mod-card",
  ".installed-mod-row",
  ".bme-row",
  ".instance-card",
  ".info-panel",
  ".detail-block",
  ".inline-dropdown",
  ".field",
  ".brs-section",
  ".settings-toggle-row",
].join(", ");

export const MASCOT_FAKE_DELETE_EVENT = "launcher-mascot-fake-delete";
export const MASCOT_FAKE_CONTENT_DELETE_EVENT = "launcher-mascot-fake-content-delete";
export const MASCOT_FAKE_RESTORE_EVENT = "launcher-mascot-fake-restore";

const MASCOT_SPRITES = {
  angry: angrySprite,
  confused: confusedSprite,
  cool: coolSprite,
  excited: excitedSprite,
  happy: happySprite,
  love: loveSprite,
  neutral: neutralSprite,
  sad: sadSprite,
  shy: shySprite,
  sleepy: sleepySprite,
  surprised: surprisedSprite,
} as const;

type MascotEmotion = keyof typeof MASCOT_SPRITES;
type MascotPhase =
  | "idle"
  | "walking"
  | "running"
  | "dragging"
  | "thrown"
  | "petting"
  | "carrying"
  | "climbing"
  | "jumping"
  | "playing"
  | "scrolling"
  | "chaos";
type MascotPosition = { x: number; y: number };
type PointerSample = MascotPosition & { time: number };
type LooseButtonTransform = MascotPosition & { rotation: number };

type PiskelAsset = {
  width: number;
  height: number;
  src: string;
};

type CarriedElement = {
  element: HTMLElement;
  width: number;
  height: number;
  previousAriaHidden: string | null;
};

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
  shakeTurns: number;
  lastDirection: number;
  samples: PointerSample[];
};

type ChangedToggle = {
  label: string;
  wasEnabled: boolean;
};

type ChaosDebris = {
  source: HTMLElement;
  clone: HTMLElement;
  previousAriaHidden: string | null;
};

type ChaosSnapshot = {
  originalTabIndex: number;
  toggles: ChangedToggle[];
};

interface LauncherMascotProps {
  activeIndex: number;
  enabled: boolean;
}

const ROAMING_EMOTIONS: MascotEmotion[] = [
  "neutral",
  "happy",
  "cool",
  "confused",
  "excited",
  "love",
  "shy",
  "surprised",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function randomItem<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffled<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function distance(a: MascotPosition, b: MascotPosition) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isVisible(element: HTMLElement, rootRect: DOMRect) {
  if (element.hidden || element.closest("[aria-hidden='true']")) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 12) return false;
  if (rect.bottom < rootRect.top || rect.top > rootRect.bottom) return false;
  if (rect.right < rootRect.left || rect.left > rootRect.right) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function hasDrawnEdge(element: HTMLElement) {
  if (element.matches(".gallery-header, .sidebar, .gallery-footer")) return true;
  const style = window.getComputedStyle(element);
  return [
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ].some((width) => Number.parseFloat(width) > 0);
}

function getToggleLabel(toggle: HTMLButtonElement) {
  return (
    toggle
      .closest(".settings-toggle-row")
      ?.querySelector(".settings-toggle-title")
      ?.textContent?.trim() ?? ""
  );
}

function isStealableElement(element: HTMLElement) {
  if (element.matches("[data-mascot-ignore], .mascot-button-carried-source")) return false;
  if (element.closest(".launcher-mascot-layer, .ep-backdrop, .confirm-overlay")) return false;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return false;
  return true;
}

function setNativeControlValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function fireSliderKey(slider: HTMLElement, key: string) {
  slider.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  slider.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

function getSliderSpan(slider: HTMLElement) {
  const min = Number(slider.getAttribute("aria-valuemin"));
  const max = Number(slider.getAttribute("aria-valuemax"));
  return Number.isFinite(min) && Number.isFinite(max) && max > min
    ? Math.min(64, Math.round(max - min))
    : 20;
}

// Synchronous, forceful slider tantrum — a burst of back-and-forth yanking that
// ends by slamming the thumb to a random value. Used inside the rage sequence.
function nudgeSlider(slider: HTMLElement) {
  slider.focus({ preventScroll: true });
  const span = getSliderSpan(slider);
  const bursts = 3 + Math.floor(Math.random() * 4);
  for (let b = 0; b < bursts; b += 1) {
    const key = b % 2 === 0 ? "ArrowRight" : "ArrowLeft";
    const steps = 3 + Math.floor(Math.random() * 6);
    for (let s = 0; s < steps; s += 1) fireSliderKey(slider, key);
  }
  for (let s = 0; s < span; s += 1) fireSliderKey(slider, "ArrowLeft");
  const target = Math.floor(Math.random() * (span + 1));
  for (let s = 0; s < target; s += 1) fireSliderKey(slider, "ArrowRight");
}

// Animated, visible slider play — yanks the thumb hard in alternating directions
// with pauses so the motion reads, then settles on a random value.
async function playSlider(slider: HTMLElement, isAlive: () => boolean) {
  slider.focus({ preventScroll: true });
  const span = getSliderSpan(slider);
  const bursts = 4 + Math.floor(Math.random() * 4);
  for (let b = 0; b < bursts; b += 1) {
    if (!isAlive()) return;
    const key = b % 2 === 0 ? "ArrowRight" : "ArrowLeft";
    const steps = 4 + Math.floor(Math.random() * Math.max(4, Math.ceil(span * 0.6)));
    for (let s = 0; s < steps; s += 1) fireSliderKey(slider, key);
    await wait(80 + Math.random() * 70);
  }
  if (!isAlive()) return;
  for (let s = 0; s < span; s += 1) fireSliderKey(slider, "ArrowLeft");
  const target = Math.floor(Math.random() * (span + 1));
  for (let s = 0; s < target; s += 1) fireSliderKey(slider, "ArrowRight");
}

function parsePiskelAsset(source: string): PiskelAsset {
  const document = JSON.parse(source) as {
    piskel: { width: number; height: number; layers: string[] };
  };
  const layer = JSON.parse(document.piskel.layers[0]) as {
    chunks: Array<{ base64PNG: string }>;
  };
  return {
    width: document.piskel.width,
    height: document.piskel.height,
    src: layer.chunks[0].base64PNG,
  };
}

const HAND_ASSETS = {
  point: parsePiskelAsset(pointHandPiskel),
  left: parsePiskelAsset(leftArmPiskel),
  right: parsePiskelAsset(rightArmPiskel),
} as const;

function PiskelSprite({
  asset,
  className,
  style,
}: {
  asset: PiskelAsset;
  className: string;
  style?: CSSProperties;
}) {
  return (
    <img
      className={className}
      src={asset.src}
      width={asset.width * 2}
      height={asset.height * 2}
      style={style}
      draggable={false}
      alt=""
      aria-hidden="true"
    />
  );
}

function copyComputedTree(source: HTMLElement, clone: HTMLElement) {
  const sourceNodes: Element[] = [source, ...Array.from(source.querySelectorAll("*"))];
  const cloneNodes: Element[] = [clone, ...Array.from(clone.querySelectorAll("*"))];
  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode) return;
    const computed = window.getComputedStyle(sourceNode);
    const inlineStyle = (cloneNode as HTMLElement | SVGElement).style;
    Array.from(computed).forEach((property) => {
      inlineStyle.setProperty(
        property,
        computed.getPropertyValue(property),
        computed.getPropertyPriority(property),
      );
    });
  });
}

function mountElementReplica(holder: HTMLElement, carried: CarriedElement) {
  const clone = carried.element.cloneNode(true) as HTMLElement;
  carried.element.classList.remove("mascot-button-carried-source");
  const sourceRadius = window.getComputedStyle(carried.element).borderRadius;
  try {
    copyComputedTree(carried.element, clone);
  } finally {
    carried.element.classList.add("mascot-button-carried-source");
  }
  // The launcher surfaces are translucent, so a bare clone lets the page bleed
  // through it. Back the replica with the opaque app background and clip it to
  // the source's rounded corners so the carried element reads as solid.
  holder.style.setProperty("background", "var(--bg)", "important");
  holder.style.setProperty("border-radius", sourceRadius, "important");
  holder.style.setProperty("overflow", "hidden", "important");
  holder.style.setProperty("box-shadow", "var(--surface-shadow-soft)", "important");
  clone.classList.remove("mascot-button-carried-source");
  clone.removeAttribute("id");
  clone.removeAttribute("aria-hidden");
  clone.setAttribute("aria-hidden", "true");
  clone.tabIndex = -1;
  clone.style.setProperty("width", `${carried.width}px`, "important");
  clone.style.setProperty("height", `${carried.height}px`, "important");
  clone.style.setProperty("min-width", `${carried.width}px`, "important");
  clone.style.setProperty("max-width", `${carried.width}px`, "important");
  clone.style.setProperty("box-sizing", "border-box", "important");
  clone.style.setProperty("position", "relative", "important");
  clone.style.setProperty("inset", "auto", "important");
  clone.style.setProperty("margin", "0", "important");
  clone.style.setProperty("transform", "none", "important");
  clone.style.setProperty("visibility", "visible", "important");
  clone.style.setProperty("opacity", "1", "important");
  clone.style.setProperty("pointer-events", "none", "important");
  holder.replaceChildren(clone);
  return () => {
    holder.replaceChildren();
    holder.style.removeProperty("background");
    holder.style.removeProperty("border-radius");
    holder.style.removeProperty("overflow");
    holder.style.removeProperty("box-shadow");
  };
}

function restoreCarriedElement(carried: CarriedElement) {
  if (!carried.element.isConnected) return;
  carried.element.classList.remove("mascot-button-carried-source");
  if (carried.previousAriaHidden === null) carried.element.removeAttribute("aria-hidden");
  else carried.element.setAttribute("aria-hidden", carried.previousAriaHidden);
}

export function LauncherMascot({ activeIndex, enabled }: LauncherMascotProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const characterRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<MascotPosition>({ x: 118, y: 86 });
  const phaseRef = useRef<MascotPhase>("idle");
  const dragRef = useRef<DragState | null>(null);
  const motionFrameRef = useRef<number | null>(null);
  const motionFinishRef = useRef<((completed: boolean) => void) | null>(null);
  const emotionTimerRef = useRef<number | null>(null);
  const mischiefDecayTimerRef = useRef<number | null>(null);
  const throwTimesRef = useRef<number[]>([]);
  const ignoreClickRef = useRef(false);
  const chaosTokenRef = useRef(0);
  const chaosActiveRef = useRef(false);
  const chaosSnapshotRef = useRef<ChaosSnapshot | null>(null);
  const chaosDebrisRef = useRef<ChaosDebris[]>([]);
  const modalOpenRef = useRef(false);
  const activeModalRef = useRef<HTMLElement | null>(null);
  const modalClimbTokenRef = useRef(0);
  const modalBusyRef = useRef(false);
  const activeIndexRef = useRef(activeIndex);
  const nextStealAtRef = useRef(
    Date.now() + MIN_STEAL_DELAY_MS + Math.random() * STEAL_DELAY_VARIANCE_MS,
  );
  const carriedButtonRef = useRef<CarriedElement | null>(null);
  const looseButtonRef = useRef<CarriedElement | null>(null);
  const looseButtonFrameRef = useRef<number | null>(null);
  const looseButtonReturnTimerRef = useRef<number | null>(null);
  const activityBusyRef = useRef(false);
  const activityTokenRef = useRef(0);
  const replicaRef = useRef<HTMLDivElement | null>(null);
  const looseButtonReplicaRef = useRef<HTMLDivElement | null>(null);

  const [position, setPositionState] = useState(positionRef.current);
  const [phase, setPhaseState] = useState<MascotPhase>("idle");
  const [emotion, setEmotion] = useState<MascotEmotion>("neutral");
  const [carriedButton, setCarriedButton] = useState<CarriedElement | null>(null);
  const [looseButton, setLooseButton] = useState<CarriedElement | null>(null);
  const [looseButtonTransform, setLooseButtonTransform] = useState<LooseButtonTransform>({
    x: 0,
    y: 0,
    rotation: 0,
  });
  const [ragePress, setRagePress] = useState<MascotPosition | null>(null);
  const [chaosActive, setChaosActive] = useState(false);
  const [modalForeground, setModalForeground] = useState(false);
  const [throwProgress, setThrowProgress] = useState(0);

  activeIndexRef.current = activeIndex;

  const setPosition = useCallback((next: MascotPosition) => {
    positionRef.current = next;
    setPositionState(next);
  }, []);

  const setPhase = useCallback((next: MascotPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const getRoot = useCallback(() => {
    const root = layerRef.current?.parentElement;
    return root instanceof HTMLElement ? root : null;
  }, []);

  const getActiveStage = useCallback(() => {
    const stage = getRoot()?.querySelector(".main-stage");
    return stage instanceof HTMLElement ? stage : null;
  }, [getRoot]);

  const getSceneRoot = useCallback(() => {
    const root = layerRef.current?.closest(".gallery-root");
    return root instanceof HTMLElement ? root : getRoot();
  }, [getRoot]);

  const getBounds = useCallback(() => {
    const root = getRoot();
    if (!root) return null;
    return {
      minX: 4,
      minY: 4,
      maxX: Math.max(4, root.clientWidth - MASCOT_SIZE - 4),
      maxY: Math.max(4, root.clientHeight - MASCOT_SIZE - 4),
    };
  }, [getRoot]);

  const clampPosition = useCallback(
    (next: MascotPosition) => {
      const bounds = getBounds();
      if (!bounds) return next;
      return {
        x: clamp(next.x, bounds.minX, bounds.maxX),
        y: clamp(next.y, bounds.minY, bounds.maxY),
      };
    },
    [getBounds],
  );

  const cancelMotion = useCallback(() => {
    if (motionFrameRef.current !== null) {
      window.cancelAnimationFrame(motionFrameRef.current);
      motionFrameRef.current = null;
    }
    const finish = motionFinishRef.current;
    motionFinishRef.current = null;
    finish?.(false);
  }, []);

  const clearEmotionTimer = useCallback(() => {
    if (emotionTimerRef.current !== null) {
      window.clearTimeout(emotionTimerRef.current);
      emotionTimerRef.current = null;
    }
  }, []);

  const clearMischiefDecayTimer = useCallback(() => {
    if (mischiefDecayTimerRef.current !== null) {
      window.clearTimeout(mischiefDecayTimerRef.current);
      mischiefDecayTimerRef.current = null;
    }
  }, []);

  const scheduleMischiefDecay = useCallback(() => {
    clearMischiefDecayTimer();
    if (throwTimesRef.current.length === 0) return;
    mischiefDecayTimerRef.current = window.setTimeout(() => {
      mischiefDecayTimerRef.current = null;
      throwTimesRef.current = [];
      setThrowProgress(0);
    }, MISCHIEF_DECAY_MS);
  }, [clearMischiefDecayTimer]);

  const isNearElement = useCallback(
    (element: HTMLElement, reach = STEAL_REACH_PX) => {
      const root = getRoot();
      if (!root || !element.isConnected) return false;
      const rootRect = root.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      if (!isVisible(element, rootRect)) return false;
      const centerX = rootRect.left + positionRef.current.x + MASCOT_SIZE / 2;
      const centerY = rootRect.top + positionRef.current.y + MASCOT_SIZE / 2;
      const dx = Math.max(rect.left - centerX, 0, centerX - rect.right);
      const dy = Math.max(rect.top - centerY, 0, centerY - rect.bottom);
      return Math.hypot(dx, dy) <= reach;
    },
    [getRoot],
  );

  const animatePath = useCallback(
    (rawPoints: MascotPosition[], speed: number, nextPhase: MascotPhase) => {
      cancelMotion();
      const points = rawPoints
        .map(clampPosition)
        .filter((point, index, all) => index === 0 || distance(point, all[index - 1]) > 0.5);
      if (points.length === 0) return Promise.resolve(true);

      setPhase(nextPhase);
      return new Promise<boolean>((resolve) => {
        let pointIndex = 0;
        let previousTime = performance.now();
        motionFinishRef.current = resolve;

        const step = (now: number) => {
          const deltaSeconds = Math.min(0.04, (now - previousTime) / 1000);
          previousTime = now;
          let budget = speed * deltaSeconds;
          let current = positionRef.current;

          while (budget > 0 && pointIndex < points.length) {
            const target = points[pointIndex];
            const remaining = distance(current, target);
            if (remaining <= budget || remaining < 0.75) {
              current = target;
              budget -= remaining;
              pointIndex += 1;
            } else {
              const ratio = budget / remaining;
              current = {
                x: current.x + (target.x - current.x) * ratio,
                y: current.y + (target.y - current.y) * ratio,
              };
              budget = 0;
            }
          }

          setPosition(current);
          if (pointIndex >= points.length) {
            motionFrameRef.current = null;
            motionFinishRef.current = null;
            resolve(true);
            return;
          }
          motionFrameRef.current = window.requestAnimationFrame(step);
        };

        motionFrameRef.current = window.requestAnimationFrame(step);
      });
    },
    [cancelMotion, clampPosition, setPhase, setPosition],
  );

  // Parabolic leap from the current position to `target`. Horizontal travel is
  // eased while the height follows a sine arc, so the mascot springs up and over
  // rather than sliding. Resolves false if interrupted (e.g. grabbed).
  const leapTo = useCallback(
    (target: MascotPosition, options?: { height?: number; phase?: MascotPhase }) => {
      cancelMotion();
      const start = positionRef.current;
      const dest = clampPosition(target);
      const span = distance(start, dest);
      const duration = clamp(300 + span * 1.15, 340, 820);
      const apexY = Math.min(start.y, dest.y);
      const maxHeight = Math.max(24, apexY - 6);
      const height = Math.min(options?.height ?? clamp(span * 0.5, 70, 170), maxHeight);
      setPhase(options?.phase ?? "jumping");
      return new Promise<boolean>((resolve) => {
        const startTime = performance.now();
        motionFinishRef.current = resolve;
        const step = (now: number) => {
          const t = clamp((now - startTime) / duration, 0, 1);
          const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const x = start.x + (dest.x - start.x) * ease;
          const y = start.y + (dest.y - start.y) * ease - Math.sin(Math.PI * t) * height;
          setPosition({ x, y });
          if (t >= 1) {
            motionFrameRef.current = null;
            motionFinishRef.current = null;
            setPosition(dest);
            resolve(true);
            return;
          }
          motionFrameRef.current = window.requestAnimationFrame(step);
        };
        motionFrameRef.current = window.requestAnimationFrame(step);
      });
    },
    [cancelMotion, clampPosition, setPhase, setPosition],
  );

  const buildContourPath = useCallback(
    (element: HTMLElement, laps = 1) => {
      const root = getRoot();
      if (!root || !element.isConnected) return [];
      const rootRect = root.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const half = MASCOT_SIZE / 2;
      const left = rect.left - rootRect.left - half;
      const right = rect.right - rootRect.left - half;
      const top = rect.top - rootRect.top - half;
      const bottom = rect.bottom - rootRect.top - half;
      const middleX = (left + right) / 2;
      const middleY = (top + bottom) / 2;
      const ring = [
        { x: left, y: top },
        { x: middleX, y: top },
        { x: right, y: top },
        { x: right, y: middleY },
        { x: right, y: bottom },
        { x: middleX, y: bottom },
        { x: left, y: bottom },
        { x: left, y: middleY },
      ].map(clampPosition);

      let entryIndex = 0;
      let entryDistance = Number.POSITIVE_INFINITY;
      ring.forEach((point, index) => {
        const nextDistance = distance(positionRef.current, point);
        if (nextDistance < entryDistance) {
          entryDistance = nextDistance;
          entryIndex = index;
        }
      });

      const entry = ring[entryIndex];
      const current = positionRef.current;
      const horizontalFirst = Math.abs(current.x - entry.x) < Math.abs(current.y - entry.y);
      const bridge = horizontalFirst ? { x: entry.x, y: current.y } : { x: current.x, y: entry.y };
      const result: MascotPosition[] = [bridge, entry];
      const direction = Math.random() > 0.35 ? 1 : -1;
      const steps = Math.max(2, Math.min(ring.length * laps, 3 + Math.floor(Math.random() * 4)));
      for (let step = 1; step <= steps; step += 1) {
        result.push(ring[(entryIndex + direction * step + ring.length * 4) % ring.length]);
      }
      return result;
    },
    [clampPosition, getRoot],
  );

  const collectContours = useCallback(() => {
    const root = getRoot();
    if (!root) return [];
    const rootRect = root.getBoundingClientRect();
    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>(
        ".gallery-header, .sidebar, .gallery-footer, .main-stage button, .main-stage [class*='card'], .main-stage [class*='panel'], .settings-toggle-row, .theme-switch",
      ),
    );
    const unique = Array.from(new Set(candidates)).filter(
      (element) =>
        !element.closest(".launcher-mascot-layer") &&
        isVisible(element, rootRect) &&
        hasDrawnEdge(element),
    );

    return unique
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const center = {
          x: rect.left - rootRect.left + rect.width / 2 - MASCOT_SIZE / 2,
          y: rect.top - rootRect.top + rect.height / 2 - MASCOT_SIZE / 2,
        };
        return { element, proximity: distance(positionRef.current, center) };
      })
      .sort((a, b) => a.proximity - b.proximity)
      .slice(0, 12)
      .map(({ element }) => element);
  }, [getRoot]);

  const resetStealClock = useCallback(() => {
    nextStealAtRef.current =
      Date.now() + MIN_STEAL_DELAY_MS + Math.random() * STEAL_DELAY_VARIANCE_MS;
  }, []);

  const clearLooseButton = useCallback(() => {
    if (looseButtonFrameRef.current !== null) {
      window.cancelAnimationFrame(looseButtonFrameRef.current);
      looseButtonFrameRef.current = null;
    }
    if (looseButtonReturnTimerRef.current !== null) {
      window.clearTimeout(looseButtonReturnTimerRef.current);
      looseButtonReturnTimerRef.current = null;
    }
    const loose = looseButtonRef.current;
    looseButtonRef.current = null;
    if (loose) restoreCarriedElement(loose);
    setLooseButton(null);
  }, []);

  const clearChaosDebris = useCallback(() => {
    const debris = chaosDebrisRef.current.splice(0);
    debris.forEach(({ source, clone, previousAriaHidden }) => {
      clone.remove();
      if (!source.isConnected) return;
      source.classList.remove("mascot-button-carried-source");
      if (previousAriaHidden === null) source.removeAttribute("aria-hidden");
      else source.setAttribute("aria-hidden", previousAriaHidden);
    });
  }, []);

  const scatterChaosElement = useCallback(
    (element: HTMLElement) => {
      const root = getRoot();
      const layer = layerRef.current;
      if (
        !root ||
        !layer ||
        !element.isConnected ||
        chaosDebrisRef.current.length >= MAX_CHAOS_DEBRIS ||
        chaosDebrisRef.current.some(({ source }) => source === element)
      )
        return false;

      const rootRect = root.getBoundingClientRect();
      if (!isVisible(element, rootRect)) return false;
      const rect = element.getBoundingClientRect();
      const carried: CarriedElement = {
        element,
        width: rect.width,
        height: rect.height,
        previousAriaHidden: element.getAttribute("aria-hidden"),
      };
      const clone = document.createElement("div");
      clone.className = "launcher-mascot-debris";
      clone.setAttribute("aria-hidden", "true");
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;

      const scale = 1;
      const visualWidth = rect.width;
      const visualHeight = rect.height;
      const fromX = rect.left - rootRect.left;
      const fromY = rect.top - rootRect.top;
      const toX = clamp(
        12 + Math.random() * Math.max(0, root.clientWidth - visualWidth - 24),
        4,
        Math.max(4, root.clientWidth - visualWidth - 4),
      );
      const toY = clamp(
        92 + Math.random() * Math.max(0, root.clientHeight - visualHeight - 120),
        4,
        Math.max(4, root.clientHeight - visualHeight - 4),
      );
      const rotation = (Math.random() > 0.5 ? 1 : -1) * (12 + Math.random() * 30);
      clone.style.setProperty("--debris-from-x", `${fromX}px`);
      clone.style.setProperty("--debris-from-y", `${fromY}px`);
      clone.style.setProperty("--debris-to-x", `${toX}px`);
      clone.style.setProperty("--debris-to-y", `${toY}px`);
      clone.style.setProperty("--debris-mid-x", `${(fromX + toX) / 2}px`);
      clone.style.setProperty("--debris-mid-y", `${(fromY + toY) / 2 - 42}px`);
      clone.style.setProperty("--debris-rotation", `${rotation}deg`);
      clone.style.setProperty("--debris-mid-rotation", `${rotation * 0.72}deg`);
      clone.style.setProperty("--debris-scale", String(scale));
      clone.style.transform = `translate3d(${toX}px, ${toY}px, 0) rotate(${rotation}deg) scale(${scale})`;

      mountElementReplica(clone, carried);
      element.setAttribute("aria-hidden", "true");
      layer.appendChild(clone);
      chaosDebrisRef.current.push({
        source: element,
        clone,
        previousAriaHidden: carried.previousAriaHidden,
      });
      return true;
    },
    [getRoot],
  );

  const restoreCarriedButton = useCallback(
    (celebrate = true) => {
      const carried = carriedButtonRef.current;
      if (!carried) return;
      carriedButtonRef.current = null;
      restoreCarriedElement(carried);
      setCarriedButton(null);
      resetStealClock();
      setEmotion(celebrate ? "happy" : "neutral");
      setPhase("idle");
    },
    [resetStealClock, setPhase],
  );

  useEffect(() => {
    const holder = replicaRef.current;
    if (!holder || !carriedButton) return;
    return mountElementReplica(holder, carriedButton);
  }, [carriedButton]);

  useEffect(() => {
    const holder = looseButtonReplicaRef.current;
    if (!holder || !looseButton) return;
    return mountElementReplica(holder, looseButton);
  }, [looseButton]);

  const stealRandomButton = useCallback(async () => {
    if (
      chaosActiveRef.current ||
      modalOpenRef.current ||
      dragRef.current ||
      carriedButtonRef.current ||
      looseButtonRef.current ||
      phaseRef.current !== "idle"
    ) {
      return false;
    }
    const root = getRoot();
    const stage = getActiveStage();
    const scene = getSceneRoot();
    if (!root || !stage || !scene) return false;
    const stealScope =
      scene.querySelector<HTMLElement>(".ep-popup--open[aria-hidden='false']") ?? stage;
    const rootRect = root.getBoundingClientRect();
    const candidates = Array.from(
      stealScope.querySelectorAll<HTMLElement>(STEALABLE_SELECTOR),
    ).filter((element) => isVisible(element, rootRect) && isStealableElement(element));
    const target = randomItem(candidates);
    if (!target) {
      resetStealClock();
      return false;
    }

    setEmotion("cool");
    const tabIndex = activeIndexRef.current;
    const arrived = await animatePath(buildContourPath(target), RUN_SPEED, "running");
    if (
      !arrived ||
      !target.isConnected ||
      chaosActiveRef.current ||
      tabIndex !== activeIndexRef.current ||
      !isNearElement(target)
    ) {
      const interruptedPhase = phaseRef.current as MascotPhase;
      if (!chaosActiveRef.current && interruptedPhase === "running") setPhase("idle");
      resetStealClock();
      return false;
    }

    const targetRect = target.getBoundingClientRect();
    const carried: CarriedElement = {
      element: target,
      width: targetRect.width,
      height: targetRect.height,
      previousAriaHidden: target.getAttribute("aria-hidden"),
    };
    carriedButtonRef.current = carried;
    setCarriedButton(carried);
    target.classList.add("mascot-button-carried-source");
    target.setAttribute("aria-hidden", "true");
    setEmotion("excited");

    const overflowX = Math.max(20, (carried.width - MASCOT_SIZE) / 2 + 34);
    const destination = clampPosition({
      x: clamp(
        160 + Math.random() * Math.max(0, root.clientWidth - 320),
        overflowX,
        Math.max(overflowX, root.clientWidth - MASCOT_SIZE - overflowX),
      ),
      y: clamp(
        carried.height + 44 + Math.random() * Math.max(0, root.clientHeight - carried.height - 170),
        carried.height + 36,
        root.clientHeight - MASCOT_SIZE - 60,
      ),
    });
    const current = positionRef.current;
    const sizeWeight = Math.sqrt(carried.width * carried.height) / MASCOT_SIZE;
    const carrySpeed = clamp(RUN_SPEED / (0.7 + sizeWeight * 0.42), 82, RUN_SPEED);
    const escaped = await animatePath(
      [{ x: destination.x, y: current.y }, destination],
      carrySpeed,
      "carrying",
    );
    if (escaped && carriedButtonRef.current) setPhase("carrying");
    resetStealClock();
    return true;
  }, [
    animatePath,
    buildContourPath,
    clampPosition,
    getActiveStage,
    getRoot,
    getSceneRoot,
    isNearElement,
    resetStealClock,
    setPhase,
  ]);

  const roam = useCallback(async () => {
    if (
      dragRef.current ||
      chaosActiveRef.current ||
      carriedButtonRef.current ||
      looseButtonRef.current ||
      activityBusyRef.current ||
      phaseRef.current !== "idle"
    )
      return;
    const contours = collectContours();
    const target = randomItem(contours);
    if (!target) return;
    setEmotion(randomItem(ROAMING_EMOTIONS) ?? "neutral");
    const completed = await animatePath(buildContourPath(target), WALK_SPEED, "walking");
    if (completed && !chaosActiveRef.current) setPhase("idle");
  }, [animatePath, buildContourPath, collectContours, setPhase]);

  const jumpOnRandomButton = useCallback(async () => {
    if (phaseRef.current !== "idle" || activityBusyRef.current) return false;
    const root = getRoot();
    const stage = getActiveStage();
    if (!root || !stage) return false;
    const rootRect = root.getBoundingClientRect();
    const target = randomItem(
      Array.from(stage.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).filter(
        (button) => isVisible(button, rootRect) && isStealableElement(button),
      ),
    );
    if (!target) return false;

    activityBusyRef.current = true;
    const activityToken = activityTokenRef.current;
    const tabIndex = activeIndexRef.current;
    try {
      setEmotion("excited");
      const arrived = await animatePath(buildContourPath(target), RUN_SPEED, "running");
      if (
        !arrived ||
        !target.isConnected ||
        tabIndex !== activeIndexRef.current ||
        activityToken !== activityTokenRef.current ||
        !isNearElement(target)
      )
        return false;
      setPhase("playing");
      await wait(1_150);
      return activityToken === activityTokenRef.current;
    } finally {
      activityBusyRef.current = false;
      const finishingPhase = phaseRef.current as MascotPhase;
      if (!chaosActiveRef.current && finishingPhase !== "dragging" && finishingPhase !== "thrown") {
        setEmotion("happy");
        setPhase("idle");
      }
    }
  }, [animatePath, buildContourPath, getActiveStage, getRoot, isNearElement, setPhase]);

  const scrollActiveList = useCallback(async () => {
    if (phaseRef.current !== "idle" || activityBusyRef.current) return false;
    const root = getRoot();
    const stage = getActiveStage();
    if (!root || !stage) return false;
    const rootRect = root.getBoundingClientRect();
    const scrollable = randomItem(
      Array.from(
        stage.querySelectorAll<HTMLElement>(
          ".csa-content, .installed-mods-list, .mod-list, [data-mascot-scrollable]",
        ),
      ).filter(
        (element) =>
          element.scrollHeight > element.clientHeight + 8 && isVisible(element, rootRect),
      ),
    );
    if (!scrollable) return false;

    activityBusyRef.current = true;
    const activityToken = activityTokenRef.current;
    const tabIndex = activeIndexRef.current;
    try {
      setEmotion("cool");
      const arrived = await animatePath(buildContourPath(scrollable), WALK_SPEED, "walking");
      if (
        !arrived ||
        !scrollable.isConnected ||
        tabIndex !== activeIndexRef.current ||
        activityToken !== activityTokenRef.current ||
        !isNearElement(scrollable)
      )
        return false;
      setPhase("scrolling");

      const maxScrollTop = scrollable.scrollHeight - scrollable.clientHeight;
      let direction = scrollable.scrollTop > maxScrollTop * 0.72 ? -1 : 1;
      for (let step = 0; step < 3; step += 1) {
        if (
          !scrollable.isConnected ||
          tabIndex !== activeIndexRef.current ||
          activityToken !== activityTokenRef.current ||
          !isNearElement(scrollable)
        )
          return false;
        const nextTop = clamp(
          scrollable.scrollTop + direction * Math.max(80, scrollable.clientHeight * 0.42),
          0,
          maxScrollTop,
        );
        scrollable.scrollTo({ top: nextTop, behavior: "smooth" });
        await wait(520);
        if (nextTop <= 0 || nextTop >= maxScrollTop) direction *= -1;
      }
      return true;
    } finally {
      activityBusyRef.current = false;
      const finishingPhase = phaseRef.current as MascotPhase;
      if (!chaosActiveRef.current && finishingPhase !== "dragging" && finishingPhase !== "thrown") {
        setEmotion("happy");
        setPhase("idle");
      }
    }
  }, [animatePath, buildContourPath, getActiveStage, getRoot, isNearElement, setPhase]);

  const teaseSlider = useCallback(async () => {
    if (phaseRef.current !== "idle" || activityBusyRef.current) return false;
    const root = getRoot();
    const stage = getActiveStage();
    if (!root || !stage) return false;
    const rootRect = root.getBoundingClientRect();
    const slider = randomItem(
      Array.from(stage.querySelectorAll<HTMLElement>("[role='slider']")).filter((element) =>
        isVisible(element, rootRect),
      ),
    );
    if (!slider) return false;

    activityBusyRef.current = true;
    const activityToken = activityTokenRef.current;
    const tabIndex = activeIndexRef.current;
    try {
      setEmotion("excited");
      const arrived = await animatePath(buildContourPath(slider), RUN_SPEED, "running");
      const alive = () =>
        slider.isConnected &&
        tabIndex === activeIndexRef.current &&
        activityToken === activityTokenRef.current &&
        !chaosActiveRef.current &&
        !dragRef.current;
      if (!arrived || !alive() || !isNearElement(slider)) return false;
      setPhase("playing");
      setEmotion(Math.random() < 0.5 ? "angry" : "cool");
      await playSlider(slider, alive);
      return true;
    } finally {
      activityBusyRef.current = false;
      const finishingPhase = phaseRef.current as MascotPhase;
      if (!chaosActiveRef.current && finishingPhase !== "dragging" && finishingPhase !== "thrown") {
        setEmotion("happy");
        setPhase("idle");
      }
    }
  }, [animatePath, buildContourPath, getActiveStage, getRoot, isNearElement, setPhase]);

  const runAutonomousAction = useCallback(async () => {
    if (
      activityBusyRef.current ||
      dragRef.current ||
      chaosActiveRef.current ||
      modalOpenRef.current ||
      carriedButtonRef.current ||
      looseButtonRef.current ||
      phaseRef.current !== "idle"
    )
      return;

    // Calm mode: the mascot only shows off — hops on buttons, scrolls, teases
    // sliders. It never clicks/toggles controls; that mischief is rage-only.
    if (Math.random() < 0.6) {
      const actions = shuffled([scrollActiveList, jumpOnRandomButton, teaseSlider]);
      for (const action of actions) {
        if (await action()) return;
      }
    }
    await roam();
  }, [jumpOnRandomButton, roam, scrollActiveList, teaseSlider]);

  // Leap onto an open modal and keep busy on it. In calm mode the mascot only
  // shows off — teases sliders and poses on the controls — but never clicks or
  // toggles them; flipping switches, stealing and the rest stay rage-only.
  const attendModal = useCallback(
    async (fresh = false) => {
      const root = getRoot();
      const modal = activeModalRef.current;
      if (!root || !modal || modalBusyRef.current) return;
      if (chaosActiveRef.current || dragRef.current || carriedButtonRef.current) return;
      const token = modalClimbTokenRef.current;
      modalBusyRef.current = true;
      try {
        const alive = () =>
          token === modalClimbTokenRef.current &&
          modal.isConnected &&
          !chaosActiveRef.current &&
          !dragRef.current &&
          !carriedButtonRef.current;

        // Let a freshly-opened modal finish its entrance so geometry is stable
        // (reading it mid-animation is what made the jump snap/teleport).
        if (fresh) {
          await wait(170);
          if (!alive()) return;
        }

        const geom = () => {
          const rootRect = root.getBoundingClientRect();
          const rect = modal.getBoundingClientRect();
          return {
            left: rect.left - rootRect.left,
            right: rect.right - rootRect.left,
            top: rect.top - rootRect.top,
            bottom: rect.bottom - rootRect.top,
          };
        };

        const isPerched = () => {
          const g = geom();
          const p = positionRef.current;
          return (
            p.x + MASCOT_SIZE / 2 >= g.left &&
            p.x + MASCOT_SIZE / 2 <= g.right &&
            p.y >= g.top - MASCOT_SIZE - 10 &&
            p.y <= g.top + 40
          );
        };

        // A staging spot just outside the modal (left/right/above), nearest to
        // where the mascot currently stands, that fits on screen.
        const pickLaunchSpot = (g: ReturnType<typeof geom>) => {
          const gap = 24;
          const railY = clamp(g.top + 40, 6, Math.max(6, root.clientHeight - MASCOT_SIZE - 6));
          const overX = clamp(
            positionRef.current.x,
            g.left,
            Math.max(g.left, g.right - MASCOT_SIZE),
          );
          const spots: MascotPosition[] = [];
          if (g.left - MASCOT_SIZE - gap >= 6)
            spots.push({ x: g.left - MASCOT_SIZE - gap, y: railY });
          if (g.right + gap <= root.clientWidth - MASCOT_SIZE - 6)
            spots.push({ x: g.right + gap, y: railY });
          if (g.top - MASCOT_SIZE - gap >= 6)
            spots.push({ x: overX, y: g.top - MASCOT_SIZE - gap });
          let best: MascotPosition | null = null;
          let bestDist = Number.POSITIVE_INFINITY;
          for (const spot of spots) {
            const d = distance(positionRef.current, spot);
            if (d < bestDist) {
              bestDist = d;
              best = spot;
            }
          }
          return best;
        };

        const jumpOn = async () => {
          // 1) Walk over to a launch spot beside the modal — still on the normal
          //    layer, behind the modal. (Doing this after going foreground was
          //    the bug that made him look teleported onto the modal.)
          const spot = pickLaunchSpot(geom());
          setEmotion("surprised");
          if (spot) {
            await animatePath(
              [{ x: spot.x, y: positionRef.current.y }, spot],
              WALK_SPEED * 1.35,
              "walking",
            );
            if (!alive()) return false;
            await wait(70);
            if (!alive()) return false;
          }
          // 2) Only now climb onto the modal's layer…
          setModalForeground(true);
          await wait(90);
          if (!alive()) return false;
          // 3) …and leap up onto it, using the now-settled geometry.
          const g = geom();
          const landX = clamp(
            positionRef.current.x,
            g.left + 20,
            Math.max(g.left + 20, g.right - MASCOT_SIZE - 20),
          );
          const perch = clampPosition({ x: landX, y: g.top - MASCOT_SIZE + 24 });
          setEmotion("excited");
          const landed = await leapTo(perch, { phase: "jumping" });
          if (!alive()) return false;
          if (!landed) setPosition(perch);
          setPhase("climbing");
          setEmotion("cool");
          return true;
        };

        const playAction = async () => {
          const rootRect = root.getBoundingClientRect();
          const visible = (element: HTMLElement) => isVisible(element, rootRect);
          const sliders = Array.from(modal.querySelectorAll<HTMLElement>("[role='slider']")).filter(
            visible,
          );
          // Everything else is only a place to show off on — never operated.
          const poseTargets = Array.from(
            modal.querySelectorAll<HTMLElement>(
              ".bcs-tab, .bce-tab, .brs-toggle-row, .toggle-switch, .inline-dropdown-trigger, .cni-input, button:not(:disabled)",
            ),
          ).filter(visible);

          // Slider teasing is play, not switching — allowed even when calm.
          if (sliders.length > 0 && Math.random() < 0.6) {
            const slider = randomItem(sliders);
            if (!slider) return;
            await animatePath(buildContourPath(slider, 1).slice(0, 3), RUN_SPEED, "climbing");
            if (!alive() || !slider.isConnected || !isNearElement(slider, STEAL_REACH_PX + 30))
              return;
            setEmotion(Math.random() < 0.5 ? "cool" : "excited");
            await playSlider(slider, alive);
            if (!alive()) return;
            setEmotion(randomItem(["cool", "happy", "excited"]) ?? "cool");
            setPhase("climbing");
            return;
          }

          const target = randomItem(poseTargets) ?? randomItem(sliders);
          if (!target) {
            setEmotion(randomItem(["cool", "happy", "confused", "love"]) ?? "cool");
            setPhase("climbing");
            return;
          }
          await animatePath(buildContourPath(target, 1).slice(0, 3), RUN_SPEED, "climbing");
          if (!alive()) return;
          // Strike a pose on it — no click, no toggle, nothing changes.
          setEmotion(randomItem(["happy", "excited", "cool", "love"]) ?? "happy");
          setPhase("playing");
          await wait(700 + Math.random() * 500);
          if (!alive()) return;
          setPhase("climbing");
        };

        if (fresh || !isPerched()) {
          // jumpOn goes foreground itself — only after reaching the launch spot.
          const ok = await jumpOn();
          if (!ok || !alive()) return;
        } else {
          // Already standing on the modal (re-attend) — just make sure we're on
          // its layer and carry on.
          setModalForeground(true);
          setPhase("climbing");
        }
        while (alive()) {
          await playAction();
          if (!alive()) break;
          await wait(520 + Math.random() * 900);
        }
      } finally {
        modalBusyRef.current = false;
      }
    },
    [
      animatePath,
      buildContourPath,
      clampPosition,
      getRoot,
      isNearElement,
      leapTo,
      setPhase,
      setPosition,
    ],
  );

  const moveToElement = useCallback(
    async (element: HTMLElement, token: number) => {
      if (token !== chaosTokenRef.current || !element.isConnected) return false;
      setEmotion(randomItem(["angry", "cool", "excited", "surprised"]) ?? "angry");
      const approachPath = buildContourPath(element, 1).slice(0, 2);
      const arrived = await animatePath(approachPath, CHAOS_SPEED, "chaos");
      return (
        arrived && token === chaosTokenRef.current && element.isConnected && isNearElement(element)
      );
    },
    [animatePath, buildContourPath, isNearElement],
  );

  const ragePressButton = useCallback(
    async (element: HTMLElement, token: number, press: () => void, settleMs = 180) => {
      if (!(await moveToElement(element, token)) || token !== chaosTokenRef.current) return false;
      const root = getRoot();
      if (!root || !element.isConnected) return false;
      const rootRect = root.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      setEmotion("angry");
      setRagePress({
        x: clamp(rect.left - rootRect.left - 26, 2, rootRect.width - 34),
        y: clamp(rect.top - rootRect.top + rect.height / 2 - 16, 2, rootRect.height - 34),
      });
      try {
        await wait(90);
        if (token !== chaosTokenRef.current) return false;
        press();
        await wait(Math.min(settleMs, 420));
        return token === chaosTokenRef.current;
      } finally {
        setRagePress(null);
      }
    },
    [getRoot, moveToElement],
  );

  const ragePressWindowControls = useCallback(
    async (token: number) => {
      const root = getRoot();
      if (!root || token !== chaosTokenRef.current) return false;
      const controls = Array.from(
        root.querySelectorAll<HTMLButtonElement>(".nav-controls button:not(:disabled)"),
      ).filter((button) => isVisible(button, root.getBoundingClientRect()));

      for (const button of controls) {
        if (token !== chaosTokenRef.current) return false;
        await ragePressButton(
          button,
          token,
          () => {
            button.classList.add("mascot-window-button-pressed");
            window.setTimeout(() => button.classList.remove("mascot-window-button-pressed"), 260);
          },
          150,
        );
      }
      return token === chaosTokenRef.current;
    },
    [getRoot, ragePressButton],
  );

  const rageScatterCurrentTab = useCallback(
    async (token: number) => {
      const root = getRoot();
      if (!root || token !== chaosTokenRef.current) return false;
      const rootRect = root.getBoundingClientRect();
      const pool = shuffled(
        Array.from(
          root.querySelectorAll<HTMLElement>(
            [
              ".main-stage .mod-card",
              ".main-stage .installed-mod-row",
              ".main-stage .instance-card",
              ".main-stage .info-panel",
              ".main-stage .detail-block",
              ".main-stage .settings-toggle-row",
              ".main-stage button:not(:disabled)",
            ].join(", "),
          ),
        ).filter(
          (element) =>
            isVisible(element, rootRect) &&
            isStealableElement(element) &&
            !element.closest(".confirm-overlay, .ep-popup"),
        ),
      );
      const selected: HTMLElement[] = [];
      const targetCount = Math.random() > 0.7 ? 2 : 1;
      for (const candidate of pool) {
        if (
          selected.some((element) => element.contains(candidate) || candidate.contains(element))
        ) {
          continue;
        }
        selected.push(candidate);
        if (selected.length >= targetCount) break;
      }

      for (const element of selected) {
        if (token !== chaosTokenRef.current) return false;
        await ragePressButton(element, token, () => void scatterChaosElement(element), 180);
      }
      return token === chaosTokenRef.current;
    },
    [getRoot, ragePressButton, scatterChaosElement],
  );

  const rageRummageCurrentTab = useCallback(
    async (token: number) => {
      const root = getRoot();
      if (!root || token !== chaosTokenRef.current) return false;
      const rootRect = root.getBoundingClientRect();
      const candidates = shuffled(
        Array.from(
          root.querySelectorAll<HTMLElement>(
            [
              ".main-stage .instance-card",
              ".main-stage .inline-dropdown-trigger",
              ".main-stage .settings-toggle-row .toggle-switch:not([data-mascot-off-switch])",
              ".main-stage .theme-switch",
              ".main-stage [role='slider']",
            ].join(", "),
          ),
        ).filter((element) => isVisible(element, rootRect)),
      ).slice(0, 1);

      for (const element of candidates) {
        if (token !== chaosTokenRef.current) return false;
        await ragePressButton(
          element,
          token,
          () => {
            if (element.matches("[role='slider']")) nudgeSlider(element);
            else element.click();
          },
          180,
        );
      }
      return token === chaosTokenRef.current;
    },
    [getRoot, ragePressButton],
  );

  const rageChangeBuildSettings = useCallback(
    async (token: number, tabs: HTMLButtonElement[]) => {
      const root = getRoot();
      const scene = getSceneRoot();
      const buildsTab = tabs.find((tab) => tab.textContent?.trim() === "BUILDS");
      if (!root || !scene || !buildsTab || token !== chaosTokenRef.current) return true;

      const pressOrFallback = async (element: HTMLElement, press: () => void, settleMs = 180) => {
        const pressed = await ragePressButton(element, token, press, settleMs);
        if (pressed || token !== chaosTokenRef.current || !element.isConnected) return pressed;
        press();
        await wait(Math.min(settleMs, 420));
        return token === chaosTokenRef.current;
      };

      const settingsTab = tabs.find((tab) => tab.textContent?.trim() === "SETTINGS");
      if (settingsTab && token === chaosTokenRef.current) {
        await pressOrFallback(settingsTab, () => settingsTab.click(), 360);
        const advancedToggle = Array.from(
          root.querySelectorAll<HTMLButtonElement>(".toggle-switch:not([data-mascot-off-switch])"),
        ).find((toggle) => getToggleLabel(toggle) === "ADVANCED SETTINGS");
        if (advancedToggle && !advancedToggle.classList.contains("enabled")) {
          await pressOrFallback(
            advancedToggle,
            () => {
              chaosSnapshotRef.current?.toggles.push({
                label: "ADVANCED SETTINGS",
                wasEnabled: false,
              });
              advancedToggle.click();
            },
            360,
          );
        }
      }

      if (!(await pressOrFallback(buildsTab, () => buildsTab.click(), 420))) return false;
      const rootRect = root.getBoundingClientRect();
      const cards = Array.from(
        root.querySelectorAll<HTMLButtonElement>(".instance-card[data-instance-id]"),
      ).filter((card) => isVisible(card, rootRect));
      const card = randomItem(cards);
      if (!card) return true;
      if (!(await pressOrFallback(card, () => card.click(), 300))) return false;

      const gear = root.querySelector<HTMLButtonElement>(".settings-icon-action");
      if (!gear || !(await pressOrFallback(gear, () => gear.click(), 520))) return false;
      const popup = scene.querySelector<HTMLElement>(".build-card-settings-dialog.ep-popup--open");
      if (!popup) return true;

      const memorySlider = popup.querySelector<HTMLElement>(".brs-slider [role='slider']");
      if (memorySlider) {
        memorySlider.scrollIntoView({ block: "center", behavior: "smooth" });
        await wait(220);
        await pressOrFallback(memorySlider, () => nudgeSlider(memorySlider), 220);
      }

      const textarea = popup.querySelector<HTMLTextAreaElement>(".jae-textarea");
      if (textarea) {
        const lines = textarea.value.replace(/\r\n?/g, "\n").split("\n");
        const additions = [
          "-Dscreen.mascot.chaos=true",
          "-XX:+UseStringDeduplication",
          "-Dfile.encoding=UTF-8",
        ];
        let nextValue: string;
        if (Math.random() < 0.32 && lines.some((line) => line.trim())) {
          let lastFilled = lines.length - 1;
          while (lastFilled > 0 && !lines[lastFilled].trim()) lastFilled -= 1;
          nextValue = lines.filter((_, index) => index !== lastFilled).join("\n");
        } else {
          const addition =
            randomItem(additions.filter((candidate) => !lines.includes(candidate))) ??
            `-Dscreen.mascot.seed=${Math.floor(Math.random() * 10_000)}`;
          nextValue = `${textarea.value.trimEnd()}${textarea.value.trim() ? "\n" : ""}${addition}`;
        }
        await pressOrFallback(textarea, () => setNativeControlValue(textarea, nextValue), 260);
      }

      const windowInputs = [
        ["Window width", String(randomItem([854, 960, 1280, 1600, 1920]) ?? 1280)],
        ["Window height", String(randomItem([480, 540, 720, 900, 1080]) ?? 720)],
      ] as const;
      for (const [label, value] of windowInputs) {
        const input = popup.querySelector<HTMLInputElement>(`.cni-input[aria-label='${label}']`);
        if (!input) continue;
        input.scrollIntoView({ block: "center", behavior: "smooth" });
        await wait(260);
        await pressOrFallback(input, () => setNativeControlValue(input, value), 220);
      }

      const fullscreen = popup.querySelector<HTMLButtonElement>(".brs-toggle-row");
      if (fullscreen && Math.random() > 0.35) {
        await pressOrFallback(fullscreen, () => fullscreen.click(), 240);
      }

      const modsTab = Array.from(popup.querySelectorAll<HTMLButtonElement>(".bcs-tab")).find(
        (button) => button.textContent?.trim() === "MODS",
      );
      if (modsTab && (await pressOrFallback(modsTab, () => modsTab.click(), 620))) {
        const enabledMod = randomItem(
          Array.from(
            popup.querySelectorAll<HTMLButtonElement>(".bme-toggle.enabled:not(:disabled)"),
          ),
        );
        if (enabledMod) {
          await pressOrFallback(enabledMod, () => enabledMod.click(), 520);
        }
      }

      const buildTab = Array.from(popup.querySelectorAll<HTMLButtonElement>(".bcs-tab")).find(
        (button) => button.textContent?.trim() === "BUILD",
      );
      if (buildTab) await pressOrFallback(buildTab, () => buildTab.click(), 280);
      const save = popup.querySelector<HTMLButtonElement>(".bce-hdr-btn--save");
      if (save) await pressOrFallback(save, () => save.click(), 720);
      return token === chaosTokenRef.current;
    },
    [getRoot, getSceneRoot, ragePressButton],
  );

  const rageFakeDeleteBuild = useCallback(
    async (token: number, tabs: HTMLButtonElement[]) => {
      const root = getRoot();
      const scene = getSceneRoot();
      const buildsTab = tabs.find((tab) => tab.textContent?.trim() === "BUILDS");
      if (!root || !scene || !buildsTab || token !== chaosTokenRef.current) return true;
      if (!(await ragePressButton(buildsTab, token, () => buildsTab.click(), 360))) return false;

      const rootRect = root.getBoundingClientRect();
      const card = randomItem(
        Array.from(
          root.querySelectorAll<HTMLButtonElement>(".instance-card[data-instance-id]"),
        ).filter((candidate) => isVisible(candidate, rootRect)),
      );
      if (!card) return true;
      if (!(await ragePressButton(card, token, () => card.click(), 260))) return false;
      const trash = root.querySelector<HTMLButtonElement>(".trash-action[data-mascot-instance-id]");
      if (!trash) return true;
      const instanceId = trash.dataset.mascotInstanceId;
      const instanceName = trash.dataset.mascotInstanceName ?? card.textContent?.trim() ?? "BUILD";
      if (!instanceId) return true;
      if (
        !(await ragePressButton(
          trash,
          token,
          () =>
            window.dispatchEvent(
              new CustomEvent(MASCOT_FAKE_DELETE_EVENT, {
                detail: { instanceId, instanceName },
              }),
            ),
          260,
        ))
      )
        return false;

      const confirm = scene.querySelector<HTMLButtonElement>(
        ".confirm-btn-delete[data-mascot-fake-delete]",
      );
      if (confirm && !(await ragePressButton(confirm, token, () => confirm.click(), 520))) {
        return false;
      }
      return token === chaosTokenRef.current;
    },
    [getRoot, getSceneRoot, ragePressButton],
  );

  const rageFakeDeleteContent = useCallback(
    async (token: number) => {
      const root = getRoot();
      if (!root || token !== chaosTokenRef.current) return false;
      const rootRect = root.getBoundingClientRect();
      const installedRows = Array.from(
        root.querySelectorAll<HTMLElement>(
          ".installed-mod-swipe[data-mascot-project-id], .mod-card[data-mascot-installed='true'][data-mascot-project-id]",
        ),
      ).filter((row) => isVisible(row, rootRect));
      const row = randomItem(installedRows);
      if (!row) return true;
      const deleteButton = row.querySelector<HTMLButtonElement>(
        ".installed-mod-delete-btn, .catalog-action.danger",
      );
      const projectId = row.dataset.mascotProjectId;
      const kind = row.dataset.mascotContentKind;
      const title = row.dataset.mascotContentTitle ?? "MOD";
      if (!deleteButton || !projectId || !kind) return true;
      return ragePressButton(
        deleteButton,
        token,
        () =>
          window.dispatchEvent(
            new CustomEvent(MASCOT_FAKE_CONTENT_DELETE_EVENT, {
              detail: { kind, projectId, title },
            }),
          ),
        420,
      );
    },
    [getRoot, ragePressButton],
  );

  const startChaos = useCallback(async () => {
    if (chaosActiveRef.current) return;
    const root = getRoot();
    if (!root) return;

    if (carriedButtonRef.current) restoreCarriedButton(false);
    if (looseButtonRef.current) clearLooseButton();
    clearChaosDebris();
    clearMischiefDecayTimer();
    activityTokenRef.current += 1;
    activityBusyRef.current = false;
    cancelMotion();
    const token = chaosTokenRef.current + 1;
    chaosTokenRef.current = token;
    chaosActiveRef.current = true;
    setChaosActive(true);
    setThrowProgress(0);
    throwTimesRef.current = [];
    chaosSnapshotRef.current = { originalTabIndex: activeIndexRef.current, toggles: [] };
    setEmotion("angry");
    setPhase("chaos");

    const getTabs = () => Array.from(root.querySelectorAll<HTMLButtonElement>(".side-nav button"));
    const attempt = async (action: () => Promise<boolean>) => {
      try {
        return await action();
      } catch {
        setRagePress(null);
        return false;
      }
    };

    try {
      const tabs = getTabs();
      const settingsTab = tabs[tabs.length - 1];

      if (settingsTab && token === chaosTokenRef.current) {
        const reached = await attempt(() =>
          ragePressButton(settingsTab, token, () => settingsTab.click(), 420),
        );
        if (!reached && settingsTab.isConnected) {
          settingsTab.click();
          await wait(420);
        }
      }

      const toggles = Array.from(
        root.querySelectorAll<HTMLButtonElement>(".toggle-switch:not([data-mascot-off-switch])"),
      ).filter(
        (toggle) =>
          !toggle.disabled &&
          getToggleLabel(toggle) &&
          getToggleLabel(toggle) !== "ADVANCED SETTINGS",
      );
      const selectedToggles = shuffled(toggles).slice(0, Math.min(4, toggles.length));

      for (const toggle of selectedToggles) {
        const label = getToggleLabel(toggle);
        const wasEnabled = toggle.classList.contains("enabled");
        await attempt(() =>
          ragePressButton(
            toggle,
            token,
            () => {
              chaosSnapshotRef.current?.toggles.push({ label, wasEnabled });
              toggle.click();
            },
            300,
          ),
        );
      }

      const advancedToggle = Array.from(
        root.querySelectorAll<HTMLButtonElement>(".toggle-switch:not([data-mascot-off-switch])"),
      ).find((toggle) => getToggleLabel(toggle) === "ADVANCED SETTINGS");
      if (advancedToggle && !advancedToggle.classList.contains("enabled")) {
        await attempt(() =>
          ragePressButton(
            advancedToggle,
            token,
            () => {
              chaosSnapshotRef.current?.toggles.push({
                label: "ADVANCED SETTINGS",
                wasEnabled: false,
              });
              advancedToggle.click();
            },
            360,
          ),
        );
      }

      const settingsSliders = Array.from(
        root.querySelectorAll<HTMLElement>(".main-stage [role='slider']"),
      )
        .filter((slider) => isVisible(slider, root.getBoundingClientRect()))
        .slice(0, 2);
      for (const slider of settingsSliders) {
        await attempt(() => ragePressButton(slider, token, () => nudgeSlider(slider), 220));
      }

      await attempt(() => ragePressWindowControls(token));

      const warmupTabs = shuffled(getTabs().slice(0, -1));
      for (const tab of warmupTabs) {
        const reached = await attempt(() => ragePressButton(tab, token, () => tab.click()));
        if (token !== chaosTokenRef.current) return;
        if (!reached && tab.isConnected) {
          tab.click();
          await wait(320);
        }
        const tabLabel = tab.textContent?.trim();
        if (tabLabel === "BUILDS") {
          await attempt(() => rageChangeBuildSettings(token, getTabs()));
          await attempt(() => rageFakeDeleteBuild(token, getTabs()));
        }
        if (tabLabel === "MODRINTH") {
          await attempt(() => rageFakeDeleteContent(token));
        }
        await attempt(() => rageRummageCurrentTab(token));
        await attempt(() => rageScatterCurrentTab(token));
      }

      if (settingsTab && token === chaosTokenRef.current) {
        const reached = await attempt(() =>
          ragePressButton(settingsTab, token, () => settingsTab.click(), 360),
        );
        if (!reached && settingsTab.isConnected) {
          settingsTab.click();
          await wait(320);
        }
        await attempt(() => rageRummageCurrentTab(token));
        await attempt(() => rageScatterCurrentTab(token));
      }

      if (token !== chaosTokenRef.current) return;
      const finalTabs = getTabs().filter((_, index) => index !== activeIndexRef.current);
      const finalTab = randomItem(finalTabs);
      if (finalTab) {
        const reached = await attempt(() =>
          ragePressButton(finalTab, token, () => finalTab.click()),
        );
        if (!reached && finalTab.isConnected) finalTab.click();
      }
    } finally {
      if (token === chaosTokenRef.current) {
        setRagePress(null);
        setEmotion("cool");
        setPhase("idle");
      }
    }
  }, [
    cancelMotion,
    clearChaosDebris,
    clearLooseButton,
    clearMischiefDecayTimer,
    getRoot,
    rageChangeBuildSettings,
    rageFakeDeleteBuild,
    rageFakeDeleteContent,
    ragePressButton,
    ragePressWindowControls,
    rageRummageCurrentTab,
    rageScatterCurrentTab,
    restoreCarriedButton,
    setPhase,
  ]);

  const registerHardThrow = useCallback(
    (speed: number) => {
      if (speed < THROW_THRESHOLD || chaosActiveRef.current) return;
      clearMischiefDecayTimer();
      const now = Date.now();
      throwTimesRef.current = [
        ...throwTimesRef.current.filter((time) => now - time < THROW_HISTORY_MS),
        now,
      ];
      setThrowProgress(throwTimesRef.current.length);
      if (throwTimesRef.current.length >= THROWS_TO_CHAOS) {
        // Let the final throw visibly leave the hand before the mascot takes over.
        window.setTimeout(() => void startChaos(), 180);
      } else {
        scheduleMischiefDecay();
      }
    },
    [clearMischiefDecayTimer, scheduleMischiefDecay, startChaos],
  );

  const ejectCarriedButton = useCallback(
    (velocity: MascotPosition) => {
      const carried = carriedButtonRef.current;
      const root = getRoot();
      if (!carried || !root) return;

      carriedButtonRef.current = null;
      looseButtonRef.current = carried;
      setCarriedButton(null);
      setLooseButton(carried);

      const maxX = Math.max(4, root.clientWidth - carried.width - 4);
      const maxY = Math.max(4, root.clientHeight - carried.height - 4);
      let current: LooseButtonTransform = {
        x: clamp(positionRef.current.x + (MASCOT_SIZE - carried.width) / 2, 4, maxX),
        y: clamp(positionRef.current.y + 14 - carried.height, 4, maxY),
        rotation: 0,
      };
      setLooseButtonTransform(current);

      let vx = clamp(velocity.x * 0.38 + (Math.random() - 0.5) * 0.7, -2.4, 2.4);
      let vy = clamp(velocity.y * 0.16 - 1.15, -2.35, -0.72);
      let spin = clamp(vx * 0.48 + (Math.random() - 0.5) * 0.65, -1.25, 1.25);
      if (Math.abs(spin) < 0.32) spin = spin < 0 ? -0.32 : 0.32;
      let previousTime = performance.now();
      let settledFrames = 0;

      const step = (now: number) => {
        if (looseButtonRef.current !== carried) return;
        const dt = Math.min(28, now - previousTime);
        previousTime = now;
        const next: LooseButtonTransform = {
          x: current.x + vx * dt,
          y: current.y + vy * dt,
          rotation: current.rotation + spin * dt,
        };
        vy += 0.00225 * dt;
        vx *= Math.pow(0.991, dt / 16.67);
        spin *= Math.pow(0.994, dt / 16.67);

        if (next.x <= 4 || next.x >= maxX) {
          next.x = clamp(next.x, 4, maxX);
          vx *= -0.7;
          spin *= -0.82;
        }
        if (next.y <= 4 || next.y >= maxY) {
          next.y = clamp(next.y, 4, maxY);
          vy *= -0.58;
          spin *= 0.82;
        }

        const restingOnFloor = next.y >= maxY - 0.5 && Math.abs(vy) < 0.18;
        if (restingOnFloor) {
          vy = 0;
          vx *= 0.82;
          spin *= 0.8;
          settledFrames += 1;
        } else {
          settledFrames = 0;
        }

        current = next;
        setLooseButtonTransform(next);
        if (settledFrames > 10 && Math.abs(vx) < 0.055 && Math.abs(spin) < 0.055) {
          looseButtonFrameRef.current = null;
          looseButtonReturnTimerRef.current = window.setTimeout(() => {
            looseButtonReturnTimerRef.current = null;
            clearLooseButton();
          }, 1_050);
          return;
        }
        looseButtonFrameRef.current = window.requestAnimationFrame(step);
      };

      looseButtonFrameRef.current = window.requestAnimationFrame(step);
      resetStealClock();
    },
    [clearLooseButton, getRoot, resetStealClock],
  );

  const launchThrow = useCallback(
    (velocity: MascotPosition) => {
      cancelMotion();
      const bounds = getBounds();
      if (!bounds) return;
      ejectCarriedButton(velocity);
      setEmotion("surprised");
      setPhase("thrown");
      registerHardThrow(Math.hypot(velocity.x, velocity.y));

      let vx = clamp(velocity.x, -3.2, 3.2);
      let vy = clamp(velocity.y, -3.2, 3.2);
      let previousTime = performance.now();
      let settledFrames = 0;

      const step = (now: number) => {
        const dt = Math.min(28, now - previousTime);
        previousTime = now;
        const next = {
          x: positionRef.current.x + vx * dt,
          y: positionRef.current.y + vy * dt,
        };
        vy += 0.0021 * dt;
        const damping = Math.pow(0.992, dt / 16.67);
        vx *= damping;
        vy *= damping;

        let bounced = false;
        if (next.x <= bounds.minX || next.x >= bounds.maxX) {
          next.x = clamp(next.x, bounds.minX, bounds.maxX);
          vx *= -0.76;
          bounced = true;
        }
        if (next.y <= bounds.minY || next.y >= bounds.maxY) {
          next.y = clamp(next.y, bounds.minY, bounds.maxY);
          vy *= -0.72;
          bounced = true;
        }
        if (bounced) setEmotion("confused");
        setPosition(next);

        const restingOnFloor = next.y >= bounds.maxY - 0.5 && Math.abs(vy) < 0.2;
        if (restingOnFloor) {
          vy = 0;
          vx *= 0.88;
          settledFrames += 1;
        } else {
          settledFrames = 0;
        }

        if ((settledFrames > 12 && Math.abs(vx) < 0.08) || Math.hypot(vx, vy) < 0.035) {
          motionFrameRef.current = null;
          setEmotion("neutral");
          setPhase("idle");
          return;
        }
        motionFrameRef.current = window.requestAnimationFrame(step);
      };

      motionFrameRef.current = window.requestAnimationFrame(step);
    },
    [cancelMotion, ejectCarriedButton, getBounds, registerHardThrow, setPhase, setPosition],
  );

  const undoChaos = useCallback(async () => {
    const snapshot = chaosSnapshotRef.current;
    if (!snapshot) return;
    chaosTokenRef.current += 1;
    cancelMotion();
    const root = getRoot();
    if (!root) return;

    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".side-nav button"));
    tabs[tabs.length - 1]?.click();
    await wait(350);

    const currentToggles = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".toggle-switch:not([data-mascot-off-switch])"),
    );
    snapshot.toggles.forEach(({ label, wasEnabled }) => {
      const toggle = currentToggles.find((candidate) => getToggleLabel(candidate) === label);
      if (toggle && toggle.classList.contains("enabled") !== wasEnabled) toggle.click();
    });
    await wait(180);
    tabs[snapshot.originalTabIndex]?.click();
    window.dispatchEvent(new Event(MASCOT_FAKE_RESTORE_EVENT));
    clearChaosDebris();

    chaosSnapshotRef.current = null;
    chaosActiveRef.current = false;
    setRagePress(null);
    setChaosActive(false);
    setEmotion("shy");
    setPhase("idle");
  }, [cancelMotion, clearChaosDebris, getRoot, setPhase]);

  const petMascot = useCallback(() => {
    if (chaosActiveRef.current || dragRef.current) return;
    scheduleMischiefDecay();
    cancelMotion();
    clearEmotionTimer();
    setEmotion(Math.random() > 0.35 ? "love" : "happy");
    setPhase("petting");
    emotionTimerRef.current = window.setTimeout(() => {
      emotionTimerRef.current = null;
      if (phaseRef.current === "petting") {
        setEmotion("happy");
        if (modalOpenRef.current) void attendModal();
        else setPhase("idle");
      }
    }, 1_050);
  }, [attendModal, cancelMotion, clearEmotionTimer, scheduleMischiefDecay, setPhase]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (chaosActiveRef.current) return;
    const root = getRoot();
    if (!root) return;
    scheduleMischiefDecay();
    activityTokenRef.current += 1;
    activityBusyRef.current = false;
    cancelMotion();
    clearEmotionTimer();
    const rect = root.getBoundingClientRect();
    const current = positionRef.current;
    const now = performance.now();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left - current.x,
      offsetY: event.clientY - rect.top - current.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      shakeTurns: 0,
      lastDirection: 0,
      samples: [{ x: event.clientX, y: event.clientY, time: now }],
    };
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setEmotion("surprised");
    setPhase("dragging");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const root = getRoot();
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const now = performance.now();
    const previous = drag.samples[drag.samples.length - 1];
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) drag.moved = true;

    if (previous) {
      const dx = event.clientX - previous.x;
      const direction = Math.sign(dx);
      if (Math.abs(dx) > 7 && drag.lastDirection !== 0 && direction !== drag.lastDirection)
        drag.shakeTurns += 1;
      if (Math.abs(dx) > 7) drag.lastDirection = direction;
      if (drag.shakeTurns >= 4) setEmotion("excited");
      // Shaking the mascot while it clutches a stolen element makes it lose its
      // grip — the element tumbles out of its hands and returns to its place.
      if (drag.shakeTurns >= 3 && carriedButtonRef.current) {
        ejectCarriedButton({ x: direction * 0.6, y: 0.85 });
        setEmotion("surprised");
        drag.shakeTurns = 0;
      }
    }

    drag.samples.push({ x: event.clientX, y: event.clientY, time: now });
    drag.samples = drag.samples.filter((sample) => now - sample.time <= 110).slice(-7);
    setPosition(
      clampPosition({
        x: event.clientX - rect.left - drag.offsetX,
        y: event.clientY - rect.top - drag.offsetY,
      }),
    );
  };

  const completeDrag = useCallback(
    (pointerId?: number, captureTarget?: HTMLDivElement) => {
      const drag = dragRef.current;
      if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
      dragRef.current = null;
      if (captureTarget?.hasPointerCapture(drag.pointerId)) {
        captureTarget.releasePointerCapture(drag.pointerId);
      }
      if (!drag.moved) {
        if (!carriedButtonRef.current && modalOpenRef.current) void attendModal();
        else setPhase(carriedButtonRef.current ? "carrying" : "idle");
        return;
      }

      ignoreClickRef.current = true;
      window.setTimeout(() => {
        ignoreClickRef.current = false;
      }, 350);
      const latest = drag.samples[drag.samples.length - 1];
      const oldest = drag.samples[0];
      const elapsed = latest && oldest ? Math.max(16, latest.time - oldest.time) : 16;
      const velocity =
        latest && oldest
          ? { x: (latest.x - oldest.x) / elapsed, y: (latest.y - oldest.y) / elapsed }
          : { x: 0, y: 0 };
      if (Math.hypot(velocity.x, velocity.y) > 0.32) launchThrow(velocity);
      else {
        setEmotion(drag.shakeTurns >= 4 ? "excited" : "happy");
        if (!carriedButtonRef.current && modalOpenRef.current) void attendModal();
        else setPhase(carriedButtonRef.current ? "carrying" : "idle");
      }
    },
    [attendModal, launchThrow, setPhase],
  );

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    completeDrag(event.pointerId, event.currentTarget);
  };

  const handleClick = () => {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return;
    }
    if (carriedButtonRef.current) {
      restoreCarriedButton(true);
      return;
    }
    petMascot();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (carriedButtonRef.current) restoreCarriedButton(true);
    else petMascot();
  };

  useEffect(() => {
    if (!enabled) return;
    const scene = getSceneRoot();
    const root = getRoot();
    if (!scene || !root) return;

    let checkFrame: number | null = null;
    const findVisibleModal = () => {
      const candidates = Array.from(
        scene.querySelectorAll<HTMLElement>(
          [
            ".ep-popup--modal.ep-popup--open[aria-hidden='false']",
            ".confirm-overlay .confirm-dialog",
            ".confirm-overlay .stats-modal",
            ".confirm-overlay .screenshots-modal",
            ".confirm-overlay .ms-modal",
          ].join(", "),
        ),
      );
      return candidates.reverse().find((candidate) => {
        const style = window.getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();
        return (
          rect.width > 40 &&
          rect.height > 30 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0"
        );
      });
    };

    const checkModal = () => {
      checkFrame = null;
      const modal = findVisibleModal() ?? null;
      if (modal === activeModalRef.current) return;

      activeModalRef.current = modal;
      modalOpenRef.current = modal !== null;
      const climbToken = modalClimbTokenRef.current + 1;
      modalClimbTokenRef.current = climbToken;

      if (!modal) {
        modalBusyRef.current = false;
        setModalForeground(false);
        if (phaseRef.current === "climbing" || phaseRef.current === "jumping") {
          cancelMotion();
          setEmotion("neutral");
          setPhase(carriedButtonRef.current ? "carrying" : "idle");
        }
        return;
      }

      if (chaosActiveRef.current || dragRef.current) {
        setModalForeground(true);
        return;
      }

      activityTokenRef.current += 1;
      activityBusyRef.current = false;
      modalBusyRef.current = false;
      cancelMotion();
      // Foreground is deferred: the mascot first walks to a launch spot on the
      // normal layer, and only steps onto the modal's layer right before jumping.
      setEmotion("surprised");
      void attendModal(true);
    };

    const scheduleCheck = () => {
      if (checkFrame !== null) window.cancelAnimationFrame(checkFrame);
      checkFrame = window.requestAnimationFrame(checkModal);
    };
    const observer = new MutationObserver(scheduleCheck);
    observer.observe(scene, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "aria-hidden"],
    });
    scheduleCheck();
    return () => {
      observer.disconnect();
      if (checkFrame !== null) window.cancelAnimationFrame(checkFrame);
      modalClimbTokenRef.current += 1;
      activeModalRef.current = null;
      modalOpenRef.current = false;
    };
  }, [attendModal, cancelMotion, enabled, getRoot, getSceneRoot, setPhase]);

  useEffect(() => {
    if (!enabled) return;
    const firstRoam = window.setTimeout(() => void runAutonomousAction(), 450);
    const interval = window.setInterval(() => {
      if (modalOpenRef.current) {
        // Keep the mascot busy on any open modal (also re-boards it after a throw).
        if (!modalBusyRef.current && !dragRef.current && !chaosActiveRef.current) {
          void attendModal();
        }
      } else if (
        Date.now() >= nextStealAtRef.current &&
        !carriedButtonRef.current &&
        !looseButtonRef.current
      ) {
        void stealRandomButton();
      } else {
        void runAutonomousAction();
      }
    }, ROAM_INTERVAL_MS);
    return () => {
      window.clearTimeout(firstRoam);
      window.clearInterval(interval);
    };
  }, [attendModal, enabled, runAutonomousAction, stealRandomButton]);

  useEffect(() => {
    if (!enabled || chaosActiveRef.current || dragRef.current) return;
    activityTokenRef.current += 1;
    activityBusyRef.current = false;
    cancelMotion();
    if (carriedButtonRef.current) restoreCarriedButton(false);
    if (looseButtonRef.current) clearLooseButton();
    setPhase("idle");
    const timer = window.setTimeout(() => void runAutonomousAction(), 220);
    return () => window.clearTimeout(timer);
  }, [
    activeIndex,
    cancelMotion,
    clearLooseButton,
    enabled,
    restoreCarriedButton,
    runAutonomousAction,
    setPhase,
  ]);

  useEffect(() => {
    if (phase !== "dragging") return;
    const handlePointerEnd = (event: PointerEvent) =>
      completeDrag(event.pointerId, characterRef.current ?? undefined);
    const handleMouseUp = () => completeDrag(undefined, characterRef.current ?? undefined);
    const handleBlur = () => completeDrag(undefined, characterRef.current ?? undefined);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [completeDrag, phase]);

  useEffect(() => {
    if (!enabled) {
      chaosTokenRef.current += 1;
      activityTokenRef.current += 1;
      chaosActiveRef.current = false;
      cancelMotion();
      clearEmotionTimer();
      clearMischiefDecayTimer();
      activityBusyRef.current = false;
      dragRef.current = null;
      setRagePress(null);
      setModalForeground(false);
      clearChaosDebris();
      if (carriedButtonRef.current) restoreCarriedButton(false);
      if (looseButtonRef.current) clearLooseButton();
    }
  }, [
    cancelMotion,
    clearEmotionTimer,
    clearChaosDebris,
    clearLooseButton,
    clearMischiefDecayTimer,
    enabled,
    restoreCarriedButton,
  ]);

  useEffect(() => {
    const handleResize = () => setPosition(clampPosition(positionRef.current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition, setPosition]);

  useEffect(
    () => () => {
      chaosTokenRef.current += 1;
      activityTokenRef.current += 1;
      cancelMotion();
      clearEmotionTimer();
      clearMischiefDecayTimer();
      clearChaosDebris();
      if (looseButtonFrameRef.current !== null)
        window.cancelAnimationFrame(looseButtonFrameRef.current);
      if (looseButtonReturnTimerRef.current !== null)
        window.clearTimeout(looseButtonReturnTimerRef.current);
      const carried = carriedButtonRef.current;
      const loose = looseButtonRef.current;
      if (carried) restoreCarriedElement(carried);
      if (loose) restoreCarriedElement(loose);
    },
    [cancelMotion, clearChaosDebris, clearEmotionTimer, clearMischiefDecayTimer],
  );

  if (!enabled) return null;

  const style = {
    transform: `translate3d(${position.x.toFixed(2)}px, ${position.y.toFixed(2)}px, 0)`,
  } satisfies CSSProperties;

  return (
    <div
      ref={layerRef}
      className={`launcher-mascot-layer ${modalForeground ? "launcher-mascot-layer--foreground" : ""}`}
    >
      {chaosActive && (
        <button className="launcher-mascot-undo" type="button" onClick={() => void undoChaos()}>
          <span aria-hidden="true">↶</span>
          ОТКАТИТЬ ИЗМЕНЕНИЯ МАСКОТА
        </button>
      )}

      {ragePress && (
        <PiskelSprite
          asset={HAND_ASSETS.point}
          className="launcher-mascot-rage-hand"
          style={{ left: ragePress.x, top: ragePress.y }}
        />
      )}

      {looseButton && (
        <div
          ref={looseButtonReplicaRef}
          className="launcher-mascot-loose-button"
          style={{
            width: looseButton.width,
            height: looseButton.height,
            transform: `translate3d(${looseButtonTransform.x.toFixed(2)}px, ${looseButtonTransform.y.toFixed(2)}px, 0) rotate(${looseButtonTransform.rotation.toFixed(2)}deg)`,
          }}
          aria-hidden="true"
        />
      )}

      <div
        ref={characterRef}
        className={`launcher-mascot-character launcher-mascot-character--${phase}`}
        style={style}
        data-emotion={emotion}
        role="button"
        aria-label={
          carriedButton
            ? "Маскот несёт кнопку. Нажмите, чтобы вернуть её."
            : "Маскот. Нажмите, чтобы погладить, или перетащите и бросьте."
        }
        tabIndex={0}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={handleKeyDown}
      >
        {throwProgress > 0 && throwProgress < THROWS_TO_CHAOS && (
          <span className="launcher-mascot-mischief" aria-hidden="true">
            {"!".repeat(throwProgress)}
          </span>
        )}
        {carriedButton && (
          <span
            className="launcher-mascot-cargo"
            style={{ width: carriedButton.width, height: carriedButton.height }}
            aria-hidden="true"
          >
            <PiskelSprite
              asset={HAND_ASSETS.left}
              className="launcher-mascot-arm launcher-mascot-arm--left"
            />
            <div ref={replicaRef} className="launcher-mascot-button-replica" />
            <PiskelSprite
              asset={HAND_ASSETS.right}
              className="launcher-mascot-arm launcher-mascot-arm--right"
            />
          </span>
        )}
        <img
          className="launcher-mascot-body"
          src={MASCOT_SPRITES[emotion]}
          alt=""
          draggable={false}
          aria-hidden="true"
        />
        <span className="launcher-mascot-tooltip" aria-hidden="true">
          {carriedButton ? "Нажми, чтобы вернуть кнопку" : "Погладь или брось маскота"}
        </span>
      </div>
    </div>
  );
}
