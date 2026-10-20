import { toErrorMessage } from "../utils/errors";
import { appearanceText, useAppearanceText } from "./localization";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TAB_ORDER, TAB_TITLE } from "../constants/tabs";
import type { TabKey } from "../types";
import {
  CLOSE_ANIMATIONS,
  OPEN_ANIMATIONS,
  TAB_ANIMATIONS,
  UI_MOTION_STYLES,
  type CloseAnimationId,
  type OpenAnimationId,
  type TabAnimationId,
  type UiMotionStyle,
} from "./animations";
import { DrawingCanvas } from "./DrawingCanvas";
import { ElementBackgroundPicker } from "./ElementBackgroundPicker";
import { ElementTextColorPicker } from "./ElementTextColorPicker";
import { ElementInspector } from "./ElementInspector";
import { CustomFontManager } from "./CustomFontManager";
import { refreshElementSizingTarget } from "./elementSizing";
import {
  appearanceHistoryReducer,
  createAppearanceHistory,
  getAppearanceHistoryShortcut,
} from "./history";
import { prepareBackgroundImage } from "./imageTools";
import { ColorField, RangeField, Section, SelectField } from "./StudioFields";
import { CustomScrollArea } from "../components/layout/CustomScrollArea";
import {
  APPEARANCE_CHANGED_EVENT,
  APPEARANCE_PREVIEW_EVENT,
  DISPLAY_FONT_OPTIONS,
  FONT_OPTIONS,
  applyAppearanceToElement,
  createDefaultAppearance,
  customFontStack,
  readStoredAppearance,
  writeStoredAppearance,
} from "./profile";
import type {
  AppearanceBackgroundKind,
  AppearanceProfile,
  CanvasUiEffectConfig,
  CanvasUiEffectId,
  Theme,
} from "./types";
import type {
  AppearanceElementComponentOverride,
  AppearanceElementHoverEasing,
  AppearanceElementInteractionState,
  AppearanceElementOverride,
  AppearanceElementTarget,
} from "./types";
import {
  APPEARANCE_ELEMENT_PICK_CANCEL_EVENT,
  APPEARANCE_ELEMENT_PICKED_EVENT,
  APPEARANCE_ELEMENT_PICK_REQUEST_EVENT,
  APPEARANCE_ELEMENT_PREVIEW_EVENT,
  APPEARANCE_ELEMENT_REVEAL_EVENT,
  APPEARANCE_ELEMENT_SELECTION_EVENT,
  APPEARANCE_DRAWING_CURSOR_EVENT,
  APPEARANCE_WINDOW_ANIMATION_PREVIEW_EVENT,
  type AppearanceElementPickedPayload,
  type AppearanceElementSelectionPayload,
  type WindowAnimationPreviewPayload,
  type AppearanceElementPreviewPayload,
  type DrawingCursorPayload,
} from "./elementOverrides";
import {
  ELEMENT_INTERACTION_STATES,
  getElementStateStyle,
  hasElementStateStyles,
  mergeElementStateStyle,
  setElementStateStyle,
} from "./elementState";
import { CANVAS_UI_EFFECTS, getCanvasUiEffect } from "./canvasUiCatalog";
import "./AppearanceStudio.css";

type StudioCategory =
  | "background"
  | "colors"
  | "navigation"
  | "shape"
  | "type"
  | "opacity"
  | "motion"
  | "canvas-ui"
  | "element";

type EditorNotice =
  | string
  | { text: string; params?: Record<string, string | number> }
  | { error: unknown };

const CATEGORIES: { id: StudioCategory; index: string; label: string; note: string }[] = [
  { id: "background", index: "01", label: "BACKGROUND", note: "Color, gradient, image or drawing" },
  { id: "colors", index: "02", label: "COLORS", note: "Theme and custom palette" },
  { id: "navigation", index: "03", label: "SIDEBAR", note: "New or original menu items" },
  { id: "shape", index: "04", label: "SHAPE", note: "Corners and rounding" },
  { id: "type", index: "05", label: "TYPOGRAPHY", note: "Interface and display fonts" },
  { id: "opacity", index: "06", label: "OPACITY", note: "Window, panels and controls" },
  { id: "motion", index: "07", label: "MOTION", note: "Transitions and effects" },
  { id: "canvas-ui", index: "08", label: "CANVAS UI", note: "35 GPU canvas components" },
];

const CATEGORY_SEARCH_TERMS: Partial<Record<StudioCategory, string>> = {
  background: "wallpaper picture drawing image gradient",
  colors: "color theme palette accent gradient",
  navigation: "menu tabs navigation",
  shape: "radius corners rounding",
  type: "fonts text typography",
  opacity: "transparency window panels controls",
  motion: "animation transitions effects",
  "canvas-ui": "gpu canvas components effects",
};

function elementStyleBadges(override: AppearanceElementOverride) {
  const badges: { label: string; value: string; color?: string }[] = [];
  if (override.canvasUi?.enabled) {
    badges.push({
      label: "CANVAS UI",
      value: appearanceText(getCanvasUiEffect(override.canvasUi.effect).name),
    });
  }
  if (override.text !== undefined) {
    badges.push({
      label: "LABEL",
      value: override.text.trim() ? override.text.trim().slice(0, 22) : appearanceText("HIDDEN"),
    });
  }
  if (override.style.backgroundOpacity !== undefined) {
    badges.push({
      label: "BACKGROUND",
      value: `${Math.round(override.style.backgroundOpacity * 100)}%`,
    });
  }
  if (override.style.contentOpacity !== undefined) {
    badges.push({
      label: "CONTENT",
      value: `${Math.round(override.style.contentOpacity * 100)}%`,
    });
  } else if (override.style.opacity !== undefined) {
    badges.push({ label: "OPACITY", value: `${Math.round(override.style.opacity * 100)}%` });
  }
  if (override.style.elementOpacity !== undefined) {
    badges.push({
      label: "ELEMENT",
      value: `${Math.round(override.style.elementOpacity * 100)}%`,
    });
  }
  if (override.style.width !== undefined || override.style.height !== undefined) {
    const boxValue = (value: number | undefined) =>
      value === undefined
        ? appearanceText("DEFAULT")
        : value === 0
          ? appearanceText("AUTO")
          : String(value);
    badges.push({
      label: "BOX",
      value: `${boxValue(override.style.width)} × ${boxValue(override.style.height)}`,
    });
  }
  if (override.style.radius !== undefined) {
    badges.push({ label: "RADIUS", value: `${override.style.radius} PX` });
  }
  if (override.style.fontFamily) {
    const font = [...FONT_OPTIONS, ...DISPLAY_FONT_OPTIONS].find(
      (option) => option.value === override.style.fontFamily,
    );
    badges.push({ label: "FONT", value: font?.label || appearanceText("CUSTOM") });
  }
  if (override.style.backgroundColor) {
    badges.push({
      label: "BACKGROUND",
      value: override.style.backgroundColor.toUpperCase(),
      color: override.style.backgroundColor,
    });
  }
  if (override.style.backgroundKind === "gradient") {
    badges.push({ label: "FILL", value: appearanceText("GRADIENT") });
  }
  if (override.style.textKind === "gradient") {
    badges.push({ label: "TEXT", value: appearanceText("GRADIENT") });
  } else if (override.style.textColor) {
    badges.push({
      label: "TEXT",
      value: override.style.textColor.toUpperCase(),
      color: override.style.textColor,
    });
  }
  if (override.style.fontSize !== undefined) {
    badges.push({ label: "SIZE", value: `${override.style.fontSize} PX` });
  }
  if (override.style.borderWidth !== undefined) {
    badges.push({ label: "BORDER", value: `${override.style.borderWidth} PX` });
  }
  if (override.style.shadow && override.style.shadow !== "none") {
    badges.push({ label: "SHADOW", value: appearanceText(override.style.shadow.toUpperCase()) });
  }
  if (override.style.scale !== undefined) {
    badges.push({ label: "SCALE", value: `${Math.round(override.style.scale * 100)}%` });
  }
  if (override.componentSettings) {
    badges.push({
      label: "PROPS",
      value: appearanceText(override.componentSettings.kind.toUpperCase()),
    });
  }
  const customizedStates = ELEMENT_INTERACTION_STATES.filter(
    (state) =>
      state.id !== "normal" &&
      Object.keys(getElementStateStyle(override, state.id) ?? {}).length > 0,
  );
  customizedStates.forEach((state) =>
    badges.push({
      label: state.label,
      value: `${override.stateTransitionMs ?? override.hoverTransitionMs ?? 200} MS`,
    }),
  );
  return badges;
}

