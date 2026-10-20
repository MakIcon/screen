import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deferLanguageText,
  installLanguageTransition,
  languageWaveDelay,
} from "./languageTransition";
import { LOCALE_CHANGING_EVENT, LOCALE_STORAGE_KEY } from "./store";

afterEach(() => vi.unstubAllGlobals());

describe("language wave", () => {
  const viewport = { width: 1200, height: 800 };

  it("moves across each row and down the screen within a bounded delay", () => {
    const start = languageWaveDelay({ top: 0, left: 0 }, viewport);
    const right = languageWaveDelay({ top: 0, left: 1200 }, viewport);
    const lower = languageWaveDelay({ top: 400, left: 0 }, viewport);
    const end = languageWaveDelay({ top: 800, left: 1200 }, viewport);
    expect(start).toBe(0);
    expect(right).toBeGreaterThan(start);
    expect(lower).toBeGreaterThan(right);
    expect(end).toBeGreaterThan(lower);
    expect(end).toBeLessThanOrEqual(700);
  });

  it("clamps partially clipped positions and handles an empty viewport", () => {
    expect(languageWaveDelay({ top: -50, left: -50 }, viewport)).toBe(0);
    expect(languageWaveDelay({ top: 9000, left: 9000 }, viewport)).toBeLessThanOrEqual(700);
    expect(Number.isFinite(languageWaveDelay({ top: 10, left: 10 }, { width: 0, height: 0 }))).toBe(
      true,
    );
  });

  function environment(reducedMotion = false) {
    const events = new EventTarget();
    const motion = Object.assign(new EventTarget(), { matches: reducedMotion });
    const observe = vi.fn();
    const disconnect = vi.fn();
    const requestFrame = vi.fn().mockReturnValue(1);
    const cancelFrame = vi.fn();
    vi.stubGlobal("window", {
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
      matchMedia: () => motion,
      requestAnimationFrame: requestFrame,
      cancelAnimationFrame: cancelFrame,
    });
    vi.stubGlobal(
      "document",
      Object.assign(new EventTarget(), {
        body: {},
        hidden: false,
        documentElement: { dataset: {} },
      }),
    );
    vi.stubGlobal(
      "HTMLElement",
      class {
        animate() {}
      },
    );
    vi.stubGlobal(
      "MutationObserver",
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    return { events, motion, observe, disconnect, requestFrame, cancelFrame };
  }

  it("observes only a real switch and cancels an earlier pending wave", () => {
    const env = environment();
    const dispose = installLanguageTransition();
    expect(env.observe).not.toHaveBeenCalled();
    env.events.dispatchEvent(new Event(LOCALE_CHANGING_EVENT));
    expect(env.observe).toHaveBeenCalledTimes(1);
    env.events.dispatchEvent(new Event(LOCALE_CHANGING_EVENT));
    expect(env.disconnect).toHaveBeenCalledTimes(1);
    expect(env.observe).toHaveBeenCalledTimes(2);
    dispose();
    expect(env.disconnect).toHaveBeenCalledTimes(2);
    env.events.dispatchEvent(new Event(LOCALE_CHANGING_EVENT));
    expect(env.observe).toHaveBeenCalledTimes(2);
  });

  it("respects reduced motion and cancels immediately when it is enabled", () => {
    const env = environment(true);
    const dispose = installLanguageTransition();
    env.events.dispatchEvent(new Event(LOCALE_CHANGING_EVENT));
    expect(env.observe).not.toHaveBeenCalled();
    env.motion.matches = false;
    env.events.dispatchEvent(new Event(LOCALE_CHANGING_EVENT));
    expect(env.observe).toHaveBeenCalledTimes(1);
    env.motion.matches = true;
    env.motion.dispatchEvent(new Event("change"));
    expect(env.disconnect).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("responds to another window's language change, ignoring unrelated storage", () => {
    const env = environment();
    const dispose = installLanguageTransition();
    const storage = (key: string, oldValue: string, newValue: string) =>
      Object.assign(new Event("storage"), { key, oldValue, newValue });
    env.events.dispatchEvent(storage("other-setting", "ru", "en"));
    env.events.dispatchEvent(storage(LOCALE_STORAGE_KEY, "ru", "ru"));
    expect(env.observe).not.toHaveBeenCalled();
    env.events.dispatchEvent(storage(LOCALE_STORAGE_KEY, "ru", "en"));
    expect(env.observe).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("respects the launcher's switch for disabling interface animation", () => {
    const env = environment();
    document.documentElement.dataset.motion = "off";
    const dispose = installLanguageTransition();
    env.events.dispatchEvent(new Event(LOCALE_CHANGING_EVENT));
    expect(env.observe).not.toHaveBeenCalled();
    dispose();
  });
});

describe("text replacement at the wave front", () => {
  it("keeps the previous language until its reveal is due", () => {
    const node = { data: "REMOVE", isConnected: true };
    const change = deferLanguageText(node, "УДАЛИТЬ");
    expect(node.data).toBe("УДАЛИТЬ");
    change?.reveal();
    expect(node.data).toBe("REMOVE");
  });

  it("does not replace text that React has updated again during the wave", () => {
    const node = { data: "2 DOWNLOADS", isConnected: true };
    const change = deferLanguageText(node, "2 ЗАГРУЗКИ");
    node.data = "3 DOWNLOADS";
    change?.reveal();
    expect(node.data).toBe("3 DOWNLOADS");
  });

  it("leaves an unmounted node alone and skips unchanged names", () => {
    const node = { data: "REMOVE", isConnected: true };
    const change = deferLanguageText(node, "УДАЛИТЬ");
    node.isConnected = false;
    change?.reveal();
    expect(node.data).toBe("УДАЛИТЬ");
    expect(
      deferLanguageText({ data: "Fabric API", isConnected: true }, "Fabric API"),
    ).toBeUndefined();
  });
});
