import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { GuidePointer } from "./GuidePointer";
import { playGuideDemo, type GuideAction } from "./guidePlayback";
import {
  guidePreviewLayout,
  measureGuideScene,
  type GuideSceneMeasurement,
} from "./guidePreviewLayout";
import type { TabKey } from "../../types";
import { LauncherGuideDemoScene, type LauncherGuideScene } from "./LauncherGuideScenes";
import "./LauncherGuide.css";
import { useTranslation } from "../../i18n/locale";

export type LauncherGuidePlacement = "auto" | "above" | "right" | "below" | "left";
export type LauncherGuideAnimation = "typewriter" | "pulse" | "none";
export type LauncherGuideDemoAction = "click" | "type" | "toggle" | "select";

export interface LauncherGuideStep {
  id: string;
  tab?: TabKey;
  eyebrow: string;
  title: string;
  description: string;
  targets: string[];
  showPreview?: boolean;
  previewTargetSelector?: string;
  previewWidth?: number;
  scene?: LauncherGuideScene;
  previewValue?: string;
  previewValueSelector?: string;
  demoAction?: LauncherGuideDemoAction;
  demoTargetSelector?: string;
  demoResultSelector?: string;
  demoResultText?: string;
  showPointer?: boolean;
  placement?: LauncherGuidePlacement;
  animation?: LauncherGuideAnimation;
  zoom?: number;
  spotlightPadding?: number;
}

interface LauncherGuideProps {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  steps: LauncherGuideStep[];
  onComplete: () => void;
  onSkip?: () => void;
  onTargetChange?: (selector: string | null) => void;
  onStepChange?: (step: LauncherGuideStep, index: number) => void;
  stepCompletion?: Partial<Record<string, boolean>>;
}

interface RectSnapshot {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface TargetSnapshot {
  stepId: string;
  element: HTMLElement;
  selector: string;
  rect: RectSnapshot;
  rootWidth: number;
  rootHeight: number;
}

interface CardSize {
  width: number;
  height: number;
  contentWidth: number;
  previewHeight: number;
}

const GUIDE_MARGIN = 22;
const GUIDE_GAP = 34;

function getLauncherGuideSceneSize(scene: LauncherGuideScene, source: HTMLElement) {
  switch (scene.kind) {
    case "dropdown":
      return {
        width: 320,
        height: 128 + scene.options.length * 49,
      };
    case "build-config":
      return { width: 560, height: 310 };
    case "play":
      return { width: 240, height: 56 };
    case "search":
      return { width: 440, height: 160 };
    case "choice":
      return {
        width: source.querySelector<HTMLElement>(".theme-switch")?.offsetWidth || 320,
        height: 26,
      };
    case "catalog":
      return { width: 480, height: 320 };
    case "slider":
      return { width: 380, height: 122 };
    case "preference":
      return { width: 380, height: scene.action === "expand" ? 196 : 80 };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rectsMatch(a: RectSnapshot, b: RectSnapshot) {
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function isUsableTarget(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 12 || rect.height < 10) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function findTarget(root: HTMLElement, selectors: string[]) {
  for (const selector of selectors) {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>(selector));
    const element = candidates.find(
      (candidate) => !candidate.closest(".launcher-guide-layer") && isUsableTarget(candidate),
    );
    if (element) return { element, selector };
  }
  return null;
}

function revealTargetInScrollArea(root: HTMLElement, element: HTMLElement) {
  const viewport = element.closest<HTMLElement>(".csa-content");
  if (!viewport || !root.contains(viewport)) return false;

  const viewportRect = viewport.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const padding = 18;
  let delta = 0;

  if (elementRect.top < viewportRect.top + padding) {
    delta = elementRect.top - viewportRect.top - padding;
  } else if (elementRect.bottom > viewportRect.bottom - padding) {
    delta = elementRect.bottom - viewportRect.bottom + padding;
  }

  if (Math.abs(delta) < 1) return false;
  viewport.scrollTop += delta;
  return true;
}

function copyComputedTree(source: HTMLElement, clone: HTMLElement) {
  const sourceNodes: Element[] = [source, ...Array.from(source.querySelectorAll("*"))];
  const cloneNodes: Element[] = [clone, ...Array.from(clone.querySelectorAll("*"))];

  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode) return;
    const computed = window.getComputedStyle(sourceNode);
    const style = (cloneNode as HTMLElement | SVGElement).style;
    Array.from(computed).forEach((property) => {
      style.setProperty(
        property,
        computed.getPropertyValue(property),
        computed.getPropertyPriority(property),
      );
    });
  });
}

