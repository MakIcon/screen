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
const THROW_THRESHOLD = 1.15;
const THROW_HISTORY_MS = 11_000;
const THROWS_TO_CHAOS = 3;
const MIN_STEAL_DELAY_MS = 18_000;
const STEAL_DELAY_VARIANCE_MS = 14_000;

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

type CarriedButton = {
  element: HTMLButtonElement;
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

function isStealableButton(button: HTMLButtonElement) {
  return !button.matches("[data-mascot-ignore], .mascot-button-carried-source");
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

function mountButtonReplica(holder: HTMLElement, button: CarriedButton) {
  const clone = button.element.cloneNode(true) as HTMLButtonElement;
  button.element.classList.remove("mascot-button-carried-source");
  try {
    copyComputedTree(button.element, clone);
  } finally {
    button.element.classList.add("mascot-button-carried-source");
  }
  clone.classList.remove("mascot-button-carried-source");
  clone.removeAttribute("id");
  clone.removeAttribute("aria-hidden");
  clone.setAttribute("aria-hidden", "true");
  clone.tabIndex = -1;
  clone.style.setProperty("width", `${button.width}px`, "important");
  clone.style.setProperty("height", `${button.height}px`, "important");
  clone.style.setProperty("min-width", `${button.width}px`, "important");
  clone.style.setProperty("max-width", `${button.width}px`, "important");
  clone.style.setProperty("box-sizing", "border-box", "important");
  clone.style.setProperty("position", "relative", "important");
  clone.style.setProperty("inset", "auto", "important");
  clone.style.setProperty("margin", "0", "important");
  clone.style.setProperty("transform", "none", "important");
  clone.style.setProperty("visibility", "visible", "important");
  clone.style.setProperty("pointer-events", "none", "important");
  holder.replaceChildren(clone);
  return () => holder.replaceChildren();
}

function restoreButtonElement(button: CarriedButton) {
  if (!button.element.isConnected) return;
  button.element.classList.remove("mascot-button-carried-source");
  if (button.previousAriaHidden === null) button.element.removeAttribute("aria-hidden");
  else button.element.setAttribute("aria-hidden", button.previousAriaHidden);
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
  const throwTimesRef = useRef<number[]>([]);
  const ignoreClickRef = useRef(false);
  const chaosTokenRef = useRef(0);
  const chaosActiveRef = useRef(false);
  const chaosSnapshotRef = useRef<ChaosSnapshot | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const nextStealAtRef = useRef(
    Date.now() + MIN_STEAL_DELAY_MS + Math.random() * STEAL_DELAY_VARIANCE_MS,
  );
  const carriedButtonRef = useRef<CarriedButton | null>(null);
  const looseButtonRef = useRef<CarriedButton | null>(null);
  const looseButtonFrameRef = useRef<number | null>(null);
  const looseButtonReturnTimerRef = useRef<number | null>(null);
  const activityBusyRef = useRef(false);
  const replicaRef = useRef<HTMLDivElement | null>(null);
  const looseButtonReplicaRef = useRef<HTMLDivElement | null>(null);

  const [position, setPositionState] = useState(positionRef.current);
  const [phase, setPhaseState] = useState<MascotPhase>("idle");
  const [emotion, setEmotion] = useState<MascotEmotion>("neutral");
  const [carriedButton, setCarriedButton] = useState<CarriedButton | null>(null);
  const [looseButton, setLooseButton] = useState<CarriedButton | null>(null);
  const [looseButtonTransform, setLooseButtonTransform] = useState<LooseButtonTransform>({
    x: 0,
    y: 0,
    rotation: 0,
  });
  const [ragePress, setRagePress] = useState<MascotPosition | null>(null);
  const [chaosActive, setChaosActive] = useState(false);
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
    if (loose) restoreButtonElement(loose);
    setLooseButton(null);
  }, []);

  const restoreCarriedButton = useCallback(
    (celebrate = true) => {
      const carried = carriedButtonRef.current;
      if (!carried) return;
      carriedButtonRef.current = null;
      restoreButtonElement(carried);
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
    return mountButtonReplica(holder, carriedButton);
  }, [carriedButton]);

  useEffect(() => {
    const holder = looseButtonReplicaRef.current;
    if (!holder || !looseButton) return;
    return mountButtonReplica(holder, looseButton);
  }, [looseButton]);

  const stealRandomButton = useCallback(async () => {
    if (
      chaosActiveRef.current ||
      dragRef.current ||
      carriedButtonRef.current ||
      looseButtonRef.current ||
      phaseRef.current !== "idle"
    ) {
      return false;
    }
    const root = getRoot();
    const stage = getActiveStage();
    if (!root || !stage) return false;
    const rootRect = root.getBoundingClientRect();
    const candidates = Array.from(stage.querySelectorAll<HTMLButtonElement>("button")).filter(
      (button) => isVisible(button, rootRect) && isStealableButton(button),
    );
    const target = randomItem(candidates);
    if (!target) {
      resetStealClock();
      return false;
    }

    setEmotion("cool");
    const arrived = await animatePath(buildContourPath(target), RUN_SPEED, "running");
    if (!arrived || !target.isConnected || chaosActiveRef.current) return false;

    const targetRect = target.getBoundingClientRect();
    const carried: CarriedButton = {
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
    const escaped = await animatePath(
      [{ x: destination.x, y: current.y }, destination],
      RUN_SPEED,
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
        (button) => isVisible(button, rootRect) && isStealableButton(button),
      ),
    );
    if (!target) return false;

    activityBusyRef.current = true;
    const tabIndex = activeIndexRef.current;
    try {
      setEmotion("excited");
      const arrived = await animatePath(buildContourPath(target), RUN_SPEED, "running");
      if (!arrived || !target.isConnected || tabIndex !== activeIndexRef.current) return false;
      const rect = target.getBoundingClientRect();
      setPosition(
        clampPosition({
          x: rect.left - rootRect.left + rect.width / 2 - MASCOT_SIZE / 2,
          y: rect.top - rootRect.top - MASCOT_SIZE + 16,
        }),
      );
      setPhase("playing");
      await wait(1_150);
      return true;
    } finally {
      activityBusyRef.current = false;
      const finishingPhase = phaseRef.current as MascotPhase;
      if (!chaosActiveRef.current && finishingPhase !== "dragging" && finishingPhase !== "thrown") {
        setEmotion("happy");
        setPhase("idle");
      }
    }
  }, [
    animatePath,
    buildContourPath,
    clampPosition,
    getActiveStage,
    getRoot,
    setPhase,
    setPosition,
  ]);

  const playWithDropdown = useCallback(async () => {
    if (phaseRef.current !== "idle" || activityBusyRef.current) return false;
    const root = getRoot();
    const stage = getActiveStage();
    if (!root || !stage) return false;
    const rootRect = root.getBoundingClientRect();
    const trigger = randomItem(
      Array.from(
        stage.querySelectorAll<HTMLButtonElement>(".inline-dropdown-trigger:not(:disabled)"),
      ).filter((button) => isVisible(button, rootRect)),
    );
    if (!trigger) return false;

    activityBusyRef.current = true;
    const tabIndex = activeIndexRef.current;
    try {
      setEmotion("cool");
      const arrived = await animatePath(buildContourPath(trigger), RUN_SPEED, "running");
      if (!arrived || !trigger.isConnected || tabIndex !== activeIndexRef.current) return false;
      const rect = trigger.getBoundingClientRect();
      setPosition(
        clampPosition({
          x: rect.left - rootRect.left + rect.width / 2 - MASCOT_SIZE / 2,
          y: rect.top - rootRect.top - MASCOT_SIZE + 18,
        }),
      );
      setPhase("playing");

      const clickCount = Math.random() > 0.55 ? 4 : 2;
      for (let clickIndex = 0; clickIndex < clickCount; clickIndex += 1) {
        if (!trigger.isConnected || tabIndex !== activeIndexRef.current) return false;
        trigger.click();
        setEmotion(clickIndex % 2 === 0 ? "excited" : "happy");
        await wait(430);
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
  }, [
    animatePath,
    buildContourPath,
    clampPosition,
    getActiveStage,
    getRoot,
    setPhase,
    setPosition,
  ]);

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
    const tabIndex = activeIndexRef.current;
    try {
      setEmotion("cool");
      const arrived = await animatePath(buildContourPath(scrollable), WALK_SPEED, "walking");
      if (!arrived || !scrollable.isConnected || tabIndex !== activeIndexRef.current) return false;
      const rect = scrollable.getBoundingClientRect();
      setPosition(
        clampPosition({
          x: rect.right - rootRect.left - MASCOT_SIZE + 10,
          y: rect.top - rootRect.top + rect.height / 2 - MASCOT_SIZE / 2,
        }),
      );
      setPhase("scrolling");

      const maxScrollTop = scrollable.scrollHeight - scrollable.clientHeight;
      let direction = scrollable.scrollTop > maxScrollTop * 0.72 ? -1 : 1;
      for (let step = 0; step < 3; step += 1) {
        if (!scrollable.isConnected || tabIndex !== activeIndexRef.current) return false;
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
  }, [
    animatePath,
    buildContourPath,
    clampPosition,
    getActiveStage,
    getRoot,
    setPhase,
    setPosition,
  ]);

  const runAutonomousAction = useCallback(async () => {
    if (
      activityBusyRef.current ||
      dragRef.current ||
      chaosActiveRef.current ||
      carriedButtonRef.current ||
      looseButtonRef.current ||
      phaseRef.current !== "idle"
    )
      return;

    if (Math.random() < 0.52) {
      const actions = shuffled([playWithDropdown, scrollActiveList, jumpOnRandomButton]);
      for (const action of actions) {
        if (await action()) return;
      }
    }
    await roam();
  }, [jumpOnRandomButton, playWithDropdown, roam, scrollActiveList]);

  const moveToElement = useCallback(
    async (element: HTMLElement, token: number) => {
      if (token !== chaosTokenRef.current || !element.isConnected) return false;
      setEmotion(randomItem(["angry", "cool", "excited", "surprised"]) ?? "angry");
      return animatePath(buildContourPath(element, 1), RUN_SPEED, "chaos");
    },
    [animatePath, buildContourPath],
  );

  const ragePressButton = useCallback(
    async (element: HTMLButtonElement, token: number, press: () => void, settleMs = 260) => {
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
      await wait(150);
      if (token !== chaosTokenRef.current) {
        setRagePress(null);
        return false;
      }
      press();
      await wait(settleMs);
      setRagePress(null);
      return token === chaosTokenRef.current;
    },
    [getRoot, moveToElement],
  );

  const startChaos = useCallback(async () => {
    if (chaosActiveRef.current) return;
    const root = getRoot();
    if (!root) return;

    if (carriedButtonRef.current) restoreCarriedButton(false);
    if (looseButtonRef.current) clearLooseButton();
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
    const tabs = getTabs();
    const settingsTab = tabs[tabs.length - 1];
    const warmupTabs = shuffled(tabs.slice(0, -1)).slice(
      0,
      Math.min(3, Math.max(1, tabs.length - 1)),
    );

    for (const tab of warmupTabs) {
      if (!(await ragePressButton(tab, token, () => tab.click()))) return;
    }

    if (settingsTab && token === chaosTokenRef.current) {
      if (!(await ragePressButton(settingsTab, token, () => settingsTab.click(), 420))) return;
    }

    const toggles = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".toggle-switch:not([data-mascot-off-switch])"),
    ).filter((toggle) => !toggle.disabled && getToggleLabel(toggle));
    const selectedToggles = shuffled(toggles).slice(0, Math.min(4, toggles.length));

    for (const toggle of selectedToggles) {
      const label = getToggleLabel(toggle);
      const wasEnabled = toggle.classList.contains("enabled");
      if (
        !(await ragePressButton(
          toggle,
          token,
          () => {
            chaosSnapshotRef.current?.toggles.push({ label, wasEnabled });
            toggle.click();
          },
          300,
        ))
      )
        return;
    }

    if (token !== chaosTokenRef.current) return;
    const finalTabs = getTabs().filter((_, index) => index !== activeIndexRef.current);
    const finalTab = randomItem(finalTabs);
    if (finalTab && !(await ragePressButton(finalTab, token, () => finalTab.click()))) return;
    if (token === chaosTokenRef.current) {
      setRagePress(null);
      setEmotion("cool");
      setPhase("idle");
    }
  }, [cancelMotion, clearLooseButton, getRoot, ragePressButton, restoreCarriedButton, setPhase]);

  const registerHardThrow = useCallback(
    (speed: number) => {
      if (speed < THROW_THRESHOLD || chaosActiveRef.current) return;
      const now = Date.now();
      throwTimesRef.current = [
        ...throwTimesRef.current.filter((time) => now - time < THROW_HISTORY_MS),
        now,
      ];
      setThrowProgress(throwTimesRef.current.length);
      if (throwTimesRef.current.length >= THROWS_TO_CHAOS) {
        // Let the final throw visibly leave the hand before the mascot takes over.
        window.setTimeout(() => void startChaos(), 180);
      }
    },
    [startChaos],
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

    chaosSnapshotRef.current = null;
    chaosActiveRef.current = false;
    setRagePress(null);
    setChaosActive(false);
    setEmotion("shy");
    setPhase("idle");
  }, [cancelMotion, getRoot, setPhase]);

  const petMascot = useCallback(() => {
    if (chaosActiveRef.current || dragRef.current) return;
    cancelMotion();
    clearEmotionTimer();
    setEmotion(Math.random() > 0.35 ? "love" : "happy");
    setPhase("petting");
    emotionTimerRef.current = window.setTimeout(() => {
      emotionTimerRef.current = null;
      if (phaseRef.current === "petting") {
        setEmotion("happy");
        setPhase("idle");
      }
    }, 1_050);
  }, [cancelMotion, clearEmotionTimer, setPhase]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (chaosActiveRef.current) return;
    const root = getRoot();
    if (!root) return;
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
        setPhase(carriedButtonRef.current ? "carrying" : "idle");
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
        setPhase(carriedButtonRef.current ? "carrying" : "idle");
      }
    },
    [launchThrow, setPhase],
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
    const firstRoam = window.setTimeout(() => void runAutonomousAction(), 450);
    const interval = window.setInterval(() => {
      if (
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
  }, [enabled, runAutonomousAction, stealRandomButton]);

  useEffect(() => {
    if (!enabled || chaosActiveRef.current || dragRef.current) return;
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
      chaosActiveRef.current = false;
      cancelMotion();
      clearEmotionTimer();
      activityBusyRef.current = false;
      dragRef.current = null;
      setRagePress(null);
      if (carriedButtonRef.current) restoreCarriedButton(false);
      if (looseButtonRef.current) clearLooseButton();
    }
  }, [cancelMotion, clearEmotionTimer, clearLooseButton, enabled, restoreCarriedButton]);

  useEffect(() => {
    const handleResize = () => setPosition(clampPosition(positionRef.current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition, setPosition]);

  useEffect(
    () => () => {
      chaosTokenRef.current += 1;
      cancelMotion();
      clearEmotionTimer();
      if (looseButtonFrameRef.current !== null)
        window.cancelAnimationFrame(looseButtonFrameRef.current);
      if (looseButtonReturnTimerRef.current !== null)
        window.clearTimeout(looseButtonReturnTimerRef.current);
      const carried = carriedButtonRef.current;
      const loose = looseButtonRef.current;
      if (carried) restoreButtonElement(carried);
      if (loose) restoreButtonElement(loose);
    },
    [cancelMotion, clearEmotionTimer],
  );

  if (!enabled) return null;

  const style = {
    transform: `translate3d(${position.x.toFixed(2)}px, ${position.y.toFixed(2)}px, 0)`,
  } satisfies CSSProperties;

  return (
    <div ref={layerRef} className="launcher-mascot-layer">
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
        title={carriedButton ? "Нажми, чтобы вернуть кнопку" : "Погладь или брось маскота"}
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
      </div>
    </div>
  );
}
