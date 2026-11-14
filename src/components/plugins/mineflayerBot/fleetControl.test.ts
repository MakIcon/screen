import { describe, expect, it } from "vitest";
import { normalizeMineflayerBotSettings } from "../pluginSettings";
import { botConfiguration } from "./botFleet";
import type { MineflayerBotProfile, MineflayerBotStatus } from "../../../types";
import {
  dispatchFleetRequests,
  fleetWorkflowRequests,
  workflowIsRunning,
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

describe("one workflow for a fleet", () => {
  it("dispatches the same plan with each bot's own gathering settings", () => {
    const miner = profiles[0];
    const farmer = structuredClone(profiles[1]);
    farmer.settings.gathering.defendMobs = !miner.settings.gathering.defendMobs;
    farmer.settings.gathering.tunnelWidth = 3;
    farmer.settings.gathering.storageGroups = [
      { id: "farm", name: "Farm", enabled: true, filters: [], chests: [{ x: 10, y: 64, z: 12 }] },
    ];
    const plan = [
      { kind: "mine" as const, item: "iron", count: 9, radius: 32 },
      { kind: "craft" as const, item: "iron_pickaxe", count: 1 },
    ];
    const requests = [miner, farmer].map((bot) =>
      fleetWorkflowRequests(bot, "start", plan, "Iron tools"),
    );
    expect(requests[0][requests[0].length - 1].args).toEqual(
      requests[1][requests[1].length - 1].args,
    );
    expect(requests[0][requests[0].length - 1].args.steps).toEqual(plan);
    expect(requests[0][0].args.groups).toEqual(miner.settings.gathering.storageGroups);
    expect(requests[1][0].args.groups).toEqual(farmer.settings.gathering.storageGroups);
    expect(requests[0][1].args.message).not.toBe(requests[1][1].args.message);
    expect(requests[1][2].args.message).toMatch(/^work tunnels 3 /);
  });

  it("pauses, resumes and stops without configuring or restarting work", () => {
    for (const action of ["pause", "resume", "stop"] as const)
      expect(fleetWorkflowRequests(profiles[0], action)).toEqual([
        { command: "control_mineflayer_bot_workflow", args: { action, steps: null, name: null } },
      ]);
  });

  it("ignores stale running workflows on offline bots", () => {
    const running = {
      ...statuses[0],
      inventory: { workflow: { phase: "running" } },
    } as MineflayerBotStatus;
    expect(workflowIsRunning(running)).toBe(true);
    expect(workflowIsRunning({ ...running, running: false })).toBe(false);
    expect(workflowIsRunning({ ...running, state: "reconnecting" })).toBe(false);
    expect(workflowIsRunning(statuses[0])).toBe(false);
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