function mountTargetReplica(holder: HTMLElement, target: TargetSnapshot, scale: number) {
  const clone = target.element.cloneNode(true) as HTMLElement;
  copyComputedTree(target.element, clone);
  const scaleFrame = document.createElement("div");
  scaleFrame.className = "launcher-guide-replica-scale-frame";
  scaleFrame.style.width = `${target.rect.width}px`;
  scaleFrame.style.height = `${target.rect.height}px`;
  scaleFrame.style.background = "var(--bg-field, var(--bg-elevated))";
  scaleFrame.style.setProperty("transform", `scale(${scale})`, "important");

  clone.removeAttribute("id");
  clone.removeAttribute("data-guide-target");
  clone.setAttribute("aria-hidden", "true");
  clone.tabIndex = -1;
  clone.querySelectorAll<HTMLElement>("[id]").forEach((node) => node.removeAttribute("id"));
  clone
    .querySelectorAll<HTMLElement>("button, input, textarea, select, a, [tabindex]")
    .forEach((node) => {
      node.tabIndex = -1;
    });

  clone.style.setProperty("box-sizing", "border-box", "important");
  clone.style.setProperty("position", "relative", "important");
  clone.style.setProperty("inset", "auto", "important");
  clone.style.setProperty("margin", "0", "important");
  clone.style.setProperty("width", `${target.rect.width}px`, "important");
  clone.style.setProperty("height", `${target.rect.height}px`, "important");
  clone.style.setProperty("min-width", `${target.rect.width}px`, "important");
  clone.style.setProperty("max-width", `${target.rect.width}px`, "important");
  clone.style.setProperty("transform", "none");
  clone.style.setProperty("translate", "none", "important");
  clone.style.setProperty("visibility", "visible", "important");
  clone.style.setProperty("opacity", "1", "important");
  clone.style.setProperty("backdrop-filter", "none", "important");
  clone.style.setProperty("-webkit-backdrop-filter", "none", "important");
  clone.style.setProperty("pointer-events", "none", "important");
  scaleFrame.appendChild(clone);
  holder.replaceChildren(scaleFrame);

  return clone;
}

function resolvePreviewTarget(
  target: TargetSnapshot,
  selector?: string,
  previewWidth?: number,
): TargetSnapshot {
  if (!selector) return target;
  const element = target.element.matches(selector)
    ? target.element
    : target.element.querySelector<HTMLElement>(selector);
  if (!element || !isUsableTarget(element)) return target;
  const rect = element.getBoundingClientRect();
  const width = previewWidth ?? rect.width;
  return {
    ...target,
    element,
    rect: {
      left: 0,
      top: 0,
      right: width,
      bottom: rect.height,
      width,
      height: rect.height,
    },
  };
}

function findDemoNode(root: HTMLElement, selector?: string) {
  if (!selector) return root;
  return root.matches(selector) ? root : root.querySelector<HTMLElement>(selector);
}

function setDemoNodeValue(node: HTMLElement | null, value: string) {
  if (!node) return;
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    node.value = value;
    node.setAttribute("value", value);
    return;
  }
  node.textContent = value;
}

function prepareSelectDemo(clone: HTMLElement, targetSelector?: string) {
  const demoNode = findDemoNode(clone, targetSelector);
  const group = demoNode?.parentElement;
  if (!group) return;

  group.querySelectorAll<HTMLElement>(".theme-switch-btn").forEach((node) => {
    node.style.removeProperty("background");
    node.style.removeProperty("background-color");
    node.style.removeProperty("color");
    node.style.removeProperty("cursor");
  });
}

