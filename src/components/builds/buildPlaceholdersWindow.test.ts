import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import capabilities from "../../../src-tauri/capabilities/default.json";

const native = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  getByLabel: vi.fn(),
  create: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  once: vi.fn(),
  dispose: vi.fn(),
  parent: { label: "main" },
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: native.isTauri }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => native.parent }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    static getByLabel = native.getByLabel;
    show = native.show;
    setFocus = native.focus;
    once = native.once;
    constructor(label: string, options: unknown) {
      native.create(label, options);
    }
  },
}));

import {
  BUILD_PLACEHOLDERS_WINDOW_LABEL,
  getBuildPlaceholdersWindowUrl,
  isBuildPlaceholdersWindowRoute,
  openBuildPlaceholdersWindow,
} from "./buildPlaceholdersWindow";

let listeners: Record<string, (event: { payload: unknown }) => void>;

beforeEach(() => {
  vi.clearAllMocks();
  native.isTauri.mockReturnValue(true);
  native.getByLabel.mockResolvedValue(null);
  native.show.mockResolvedValue(undefined);
  native.focus.mockResolvedValue(undefined);
  listeners = {};
  native.once.mockImplementation((name, handler) => {
    listeners[name] = handler;
    return Promise.resolve(native.dispose);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("placeholder guide window", () => {
  it("uses its own route and has permission to move and close the window", () => {
    expect(isBuildPlaceholdersWindowRoute(getBuildPlaceholdersWindowUrl().slice(1))).toBe(true);
    expect(isBuildPlaceholdersWindowRoute("?window=appearance")).toBe(false);
    expect(capabilities.windows).toContain(BUILD_PLACEHOLDERS_WINDOW_LABEL);
    expect(capabilities.permissions).toContain("core:window:allow-set-position");
    expect(capabilities.permissions).toContain("core:window:allow-close");
  });

  it("focuses an existing guide instead of opening another window", async () => {
    native.getByLabel.mockResolvedValue({ show: native.show, setFocus: native.focus });
    await openBuildPlaceholdersWindow();
    expect(native.create).not.toHaveBeenCalled();
    expect(native.show).toHaveBeenCalledOnce();
    expect(native.focus).toHaveBeenCalledOnce();
  });

  it("creates one frameless window even if the guide is requested twice while opening", async () => {
    const first = openBuildPlaceholdersWindow();
    const second = openBuildPlaceholdersWindow();
    await vi.waitFor(() => expect(listeners["tauri://created"]).toBeDefined());
    expect(native.create).toHaveBeenCalledOnce();
    expect(native.create).toHaveBeenCalledWith(
      BUILD_PLACEHOLDERS_WINDOW_LABEL,
      expect.objectContaining({
        url: getBuildPlaceholdersWindowUrl(),
        parent: native.parent,
        decorations: false,
        transparent: true,
        backgroundColor: [0, 0, 0, 0],
        shadow: false,
        resizable: true,
      }),
    );
    listeners["tauri://created"]({ payload: null });
    await Promise.all([first, second]);
    expect(native.show).toHaveBeenCalledOnce();
    expect(native.focus).toHaveBeenCalledOnce();
    expect(native.dispose).toHaveBeenCalledTimes(2);
  });

  it("allows retrying after window creation fails", async () => {
    const pending = openBuildPlaceholdersWindow();
    const failure = expect(pending).rejects.toThrow("creation failed");
    await vi.waitFor(() => expect(listeners["tauri://error"]).toBeDefined());
    listeners["tauri://error"]({ payload: "creation failed" });
    await failure;
    native.getByLabel.mockResolvedValue({ show: native.show, setFocus: native.focus });
    await openBuildPlaceholdersWindow();
    expect(native.focus).toHaveBeenCalledOnce();
  });

  it("opens a separate browser popup in a web preview", async () => {
    native.isTauri.mockReturnValue(false);
    const focus = vi.fn();
    const open = vi.fn(() => ({ focus }));
    vi.stubGlobal("window", { open });
    await openBuildPlaceholdersWindow();
    expect(open).toHaveBeenCalledWith(
      getBuildPlaceholdersWindowUrl(),
      BUILD_PLACEHOLDERS_WINDOW_LABEL,
      expect.stringContaining("popup"),
    );
    expect(focus).toHaveBeenCalledOnce();
    expect(native.create).not.toHaveBeenCalled();
  });

  it("reports a blocked browser popup so the button can offer a retry", async () => {
    native.isTauri.mockReturnValue(false);
    vi.stubGlobal("window", { open: vi.fn(() => null) });
    await expect(openBuildPlaceholdersWindow()).rejects.toThrow("Не удалось открыть окно");
  });
});
