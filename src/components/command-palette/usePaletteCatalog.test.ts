import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstanceItem } from "../../types";

const runtime = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  pending: [] as (() => void)[],
  search: vi.fn(),
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = runtime.cursor++;
    runtime.slots[index] ??= { value: initial };
    return [
      runtime.slots[index].value,
      (value: any) => {
        runtime.slots[index].value = value;
      },
    ];
  },
  useEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
    const index = runtime.cursor++;
    const previous = runtime.slots[index];
    if (
      !previous ||
      dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))
    ) {
      runtime.pending.push(() => {
        previous?.cleanup?.();
        runtime.slots[index] = { dependencies, cleanup: effect() };
      });
    }
  },
}));
vi.mock("./paletteCatalog", () => ({ searchPaletteCatalog: runtime.search }));
import { usePaletteCatalog } from "./usePaletteCatalog";

const build = { id: "fabric", version: "1.21.1", loader: "Fabric" } as InstanceItem;
const targets = { mods: build, resourcepacks: build, shaders: build };
const response = (id: string) => ({
  projects: [{ kind: "mods", project: { projectId: id } }],
  failed: [],
});
function RenderHarness(query: string, open = true, selectedTargets = targets) {
  runtime.cursor = 0;
  const result = usePaletteCatalog(open, query, selectedTargets);
  for (const effect of runtime.pending.splice(0)) effect();
  return result;
}
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("catalog search lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    runtime.slots = [];
    runtime.cursor = 0;
    runtime.pending = [];
    runtime.search.mockReset().mockImplementation(async (query: string) => response(query));
  });
  afterEach(() => {
    for (const slot of runtime.slots) slot?.cleanup?.();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("debounces typing and avoids network requests while the palette is closed", async () => {
    RenderHarness("Sodium", false);
    await vi.advanceTimersByTimeAsync(300);
    expect(runtime.search).not.toHaveBeenCalled();
    RenderHarness("Sodium");
    RenderHarness("Iris");
    await vi.advanceTimersByTimeAsync(250);
    expect(runtime.search).toHaveBeenCalledTimes(1);
    expect(runtime.search).toHaveBeenCalledWith("Iris", targets, undefined);
  });

  it("ignores late responses after a newer query or build has been selected", async () => {
    let finishOld!: (value: ReturnType<typeof response>) => void;
    runtime.search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    RenderHarness("Sodium");
    await vi.advanceTimersByTimeAsync(250);
    expect(RenderHarness("Iris").projects).toEqual([]);
    await vi.advanceTimersByTimeAsync(250);
    expect(RenderHarness("Iris").projects[0].project.projectId).toBe("Iris");
    finishOld(response("Sodium"));
    await flush();
    expect(RenderHarness("Iris").projects[0].project.projectId).toBe("Iris");
    const nextTargets = { ...targets, mods: { ...build, id: "other", version: "1.20.1" } };
    expect(RenderHarness("Iris", true, nextTargets).projects).toEqual([]);
  });

  it("cancels pending requests on close and strips category prefixes", async () => {
    RenderHarness("ресурспаки: Faithful");
    await vi.advanceTimersByTimeAsync(250);
    expect(runtime.search).toHaveBeenCalledWith("Faithful", targets, "resourcepacks");
    runtime.search.mockClear();
    RenderHarness("Sodium");
    RenderHarness("Sodium", false);
    await vi.advanceTimersByTimeAsync(300);
    expect(runtime.search).not.toHaveBeenCalled();
  });
});
