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
import "./LauncherMascot.css";

const MASCOT_SIZE = 64;
const WALK_DURATION_MS = 780;
const RUN_DURATION_MS = 420;
const ROAM_INTERVAL_MS = 5000;
const MIN_SLEEP_DELAY_MS = 42_000;
const SLEEP_DELAY_VARIANCE_MS = 20_000;
const MIN_STEAL_DELAY_MS = 22_000;
const STEAL_DELAY_VARIANCE_MS = 12_000;
const PROTECTION_FOLLOW_DELAY_MS = 90;
const PROTECTION_GRACE_MS = 850;

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
  | "sleeping"
  | "dragging"
  | "carrying"
  | "pleading";

type MascotPosition = { x: number; y: number };

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type StolenButton = {
  element: HTMLButtonElement;
  previousAriaHidden: string | null;
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
  "neutral",
  "happy",
  "angry",
  "sad",
];

const UNSAFE_BUTTON_PATTERN = /KILL|DELETE|REMOVE|UNINSTALL|STOP|CLOSE|RESET|TRASH|УДАЛИТЬ|ОСТАНОВИТЬ/i;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function randomItem<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function getNextSleepAt() {
  return Date.now() + MIN_SLEEP_DELAY_MS + Math.random() * SLEEP_DELAY_VARIANCE_MS;
}

function getNextStealAt() {
  return Date.now() + MIN_STEAL_DELAY_MS + Math.random() * STEAL_DELAY_VARIANCE_MS;
}

