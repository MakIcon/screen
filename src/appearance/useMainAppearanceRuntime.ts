import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  APPEARANCE_ELEMENT_PICKED_EVENT,
  APPEARANCE_ELEMENT_PICK_CANCEL_EVENT,
  APPEARANCE_ELEMENT_PICK_REQUEST_EVENT,
  APPEARANCE_ELEMENT_PREVIEW_EVENT,
  APPEARANCE_ELEMENT_REVEAL_EVENT,
  APPEARANCE_DRAWING_CURSOR_EVENT,
  APPEARANCE_WINDOW_ANIMATION_PREVIEW_EVENT,
  applyElementAppearanceOverrides,
  beginElementPicker,
  type AppearanceElementPreviewPayload,
  type DrawingCursorPayload,
  type WindowAnimationPreviewPayload,
} from "./elementOverrides";
import type { AppearanceElementTarget, AppearanceProfile } from "./types";
import type { TabKey } from "../types";
import { APPEARANCE_PLACEHOLDER_VALUES_ATTRIBUTE } from "../utils/placeholders";

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

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    appearanceRef.current = appearance;
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
      });
    };

    const observer = new MutationObserver((mutations) => {
      const current = appearanceRef.current;
      const hasTextOverrides =
        current.customized &&
        current.elementOverrides.some((override) => override.text !== undefined);
      const relevant = mutations.some(
        (mutation) =>
          mutation.type === "childList" ||
          (hasTextOverrides &&
            (mutation.type === "characterData" || mutation.type === "attributes")),
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
  }, [rootRef]);

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
          (target: AppearanceElementTarget) => {
            pickerCleanupRef.current = null;
            void emit(APPEARANCE_ELEMENT_PICKED_EVENT, target).catch(() => {});
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
    };
  }, [activeTab, onAnimationPreview, onDrawingCursor, onRevealTarget, rootRef]);
}
