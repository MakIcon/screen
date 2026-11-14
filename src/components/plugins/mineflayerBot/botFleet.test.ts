import { describe, expect, it } from "vitest";
import { DEFAULT_MINEFLAYER_BOT_SETTINGS, normalizeMineflayerBotSettings } from "../pluginSettings";
import { botConfiguration, createBotProfiles, chaoticMovementTargets } from "./botFleet";
import type { MineflayerBotStatus, MineflayerInventory } from "../../../types";
import { botStorageKey } from "./BotSessionContext";

describe("bot profiles", () => {
  it("starts chaos only for connected bots and stops only active chaos without interrupting other jobs", () => {
    const bot = (botId: string, state: string, chaoticMovement = false): MineflayerBotStatus => ({
      botId,
      revision: 1,
      running: state !== "stopped",
      state,
      logs: [],
      inventory: { chaoticMovement } as MineflayerInventory,
    });
    const statuses = [
      bot("default", "connected"),
      bot("miner", "connected", true),
      bot("farmer", "reconnecting", true),
      bot("offline", "stopped", true),
    ];
    expect(chaoticMovementTargets(statuses, true).map((bot) => bot.botId)).toEqual([
      "default",
      "miner",
    ]);
    expect(chaoticMovementTargets(statuses, false).map((bot) => bot.botId)).toEqual(["miner"]);
  });
  it("keeps the legacy bot and normalizes independent profiles through a save round trip", () => {
    const saved = normalizeMineflayerBotSettings({
      host: "localhost",
      bots: [
        {
          id: "miner",
          settings: {
            host: "192.168.1.2",
            port: 51234,
            botNickname: "Miner",
            combat: { enabled: true },
            gathering: { tunnelWidth: 3 },
          },
        },
        {
          id: "farmer",
          settings: {
            host: "localhost",
            port: 25566,
            botNickname: "Farmer",
            survival: { autoEat: false },
          },
        },
      ],
    });
    expect(saved.host).toBe("localhost");
    expect(saved.bots[0].settings.port).toBe(51234);
    expect(saved.bots[0].settings.gathering.tunnelWidth).toBe(3);
    expect(saved.bots[1].settings.survival.autoEat).toBe(false);
    expect(normalizeMineflayerBotSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(normalizeMineflayerBotSettings({}).bots).toEqual([]);
  });

  it("rejects duplicate and reserved IDs, strips nested profiles and caps the fleet", () => {
    const bots = [
      { id: "default", settings: {} },
      { id: "../invalid", settings: {} },
      { id: "one", settings: { bots: [{ id: "nested", settings: {} }] } },
      { id: "one", settings: {} },
      ...Array.from({ length: 110 }, (_, i) => ({ id: `bot-${i}`, settings: {} })),
    ];
    const normalized = normalizeMineflayerBotSettings({ bots });
    expect(normalized.bots).toHaveLength(99);
    expect(normalized.bots[0].id).toBe("one");
    expect(normalized.bots[0].settings).not.toHaveProperty("bots");
  });

  it("creates unique legal usernames and independent copies without reusing Microsoft accounts", () => {
    const settings = normalizeMineflayerBotSettings({
      botNickname: "screen_bot_1",
      host: "lan.local",
      botAccountMode: "microsoft",
      botMicrosoftAccountId: "account",
    });
    const created = createBotProfiles(settings, botConfiguration(settings), 3, "SCREEN_BOT");
    expect(created.map((bot) => bot.settings.botNickname)).toEqual([
      "SCREEN_BOT_2",
      "SCREEN_BOT_3",
      "SCREEN_BOT_4",
    ]);
    expect(new Set(created.map((bot) => bot.id)).size).toBe(3);
    for (const { settings: bot } of created) {
      expect(bot.host).toBe("lan.local");
      expect(bot.botAccountMode).toBe("offline");
      expect(bot.botMicrosoftAccountId).toBeNull();
      expect(bot.botNickname).toMatch(/^[a-zA-Z0-9_]{3,16}$/);
    }
    created[0].settings.combat.enabled = !created[1].settings.combat.enabled;
    expect(created[0].settings.combat.enabled).not.toBe(created[1].settings.combat.enabled);
    const many = createBotProfiles(
      settings,
      botConfiguration(settings),
      500,
      "A very long prefix!",
    );
    expect(many).toHaveLength(99);
    expect(many.every((bot) => /^[a-zA-Z0-9_]{3,16}$/.test(bot.settings.botNickname))).toBe(true);
  });

  it("keeps workflow storage separate while preserving existing primary drafts", () => {
    expect(botStorageKey("draft", "default")).toBe("draft");
    expect(botStorageKey("draft", "miner")).toBe("draft:miner");
    expect(botStorageKey("draft", "farmer")).not.toBe(botStorageKey("draft", "miner"));
    expect(botConfiguration(DEFAULT_MINEFLAYER_BOT_SETTINGS)).not.toHaveProperty("bots");
  });
});
