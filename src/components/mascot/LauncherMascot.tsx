import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  MASCOT_FAKE_CONTENT_DELETE_EVENT,
  MASCOT_FAKE_DELETE_EVENT,
  MASCOT_FAKE_RESTORE_EVENT,
} from "./events";
import {
  addMascotRage,
  BOWL_EMPTY_LIFETIME_MS,
  BOWL_HOME_POSITION,
  BOWL_RESPAWN_DELAY_MS,
  BOWL_SIZE,
  CHAOS_SPEED,
  isBowlSpillThrow,
  isHardMascotThrow,
  MAX_CHAOS_DEBRIS,
  MASCOT_SIZE,
  MIN_STEAL_DELAY_MS,
  MISCHIEF_DECAY_MS,
  PUDDLE_LIFETIME_MS,
  RAGE_PER_BOWL_SPILL,
  RAGE_PER_HARD_THROW,
  ROAMING_EMOTIONS,
  ROAM_INTERVAL_MS,
  RUN_SPEED,
  SCROLLABLE_SELECTOR,
  SCROLL_HAND_SIZE,
  STEALABLE_SELECTOR,
  STEAL_DELAY_VARIANCE_MS,
  STEAL_REACH_PX,
  shouldSplashBowl,
  THROWS_TO_CHAOS,
  UNFOCUSED_SLEEP_DELAY_MS,
  WALK_SPEED,
} from "./mascotConfig";
import { SMOKE_FRAMES, TYPED_SNIPPETS } from "./mascotAssets";
import { MascotView } from "./MascotView";
import {
  clamp,
  distance,
  getScrollableAncestor,
  getToggleLabel,
  hasDrawnEdge,
  isRenderedStealTarget,
  isStealableElement,
  isVisible,
  isVisibleInsideScroller,
  mountElementReplica,
  nudgeSlider,
  playSlider,
  randomItem,
  restoreCarriedElement,
  setNativeControlValue,
  shuffled,
  wait,
} from "./mascotDom";
import type {
  CarriedElement,
  BowlDragState,
  BowlDrop,
  BowlSpill,
  BowlStatus,
  ChaosDebris,
  ChaosSnapshot,
  DragState,
  LauncherMascotProps,
  LooseButtonTransform,
  MascotEmotion,
  MascotPhase,
  MascotPosition,
  SleepingDragState,
} from "./mascotTypes";
import "./LauncherMascot.css";

type BowlDropParticle = BowlDrop & {
  vx: number;
  vy: number;
  spin: number;
  age: number;
  delay: number;
  baseScale: number;
  bounces: number;
  landedAt: number | null;
};

const BOWL_DROP_KINDS = [
  "normal",
  "small",
  "normal",
  "small",
  "normal",
  "small",
  "normal",
] as const;

