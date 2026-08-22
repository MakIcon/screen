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
export type ChangedToggle = { label: string; wasEnabled: boolean };
export type ChaosDebris = {
  source: HTMLElement;
  clone: HTMLElement;
  previousAriaHidden: string | null;
};
export type ChaosSnapshot = {
  originalTabIndex: number;
  toggles: ChangedToggle[];
};

export interface LauncherMascotProps {
  activeIndex: number;
  enabled: boolean;
}
