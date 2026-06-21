import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  getDefaultJavaArgsText,
  getOptimizedMinecraftJvmArgs,
  normalizeRuntimeSettingsDraft,
  normalizeWindowDimension,
} from "./javaArgs";
import type { BuildRuntimeSettingsDraft } from "../types";

describe("getOptimizedMinecraftJvmArgs", () => {
  it("scales the G1 heap region size with RAM", () => {
    expect(getOptimizedMinecraftJvmArgs(4)).toContain("-XX:G1HeapRegionSize=4M");
    expect(getOptimizedMinecraftJvmArgs(8)).toContain("-XX:G1HeapRegionSize=8M");
    expect(getOptimizedMinecraftJvmArgs(32)).toContain("-XX:G1HeapRegionSize=16M");
  });
});

describe("getDefaultJavaArgsText", () => {
  it("is empty when optimization is off", () => {
    expect(getDefaultJavaArgsText(8, false)).toBe("");
  });

  it("returns newline-joined flags when on", () => {
    const text = getDefaultJavaArgsText(8, true);
    expect(text.split("\n")[0]).toBe("-XX:+UseG1GC");
  });
});

describe("normalizeWindowDimension", () => {
  it("rounds and clamps within bounds", () => {
    expect(normalizeWindowDimension(1279.6, DEFAULT_WINDOW_WIDTH)).toBe(1280);
    expect(normalizeWindowDimension(10, DEFAULT_WINDOW_WIDTH)).toBe(320);
    expect(normalizeWindowDimension(99999, DEFAULT_WINDOW_WIDTH)).toBe(7680);
  });

  it("falls back when the value is not finite", () => {
    expect(normalizeWindowDimension(Number.NaN, 800)).toBe(800);
  });
});

describe("normalizeRuntimeSettingsDraft", () => {
  it("clamps RAM, trims paths and normalizes newlines", () => {
    const draft: BuildRuntimeSettingsDraft = {
      ram: 64,
      javaArgs: "-Xmx\r\n-Xms",
      javaPath: "  C:/java.exe  ",
      windowWidth: 200,
      windowHeight: DEFAULT_WINDOW_HEIGHT,
      fullscreen: true,
    };

    expect(normalizeRuntimeSettingsDraft(draft, 16)).toEqual({
      ram: 16,
      javaArgs: "-Xmx\n-Xms",
      javaPath: "C:/java.exe",
      windowWidth: 320,
      windowHeight: DEFAULT_WINDOW_HEIGHT,
      fullscreen: true,
    });
  });
});
