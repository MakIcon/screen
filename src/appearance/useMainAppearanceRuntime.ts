import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  APPEARANCE_ELEMENT_PICKED_EVENT,
  APPEARANCE_ELEMENT_PICK_CANCEL_EVENT,
  APPEARANCE_ELEMENT_PICK_REQUEST_EVENT,
  APPEARANCE_ELEMENT_PREVIEW_EVENT,
  APPEARANCE_ELEMENT_REVEAL_EVENT,
  APPEARANCE_ELEMENT_SELECTION_EVENT,
  APPEARANCE_DRAWING_CURSOR_EVENT,
  APPEARANCE_WINDOW_ANIMATION_PREVIEW_EVENT,
  applyElementAppearanceOverrides,
  beginElementPicker,
  resolveElementTarget,
  type AppearanceElementPreviewPayload,
  type AppearanceElementSelectionPayload,
  type DrawingCursorPayload,
  type WindowAnimationPreviewPayload,
} from "./elementOverrides";
import type {
  AppearanceElementInteractionState,
  AppearanceElementTarget,
  AppearanceProfile,
} from "./types";

const HOVER_PREVIEW_OPACITY_PROPERTY = "--appearance-preview-element-opacity";
import type { TabKey } from "../types";
import { APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE } from "../utils/placeholders";
import { useLiquidGlassEffects } from "./useLiquidGlassEffects";
import { canvasUiMutationAffectsCapture } from "./canvasUiRuntime";

type MainAppearanceRuntimeOptions = {
  rootRef: RefObject<HTMLElement | null>;
  appearance: AppearanceProfile;
  activeTab: TabKey;
  onAnimationPreview: (payload: WindowAnimationPreviewPayload) => void;
  onRevealTarget: (target: AppearanceElementTarget) => void;
  onDrawingCursor: (payload: DrawingCursorPayload) => void;
};

