import { describe, expect, it } from "vitest";
import { DEFAULT_MINEFLAYER_BOT_SETTINGS, normalizeMineflayerBotSettings } from "../pluginSettings";

describe("normalizeMineflayerBotSettings", () => {
  it("adds safe defaults to legacy settings", () => {
    const normalized = normalizeMineflayerBotSettings({
      enabled: true,
      host: "localhost",
      followDistance: 5,
    });

    expect(normalized.host).toBe("localhost");
    expect(normalized.followDistance).toBe(5);
    expect(normalized.autoReconnect).toBe(true);
    expect(normalized.canDig).toBe(false);
    expect(normalized.commandSource).toBe("both");
    expect(normalized.commandCooldownMs).toBe(500);
  });

  it("clamps numeric values and rejects unknown command sources", () => {
    const normalized = normalizeMineflayerBotSettings({
      port: 90000,
      followDistance: -4,
      gotoRadius: 99,
      maxReconnectAttempts: -1,
      connectTimeoutSeconds: 2,
      commandSource: "console",
    });

    expect(normalized.port).toBe(65535);
    expect(normalized.followDistance).toBe(1);
    expect(normalized.gotoRadius).toBe(16);
    expect(normalized.maxReconnectAttempts).toBe(0);
    expect(normalized.connectTimeoutSeconds).toBe(5);
    expect(normalized.commandSource).toBe("both");
  });

  it("keeps every explicit modern setting", () => {
    const modern = {
      ...DEFAULT_MINEFLAYER_BOT_SETTINGS,
      commandSource: "whisper" as const,
      extraOwners: "Alex, Steve",
      allowSayCommand: true,
      canDig: true,
      autoReconnect: false,
      logPathUpdates: true,
    };

    expect(normalizeMineflayerBotSettings(modern)).toEqual(modern);
  });
});
