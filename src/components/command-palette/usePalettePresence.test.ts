import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  pending: [] as (() => void)[],
  exit: vi.fn(),
}));
const sameDependencies = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
vi.mock("react", () => ({
  useState(initial: any) {
    const index = runtime.cursor++;
    runtime.slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
    return [
      runtime.slots[index].value,
      (value: any) => {
        runtime.slots[index].value =
          typeof value === "function" ? value(runtime.slots[index].value) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = runtime.cursor++;
    runtime.slots[index] ??= { current: initial };
    return runtime.slots[index];
  },
  useCallback(fn: unknown, dependencies: unknown[]) {
    const index = runtime.cursor++;
    const previous = runtime.slots[index];
    if (!previous || !sameDependencies(dependencies, previous.dependencies))
      runtime.slots[index] = { fn, dependencies };
    return runtime.slots[index].fn;
  },
  useEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
    const index = runtime.cursor++;
    const previous = runtime.slots[index];
    if (!previous || !sameDependencies(dependencies, previous.dependencies))
      runtime.pending.push(() => {
        previous?.cleanup?.();
        runtime.slots[index] = { dependencies, cleanup: effect() };
      });
  },
}));
import { usePalettePresence } from "./usePalettePresence";

const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
function RenderHarness(disabled = false, animated = true) {
  runtime.cursor = 0;
  const presence = usePalettePresence(disabled, animated, runtime.exit);
  for (const effect of runtime.pending.splice(0)) effect();
  return presence;
}
function unmount() {
  for (const slot of runtime.slots) slot?.cleanup?.();
}
async function opened() {
  const presence = RenderHarness();
  presence.show();
  RenderHarness();
  await vi.advanceTimersByTimeAsync(1000);
  return RenderHarness();
}

describe("palette animation lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.slots = [];
    runtime.pending = [];
    runtime.cursor = 0;
    runtime.exit.mockReset();
    media.matches = false;
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      requestAnimationFrame: (callback: () => void) => setTimeout(callback, 16),
      cancelAnimationFrame: clearTimeout,
      matchMedia: () => media,
    });
  });
  afterEach(() => {
    unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the modal present until its exit finishes", async () => {
    const presence = RenderHarness();
    expect(presence.show()).toBe(true);
    expect(RenderHarness().phase).toBe("mounting");
    await vi.advanceTimersByTimeAsync(40);
    expect(RenderHarness().phase).toBe("opening");
    await vi.advanceTimersByTimeAsync(500);
    expect(RenderHarness().phase).toBe("open");
    presence.close();
    expect(RenderHarness().phase).toBe("closing");
    expect(RenderHarness().present).toBe(true);
    await vi.advanceTimersByTimeAsync(80);
    expect(runtime.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(runtime.exit).toHaveBeenCalledTimes(1);
    expect(RenderHarness().present).toBe(false);
  });

  it("runs a selected command once, after the native modal has closed", async () => {
    const presence = await opened();
    const command = vi.fn();
    const duplicate = vi.fn();
    presence.close(command);
    presence.close(duplicate);
    expect(presence.toggle()).toBe(false);
    expect(command).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(command).toHaveBeenCalledTimes(1);
    expect(duplicate).not.toHaveBeenCalled();
    expect(runtime.exit.mock.invocationCallOrder[0]).toBeLessThan(
      command.mock.invocationCallOrder[0],
    );
  });

  it("reverses a dismissed palette without letting an old timer close it", async () => {
    const presence = await opened();
    presence.close();
    await vi.advanceTimersByTimeAsync(50);
    expect(presence.toggle()).toBe(true);
    expect(RenderHarness().phase).toBe("opening");
    await vi.advanceTimersByTimeAsync(1000);
    expect(RenderHarness().phase).toBe("open");
    expect(runtime.exit).not.toHaveBeenCalled();
  });

  it("cancels queued frames when closed before the first paint", async () => {
    const presence = RenderHarness();
    presence.show();
    presence.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(RenderHarness().present).toBe(false);
  });

  it.each(["launcher", "system"])(
    "skips animation delays when reduced motion is requested by %s",
    (source) => {
      media.matches = source === "system";
      const presence = RenderHarness(false, source !== "launcher");
      presence.show();
      expect(RenderHarness(false, source !== "launcher").phase).toBe("open");
      const command = vi.fn();
      presence.close(command);
      expect(command).toHaveBeenCalledTimes(1);
      expect(runtime.exit).toHaveBeenCalledTimes(1);
    },
  );

  it("does not execute a delayed command after the component is removed", async () => {
    const presence = await opened();
    const command = vi.fn();
    presence.close(command);
    unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(command).not.toHaveBeenCalled();
  });

  it("closes immediately and discards a pending command when disabled", async () => {
    const presence = await opened();
    const command = vi.fn();
    presence.close(command);
    RenderHarness(true);
    expect(RenderHarness(true).present).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(command).not.toHaveBeenCalled();
  });
});
