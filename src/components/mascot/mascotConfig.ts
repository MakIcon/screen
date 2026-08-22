import type { MascotEmotion } from "./mascotTypes";

export const MASCOT_SIZE = 64;
export const ROAM_INTERVAL_MS = 3_800;
export const WALK_SPEED = 205;
export const RUN_SPEED = 355;
export const CHAOS_SPEED = 1_600;
export const THROW_THRESHOLD = 1.15;
export const THROW_HISTORY_MS = 11_000;
export const THROWS_TO_CHAOS = 3;
export const MISCHIEF_DECAY_MS = 8_000;
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
