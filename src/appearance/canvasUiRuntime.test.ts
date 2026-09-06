import { describe, expect, it } from "vitest";
import {
  canvasUiClipInsets,
  canvasUiLocalBounds,
  canvasUiReplacesContent,
  queueCanvasUiCapture,
} from "./canvasUiRuntime";

describe("Canvas UI element geometry", () => {
  it("uses local coordinates inside a scaled launcher", () => {
    expect(
      canvasUiLocalBounds(
        { left: 140, top: 100, width: 240, height: 80 },
        { left: 60, top: 60, width: 800, height: 480 },
        1000,
        600,
      ),
    ).toEqual({ left: 100, top: 50, width: 300, height: 100 });
  });

  it("clips a partially scrolled card against every scroll container", () => {
    expect(
      canvasUiClipInsets({ left: 100, top: 20, width: 400, height: 200 }, [
        { left: 0, top: 0, width: 450, height: 600 },
        { left: 80, top: 70, width: 400, height: 300 },
      ]),
    ).toEqual({ left: 0, top: 50, right: 50, bottom: 0, visible: true });
  });

  it("hides an effect when its element scrolls completely out of view", () => {
    expect(
      canvasUiClipInsets({ left: 10, top: -120, width: 80, height: 60 }, [
        { left: 0, top: 0, width: 200, height: 200 },
      ]).visible,
    ).toBe(false);
  });
});

describe("Canvas UI composition", () => {
  it("retains the DOM under lenses, and replaces it under full texture effects", () => {
    for (const effect of [
      "bubble",
      "glass",
      "magnify",
      "clouds",
      "asciify",
      "ascii-sweep",
      "laser",
    ] as const) {
      expect(canvasUiReplacesContent(effect)).toBe(false);
    }
    for (const effect of ["glitch", "ripple", "cloth", "peel"] as const) {
      expect(canvasUiReplacesContent(effect)).toBe(true);
    }
  });

  it("serializes snapshots and recovers after a failed capture", async () => {
    const calls: string[] = [];
    let finish!: () => void;
    const first = queueCanvasUiCapture(async () => {
      calls.push("first");
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      throw new Error("capture failed");
    });
    const second = queueCanvasUiCapture(async () => {
      calls.push("second");
      return 42;
    });
    await Promise.resolve();
    expect(calls).toEqual(["first"]);
    const failure = expect(first).rejects.toThrow("capture failed");
    finish();
    await failure;
    expect(await second).toBe(42);
    expect(calls).toEqual(["first", "second"]);
  });
});
