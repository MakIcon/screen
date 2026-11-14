import { describe, expect, it } from "vitest";
import { normalizeMineflayerBotSettings } from "../pluginSettings";
import { botConfiguration } from "./botFleet";
import type { MineflayerBotProfile, MineflayerBotStatus } from "../../../types";
import {
  dispatchFleetRequests,
  fleetRecipients,
  fleetTaskCommand,
  fleetTaskCounts,
  parseFleetGroups,
  type FleetReceipt,
} from "./fleetControl";

const profiles: MineflayerBotProfile[] = ["default", "miner", "farmer", "offline"].map((id) => ({
  id,
  settings: botConfiguration(normalizeMineflayerBotSettings({ botNickname: id })),
}));
const statuses: MineflayerBotStatus[] = profiles.map((bot) => ({
  botId: bot.id,
  revision: 1,
  running: bot.id !== "offline",
  state: bot.id === "offline" ? "stopped" : "connected",
  logs: [],
}));

describe("fleet recipients and task amounts", () => {
  it("keeps the inspected bot independent of the selected group", () => {
    expect(
      fleetRecipients(profiles, statuses, "active", "miner", ["farmer"]).map((bot) => bot.id),
    ).toEqual(["miner"]);
    expect(
      fleetRecipients(profiles, statuses, "selected", "miner", [
        "farmer",
        "offline",
        "deleted",
      ]).map((bot) => bot.id),
    ).toEqual(["farmer", "offline"]);
    expect(fleetRecipients(profiles, statuses, "selected", "miner", [])).toEqual([]);
  });

  it("all connected excludes offline, reconnecting, stale and removed bots", () => {
    const changed = statuses.map((status) =>
      status.botId === "miner" ? { ...status, state: "reconnecting" } : status,
    );
    expect(
      fleetRecipients(
        profiles,
        [...changed, { ...statuses[0], botId: "removed" }],
        "all",
        "miner",
        [],
      ).map((bot) => bot.id),
    ).toEqual(["default", "farmer"]);
    expect(
      fleetRecipients(profiles, [{ ...statuses[0], botId: undefined }], "all", "miner", []).map(
        (bot) => bot.id,
      ),
    ).toEqual(["default"]);
  });

  it("distributes exactly the total with a maximum difference of one, including fewer items than bots", () => {
    for (const count of [1, 2, 64, 127, 1000000])
      for (const bots of [1, 3, 100]) {
        const amounts = fleetTaskCounts(count, bots, true);
        expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(count);
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
      }
    expect(fleetTaskCounts(2, 4, true)).toEqual([1, 1, 0, 0]);
    expect(fleetTaskCounts(64, 3, false)).toEqual([64, 64, 64]);
    expect(fleetTaskCounts(0, 3, true)).toEqual([]);
    expect(fleetTaskCounts(3.5, 3, true)).toEqual([]);
    expect(fleetTaskCounts(64, 0, true)).toEqual([]);
  });

  it("creates supported commands and rejects injected names, missing coordinates and invalid amounts", () => {
    expect(fleetTaskCommand("mine", "minecraft:iron_ore", 64, 32, "")).toBe("mine iron_ore 64 32");
    expect(fleetTaskCommand("forest", "", 16, 32, "")).toBe("forest 32 16 logs scaffold");
    expect(fleetTaskCommand("farm", "wheat", 16, 8, "")).toBe("farm wheat 16 8");
    expect(fleetTaskCommand("collect", "", 1, 16, "")).toBe("collect 16");
    expect(fleetTaskCommand("craft", "stone_pickaxe", 1, 32, "")).toBe(
      "craft stone_pickaxe 1 auto",
    );
    expect(fleetTaskCommand("smelt", "raw_iron", 16, 32, "")).toBe("smelt raw_iron 16 auto");
    expect(fleetTaskCommand("goto", "", 1, 32, "10 64 -20")).toBe("goto 10 64 -20");
    for (const value of [
      "",
      "10 64",
      "10 64 NaN",
      "10 64 20 30",
      "Infinity 64 20",
      "30000001 64 0",
      "1 9999 0",
    ])
      expect(fleetTaskCommand("goto", "", 1, 32, value)).toBeNull();
    expect(fleetTaskCommand("mine", "stone 64\nstop", 1, 32, "")).toBeNull();
    expect(fleetTaskCommand("mine", "stone", 0, 32, "")).toBeNull();
  });
});

describe("fleet dispatch", () => {
  const requests = ["prepare", "task"].map((command) => ({
    command,
    args: { botId: "wrong", value: 1 },
  }));
  const job = (botId: string) => ({ botId, name: botId, requests });
  const options = (receipts: FleetReceipt[], cancelled = () => false) => ({
    cancelled,
    offlineMessage: "Offline",
    errorMessage: (cause: unknown) => String(cause),
    onReceipt: (receipt: FleetReceipt) => receipts.push(receipt),
  });

  it("targets every request by ID, orders preparation before work and isolates a bot's failure", async () => {
    const calls: string[] = [],
      receipts: FleetReceipt[] = [];
    await dispatchFleetRequests(
      [job("miner"), job("farmer"), { ...job("offline"), offline: true }],
      async (command, args) => {
        calls.push(`${args.botId}:${command}`);
        if (args.botId === "miner" && command === "prepare")
          throw new Error("Cannot prepare miner");
      },
      options(receipts),
    );
    expect(calls.filter((call) => call.startsWith("miner"))).toEqual(["miner:prepare"]);
    expect(calls.filter((call) => call.startsWith("farmer"))).toEqual([
      "farmer:prepare",
      "farmer:task",
    ]);
    expect(calls.some((call) => call.startsWith("offline"))).toBe(false);
    expect(receipts.find((receipt) => receipt.botId === "miner")?.state).toBe("error");
    expect(receipts.find((receipt) => receipt.botId === "farmer")?.state).toBe("accepted");
    expect(receipts.find((receipt) => receipt.botId === "offline")?.error).toContain("Offline");
  });

  it("stop cancels pending tasks even if a bot's preparation is already in flight", async () => {
    let cancelled = false;
    const calls: string[] = [],
      receipts: FleetReceipt[] = [];
    await dispatchFleetRequests(
      Array.from({ length: 8 }, (_, index) => job(`bot-${index}`)),
      async (command, args) => {
        calls.push(`${args.botId}:${command}`);
        cancelled = true;
      },
      options(receipts, () => cancelled),
    );
    expect(calls).toEqual(["bot-0:prepare"]);
    expect(receipts).toHaveLength(8);
    expect(receipts.every((receipt) => receipt.state === "cancelled")).toBe(true);
  });

  it("bounds concurrent IPC requests for a large fleet", async () => {
    let inFlight = 0,
      peak = 0;
    const receipts: FleetReceipt[] = [];
    await dispatchFleetRequests(
      Array.from({ length: 12 }, (_, index) => job(`bot-${index}`)),
      async () => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
      },
      options(receipts),
    );
    expect(peak).toBe(4);
    expect(receipts).toHaveLength(12);
  });
});

it("restores saved groups and tolerates corrupt storage", () => {
  const group = { id: "miners", name: "Miners", botIds: ["default", "miner"] };
  expect(parseFleetGroups(JSON.stringify([group]))).toEqual([group]);
  for (const value of [null, "broken", "{}", "null", '[null,{}, {"name":3}]'])
    expect(parseFleetGroups(value)).toEqual([]);
});