function activateDemoNode(
  clone: HTMLElement,
  action: LauncherGuideDemoAction,
  targetSelector?: string,
  resultSelector?: string,
  resultText?: string,
) {
  const demoNode = findDemoNode(clone, targetSelector);
  if (!demoNode) return;
  demoNode.classList.remove("launcher-guide-demo-press");

  if (action === "toggle") {
    const enabled = !demoNode.classList.contains("enabled");
    demoNode.classList.toggle("enabled", enabled);
    demoNode.setAttribute("aria-checked", String(enabled));
    demoNode.style.setProperty(
      "background",
      enabled ? "var(--bg-toggle-on, var(--accent))" : "transparent",
      "important",
    );
    demoNode.style.setProperty(
      "border-color",
      enabled ? "color-mix(in srgb, var(--accent) 42%, transparent)" : "var(--line)",
      "important",
    );
    const knob = demoNode.querySelector<HTMLElement>(".toggle-knob");
    knob?.style.setProperty(
      "left",
      enabled
        ? "calc(100% - var(--element-toggle-inset) - var(--element-toggle-knob-size))"
        : "var(--element-toggle-inset)",
      "important",
    );
  }

  if (action === "select") {
    demoNode.parentElement
      ?.querySelectorAll<HTMLElement>(".active")
      .forEach((node) => node.classList.remove("active"));
    demoNode.classList.add("active");
  }

  if (action === "click") {
    const dropdown = demoNode.closest<HTMLElement>(".inline-dropdown");
    dropdown?.classList.add("open");
    dropdown
      ?.querySelector<HTMLElement>(".inline-dropdown-chevron-wrap svg")
      ?.style.setProperty("transform", "rotate(180deg)", "important");
    if (demoNode.matches(".settings-toggle-expand")) {
      demoNode.classList.add("expanded");
      demoNode.setAttribute("aria-expanded", "true");
      demoNode
        .querySelector<HTMLElement>("svg")
        ?.style.setProperty("transform", "rotate(180deg)", "important");
    }
  }

  if (resultText !== undefined) {
    const resultNode = findDemoNode(clone, resultSelector ?? targetSelector);
    setDemoNodeValue(resultNode, resultText);
    if (resultNode?.matches(".bpa-label")) {
      resultNode.style.setProperty("width", "max-content", "important");
      resultNode.style.setProperty("max-width", "none", "important");
      resultNode.style.setProperty("white-space", "nowrap", "important");
      resultNode.style.setProperty("overflow", "visible", "important");
      resultNode.style.setProperty("text-overflow", "clip", "important");
    } else {
      resultNode?.style.setProperty("white-space", "nowrap", "important");
      resultNode?.style.setProperty("overflow", "hidden", "important");
      resultNode?.style.setProperty("text-overflow", "ellipsis", "important");
    }
  }
}

function getPlacement(preferred: LauncherGuidePlacement, target: TargetSnapshot, card: CardSize) {
  if (preferred !== "auto") return preferred;
  if (target.rect.top >= card.height + GUIDE_GAP + GUIDE_MARGIN) return "above";
  if (target.rootWidth - target.rect.right >= card.width + GUIDE_GAP + GUIDE_MARGIN) return "right";
  if (target.rect.left >= card.width + GUIDE_GAP + GUIDE_MARGIN) return "left";
  return "below";
}

