import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  pending: [] as (() => void)[],
}));
vi.mock("react", () => ({
  useRef(initial: unknown) {
    const index = runtime.cursor++;
    return (runtime.slots[index] ??= { current: initial });
  },
  useLayoutEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
    const index = runtime.cursor++;
    const previous = runtime.slots[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i])))
      runtime.pending.push(() => {
        previous?.cleanup?.();
        runtime.slots[index] = { dependencies, cleanup: effect() };
      });
  },
}));
import { getPaletteContextLayout } from "./paletteContextLayout";
import { usePaletteElasticDrag } from "./usePaletteElasticDrag";

const layout = getPaletteContextLayout({ left: 24, top: 98, width: 132, height: 86 }, 1280, 720);
let dialog: EventTarget & { querySelector: (selector: string) => any };
let heading: EventTarget & {
  setPointerCapture: any;
  hasPointerCapture: any;
  releasePointerCapture: any;
};
let shell: {
  style: { transform: string };
  dataset: Record<string, string>;
  querySelector: () => any;
};
let win: EventTarget;
let doc: EventTarget;
let ref: { current: HTMLDialogElement };
let attributes: Record<string, string>;

function RenderHarness(phase = "open", animated = true) {
  runtime.cursor = 0;
  usePaletteElasticDrag(ref, layout, phase, animated);
  for (const effect of runtime.pending.splice(0)) effect();
}
function unmount() {
  for (const slot of runtime.slots) slot?.cleanup?.();
  runtime.slots = [];
}
function pointer(target: EventTarget, type: string, properties: Record<string, unknown> = {}) {
  target.dispatchEvent(
    Object.assign(new Event(type, { cancelable: true }), {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      buttons: 1,
      pointerType: "mouse",
      clientX: 400,
      clientY: 120,
      ...properties,
    }),
  );
}
async function pull() {
  pointer(heading, "pointerdown");
  pointer(win, "pointermove", { clientX: 600, clientY: 200 });
  await vi.advanceTimersByTimeAsync(500);
}

describe("palette elastic dragging lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.slots = [];
    runtime.pending = [];
    runtime.cursor = 0;
    const captures = new Set<number>();
    heading = Object.assign(new EventTarget(), {
      setPointerCapture: vi.fn((id: number) => captures.add(id)),
      hasPointerCapture: (id: number) => captures.has(id),
      releasePointerCapture: vi.fn((id: number) => {
        captures.delete(id);
        pointer(heading, "lostpointercapture", { pointerId: id });
      }),
    });
    shell = { style: { transform: "" }, dataset: {}, querySelector: () => heading };
    attributes = {};
    const svg = {
      style: { strokeWidth: "" },
      setAttribute: (key: string, value: string) => {
        attributes[key] = value;
      },
    };
    dialog = Object.assign(new EventTarget(), {
      querySelector: (selector: string) => (selector.includes("drag-shell") ? shell : svg),
    });
    ref = { current: dialog as unknown as HTMLDialogElement };
    win = new EventTarget();
    doc = new EventTarget();
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
      setTimeout(() => fn(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  });
  afterEach(() => {
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("moves with resistance, follows the attachment and returns exactly home", async () => {
    RenderHarness();
    expect(vi.getTimerCount()).toBe(0);
    await pull();
    expect(shell.dataset.dragging).toBe("true");
    expect(shell.style.transform).toContain("skewX");
    expect(Number(attributes.cx)).toBeGreaterThan(layout.connection!.end.x + 60);
    expect(Number(attributes.cx)).toBeLessThan(layout.connection!.end.x + 200);
    pointer(win, "pointerup");
    await vi.advanceTimersByTimeAsync(2500);
    expect(shell.style.transform).toBe("");
    expect(shell.dataset).toEqual({});
    expect(Number(attributes.cx)).toBe(layout.connection!.end.x);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["pointercancel", "blur", "lostpointercapture"])("returns after %s", async (type) => {
    RenderHarness();
    await pull();
    if (type === "lostpointercapture") pointer(heading, type);
    else if (type === "blur") win.dispatchEvent(new Event(type));
    else pointer(win, type);
    await vi.advanceTimersByTimeAsync(2500);
    expect(shell.style.transform).toBe("");
    expect(shell.dataset.dragging).toBeUndefined();
    expect(heading.hasPointerCapture(1)).toBe(false);
  });

  it("ignores other pointers and non-primary buttons", async () => {
    RenderHarness();
    pointer(heading, "pointerdown", { button: 2 });
    expect(heading.setPointerCapture).not.toHaveBeenCalled();
    await pull();
    pointer(win, "pointerup", { pointerId: 2 });
    expect(shell.dataset.dragging).toBe("true");
    pointer(win, "pointerup");
  });

  it("continues smoothly when re-grabbed during the return", async () => {
    RenderHarness();
    await pull();
    pointer(win, "pointerup");
    await vi.advanceTimersByTimeAsync(100);
    const position = Number(attributes.cx);
    pointer(heading, "pointerdown");
    pointer(win, "pointermove");
    expect(Number(attributes.cx)).toBe(position);
    await vi.advanceTimersByTimeAsync(1500);
    expect(Number(attributes.cx)).toBeCloseTo(position, 1);
    expect(shell.dataset.dragging).toBe("true");
  });

  it("allows direct dragging with motion disabled and snaps back on release", () => {
    RenderHarness("open", false);
    pointer(heading, "pointerdown");
    pointer(win, "pointermove", { clientX: 600 });
    expect(shell.style.transform).toMatch(/^translate3d\(/);
    expect(shell.style.transform).not.toContain("rotate");
    expect(vi.getTimerCount()).toBe(0);
    pointer(win, "pointerup");
    expect(shell.style.transform).toBe("");
  });

  it("releases capture on close and cancels all work on unmount", async () => {
    RenderHarness();
    await pull();
    RenderHarness("closing");
    expect(heading.hasPointerCapture(1)).toBe(false);
    pointer(heading, "pointerdown");
    expect(shell.dataset.dragging).toBeUndefined();
    RenderHarness("closed");
    expect(shell.style.transform).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    RenderHarness();
    await pull();
    unmount();
    expect(heading.hasPointerCapture(1)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    pointer(heading, "pointerdown");
    expect(shell.dataset.dragging).toBeUndefined();
  });
});
