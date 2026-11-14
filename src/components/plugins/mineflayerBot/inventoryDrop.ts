import type { MineflayerInventory } from "../../../types";

export type InventoryDropItem = { slot: number; count: number; fingerprint: string };

export function inventoryDropSelection(
  inventory: MineflayerInventory | null | undefined,
  selected: number | null,
  one = false,
): InventoryDropItem[] {
  if (!inventory?.dropSupported) return [];
  return inventory.slots.flatMap((item, slot) => {
    if (slot < 5 || slot > 45 || (selected !== null && slot !== selected) || !item?.fingerprint)
      return [];
    return [{ slot, count: one ? 1 : item.count, fingerprint: item.fingerprint }];
  });
}