function getCardPosition(
  placement: Exclude<LauncherGuidePlacement, "auto">,
  target: TargetSnapshot,
  card: CardSize,
) {
  const maxLeft = Math.max(GUIDE_MARGIN, target.rootWidth - card.width - GUIDE_MARGIN);
  const maxTop = Math.max(GUIDE_MARGIN, target.rootHeight - card.height - GUIDE_MARGIN);
  const centeredLeft = target.rect.left + target.rect.width / 2 - card.width / 2;
  const centeredTop = target.rect.top + target.rect.height / 2 - card.height / 2;

  switch (placement) {
    case "above":
      return {
        left: clamp(centeredLeft, GUIDE_MARGIN, maxLeft),
        top: clamp(target.rect.top - card.height - GUIDE_GAP, GUIDE_MARGIN, maxTop),
      };
    case "right":
      return {
        left: clamp(target.rect.right + GUIDE_GAP, GUIDE_MARGIN, maxLeft),
        top: clamp(centeredTop, GUIDE_MARGIN, maxTop),
      };
    case "below":
      return {
        left: clamp(centeredLeft, GUIDE_MARGIN, maxLeft),
        top: clamp(target.rect.bottom + GUIDE_GAP, GUIDE_MARGIN, maxTop),
      };
    case "left":
      return {
        left: clamp(target.rect.left - card.width - GUIDE_GAP, GUIDE_MARGIN, maxLeft),
        top: clamp(centeredTop, GUIDE_MARGIN, maxTop),
      };
  }
}

