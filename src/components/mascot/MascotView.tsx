import type { CSSProperties, KeyboardEventHandler, PointerEventHandler, RefObject } from "react";
import {
  BOWL_ASSETS,
  HAND_ASSETS,
  MASCOT_SPRITES,
  MOUTH_FRAMES,
  PiskelSprite,
  SMOKE_FRAMES,
} from "./mascotAssets";
import { THROWS_TO_CHAOS } from "./mascotConfig";
import type {
  CarriedElement,
  BowlSpill,
  BowlStatus,
  LooseButtonTransform,
  MascotEmotion,
  MascotPhase,
  MascotPosition,
} from "./mascotTypes";
import { useTranslation } from "../../i18n/locale";

interface MascotViewProps {
  layerRef: RefObject<HTMLDivElement | null>;
  characterRef: RefObject<HTMLDivElement | null>;
  replicaRef: RefObject<HTMLDivElement | null>;
  looseButtonReplicaRef: RefObject<HTMLDivElement | null>;
  eatReplicaRef: RefObject<HTMLDivElement | null>;
  position: MascotPosition;
  name: string;
  showName: boolean;
  phase: MascotPhase;
  emotion: MascotEmotion;
  carriedButton: CarriedElement | null;
  looseButton: CarriedElement | null;
  looseButtonTransform: LooseButtonTransform;
  ragePress: MascotPosition | null;
  scrollHand: MascotPosition | null;
  undoAvailable: boolean;
  modalForeground: boolean;
  throwProgress: number;
  smoke: { x: number; y: number; frame: number } | null;
  mouthFrame: number | null;
  speech: string | null;
  bowlStatus: BowlStatus;
  bowlPosition: MascotPosition;
  bowlDragging: boolean;
  bowlRotation: number;
  bowlSpill: BowlSpill | null;
  onUndoChaos: () => void;
  onClick: () => void;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerFinish: PointerEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onBowlPointerDown: PointerEventHandler<HTMLDivElement>;
  onBowlPointerMove: PointerEventHandler<HTMLDivElement>;
  onBowlPointerFinish: PointerEventHandler<HTMLDivElement>;
  onBowlKeyDown: KeyboardEventHandler<HTMLDivElement>;
}

export function MascotView({
  layerRef,
  characterRef,
  replicaRef,
  looseButtonReplicaRef,
  eatReplicaRef,
  position,
  name,
  showName,
  phase,
  emotion,
  carriedButton,
  looseButton,
  looseButtonTransform,
  ragePress,
  scrollHand,
  undoAvailable,
  modalForeground,
  throwProgress,
  smoke,
  mouthFrame,
  speech,
  bowlStatus,
  bowlPosition,
  bowlDragging,
  bowlRotation,
  bowlSpill,
  onUndoChaos,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerFinish,
  onKeyDown,
  onBowlPointerDown,
  onBowlPointerMove,
  onBowlPointerFinish,
  onBowlKeyDown,
}: MascotViewProps) {
  const tr = useTranslation();
  const style = {
    transform: `translate3d(${position.x.toFixed(2)}px, ${position.y.toFixed(2)}px, 0)`,
  } satisfies CSSProperties;

  return (
    <div
      ref={layerRef}
      className={`launcher-mascot-layer ${modalForeground ? "launcher-mascot-layer--foreground" : ""}`}
    >
      {undoAvailable && (
        <button className="launcher-mascot-undo" type="button" onClick={onUndoChaos}>
          <span aria-hidden="true">↶</span>
          {tr("mascot.undoMascotChanges")}
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

      {bowlSpill && (
        <div
          key={bowlSpill.id}
          className="launcher-mascot-spill"
          style={{ left: bowlSpill.x, top: bowlSpill.y }}
          aria-hidden="true"
        >
          {bowlSpill.drops.map((drop) => {
            return (
              <PiskelSprite
                key={`${bowlSpill.id}-${drop.id}`}
                asset={drop.kind === "normal" ? BOWL_ASSETS.dropNormal : BOWL_ASSETS.dropSmall}
                className={`launcher-mascot-spill-drop launcher-mascot-spill-drop--${drop.kind}`}
                style={{
                  opacity: drop.opacity,
                  transform: `translate3d(${drop.x.toFixed(2)}px, ${drop.y.toFixed(2)}px, 0) rotate(${drop.rotation.toFixed(2)}deg) scale(${drop.scale.toFixed(3)})`,
                }}
              />
            );
          })}
          {bowlSpill.puddleVisible && (
            <PiskelSprite
              asset={BOWL_ASSETS.puddle}
              className="launcher-mascot-puddle"
              style={
                {
                  "--puddle-x": `${bowlSpill.puddleX.toFixed(2)}px`,
                  "--puddle-y": `${bowlSpill.floorY.toFixed(2)}px`,
                } as CSSProperties
              }
            />
          )}
        </div>
      )}

      {bowlStatus !== "hidden" && (
        <div
          className={`launcher-mascot-bowl launcher-mascot-bowl--${bowlStatus}${bowlDragging ? " launcher-mascot-bowl--dragging" : ""}`}
          style={{
            transform: `translate3d(${bowlPosition.x.toFixed(2)}px, ${bowlPosition.y.toFixed(2)}px, 0) rotate(${bowlRotation.toFixed(2)}deg)`,
          }}
          role={bowlStatus === "full" ? "button" : undefined}
          aria-label={
            bowlStatus === "full"
              ? tr("mascot.theMascotsFullBowl")
              : tr("mascot.theMascotsEmptyBowl")
          }
          aria-disabled={bowlStatus !== "full"}
          tabIndex={bowlStatus === "full" ? 0 : -1}
          onPointerDown={onBowlPointerDown}
          onPointerMove={onBowlPointerMove}
          onPointerUp={onBowlPointerFinish}
          onPointerCancel={onBowlPointerFinish}
          onKeyDown={onBowlKeyDown}
        >
          <PiskelSprite
            asset={bowlStatus === "full" ? BOWL_ASSETS.full : BOWL_ASSETS.empty}
            className="launcher-mascot-bowl-sprite"
          />
          {bowlStatus === "full" && (
            <span className="launcher-mascot-bowl-tooltip" aria-hidden="true">
              {tr("mascot.pickUpAndThrow")}
            </span>
          )}
        </div>
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
        data-mascot-name={name}
        role="button"
        aria-label={
          phase === "sleeping"
            ? tr("mascot.isAsleepClickTo", { name })
            : carriedButton
              ? tr("mascot.isCarryingAButton", { name })
              : tr("mascot.clickToPetOr", { name })
        }
        tabIndex={0}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerFinish}
        onPointerCancel={onPointerFinish}
        onKeyDown={onKeyDown}
      >
        {showName && (
          <span className="launcher-mascot-nameplate" aria-hidden="true">
            <span>{name}</span>
          </span>
        )}
        {throwProgress > 0 && throwProgress <= THROWS_TO_CHAOS && (
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
            ? tr("mascot.clickToWakeUp")
            : carriedButton
              ? tr("mascot.clickToReturnThe")
              : tr("mascot.petOrThrowThe")}
        </span>
      </div>
    </div>
  );
}
