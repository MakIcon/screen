import type { CSSProperties } from "react";
import angrySprite from "../../assets/mascot/sprites/angry.png";
import confusedSprite from "../../assets/mascot/sprites/confused.png";
import coolSprite from "../../assets/mascot/sprites/cool.png";
import excitedSprite from "../../assets/mascot/sprites/excited.png";
import happySprite from "../../assets/mascot/sprites/happy.png";
import loveSprite from "../../assets/mascot/sprites/love.png";
import neutralSprite from "../../assets/mascot/sprites/neutral.png";
import sadSprite from "../../assets/mascot/sprites/sad.png";
import shySprite from "../../assets/mascot/sprites/shy.png";
import sleepySprite from "../../assets/mascot/sprites/sleepy.png";
import surprisedSprite from "../../assets/mascot/sprites/surprised.png";
import leftArmPiskel from "../../assets/mascot/hands/left-arm.piskel?raw";
import pointHandPiskel from "../../assets/mascot/hands/point-hand.piskel?raw";
import rightArmPiskel from "../../assets/mascot/hands/right-arm.piskel?raw";
import scrollHandPiskel from "../../assets/mascot/hands/scroll-hand.piskel?raw";
import smoke1Piskel from "../../assets/mascot/effects/smoke1.piskel?raw";
import smoke2Piskel from "../../assets/mascot/effects/smoke2.piskel?raw";
import smoke3Piskel from "../../assets/mascot/effects/smoke3.piskel?raw";
import smoke4Piskel from "../../assets/mascot/effects/smoke4.piskel?raw";
import mouth1Piskel from "../../assets/mascot/mouth/mouth1.piskel?raw";
import mouth2Piskel from "../../assets/mascot/mouth/mouth2.piskel?raw";
import mouth3Piskel from "../../assets/mascot/mouth/mouth3.piskel?raw";
import mouth4Piskel from "../../assets/mascot/mouth/mouth4.piskel?raw";
import bowlFullPiskel from "../../assets/mascot/bowl/bowl-full.piskel?raw";
import bowlEmptyPiskel from "../../assets/mascot/bowl/bowl-empty.piskel?raw";
import dropNormalPiskel from "../../assets/mascot/bowl/drop-normal.piskel?raw";
import dropSmallPiskel from "../../assets/mascot/bowl/drop-small.piskel?raw";
import puddlePiskel from "../../assets/mascot/bowl/puddle.piskel?raw";
import type { MascotEmotion, PiskelAsset } from "./mascotTypes";

export const MASCOT_SPRITES: Record<MascotEmotion, string> = {
  angry: angrySprite,
  confused: confusedSprite,
  cool: coolSprite,
  excited: excitedSprite,
  happy: happySprite,
  love: loveSprite,
  neutral: neutralSprite,
  sad: sadSprite,
  shy: shySprite,
  sleepy: sleepySprite,
  surprised: surprisedSprite,
};

function parsePiskelAsset(source: string): PiskelAsset {
  const document = JSON.parse(source) as {
    piskel: { width: number; height: number; layers: string[] };
  };
  const layer = JSON.parse(document.piskel.layers[0]) as {
    chunks: Array<{ base64PNG: string }>;
  };
  return {
    width: document.piskel.width,
    height: document.piskel.height,
    src: layer.chunks[0].base64PNG,
  };
}

export const HAND_ASSETS = {
  point: parsePiskelAsset(pointHandPiskel),
  left: parsePiskelAsset(leftArmPiskel),
  right: parsePiskelAsset(rightArmPiskel),
  scroll: parsePiskelAsset(scrollHandPiskel),
} as const;

export const SMOKE_FRAMES = [smoke1Piskel, smoke2Piskel, smoke3Piskel, smoke4Piskel].map(
  parsePiskelAsset,
);
export const MOUTH_FRAMES = [mouth1Piskel, mouth2Piskel, mouth3Piskel, mouth4Piskel].map(
  parsePiskelAsset,
);
export const BOWL_ASSETS = {
  full: parsePiskelAsset(bowlFullPiskel),
  empty: parsePiskelAsset(bowlEmptyPiskel),
  dropNormal: parsePiskelAsset(dropNormalPiskel),
  dropSmall: parsePiskelAsset(dropSmallPiskel),
  puddle: parsePiskelAsset(puddlePiskel),
} as const;
export const TYPED_SNIPPETS = [
  "hello world",
  "sudo rm -rf /",
  "01001000 01001001",
  "todo: nothing",
  ":)))",
  "why am i here",
  "print('mrrp')",
  "npm run vibes",
];

export function PiskelSprite({
  asset,
  className,
  style,
}: {
  asset: PiskelAsset;
  className: string;
  style?: CSSProperties;
}) {
  return (
    <img
      className={className}
      src={asset.src}
      width={asset.width * 2}
      height={asset.height * 2}
      style={style}
      draggable={false}
      alt=""
      aria-hidden="true"
    />
  );
}
