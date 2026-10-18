import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAUNCHER_PLUGINS_SETTINGS } from "./pluginRegistry";

const bridge = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: bridge.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: bridge.listen }));
import { savePluginSettings, subscribePluginSettings } from "./pluginSettingsSync";

afterEach(() => vi.clearAllMocks());

describe("plugin settings across launcher windows", () => {
  it("serializes rapid edits, sends only edited plugin IDs, and recovers after an error", async () => {
    let finish!: (value: unknown) => void;
    bridge.invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    bridge.invoke.mockRejectedValueOnce(new Error("save failed"));
    bridge.invoke.mockResolvedValueOnce({ plugins: DEFAULT_LAUNCHER_PLUGINS_SETTINGS });
    const first = savePluginSettings(DEFAULT_LAUNCHER_PLUGINS_SETTINGS, ["mineflayerBot"]);
    const second = savePluginSettings(DEFAULT_LAUNCHER_PLUGINS_SETTINGS, ["proxy"]);
    const failure = expect(second).rejects.toThrow("save failed");
    const third = savePluginSettings(DEFAULT_LAUNCHER_PLUGINS_SETTINGS, ["mineflayerBot"]);
    await vi.waitFor(() => expect(bridge.invoke).toHaveBeenCalledOnce());
    expect(bridge.invoke).toHaveBeenLastCalledWith("set_launcher_plugins", {
      plugins: DEFAULT_LAUNCHER_PLUGINS_SETTINGS,
      pluginIds: ["mineflayerBot"],
    });
    finish({});
    await first;
    await failure;
    await third;
    expect(bridge.invoke).toHaveBeenCalledTimes(3);
    expect(bridge.invoke.mock.calls[1][1].pluginIds).toEqual(["proxy"]);
  });

  it("receives settings from either window and ignores events after unmount", async () => {
    let handler!: (event: { payload: unknown }) => void;
    const cleanup = vi.fn();
    bridge.listen.mockImplementation((_name, callback) => {
      handler = callback;
      return Promise.resolve(cleanup);
    });
    const onChange = vi.fn();
    const subscription = subscribePluginSettings(onChange);
    await subscription.ready;
    handler({ payload: DEFAULT_LAUNCHER_PLUGINS_SETTINGS });
    expect(onChange).toHaveBeenCalledWith(DEFAULT_LAUNCHER_PLUGINS_SETTINGS);
    subscription.dispose();
    handler({ payload: DEFAULT_LAUNCHER_PLUGINS_SETTINGS });
    expect(onChange).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans up a subscription that finishes registering after unmount", async () => {
    let register!: (cleanup: () => void) => void;
    bridge.listen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          register = resolve;
        }),
    );
    const subscription = subscribePluginSettings(vi.fn());
    subscription.dispose();
    const cleanup = vi.fn();
    register(cleanup);
    await subscription.ready;
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