function isVisibleButton(button: HTMLButtonElement, rootRect: DOMRect) {
  if (button.disabled || button.hidden || button.closest("[aria-hidden='true']")) return false;
  const rect = button.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;
  if (rect.bottom < rootRect.top || rect.top > rootRect.bottom) return false;
  if (rect.right < rootRect.left || rect.left > rootRect.right) return false;
  const style = window.getComputedStyle(button);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function isSafeRoamButton(button: HTMLButtonElement) {
  if (button.matches("[data-mascot-ignore], [data-mascot-off-switch]")) return false;
  if (button.matches(".danger, .kill-action, .trash-action, .close-btn, .plugins-close")) return false;
  return !UNSAFE_BUTTON_PATTERN.test(button.textContent ?? "");
}

function getButtonLabel(button: HTMLButtonElement) {
  const explicit = button.dataset.mascotLabel?.trim();
  const text = explicit || button.innerText.trim().replace(/\s+/g, " ") || "BUTTON";
  return text.slice(0, 18);
}

export function LauncherMascot({ activeIndex, enabled }: LauncherMascotProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<MascotPosition>({ x: 51, y: 160 });
  const phaseRef = useRef<MascotPhase>("idle");
  const currentTargetRef = useRef<HTMLButtonElement | null>(null);
  const stolenButtonRef = useRef<StolenButton | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const nextSleepAtRef = useRef(getNextSleepAt());
  const nextStealAtRef = useRef(getNextStealAt());
  const actionTimerRef = useRef<number | null>(null);
  const emotionTimerRef = useRef<number | null>(null);
  const followTimerRef = useRef<number | null>(null);
  const protectionExitTimerRef = useRef<number | null>(null);
  const protectionUntilRef = useRef(0);
  const latestPointerRef = useRef({ x: 0, y: 0 });

  const [position, setPositionState] = useState(positionRef.current);
  const [phase, setPhaseState] = useState<MascotPhase>("idle");
  const [emotion, setEmotion] = useState<MascotEmotion>("neutral");
  const [stolenLabel, setStolenLabel] = useState<string | null>(null);

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

  const clearActionTimer = useCallback(() => {
    if (actionTimerRef.current !== null) {
      window.clearTimeout(actionTimerRef.current);
      actionTimerRef.current = null;
    }
  }, []);

  const resetSleepClock = useCallback(() => {
    nextSleepAtRef.current = getNextSleepAt();
  }, []);

  const resetStealClock = useCallback(() => {
    nextStealAtRef.current = getNextStealAt();
  }, []);

  const collectRoamButtons = useCallback((contentOnly = false) => {
    const root = getRoot();
    if (!root) return [];
    const rootRect = root.getBoundingClientRect();
    const selector = contentOnly ? ".main-stage button" : ".side-nav button, .main-stage button";
    return Array.from(root.querySelectorAll<HTMLButtonElement>(selector)).filter(
      (button) => isVisibleButton(button, rootRect) && isSafeRoamButton(button),
    );
  }, [getRoot]);

  const getTargetPosition = useCallback(
    (button: HTMLButtonElement, cover = false): MascotPosition | null => {
      const root = getRoot();
      if (!root || !button.isConnected) return null;
      const rootRect = root.getBoundingClientRect();
      const rect = button.getBoundingClientRect();
      const maxX = Math.max(0, rootRect.width - MASCOT_SIZE);
      const maxY = Math.max(70, rootRect.height - MASCOT_SIZE - 54);
      const x = clamp(rect.left - rootRect.left + rect.width / 2 - MASCOT_SIZE / 2, 0, maxX);

      if (cover) {
        return {
          x,
          y: clamp(rect.top - rootRect.top + rect.height / 2 - MASCOT_SIZE / 2, 70, maxY),
        };
      }

      const above = rect.top - rootRect.top - (MASCOT_SIZE - 12);
      const y = above >= 70 ? above : rect.bottom - rootRect.top - 12;
      return { x, y: clamp(y, 70, maxY) };
    },
    [getRoot],
  );

  const startMove = useCallback(
    (
      button: HTMLButtonElement,
      nextEmotion: MascotEmotion,
      movePhase: "walking" | "running",
      onArrive?: () => void,
      cover = false,
    ) => {
      const next = getTargetPosition(button, cover);
      if (!next) return false;
      clearActionTimer();
      currentTargetRef.current = button;
      setEmotion(nextEmotion);
      setPhase(movePhase);
      setPosition(next);
      actionTimerRef.current = window.setTimeout(() => {
        actionTimerRef.current = null;
        if (phaseRef.current !== movePhase) return;
        if (onArrive) onArrive();
        else setPhase("idle");
      }, movePhase === "running" ? RUN_DURATION_MS : WALK_DURATION_MS);
      return true;
    },
    [clearActionTimer, getTargetPosition, setPhase, setPosition],
  );

  const moveToRandomTarget = useCallback(
    (nextEmotion = randomItem(ROAMING_EMOTIONS) ?? "neutral", contentOnly = false) => {
      const buttons = collectRoamButtons(contentOnly);
      if (buttons.length === 0) return false;
      let target = randomItem(buttons) ?? buttons[0];
      if (buttons.length > 1 && target === currentTargetRef.current) {
        const currentIndex = buttons.indexOf(target);
        target = buttons[(currentIndex + 1) % buttons.length];
      }
      return startMove(target, nextEmotion, "walking");
    },
    [collectRoamButtons, startMove],
  );

  const restoreStolenButton = useCallback(
    (celebrate: boolean) => {
      const stolen = stolenButtonRef.current;
      if (!stolen) return;
      stolenButtonRef.current = null;
      stolen.element.classList.remove("mascot-button-stolen");
      stolen.element.removeAttribute("data-mascot-stolen");
      if (stolen.previousAriaHidden === null) stolen.element.removeAttribute("aria-hidden");
      else stolen.element.setAttribute("aria-hidden", stolen.previousAriaHidden);
      setStolenLabel(null);
      resetStealClock();

      if (celebrate && stolen.element.isConnected) {
        setPhase("idle");
        startMove(stolen.element, "happy", "walking");
      } else {
        setEmotion("neutral");
        setPhase("idle");
      }
    },
    [resetStealClock, setPhase, startMove],
  );

  const getEscapePosition = useCallback((): MascotPosition | null => {
    const root = getRoot();
    if (!root) return null;
    const width = root.clientWidth;
    const height = root.clientHeight;
    const minX = Math.min(170, Math.max(0, width - MASCOT_SIZE));
    const maxX = Math.max(minX, width - MASCOT_SIZE - 28);
    const minY = 90;
    const maxY = Math.max(minY, height - MASCOT_SIZE - 68);
    return {
      x: Math.round(minX + Math.random() * (maxX - minX)),
      y: Math.round(minY + Math.random() * (maxY - minY)),
    };
  }, [getRoot]);

  const stealRandomButton = useCallback(() => {
    const root = getRoot();
    if (!root) return false;
    const rootRect = root.getBoundingClientRect();
    const buttons = Array.from(
      root.querySelectorAll<HTMLButtonElement>("[data-mascot-stealable]:not([data-mascot-stolen])"),
    ).filter((button) => isVisibleButton(button, rootRect) && isSafeRoamButton(button));
    const target = randomItem(buttons);
    if (!target) {
      resetStealClock();
      return false;
    }

    return startMove(
      target,
      "cool",
      "running",
      () => {
        if (!target.isConnected || target.disabled) {
          setPhase("idle");
          resetStealClock();
          return;
        }
        const stolen: StolenButton = {
          element: target,
          previousAriaHidden: target.getAttribute("aria-hidden"),
        };
        stolenButtonRef.current = stolen;
        target.classList.add("mascot-button-stolen");
        target.dataset.mascotStolen = "true";
        target.setAttribute("aria-hidden", "true");
        setStolenLabel(getButtonLabel(target));
        setEmotion("excited");
        setPhase("carrying");
        const escape = getEscapePosition();
        if (escape) setPosition(escape);
      },
      true,
    );
  }, [getEscapePosition, getRoot, resetStealClock, setPhase, setPosition, startMove]);

  const enterSleep = useCallback(() => {
    const buttons = collectRoamButtons();
    const target = randomItem(buttons);
    if (!target) {
      resetSleepClock();
      return false;
    }
    return startMove(
      target,
      "neutral",
      "running",
      () => {
        if (!target.isConnected) {
          setPhase("idle");
          resetSleepClock();
          return;
        }
        setEmotion("sleepy");
        setPhase("sleeping");
      },
      true,
    );
  }, [collectRoamButtons, resetSleepClock, setPhase, startMove]);

  const wakeAndRun = useCallback(() => {
    resetSleepClock();
    setPhase("idle");
    moveToRandomTarget("happy", true);
  }, [moveToRandomTarget, resetSleepClock, setPhase]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      if (stolenButtonRef.current) restoreStolenButton(false);
      clearActionTimer();
      dragRef.current = null;
      if (phaseRef.current === "sleeping" || phaseRef.current === "dragging") setPhase("idle");
      const movedIntoContent = moveToRandomTarget("excited", true);
      if (!movedIntoContent) moveToRandomTarget("happy");
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeIndex, clearActionTimer, enabled, moveToRandomTarget, restoreStolenButton, setPhase]);

  useEffect(() => {
    if (!enabled) return;
    resetSleepClock();
    resetStealClock();
    const interval = window.setInterval(() => {
      if (phaseRef.current !== "idle") return;
      if (Date.now() >= nextStealAtRef.current && stealRandomButton()) return;
      if (Date.now() >= nextSleepAtRef.current && enterSleep()) return;
      moveToRandomTarget();
    }, ROAM_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, enterSleep, moveToRandomTarget, resetSleepClock, resetStealClock, stealRandomButton]);

  const scheduleProtectionFollow = useCallback(
    (clientX: number, clientY: number) => {
      latestPointerRef.current = { x: clientX, y: clientY };
      if (followTimerRef.current !== null) return;
      followTimerRef.current = window.setTimeout(() => {
        followTimerRef.current = null;
        if (phaseRef.current !== "pleading") return;
        const root = getRoot();
        if (!root) return;
        const rect = root.getBoundingClientRect();
        setPosition({
          x: clamp(latestPointerRef.current.x - rect.left - MASCOT_SIZE / 2, 0, rect.width - MASCOT_SIZE),
          y: clamp(latestPointerRef.current.y - rect.top - MASCOT_SIZE / 2, 70, rect.height - MASCOT_SIZE - 54),
        });
      }, PROTECTION_FOLLOW_DELAY_MS);
    },
    [getRoot, setPosition],
  );

  const activateProtection = useCallback(
    (clientX: number, clientY: number) => {
      if (stolenButtonRef.current) restoreStolenButton(false);
      clearActionTimer();
      dragRef.current = null;
      protectionUntilRef.current = Number.POSITIVE_INFINITY;
      if (protectionExitTimerRef.current !== null) {
        window.clearTimeout(protectionExitTimerRef.current);
        protectionExitTimerRef.current = null;
      }
      setEmotion("sad");
      setPhase("pleading");
      scheduleProtectionFollow(clientX, clientY);
    },
    [clearActionTimer, restoreStolenButton, scheduleProtectionFollow, setPhase],
  );

  const scheduleProtectionExit = useCallback(() => {
    protectionUntilRef.current = Date.now() + PROTECTION_GRACE_MS;
    if (protectionExitTimerRef.current !== null) window.clearTimeout(protectionExitTimerRef.current);
    protectionExitTimerRef.current = window.setTimeout(() => {
      protectionExitTimerRef.current = null;
      if (phaseRef.current !== "pleading") return;
      setEmotion("shy");
      setPhase("idle");
      resetSleepClock();
    }, PROTECTION_GRACE_MS);
  }, [resetSleepClock, setPhase]);

  useEffect(() => {
    if (!enabled) return;
    const handleWindowPointerMove = (event: PointerEvent) => {
      const root = getRoot();
      const offSwitch = root?.querySelector<HTMLButtonElement>("[data-mascot-off-switch]");
      const rect = offSwitch?.getBoundingClientRect();
      const isOverOffSwitch =
        rect !== undefined &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (isOverOffSwitch) {
        protectionUntilRef.current = Number.POSITIVE_INFINITY;
        if (protectionExitTimerRef.current !== null) {
          window.clearTimeout(protectionExitTimerRef.current);
          protectionExitTimerRef.current = null;
        }
        if (phaseRef.current !== "pleading") activateProtection(event.clientX, event.clientY);
        else scheduleProtectionFollow(event.clientX, event.clientY);
        return;
      }

      if (phaseRef.current !== "pleading") return;
      scheduleProtectionExit();
      scheduleProtectionFollow(event.clientX, event.clientY);
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    return () => window.removeEventListener("pointermove", handleWindowPointerMove);
  }, [activeIndex, activateProtection, enabled, getRoot, scheduleProtectionExit, scheduleProtectionFollow]);

  useEffect(() => {
    if (enabled) return;
    clearActionTimer();
    if (stolenButtonRef.current) restoreStolenButton(false);
    dragRef.current = null;
    setStolenLabel(null);
    setEmotion("neutral");
    setPhase("idle");
  }, [clearActionTimer, enabled, restoreStolenButton, setPhase]);

  useEffect(
    () => () => {
      clearActionTimer();
      if (stolenButtonRef.current) {
        const stolen = stolenButtonRef.current;
        stolen.element.classList.remove("mascot-button-stolen");
        stolen.element.removeAttribute("data-mascot-stolen");
        if (stolen.previousAriaHidden === null) stolen.element.removeAttribute("aria-hidden");
        else stolen.element.setAttribute("aria-hidden", stolen.previousAriaHidden);
      }
      if (emotionTimerRef.current !== null) window.clearTimeout(emotionTimerRef.current);
      if (followTimerRef.current !== null) window.clearTimeout(followTimerRef.current);
      if (protectionExitTimerRef.current !== null) window.clearTimeout(protectionExitTimerRef.current);
    },
    [clearActionTimer],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== "sleeping") return;
    const root = getRoot();
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const current = positionRef.current;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left - current.x,
      offsetY: event.clientY - rect.top - current.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setEmotion("surprised");
    setPhase("dragging");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || phaseRef.current !== "dragging") return;
    const root = getRoot();
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
    setPosition({
      x: clamp(event.clientX - rect.left - drag.offsetX, 0, rect.width - MASCOT_SIZE),
      y: clamp(event.clientY - rect.top - drag.offsetY, 70, rect.height - MASCOT_SIZE - 54),
    });
  };

  const completeDrag = useCallback(
    (drag: DragState) => {
      if (!drag.moved) {
        setEmotion("sleepy");
        setPhase("sleeping");
        return;
      }
      resetSleepClock();
      setEmotion("confused");
      setPhase("idle");
      if (emotionTimerRef.current !== null) window.clearTimeout(emotionTimerRef.current);
      emotionTimerRef.current = window.setTimeout(() => {
        if (phaseRef.current === "idle") setEmotion("neutral");
      }, 1600);
    },
    [resetSleepClock, setPhase],
  );

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    completeDrag(drag);
  };

  useEffect(() => {
    if (phase !== "dragging") return;
    const finishWindowDrag = (pointerId?: number) => {
      const drag = dragRef.current;
      if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
      dragRef.current = null;
      completeDrag(drag);
    };
    const handlePointerEnd = (event: PointerEvent) => finishWindowDrag(event.pointerId);
    const handleMouseUp = () => finishWindowDrag();
    const handleBlur = () => finishWindowDrag();
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

  const handleClick = () => {
    if (phaseRef.current === "carrying") restoreStolenButton(true);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (phaseRef.current === "sleeping") {
      event.preventDefault();
      wakeAndRun();
    } else if (phaseRef.current === "carrying") {
      event.preventDefault();
      restoreStolenButton(true);
    }
  };

  if (!enabled) return null;

  const isSleeping = phase === "sleeping";
  const isCarrying = phase === "carrying";
  const isInteractive = isSleeping || isCarrying || phase === "dragging" || phase === "pleading";
  const ariaLabel = isSleeping
    ? "Маскот уснул на кнопке. Перетащите его, чтобы разбудить."
    : isCarrying
      ? `Маскот украл кнопку ${stolenLabel ?? ""}. Нажмите, чтобы вернуть её.`
      : undefined;
  const style = {
    transform: `translate3d(${Math.round(position.x)}px, ${Math.round(position.y)}px, 0)`,
  } satisfies CSSProperties;

  return (
    <div ref={layerRef} className="launcher-mascot-layer">
      <div
        className={`launcher-mascot-character launcher-mascot-character--${phase}`}
        style={style}
        data-emotion={emotion}
        role={isSleeping || isCarrying ? "button" : undefined}
        aria-label={ariaLabel}
        tabIndex={isSleeping || isCarrying ? 0 : -1}
        title={
          isSleeping
            ? "Уснул на кнопке — перетащи его"
            : isCarrying
              ? "Нажми на маскота, чтобы вернуть кнопку"
              : undefined
        }
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onKeyDown={handleKeyDown}
        aria-hidden={!isInteractive && !ariaLabel ? true : undefined}
      >
        {isSleeping && <span className="launcher-mascot-hint">ПЕРЕТАЩИ</span>}
        {phase === "pleading" && <span className="launcher-mascot-plea">НЕ ВЫКЛЮЧАЙ</span>}
        {stolenLabel && <span className="launcher-mascot-loot">{stolenLabel}</span>}
        <img src={MASCOT_SPRITES[emotion]} alt="" draggable={false} aria-hidden="true" />
      </div>
    </div>
  );
}
