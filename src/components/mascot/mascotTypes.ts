import type { MascotSettings } from "../../types";

export type MascotEmotion =
  | "angry"
  | "confused"
  | "cool"
  | "excited"
  | "happy"
  | "love"
  | "neutral"
  | "sad"
  | "shy"
  | "sleepy"
  | "surprised";

export type MascotPhase =
  | "idle"
  | "sleeping"
  | "walking"
  | "running"
  | "dragging"
  | "thrown"
  | "petting"
  | "carrying"
  | "climbing"
  | "jumping"
  | "playing"
  | "scrolling"
  | "chaos"
  | "trick"
  | "eating"
  | "drinking"
  | "sulking"
  | "typing"
  | "yawn"
  | "stretch"
  | "scratch"
  | "struggle"
  | "wallslide";

export type MascotPosition = { x: number; y: number };
export type PointerSample = MascotPosition & { time: number };
export type LooseButtonTransform = MascotPosition & { rotation: number };
export type PiskelAsset = { width: number; height: number; src: string };
export type BowlStatus = "full" | "empty" | "hidden";
export type BowlDrop = MascotPosition & {
  id: number;
  kind: "normal" | "small";
  rotation: number;
  scale: number;
  opacity: number;
};
export type BowlSpill = MascotPosition & {
  id: number;
  puddleVisible: boolean;
  puddleX: number;
  floorY: number;
  drops: BowlDrop[];
};

export type BowlDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
  lastDirection: number;
  lastSplashAt: number;
  samples: PointerSample[];
};

export type CarriedElement = {
  element: HTMLElement;
  width: number;
  height: number;
  previousAriaHidden: string | null;
};

export type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
  shakeTurns: number;
  lastDirection: number;
  samples: PointerSample[];
};

export type SleepingDragState = { wokeFromShake: boolean };
export type ChaosDebris = {
  source: HTMLElement;
  clone: HTMLElement;
  previousAriaHidden: string | null;
};
export type ChaosSnapshot = {
  originalTabIndex: number;
  /** Undoes for the purely visual mischief; rage never changes real settings. */
  restores: Array<() => void>;
};

export interface LauncherMascotProps {
  activeIndex: number;
  enabled: boolean;
  settings: MascotSettings;
}
