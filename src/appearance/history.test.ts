import { describe, expect, it } from "vitest";
import { createDefaultAppearance } from "./profile";
import {
  APPEARANCE_HISTORY_LIMIT,
  appearanceHistoryReducer,
  createAppearanceHistory,
  getAppearanceHistoryShortcut,
} from "./history";

describe("appearance history", () => {
  it("recognizes physical undo and redo keys independently of the active layout", () => {
    const shortcut = (code: string, shiftKey = false) =>
      getAppearanceHistoryShortcut({
        altKey: false,
        code,
        ctrlKey: true,
        metaKey: false,
        shiftKey,
      });

    expect(shortcut("KeyZ")).toBe("undo");
    expect(shortcut("KeyZ", true)).toBe("redo");
    expect(shortcut("KeyY")).toBe("redo");
  });

  it("undoes and redoes a profile change", () => {
    const initial = createDefaultAppearance("dark", true);
    const changedAccent = "#12abef";
    let history = createAppearanceHistory(initial);

    history = appearanceHistoryReducer(history, {
      type: "apply",
      update: (current) => ({
        ...current,
        colors: { ...current.colors, accent: changedAccent },
      }),
    });
    expect(history.present.colors.accent).toBe(changedAccent);

    history = appearanceHistoryReducer(history, { type: "undo" });
    expect(history.present.colors.accent).toBe(initial.colors.accent);

    history = appearanceHistoryReducer(history, { type: "redo" });
    expect(history.present.colors.accent).toBe(changedAccent);
  });

  it("clears redo history after a new edit", () => {
    const initial = createDefaultAppearance("light", true);
    let history = createAppearanceHistory(initial);
    history = appearanceHistoryReducer(history, {
      type: "apply",
      update: (current) => ({ ...current, shape: { radius: 18 } }),
    });
    history = appearanceHistoryReducer(history, { type: "undo" });
    history = appearanceHistoryReducer(history, {
      type: "apply",
      update: (current) => ({ ...current, shape: { radius: 3 } }),
    });

    expect(history.future).toHaveLength(0);
    expect(appearanceHistoryReducer(history, { type: "redo" })).toBe(history);
  });

  it("coalesces intermediate drag values into one undo checkpoint", () => {
    const initial = createDefaultAppearance("dark", true);
    let history = createAppearanceHistory(initial);
    history = appearanceHistoryReducer(history, {
      type: "apply",
      update: (current) => ({ ...current, shape: { radius: 10 } }),
    });
    history = appearanceHistoryReducer(history, {
      type: "apply",
      record: false,
      update: (current) => ({ ...current, shape: { radius: 20 } }),
    });
    history = appearanceHistoryReducer(history, {
      type: "apply",
      record: false,
      update: (current) => ({ ...current, shape: { radius: 30 } }),
    });

    expect(history.present.shape.radius).toBe(30);
    expect(history.past).toHaveLength(1);
    history = appearanceHistoryReducer(history, { type: "undo" });
    expect(history.present.shape.radius).toBe(initial.shape.radius);
  });

  it("keeps selection-only replacements out of undo history", () => {
    const initial = createDefaultAppearance("void", true);
    const history = appearanceHistoryReducer(createAppearanceHistory(initial), {
      type: "replace",
      update: (current) => ({ ...current, customized: false }),
    });

    expect(history.past).toHaveLength(0);
    expect(history.present.customized).toBe(false);
  });

  it("caps the number of stored undo states", () => {
    let history = createAppearanceHistory(createDefaultAppearance("dark", true));
    for (let radius = 0; radius < APPEARANCE_HISTORY_LIMIT + 12; radius += 1) {
      history = appearanceHistoryReducer(history, {
        type: "apply",
        update: (current) => ({ ...current, shape: { radius } }),
      });
    }

    expect(history.past).toHaveLength(APPEARANCE_HISTORY_LIMIT);
  });
});
