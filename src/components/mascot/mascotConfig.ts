import type { MascotEmotion } from "./mascotTypes";
import type { MascotSettings } from "../../types";

export const DEFAULT_MASCOT_SETTINGS: MascotSettings = {
  name: "PIXEL",
  showName: true,
  rageEnabled: true,
  bowlEnabled: true,
  movementEnabled: true,
  interactionsEnabled: true,
  carryElementsEnabled: true,
  scrollListsEnabled: true,
};

export const MASCOT_SIZE = 64;
export const ROAM_INTERVAL_MS = 3_800;
export const WALK_SPEED = 205;
export const RUN_SPEED = 355;
export const CHAOS_SPEED = 1_600;
// Pixels per millisecond. A normal release still throws the mascot, but only a
// deliberate, fast fling contributes to the rage warning above its head.
export const THROW_THRESHOLD = 1.8;
export function isHardMascotThrow(speed: number) {
  return Number.isFinite(speed) && speed >= THROW_THRESHOLD;
}
export const MAX_RAGE = 5;
export const RAGE_PER_HARD_THROW = 1;
export const RAGE_PER_BOWL_SPILL = 2;
// Kept as an alias because the view and existing behaviour use this name.
export const THROWS_TO_CHAOS = MAX_RAGE;
export function addMascotRage(current: number, amount: number) {
  if (!Number.isFinite(current) || !Number.isFinite(amount)) return 0;
  return Math.min(MAX_RAGE, Math.max(0, Math.floor(current) + Math.floor(amount)));
}
export const MISCHIEF_DECAY_MS = 8_000;
export const BOWL_SIZE = 48;
export const BOWL_HOME_POSITION = { x: 52, y: 184 } as const;
// A deliberate fling should empty the bowl; ordinary repositioning and quick
// hand-shaking only produce a few harmless droplets.
export const BOWL_THROW_THRESHOLD = 0.9;
export const BOWL_SHAKE_SPLASH_THRESHOLD = 0.55;
export const BOWL_SHAKE_SPLASH_COOLDOWN_MS = 900;
export function isBowlSpillThrow(speed: number) {
  return Number.isFinite(speed) && speed >= BOWL_THROW_THRESHOLD;
}
export function shouldSplashBowl(
  horizontalSpeed: number,
  changedDirection: boolean,
  timeSinceLastSplash: number,
) {
  return (
    changedDirection &&
    Number.isFinite(horizontalSpeed) &&
    Math.abs(horizontalSpeed) >= BOWL_SHAKE_SPLASH_THRESHOLD &&
    timeSinceLastSplash >= BOWL_SHAKE_SPLASH_COOLDOWN_MS
  );
}
export const BOWL_EMPTY_LIFETIME_MS = 7_000;
export const BOWL_RESPAWN_DELAY_MS = 1_800;
export const PUDDLE_LIFETIME_MS = 5_800;
export const MIN_STEAL_DELAY_MS = 18_000;
export const STEAL_DELAY_VARIANCE_MS = 14_000;
export const UNFOCUSED_SLEEP_DELAY_MS = 5_000;
export const STEAL_REACH_PX = 54;
export const MAX_CHAOS_DEBRIS = 14;
export const SCROLL_HAND_SIZE = 32;

export const SCROLLABLE_SELECTOR = [
  ".csa-content",
  ".installed-mods-list",
  ".mod-list",
  "[data-mascot-scrollable]",
].join(", ");

export const STEALABLE_SELECTOR = [
  "[data-mascot-stealable]",
  "button:not(:disabled)",
  ".mod-card",
  ".installed-mod-row",
  ".bme-row",
  ".instance-card",
  ".info-panel",
  ".detail-block",
  ".inline-dropdown",
  ".field",
  ".brs-section",
  ".settings-toggle-row",
].join(", ");

export const ROAMING_EMOTIONS: MascotEmotion[] = [
  "neutral",
  "happy",
  "cool",
  "confused",
  "excited",
  "love",
  "shy",
  "surprised",
];
