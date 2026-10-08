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
    expect(normalized.stayOnWater).toBe(true);
    expect(normalized.commandSource).toBe("both");
    expect(normalized.commandCooldownMs).toBe(500);
    expect(normalized.combat.engine).toBe("custom");
    expect(normalized.combat.autoTarget).toBe("manual");
    expect(normalized.combat.smoothAimSpeed).toBe(100);
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
      stayOnWater: false,
      autoReconnect: false,
      logPathUpdates: true,
    };

    expect(normalizeMineflayerBotSettings(modern)).toEqual(modern);
  });

  it("normalizes a partial combat configuration without losing bow preferences", () => {
    const normalized = normalizeMineflayerBotSettings({
      combat: {
        engine: "basic",
        style: "ranged",
        bowEngine: "hawkeye",
        bowOffhand: true,
        bowPredict: false,
        meleeSkill: -1,
        bowAccuracy: 110,
        attackRange: 100,
        bowIntervalMs: 500,
        reactionMs: 12.5,
        strafe: "unknown",
        smoothAimSpeed: 1000,
      },
    });
    expect(normalized.combat.engine).toBe("basic");
    expect(normalized.combat.bowEngine).toBe("hawkeye");
    expect(normalized.combat.bowOffhand).toBe(true);
    expect(normalized.combat.bowPredict).toBe(false);
    expect(normalized.combat.meleeSkill).toBe(0);
    expect(normalized.combat.bowAccuracy).toBe(100);
    expect(normalized.combat.attackRange).toBe(3);
    expect(normalized.combat.bowIntervalMs).toBe(1200);
    expect(normalized.combat.reactionMs).toBe(13);
    expect(normalized.combat.strafe).toBe("intelligent");
    expect(normalized.combat.smoothAimSpeed).toBe(300);
  });

  it("preserves aim speed and restores its default for invalid values", () => {
    expect(
      normalizeMineflayerBotSettings({ combat: { smoothAimSpeed: 55 } }).combat.smoothAimSpeed,
    ).toBe(55);
    expect(
      normalizeMineflayerBotSettings({ combat: { smoothAimSpeed: 0 } }).combat.smoothAimSpeed,
    ).toBe(10);
    expect(
      normalizeMineflayerBotSettings({ combat: { smoothAimSpeed: NaN } }).combat.smoothAimSpeed,
    ).toBe(100);
  });
});