export function LauncherGuide({
  active,
  containerRef,
  steps,
  onComplete,
  onSkip,
  onTargetChange,
  onStepChange,
  stepCompletion,
}: LauncherGuideProps) {
  const tr = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [target, setTarget] = useState<TargetSnapshot | null>(null);
  const [cardSize, setCardSize] = useState<CardSize>({
    width: 380,
    height: 292,
    contentWidth: 338,
    previewHeight: 280,
  });
  const [sceneMeasurement, setSceneMeasurement] = useState<GuideSceneMeasurement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<HTMLSpanElement | null>(null);
  const replicaRef = useRef<HTMLDivElement | null>(null);
  const targetSelectorRef = useRef<string | null>(null);
  const revealedStepRef = useRef<string | null>(null);
  const currentStep = steps[stepIndex] ?? null;
  const onSceneHeightChange = useCallback(
    (height: number) => {
      if (!currentStep) return;
      setSceneMeasurement((previous) => measureGuideScene(previous, currentStep.id, height));
    },
    [currentStep],
  );

  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      setTarget(null);
      setSceneMeasurement(null);
      targetSelectorRef.current = null;
      revealedStepRef.current = null;
      onTargetChange?.(null);
      return;
    }
    if (stepIndex >= steps.length) setStepIndex(0);
  }, [active, onTargetChange, stepIndex, steps.length]);

  useEffect(() => {
    if (!active || !currentStep) return;
    setTarget(null);
    revealedStepRef.current = null;
    onStepChange?.(currentStep, stepIndex);
  }, [active, currentStep, onStepChange, stepIndex]);

  useEffect(() => {
    if (!active || !currentStep) return;
    const root = containerRef.current;
    if (!root) return;

    let frame: number | null = null;
    let observedTarget: HTMLElement | null = null;
    const resizeObserver = new ResizeObserver(() => scheduleUpdate());

    const update = () => {
      frame = null;
      const found = findTarget(root, currentStep.targets);
      if (!found) {
        setTarget(null);
        if (targetSelectorRef.current !== null) {
          targetSelectorRef.current = null;
          onTargetChange?.(null);
        }
        return;
      }

      if (revealedStepRef.current !== currentStep.id) {
        revealedStepRef.current = currentStep.id;
        revealTargetInScrollArea(root, found.element);
      }

      if (found.element !== observedTarget) {
        if (observedTarget) resizeObserver.unobserve(observedTarget);
        observedTarget = found.element;
        resizeObserver.observe(found.element);
      }

      const rootRect = root.getBoundingClientRect();
      const elementRect = found.element.getBoundingClientRect();
      const rect = {
        left: elementRect.left - rootRect.left,
        top: elementRect.top - rootRect.top,
        right: elementRect.right - rootRect.left,
        bottom: elementRect.bottom - rootRect.top,
        width: elementRect.width,
        height: elementRect.height,
      };

      setTarget((previous) => {
        if (
          previous?.stepId === currentStep.id &&
          previous?.element === found.element &&
          previous.selector === found.selector &&
          rectsMatch(previous.rect, rect) &&
          Math.abs(previous.rootWidth - rootRect.width) < 0.5 &&
          Math.abs(previous.rootHeight - rootRect.height) < 0.5
        ) {
          return previous;
        }
        return {
          stepId: currentStep.id,
          element: found.element,
          selector: found.selector,
          rect,
          rootWidth: rootRect.width,
          rootHeight: rootRect.height,
        };
      });

      if (targetSelectorRef.current !== found.selector) {
        targetSelectorRef.current = found.selector;
        onTargetChange?.(found.selector);
      }
    };

    const scheduleUpdate = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    const mutationObserver = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(record.target instanceof Element) || !record.target.closest(".launcher-guide-layer"),
        )
      )
        scheduleUpdate();
    });
    mutationObserver.observe(root, { subtree: true, childList: true, attributes: true });
    resizeObserver.observe(root);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    scheduleUpdate();

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [active, containerRef, currentStep, onTargetChange]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!active || !card) return;
    const measure = () => {
      const style = window.getComputedStyle(card);
      const contentWidth =
        card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const stageHeight = stageRef.current?.offsetHeight ?? 0;
      const surroundingHeight = card.offsetHeight - stageHeight;
      const rootHeight = containerRef.current?.clientHeight ?? window.innerHeight;
      const next = {
        width: card.offsetWidth,
        height: card.offsetHeight,
        contentWidth,
        previewHeight: Math.max(50, rootHeight - GUIDE_MARGIN * 2 - surroundingHeight),
      };
      setCardSize((previous) =>
        Object.keys(next).every(
          (key) => previous[key as keyof CardSize] === next[key as keyof CardSize],
        )
          ? previous
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [
    active,
    containerRef,
    currentStep?.id,
    target?.element,
    sceneMeasurement?.stepId,
    sceneMeasurement?.viewportHeight,
  ]);

  useEffect(() => {
    const holder = replicaRef.current;
    if (!active || !holder || !target || !currentStep?.showPreview || currentStep.scene) {
      holder?.replaceChildren();
      return;
    }
    const previewTarget = resolvePreviewTarget(
      target,
      currentStep.previewTargetSelector,
      currentStep.previewWidth,
    );
    const desiredZoom = currentStep?.zoom ?? 1.28;
    const { scale } = guidePreviewLayout({
      contentWidth: cardSize.contentWidth,
      availableHeight: cardSize.previewHeight,
      previewWidth: previewTarget.rect.width,
      previewHeight: previewTarget.rect.height,
      zoom: desiredZoom,
    });
    const clone = mountTargetReplica(holder, previewTarget, scale);
    const selector = currentStep?.previewValueSelector ?? "[data-guide-value]";
    const valueNode = clone.matches(selector) ? clone : clone.querySelector<HTMLElement>(selector);
    const previewValue = currentStep.previewValue;
    const demoAction =
      currentStep.demoAction ?? (currentStep.animation === "typewriter" ? "type" : undefined);
    const actions: GuideAction[] = [{ kind: "wait", duration: 350 }];
    const demoNode = findDemoNode(
      clone,
      currentStep.demoTargetSelector ?? (demoAction === "type" ? selector : undefined),
    );
    if (demoAction === "select") prepareSelectDemo(clone, currentStep.demoTargetSelector);
    if (demoAction && demoNode) {
      demoNode.dataset.guideDemoControl = "true";
      const control = "[data-guide-demo-control]";
      actions.push({ kind: "move", target: control, duration: 550 });
      actions.push({
        kind: "press",
        target: control,
        activate: () => {
          if (demoAction !== "type")
            activateDemoNode(
              clone,
              demoAction,
              currentStep.demoTargetSelector,
              currentStep.demoResultSelector,
              currentStep.demoResultText,
            );
        },
      });
      if (demoAction === "type" && valueNode && previewValue !== undefined) {
        setDemoNodeValue(valueNode, "");
        actions.push({
          kind: "type",
          target: control,
          value: previewValue,
          onChange: (value) => {
            setDemoNodeValue(valueNode, value);
            valueNode.classList.add("launcher-guide-typing-value");
          },
        });
      }
    }
    actions.push({ kind: "wait", duration: 1_300 });
    const stop =
      stageRef.current && pointerRef.current && demoAction
        ? playGuideDemo(stageRef.current, pointerRef.current, actions)
        : undefined;
    return () => {
      stop?.();
      holder.replaceChildren();
    };
  }, [active, cardSize.contentWidth, cardSize.previewHeight, currentStep, target]);

  useEffect(() => {
    if (!active || !target || target.stepId !== currentStep?.id) return;
    const frame = window.requestAnimationFrame(() =>
      cardRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [active, currentStep?.id, target]);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      event.preventDefault();
      (onSkip ?? onComplete)();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onComplete, onSkip]);

  const layout = useMemo(() => {
    if (!target || !currentStep) return null;
    const placement = getPlacement(currentStep.placement ?? "auto", target, cardSize);
    const cardPosition = getCardPosition(placement, target, cardSize);
    return { placement, cardPosition };
  }, [cardSize, currentStep, target]);

  if (!active || !currentStep || !target || target.stepId !== currentStep.id || !layout) {
    return null;
  }

  const desiredZoom = currentStep.zoom ?? 1.28;
  const sceneSize = currentStep.scene
    ? getLauncherGuideSceneSize(currentStep.scene, target.element)
    : null;
  const previewTarget = currentStep.scene
    ? target
    : resolvePreviewTarget(target, currentStep.previewTargetSelector, currentStep.previewWidth);
  const previewWidth = sceneSize?.width ?? previewTarget.rect.width;
  const previewHeight =
    (currentStep.scene && sceneMeasurement?.stepId === currentStep.id
      ? sceneMeasurement.viewportHeight
      : sceneSize?.height) ?? previewTarget.rect.height;
  const {
    scale: replicaScale,
    gridWidth,
    gridHeight,
    cell: gridCellSize,
  } = guidePreviewLayout({
    contentWidth: cardSize.contentWidth,
    availableHeight: cardSize.previewHeight,
    previewWidth,
    previewHeight,
    zoom:
      currentStep.scene?.kind === "choice" || currentStep.scene?.kind === "play" || !sceneSize
        ? desiredZoom
        : 1,
  });
  const spotlightPadding = currentStep.spotlightPadding ?? 8;
  const spotlightLeft = target.rect.left - spotlightPadding;
  const spotlightTop = target.rect.top - spotlightPadding;
  const spotlightRight = target.rect.right + spotlightPadding;
  const spotlightBottom = target.rect.bottom + spotlightPadding;
  const tailOffset =
    layout.placement === "above" || layout.placement === "below"
      ? target.rect.left + target.rect.width / 2 - layout.cardPosition.left
      : target.rect.top + target.rect.height / 2 - layout.cardPosition.top;
  const isLastStep = stepIndex === steps.length - 1;
  const canAdvance = stepCompletion?.[currentStep.id] ?? true;
  const stepNumber = String(stepIndex + 1).padStart(2, "0");
  const stepCount = String(steps.length).padStart(2, "0");

  return (
    <div
      ref={layerRef}
      className="launcher-guide-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`launcher-guide-title-${currentStep.id}`}
      data-guide-step={currentStep.id}
    >
      <div
        className="launcher-guide-dim launcher-guide-dim--top"
        style={{ height: Math.max(0, spotlightTop) }}
        aria-hidden="true"
      />
      <div
        className="launcher-guide-dim launcher-guide-dim--left"
        style={{
          top: spotlightTop,
          width: Math.max(0, spotlightLeft),
          height: spotlightBottom - spotlightTop,
        }}
        aria-hidden="true"
      />
      <div
        className="launcher-guide-dim launcher-guide-dim--right"
        style={{
          left: spotlightRight,
          top: spotlightTop,
          width: Math.max(0, target.rootWidth - spotlightRight),
          height: spotlightBottom - spotlightTop,
        }}
        aria-hidden="true"
      />
      <div
        className="launcher-guide-dim launcher-guide-dim--bottom"
        style={{ top: spotlightBottom }}
        aria-hidden="true"
      />

      <svg
        className="launcher-guide-connector"
        width={target.rootWidth}
        height={target.rootHeight}
        viewBox={`0 0 ${target.rootWidth} ${target.rootHeight}`}
        aria-hidden="true"
      >
        <rect
          className="launcher-guide-spotlight-rect"
          x={spotlightLeft + 1}
          y={spotlightTop + 1}
          width={Math.max(0, target.rect.width + spotlightPadding * 2 - 2)}
          height={Math.max(0, target.rect.height + spotlightPadding * 2 - 2)}
        />
      </svg>

      <div
        ref={cardRef}
        className={`launcher-guide-card launcher-guide-card--${layout.placement}`}
        tabIndex={-1}
        style={
          {
            left: layout.cardPosition.left,
            top: layout.cardPosition.top,
            "--launcher-guide-tail-offset": `${tailOffset}px`,
          } as CSSProperties
        }
      >
        <div className="launcher-guide-card-heading">
          <span>{currentStep.eyebrow}</span>
          <span>
            {stepNumber} / {stepCount}
          </span>
        </div>
        <div className="launcher-guide-step-progress" aria-hidden="true">
          <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>
        <h2 id={`launcher-guide-title-${currentStep.id}`}>{currentStep.title}</h2>

        {currentStep.showPreview ? (
          <div
            ref={stageRef}
            className={`launcher-guide-replica-stage launcher-guide-replica-stage--${
              currentStep.animation ?? "typewriter"
            }${currentStep.scene ? ` launcher-guide-replica-stage--scene-${currentStep.scene.kind}` : ""}`}
            style={
              {
                "--launcher-guide-replica-width": `${previewWidth * replicaScale}px`,
                "--launcher-guide-replica-height": `${previewHeight * replicaScale}px`,
                "--launcher-guide-replica-scale": replicaScale,
                "--launcher-guide-grid-cell": `${gridCellSize}px`,
                "--launcher-guide-grid-width": `${gridWidth}px`,
                "--launcher-guide-grid-height": `${gridHeight}px`,
              } as CSSProperties
            }
            aria-hidden="true"
            inert
          >
            <span className="launcher-guide-grid-lines" />
            {currentStep.scene && sceneSize ? (
              <div
                className="launcher-guide-scene-viewport"
                style={{
                  width: sceneSize.width * replicaScale,
                  height: previewHeight * replicaScale,
                }}
              >
                <div
                  className="launcher-guide-scene-scale-frame"
                  style={{
                    width: sceneSize.width,
                    height: previewHeight,
                    transform: `scale(${replicaScale})`,
                  }}
                >
                  <LauncherGuideDemoScene
                    key={currentStep.id}
                    scene={currentStep.scene}
                    sourceElement={target.element}
                    onHeightChange={onSceneHeightChange}
                  />
                </div>
              </div>
            ) : (
              <div ref={replicaRef} className="launcher-guide-replica" />
            )}
            {!currentStep.scene && (currentStep.showPointer || currentStep.demoAction) ? (
              <GuidePointer pointerRef={pointerRef} />
            ) : null}
          </div>
        ) : (
          <div ref={replicaRef} hidden />
        )}

        <p>{currentStep.description}</p>
        <div className="launcher-guide-actions">
          <button
            className="launcher-guide-skip"
            type="button"
            onClick={() => (onSkip ?? onComplete)()}
          >
            {tr("launcherGuide.skip")}
          </button>
          <div className="launcher-guide-step-actions">
            {stepIndex > 0 ? (
              <button
                className="launcher-guide-back"
                type="button"
                onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
              >
                <span aria-hidden="true">←</span>
                {tr("launcherGuide.back")}
              </button>
            ) : null}
            <button
              className="launcher-guide-next"
              type="button"
              disabled={!canAdvance}
              onClick={() => {
                if (isLastStep) onComplete();
                else setStepIndex((index) => index + 1);
              }}
            >
              {isLastStep ? tr("launcherGuide.done") : tr("launcherGuide.next")}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