export function AppearanceStudioApp() {
  const copy = useAppearanceText();
  const studioWindow = useMemo(() => (isTauri() ? getCurrentWindow() : null), []);
  const [category, setCategory] = useState<StudioCategory>("background");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [draftHistory, dispatchDraftHistory] = useReducer(appearanceHistoryReducer, undefined, () =>
    createAppearanceHistory({
      ...readStoredAppearance(),
      customized: true,
    }),
  );
  const draft = draftHistory.present;
  const canUndo = draftHistory.past.length > 0;
  const canRedo = draftHistory.future.length > 0;
  const [message, setMessage] = useState<EditorNotice>("");
  const [imageBusy, setImageBusy] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<AppearanceElementTarget[]>([]);
  const selectedTarget = selectedTargets[selectedTargets.length - 1] ?? null;
  const [elementInteractionState, setElementInteractionState] =
    useState<AppearanceElementInteractionState>("normal");
  const [pickingElement, setPickingElement] = useState(false);
  const [elementListOpen, setElementListOpen] = useState(false);
  const baseDefaults = useMemo(
    () => createDefaultAppearance(draft.baseTheme, true),
    [draft.baseTheme],
  );
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const originalAppearanceRef = useRef(readStoredAppearance());
  const closingRef = useRef(false);
  const elementPreviewOnlyRef = useRef(false);
  const historyTransactionRef = useRef<{ recorded: boolean } | null>(null);
  const hasUnsavedChanges = useMemo(
    () =>
      JSON.stringify(draft) !==
      JSON.stringify({ ...originalAppearanceRef.current, customized: true }),
    [draft],
  );

  const closeStudio = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    await emit(APPEARANCE_DRAWING_CURSOR_EVENT, {
      visible: false,
      x: 0,
      y: 0,
      size: 2,
      color: "#000000",
      eraser: false,
    } satisfies DrawingCursorPayload).catch(() => {});
    await emit(APPEARANCE_ELEMENT_PICK_CANCEL_EVENT).catch(() => {});
    await emit(APPEARANCE_ELEMENT_SELECTION_EVENT, {
      targets: [],
    } satisfies AppearanceElementSelectionPayload).catch(() => {});
    await emit(APPEARANCE_CHANGED_EVENT, originalAppearanceRef.current).catch(() => {});
    // destroy() closes immediately and does not re-enter onCloseRequested.
    await studioWindow?.destroy();
  }, [studioWindow]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    historyTransactionRef.current = null;
    dispatchDraftHistory({ type: "undo" });
    setMessage("UNDID LAST CHANGE");
  }, [canUndo]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    historyTransactionRef.current = null;
    dispatchDraftHistory({ type: "redo" });
    setMessage("REDID LAST CHANGE");
  }, [canRedo]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const shortcut = getAppearanceHistoryShortcut(event);
      if (!shortcut) return;

      event.preventDefault();
      if (shortcut === "redo") redo();
      else undo();
    };

    window.addEventListener("keydown", handleHistoryShortcut, true);
    return () => window.removeEventListener("keydown", handleHistoryShortcut, true);
  }, [redo, undo]);

  useEffect(() => {
    const finishHistoryTransaction = () => {
      queueMicrotask(() => {
        historyTransactionRef.current = null;
      });
    };

    window.addEventListener("pointerup", finishHistoryTransaction, true);
    window.addEventListener("pointercancel", finishHistoryTransaction, true);
    window.addEventListener("blur", finishHistoryTransaction);
    return () => {
      window.removeEventListener("pointerup", finishHistoryTransaction, true);
      window.removeEventListener("pointercancel", finishHistoryTransaction, true);
      window.removeEventListener("blur", finishHistoryTransaction);
    };
  }, []);

  useLayoutEffect(() => {
    applyAppearanceToElement(document.documentElement, draft);
  }, [draft]);

  useEffect(() => {
    const isElementPreview = elementPreviewOnlyRef.current;
    elementPreviewOnlyRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      if (isElementPreview) {
        void emit(APPEARANCE_ELEMENT_PREVIEW_EVENT, {
          customized: draft.customized,
          elementOverrides: draft.elementOverrides,
        } satisfies AppearanceElementPreviewPayload).catch(() => {});
      } else {
        void emit(APPEARANCE_PREVIEW_EVENT, draft).catch(() => {});
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draft]);

  useEffect(() => {
    void emit(APPEARANCE_ELEMENT_SELECTION_EVENT, {
      targets: selectedTargets,
      previewState: elementInteractionState,
    } satisfies AppearanceElementSelectionPayload).catch(() => {});
  }, [elementInteractionState, selectedTargets]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<AppearanceElementPickedPayload | null>(APPEARANCE_ELEMENT_PICKED_EVENT, (event) => {
      setPickingElement(false);
      const payload = event.payload;
      if (!payload) {
        setMessage("ELEMENT PICK CANCELLED");
        return;
      }
      const wrapped = "target" in payload;
      const target = wrapped ? payload.target : payload;
      const additive = wrapped && payload.additive;
      const continuing = wrapped && Boolean(payload.continuing);
      dispatchDraftHistory({
        type: "replace",
        update: (current) => refreshElementSizingTarget(current, target),
      });
      setSelectedTargets((current) => {
        if (!additive) return [target];
        return current.some((candidate) => candidate.id === target.id)
          ? current
          : [...current, target];
      });
      if (!additive) setElementInteractionState("normal");
      setPickingElement(continuing);
      setCategory("element");
      setElementListOpen(false);
      setMessage(
        continuing
          ? "ELEMENT ADDED · KEEP SHIFT HELD OR CLICK ONCE TO FINISH"
          : additive
            ? "MULTI-SELECTION FINISHED"
            : { text: "Selected: {target}", params: { target: target.label } },
      );
    })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!studioWindow) return;
    let unlisten: (() => void) | undefined;

    void studioWindow
      .onCloseRequested((event) => {
        event.preventDefault();
        void closeStudio();
      })
      .then((dispose) => {
        unlisten = dispose;
      });

    return () => unlisten?.();
  }, [closeStudio, studioWindow]);

  const selectedOverride = useMemo(
    () =>
      selectedTarget
        ? draft.elementOverrides.find((override) => override.id === selectedTarget.id)
        : undefined,
    [draft.elementOverrides, selectedTarget],
  );
  const selectedVisualStyle = useMemo(
    () => mergeElementStateStyle(selectedOverride, elementInteractionState),
    [elementInteractionState, selectedOverride],
  );
  const selectedActiveInteractionStyle = getElementStateStyle(
    selectedOverride,
    elementInteractionState,
  );
  const selectedInheritedElementOpacity =
    elementInteractionState === "hover"
      ? (selectedTarget?.defaults?.hoverElementOpacity ??
        selectedTarget?.defaults?.elementOpacity ??
        1)
      : (selectedTarget?.defaults?.elementOpacity ?? 1);
  const selectedEffectiveElementOpacity =
    selectedVisualStyle?.elementOpacity ??
    selectedVisualStyle?.opacity ??
    selectedInheritedElementOpacity;
  const selectedElementOpacitySource =
    selectedActiveInteractionStyle?.elementOpacity !== undefined ||
    selectedActiveInteractionStyle?.opacity !== undefined
      ? ""
      : elementInteractionState !== "normal" &&
          (selectedOverride?.style.elementOpacity !== undefined ||
            selectedOverride?.style.opacity !== undefined)
        ? " · FROM NORMAL"
        : " · LAUNCHER DEFAULT";
  const selectedInteractionCustomized = useMemo(
    () =>
      selectedTargets.some((target) => {
        const override = draft.elementOverrides.find((candidate) => candidate.id === target.id);
        const style = getElementStateStyle(override, elementInteractionState);
        return Boolean(style && Object.keys(style).length > 0);
      }),
    [draft.elementOverrides, elementInteractionState, selectedTargets],
  );
  const activeCanvasUi: CanvasUiEffectConfig = selectedTarget
    ? (selectedOverride?.canvasUi ?? {
        ...draft.canvasUi,
        enabled: false,
        settings: {},
      })
    : draft.canvasUi;

  const patchDraft = useCallback((updater: (current: AppearanceProfile) => AppearanceProfile) => {
    const transaction = historyTransactionRef.current;
    dispatchDraftHistory({
      type: "apply",
      update: (current) => ({ ...updater(current), customized: true }),
      record: !transaction?.recorded,
    });
    if (transaction) transaction.recorded = true;
    setMessage("");
  }, []);

  const patchSelectedStyle = (style: Partial<AppearanceElementOverride["style"]>) => {
    if (selectedTargets.length === 0) return;
    elementPreviewOnlyRef.current = true;
    patchDraft((current) => {
      const selectedIds = new Set(selectedTargets.map((target) => target.id));
      const nextOverrides = current.elementOverrides.filter(
        (override) => !selectedIds.has(override.id),
      );
      for (const target of selectedTargets) {
        const existing = current.elementOverrides.find((override) => override.id === target.id);
        const normalStyle = { ...existing?.style };
        const interactionStyle = {
          ...(elementInteractionState === "normal"
            ? normalStyle
            : getElementStateStyle(existing, elementInteractionState)),
          ...style,
        };
        if (
          elementInteractionState === "normal" &&
          existing?.style.opacity !== undefined &&
          (style.backgroundOpacity !== undefined || style.contentOpacity !== undefined)
        ) {
          interactionStyle.backgroundOpacity ??= existing.style.opacity;
          interactionStyle.contentOpacity ??= existing.style.opacity;
          delete interactionStyle.opacity;
        }
        for (const key of Object.keys(interactionStyle) as (keyof typeof interactionStyle)[]) {
          if (interactionStyle[key] === undefined) delete interactionStyle[key];
        }
        const next: AppearanceElementOverride = {
          ...existing,
          ...target,
          style: normalStyle,
        };
        setElementStateStyle(next, elementInteractionState, interactionStyle);
        const hasTextOverride =
          existing !== undefined && Object.prototype.hasOwnProperty.call(existing, "text");
        if (
          Object.keys(next.style).length > 0 ||
          hasElementStateStyles(next) ||
          hasTextOverride ||
          existing?.componentSettings ||
          existing?.canvasUi
        ) {
          nextOverrides.push(next);
        }
      }
      return {
        ...current,
        elementOverrides: nextOverrides,
      };
    });
  };

  const patchSelectedStateTransition = (patch: {
    stateTransitionMs?: number;
    stateEasing?: AppearanceElementHoverEasing;
  }) => {
    if (selectedTargets.length === 0) return;
    elementPreviewOnlyRef.current = true;
    patchDraft((current) => {
      const selectedIds = new Set(selectedTargets.map((target) => target.id));
      const nextOverrides = current.elementOverrides.filter(
        (override) => !selectedIds.has(override.id),
      );
      for (const target of selectedTargets) {
        const existing = current.elementOverrides.find((override) => override.id === target.id);
        nextOverrides.push({
          ...existing,
          ...target,
          style: existing?.style ?? {},
          ...(patch.stateTransitionMs !== undefined
            ? { stateTransitionMs: patch.stateTransitionMs }
            : {}),
          ...(patch.stateEasing ? { stateEasing: patch.stateEasing } : {}),
        });
      }
      return { ...current, elementOverrides: nextOverrides };
    });
  };

  const patchSelectedText = useCallback(
    (text: string | undefined) => {
      if (!selectedTarget?.textTarget) return;
      elementPreviewOnlyRef.current = true;
      patchDraft((current) => {
        const existing = current.elementOverrides.find(
          (override) => override.id === selectedTarget.id,
        );
        const next: AppearanceElementOverride = {
          ...existing,
          ...selectedTarget,
          style: existing?.style ?? {},
          ...(text !== undefined ? { text } : {}),
        };
        if (text === undefined) delete next.text;
        if (
          text === undefined &&
          Object.keys(next.style).length === 0 &&
          !hasElementStateStyles(next) &&
          !next.componentSettings &&
          !next.canvasUi
        ) {
          return {
            ...current,
            elementOverrides: current.elementOverrides.filter(
              (override) => override.id !== selectedTarget.id,
            ),
          };
        }
        return {
          ...current,
          elementOverrides: [
            ...current.elementOverrides.filter((override) => override.id !== selectedTarget.id),
            next,
          ],
        };
      });
    },
    [patchDraft, selectedTarget],
  );

  const patchSelectedComponent = (componentSettings: AppearanceElementComponentOverride) => {
    if (!selectedTarget?.component || selectedTarget.component.kind !== componentSettings.kind)
      return;
    elementPreviewOnlyRef.current = true;
    patchDraft((current) => {
      const existing = current.elementOverrides.find(
        (override) => override.id === selectedTarget.id,
      );
      const next: AppearanceElementOverride = {
        ...existing,
        ...selectedTarget,
        style: existing?.style ?? {},
        componentSettings,
      };
      return {
        ...current,
        elementOverrides: [
          ...current.elementOverrides.filter((override) => override.id !== selectedTarget.id),
          next,
        ],
      };
    });
  };

  const patchCanvasUi = (updater: (config: CanvasUiEffectConfig) => CanvasUiEffectConfig) => {
    if (selectedTargets.length === 0) {
      patchDraft((current) => ({ ...current, canvasUi: updater(current.canvasUi) }));
      return;
    }
    elementPreviewOnlyRef.current = true;
    patchDraft((current) => {
      const selectedIds = new Set(selectedTargets.map((target) => target.id));
      const nextOverrides = current.elementOverrides.filter(
        (override) => !selectedIds.has(override.id),
      );
      for (const target of selectedTargets) {
        const existing = current.elementOverrides.find((override) => override.id === target.id);
        const base = existing?.canvasUi ?? {
          ...current.canvasUi,
          enabled: false,
          settings: {},
        };
        nextOverrides.push({
          ...existing,
          ...target,
          style: existing?.style ?? {},
          canvasUi: updater(base),
        });
      }
      return { ...current, elementOverrides: nextOverrides };
    });
  };

  const requestElementPick = () => {
    setElementListOpen(false);
    setCategory("element");
    setPickingElement(true);
    setMessage("CLICK AN ELEMENT IN THE MAIN LAUNCHER");
    void emit(APPEARANCE_ELEMENT_PICK_REQUEST_EVENT).catch(() => {
      setPickingElement(false);
      setMessage("COULD NOT START ELEMENT PICKER");
    });
  };

  const selectWholeLauncher = () => {
    setElementListOpen(false);
    setSelectedTargets([]);
    setElementInteractionState("normal");
    if (category === "element") setCategory("background");
    setPickingElement(false);
    setMessage("");
    void emit(APPEARANCE_ELEMENT_PICK_CANCEL_EVENT).catch(() => {});
  };

  const clearSelectedStyle = () => {
    if (selectedTargets.length === 0) return;
    elementPreviewOnlyRef.current = true;
    const selectedIds = new Set(selectedTargets.map((target) => target.id));
    const clearsLastOverride = draft.elementOverrides.every((override) =>
      selectedIds.has(override.id),
    );
    patchDraft((current) => ({
      ...current,
      elementOverrides: current.elementOverrides.filter(
        (override) => !selectedIds.has(override.id),
      ),
    }));
    if (clearsLastOverride) setElementListOpen(false);
    setMessage("ELEMENT STYLE CLEARED");
  };

  const clearSelectedInteractionStyle = () => {
    if (selectedTargets.length === 0) return;
    elementPreviewOnlyRef.current = true;
    const selectedIds = new Set(selectedTargets.map((target) => target.id));
    patchDraft((current) => ({
      ...current,
      elementOverrides: current.elementOverrides.flatMap((override) => {
        if (!selectedIds.has(override.id)) return [override];
        const next: AppearanceElementOverride = { ...override };
        setElementStateStyle(next, elementInteractionState, undefined);
        const hasTextOverride = Object.prototype.hasOwnProperty.call(next, "text");
        return Object.keys(next.style).length > 0 ||
          hasElementStateStyles(next) ||
          hasTextOverride ||
          next.componentSettings ||
          next.canvasUi
          ? [next]
          : [];
      }),
    }));
    setMessage({
      text: "{state} style cleared",
      params: { state: elementInteractionState.toUpperCase() },
    });
  };

  const previewWindowAnimation = (payload: WindowAnimationPreviewPayload) => {
    void emit(APPEARANCE_WINDOW_ANIMATION_PREVIEW_EVENT, payload).catch(() => {});
  };

  const previewDrawingCursor = (payload: DrawingCursorPayload) => {
    void emit(APPEARANCE_DRAWING_CURSOR_EVENT, payload).catch(() => {});
  };

  const openElementList = () => {
    setElementListOpen(true);
    setPickingElement(false);
    void emit(APPEARANCE_ELEMENT_PICK_CANCEL_EVENT).catch(() => {});
    previewDrawingCursor({
      visible: false,
      x: 0,
      y: 0,
      size: 2,
      color: "#000000",
      eraser: false,
    });
  };

  const revealElement = (override: AppearanceElementOverride) => {
    setSelectedTargets([override]);
    setElementInteractionState("normal");
    setCategory("element");
    setElementListOpen(false);
    setMessage({ text: "Locating: {target}", params: { target: override.label } });
    void emit(APPEARANCE_ELEMENT_REVEAL_EVENT, override).catch(() => {
      setMessage("COULD NOT LOCATE ELEMENT");
    });
  };

  const selectCategory = (nextCategory: StudioCategory) => {
    setElementListOpen(false);
    setCategory(nextCategory);
    if (nextCategory !== "background") {
      void emit(APPEARANCE_DRAWING_CURSOR_EVENT, {
        visible: false,
        x: 0,
        y: 0,
        size: 2,
        color: "#000000",
        eraser: false,
      } satisfies DrawingCursorPayload).catch(() => {});
    }
    window.requestAnimationFrame(() => controlsRef.current?.parentElement?.scrollTo({ top: 0 }));
  };

  const selectBaseTheme = (baseTheme: Theme) => {
    const base = createDefaultAppearance(baseTheme, true);
    patchDraft((current) => ({
      ...current,
      baseTheme,
      colors: base.colors,
    }));
  };

  const selectBackgroundKind = (kind: AppearanceBackgroundKind) => {
    patchDraft((current) => ({
      ...current,
      background: { ...current.background, kind },
    }));
    if (kind !== "drawing") {
      previewDrawingCursor({
        visible: false,
        x: 0,
        y: 0,
        size: 2,
        color: "#000000",
        eraser: false,
      });
    }
  };

  const setLegacySidebarTabs = (legacyTabs: TabKey[]) => {
    patchDraft((current) => ({
      ...current,
      navigation: { legacyTabs },
    }));
  };

  const toggleLegacySidebarTab = (tab: TabKey) => {
    const legacyTabs = draft.navigation.legacyTabs.includes(tab)
      ? draft.navigation.legacyTabs.filter((candidate) => candidate !== tab)
      : TAB_ORDER.filter(
          (candidate) => candidate === tab || draft.navigation.legacyTabs.includes(candidate),
        );
    setLegacySidebarTabs(legacyTabs);
  };

  const save = () => {
    try {
      const saved = writeStoredAppearance({ ...draft, customized: true });
      originalAppearanceRef.current = saved;
      dispatchDraftHistory({ type: "replace", update: () => saved });
      void emit(APPEARANCE_CHANGED_EVENT, saved).catch(() => {});
      setMessage("SAVED AND APPLIED TO LAUNCHER");
    } catch (error) {
      setMessage({ error });
    }
  };

  const reset = () => {
    dispatchDraftHistory({
      type: "apply",
      update: () => createDefaultAppearance(draft.baseTheme, true),
    });
    setSelectedTargets([]);
    setElementInteractionState("normal");
    setElementListOpen(false);
    setMessage("DEFAULTS PREVIEWED · SAVE TO APPLY");
  };

  const discard = () => {
    dispatchDraftHistory({
      type: "apply",
      update: () => ({ ...originalAppearanceRef.current, customized: true }),
    });
    setSelectedTargets([]);
    setElementInteractionState("normal");
    setElementListOpen(false);
    setMessage("UNSAVED CHANGES DISCARDED");
  };

  const chooseImage = async (file: File | undefined) => {
    if (!file) return;
    setImageBusy(true);
    setMessage("");
    try {
      const image = await prepareBackgroundImage(file);
      patchDraft((current) => ({
        ...current,
        background: {
          ...current.background,
          kind: "image",
          imageDataUrl: image.dataUrl,
          imageName: image.name,
        },
      }));
    } catch (error) {
      setMessage({ error });
    } finally {
      setImageBusy(false);
    }
  };

  const renderEditor = () => {
    switch (category) {
      case "canvas-ui": {
        const activeEffect = getCanvasUiEffect(activeCanvasUi.effect);
        const categories = ["surface", "motion", "atmosphere", "retro", "object"] as const;
        const chooseEffect = (effect: CanvasUiEffectId) =>
          patchCanvasUi((current) => ({
            ...current,
            enabled: true,
            effect,
            renderer:
              current.renderer === "webgpu" && effect !== "liquid" ? "webgl" : current.renderer,
          }));
        const activeSettings = activeCanvasUi.settings[activeCanvasUi.effect] ?? {};
        const setEffectSetting = (key: string, value: number | boolean | string) =>
          patchCanvasUi((current) => ({
            ...current,
            settings: {
              ...current.settings,
              [activeCanvasUi.effect]: {
                ...current.settings[activeCanvasUi.effect],
                [key]: value,
              },
            },
          }));

        return (
          <>
            <Section
              title={copy("CANVAS UI ENGINE")}
              note={copy(
                "Every effect is scoped to the current target. Picked elements get their own renderer and settings; WHOLE LAUNCHER remains a separate global layer.",
              )}
            >
              <div className="canvas-ui-target-chip">
                <span>{selectedTarget ? copy("ELEMENT TARGET") : copy("GLOBAL TARGET")}</span>
                <strong>
                  {selectedTargets.length > 1
                    ? copy("{count} picked elements", { count: selectedTargets.length })
                    : selectedTarget?.label || copy("WHOLE LAUNCHER")}
                </strong>
              </div>
              <div className="studio-segmented">
                <button
                  type="button"
                  className={activeCanvasUi.enabled ? "active" : ""}
                  onClick={() =>
                    patchCanvasUi((current) => ({
                      ...current,
                      enabled: true,
                    }))
                  }
                >
                  {copy("ENABLED")}
                </button>
                <button
                  type="button"
                  className={!activeCanvasUi.enabled ? "active" : ""}
                  onClick={() =>
                    patchCanvasUi((current) => ({
                      ...current,
                      enabled: false,
                    }))
                  }
                >
                  {copy("DISABLED")}
                </button>
              </div>
              <div className="studio-segmented">
                <button
                  type="button"
                  className={activeCanvasUi.renderer === "webgl" ? "active" : ""}
                  onClick={() =>
                    patchCanvasUi((current) => ({
                      ...current,
                      renderer: "webgl",
                    }))
                  }
                >
                  {copy("WEBGL · COMPATIBLE")}
                </button>
                <button
                  type="button"
                  disabled={activeCanvasUi.effect !== "liquid"}
                  className={activeCanvasUi.renderer === "webgpu" ? "active" : ""}
                  onClick={() =>
                    patchCanvasUi((current) => ({
                      ...current,
                      renderer: "webgpu",
                    }))
                  }
                >
                  {copy("WEBGPU · LIQUID")}
                </button>
              </div>
              <div className="canvas-ui-active-effect">
                <span>{copy("ACTIVE COMPONENT")}</span>
                <strong>{copy(activeEffect.name)}</strong>
                <p>{copy(activeEffect.description)}</p>
                <small>{copy(activeEffect.interaction)}</small>
              </div>
            </Section>

            <Section
              title={copy("{effect} controls", { effect: copy(activeEffect.name) })}
              note={copy(
                "The ranges and defaults come from the component API. Changes update the current target live and are retained when you switch components.",
              )}
            >
              <div className="canvas-ui-controls-heading">
                <span>
                  {activeEffect.controls.length} {copy("PARAMETERS")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    patchCanvasUi((current) => ({
                      ...current,
                      settings: { ...current.settings, [activeEffect.id]: {} },
                    }))
                  }
                >
                  {copy("RESET EFFECT")}
                </button>
              </div>
              <div className="canvas-ui-control-grid">
                {activeEffect.controls.map((control) => {
                  const value = activeSettings[control.key] ?? control.defaultValue;
                  if (control.kind === "range") {
                    return (
                      <div className="canvas-ui-control-card" key={control.key}>
                        <span>{copy(control.group.toUpperCase())}</span>
                        <RangeField
                          label={copy(control.label)}
                          value={Number(value)}
                          min={control.min}
                          max={control.max}
                          step={control.step}
                          suffix={control.suffix}
                          defaultValue={control.defaultValue}
                          onChange={(next) => setEffectSetting(control.key, next)}
                        />
                        {control.hint && <small>{copy(control.hint)}</small>}
                      </div>
                    );
                  }
                  if (control.kind === "color") {
                    return (
                      <div
                        className="canvas-ui-control-card canvas-ui-control-card--color"
                        key={control.key}
                      >
                        <span>{copy(control.group.toUpperCase())}</span>
                        <ColorField
                          label={copy(control.label)}
                          value={String(value)}
                          onChange={(next) => setEffectSetting(control.key, next)}
                        />
                      </div>
                    );
                  }
                  if (control.kind === "select") {
                    return (
                      <div
                        className="canvas-ui-control-card canvas-ui-control-card--select"
                        key={control.key}
                      >
                        <span>{copy(control.group.toUpperCase())}</span>
                        <SelectField
                          label={copy(control.label)}
                          value={String(value)}
                          options={control.options}
                          onChange={(next) => setEffectSetting(control.key, next)}
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      className="canvas-ui-control-card canvas-ui-control-card--toggle"
                      key={control.key}
                    >
                      <span>{copy(control.group.toUpperCase())}</span>
                      <strong>{copy(control.label)}</strong>
                      <div className="studio-segmented">
                        <button
                          type="button"
                          className={value === true ? "active" : ""}
                          onClick={() => setEffectSetting(control.key, true)}
                        >
                          {copy("ON")}
                        </button>
                        <button
                          type="button"
                          className={value === false ? "active" : ""}
                          onClick={() => setEffectSetting(control.key, false)}
                        >
                          {copy("OFF")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            {categories.map((effectCategory) => {
              const effects = CANVAS_UI_EFFECTS.filter(
                (effect) => effect.category === effectCategory,
              );
              return (
                <Section
                  key={effectCategory}
                  title={
                    effectCategory === "object"
                      ? copy("OBJECT COMPONENTS")
                      : copy("{category} effects", { category: copy(effectCategory.toUpperCase()) })
                  }
                  note={
                    effectCategory === "object"
                      ? copy(
                          "Object components overlay an image, SVG, GLB or glTF asset without replacing launcher controls.",
                        )
                      : undefined
                  }
                >
                  <div className="canvas-ui-effect-grid">
                    {effects.map((effect) => (
                      <button
                        type="button"
                        key={effect.id}
                        className={activeCanvasUi.effect === effect.id ? "active" : ""}
                        onClick={() => chooseEffect(effect.id)}
                      >
                        <span>{effect.objectEffect ? copy("3D / ASSET") : copy("LIVE HTML")}</span>
                        <strong>{copy(effect.name)}</strong>
                        <small>{copy(effect.description)}</small>
                      </button>
                    ))}
                  </div>
                </Section>
              );
            })}

            {activeEffect.objectEffect && (
              <Section
                title={copy("OBJECT SOURCE")}
                note={copy(
                  "Paste an HTTPS URL to an SVG, image, GLB or glTF file. With an empty value the launcher uses its bundled icon as a safe preview asset.",
                )}
              >
                <label className="studio-text-field studio-text-field--single-line">
                  <span>{copy("ASSET URL")}</span>
                  <input
                    value={activeCanvasUi.assetUrl}
                    maxLength={2048}
                    spellCheck={false}
                    placeholder={copy("https://example.com/model.glb")}
                    onChange={(event) =>
                      patchCanvasUi((current) => ({
                        ...current,
                        assetUrl: event.target.value,
                      }))
                    }
                  />
                </label>
              </Section>
            )}
          </>
        );
      }

      case "element":
        return (
          <ElementInspector
            target={selectedTarget}
            override={selectedOverride}
            visualStyle={selectedVisualStyle}
            interactionState={elementInteractionState}
            stateTransitionMs={
              selectedOverride?.stateTransitionMs ?? selectedOverride?.hoverTransitionMs ?? 200
            }
            stateEasing={selectedOverride?.stateEasing ?? selectedOverride?.hoverEasing ?? "ease"}
            profile={draft}
            onPick={requestElementPick}
            onStyleChange={patchSelectedStyle}
            onTextChange={patchSelectedText}
            onComponentChange={patchSelectedComponent}
            onStateTransitionChange={patchSelectedStateTransition}
          />
        );

      case "background":
        return (
          <>
            <Section
              title={copy("BACKGROUND SOURCE")}
              note={copy("Choose one layer, then decide below which launcher area reveals it.")}
            >
              <div className="studio-segmented">
                {(["solid", "gradient", "image", "drawing"] as AppearanceBackgroundKind[]).map(
                  (kind) => (
                    <button
                      type="button"
                      key={kind}
                      className={draft.background.kind === kind ? "active" : ""}
                      onClick={() => selectBackgroundKind(kind)}
                    >
                      {copy(
                        kind === "solid"
                          ? "SOLID COLOR"
                          : kind === "gradient"
                            ? "GRADIENT"
                            : kind === "image"
                              ? "LOCAL IMAGE"
                              : "CANVAS",
                      )}
                    </button>
                  ),
                )}
              </div>
            </Section>

            <Section
              title={copy("BACKGROUND AREA")}
              note={copy(
                "Use the full launcher, or mask the title bar, left navigation and footer without rescaling the image.",
              )}
              defaultOpen={false}
            >
              <div className="studio-segmented">
                {(["launcher", "content"] as const).map((scope) => (
                  <button
                    type="button"
                    key={scope}
                    className={draft.background.scope === scope ? "active" : ""}
                    onClick={() =>
                      patchDraft((current) => ({
                        ...current,
                        background: { ...current.background, scope },
                      }))
                    }
                  >
                    {scope === "launcher" ? copy("WHOLE LAUNCHER") : copy("CONTENT ONLY")}
                  </button>
                ))}
              </div>
            </Section>

            {draft.background.kind === "solid" && (
              <Section title={copy("SOLID COLOR")}>
                <ColorField
                  label={copy("WINDOW BACKGROUND")}
                  value={draft.colors.background}
                  onChange={(background) =>
                    patchDraft((current) => ({
                      ...current,
                      colors: { ...current.colors, background },
                    }))
                  }
                />
              </Section>
            )}

            {draft.background.kind === "gradient" && (
              <Section
                title={copy("WINDOW GRADIENT")}
                note={copy(
                  "Build a full-window gradient with palettes, color stops and precise direction controls.",
                )}
              >
                <ElementBackgroundPicker
                  style={{ ...draft.background.gradient, backgroundColor: draft.colors.background }}
                  fallbackColor={draft.colors.background}
                  fallbackAccent={draft.colors.accent}
                  gradientOnly
                  enableMotion={false}
                  onChange={(patch) =>
                    patchDraft((current) => ({
                      ...current,
                      background: {
                        ...current.background,
                        gradient: { ...current.background.gradient, ...patch },
                      },
                    }))
                  }
                />
              </Section>
            )}

            {draft.background.kind === "image" && (
              <Section
                title={copy("LOCAL IMAGE")}
                note={copy(
                  "The image is resized locally and stored inside your appearance profile.",
                )}
              >
                <label className="studio-file-picker">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={imageBusy}
                    onChange={(event) => void chooseImage(event.target.files?.[0])}
                  />
                  <span>{imageBusy ? copy("PROCESSING…") : copy("CHOOSE IMAGE")}</span>
                  <strong>{draft.background.imageName || copy("NO IMAGE SELECTED")}</strong>
                </label>
                {draft.background.imageDataUrl && (
                  <button
                    type="button"
                    className="studio-inline-action"
                    onClick={() =>
                      patchDraft((current) => ({
                        ...current,
                        background: { ...current.background, imageDataUrl: "", imageName: "" },
                      }))
                    }
                  >
                    {copy("REMOVE IMAGE")}
                  </button>
                )}
              </Section>
            )}

            {draft.background.kind === "drawing" && (
              <Section
                title={copy("CANVAS")}
                note={copy(
                  "The title bar, left panel and footer guides are preview-only and are not saved into the drawing.",
                )}
              >
                <DrawingCanvas
                  value={draft.background.drawingDataUrl}
                  backgroundColor={draft.colors.background}
                  scope={draft.background.scope}
                  onChange={(drawingDataUrl) =>
                    patchDraft((current) => ({
                      ...current,
                      background: { ...current.background, drawingDataUrl },
                    }))
                  }
                  onCursorChange={previewDrawingCursor}
                />
              </Section>
            )}

            {(draft.background.kind === "image" || draft.background.kind === "drawing") && (
              <Section title={copy("IMAGE TREATMENT")}>
                <RangeField
                  label={copy("DARKEN")}
                  value={draft.background.dim}
                  min={0}
                  max={0.9}
                  step={0.05}
                  defaultValue={baseDefaults.background.dim}
                  onChange={(dim) =>
                    patchDraft((current) => ({
                      ...current,
                      background: { ...current.background, dim },
                    }))
                  }
                />
                <RangeField
                  label={copy("BLUR")}
                  value={draft.background.blur}
                  min={0}
                  max={24}
                  suffix=" PX"
                  defaultValue={baseDefaults.background.blur}
                  onChange={(blur) =>
                    patchDraft((current) => ({
                      ...current,
                      background: { ...current.background, blur },
                    }))
                  }
                />
              </Section>
            )}
          </>
        );

      case "colors":
        if (selectedTarget) {
          return (
            <Section
              title={copy("SELECTED ELEMENT COLORS")}
              note={copy("Only {target} changes. Other launcher colors stay untouched.", {
                target: selectedTarget.label,
              })}
            >
              <ElementBackgroundPicker
                style={selectedVisualStyle}
                fallbackColor={draft.colors.surface}
                fallbackAccent={draft.colors.accent}
                onChange={patchSelectedStyle}
              />
              <ElementTextColorPicker
                style={selectedVisualStyle}
                fallbackColor={draft.colors.text}
                fallbackAccent={draft.colors.accent}
                onChange={patchSelectedStyle}
              />
            </Section>
          );
        }
        return (
          <>
            <Section
              title={copy("BASE THEME")}
              note={copy("A base supplies safe semantic colors for every component.")}
            >
              <div className="studio-segmented">
                {(["light", "dark", "void"] as Theme[]).map((theme) => (
                  <button
                    type="button"
                    key={theme}
                    className={draft.baseTheme === theme ? "active" : ""}
                    onClick={() => selectBaseTheme(theme)}
                  >
                    {copy(
                      theme === "light"
                        ? "LIGHT THEME"
                        : theme === "dark"
                          ? "DARK THEME"
                          : "VOID THEME",
                    )}
                  </button>
                ))}
              </div>
            </Section>
            <Section title={copy("CUSTOM PALETTE")}>
              <div className="studio-color-grid">
                <ColorField
                  label={copy("BACKGROUND")}
                  value={draft.colors.background}
                  onChange={(background) =>
                    patchDraft((current) => ({
                      ...current,
                      colors: { ...current.colors, background },
                    }))
                  }
                />
                <ColorField
                  label={copy("SURFACES")}
                  value={draft.colors.surface}
                  onChange={(surface) =>
                    patchDraft((current) => ({
                      ...current,
                      colors: { ...current.colors, surface },
                    }))
                  }
                />
                <ColorField
                  label={copy("TEXT")}
                  value={draft.colors.text}
                  onChange={(text) =>
                    patchDraft((current) => ({
                      ...current,
                      colors: { ...current.colors, text },
                    }))
                  }
                />
                <ColorField
                  label={copy("ACCENT")}
                  value={draft.colors.accent}
                  onChange={(accent) =>
                    patchDraft((current) => ({
                      ...current,
                      colors: { ...current.colors, accent },
                    }))
                  }
                />
              </div>
            </Section>
          </>
        );

      case "navigation": {
        const legacyTabs = draft.navigation.legacyTabs;
        const allLegacy = TAB_ORDER.every((tab) => legacyTabs.includes(tab));
        return (
          <>
            <Section
              title={copy("SIDEBAR DESIGN")}
              note={copy(
                "Use the current numbered layout or bring back the original minimal menu.",
              )}
            >
              <div className="studio-sidebar-presets">
                <button
                  type="button"
                  className={legacyTabs.length === 0 ? "active" : ""}
                  onClick={() => setLegacySidebarTabs([])}
                >
                  <strong>{copy("CURRENT DESIGN")}</strong>
                  <small>{copy("Numbers and active background")}</small>
                </button>
                <button
                  type="button"
                  className={allLegacy ? "active" : ""}
                  onClick={() => setLegacySidebarTabs([...TAB_ORDER])}
                >
                  <strong>{copy("ORIGINAL DESIGN")}</strong>
                  <small>{copy("Text-only menu for every item")}</small>
                </button>
              </div>
            </Section>

            <Section
              title={copy("ORIGINAL STYLE BY ITEM")}
              note={copy("Choose only the entries that should look like the old launcher menu.")}
              defaultOpen={false}
            >
              <div className="studio-sidebar-tab-grid">
                {TAB_ORDER.map((tab) => {
                  const legacy = legacyTabs.includes(tab);
                  return (
                    <button
                      type="button"
                      key={tab}
                      className={legacy ? "active" : ""}
                      aria-pressed={legacy}
                      onClick={() => toggleLegacySidebarTab(tab)}
                    >
                      <span>{legacy ? copy("ORIGINAL") : copy("CURRENT")}</span>
                      <strong>{TAB_TITLE[tab]}</strong>
                      <small>{legacy ? copy("TEXT ONLY") : copy("NUMBERED")}</small>
                    </button>
                  );
                })}
              </div>
            </Section>
          </>
        );
      }

      case "shape":
        if (selectedTarget) {
          const radius = selectedVisualStyle?.radius ?? draft.shape.radius;
          return (
            <Section
              title={copy("SELECTED ELEMENT RADIUS")}
              note={copy("Only {target} receives this corner radius.", {
                target: selectedTarget.label,
              })}
            >
              <div className="studio-radius-preview studio-radius-preview--single">
                <span style={{ borderRadius: radius }}>{selectedTarget.label}</span>
              </div>
              <RangeField
                label={copy("RADIUS")}
                value={radius}
                min={0}
                max={40}
                suffix=" PX"
                defaultValue={draft.shape.radius}
                onChange={(nextRadius) => patchSelectedStyle({ radius: nextRadius })}
              />
            </Section>
          );
        }
        return (
          <Section
            title={copy("GLOBAL CORNER RADIUS")}
            note={copy("Applied to the window, cards, fields, menus, modals and buttons.")}
          >
            <div className="studio-radius-preview">
              <span style={{ borderRadius: draft.shape.radius }}>{copy("CARD")}</span>
              <button type="button" style={{ borderRadius: draft.shape.radius }}>
                {copy("BUTTON")}
              </button>
              <input style={{ borderRadius: draft.shape.radius }} value="FIELD" readOnly />
            </div>
            <RangeField
              label={copy("RADIUS")}
              value={draft.shape.radius}
              min={0}
              max={28}
              suffix=" PX"
              defaultValue={baseDefaults.shape.radius}
              onChange={(radius) => patchDraft((current) => ({ ...current, shape: { radius } }))}
            />
          </Section>
        );

      case "type": {
        const customFontOptions = draft.typography.customFonts.map((font) => ({
          id: font.id,
          label: font.name.toUpperCase(),
          value: customFontStack(font),
        }));
        const addCustomFont = (font: AppearanceProfile["typography"]["customFonts"][number]) =>
          patchDraft((current) => ({
            ...current,
            typography: {
              ...current.typography,
              customFonts: [...current.typography.customFonts, font].slice(-8),
            },
          }));
        const removeCustomFont = (font: AppearanceProfile["typography"]["customFonts"][number]) => {
          const removedStack = customFontStack(font);
          patchDraft((current) => {
            const clearFont = (style: AppearanceElementOverride["style"] | undefined) => {
              if (!style || style.fontFamily !== removedStack) return style;
              const next = { ...style };
              delete next.fontFamily;
              return next;
            };
            return {
              ...current,
              typography: {
                ...current.typography,
                uiFont:
                  current.typography.uiFont === removedStack
                    ? FONT_OPTIONS[0].value
                    : current.typography.uiFont,
                displayFont:
                  current.typography.displayFont === removedStack
                    ? DISPLAY_FONT_OPTIONS[0].value
                    : current.typography.displayFont,
                customFonts: current.typography.customFonts.filter(
                  (candidate) => candidate.id !== font.id,
                ),
              },
              elementOverrides: current.elementOverrides.map((override) => ({
                ...override,
                style: clearFont(override.style) ?? {},
                hoverStyle: clearFont(override.hoverStyle),
                pressedStyle: clearFont(override.pressedStyle),
                focusStyle: clearFont(override.focusStyle),
                disabledStyle: clearFont(override.disabledStyle),
                selectedStyle: clearFont(override.selectedStyle),
              })),
            };
          });
        };
        const customFontManager = (
          <Section
            title={copy("CUSTOM FONTS")}
            note={copy("Fonts stay on this device and are saved inside the appearance profile.")}
            defaultOpen={false}
          >
            <CustomFontManager
              fonts={draft.typography.customFonts}
              onAdd={addCustomFont}
              onRemove={removeCustomFont}
            />
          </Section>
        );
        if (selectedTarget) {
          const currentFont = selectedVisualStyle?.fontFamily ?? draft.typography.uiFont;
          const elementFonts = [
            ...FONT_OPTIONS,
            ...DISPLAY_FONT_OPTIONS,
            ...customFontOptions,
          ].filter(
            (font, index, fonts) =>
              fonts.findIndex((candidate) => candidate.value === font.value) === index,
          );
          return (
            <>
              {customFontManager}
              <Section
                title={copy("SELECTED ELEMENT FONT")}
                note={copy("Only {target} and its inherited text change.", {
                  target: selectedTarget.label,
                })}
              >
                <div className="studio-font-grid">
                  {elementFonts.map((font) => (
                    <button
                      type="button"
                      key={font.id + font.value}
                      className={currentFont === font.value ? "active" : ""}
                      style={{ fontFamily: font.value }}
                      onClick={() => patchSelectedStyle({ fontFamily: font.value })}
                    >
                      <span>{font.label}</span>
                      <small>{copy("Selected element / Aa")}</small>
                    </button>
                  ))}
                </div>
              </Section>
            </>
          );
        }
        return (
          <>
            {customFontManager}
            <Section
              title={copy("INTERFACE FONT")}
              note={copy("Controls, metadata and navigation.")}
            >
              <div className="studio-font-grid">
                {[...FONT_OPTIONS, ...customFontOptions].map((font) => (
                  <button
                    type="button"
                    key={font.id}
                    className={draft.typography.uiFont === font.value ? "active" : ""}
                    style={{ fontFamily: font.value }}
                    onClick={() =>
                      patchDraft((current) => ({
                        ...current,
                        typography: { ...current.typography, uiFont: font.value },
                      }))
                    }
                  >
                    <span>{font.label}</span>
                    <small>{copy("Archive 01 / Aa")}</small>
                  </button>
                ))}
              </div>
            </Section>
            <Section title={copy("DISPLAY FONT")} note={copy("Large headings and index numbers.")}>
              <div className="studio-font-grid">
                {[...DISPLAY_FONT_OPTIONS, ...customFontOptions].map((font) => (
                  <button
                    type="button"
                    key={font.id}
                    className={draft.typography.displayFont === font.value ? "active" : ""}
                    style={{ fontFamily: font.value }}
                    onClick={() =>
                      patchDraft((current) => ({
                        ...current,
                        typography: { ...current.typography, displayFont: font.value },
                      }))
                    }
                  >
                    <span>{font.label}</span>
                    <small>{copy("Create your world.")}</small>
                  </button>
                ))}
              </div>
            </Section>
          </>
        );
      }

      case "opacity":
        if (selectedTarget) {
          return (
            <Section
              title={copy("SELECTED ELEMENT OPACITY")}
              note={copy(
                "Whole element opacity is the final multiplier. Background and content of {target} are applied inside it.",
                { target: selectedTarget.label },
              )}
            >
              <RangeField
                label={copy("WHOLE ELEMENT") + copy(selectedElementOpacitySource)}
                value={selectedEffectiveElementOpacity}
                min={0}
                max={1}
                step={0.05}
                defaultValue={selectedInheritedElementOpacity}
                onChange={(elementOpacity) => patchSelectedStyle({ elementOpacity })}
              />
              <RangeField
                label={copy("BACKGROUND")}
                value={selectedVisualStyle?.backgroundOpacity ?? selectedVisualStyle?.opacity ?? 1}
                min={0}
                max={1}
                step={0.05}
                defaultValue={1}
                onChange={(backgroundOpacity) => patchSelectedStyle({ backgroundOpacity })}
              />
              <RangeField
                label={copy("CONTENT")}
                value={selectedVisualStyle?.contentOpacity ?? selectedVisualStyle?.opacity ?? 1}
                min={0}
                max={1}
                step={0.05}
                defaultValue={1}
                onChange={(contentOpacity) => patchSelectedStyle({ contentOpacity })}
              />
            </Section>
          );
        }
        return (
          <Section
            title={copy("TRANSPARENCY")}
            note={copy(
              "Window opacity affects the complete launcher; the other controls only affect their layer.",
            )}
          >
            <RangeField
              label={copy("WHOLE WINDOW")}
              value={draft.opacity.window}
              min={0.55}
              max={1}
              step={0.05}
              defaultValue={baseDefaults.opacity.window}
              onChange={(windowOpacity) =>
                patchDraft((current) => ({
                  ...current,
                  opacity: { ...current.opacity, window: windowOpacity },
                }))
              }
            />
            <RangeField
              label={copy("PANELS")}
              value={draft.opacity.panels}
              min={0}
              max={1}
              step={0.05}
              defaultValue={baseDefaults.opacity.panels}
              onChange={(panels) =>
                patchDraft((current) => ({
                  ...current,
                  opacity: { ...current.opacity, panels },
                }))
              }
            />
            <RangeField
              label={copy("BUTTONS & CONTROLS")}
              value={draft.opacity.controls}
              min={0.35}
              max={1}
              step={0.05}
              defaultValue={baseDefaults.opacity.controls}
              onChange={(controls) =>
                patchDraft((current) => ({
                  ...current,
                  opacity: { ...current.opacity, controls },
                }))
              }
            />
          </Section>
        );

      case "motion":
        return (
          <>
            <Section title={copy("ANIMATION ENGINE")}>
              <label className="studio-master-toggle">
                <div>
                  <strong>{copy("ENABLE ANIMATIONS")}</strong>
                  <span>{copy("Disabling this also removes small interface transitions.")}</span>
                </div>
                <input
                  type="checkbox"
                  checked={draft.motion.enabled}
                  onChange={(event) =>
                    patchDraft((current) => ({
                      ...current,
                      motion: { ...current.motion, enabled: event.target.checked },
                    }))
                  }
                />
              </label>
              <SelectField<UiMotionStyle>
                label={copy("INTERFACE FEEL")}
                value={draft.motion.uiStyle}
                options={UI_MOTION_STYLES}
                onChange={(uiStyle) =>
                  patchDraft((current) => ({
                    ...current,
                    motion: { ...current.motion, uiStyle },
                  }))
                }
              />
              <SelectField<OpenAnimationId>
                label={copy("LAUNCHER OPEN")}
                value={draft.motion.opening}
                options={OPEN_ANIMATIONS}
                onChange={(opening) => {
                  patchDraft((current) => ({
                    ...current,
                    motion: { ...current.motion, opening },
                  }));
                  previewWindowAnimation({ kind: "opening", animation: opening });
                }}
              />
              <div className="studio-preview-actions studio-preview-actions--single">
                <button
                  type="button"
                  onClick={() =>
                    previewWindowAnimation({ kind: "opening", animation: draft.motion.opening })
                  }
                >
                  {copy("REPLAY OPENING ON MAIN WINDOW")}
                </button>
              </div>
            </Section>

            <Section
              title={copy("TAB TRANSITIONS")}
              note={copy(
                "A transition belongs to the tab being entered, regardless of where you came from.",
              )}
              defaultOpen={false}
            >
              <div className="studio-segmented">
                <button
                  type="button"
                  className={draft.motion.tabMode === "global" ? "active" : ""}
                  onClick={() =>
                    patchDraft((current) => ({
                      ...current,
                      motion: { ...current.motion, tabMode: "global" },
                    }))
                  }
                >
                  {copy("ONE FOR ALL")}
                </button>
                <button
                  type="button"
                  className={draft.motion.tabMode === "per-tab" ? "active" : ""}
                  onClick={() =>
                    patchDraft((current) => ({
                      ...current,
                      motion: { ...current.motion, tabMode: "per-tab" },
                    }))
                  }
                >
                  {copy("PER TAB")}
                </button>
              </div>

              {draft.motion.tabMode === "global" ? (
                <SelectField<TabAnimationId>
                  label={copy("EVERY TAB")}
                  value={draft.motion.tabDefault}
                  options={TAB_ANIMATIONS}
                  onChange={(tabDefault) =>
                    patchDraft((current) => ({
                      ...current,
                      motion: { ...current.motion, tabDefault },
                    }))
                  }
                />
              ) : (
                <div className="studio-tab-animation-grid">
                  {TAB_ORDER.map((tab) => (
                    <SelectField<TabAnimationId>
                      key={tab}
                      label={TAB_TITLE[tab]}
                      value={draft.motion.tabByTarget[tab]}
                      options={TAB_ANIMATIONS}
                      onChange={(animation) =>
                        patchDraft((current) => ({
                          ...current,
                          motion: {
                            ...current.motion,
                            tabByTarget: {
                              ...current.motion.tabByTarget,
                              [tab as TabKey]: animation,
                            },
                          },
                        }))
                      }
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section
              title={copy("CLOSE BEHAVIOR")}
              note={copy("The window button and Alt+F4 can use different effects.")}
              defaultOpen={false}
            >
              <SelectField<CloseAnimationId>
                label={copy("CLOSE BUTTON")}
                value={draft.motion.closeButton}
                options={CLOSE_ANIMATIONS}
                onChange={(closeButton) => {
                  patchDraft((current) => ({
                    ...current,
                    motion: { ...current.motion, closeButton },
                  }));
                  previewWindowAnimation({ kind: "closing", animation: closeButton });
                }}
              />
              <SelectField<CloseAnimationId>
                label={copy("ALT + F4 / SYSTEM CLOSE")}
                value={draft.motion.closeSystem}
                options={CLOSE_ANIMATIONS}
                onChange={(closeSystem) => {
                  patchDraft((current) => ({
                    ...current,
                    motion: { ...current.motion, closeSystem },
                  }));
                  previewWindowAnimation({ kind: "closing", animation: closeSystem });
                }}
              />
              <div className="studio-preview-actions">
                <button
                  type="button"
                  onClick={() =>
                    previewWindowAnimation({
                      kind: "closing",
                      animation: draft.motion.closeButton,
                    })
                  }
                >
                  {copy("REPLAY CLOSE BUTTON")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    previewWindowAnimation({
                      kind: "closing",
                      animation: draft.motion.closeSystem,
                    })
                  }
                >
                  {copy("REPLAY ALT + F4")}
                </button>
              </div>
            </Section>
          </>
        );
    }
  };

  const activeEditorContext = elementListOpen
    ? {
        index: "10",
        label: "EDITED ELEMENTS",
        note: "Review every element with its own style and jump back to it in the launcher.",
      }
    : category === "element"
      ? {
          index: "09",
          label: selectedTarget ? "ELEMENT SETTINGS" : "PICK AN ELEMENT",
          note: selectedTarget
            ? copy("Fine-tune {target} without changing the rest of the launcher.", {
                target: selectedTarget.label,
              })
            : "Use Pick from launcher, then click the button, card or text you want to change.",
        }
      : category === "canvas-ui" && selectedTarget
        ? {
            index: "08",
            label: "CANVAS UI · ELEMENT",
            note: copy("The selected effect is isolated to {target}.", {
              target:
                selectedTargets.length > 1
                  ? copy("{count} picked elements", { count: selectedTargets.length })
                  : selectedTarget.label,
            }),
          }
        : (CATEGORIES.find((item) => item.id === category) ?? CATEGORIES[0]);

  const messageIsError =
    typeof message === "object" ? "error" in message : message.includes("COULD NOT");
  const displayedMessage =
    typeof message === "string"
      ? copy(message)
      : "error" in message
        ? toErrorMessage(message.error)
        : copy(message.text, {
            ...message.params,
            ...(message.params?.state ? { state: copy(String(message.params.state)) } : {}),
          });

  const searchQuery = categoryQuery.trim().toLocaleLowerCase();
  const visibleCategories = CATEGORIES.filter((item) =>
    `${copy(item.label)} ${copy(item.note)} ${CATEGORY_SEARCH_TERMS[item.id] ?? ""}`
      .toLocaleLowerCase()
      .includes(searchQuery),
  );
  const showElementPicker =
    `${copy("PICK ELEMENT")} ${copy("Choose anything on screen")} ${copy("Edit the current selection")} pick element`
      .toLocaleLowerCase()
      .includes(searchQuery);
  const showEditedElements =
    draft.elementOverrides.length > 0 &&
    `${copy("EDITED ELEMENTS")}{" "} ${copy("Review individual styles")} ${" "}{copy("CUSTOMIZED")} edited elements`
      .toLocaleLowerCase()
      .includes(searchQuery);

  return (
    <div
      className="appearance-studio-window"
      onPointerDownCapture={() => {
        historyTransactionRef.current = { recorded: false };
      }}
    >
      <header
        className="appearance-studio-titlebar"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          if (studioWindow) void studioWindow.startDragging();
        }}
      >
        <div className="appearance-studio-titlebar-brand">
          <span>{copy("SCREENLAUNCHER / DESIGN TOOLS")}</span>
          <strong>{copy("APPEARANCE STUDIO")}</strong>
        </div>
        <div className="appearance-studio-titlebar-tools">
          <div
            className="appearance-history-controls"
            role="group"
            aria-label={copy("Edit history")}
          >
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              data-tooltip={copy("Undo (Ctrl+Z)")}
              aria-label={copy("Undo last appearance change")}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M8 5 3.5 9 8 13" />
                <path d="M4 9h7.1a5.4 5.4 0 0 1 5.4 5.4V15" />
              </svg>
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              data-tooltip={copy("Redo (Ctrl+Shift+Z)")}
              aria-label={copy("Redo last appearance change")}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m12 5 4.5 4-4.5 4" />
                <path d="M16 9H8.9a5.4 5.4 0 0 0-5.4 5.4V15" />
              </svg>
            </button>
          </div>
          <div className="appearance-live-status">
            <i aria-hidden="true" />
            <div>
              <strong>{copy("LIVE PREVIEW")}</strong>
              <span>{copy("Changes appear in the launcher")}</span>
            </div>
          </div>
          <div className="appearance-studio-window-actions">
            <button type="button" onClick={() => void studioWindow?.minimize()}>
              {copy("MINIMIZE")}
            </button>
            <button type="button" onClick={() => void closeStudio()}>
              {copy("CLOSE")}
            </button>
          </div>
        </div>
      </header>

      <div className="appearance-studio-body">
        <nav
          className="appearance-studio-categories"
          aria-label={copy("Appearance editor sections")}
        >
          <div className="appearance-studio-nav-intro">
            <span>{copy("WORKFLOW")}</span>
            <strong>{copy("Design your launcher")}</strong>
            <label className="appearance-studio-nav-search">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" />
                <path d="m10.5 10.5 3 3" />
              </svg>
              <input
                type="search"
                value={categoryQuery}
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder={copy("Search sections")}
                aria-label={copy("Search appearance sections")}
              />
            </label>
          </div>
          {visibleCategories.length > 0 && (
            <span className="appearance-studio-nav-group">{copy("GLOBAL STYLE")}</span>
          )}
          {visibleCategories.map((item) => (
            <button
              type="button"
              key={item.id}
              className={!elementListOpen && category === item.id ? "active" : ""}
              onClick={() => selectCategory(item.id)}
              aria-current={!elementListOpen && category === item.id ? "step" : undefined}
            >
              <span>{item.index}</span>
              <div>
                <strong>{copy(item.label)}</strong>
                <small>{copy(item.note)}</small>
              </div>
            </button>
          ))}
          {(showElementPicker || showEditedElements) && (
            <span className="appearance-studio-nav-group appearance-studio-nav-group--tools">
              {copy("ELEMENT TOOLS")}
            </span>
          )}
          {showElementPicker && (
            <button
              type="button"
              className={`appearance-element-nav${!elementListOpen && category === "element" ? " active" : ""}`}
              onClick={() => selectCategory("element")}
              aria-current={!elementListOpen && category === "element" ? "step" : undefined}
            >
              <span>09</span>
              <div>
                <strong>{copy("PICK ELEMENT")}</strong>
                <small>
                  {selectedTarget
                    ? copy("Edit the current selection")
                    : copy("Choose anything on screen")}
                </small>
              </div>
            </button>
          )}
          {showEditedElements && (
            <button
              type="button"
              className={`appearance-customized-nav${elementListOpen ? " active" : ""}`}
              onClick={openElementList}
              aria-current={elementListOpen ? "step" : undefined}
            >
              <span>10</span>
              <div>
                <strong>
                  {copy("EDITED ELEMENTS")} <em>{draft.elementOverrides.length}</em>
                </strong>
                <small>{copy("Review individual styles")}</small>
              </div>
            </button>
          )}
          {visibleCategories.length === 0 && !showElementPicker && !showEditedElements && (
            <p className="appearance-studio-nav-empty">{copy("No matching sections")}</p>
          )}
        </nav>

        <main className="appearance-studio-editor">
          <header className="appearance-editor-heading">
            <span>
              {copy("SECTION")} {activeEditorContext.index}
            </span>
            <strong>{copy(activeEditorContext.label)}</strong>
            <p>{copy(activeEditorContext.note)}</p>
          </header>

          <section className="appearance-target-bar">
            <div className="appearance-target-current">
              <span>{copy("CURRENT TARGET")}</span>
              <strong data-tooltip={selectedTargets.map((target) => target.label).join(", ")}>
                {selectedTargets.length > 1
                  ? copy("{count} elements selected", { count: selectedTargets.length })
                  : selectedTarget?.label || copy("WHOLE LAUNCHER")}
              </strong>
              {selectedTarget && (
                <button
                  type="button"
                  className="appearance-target-clear"
                  onClick={clearSelectedStyle}
                  disabled={!selectedOverride}
                >
                  {selectedTargets.length > 1 ? copy("RESET ELEMENTS") : copy("RESET ELEMENT")}
                </button>
              )}
            </div>
            <div className="appearance-target-choices">
              <button
                type="button"
                className={!selectedTarget ? "active" : ""}
                onClick={selectWholeLauncher}
              >
                <strong>{copy("GLOBAL STYLE")}</strong>
                <small>{copy("Entire launcher")}</small>
              </button>
              <button
                type="button"
                className={`appearance-target-pick${selectedTarget ? " active" : ""}`}
                onClick={requestElementPick}
              >
                <strong>
                  {pickingElement ? copy("CLICK IN LAUNCHER…") : copy("PICK ELEMENT")}
                </strong>
                <small>
                  {pickingElement ? copy("Hold Shift for several") : copy("Button, card or text")}
                </small>
              </button>
            </div>
            {selectedTarget && (
              <section className="appearance-interaction-state">
                <span>{copy("VISUAL STATE")}</span>
                <div>
                  {ELEMENT_INTERACTION_STATES.map((state) => (
                    <button
                      type="button"
                      key={state.id}
                      className={elementInteractionState === state.id ? "active" : ""}
                      onClick={() => setElementInteractionState(state.id)}
                    >
                      {copy(state.label)}
                    </button>
                  ))}
                </div>
                <small>
                  {copy(
                    ELEMENT_INTERACTION_STATES.find((state) => state.id === elementInteractionState)
                      ?.note ?? "",
                  )}
                </small>
                <button
                  type="button"
                  className="appearance-interaction-reset"
                  disabled={!selectedInteractionCustomized}
                  onClick={clearSelectedInteractionStyle}
                >
                  {copy("Reset {state}", { state: copy(elementInteractionState.toUpperCase()) })}
                </button>
              </section>
            )}
          </section>

          {elementListOpen ? (
            <CustomScrollArea className="appearance-element-list-scroll">
              <div className="appearance-element-list">
                <header>
                  <span>{copy("INDIVIDUAL ELEMENTS")}</span>
                  <strong>
                    {draft.elementOverrides.length} {copy("CUSTOMIZED")}
                  </strong>
                  <p>{copy("Choose an object to open its launcher tab and highlight it.")}</p>
                </header>
                <div>
                  {draft.elementOverrides.map((override, index) => (
                    <article key={override.id}>
                      <button
                        type="button"
                        className="appearance-element-list-link"
                        onClick={() => revealElement(override)}
                      >
                        <span>
                          {String(index + 1).padStart(2, "0")} /{" "}
                          {override.tab ? TAB_TITLE[override.tab] : copy("ALL TABS")}
                        </span>
                        <strong>{override.label}</strong>
                        <small>{copy("OPEN TAB & HIGHLIGHT →")}</small>
                      </button>
                      <div className="appearance-element-list-badges">
                        {elementStyleBadges(override).map((badge) => (
                          <span key={badge.label}>
                            {badge.color && (
                              <i style={{ backgroundColor: badge.color }} aria-hidden="true" />
                            )}
                            <b>{copy(badge.label)}</b>
                            {badge.value}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </CustomScrollArea>
          ) : (
            <CustomScrollArea className="appearance-studio-controls-scroll">
              <div
                key={`${category}-${selectedTarget?.id ?? "global"}`}
                ref={controlsRef}
                className="appearance-studio-controls"
              >
                {renderEditor()}
              </div>
            </CustomScrollArea>
          )}

          <footer className="appearance-studio-actions">
            <div className="appearance-save-state">
              <i className={hasUnsavedChanges ? "unsaved" : ""} aria-hidden="true" />
              <div>
                <strong>
                  {hasUnsavedChanges ? copy("UNSAVED CHANGES") : copy("ALL CHANGES SAVED")}
                </strong>
                <small className={messageIsError ? "error" : ""}>
                  {displayedMessage ||
                    (hasUnsavedChanges
                      ? copy("Preview is live. Save to keep it.")
                      : copy("Your launcher appearance is up to date."))}
                </small>
              </div>
            </div>
            <div className="appearance-studio-action-buttons">
              <button type="button" onClick={discard} disabled={!hasUnsavedChanges}>
                {copy("DISCARD")}
              </button>
              <button type="button" className="restore" onClick={reset}>
                {copy("DEFAULTS")}
              </button>
              <button
                type="button"
                className="primary"
                onClick={save}
                disabled={!hasUnsavedChanges}
              >
                {copy("SAVE & APPLY")}
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
