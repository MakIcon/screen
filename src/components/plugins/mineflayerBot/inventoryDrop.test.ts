import { describe, expect, it } from "vitest";
import type { MineflayerInventory, MineflayerInventoryItem } from "../../../types";
import { inventoryDropSelection } from "./inventoryDrop";

describe("inventory drops", () => {
  function inventory() {
    const slots = Array<MineflayerInventoryItem | null>(46).fill(null);
    for (const slot of [0, 1, 5, 6, 7, 8, 9, 36, 45])
      slots[slot] = {
        slot,
        count: slot < 9 ? 1 : 64,
        fingerprint: String(slot).padStart(64, "0"),
      } as MineflayerInventoryItem;
    return { dropSupported: true, slots } as MineflayerInventory;
  }
  it("selects the full player inventory, armor and offhand while excluding crafting slots", () => {
    expect(inventoryDropSelection(inventory(), null).map((item) => item.slot)).toEqual([
      5, 6, 7, 8, 9, 36, 45,
    ]);
  });
  it("drops a selected stack or a single item using its current fingerprint", () => {
    const source = inventory();
    expect(inventoryDropSelection(source, 36)).toEqual([
      { slot: 36, count: 64, fingerprint: source.slots[36]?.fingerprint },
    ]);
    expect(inventoryDropSelection(source, 36, true)[0].count).toBe(1);
    expect(inventoryDropSelection(source, 5)[0].count).toBe(1);
    expect(inventoryDropSelection(source, 15)).toEqual([]);
  });
  it("does not send unverified items from older workers", () => {
    const source = inventory();
    source.dropSupported = false;
    expect(inventoryDropSelection(source, null)).toEqual([]);
    source.dropSupported = true;
    delete source.slots[36]!.fingerprint;
    expect(inventoryDropSelection(source, 36)).toEqual([]);
  });
});
