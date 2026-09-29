import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { BuildCardAppearance } from "./BuildCardSettingsPopup";

type Props = {
  appearance: BuildCardAppearance;
  children: ReactNode;
  freeze?: boolean;
};

export function BuildCardVerticalBody({ appearance, children, freeze = false }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef(0);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const card = body?.parentElement;
    if (!body || !card || freeze) return;

    if (appearance.contentVerticalAlign === "top") {
      shiftRef.current = 0;
      setShift(0);
      return;
    }

    const updateShift = () => {
      const cardRect = card.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const previousShift = shiftRef.current;
      let visualTop = bodyRect.top - previousShift;
      let visualBottom = bodyRect.bottom - previousShift;

      body.querySelectorAll<HTMLElement>("[data-card-layout-element]").forEach((element) => {
        const rect = element.getBoundingClientRect();
        visualTop = Math.min(visualTop, rect.top - previousShift);
        visualBottom = Math.max(visualBottom, rect.bottom - previousShift);
      });

      const style = getComputedStyle(card);
      const innerTop =
        cardRect.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
      const innerBottom =
        cardRect.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
      const minShift = innerTop - visualTop;
      const maxShift = innerBottom - visualBottom;
      const desiredShift =
        appearance.contentVerticalAlign === "center"
          ? (innerTop + innerBottom - visualTop - visualBottom) / 2
          : maxShift;
      const nextShift = Math.round(
        maxShift < minShift ? minShift : Math.max(minShift, Math.min(maxShift, desiredShift)),
      );

      if (nextShift === shiftRef.current) return;
      shiftRef.current = nextShift;
      setShift(nextShift);
    };

    const observer = new ResizeObserver(updateShift);
    const observeElements = () => {
      observer.disconnect();
      observer.observe(card);
      observer.observe(body);
      body.querySelectorAll<HTMLElement>("[data-card-layout-element]").forEach((element) => {
        observer.observe(element);
      });
      updateShift();
    };
    const mutationObserver = new MutationObserver(observeElements);
    mutationObserver.observe(body, { childList: true, subtree: true });
    observeElements();
    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
    };
  }, [appearance.contentVerticalAlign, appearance.layoutOffsets, appearance.contentTags, freeze]);

  return (
    <div
      ref={bodyRef}
      className="build-card-vertical-body"
      style={shift ? { transform: `translateY(${shift}px)` } : undefined}
    >
      {children}
    </div>
  );
}
