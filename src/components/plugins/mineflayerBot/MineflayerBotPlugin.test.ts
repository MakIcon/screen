import { describe, expect, it } from "vitest";
import { DEFAULT_MINEFLAYER_BOT_SETTINGS, normalizeMineflayerBotSettings } from "../pluginSettings";

describe("normalizeMineflayerBotSettings", () => {
  it("preserves the low-ceiling jump switch separately from parkour", () => {
    for (const allowLowCeilingJumps of [true, false]) {
      const saved = JSON.parse(JSON.stringify(normalizeMineflayerBotSettings({
        allowLowCeilingJumps, allowParkour: false,
      })));
      expect(normalizeMineflayerBotSettings(saved).allowLowCeilingJumps).toBe(allowLowCeilingJumps);
    }
  });
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
    expect(normalized.allowAirStrafe).toBe(false);
    expect(normalized.allowLowCeilingJumps).toBe(true);
    expect(normalized.stayOnWater).toBe(true);
    expect(normalized.allowWaterDrop).toBe(true);
    expect(normalized.allowBucketWaterDrop).toBe(true);
    expect(normalized.antiKnockback).toBe(false);
    expect(normalized.commandSource).toBe("both");
    expect(normalized.commandCooldownMs).toBe(500);
    expect(normalized.combat.engine).toBe("custom");
    expect(normalized.combat.autoTarget).toBe("manual");
    expect(normalized.combat.smoothAimSpeed).toBe(100);
    expect(normalized.combat.pearlChase).toBe(false);
    expect(normalized.combat.adaptiveCombat).toBe(true);
    expect(normalized.combat.combatHealing).toBe(true);
    expect(normalized.combat.pearlEscape).toBe(true);
    expect(normalized.survival.autoEat).toBe(true);
    expect(normalized.survival.emergencyMlg).toBe(true);
  });

  it("keeps explicit director permissions and reaction settings when loading existing bots", () => {
    const { combat } = normalizeMineflayerBotSettings({
      combat: {
        adaptiveCombat: false,
        combatHealing: false,
        pearlEscape: false,
        pearlEnabled: false,
        crystalEnabled: false,
        reactionMs: 500,
        meleeSkill: 60,
      },
    });
    expect(combat.adaptiveCombat).toBe(false);
    expect(combat.combatHealing).toBe(false);
    expect(combat.pearlEscape).toBe(false);
    expect(combat.pearlEnabled).toBe(false);
    expect(combat.crystalEnabled).toBe(false);
    expect(combat.reactionMs).toBe(500);
    expect(combat.meleeSkill).toBe(60);
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

  it("saves survival preferences independently and bounds eating and rescue thresholds", () => {
    const normalized = normalizeMineflayerBotSettings({
      survival: {
        autoEat: false,
        emergencyMlg: false,
        mlgPickupWater: false,
        autoEatMinHunger: 50,
        autoEatMinHealth: -1,
        mlgMinFallHeight: 0,
        autoEatPriority: "foodPoints",
      },
    });
    expect(normalized.survival).toEqual({
      autoEat: false,
      emergencyMlg: false,
      mlgPickupWater: false,
      autoEatMinHunger: 19,
      autoEatMinHealth: 1,
      mlgMinFallHeight: 4,
      autoEatPriority: "foodPoints",
    });
    expect(normalizeMineflayerBotSettings(JSON.parse(JSON.stringify(normalized)))).toEqual(
      normalized,
    );
    expect(normalized.allowBucketWaterDrop).toBe(true);
  });

  it("keeps every explicit modern setting", () => {
    const modern = {
      ...DEFAULT_MINEFLAYER_BOT_SETTINGS,
      commandSource: "whisper" as const,
      extraOwners: "Alex, Steve",
      allowSayCommand: true,
      canDig: true,
      allowAirStrafe: true,
      stayOnWater: false,
      allowWaterDrop: false,
      allowBucketWaterDrop: false,
      antiKnockback: true,
      autoReconnect: false,
      logPathUpdates: true,
    };

    expect(normalizeMineflayerBotSettings(modern)).toEqual(modern);
  });

  it("preserves passage settings and enforces three-block stair clearance", () => {
    const legacy = normalizeMineflayerBotSettings({}).gathering;
    expect(legacy).toEqual({
      tunnelWidth: 2,
      tunnelHeight: 2,
      stairWidth: 2,
      stairHeight: 3,
      placeTorches: false,
      torchInterval: 8,
      defendMobs: true,
      defendPlayers: true,
      defendArrows: true,
      storageGroups: [],
    });
    const saved = normalizeMineflayerBotSettings({
      gathering: {
        tunnelWidth: 99,
        tunnelHeight: 1,
        stairWidth: 0,
        stairHeight: 2,
        placeTorches: true,
        torchInterval: 99,
        defendMobs: false,
        defendPlayers: false,
        defendArrows: false,
      },
    });
    expect(saved.gathering).toEqual({
      tunnelWidth: 3,
      tunnelHeight: 2,
      stairWidth: 1,
      stairHeight: 3,
      placeTorches: true,
      torchInterval: 16,
      defendMobs: false,
      defendPlayers: false,
      defendArrows: false,
      storageGroups: [],
    });
    expect(normalizeMineflayerBotSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it("keeps anti knockback off by default and preserves both saved modes", () => {
    for (const antiKnockback of [true, false]) {
      const saved = JSON.parse(JSON.stringify(normalizeMineflayerBotSettings({ antiKnockback })));
      expect(normalizeMineflayerBotSettings(saved).antiKnockback).toBe(antiKnockback);
    }
    expect(normalizeMineflayerBotSettings({ antiKnockback: "false" }).antiKnockback).toBe(false);
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

  it("preserves pearl permissions independently of PvP and bounds crystal/pearl limits", () => {
    const normalized = normalizeMineflayerBotSettings({
      combat: {
        enabled: false,
        pearlEnabled: true,
        pearlFollow: false,
        pearlCome: true,
        pearlGoto: true,
        pearlChase: true,
        pearlChain: false,
        pearlMinDistance: 64,
        pearlMaxDistance: 12,
        pearlCooldownMs: 50,
        pearlMinHealth: 0,
        pearlReserve: 100,
        bowDefense: true,
        crystalEnabled: true,
        crystalPriority: "closest",
        crystalBuildBase: false,
        crystalCover: true,
        crystalCoverBlock: "planks",
        crystalPlaceRange: 10,
        crystalBreakRange: 2.5,
        crystalIntervalMs: 0,
        crystalPredictionTicks: 100,
        style: "crystal",
      },
    });
    expect(normalized.combat.enabled).toBe(false);
    expect(normalized.combat.pearlEnabled).toBe(true);
    expect(normalized.combat.pearlFollow).toBe(false);
    expect(normalized.combat.pearlCome).toBe(true);
    expect(normalized.combat.pearlGoto).toBe(true);
    expect(normalized.combat.pearlChase).toBe(true);
    expect(normalized.combat.pearlChain).toBe(false);
    expect(normalized.combat.pearlMinDistance).toBe(12);
    expect(normalized.combat.pearlCooldownMs).toBe(1000);
    expect(normalized.combat.pearlMinHealth).toBe(6);
    expect(normalized.combat.pearlReserve).toBe(64);
    expect(normalized.combat.bowDefense).toBe(true);
    expect(normalized.combat.crystalPriority).toBe("closest");
    expect(normalized.combat.crystalBuildBase).toBe(false);
    expect(normalized.combat.crystalCover).toBe(true);
    expect(normalized.combat.crystalCoverBlock).toBe("planks");
    expect(normalized.combat.crystalPlaceRange).toBe(4.5);
    expect(normalized.combat.crystalBreakRange).toBe(2.5);
    expect(normalized.combat.crystalIntervalMs).toBe(100);
    expect(normalized.combat.crystalPredictionTicks).toBe(10);
    expect(normalized.combat.style).toBe("crystal");
  });
  it("preserves recognition sensitivity and bounds crystal cycle settings", () => {
    const { combat } = normalizeMineflayerBotSettings({
      combat: {
        bowDefenseMode: "trajectory",
        weapon: "mace",
        maceDefense: false,
        bowDefenseCheckMs: -100,
        bowDefenseRange: 200,
        bowDefenseMargin: 0.45,
        bowDefenseHoldMs: 0,
        bowDefenseRequireDraw: false,
        crystalFastAim: false,
        crystalMaxCoverBlocks: 100,
        crystalSpawnTimeoutMs: 1,
        crystalRetries: 0,
      },
    });
    expect(combat.bowDefenseMode).toBe("trajectory");
    expect(combat.weapon).toBe("mace");
    expect(combat.maceDefense).toBe(false);
    expect(normalizeMineflayerBotSettings({}).combat.maceDefense).toBe(true);
    expect(combat.bowDefenseCheckMs).toBe(0);
    expect(combat.bowDefenseRange).toBe(128);
    expect(combat.bowDefenseMargin).toBe(0.45);
    expect(combat.bowDefenseHoldMs).toBe(100);
    expect(combat.bowDefenseRequireDraw).toBe(false);
    expect(combat.crystalFastAim).toBe(false);
    expect(combat.crystalMaxCoverBlocks).toBe(4);
    expect(combat.crystalSpawnTimeoutMs).toBe(300);
    expect(combat.crystalRetries).toBe(1);
  });
});
