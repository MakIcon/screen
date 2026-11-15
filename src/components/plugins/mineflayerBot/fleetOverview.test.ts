import { describe, expect, it } from "vitest";
import { fleetOverview } from "./fleetOverview";
import { normalizeMineflayerBotSettings } from "../pluginSettings";
import type {
  MineflayerBotStatus,
  MineflayerInventory,
  MineflayerInventoryItem,
} from "../../../types";
const profile = (id: string) => ({ id, settings: normalizeMineflayerBotSettings({}) });
const item = (name: string, count: number) =>
  ({ name, count, displayName: name, texture: "" }) as MineflayerInventoryItem;
const status = (
  id: string,
  phase: string,
  slots: Array<MineflayerInventoryItem | null>,
  online = true,
) =>
  ({
    botId: id,
    running: online,
    state: online ? "connected" : "stopped",
    revision: 1,
    logs: [],
    inventory: {
      slots,
      workflow: { phase, steps: [{ state: "complete" }, { state: "waiting" }] },
    } as MineflayerInventory,
  }) as MineflayerBotStatus;

describe("fleet overview", () => {
  it("adds stacks and equipment once per bot, ignoring stale offline inventories and unrelated statuses", () => {
    const summary = fleetOverview(
      [profile("default"), profile("b"), profile("offline")],
      [
        {
          ...status("default", "complete", [
            item("cobblestone", 64),
            null,
            item("cobblestone", 64),
          ]),
          botId: undefined,
        },
        status("b", "running", [item("cobblestone", 546), item("iron_helmet", 1)]),
        status("offline", "error", [item("cobblestone", 999)], false),
        status("other", "complete", [item("diamond", 100)]),
      ],
    );
    expect(summary.items).toEqual([
      { name: "cobblestone", displayName: "cobblestone", texture: "", count: 674, bots: 2 },
      { name: "iron_helmet", displayName: "iron_helmet", texture: "", count: 1, bots: 1 },
    ]);
    expect([
      summary.complete,
      summary.running,
      summary.errors,
      summary.online,
      summary.reporting,
    ]).toEqual([1, 1, 1, 2, 2]);
    expect(summary.bots[0].completed).toBe(1);
  });
  it("keeps the selected scope and handles absent telemetry", () => {
    const summary = fleetOverview(
      [profile("b"), profile("new")],
      [status("a", "complete", [item("diamond", 1)])],
    );
    expect(summary.bots.map((bot) => bot.profile.id)).toEqual(["b", "new"]);
    expect(summary.items).toEqual([]);
    expect(summary.online).toBe(0);
    expect(summary.complete).toBe(0);
  });
});