export function LauncherMascot({ activeIndex, enabled, settings }: LauncherMascotProps) {
  const mascotName = settings.name.trim() || "PIXEL";
  const {
    showName,
    rageEnabled,
    bowlEnabled,
    movementEnabled,
    interactionsEnabled,
    carryElementsEnabled,
    scrollListsEnabled,
  } = settings;
  const layerRef = useRef<HTMLDivElement | null>(null);
  const characterRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<MascotPosition>({ x: 118, y: 86 });
  const phaseRef = useRef<MascotPhase>("idle");
  const dragRef = useRef<DragState | null>(null);
  const sleepingDragRef = useRef<SleepingDragState | null>(null);
  const motionFrameRef = useRef<number | null>(null);
  const motionFinishRef = useRef<((completed: boolean) => void) | null>(null);
  const emotionTimerRef = useRef<number | null>(null);
  const mischiefDecayTimerRef = useRef<number | null>(null);
  const ragePointsRef = useRef(0);
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
  const eatReplicaRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const smokeTokenRef = useRef(0);
  const bowlPositionRef = useRef<MascotPosition>({ ...BOWL_HOME_POSITION });
  const bowlStatusRef = useRef<BowlStatus>(bowlEnabled ? "full" : "hidden");
  const bowlDragRef = useRef<BowlDragState | null>(null);
  const bowlFrameRef = useRef<number | null>(null);
  const bowlDropFrameRef = useRef<number | null>(null);
  const bowlEmptyTimerRef = useRef<number | null>(null);
  const bowlRespawnTimerRef = useRef<number | null>(null);
  const puddleRemoveTimerRef = useRef<number | null>(null);
  const bowlRageTimerRef = useRef<number | null>(null);
  const bowlMoodTimerRef = useRef<number | null>(null);
  const bowlReactionTokenRef = useRef(0);
  const nextDrinkAtRef = useRef(Date.now() + 5_500);

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
  const [scrollHand, setScrollHand] = useState<MascotPosition | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [modalForeground, setModalForeground] = useState(false);
  const [throwProgress, setThrowProgress] = useState(0);
  const [smoke, setSmoke] = useState<{ x: number; y: number; frame: number } | null>(null);
  const [mouthFrame, setMouthFrame] = useState<number | null>(null);
  const [speech, setSpeech] = useState<string | null>(null);
  const [bowlPosition, setBowlPositionState] = useState<MascotPosition>(bowlPositionRef.current);
  const [bowlStatus, setBowlStatusState] = useState<BowlStatus>(bowlStatusRef.current);
  const [bowlDragging, setBowlDragging] = useState(false);
  const [bowlRotation, setBowlRotation] = useState(0);
  const [bowlSpill, setBowlSpill] = useState<BowlSpill | null>(null);

  activeIndexRef.current = activeIndex;

  const setPosition = useCallback((next: MascotPosition) => {
    positionRef.current = next;
    setPositionState(next);
  }, []);

  const setPhase = useCallback((next: MascotPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const setBowlPosition = useCallback((next: MascotPosition) => {
    bowlPositionRef.current = next;
    setBowlPositionState(next);
  }, []);

  const setBowlStatus = useCallback((next: BowlStatus) => {
    bowlStatusRef.current = next;
    setBowlStatusState(next);
  }, []);

  // Puff of landing dust at (x, y) that cycles through the four smoke frames.
  const spawnSmoke = useCallback((x: number, y: number) => {
    const token = smokeTokenRef.current + 1;
    smokeTokenRef.current = token;
    setSmoke({ x, y, frame: 0 });
    const advance = (frame: number) => {
      if (smokeTokenRef.current !== token) return;
      if (frame >= SMOKE_FRAMES.length) {
        setSmoke(null);
        return;
      }
      setSmoke({ x, y, frame });
      window.setTimeout(() => advance(frame + 1), 70);
    };
    window.setTimeout(() => advance(1), 70);
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

  const clampBowlPosition = useCallback(
    (next: MascotPosition) => {
      const root = getRoot();
      if (!root) return next;
      return {
        x: clamp(next.x, 4, Math.max(4, root.clientWidth - BOWL_SIZE - 4)),
        y: clamp(next.y, 4, Math.max(4, root.clientHeight - BOWL_SIZE - 4)),
      };
    },
    [getRoot],
  );

  const clearBowlTimers = useCallback(() => {
    const timerRefs = [
      bowlEmptyTimerRef,
      bowlRespawnTimerRef,
      puddleRemoveTimerRef,
      bowlRageTimerRef,
      bowlMoodTimerRef,
    ];
    timerRefs.forEach((timerRef) => {
      if (timerRef.current === null) return;
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    });
  }, []);

  const resetBowl = useCallback(
    (visible: boolean) => {
      bowlReactionTokenRef.current += 1;
      bowlDragRef.current = null;
      setBowlDragging(false);
      if (bowlFrameRef.current !== null) {
        window.cancelAnimationFrame(bowlFrameRef.current);
        bowlFrameRef.current = null;
      }
      if (bowlDropFrameRef.current !== null) {
        window.cancelAnimationFrame(bowlDropFrameRef.current);
        bowlDropFrameRef.current = null;
      }
      clearBowlTimers();
      setBowlSpill(null);
      setBowlRotation(0);
      setBowlPosition(clampBowlPosition({ ...BOWL_HOME_POSITION }));
      setBowlStatus(visible ? "full" : "hidden");
      nextDrinkAtRef.current = Date.now() + 5_500;
    },
    [clampBowlPosition, clearBowlTimers, setBowlPosition, setBowlStatus],
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

  const getScrollHandPosition = useCallback(
    (scrollable: HTMLElement) => {
      const root = getRoot();
      if (!root || !scrollable.isConnected) return null;
      const rootRect = root.getBoundingClientRect();
      const scrollRect = scrollable.getBoundingClientRect();
      const maxScrollTop = Math.max(0, scrollable.scrollHeight - scrollable.clientHeight);
      const ratio = scrollable.clientHeight / Math.max(1, scrollable.scrollHeight);
      const customRoot = scrollable.closest<HTMLElement>(".csa-root");
      const customTrack = customRoot?.querySelector<HTMLElement>(".csa-track") ?? null;
      const customThumb =
        customRoot?.querySelector<HTMLElement>("[data-mascot-scroll-thumb], .csa-thumb") ?? null;

      let thumbCenterX: number;
      let thumbCenterY: number;
      if (customTrack && customThumb) {
        const trackRect = customTrack.getBoundingClientRect();
        const trackInset = 6;
        const trackHeight = Math.max(0, trackRect.height - trackInset * 2);
        const thumbHeight = Math.max(28, ratio * trackHeight);
        const maxThumbTravel = Math.max(0, trackHeight - thumbHeight);
        const thumbTop =
          trackRect.top +
          trackInset +
          (maxScrollTop > 0 ? (scrollable.scrollTop / maxScrollTop) * maxThumbTravel : 0);
        const thumbRect = customThumb.getBoundingClientRect();
        thumbCenterX = thumbRect.left + thumbRect.width / 2;
        thumbCenterY = thumbTop + thumbHeight / 2;
      } else {
        const thumbHeight = Math.max(28, ratio * scrollRect.height);
        const maxThumbTravel = Math.max(0, scrollRect.height - thumbHeight);
        const thumbTop =
          scrollRect.top +
          (maxScrollTop > 0 ? (scrollable.scrollTop / maxScrollTop) * maxThumbTravel : 0);
        thumbCenterX = scrollRect.right - 2;
        thumbCenterY = thumbTop + thumbHeight / 2;
      }

      return {
        x: thumbCenterX - rootRect.left - SCROLL_HAND_SIZE / 2,
        y: thumbCenterY - rootRect.top - SCROLL_HAND_SIZE / 2,
      };
    },
    [getRoot],
  );

  const animateListScroll = useCallback(
    (scrollable: HTMLElement, requestedTop: number, isAlive: () => boolean, duration = 620) => {
      const maxScrollTop = Math.max(0, scrollable.scrollHeight - scrollable.clientHeight);
      const startTop = scrollable.scrollTop;
      const targetTop = clamp(requestedTop, 0, maxScrollTop);
      if (Math.abs(targetTop - startTop) < 1) return Promise.resolve(true);

      setPhase("scrolling");
      const firstHandPosition = getScrollHandPosition(scrollable);
      if (firstHandPosition) setScrollHand(firstHandPosition);

      return new Promise<boolean>((resolve) => {
        const startTime = performance.now();
        const step = (now: number) => {
          if (!isAlive() || !scrollable.isConnected) {
            resolve(false);
            return;
          }

          const progress = clamp((now - startTime) / duration, 0, 1);
          const eased =
            progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          scrollable.scrollTop = startTop + (targetTop - startTop) * eased;
          const handPosition = getScrollHandPosition(scrollable);
          if (handPosition) setScrollHand(handPosition);

          if (progress >= 1) {
            scrollable.scrollTop = targetTop;
            resolve(true);
            return;
          }
          window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
      });
    },
    [getScrollHandPosition, setPhase],
  );

  const clearMischiefDecayTimer = useCallback(() => {
    if (mischiefDecayTimerRef.current !== null) {
      window.clearTimeout(mischiefDecayTimerRef.current);
      mischiefDecayTimerRef.current = null;
    }
  }, []);

  const scheduleMischiefDecay = useCallback(() => {
    clearMischiefDecayTimer();
    if (ragePointsRef.current === 0) return;
    mischiefDecayTimerRef.current = window.setTimeout(() => {
      mischiefDecayTimerRef.current = null;
      ragePointsRef.current = 0;
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

  const buildScrollbarApproachPath = useCallback(
    (scrollable: HTMLElement) => {
      const root = getRoot();
      if (!root || !scrollable.isConnected) return [];
      const rootRect = root.getBoundingClientRect();
      const scrollRect = scrollable.getBoundingClientRect();
      const handPosition = getScrollHandPosition(scrollable);
      const destination = clampPosition({
        x: scrollRect.right - rootRect.left - MASCOT_SIZE + 8,
        y: handPosition
          ? handPosition.y - (MASCOT_SIZE - SCROLL_HAND_SIZE) / 2
          : scrollRect.top - rootRect.top + scrollRect.height / 2 - MASCOT_SIZE / 2,
      });
      const current = positionRef.current;
      return [{ x: destination.x, y: current.y }, destination];
    },
    [clampPosition, getRoot, getScrollHandPosition],
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

  const scrollTargetIntoView = useCallback(
    async (target: HTMLElement, isAlive: () => boolean) => {
      const scrollable = getScrollableAncestor(target);
      if (!scrollable) return true;
      if (!scrollListsEnabled) return isVisibleInsideScroller(target, scrollable);

      const scrollRect = scrollable.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop =
        scrollable.scrollTop +
        targetRect.top -
        scrollRect.top -
        (scrollable.clientHeight - targetRect.height) / 2;

      if (Math.abs(targetTop - scrollable.scrollTop) < 1) {
        return isVisibleInsideScroller(target, scrollable);
      }

      setEmotion("cool");
      const approached = await animatePath(
        buildScrollbarApproachPath(scrollable),
        WALK_SPEED,
        "walking",
      );
      if (!approached || !isAlive()) return false;

      try {
        const scrolled = await animateListScroll(scrollable, targetTop, isAlive, 760);
        if (!scrolled || !isAlive()) return false;
        await wait(100);
        return isAlive() && isVisibleInsideScroller(target, scrollable);
      } finally {
        setScrollHand(null);
      }
    },
    [animateListScroll, animatePath, buildScrollbarApproachPath, scrollListsEnabled],
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

  useEffect(() => {
    const holder = eatReplicaRef.current;
    if (!holder || !carriedButton || phase !== "eating") return;
    return mountElementReplica(holder, carriedButton);
  }, [carriedButton, phase]);

  const stealRandomButton = useCallback(async () => {
    if (
      !movementEnabled ||
      !carryElementsEnabled ||
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
    ).filter((element) => {
      if (!isStealableElement(element) || !isRenderedStealTarget(element)) return false;
      if (isVisible(element, rootRect)) return true;
      if (!scrollListsEnabled) return false;
      const scrollable = getScrollableAncestor(element);
      return !!scrollable && isVisible(scrollable, rootRect);
    });
    const target = randomItem(candidates);
    if (!target) {
      resetStealClock();
      return false;
    }

    setEmotion("cool");
    const tabIndex = activeIndexRef.current;
    const activityToken = activityTokenRef.current;
    const targetIsAlive = () =>
      target.isConnected &&
      !chaosActiveRef.current &&
      !dragRef.current &&
      tabIndex === activeIndexRef.current &&
      activityToken === activityTokenRef.current;
    const readyToSteal = await scrollTargetIntoView(target, targetIsAlive);
    if (!readyToSteal) {
      const interruptedPhase = phaseRef.current as MascotPhase;
      if (
        !chaosActiveRef.current &&
        interruptedPhase !== "dragging" &&
        interruptedPhase !== "thrown"
      ) {
        setPhase("idle");
      }
      resetStealClock();
      return false;
    }

    const arrived = await animatePath(buildContourPath(target), RUN_SPEED, "running");
    if (!arrived || !targetIsAlive() || !isNearElement(target)) {
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
    carryElementsEnabled,
    movementEnabled,
    resetStealClock,
    scrollListsEnabled,
    scrollTargetIntoView,
    setPhase,
  ]);

  const roam = useCallback(async () => {
    if (
      !movementEnabled ||
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
  }, [animatePath, buildContourPath, collectContours, movementEnabled, setPhase]);

  const drinkFromBowl = useCallback(async () => {
    if (
      !bowlEnabled ||
      !movementEnabled ||
      bowlStatusRef.current !== "full" ||
      bowlDragRef.current ||
      phaseRef.current !== "idle" ||
      activityBusyRef.current ||
      chaosActiveRef.current ||
      modalOpenRef.current
    )
      return false;

    activityBusyRef.current = true;
    const activityToken = activityTokenRef.current;
    const targetBowl = bowlPositionRef.current;
    const approachFromLeft = positionRef.current.x < targetBowl.x;
    const destination = clampPosition({
      x: targetBowl.x + (approachFromLeft ? -34 : 34),
      y: targetBowl.y - 31,
    });
    const alive = () =>
      activityToken === activityTokenRef.current &&
      bowlStatusRef.current === "full" &&
      !bowlDragRef.current &&
      !chaosActiveRef.current;

    try {
      setEmotion("happy");
      const arrived = await animatePath(
        [{ x: destination.x, y: positionRef.current.y }, destination],
        WALK_SPEED,
        "walking",
      );
      if (!arrived || !alive()) return false;
      setPhase("drinking");
      setEmotion("neutral");
      await wait(1_900);
      if (!alive()) return false;
      setEmotion("happy");
      await wait(260);
      return alive();
    } finally {
      activityBusyRef.current = false;
      nextDrinkAtRef.current = Date.now() + 9_000 + Math.random() * 7_000;
      if ((phaseRef.current as MascotPhase) === "drinking") setPhase("idle");
    }
  }, [animatePath, bowlEnabled, clampPosition, movementEnabled, setPhase]);

  const jumpOnRandomButton = useCallback(async () => {
    if (
      !movementEnabled ||
      !interactionsEnabled ||
      phaseRef.current !== "idle" ||
      activityBusyRef.current
    )
      return false;
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
      if (
        !chaosActiveRef.current &&
        finishingPhase !== "dragging" &&
        finishingPhase !== "thrown" &&
        finishingPhase !== "sleeping"
      ) {
        setEmotion("happy");
        setPhase("idle");
      }
    }
  }, [
    animatePath,
    buildContourPath,
    getActiveStage,
    getRoot,
    interactionsEnabled,
    isNearElement,
    movementEnabled,
    setPhase,
  ]);

  const scrollActiveList = useCallback(async () => {
    if (
      !movementEnabled ||
      !scrollListsEnabled ||
      phaseRef.current !== "idle" ||
      activityBusyRef.current
    )
      return false;
    const root = getRoot();
    const stage = getActiveStage();
    if (!root || !stage) return false;
    const rootRect = root.getBoundingClientRect();
    const scrollable = randomItem(
      Array.from(stage.querySelectorAll<HTMLElement>(SCROLLABLE_SELECTOR)).filter(
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
      const arrived = await animatePath(
        buildScrollbarApproachPath(scrollable),
        WALK_SPEED,
        "walking",
      );
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
      const isAlive = () =>
        scrollable.isConnected &&
        tabIndex === activeIndexRef.current &&
        activityToken === activityTokenRef.current &&
        isNearElement(scrollable);
      for (let step = 0; step < 3; step += 1) {
        if (!isAlive()) return false;
        const nextTop = clamp(
          scrollable.scrollTop + direction * Math.max(80, scrollable.clientHeight * 0.42),
          0,
          maxScrollTop,
        );
        if (!(await animateListScroll(scrollable, nextTop, isAlive, 520))) return false;
        await wait(90);
        if (nextTop <= 0 || nextTop >= maxScrollTop) direction *= -1;
      }
      return true;
    } finally {
      setScrollHand(null);
      activityBusyRef.current = false;
      const finishingPhase = phaseRef.current as MascotPhase;
      if (
        !chaosActiveRef.current &&
        finishingPhase !== "dragging" &&
        finishingPhase !== "thrown" &&
        finishingPhase !== "sleeping"
      ) {
        setEmotion("happy");
        setPhase("idle");
      }
    }
  }, [
    animateListScroll,
    animatePath,
    buildScrollbarApproachPath,
    getActiveStage,
    getRoot,
    isNearElement,
    movementEnabled,
    scrollListsEnabled,
    setPhase,
  ]);

  const teaseSlider = useCallback(async () => {
    if (
      !movementEnabled ||
      !interactionsEnabled ||
      phaseRef.current !== "idle" ||
      activityBusyRef.current
    )
      return false;
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
      if (
        !chaosActiveRef.current &&
        finishingPhase !== "dragging" &&
        finishingPhase !== "thrown" &&
        finishingPhase !== "sleeping"
      ) {
        setEmotion("happy");
        setPhase("idle");
      }
    }
  }, [
    animatePath,
    buildContourPath,
    getActiveStage,
    getRoot,
    interactionsEnabled,
    isNearElement,
    movementEnabled,
    setPhase,
  ]);

  // Takes the stolen element in its paws and stuffs it in its mouth: the mouth
  // sprite opens (frames 0→3) with the button composited half-in, then closes
  // (3→0) as it "swallows" — after which the element pops back to its place.
  const eatCarriedButton = useCallback(async () => {
    const carried = carriedButtonRef.current;
    if (!carried || chaosActiveRef.current || dragRef.current || modalOpenRef.current) return false;
    cancelMotion();
    clearEmotionTimer();
    const ok = () => carriedButtonRef.current === carried && phaseRef.current === "eating";
    setEmotion("excited");
    setPhase("eating");
    for (let f = 0; f <= 3; f += 1) {
      setMouthFrame(f);
      await wait(95);
      if (!ok()) {
        setMouthFrame(null);
        return false;
      }
    }
    await wait(240);
    for (let f = 3; f >= 0; f -= 1) {
      if (!ok()) {
        setMouthFrame(null);
        return false;
      }
      setMouthFrame(f);
      await wait(80);
    }
    setEmotion("happy");
    await wait(260);
    setMouthFrame(null);
    if (carriedButtonRef.current === carried) restoreCarriedButton(true);
    setPhase("idle");
    return true;
  }, [cancelMotion, clearEmotionTimer, restoreCarriedButton, setPhase]);

  // Little signs of life while idling: a big yawn (reusing the mouth sprites),
  // a stretch, or a scratch.
  const microLife = useCallback(async () => {
    if (phaseRef.current !== "idle" || activityBusyRef.current) return false;
    const kind = randomItem(["yawn", "stretch", "scratch"] as const) ?? "stretch";
    activityBusyRef.current = true;
    const activityToken = activityTokenRef.current;
    const alive = () => activityToken === activityTokenRef.current && !dragRef.current;
    try {
      if (kind === "yawn") {
        setEmotion("sleepy");
        setPhase("yawn");
        for (let f = 0; f <= 3; f += 1) {
          if (!alive()) return false;
          setMouthFrame(f);
          await wait(120);
        }
        await wait(260);
        for (let f = 3; f >= 0; f -= 1) {
          if (!alive()) return false;
          setMouthFrame(f);
          await wait(95);
        }
        setMouthFrame(null);
      } else {
        setEmotion(kind === "stretch" ? "cool" : "happy");
        setPhase(kind);
        await wait(950);
      }
      return alive();
    } finally {
      activityBusyRef.current = false;
      setMouthFrame(null);
      const finishingPhase = phaseRef.current as MascotPhase;
      if (
        !chaosActiveRef.current &&
        finishingPhase !== "dragging" &&
        finishingPhase !== "thrown" &&
        finishingPhase !== "sleeping"
      ) {
        setEmotion("neutral");
        setPhase("idle");
      }
    }
  }, [setPhase]);

  // Waddles up to a field, a little keyboard appears, and it "types" gibberish
  // into a speech bubble (same style as the hover hint), then wipes it.
  const typeNonsense = useCallback(async () => {
    if (
      !movementEnabled ||
      !interactionsEnabled ||
      phaseRef.current !== "idle" ||
      activityBusyRef.current
    )
      return false;
    const root = getRoot();
    const stage = getActiveStage();
    if (!root || !stage) return false;
    activityBusyRef.current = true;
    const activityToken = activityTokenRef.current;
    const tabIndex = activeIndexRef.current;
    const alive = () =>
      tabIndex === activeIndexRef.current &&
      activityToken === activityTokenRef.current &&
      !chaosActiveRef.current &&
      !dragRef.current;
    try {
      const rootRect = root.getBoundingClientRect();
      const field = randomItem(
        Array.from(
          stage.querySelectorAll<HTMLElement>("input, textarea, .cni-input, .jae-textarea"),
        ).filter((element) => isVisible(element, rootRect)),
      );
      setEmotion("cool");
      if (field) {
        const arrived = await animatePath(
          buildContourPath(field).slice(0, 3),
          RUN_SPEED,
          "running",
        );
        if (!arrived || !alive()) return false;
      }
      setPhase("typing");
      const stillTyping = () => (phaseRef.current as MascotPhase) === "typing";
      const text = randomItem(TYPED_SNIPPETS) ?? "...";
      setSpeech("");
      for (let i = 1; i <= text.length; i += 1) {
        if (!alive() || !stillTyping()) return false;
        setSpeech(text.slice(0, i));
        await wait(65 + Math.random() * 70);
      }
      await wait(750);
      for (let i = text.length - 1; i >= 0; i -= 1) {
        if (!alive() || !stillTyping()) break;
        setSpeech(text.slice(0, i));
        await wait(35);
      }
      return true;
    } finally {
      activityBusyRef.current = false;
      setSpeech(null);
      const finishingPhase = phaseRef.current as MascotPhase;
      if (
        !chaosActiveRef.current &&
        finishingPhase !== "dragging" &&
        finishingPhase !== "thrown" &&
        finishingPhase !== "sleeping"
      ) {
        setEmotion("happy");
        setPhase("idle");
      }
    }
  }, [
    animatePath,
    buildContourPath,
    getActiveStage,
    getRoot,
    interactionsEnabled,
    movementEnabled,
    setPhase,
  ]);

  const runAutonomousAction = useCallback(async () => {
    if (
      !movementEnabled ||
      activityBusyRef.current ||
      dragRef.current ||
      chaosActiveRef.current ||
      modalOpenRef.current ||
      carriedButtonRef.current ||
      looseButtonRef.current ||
      phaseRef.current !== "idle"
    )
      return;

    if (
      bowlEnabled &&
      bowlStatusRef.current === "full" &&
      Date.now() >= nextDrinkAtRef.current &&
      (await drinkFromBowl())
    )
      return;

    // Calm mode: the mascot only shows off — hops on buttons, scrolls, teases
    // sliders, does little idle bits and types nonsense. It never clicks/toggles
    // controls; that mischief is rage-only.
    if (Math.random() < 0.68) {
      const actions = [microLife];
      if (interactionsEnabled) actions.push(jumpOnRandomButton, teaseSlider, typeNonsense);
      if (scrollListsEnabled) actions.push(scrollActiveList);
      for (const action of shuffled(actions)) {
        if (await action()) return;
      }
    }
    await roam();
  }, [
    bowlEnabled,
    drinkFromBowl,
    interactionsEnabled,
    jumpOnRandomButton,
    microLife,
    movementEnabled,
    roam,
    scrollActiveList,
    scrollListsEnabled,
    teaseSlider,
    typeNonsense,
  ]);

  // Leap onto an open modal and keep busy on it. In calm mode the mascot only
  // shows off — teases sliders and poses on the controls — but never clicks or
  // toggles them; flipping switches, stealing and the rest stay rage-only.
  const attendModal = useCallback(
    async (fresh = false) => {
      const root = getRoot();
      const modal = activeModalRef.current;
      if (!movementEnabled || !interactionsEnabled || !root || !modal || modalBusyRef.current)
        return;
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
      interactionsEnabled,
      isNearElement,
      leapTo,
      movementEnabled,
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
    if (!rageEnabled || chaosActiveRef.current) return;
    const root = getRoot();
    if (!root) return;

    if (carriedButtonRef.current) restoreCarriedButton(false);
    if (looseButtonRef.current) clearLooseButton();
    clearChaosDebris();
    clearMischiefDecayTimer();
    setMouthFrame(null);
    setSpeech(null);
    activityTokenRef.current += 1;
    activityBusyRef.current = false;
    cancelMotion();
    const token = chaosTokenRef.current + 1;
    chaosTokenRef.current = token;
    chaosActiveRef.current = true;
    setUndoAvailable(false);
    setThrowProgress(0);
    ragePointsRef.current = 0;
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
        setUndoAvailable(true);
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
    rageEnabled,
    restoreCarriedButton,
    setPhase,
  ]);

  const registerRage = useCallback(
    (amount: number) => {
      if (!rageEnabled || chaosActiveRef.current) return false;
      clearMischiefDecayTimer();
      const nextRage = addMascotRage(ragePointsRef.current, amount);
      ragePointsRef.current = nextRage;
      setThrowProgress(nextRage);
      if (nextRage >= THROWS_TO_CHAOS) {
        return true;
      } else {
        scheduleMischiefDecay();
        return false;
      }
    },
    [clearMischiefDecayTimer, rageEnabled, scheduleMischiefDecay],
  );

  const registerHardThrow = useCallback(
    (speed: number) => {
      if (!isHardMascotThrow(speed)) return false;
      return registerRage(RAGE_PER_HARD_THROW);
    },
    [registerRage],
  );

  const animateEmptyBowl = useCallback(
    (velocity: MascotPosition) => {
      const root = getRoot();
      if (!root) return;
      if (bowlFrameRef.current !== null) window.cancelAnimationFrame(bowlFrameRef.current);

      const maxX = Math.max(4, root.clientWidth - BOWL_SIZE - 4);
      const maxY = Math.max(4, root.clientHeight - BOWL_SIZE - 4);
      let current = bowlPositionRef.current;
      let rotation = 0;
      let vx = clamp(velocity.x * 0.46, -2.7, 2.7);
      let vy = clamp(velocity.y * 0.22 - 0.8, -2.5, 1.8);
      let spin = clamp(vx * 0.55 + (Math.random() - 0.5) * 0.8, -1.45, 1.45);
      if (Math.abs(spin) < 0.28) spin = spin < 0 ? -0.28 : 0.28;
      let previousTime = performance.now();
      let settledFrames = 0;

      const step = (now: number) => {
        if (bowlStatusRef.current !== "empty") {
          bowlFrameRef.current = null;
          return;
        }
        const dt = Math.min(28, now - previousTime);
        previousTime = now;
        const next = {
          x: current.x + vx * dt,
          y: current.y + vy * dt,
        };
        rotation += spin * dt;
        vy += 0.0024 * dt;
        vx *= Math.pow(0.99, dt / 16.67);
        spin *= Math.pow(0.993, dt / 16.67);

        if (next.x <= 4 || next.x >= maxX) {
          next.x = clamp(next.x, 4, maxX);
          vx *= -0.66;
          spin *= -0.8;
        }
        if (next.y <= 4 || next.y >= maxY) {
          next.y = clamp(next.y, 4, maxY);
          vy *= -0.5;
          spin *= 0.78;
        }
        if (next.y >= maxY - 0.5 && Math.abs(vy) < 0.16) {
          vy = 0;
          vx *= 0.8;
          spin *= 0.78;
          settledFrames += 1;
        } else {
          settledFrames = 0;
        }

        current = next;
        setBowlPosition(next);
        setBowlRotation(rotation);
        if (settledFrames > 10 && Math.abs(vx) < 0.05 && Math.abs(spin) < 0.05) {
          bowlFrameRef.current = null;
          return;
        }
        bowlFrameRef.current = window.requestAnimationFrame(step);
      };

      bowlFrameRef.current = window.requestAnimationFrame(step);
    },
    [getRoot, setBowlPosition],
  );

  const spawnBowlDrops = useCallback(
    (
      spillPosition: MascotPosition,
      velocity: MascotPosition,
      kinds: readonly BowlDrop["kind"][],
      createsPuddle: boolean,
    ) => {
      const spillId = Date.now();
      const root = getRoot();
      if (!root) return;
      const spillTop = spillPosition.y + 6;
      const floorY = Math.max(24, root.clientHeight - spillTop - 28);
      const minDropX = 4 - spillPosition.x;
      const maxDropX = Math.max(minDropX, root.clientWidth - spillPosition.x - 68);
      const minDropY = 4 - spillTop;
      const horizontalDirection = Math.abs(velocity.x) > 0.08 ? Math.sign(velocity.x) : 1;

      if (bowlDropFrameRef.current !== null) {
        window.cancelAnimationFrame(bowlDropFrameRef.current);
        bowlDropFrameRef.current = null;
      }
      const particles: BowlDropParticle[] = kinds.map((kind, index) => {
        const spread = (index - (kinds.length - 1) / 2) / Math.max(1, (kinds.length - 1) / 2);
        const baseScale = kind === "normal" ? 0.98 : 0.78;
        const vx = clamp(
          velocity.x * 0.78 + spread * 0.36 + horizontalDirection * (0.08 + Math.random() * 0.18),
          -3.4,
          3.4,
        );
        return {
          id: index,
          kind,
          x: spread * 2,
          y: 0,
          vx,
          vy: clamp(
            velocity.y * 0.58 - 0.25 - Math.random() * 0.55 + Math.abs(spread) * 0.08,
            -3,
            1.8,
          ),
          spin: clamp(spread * 0.18 + vx * 0.16 + (Math.random() - 0.5) * 0.12, -0.62, 0.62),
          age: 0,
          delay: index * 11 + Math.random() * 28,
          rotation: spread * 9,
          baseScale,
          scale: baseScale,
          opacity: 0,
          bounces: 0,
          landedAt: null,
        };
      });
      let previousDropTime = performance.now();
      let puddleVisible = false;
      let puddleX = 0;
      const landingXs: number[] = [];

      setBowlSpill({
        id: spillId,
        x: spillPosition.x,
        y: spillTop,
        puddleVisible: false,
        puddleX: 0,
        floorY,
        drops: particles.map(({ id, kind, x, y, rotation, scale, opacity }) => ({
          id,
          kind,
          x,
          y,
          rotation,
          scale,
          opacity,
        })),
      });

      const animateDrops = (now: number) => {
        const dt = Math.min(28, now - previousDropTime);
        previousDropTime = now;
        let hasVisibleDrop = false;

        particles.forEach((particle) => {
          particle.age += dt;
          if (particle.age < particle.delay) {
            hasVisibleDrop = true;
            return;
          }

          if (particle.landedAt !== null) {
            const fadeProgress = clamp((now - particle.landedAt) / 190, 0, 1);
            particle.opacity = 1 - fadeProgress;
            particle.scale = particle.baseScale * (1 - fadeProgress * 0.28);
            hasVisibleDrop ||= fadeProgress < 1;
            return;
          }

          particle.opacity = 1;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.rotation += particle.spin * dt;
          particle.vy += 0.00255 * dt;
          particle.vx *= Math.pow(0.995, dt / 16.67);
          particle.spin *= Math.pow(0.997, dt / 16.67);

          if (particle.x <= minDropX || particle.x >= maxDropX) {
            particle.x = clamp(particle.x, minDropX, maxDropX);
            particle.vx *= -0.48;
            particle.spin *= -0.74;
          }
          if (particle.y <= minDropY) {
            particle.y = minDropY;
            particle.vy = Math.abs(particle.vy) * 0.42;
          }
          if (particle.y >= floorY) {
            particle.y = floorY;
            if (particle.bounces === 0) {
              landingXs.push(particle.x);
              puddleX = landingXs.reduce((sum, x) => sum + x, 0) / landingXs.length;
              puddleVisible = createsPuddle;
            }
            if (particle.bounces === 0 && Math.abs(particle.vy) > 0.5) {
              particle.vy *= -0.2;
              particle.vx *= 0.64;
              particle.spin *= 0.62;
              particle.scale = particle.baseScale * 0.88;
              particle.bounces += 1;
            } else {
              particle.landedAt = now;
              particle.vy = 0;
            }
          }
          if (particle.age > 3_400 && particle.landedAt === null) {
            particle.landedAt = now;
          }
          hasVisibleDrop = true;
        });

        setBowlSpill((current) =>
          current?.id === spillId
            ? {
                ...current,
                puddleVisible,
                puddleX,
                drops: particles.map(({ id, kind, x, y, rotation, scale, opacity }) => ({
                  id,
                  kind,
                  x,
                  y,
                  rotation,
                  scale,
                  opacity,
                })),
              }
            : current,
        );

        if (hasVisibleDrop) {
          bowlDropFrameRef.current = window.requestAnimationFrame(animateDrops);
        } else {
          bowlDropFrameRef.current = null;
          if (!createsPuddle) {
            setBowlSpill((current) => (current?.id === spillId ? null : current));
          }
        }
      };
      bowlDropFrameRef.current = window.requestAnimationFrame(animateDrops);

      if (createsPuddle) {
        puddleRemoveTimerRef.current = window.setTimeout(() => {
          puddleRemoveTimerRef.current = null;
          setBowlSpill((current) => (current?.id === spillId ? null : current));
        }, PUDDLE_LIFETIME_MS);
      }
    },
    [getRoot],
  );

  const splashBowl = useCallback(
    (velocity: MascotPosition) => {
      if (bowlStatusRef.current !== "full" || chaosActiveRef.current) return;
      spawnBowlDrops(
        bowlPositionRef.current,
        {
          x: velocity.x * 0.82,
          y: Math.min(-0.35, velocity.y * 0.45 - 0.45),
        },
        ["small", "normal", "small"],
        false,
      );
    },
    [spawnBowlDrops],
  );

  const spillBowl = useCallback(
    (velocity: MascotPosition) => {
      if (bowlStatusRef.current !== "full") return;
      const reactionToken = bowlReactionTokenRef.current + 1;
      bowlReactionTokenRef.current = reactionToken;
      const spillPosition = bowlPositionRef.current;

      bowlDragRef.current = null;
      setBowlDragging(false);
      setBowlStatus("empty");
      spawnBowlDrops(spillPosition, velocity, BOWL_DROP_KINDS, true);
      animateEmptyBowl(velocity);

      activityTokenRef.current += 1;
      activityBusyRef.current = false;
      cancelMotion();
      if (!chaosActiveRef.current && phaseRef.current !== "sleeping") {
        setEmotion("sad");
        setPhase("sulking");
      }

      bowlRageTimerRef.current = window.setTimeout(() => {
        bowlRageTimerRef.current = null;
        if (bowlReactionTokenRef.current !== reactionToken || chaosActiveRef.current) return;
        if (!rageEnabled) return;
        if (registerRage(RAGE_PER_BOWL_SPILL)) void startChaos();
      }, 720);

      bowlMoodTimerRef.current = window.setTimeout(() => {
        bowlMoodTimerRef.current = null;
        if (
          bowlReactionTokenRef.current === reactionToken &&
          !chaosActiveRef.current &&
          !dragRef.current &&
          phaseRef.current === "sulking"
        ) {
          setEmotion("neutral");
          setPhase("idle");
        }
      }, 2_450);

      bowlEmptyTimerRef.current = window.setTimeout(() => {
        bowlEmptyTimerRef.current = null;
        if (bowlStatusRef.current !== "empty") return;
        if (bowlFrameRef.current !== null) {
          window.cancelAnimationFrame(bowlFrameRef.current);
          bowlFrameRef.current = null;
        }
        setBowlStatus("hidden");
        bowlRespawnTimerRef.current = window.setTimeout(() => {
          bowlRespawnTimerRef.current = null;
          if (!enabled || !bowlEnabled) return;
          setBowlRotation(0);
          setBowlPosition(clampBowlPosition({ ...BOWL_HOME_POSITION }));
          setBowlStatus("full");
          nextDrinkAtRef.current = Date.now() + 3_800;
        }, BOWL_RESPAWN_DELAY_MS);
      }, BOWL_EMPTY_LIFETIME_MS);
    },
    [
      animateEmptyBowl,
      bowlEnabled,
      cancelMotion,
      clampBowlPosition,
      enabled,
      rageEnabled,
      registerRage,
      setBowlPosition,
      setBowlStatus,
      setPhase,
      spawnBowlDrops,
      startChaos,
    ],
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

  // The rage-triggering throw: hurl the mascot at the nearest wall, let it splat
  // and stick for a beat, slide down the wall, puff dust on landing — then chaos.
  const rageThrow = useCallback(
    (velocity: MascotPosition) => {
      cancelMotion();
      const bounds = getBounds();
      if (!bounds) {
        void startChaos();
        return;
      }
      setEmotion("surprised");
      setPhase("thrown");
      const towardRight = positionRef.current.x < (bounds.minX + bounds.maxX) / 2;
      const speed = Math.max(1.7, Math.abs(velocity.x));
      let vx = towardRight ? speed : -speed;
      let vy = clamp(velocity.y, -2.6, 1.0);
      let previousTime = performance.now();
      let mode: "fly" | "stick" | "slide" = "fly";
      let stickUntil = 0;

      const step = (now: number) => {
        const dt = Math.min(28, now - previousTime);
        previousTime = now;

        if (mode === "stick") {
          if (now >= stickUntil) {
            mode = "slide";
            vx = 0;
            vy = 0.1;
            setEmotion("angry");
          } else {
            motionFrameRef.current = window.requestAnimationFrame(step);
            return;
          }
        }

        vy += 0.0055 * dt;
        if (mode === "fly") vx *= Math.pow(0.999, dt);
        const next = {
          x: positionRef.current.x + vx * dt,
          y: positionRef.current.y + vy * dt,
        };

        if (mode === "fly" && (next.x <= bounds.minX || next.x >= bounds.maxX)) {
          next.x = clamp(next.x, bounds.minX, bounds.maxX);
          next.y = clamp(next.y, bounds.minY, bounds.maxY);
          setPosition(next);
          setEmotion("angry");
          setPhase("wallslide");
          mode = "stick";
          stickUntil = now + 360;
          motionFrameRef.current = window.requestAnimationFrame(step);
          return;
        }
        if (next.y <= bounds.minY) {
          next.y = bounds.minY;
          vy = Math.abs(vy) * 0.4;
        }
        if (next.y >= bounds.maxY) {
          next.y = bounds.maxY;
          next.x = clamp(next.x, bounds.minX, bounds.maxX);
          setPosition(next);
          spawnSmoke(next.x, next.y);
          motionFrameRef.current = null;
          window.setTimeout(() => void startChaos(), 150);
          return;
        }
        setPosition(next);
        motionFrameRef.current = window.requestAnimationFrame(step);
      };

      motionFrameRef.current = window.requestAnimationFrame(step);
    },
    [cancelMotion, getBounds, setPhase, setPosition, spawnSmoke, startChaos],
  );

  const launchThrow = useCallback(
    (velocity: MascotPosition) => {
      cancelMotion();
      const bounds = getBounds();
      if (!bounds) return;
      ejectCarriedButton(velocity);
      const startsChaos = registerHardThrow(Math.hypot(velocity.x, velocity.y));
      if (startsChaos) {
        // Keep the fifth warning visible while this throw hits the wall; chaos
        // starts as soon as the impact animation finishes.
        rageThrow(velocity);
        return;
      }
      setEmotion("surprised");
      setPhase("thrown");

      let vx = clamp(velocity.x, -3.2, 3.2);
      let vy = clamp(velocity.y, -3.2, 3.2);
      let previousTime = performance.now();
      let settledFrames = 0;
      let puffed = false;

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
          // Kick up dust the first time it slams into the floor with some speed.
          if (next.y >= bounds.maxY && !puffed && Math.abs(vy) > 0.55) {
            puffed = true;
            spawnSmoke(next.x, bounds.maxY);
          }
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
    [
      cancelMotion,
      ejectCarriedButton,
      getBounds,
      rageThrow,
      registerHardThrow,
      setPhase,
      setPosition,
      spawnSmoke,
    ],
  );

  const undoChaos = useCallback(async () => {
    const snapshot = chaosSnapshotRef.current;
    if (!snapshot) return;
    setUndoAvailable(false);
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
    setEmotion("shy");
    setPhase("idle");
  }, [cancelMotion, clearChaosDebris, getRoot, setPhase]);

  useEffect(() => {
    if (rageEnabled) return;
    ragePointsRef.current = 0;
    clearMischiefDecayTimer();
    setThrowProgress(0);
    if (chaosActiveRef.current) void undoChaos();
  }, [clearMischiefDecayTimer, rageEnabled, undoChaos]);

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

  // Double-click trick — a quick flip/spin, then back to normal.
  const doTrick = useCallback(() => {
    if (chaosActiveRef.current || dragRef.current || carriedButtonRef.current) return;
    scheduleMischiefDecay();
    cancelMotion();
    clearEmotionTimer();
    setEmotion(Math.random() < 0.5 ? "excited" : "cool");
    setPhase("trick");
    emotionTimerRef.current = window.setTimeout(() => {
      emotionTimerRef.current = null;
      if (phaseRef.current === "trick") {
        setEmotion("happy");
        if (modalOpenRef.current) void attendModal();
        else setPhase("idle");
      }
    }, 720);
  }, [attendModal, cancelMotion, clearEmotionTimer, scheduleMischiefDecay, setPhase]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Held down while it's clutching a stolen element → it wriggles angrily, drops
  // the loot and bolts. Ends the drag cleanly so no phantom "button still held".
  const breakFree = useCallback(() => {
    clearLongPress();
    const drag = dragRef.current;
    if (drag) {
      const target = characterRef.current;
      if (target?.hasPointerCapture(drag.pointerId)) target.releasePointerCapture(drag.pointerId);
      dragRef.current = null;
    }
    ignoreClickRef.current = true;
    window.setTimeout(() => {
      ignoreClickRef.current = false;
    }, 450);
    if (carriedButtonRef.current) ejectCarriedButton({ x: (Math.random() - 0.5) * 1.3, y: -0.35 });
    setEmotion("angry");
    setPhase("struggle");
    window.setTimeout(() => {
      if (phaseRef.current !== "struggle") return;
      const bounds = getBounds();
      if (!bounds) {
        setPhase("idle");
        return;
      }
      const dir = positionRef.current.x < (bounds.minX + bounds.maxX) / 2 ? 1 : -1;
      const escape = {
        x: clamp(
          positionRef.current.x + dir * (130 + Math.random() * 130),
          bounds.minX,
          bounds.maxX,
        ),
        y: clamp(positionRef.current.y - 30 - Math.random() * 70, bounds.minY, bounds.maxY),
      };
      void animatePath([escape], RUN_SPEED, "running").then((done) => {
        if (done && !chaosActiveRef.current && phaseRef.current === "running") {
          setEmotion("neutral");
          setPhase("idle");
        }
      });
    }, 460);
  }, [animatePath, clearLongPress, ejectCarriedButton, getBounds, setPhase]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (chaosActiveRef.current) return;
    const startedSleeping = phaseRef.current === "sleeping";
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
    sleepingDragRef.current = startedSleeping ? { wokeFromShake: false } : null;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setEmotion(startedSleeping ? "sleepy" : "surprised");
    setPhase("dragging");
    // Grabbing it while it holds loot and just… holding → it breaks free.
    clearLongPress();
    if (carriedButtonRef.current) {
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        const active = dragRef.current;
        if (
          active &&
          active.pointerId === event.pointerId &&
          !active.moved &&
          carriedButtonRef.current
        )
          breakFree();
      }, 720);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const root = getRoot();
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const now = performance.now();
    const previous = drag.samples[drag.samples.length - 1];
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) {
      drag.moved = true;
      clearLongPress(); // it's a drag, not a hold — cancel the break-free timer
    }

    if (previous) {
      const dx = event.clientX - previous.x;
      const direction = Math.sign(dx);
      if (Math.abs(dx) > 7 && drag.lastDirection !== 0 && direction !== drag.lastDirection)
        drag.shakeTurns += 1;
      if (Math.abs(dx) > 7) drag.lastDirection = direction;
      const sleepingDrag = sleepingDragRef.current;
      if (sleepingDrag && drag.shakeTurns >= 3 && !sleepingDrag.wokeFromShake) {
        sleepingDrag.wokeFromShake = true;
        setEmotion("surprised");
      } else if ((!sleepingDrag || sleepingDrag.wokeFromShake) && drag.shakeTurns >= 4) {
        setEmotion("excited");
      }
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
      clearLongPress();
      const drag = dragRef.current;
      if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
      const sleepingDrag = sleepingDragRef.current;
      dragRef.current = null;
      sleepingDragRef.current = null;
      if (captureTarget?.hasPointerCapture(drag.pointerId)) {
        captureTarget.releasePointerCapture(drag.pointerId);
      }
      if (!drag.moved) {
        if (sleepingDrag) {
          setEmotion("sleepy");
          setPhase("sleeping");
          return;
        }
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
      if (Math.hypot(velocity.x, velocity.y) > 0.32) {
        if (sleepingDrag) setEmotion("surprised");
        launchThrow(velocity);
      } else if (sleepingDrag && !sleepingDrag.wokeFromShake) {
        setEmotion("sleepy");
        setPhase("sleeping");
      } else {
        setEmotion(drag.shakeTurns >= 4 ? "excited" : "happy");
        if (!carriedButtonRef.current && modalOpenRef.current) void attendModal();
        else setPhase(carriedButtonRef.current ? "carrying" : "idle");
      }
    },
    [attendModal, clearLongPress, launchThrow, setPhase],
  );

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    completeDrag(event.pointerId, event.currentTarget);
  };

  const handleBowlPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (bowlStatusRef.current !== "full" || chaosActiveRef.current) return;
    const root = getRoot();
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const current = bowlPositionRef.current;
    const now = performance.now();

    activityTokenRef.current += 1;
    activityBusyRef.current = false;
    if (phaseRef.current === "drinking" || phaseRef.current === "walking") {
      cancelMotion();
      setEmotion("surprised");
      setPhase("idle");
    }
    bowlDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rootRect.left - current.x,
      offsetY: event.clientY - rootRect.top - current.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      lastDirection: 0,
      lastSplashAt: Number.NEGATIVE_INFINITY,
      samples: [{ x: event.clientX, y: event.clientY, time: now }],
    };
    setBowlDragging(true);
    setBowlRotation(0);
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleBowlPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = bowlDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const root = getRoot();
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const now = performance.now();
    const previous = drag.samples[drag.samples.length - 1];
    const segmentElapsed = previous ? Math.max(4, now - previous.time) : 16;
    const segmentVelocity = previous
      ? {
          x: (event.clientX - previous.x) / segmentElapsed,
          y: (event.clientY - previous.y) / segmentElapsed,
        }
      : { x: 0, y: 0 };
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) {
      drag.moved = true;
    }
    drag.samples.push({ x: event.clientX, y: event.clientY, time: now });
    drag.samples = drag.samples.filter((sample) => now - sample.time <= 110).slice(-7);
    setBowlPosition(
      clampBowlPosition({
        x: event.clientX - rect.left - drag.offsetX,
        y: event.clientY - rect.top - drag.offsetY,
      }),
    );

    if (Math.abs(segmentVelocity.x) >= 0.12) {
      const direction = Math.sign(segmentVelocity.x);
      const changedDirection = drag.lastDirection !== 0 && direction !== drag.lastDirection;
      if (shouldSplashBowl(segmentVelocity.x, changedDirection, now - drag.lastSplashAt)) {
        drag.lastSplashAt = now;
        splashBowl(segmentVelocity);
      }
      drag.lastDirection = direction;
    }
  };

  const completeBowlDrag = useCallback(
    (pointerId?: number, captureTarget?: HTMLDivElement) => {
      const drag = bowlDragRef.current;
      if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
      bowlDragRef.current = null;
      setBowlDragging(false);
      if (captureTarget?.hasPointerCapture(drag.pointerId)) {
        captureTarget.releasePointerCapture(drag.pointerId);
      }
      if (!drag.moved) return;

      const latest = drag.samples[drag.samples.length - 1];
      const oldest = drag.samples[0];
      const elapsed = latest && oldest ? Math.max(16, latest.time - oldest.time) : 16;
      const velocity =
        latest && oldest
          ? { x: (latest.x - oldest.x) / elapsed, y: (latest.y - oldest.y) / elapsed }
          : { x: 0, y: 0 };
      if (isBowlSpillThrow(Math.hypot(velocity.x, velocity.y))) {
        spillBowl(velocity);
      }
    },
    [spillBowl],
  );

  const finishBowlDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    completeBowlDrag(event.pointerId, event.currentTarget);
  };

  const handleBowlKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    spillBowl({ x: 0.9, y: -1.1 });
  };

  const wakeMascot = useCallback(() => {
    if (phaseRef.current !== "sleeping") return;
    activityTokenRef.current += 1;
    activityBusyRef.current = false;
    clearEmotionTimer();
    resetStealClock();
    setEmotion("surprised");
    setPhase("stretch");
    emotionTimerRef.current = window.setTimeout(() => {
      emotionTimerRef.current = null;
      if (phaseRef.current !== "stretch") return;
      setEmotion("happy");
      setPhase("idle");
    }, 950);
  }, [clearEmotionTimer, resetStealClock, setPhase]);

  const handleClick = () => {
    if (phaseRef.current === "sleeping") {
      wakeMascot();
      return;
    }
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return;
    }
    if (carriedButtonRef.current) {
      restoreCarriedButton(true);
      return;
    }
    // Second click within the window → trick; otherwise a (deferred) pet.
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      doTrick();
      return;
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      petMascot();
    }, 240);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (phaseRef.current === "sleeping") {
      wakeMascot();
      return;
    }
    if (carriedButtonRef.current) restoreCarriedButton(true);
    else petMascot();
  };

  useEffect(() => {
    if (!enabled) return;
    let focused = document.hasFocus() && document.visibilityState === "visible";
    let sleepTimer: number | null = null;

    const clearSleepTimer = () => {
      if (sleepTimer === null) return;
      window.clearTimeout(sleepTimer);
      sleepTimer = null;
    };

    const tryToSleep = () => {
      sleepTimer = null;
      if (focused || phaseRef.current === "sleeping") return;
      if (chaosActiveRef.current || dragRef.current) {
        sleepTimer = window.setTimeout(tryToSleep, 1_000);
        return;
      }

      activityTokenRef.current += 1;
      modalClimbTokenRef.current += 1;
      activityBusyRef.current = false;
      cancelMotion();
      clearEmotionTimer();
      setRagePress(null);
      setScrollHand(null);
      setMouthFrame(null);
      setSpeech(null);
      if (carriedButtonRef.current) restoreCarriedButton(false);
      if (looseButtonRef.current) clearLooseButton();
      setEmotion("sleepy");
      setPhase("sleeping");
    };

    const armSleepTimer = () => {
      clearSleepTimer();
      if (!focused && phaseRef.current !== "sleeping") {
        sleepTimer = window.setTimeout(tryToSleep, UNFOCUSED_SLEEP_DELAY_MS);
      }
    };

    const handleFocus = () => {
      focused = true;
      clearSleepTimer();
      // Deliberately keep the sleeping phase: only pressing the mascot wakes it.
    };
    const handleBlur = () => {
      focused = false;
      armSleepTimer();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) handleFocus();
      else handleBlur();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!focused) armSleepTimer();

    return () => {
      clearSleepTimer();
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [cancelMotion, clearEmotionTimer, clearLooseButton, enabled, restoreCarriedButton, setPhase]);

  useEffect(() => {
    if (!enabled || !movementEnabled || !interactionsEnabled) return;
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

      if (phaseRef.current === "sleeping") return;

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
  }, [
    attendModal,
    cancelMotion,
    enabled,
    getRoot,
    getSceneRoot,
    interactionsEnabled,
    movementEnabled,
    setPhase,
  ]);

  useEffect(() => {
    if (!enabled || !movementEnabled) return;
    const firstRoam = window.setTimeout(() => void runAutonomousAction(), 450);
    const interval = window.setInterval(() => {
      if (phaseRef.current === "sleeping") return;
      if (modalOpenRef.current) {
        // Keep the mascot busy on any open modal (also re-boards it after a throw).
        if (!modalBusyRef.current && !dragRef.current && !chaosActiveRef.current) {
          void attendModal();
        }
      } else if (
        carryElementsEnabled &&
        carriedButtonRef.current &&
        phaseRef.current === "carrying" &&
        !dragRef.current &&
        !chaosActiveRef.current
      ) {
        // Snack on the loot instead of just parading it around.
        if (Math.random() < 0.55) void eatCarriedButton();
      } else if (
        carryElementsEnabled &&
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
  }, [
    attendModal,
    carryElementsEnabled,
    eatCarriedButton,
    enabled,
    movementEnabled,
    runAutonomousAction,
    stealRandomButton,
  ]);

  useEffect(() => {
    if (!enabled || !movementEnabled || chaosActiveRef.current || dragRef.current) return;
    const wasSleeping = phaseRef.current === "sleeping";
    activityTokenRef.current += 1;
    activityBusyRef.current = false;
    cancelMotion();
    setMouthFrame(null);
    setSpeech(null);
    if (carriedButtonRef.current) restoreCarriedButton(false);
    if (looseButtonRef.current) clearLooseButton();
    if (wasSleeping) {
      setEmotion("sleepy");
      setPhase("sleeping");
      return;
    }
    setPhase("idle");
    const timer = window.setTimeout(() => void runAutonomousAction(), 220);
    return () => window.clearTimeout(timer);
  }, [
    activeIndex,
    cancelMotion,
    clearLooseButton,
    enabled,
    movementEnabled,
    restoreCarriedButton,
    runAutonomousAction,
    setPhase,
  ]);

  useEffect(() => {
    if (!enabled) return;

    if (!carryElementsEnabled) {
      if (carriedButtonRef.current) restoreCarriedButton(false);
      if (looseButtonRef.current) clearLooseButton();
    }

    const currentPhase = phaseRef.current;
    const stopForMovement =
      !movementEnabled &&
      [
        "walking",
        "running",
        "carrying",
        "climbing",
        "jumping",
        "playing",
        "scrolling",
        "drinking",
        "typing",
      ].includes(currentPhase);
    const stopForInteractions =
      !interactionsEnabled && ["climbing", "jumping", "playing", "typing"].includes(currentPhase);
    const stopForScrolling = !scrollListsEnabled && currentPhase === "scrolling";
    if (!stopForMovement && !stopForInteractions && !stopForScrolling) return;

    activityTokenRef.current += 1;
    modalClimbTokenRef.current += 1;
    activityBusyRef.current = false;
    modalBusyRef.current = false;
    cancelMotion();
    setScrollHand(null);
    setSpeech(null);
    setModalForeground(false);
    if (!chaosActiveRef.current && !dragRef.current && phaseRef.current !== "sleeping") {
      setEmotion("neutral");
      setPhase(carriedButtonRef.current ? "carrying" : "idle");
    }
  }, [
    cancelMotion,
    carryElementsEnabled,
    clearLooseButton,
    enabled,
    interactionsEnabled,
    movementEnabled,
    restoreCarriedButton,
    scrollListsEnabled,
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
    if (!bowlDragging) return;
    const handlePointerEnd = (event: PointerEvent) => completeBowlDrag(event.pointerId, undefined);
    const handleMouseUp = () => completeBowlDrag(undefined, undefined);
    const handleBlur = () => completeBowlDrag(undefined, undefined);
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
  }, [bowlDragging, completeBowlDrag]);

  useEffect(() => {
    resetBowl(enabled && bowlEnabled);
  }, [bowlEnabled, enabled, resetBowl]);

  useEffect(() => {
    if (!enabled) {
      chaosTokenRef.current += 1;
      activityTokenRef.current += 1;
      chaosActiveRef.current = false;
      ragePointsRef.current = 0;
      setUndoAvailable(false);
      cancelMotion();
      clearEmotionTimer();
      clearMischiefDecayTimer();
      clearLongPress();
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      activityBusyRef.current = false;
      dragRef.current = null;
      sleepingDragRef.current = null;
      setRagePress(null);
      setModalForeground(false);
      setMouthFrame(null);
      setSpeech(null);
      setThrowProgress(0);
      smokeTokenRef.current += 1;
      setSmoke(null);
      clearChaosDebris();
      if (carriedButtonRef.current) restoreCarriedButton(false);
      if (looseButtonRef.current) clearLooseButton();
    }
  }, [
    cancelMotion,
    clearEmotionTimer,
    clearChaosDebris,
    clearLongPress,
    clearLooseButton,
    clearMischiefDecayTimer,
    enabled,
    restoreCarriedButton,
  ]);

  useEffect(() => {
    const handleResize = () => {
      setPosition(clampPosition(positionRef.current));
      if (bowlStatusRef.current !== "hidden") {
        setBowlPosition(clampBowlPosition(bowlPositionRef.current));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampBowlPosition, clampPosition, setBowlPosition, setPosition]);

  useEffect(
    () => () => {
      chaosTokenRef.current += 1;
      activityTokenRef.current += 1;
      smokeTokenRef.current += 1;
      bowlReactionTokenRef.current += 1;
      cancelMotion();
      clearEmotionTimer();
      clearMischiefDecayTimer();
      clearBowlTimers();
      clearChaosDebris();
      if (bowlFrameRef.current !== null) window.cancelAnimationFrame(bowlFrameRef.current);
      if (bowlDropFrameRef.current !== null) window.cancelAnimationFrame(bowlDropFrameRef.current);
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
      if (looseButtonFrameRef.current !== null)
        window.cancelAnimationFrame(looseButtonFrameRef.current);
      if (looseButtonReturnTimerRef.current !== null)
        window.clearTimeout(looseButtonReturnTimerRef.current);
      const carried = carriedButtonRef.current;
      const loose = looseButtonRef.current;
      if (carried) restoreCarriedElement(carried);
      if (loose) restoreCarriedElement(loose);
    },
    [cancelMotion, clearBowlTimers, clearChaosDebris, clearEmotionTimer, clearMischiefDecayTimer],
  );

  if (!enabled) return null;

  return (
    <MascotView
      layerRef={layerRef}
      characterRef={characterRef}
      replicaRef={replicaRef}
      looseButtonReplicaRef={looseButtonReplicaRef}
      eatReplicaRef={eatReplicaRef}
      position={position}
      name={mascotName}
      showName={showName}
      phase={phase}
      emotion={emotion}
      carriedButton={carriedButton}
      looseButton={looseButton}
      looseButtonTransform={looseButtonTransform}
      ragePress={ragePress}
      scrollHand={scrollHand}
      undoAvailable={undoAvailable}
      modalForeground={modalForeground}
      throwProgress={throwProgress}
      smoke={smoke}
      mouthFrame={mouthFrame}
      speech={speech}
      bowlStatus={bowlStatus}
      bowlPosition={bowlPosition}
      bowlDragging={bowlDragging}
      bowlRotation={bowlRotation}
      bowlSpill={bowlSpill}
      onUndoChaos={() => void undoChaos()}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerFinish={finishDrag}
      onKeyDown={handleKeyDown}
      onBowlPointerDown={handleBowlPointerDown}
      onBowlPointerMove={handleBowlPointerMove}
      onBowlPointerFinish={finishBowlDrag}
      onBowlKeyDown={handleBowlKeyDown}
    />
  );
}