export function useMainAppearanceRuntime({
  rootRef,
  appearance,
  activeTab,
  onAnimationPreview,
  onRevealTarget,
  onDrawingCursor,
}: MainAppearanceRuntimeOptions) {
  const pickerCleanupRef = useRef<(() => void) | null>(null);
  const appearanceRef = useRef(appearance);
  const selectionTargetsRef = useRef<AppearanceElementTarget[]>([]);
  const selectionPreviewStateRef = useRef<AppearanceElementInteractionState>("normal");
  const selectedElementsRef = useRef<HTMLElement[]>([]);
  const [liveElementOverrides, setLiveElementOverrides] = useState(appearance.elementOverrides);
  useLiquidGlassEffects(rootRef, appearanceRef.current.customized ? liveElementOverrides : []);

  const applySelectedElements = useCallback(
    (targets: AppearanceElementTarget[], previewState = selectionPreviewStateRef.current) => {
      selectedElementsRef.current.forEach((element) => {
        element.classList.remove(
          "appearance-pick-selected",
          "appearance-hover-preview",
          "appearance-pressed-preview",
          "appearance-focus-preview",
          "appearance-disabled-preview",
          "appearance-selected-preview",
        );
        element.style.removeProperty(HOVER_PREVIEW_OPACITY_PROPERTY);
      });
      const root = rootRef.current;
      if (!root) {
        selectedElementsRef.current = [];
        return;
      }

      selectedElementsRef.current = targets.flatMap((target) => {
        if (target.tab && target.tab !== activeTab) return [];
        const element = resolveElementTarget(root, target);
        if (!element) return [];
        element.classList.add("appearance-pick-selected");
        if (previewState !== "normal") {
          element.classList.add(`appearance-${previewState}-preview`);
        }
        if (previewState === "hover") {
          const inheritedHoverOpacity =
            target.defaults?.hoverElementOpacity ?? target.defaults?.elementOpacity;
          if (inheritedHoverOpacity !== undefined) {
            element.style.setProperty(
              HOVER_PREVIEW_OPACITY_PROPERTY,
              String(inheritedHoverOpacity),
            );
          }
        }
        return [element];
      });
    },
    [activeTab, rootRef],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    appearanceRef.current = appearance;
    setLiveElementOverrides(appearance.elementOverrides);
    applyElementAppearanceOverrides(root, appearance.customized ? appearance.elementOverrides : []);
  }, [appearance, rootRef]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<AppearanceElementPreviewPayload>(APPEARANCE_ELEMENT_PREVIEW_EVENT, (event) => {
      const root = rootRef.current;
      if (!root) return;
      const current = appearanceRef.current;
      const preview = {
        ...current,
        customized: event.payload.customized,
        elementOverrides: event.payload.elementOverrides,
      };
      appearanceRef.current = preview;
      setLiveElementOverrides(preview.elementOverrides);
      applyElementAppearanceOverrides(root, preview.customized ? preview.elementOverrides : []);
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [rootRef]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const current = appearanceRef.current;
        applyElementAppearanceOverrides(root, current.customized ? current.elementOverrides : []);
        applySelectedElements(selectionTargetsRef.current);
      });
    };

    const observer = new MutationObserver((mutations) => {
      const current = appearanceRef.current;
      const hasTextOverrides =
        current.customized &&
        current.elementOverrides.some((override) => override.text !== undefined);
      const relevant = mutations.some(
        (mutation) =>
          canvasUiMutationAffectsCapture(mutation) &&
          (mutation.type === "childList" ||
            (hasTextOverrides &&
              (mutation.type === "characterData" || mutation.type === "attributes"))),
      );
      if (relevant) sync();
    });
    observer.observe(root, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE],
      subtree: true,
    });
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [applySelectedElements, rootRef]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      applySelectedElements(selectionTargetsRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, applySelectedElements]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void Promise.all([
      listen(APPEARANCE_ELEMENT_PICK_REQUEST_EVENT, () => {
        const root = rootRef.current;
        if (!root) return;
        pickerCleanupRef.current?.();
        pickerCleanupRef.current = beginElementPicker(
          root,
          (target: AppearanceElementTarget, additive: boolean, continuing: boolean) => {
            if (!continuing) pickerCleanupRef.current = null;
            void emit(APPEARANCE_ELEMENT_PICKED_EVENT, { target, additive, continuing }).catch(
              () => {},
            );
          },
          () => {
            pickerCleanupRef.current = null;
            void emit(APPEARANCE_ELEMENT_PICKED_EVENT, null).catch(() => {});
          },
          activeTab,
        );
      }),
      listen(APPEARANCE_ELEMENT_PICK_CANCEL_EVENT, () => {
        pickerCleanupRef.current?.();
        pickerCleanupRef.current = null;
      }),
      listen<WindowAnimationPreviewPayload>(APPEARANCE_WINDOW_ANIMATION_PREVIEW_EVENT, (event) =>
        onAnimationPreview(event.payload),
      ),
      listen<AppearanceElementTarget>(APPEARANCE_ELEMENT_REVEAL_EVENT, (event) =>
        onRevealTarget(event.payload),
      ),
      listen<AppearanceElementSelectionPayload>(APPEARANCE_ELEMENT_SELECTION_EVENT, (event) => {
        selectionTargetsRef.current = event.payload.targets;
        selectionPreviewStateRef.current =
          event.payload.previewState ?? (event.payload.previewHover ? "hover" : "normal");
        applySelectedElements(event.payload.targets, selectionPreviewStateRef.current);
      }),
      listen<DrawingCursorPayload>(APPEARANCE_DRAWING_CURSOR_EVENT, (event) =>
        onDrawingCursor(event.payload),
      ),
    ])
      .then((disposers) => {
        const disposeAll = () => disposers.forEach((dispose) => dispose());
        if (disposed) disposeAll();
        else unlisten = disposeAll;
      })
      .catch(() => {
        // The browser-only preview has no cross-window Tauri event bridge.
      });

    return () => {
      disposed = true;
      unlisten?.();
      pickerCleanupRef.current?.();
      pickerCleanupRef.current = null;
      selectedElementsRef.current.forEach((element) => {
        element.classList.remove(
          "appearance-pick-selected",
          "appearance-hover-preview",
          "appearance-pressed-preview",
          "appearance-focus-preview",
          "appearance-disabled-preview",
          "appearance-selected-preview",
        );
        element.style.removeProperty(HOVER_PREVIEW_OPACITY_PROPERTY);
      });
      selectedElementsRef.current = [];
    };
  }, [
    activeTab,
    applySelectedElements,
    onAnimationPreview,
    onDrawingCursor,
    onRevealTarget,
    rootRef,
  ]);

  return liveElementOverrides;
}
