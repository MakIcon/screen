import { afterEach, describe, expect, it, vi } from "vitest";
import { guideSearchCameraTransform, guideTargetPoint, playGuideDemo } from "./guidePlayback";

function fixture(reducedMotion = false) {
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const classes = () => {
    const values = new Set<string>();
    return {
      add: (value: string) => values.add(value),
      remove: (value: string) => values.delete(value),
      contains: (value: string) => values.has(value),
    };
  };
  let x = 40;
  const target = {
    classList: classes(),
    click: vi.fn(),
    getBoundingClientRect: () => ({ left: 100 + x * 2, top: 230, width: 40, height: 60 }),
  } as unknown as HTMLElement;
  const root = {
    offsetWidth: 300,
    offsetHeight: 100,
    clientLeft: 0,
    clientTop: 0,
    matches: () => false,
    querySelector: () => target,
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 600, height: 300 }),
  } as unknown as HTMLElement;
  const pointer = { style: {}, classList: classes() } as unknown as HTMLElement;
  vi.stubGlobal("window", {
    getComputedStyle: (element: HTMLElement) => ({
      borderLeftWidth: String(element.clientLeft),
      borderTopWidth: String(element.clientTop),
    }),
    matchMedia: () => ({ matches: reducedMotion }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++id, callback);
      return id;
    },
    cancelAnimationFrame: (frame: number) => frames.delete(frame),
  });
  const tick = (time: number) => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(time));
  };
  return {
    root,
    target,
    pointer,
    tick,
    frames,
    setX: (next: number) => {
      x = next;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("guide playback", () => {
  it("pans to the text start while zooming, keeping that point fixed", () => {
    const focus = { x: 49, y: 89 };
    const transform = guideSearchCameraTransform(focus, 2.6);
    const numbers = transform.match(/-?[\d.]+/g)!.map(Number);
    expect(numbers[0] + focus.x * numbers[2]).toBeCloseTo(focus.x);
    expect(numbers[1] + focus.y * numbers[2]).toBeCloseTo(focus.y);
    expect(numbers[0]).toBeLessThan(0);
  });

  it("keeps the cursor at the text inset during approach, zoom and mouse-down", () => {
    const f = fixture();
    Object.assign(f.target, { offsetWidth: 20 });
    vi.stubGlobal("window", {
      ...window,
      getComputedStyle: (element: HTMLElement) =>
        element === f.target
          ? { paddingLeft: "3", borderLeftWidth: "1" }
          : { borderLeftWidth: "0", borderTopWidth: "0" },
    });
    playGuideDemo(f.root, f.pointer, [
      { kind: "move", target: "input", anchor: "text", duration: 100 },
      {
        kind: "animate",
        target: "input",
        anchor: "text",
        duration: 100,
        onFrame: () => f.setX(70),
      },
      { kind: "press", target: "input", anchor: "text", duration: 100 },
    ]);
    f.tick(0);
    f.tick(100);
    expect(f.pointer.style.left).toBe("45px");
    f.tick(116);
    f.tick(216);
    expect(f.pointer.style.left).toBe("75px");
    f.tick(232);
    expect(f.pointer.style.left).toBe("75px");
    expect(f.pointer.classList.contains("is-pressed")).toBe(true);
  });
  it("accounts for the preview border when positioning the cursor hotspot", () => {
    const { root, target } = fixture();
    Object.assign(root, { clientLeft: 1, clientTop: 2 });
    expect(guideTargetPoint(root, target)).toEqual({ x: 49, y: 18 });
  });
  it("preserves fractional scene dimensions instead of rounding the cursor position", () => {
    const { root, target } = fixture();
    Object.assign(root, {
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 600, height: 301.2 }),
    });
    vi.stubGlobal("window", {
      ...window,
      getComputedStyle: () => ({
        boxSizing: "border-box",
        width: "300px",
        height: "100.4px",
        borderLeftWidth: "0",
        borderTopWidth: "0",
      }),
    });
    expect(guideTargetPoint(root, target).y).toBeCloseTo(20);
  });
  it("maps the actual target through independent horizontal and vertical preview scales", () => {
    const { root, target, setX } = fixture();
    expect(guideTargetPoint(root, target)).toEqual({ x: 50, y: 20 });
    setX(140);
    expect(guideTargetPoint(root, target)).toEqual({ x: 150, y: 20 });
  });

  it("activates the sandbox button only after mouse-up", () => {
    const { root, target, pointer, tick } = fixture();
    playGuideDemo(root, pointer, [
      { kind: "move", target: "button", duration: 100 },
      { kind: "press", target: "button", duration: 100 },
    ]);
    tick(0);
    tick(100);
    tick(116);
    expect(target.click).not.toHaveBeenCalled();
    expect(pointer.classList.contains("is-pressed")).toBe(true);
    tick(216);
    expect(target.click).toHaveBeenCalledTimes(1);
    expect(pointer.classList.contains("is-pressed")).toBe(false);
    expect(pointer.style.left).toBe("50px");
    expect(pointer.style.top).toBe("20px");
  });

  it("keeps the mouse held and aligned with the thumb throughout a drag", () => {
    const f = fixture();
    playGuideDemo(f.root, f.pointer, [
      {
        kind: "drag",
        target: ".es-thumb",
        duration: 1_000,
        onFrame: (_, progress) => f.setX(40 + progress * 100),
      },
    ]);
    f.tick(0);
    f.tick(500);
    expect(f.pointer.classList.contains("is-pressed")).toBe(true);
    expect(f.target.classList.contains("es-thumb--active")).toBe(true);
    expect(f.pointer.style.left).toBe("100px");
    f.tick(1_000);
    expect(f.pointer.style.left).toBe("150px");
    expect(f.pointer.style.top).toBe("20px");
    expect(f.pointer.classList.contains("is-pressed")).toBe(false);
    expect(f.target.click).not.toHaveBeenCalled();
  });

  it("cancels held controls and pending updates when leaving a step", () => {
    const f = fixture();
    const update = vi.fn();
    const stop = playGuideDemo(f.root, f.pointer, [
      { kind: "drag", duration: 1_000, target: ".es-thumb", onFrame: update },
    ]);
    f.tick(0);
    stop();
    f.tick(500);
    expect(update).toHaveBeenCalledTimes(1);
    expect(f.frames.size).toBe(0);
    expect(f.target.classList.contains("es-thumb--active")).toBe(false);
    expect(f.pointer.classList.contains("is-pressed")).toBe(false);
  });

  it("completes typing after a delayed frame without splitting Unicode characters", () => {
    const f = fixture();
    const onChange = vi.fn();
    playGuideDemo(f.root, f.pointer, [{ kind: "type", target: "input", value: "a😀b", onChange }]);
    f.tick(0);
    f.tick(105);
    f.tick(2_000);
    expect(onChange.mock.calls.map(([value]) => value)).toEqual(["", "a", "a😀b"]);
  });

  it("applies the final state with reduced motion", () => {
    const f = fixture(true);
    const update = vi.fn();
    playGuideDemo(f.root, f.pointer, [{ kind: "animate", duration: 1_000, onFrame: update }]);
    f.tick(0);
    expect(update).toHaveBeenCalledWith(f.root, 1);
  });
});
