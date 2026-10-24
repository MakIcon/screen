import { useRef } from "react";
import { useMainAppearanceRuntime } from "./useMainAppearanceRuntime";
import type { AppearanceProfile } from "./types";
import type { TabKey } from "../types";

const ignorePreview = () => {};

/** Standalone launcher windows participate in the same picker and saved profiles. */
export function useStandaloneAppearanceRuntime<Element extends HTMLElement = HTMLDivElement>(
  appearance: AppearanceProfile,
  activeTab: TabKey,
) {
  const rootRef = useRef<Element>(null);
  useMainAppearanceRuntime({
    rootRef,
    appearance,
    activeTab,
    onAnimationPreview: ignorePreview,
    onRevealTarget: ignorePreview,
    onDrawingCursor: ignorePreview,
  });
  return rootRef;
}
