import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import capabilities from "../../../../src-tauri/capabilities/default.json";

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
  MINEFLAYER_BOT_WINDOW_LABEL,
  getMineflayerBotWindowUrl,
  isMineflayerBotWindowRoute,
  openMineflayerBotWindow,
} from "./mineflayerBotWindow";

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

describe("detached bot window", () => {
  it("routes to the bot workspace with permission to resize, move and close", () => {
    expect(isMineflayerBotWindowRoute(getMineflayerBotWindowUrl().slice(1))).toBe(true);
    expect(isMineflayerBotWindowRoute("?window=appearance")).toBe(false);
    expect(isMineflayerBotWindowRoute("?window=placeholders")).toBe(false);
    expect(capabilities.windows).toContain(MINEFLAYER_BOT_WINDOW_LABEL);
    for (const permission of ["allow-start-dragging", "allow-toggle-maximize", "allow-close"]) {
      expect(capabilities.permissions).toContain(`core:window:${permission}`);
    }
  });

  it("focuses the existing bot window without creating a second one", async () => {
    native.getByLabel.mockResolvedValue({ show: native.show, setFocus: native.focus });
    await openMineflayerBotWindow();
    expect(native.create).not.toHaveBeenCalled();
    expect(native.show).toHaveBeenCalledOnce();
    expect(native.focus).toHaveBeenCalledOnce();
  });

  it("coalesces simultaneous requests and waits for creation before showing", async () => {
    const first = openMineflayerBotWindow();
    const second = openMineflayerBotWindow();
    await vi.waitFor(() => expect(listeners["tauri://created"]).toBeDefined());
    expect(native.create).toHaveBeenCalledOnce();
    expect(native.create).toHaveBeenCalledWith(
      MINEFLAYER_BOT_WINDOW_LABEL,
      expect.objectContaining({
        url: getMineflayerBotWindowUrl(),
        parent: native.parent,
        decorations: false,
        resizable: true,
        visible: false,
      }),
    );
    expect(native.show).not.toHaveBeenCalled();
    listeners["tauri://created"]({ payload: null });
    await Promise.all([first, second]);
    expect(native.show).toHaveBeenCalledOnce();
    expect(native.focus).toHaveBeenCalledOnce();
    expect(native.dispose).toHaveBeenCalledTimes(2);
  });

  it("cleans up failed creation and lets the user retry", async () => {
    const pending = openMineflayerBotWindow();
    const failure = expect(pending).rejects.toThrow("creation failed");
    await vi.waitFor(() => expect(listeners["tauri://error"]).toBeDefined());
    listeners["tauri://error"]({ payload: "creation failed" });
    await failure;
    expect(native.dispose).toHaveBeenCalledTimes(2);
    native.getByLabel.mockResolvedValue({ show: native.show, setFocus: native.focus });
    await openMineflayerBotWindow();
    expect(native.focus).toHaveBeenCalledOnce();
  });

  it("supports a named browser popup and reports a blocked popup", async () => {
    native.isTauri.mockReturnValue(false);
    const focus = vi.fn();
    const open = vi.fn().mockReturnValueOnce({ focus }).mockReturnValueOnce(null);
    vi.stubGlobal("window", { open });
    await openMineflayerBotWindow();
    expect(open).toHaveBeenCalledWith(
      getMineflayerBotWindowUrl(),
      MINEFLAYER_BOT_WINDOW_LABEL,
      expect.stringContaining("popup"),
    );
    expect(focus).toHaveBeenCalledOnce();
    await expect(openMineflayerBotWindow()).rejects.toThrow(
      "Не удалось открыть окно управления ботом",
    );
  });
});
