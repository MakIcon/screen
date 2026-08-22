import type { CSSProperties, KeyboardEventHandler, PointerEventHandler, RefObject } from "react";
import {
  HAND_ASSETS,
  MASCOT_SPRITES,
  MOUTH_FRAMES,
  PiskelSprite,
  SMOKE_FRAMES,
} from "./mascotAssets";
import { THROWS_TO_CHAOS } from "./mascotConfig";
import type {
  CarriedElement,
  LooseButtonTransform,
  MascotEmotion,
  MascotPhase,
  MascotPosition,
} from "./mascotTypes";

interface MascotViewProps {
  layerRef: RefObject<HTMLDivElement | null>;
  characterRef: RefObject<HTMLDivElement | null>;
  replicaRef: RefObject<HTMLDivElement | null>;
  looseButtonReplicaRef: RefObject<HTMLDivElement | null>;
  eatReplicaRef: RefObject<HTMLDivElement | null>;
  position: MascotPosition;
  phase: MascotPhase;
  emotion: MascotEmotion;
  carriedButton: CarriedElement | null;
  looseButton: CarriedElement | null;
  looseButtonTransform: LooseButtonTransform;
  ragePress: MascotPosition | null;
  scrollHand: MascotPosition | null;
  chaosActive: boolean;
  modalForeground: boolean;
  throwProgress: number;
  smoke: { x: number; y: number; frame: number } | null;
  mouthFrame: number | null;
  speech: string | null;
  onUndoChaos: () => void;
  onClick: () => void;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerFinish: PointerEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
}

export function MascotView({
  layerRef,
  characterRef,
  replicaRef,
  looseButtonReplicaRef,
  eatReplicaRef,
  position,
  phase,
  emotion,
  carriedButton,
  looseButton,
  looseButtonTransform,
  ragePress,
  scrollHand,
  chaosActive,
  modalForeground,
  throwProgress,
  smoke,
  mouthFrame,
  speech,
  onUndoChaos,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerFinish,
  onKeyDown,
}: MascotViewProps) {
  const style = {
    transform: `translate3d(${position.x.toFixed(2)}px, ${position.y.toFixed(2)}px, 0)`,
  } satisfies CSSProperties;

  return (
    <div
      ref={layerRef}
      className={`launcher-mascot-layer ${modalForeground ? "launcher-mascot-layer--foreground" : ""}`}
    >
      {chaosActive && (
        <button className="launcher-mascot-undo" type="button" onClick={onUndoChaos}>
          <span aria-hidden="true">↶</span>
          ОТКАТИТЬ ИЗМЕНЕНИЯ МАСКОТА
        </button>
      )}

      {ragePress && (
        <PiskelSprite
          asset={HAND_ASSETS.point}
          className="launcher-mascot-rage-hand"
          style={{ left: ragePress.x, top: ragePress.y }}
        />
      )}

      {scrollHand && (
        <PiskelSprite
          asset={HAND_ASSETS.scroll}
          className="launcher-mascot-scroll-hand"
          style={{ left: scrollHand.x, top: scrollHand.y }}
        />
      )}

      {looseButton && (
        <div
          ref={looseButtonReplicaRef}
          className="launcher-mascot-loose-button"
          style={{
            width: looseButton.width,
            height: looseButton.height,
            transform: `translate3d(${looseButtonTransform.x.toFixed(2)}px, ${looseButtonTransform.y.toFixed(2)}px, 0) rotate(${looseButtonTransform.rotation.toFixed(2)}deg)`,
          }}
          aria-hidden="true"
        />
      )}

      {smoke && (
        <img
          className="launcher-mascot-smoke"
          src={SMOKE_FRAMES[smoke.frame].src}
          style={{ transform: `translate3d(${smoke.x.toFixed(2)}px, ${smoke.y.toFixed(2)}px, 0)` }}
          alt=""
          draggable={false}
          aria-hidden="true"
        />
      )}

      <div
        ref={characterRef}
        className={`launcher-mascot-character launcher-mascot-character--${phase}`}
        style={style}
        data-emotion={emotion}
        role="button"
        aria-label={
          phase === "sleeping"
            ? "Маскот спит. Нажмите на него, чтобы разбудить."
            : carriedButton
              ? "Маскот несёт кнопку. Нажмите, чтобы вернуть её."
              : "Маскот. Нажмите, чтобы погладить, или перетащите и бросьте."
        }
        tabIndex={0}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerFinish}
        onPointerCancel={onPointerFinish}
        onKeyDown={onKeyDown}
      >
        {throwProgress > 0 && throwProgress < THROWS_TO_CHAOS && (
          <span className="launcher-mascot-mischief" aria-hidden="true">
            {"!".repeat(throwProgress)}
          </span>
        )}
        {speech !== null && (
          <span className="launcher-mascot-speech" aria-hidden="true">
            <span className="launcher-mascot-speech-text">{speech}</span>
            <span className="launcher-mascot-speech-caret" />
          </span>
        )}
        {phase === "sleeping" && (
          <span className="launcher-mascot-sleep-z" aria-hidden="true">
            <span>z</span>
            <span>Z</span>
          </span>
        )}
        {carriedButton && phase !== "eating" && (
          <span
            className="launcher-mascot-cargo"
            style={{ width: carriedButton.width, height: carriedButton.height }}
            aria-hidden="true"
          >
            <PiskelSprite
              asset={HAND_ASSETS.left}
              className="launcher-mascot-arm launcher-mascot-arm--left"
            />
            <div ref={replicaRef} className="launcher-mascot-button-replica" />
            <PiskelSprite
              asset={HAND_ASSETS.right}
              className="launcher-mascot-arm launcher-mascot-arm--right"
            />
          </span>
        )}
        <img
          className="launcher-mascot-body"
          src={mouthFrame !== null ? MOUTH_FRAMES[mouthFrame].src : MASCOT_SPRITES[emotion]}
          alt=""
          draggable={false}
          aria-hidden="true"
        />
        {carriedButton && phase === "eating" && (
          <div
            ref={eatReplicaRef}
            className="launcher-mascot-eat"
            style={{
              width: carriedButton.width,
              height: carriedButton.height,
              transform: `translate(-50%, -50%) scale(${(
                (26 / Math.max(1, carriedButton.width)) *
                (0.55 + (mouthFrame ?? 0) * 0.15)
              ).toFixed(3)})`,
              opacity: (mouthFrame ?? 0) === 0 ? 0 : 1,
            }}
            aria-hidden="true"
          />
        )}
        {phase === "typing" && (
          <span className="launcher-mascot-keyboard" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        )}
        <span className="launcher-mascot-tooltip" aria-hidden="true">
          {phase === "sleeping"
            ? "Нажми, чтобы разбудить"
            : carriedButton
              ? "Нажми, чтобы вернуть кнопку"
              : "Погладь или брось маскота"}
        </span>
      </div>
    </div>
  );
}
