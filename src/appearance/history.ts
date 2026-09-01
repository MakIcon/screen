import type { AppearanceProfile } from "./types";

export const APPEARANCE_HISTORY_LIMIT = 100;

type AppearanceHistoryShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export function getAppearanceHistoryShortcut(
  event: AppearanceHistoryShortcutEvent,
): "undo" | "redo" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (event.code === "KeyZ") return event.shiftKey ? "redo" : "undo";
  if (event.code === "KeyY" && !event.shiftKey) return "redo";
  return null;
}

export type AppearanceHistoryState = {
  past: AppearanceProfile[];
  present: AppearanceProfile;
  future: AppearanceProfile[];
};

export type AppearanceHistoryAction =
  | {
      type: "apply";
      update: (current: AppearanceProfile) => AppearanceProfile;
      /** False updates the live result without adding another undo checkpoint. */
      record?: boolean;
    }
  | {
      type: "replace";
      update: (current: AppearanceProfile) => AppearanceProfile;
    }
  | { type: "undo" }
  | { type: "redo" };

export function createAppearanceHistory(initial: AppearanceProfile): AppearanceHistoryState {
  return {
    past: [],
    present: initial,
    future: [],
  };
}

export function appearanceHistoryReducer(
  state: AppearanceHistoryState,
  action: AppearanceHistoryAction,
): AppearanceHistoryState {
  switch (action.type) {
    case "apply": {
      const next = action.update(state.present);
      if (next === state.present) return state;

      if (action.record === false) {
        return {
          ...state,
          present: next,
          future: [],
        };
      }

      return {
        past: [...state.past, state.present].slice(-APPEARANCE_HISTORY_LIMIT),
        present: next,
        future: [],
      };
    }
    case "replace": {
      const next = action.update(state.present);
      if (next === state.present) return state;
      return { ...state, present: next };
    }
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        past: [...state.past, state.present].slice(-APPEARANCE_HISTORY_LIMIT),
        present: next,
        future: state.future.slice(1),
      };
    }
  }
}
