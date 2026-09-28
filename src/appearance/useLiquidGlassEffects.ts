import { useEffect, type RefObject } from "react";
import { LIQUID_GLASS_ATTRIBUTE } from "./elementOverrides";
import type { AppearanceElementOverride } from "./types";

type LiquidGlassHandle = { destroy: () => void };

/**
 * Bridges persisted element presets to @ybouane/liquidglass. Each selected
 * element's parent becomes a small capture root, satisfying the library's
 * direct-child requirement without changing the launcher's DOM structure.
 */
export function useLiquidGlassEffects(
  rootRef: RefObject<HTMLElement | null>,
  overrides: AppearanceElementOverride[],
) {
  const signature = overrides
    .filter((override) => override.style.liquidGlass)
    .map((override) => JSON.stringify([override.id, override.text, override.style]))
    .join("|");

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !signature) return;

    let cancelled = false;
    let handles: LiquidGlassHandle[] = [];
    const timer = window.setTimeout(() => {
      void (async () => {
        const { LiquidGlass, invalidateFontEmbedCache } = await import("@ybouane/liquidglass");
        if (cancelled) return;
        invalidateFontEmbedCache();
        await document.fonts.ready;

        const groups = new Map<HTMLElement, HTMLElement[]>();
        root
          .querySelectorAll<HTMLElement>(`[${LIQUID_GLASS_ATTRIBUTE}="true"]`)
          .forEach((element) => {
            const parent = element.parentElement;
            if (!parent) return;
            const siblings = groups.get(parent) ?? [];
            siblings.push(element);
            groups.set(parent, siblings);
          });

        const created = await Promise.all(
          [...groups].map(async ([captureRoot, glassElements]) => {
            const handle = await LiquidGlass.init({ root: captureRoot, glassElements });
            glassElements.forEach((element) => {
              const injectedCanvas = element.firstElementChild;
              if (injectedCanvas instanceof HTMLCanvasElement) {
                injectedCanvas.dataset.appearanceLiquidGlassCanvas = "true";
                injectedCanvas.setAttribute("aria-hidden", "true");
              }
            });
            return handle;
          }),
        );
        if (cancelled) created.forEach((handle) => handle.destroy());
        else handles = created;
      })().catch((error: unknown) => {
        console.warn("Liquid glass effect could not start", error);
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      handles.forEach((handle) => handle.destroy());
      handles = [];
    };
  }, [rootRef, signature]);
}
