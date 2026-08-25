import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { ElementInspector } from "./ElementInspector";
import { refreshElementSizingTarget } from "./elementSizing";
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
  readStoredAppearance,
  writeStoredAppearance,
} from "./profile";
import type { AppearanceBackgroundKind, AppearanceProfile, Theme } from "./types";
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
import "./AppearanceStudio.css";

type StudioCategory = "background" | "colors" | "shape" | "type" | "opacity" | "motion" | "element";

const CATEGORIES: { id: StudioCategory; index: string; label: string; note: string }[] = [
  { id: "background", index: "01", label: "BACKGROUND", note: "Image, color or canvas" },
  { id: "colors", index: "02", label: "COLORS", note: "Palette and accent" },
  { id: "shape", index: "03", label: "SHAPE", note: "Global corner radius" },
  { id: "type", index: "04", label: "TYPOGRAPHY", note: "Interface and display" },
  { id: "opacity", index: "05", label: "OPACITY", note: "Window, panels, controls" },
  { id: "motion", index: "06", label: "MOTION", note: "Open, tabs and close" },
];

function elementStyleBadges(override: AppearanceElementOverride) {
  const badges: { label: string; value: string; color?: string }[] = [];
  if (override.text !== undefined) {
    badges.push({
      label: "LABEL",
      value: override.text.trim() ? override.text.trim().slice(0, 22) : "HIDDEN",
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
      value === undefined ? "DEFAULT" : value === 0 ? "AUTO" : String(value);
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
    badges.push({ label: "FONT", value: font?.label || "CUSTOM" });
  }
  if (override.style.backgroundColor) {
    badges.push({
      label: "BACKGROUND",
      value: override.style.backgroundColor.toUpperCase(),
      color: override.style.backgroundColor,
    });
  }
  if (override.style.backgroundKind === "gradient") {
    badges.push({ label: "FILL", value: "GRADIENT" });
  }
  if (override.style.textColor) {
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
    badges.push({ label: "SHADOW", value: override.style.shadow.toUpperCase() });
  }
  if (override.style.scale !== undefined) {
    badges.push({ label: "SCALE", value: `${Math.round(override.style.scale * 100)}%` });
  }
  if (override.componentSettings) {
    badges.push({ label: "PROPS", value: override.componentSettings.kind.toUpperCase() });
  }
  if (override.hoverStyle && Object.keys(override.hoverStyle).length > 0) {
    badges.push({ label: "HOVER", value: `${override.hoverTransitionMs ?? 200} MS` });
  }
  return badges;
}

export function AppearanceStudioApp() {
  const studioWindow = useMemo(() => (isTauri() ? getCurrentWindow() : null), []);
  const [category, setCategory] = useState<StudioCategory>("background");
  const [draft, setDraft] = useState<AppearanceProfile>(() => ({
    ...readStoredAppearance(),
    customized: true,
  }));
  const [message, setMessage] = useState("");
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
      previewHover: elementInteractionState === "hover",
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
      setDraft((current) => refreshElementSizingTarget(current, target));
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
            : `SELECTED: ${target.label}`,
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
    () =>
      elementInteractionState === "hover"
        ? { ...selectedOverride?.style, ...selectedOverride?.hoverStyle }
        : selectedOverride?.style,
    [elementInteractionState, selectedOverride],
  );
  const selectedActiveInteractionStyle =
    elementInteractionState === "hover" ? selectedOverride?.hoverStyle : selectedOverride?.style;
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
      : elementInteractionState === "hover" &&
          (selectedOverride?.style.elementOpacity !== undefined ||
            selectedOverride?.style.opacity !== undefined)
        ? " · FROM NORMAL"
        : " · LAUNCHER DEFAULT";
  const selectedInteractionCustomized = useMemo(
    () =>
      selectedTargets.some((target) => {
        const override = draft.elementOverrides.find((candidate) => candidate.id === target.id);
        const style = elementInteractionState === "hover" ? override?.hoverStyle : override?.style;
        return Boolean(style && Object.keys(style).length > 0);
      }),
    [draft.elementOverrides, elementInteractionState, selectedTargets],
  );

  const patchDraft = useCallback((updater: (current: AppearanceProfile) => AppearanceProfile) => {
    setDraft((current) => ({ ...updater(current), customized: true }));
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
        const interactionStyle =
          elementInteractionState === "hover"
            ? { ...existing?.hoverStyle, ...style }
            : { ...normalStyle, ...style };
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
          style: elementInteractionState === "normal" ? interactionStyle : normalStyle,
        };
        if (elementInteractionState === "hover") {
          if (Object.keys(interactionStyle).length > 0) next.hoverStyle = interactionStyle;
          else delete next.hoverStyle;
        }
        const hasTextOverride =
          existing !== undefined && Object.prototype.hasOwnProperty.call(existing, "text");
        if (
          Object.keys(next.style).length > 0 ||
          next.hoverStyle ||
          hasTextOverride ||
          existing?.componentSettings
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

  const patchSelectedHoverTransition = (patch: {
    hoverTransitionMs?: number;
    hoverEasing?: AppearanceElementHoverEasing;
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
          ...(patch.hoverTransitionMs !== undefined
            ? { hoverTransitionMs: patch.hoverTransitionMs }
            : {}),
          ...(patch.hoverEasing ? { hoverEasing: patch.hoverEasing } : {}),
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
          !next.hoverStyle &&
          !next.componentSettings
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
        if (elementInteractionState === "hover") {
          delete next.hoverStyle;
          delete next.hoverTransitionMs;
          delete next.hoverEasing;
        } else {
          next.style = {};
        }
        const hasTextOverride = Object.prototype.hasOwnProperty.call(next, "text");
        return Object.keys(next.style).length > 0 ||
          next.hoverStyle ||
          hasTextOverride ||
          next.componentSettings
          ? [next]
          : [];
      }),
    }));
    setMessage(`${elementInteractionState.toUpperCase()} STYLE CLEARED`);
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
    setMessage(`LOCATING: ${override.label}`);
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

  const save = () => {
    try {
      const saved = writeStoredAppearance({ ...draft, customized: true });
      originalAppearanceRef.current = saved;
      setDraft(saved);
      void emit(APPEARANCE_CHANGED_EVENT, saved).catch(() => {});
      setMessage("APPEARANCE SAVED");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message.toUpperCase() : "COULD NOT SAVE APPEARANCE",
      );
    }
  };

  const reset = () => {
    setDraft(createDefaultAppearance(draft.baseTheme, true));
    setSelectedTargets([]);
    setElementInteractionState("normal");
    setElementListOpen(false);
    setMessage("DRAFT RESET");
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
      setMessage(error instanceof Error ? error.message.toUpperCase() : "COULD NOT LOAD IMAGE");
    } finally {
      setImageBusy(false);
    }
  };

  const renderEditor = () => {
    switch (category) {
      case "element":
        return (
          <ElementInspector
            target={selectedTarget}
            override={selectedOverride}
            visualStyle={selectedVisualStyle}
            interactionState={elementInteractionState}
            hoverTransitionMs={selectedOverride?.hoverTransitionMs ?? 200}
            hoverEasing={selectedOverride?.hoverEasing ?? "ease"}
            profile={draft}
            onPick={requestElementPick}
            onStyleChange={patchSelectedStyle}
            onTextChange={patchSelectedText}
            onComponentChange={patchSelectedComponent}
            onHoverTransitionChange={patchSelectedHoverTransition}
          />
        );

      case "background":
        return (
          <>
            <Section
              title="BACKGROUND SOURCE"
              note="Choose one layer for the whole launcher window."
            >
              <div className="studio-segmented">
                {(["solid", "image", "drawing"] as AppearanceBackgroundKind[]).map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    className={draft.background.kind === kind ? "active" : ""}
                    onClick={() => selectBackgroundKind(kind)}
                  >
                    {kind.toUpperCase()}
                  </button>
                ))}
              </div>
            </Section>

            <Section
              title="BACKGROUND AREA"
              note="Keep the title bar and left navigation clean, or cover the complete launcher."
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
                    {scope === "launcher" ? "WHOLE LAUNCHER" : "CONTENT ONLY"}
                  </button>
                ))}
              </div>
            </Section>

            {draft.background.kind === "solid" && (
              <Section title="SOLID COLOR">
                <ColorField
                  label="WINDOW BACKGROUND"
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

            {draft.background.kind === "image" && (
              <Section
                title="LOCAL IMAGE"
                note="The image is resized locally and stored inside your appearance profile."
              >
                <label className="studio-file-picker">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={imageBusy}
                    onChange={(event) => void chooseImage(event.target.files?.[0])}
                  />
                  <span>{imageBusy ? "PROCESSING…" : "CHOOSE IMAGE"}</span>
                  <strong>{draft.background.imageName || "NO IMAGE SELECTED"}</strong>
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
                    REMOVE IMAGE
                  </button>
                )}
              </Section>
            )}

            {draft.background.kind === "drawing" && (
              <Section
                title="CANVAS"
                note="Draw with the pointer or place a short line of text in the center."
              >
                <DrawingCanvas
                  value={draft.background.drawingDataUrl}
                  backgroundColor={draft.colors.background}
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

            {draft.background.kind !== "solid" && (
              <Section title="IMAGE TREATMENT">
                <RangeField
                  label="DARKEN"
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
                  label="BLUR"
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
              title="SELECTED ELEMENT COLORS"
              note={`Only ${selectedTarget.label} changes. Other launcher colors stay untouched.`}
            >
              <ElementBackgroundPicker
                style={selectedVisualStyle}
                fallbackColor={draft.colors.surface}
                fallbackAccent={draft.colors.accent}
                onChange={patchSelectedStyle}
              />
              <div className="studio-color-grid studio-color-grid--single">
                <ColorField
                  label="TEXT"
                  value={selectedVisualStyle?.textColor || draft.colors.text}
                  onChange={(textColor) => patchSelectedStyle({ textColor })}
                />
              </div>
            </Section>
          );
        }
        return (
          <>
            <Section
              title="BASE THEME"
              note="A base supplies safe semantic colors for every component."
            >
              <div className="studio-segmented">
                {(["light", "dark", "void"] as Theme[]).map((theme) => (
                  <button
                    type="button"
                    key={theme}
                    className={draft.baseTheme === theme ? "active" : ""}
                    onClick={() => selectBaseTheme(theme)}
                  >
                    {theme.toUpperCase()}
                  </button>
                ))}
              </div>
            </Section>
            <Section title="CUSTOM PALETTE">
              <div className="studio-color-grid">
                <ColorField
                  label="BACKGROUND"
                  value={draft.colors.background}
                  onChange={(background) =>
                    patchDraft((current) => ({
                      ...current,
                      colors: { ...current.colors, background },
                    }))
                  }
                />
                <ColorField
                  label="SURFACES"
                  value={draft.colors.surface}
                  onChange={(surface) =>
                    patchDraft((current) => ({
                      ...current,
                      colors: { ...current.colors, surface },
                    }))
                  }
                />
                <ColorField
                  label="TEXT"
                  value={draft.colors.text}
                  onChange={(text) =>
                    patchDraft((current) => ({
                      ...current,
                      colors: { ...current.colors, text },
                    }))
                  }
                />
                <ColorField
                  label="ACCENT"
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

      case "shape":
        if (selectedTarget) {
          const radius = selectedVisualStyle?.radius ?? draft.shape.radius;
          return (
            <Section
              title="SELECTED ELEMENT RADIUS"
              note={`Only ${selectedTarget.label} receives this corner radius.`}
            >
              <div className="studio-radius-preview studio-radius-preview--single">
                <span style={{ borderRadius: radius }}>{selectedTarget.label}</span>
              </div>
              <RangeField
                label="RADIUS"
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
            title="GLOBAL CORNER RADIUS"
            note="Applied to the window, cards, fields, menus, modals and buttons."
          >
            <div className="studio-radius-preview">
              <span style={{ borderRadius: draft.shape.radius }}>CARD</span>
              <button type="button" style={{ borderRadius: draft.shape.radius }}>
                BUTTON
              </button>
              <input style={{ borderRadius: draft.shape.radius }} value="FIELD" readOnly />
            </div>
            <RangeField
              label="RADIUS"
              value={draft.shape.radius}
              min={0}
              max={28}
              suffix=" PX"
              defaultValue={baseDefaults.shape.radius}
              onChange={(radius) => patchDraft((current) => ({ ...current, shape: { radius } }))}
            />
          </Section>
        );

      case "type":
        if (selectedTarget) {
          const currentFont = selectedVisualStyle?.fontFamily ?? draft.typography.uiFont;
          const elementFonts = [...FONT_OPTIONS, ...DISPLAY_FONT_OPTIONS].filter(
            (font, index, fonts) =>
              fonts.findIndex((candidate) => candidate.value === font.value) === index,
          );
          return (
            <Section
              title="SELECTED ELEMENT FONT"
              note={`Only ${selectedTarget.label} and its inherited text change.`}
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
                    <small>Selected element / Aa</small>
                  </button>
                ))}
              </div>
            </Section>
          );
        }
        return (
          <>
            <Section title="INTERFACE FONT" note="Controls, metadata and navigation.">
              <div className="studio-font-grid">
                {FONT_OPTIONS.map((font) => (
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
                    <small>Archive 01 / Aa</small>
                  </button>
                ))}
              </div>
            </Section>
            <Section title="DISPLAY FONT" note="Large headings and index numbers.">
              <div className="studio-font-grid">
                {DISPLAY_FONT_OPTIONS.map((font) => (
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
                    <small>Create your world.</small>
                  </button>
                ))}
              </div>
            </Section>
          </>
        );

      case "opacity":
        if (selectedTarget) {
          return (
            <Section
              title="SELECTED ELEMENT OPACITY"
              note={`Whole element opacity is the final multiplier. Background and content of ${selectedTarget.label} are applied inside it.`}
            >
              <RangeField
                label={`WHOLE ELEMENT${selectedElementOpacitySource}`}
                value={selectedEffectiveElementOpacity}
                min={0}
                max={1}
                step={0.05}
                defaultValue={selectedInheritedElementOpacity}
                onChange={(elementOpacity) => patchSelectedStyle({ elementOpacity })}
              />
              <RangeField
                label="BACKGROUND"
                value={selectedVisualStyle?.backgroundOpacity ?? selectedVisualStyle?.opacity ?? 1}
                min={0}
                max={1}
                step={0.05}
                defaultValue={1}
                onChange={(backgroundOpacity) => patchSelectedStyle({ backgroundOpacity })}
              />
              <RangeField
                label="CONTENT"
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
            title="TRANSPARENCY"
            note="Window opacity affects the complete launcher; the other controls only affect their layer."
          >
            <RangeField
              label="WHOLE WINDOW"
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
              label="PANELS"
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
              label="BUTTONS & CONTROLS"
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
            <Section title="ANIMATION ENGINE">
              <label className="studio-master-toggle">
                <div>
                  <strong>ENABLE ANIMATIONS</strong>
                  <span>Disabling this also removes small interface transitions.</span>
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
                label="INTERFACE FEEL"
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
                label="LAUNCHER OPEN"
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
                  REPLAY OPENING ON MAIN WINDOW
                </button>
              </div>
            </Section>

            <Section
              title="TAB TRANSITIONS"
              note="A transition belongs to the tab being entered, regardless of where you came from."
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
                  ONE FOR ALL
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
                  PER TAB
                </button>
              </div>

              {draft.motion.tabMode === "global" ? (
                <SelectField<TabAnimationId>
                  label="EVERY TAB"
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
              title="CLOSE BEHAVIOR"
              note="The window button and Alt+F4 can use different effects."
            >
              <SelectField<CloseAnimationId>
                label="CLOSE BUTTON"
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
                label="ALT + F4 / SYSTEM CLOSE"
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
                  REPLAY CLOSE BUTTON
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
                  REPLAY ALT + F4
                </button>
              </div>
            </Section>
          </>
        );
    }
  };

  return (
    <div className="appearance-studio-window">
      <header
        className="appearance-studio-titlebar"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          if (studioWindow) void studioWindow.startDragging();
        }}
      >
        <div>
          <span>SCREENLAUNCHER / SYSTEM</span>
          <strong>APPEARANCE STUDIO</strong>
        </div>
        <div className="appearance-studio-window-actions">
          <button type="button" onClick={() => void studioWindow?.minimize()}>
            MINIMIZE
          </button>
          <button type="button" onClick={() => void closeStudio()}>
            CLOSE
          </button>
        </div>
      </header>

      <div className="appearance-studio-body">
        <nav className="appearance-studio-categories">
          {CATEGORIES.map((item) => (
            <button
              type="button"
              key={item.id}
              className={!elementListOpen && category === item.id ? "active" : ""}
              onClick={() => selectCategory(item.id)}
            >
              <span>{item.index}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </div>
            </button>
          ))}
          <button
            type="button"
            className={`appearance-element-nav${!elementListOpen && category === "element" ? " active" : ""}`}
            onClick={() => selectCategory("element")}
          >
            <span>07</span>
            <div>
              <strong>ELEMENT</strong>
              <small>
                {selectedTarget ? "Text, layout and effects" : "Pick and inspect an object"}
              </small>
            </div>
          </button>
          {draft.elementOverrides.length > 0 && (
            <button
              type="button"
              className={`appearance-customized-nav${elementListOpen ? " active" : ""}`}
              onClick={openElementList}
            >
              <span>08</span>
              <div>
                <strong>
                  CUSTOMIZED <em>{draft.elementOverrides.length}</em>
                </strong>
                <small>Individual element styles</small>
              </div>
            </button>
          )}
        </nav>

        <main className="appearance-studio-editor">
          <div className="appearance-live-link">
            <span>LIVE LINK</span>
            <div>
              <strong>MAIN LAUNCHER WINDOW</strong>
              <small>Every change is applied to the real window immediately.</small>
            </div>
            <i aria-hidden="true" />
          </div>
          <div className="appearance-target-bar">
            <span>EDIT TARGET</span>
            <div>
              <button
                type="button"
                className={!selectedTarget ? "active" : ""}
                onClick={selectWholeLauncher}
              >
                WHOLE LAUNCHER
              </button>
              <button
                type="button"
                className={selectedTarget ? "active" : ""}
                onClick={requestElementPick}
              >
                {pickingElement
                  ? "SHIFT+CLICK · CLICK ONCE TO FINISH"
                  : "PICK ELEMENT · SHIFT MULTI"}
              </button>
            </div>
            <strong title={selectedTargets.map((target) => target.label).join(", ")}>
              {selectedTargets.length > 1
                ? `${selectedTargets.length} ELEMENTS SELECTED`
                : selectedTarget?.label || "GLOBAL SETTINGS"}
            </strong>
            {selectedTarget && (
              <button
                type="button"
                className="appearance-target-clear"
                onClick={clearSelectedStyle}
                disabled={!selectedOverride}
              >
                {selectedTargets.length > 1 ? "RESET ELEMENTS" : "RESET ELEMENT"}
              </button>
            )}
            {selectedTarget && (
              <section className="appearance-interaction-state">
                <span>VISUAL STATE</span>
                <div>
                  <button
                    type="button"
                    className={elementInteractionState === "normal" ? "active" : ""}
                    onClick={() => setElementInteractionState("normal")}
                  >
                    NORMAL · BEFORE HOVER
                  </button>
                  <button
                    type="button"
                    className={elementInteractionState === "hover" ? "active" : ""}
                    onClick={() => setElementInteractionState("hover")}
                  >
                    HOVER · POINTER OVER
                  </button>
                </div>
                <small>
                  {elementInteractionState === "hover"
                    ? "The selected launcher element is pinned in hover preview."
                    : "These values define the element before the pointer enters it."}
                </small>
                <button
                  type="button"
                  className="appearance-interaction-reset"
                  disabled={!selectedInteractionCustomized}
                  onClick={clearSelectedInteractionStyle}
                >
                  RESET {elementInteractionState.toUpperCase()}
                </button>
              </section>
            )}
          </div>
          {elementListOpen ? (
            <CustomScrollArea className="appearance-element-list-scroll">
              <div className="appearance-element-list">
                <header>
                  <span>INDIVIDUAL ELEMENTS</span>
                  <strong>{draft.elementOverrides.length} CUSTOMIZED</strong>
                  <p>Choose an object to open its launcher tab and highlight it.</p>
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
                          {override.tab ? TAB_TITLE[override.tab] : "ALL TABS"}
                        </span>
                        <strong>{override.label}</strong>
                        <small>OPEN TAB & HIGHLIGHT →</small>
                      </button>
                      <div className="appearance-element-list-badges">
                        {elementStyleBadges(override).map((badge) => (
                          <span key={badge.label}>
                            {badge.color && (
                              <i style={{ backgroundColor: badge.color }} aria-hidden="true" />
                            )}
                            <b>{badge.label}</b>
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
              <div ref={controlsRef} className="appearance-studio-controls">
                {renderEditor()}
              </div>
            </CustomScrollArea>
          )}

          <footer className="appearance-studio-actions">
            <span className={message.includes("COULD NOT") ? "error" : ""}>{message}</span>
            <div>
              <button type="button" onClick={reset}>
                RESET DRAFT
              </button>
              <button type="button" className="primary" onClick={save}>
                SAVE APPEARANCE
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
