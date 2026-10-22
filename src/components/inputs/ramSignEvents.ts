/**
 * Dispatched on a `.ram-warning-sign` to knock it loose or swing it, e.g. by the mascot landing
 * on it. `detail` is a velocity in pixels per second.
 */
export const RAM_SIGN_PUSH_EVENT = "ram-warning-sign-push";
export type RamSignPushDetail = { x: number; y: number };
