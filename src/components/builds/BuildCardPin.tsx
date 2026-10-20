import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import pinIconUrl from "../../assets/pin.svg";
import { BuildCardResizeHandle } from "./BuildCardResizeHandle";
import {
  BUILD_CARD_PIN_ELEMENT_ID,
  getBuildCardElementStyle,
  type BuildCardAppearance,
  type BuildCardPinAnchor,
} from "./BuildCardSettingsPopup";
import { useTranslation } from "../../i18n/locale";

export function PinIcon({ className = "" }: { className?: string }) {
  return (
    <span
      className={`pin-icon ${className}`.trim()}
      style={{ "--pin-icon-url": `url("${pinIconUrl}")` } as CSSProperties}
      aria-hidden="true"
    />
  );
}

type Props = {
  appearance: BuildCardAppearance;
  pinned?: boolean;
  movable?: boolean;
  selected?: boolean;
  onAnchorChange?: (anchor: BuildCardPinAnchor) => void;
};

export function BuildCardPin({
  appearance,
  pinned = true,
  movable = false,
  selected = false,
  onAnchorChange,
}: Props) {
  const tr = useTranslation();
  const pinRef = useRef<HTMLSpanElement>(null);
  const [card, setCard] = useState<HTMLElement | null>(null);
  const [capturedAnchor, setCapturedAnchor] = useState<BuildCardPinAnchor | null>(null);
  const anchor = onAnchorChange ? appearance.pinAnchor : (appearance.pinAnchor ?? capturedAnchor);

  useLayoutEffect(() => {
    const pin = pinRef.current;
    const parentCard = pin?.closest<HTMLElement>(".instance-card");
    if (!pin || !parentCard || !pinned) return;
    setCard(parentCard);
    if (anchor) return;

    // Capture the old flex position once, after vertical alignment has settled.
    // Keep that origin on the card, independently of the RUNNING badge's layout.
    const frame = requestAnimationFrame(() => {
      const cardRect = parentCard.getBoundingClientRect();
      const pinRect = pin.getBoundingClientRect();
      const cardStyle = getComputedStyle(parentCard);
      const offset = appearance.layoutOffsets[BUILD_CARD_PIN_ELEMENT_ID] ?? { x: 0, y: 0 };
      const nextAnchor = {
        right: cardRect.right - parseFloat(cardStyle.borderRightWidth) - pinRect.left + offset.x,
        top: pinRect.top - offset.y - cardRect.top - parseFloat(cardStyle.borderTopWidth),
      };
      setCapturedAnchor(nextAnchor);
      onAnchorChange?.(nextAnchor);
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor, pinned, appearance.layoutOffsets, appearance.elementScales, onAnchorChange]);

  if (!pinned) return null;

  const offset = appearance.layoutOffsets[BUILD_CARD_PIN_ELEMENT_ID] ?? { x: 0, y: 0 };
  const style: CSSProperties | undefined = anchor
    ? {
        ...getBuildCardElementStyle(appearance, BUILD_CARD_PIN_ELEMENT_ID),
        position: "absolute",
        left: `calc(100% - ${anchor.right}px + ${offset.x}px)`,
        top: `${anchor.top + offset.y}px`,
        marginLeft: 0,
      }
    : getBuildCardElementStyle(appearance, BUILD_CARD_PIN_ELEMENT_ID);

  const pin = (
    <span
      ref={pinRef}
      className={`instance-pin-badge${movable ? " build-card-movable" : ""}${movable && selected ? " build-card-movable--selected" : ""}`}
      data-card-layout-element
      data-card-move-id={movable ? BUILD_CARD_PIN_ELEMENT_ID : undefined}
      tabIndex={movable ? 0 : undefined}
      style={style}
      data-tooltip={movable ? undefined : tr("buildCardPin.pinnedBuild")}
      aria-label={tr("buildCardPin.pinnedBuild")}
    >
      <PinIcon />
      {movable && selected && (
        <BuildCardResizeHandle appearance={appearance} id={BUILD_CARD_PIN_ELEMENT_ID} />
      )}
    </span>
  );
  return card && anchor ? createPortal(pin, card) : pin;
}
