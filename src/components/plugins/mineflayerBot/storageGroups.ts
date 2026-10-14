import type { MineflayerStorageGroup, MinecraftCatalog } from "../../../types";
import filters from "../../../../extensions/mineflayer-bot/storage-filters.json";

export const STORAGE_FILTERS = filters as Array<{
  name: string;
  displayName: string;
  description: string;
  icon: string;
  material?: string;
}>;
export function storageChestCount(count: number) {
  const last = count % 10,
    teen = count % 100 >= 11 && count % 100 <= 14;
  return `${count} ${!teen && last === 1 ? "сундук" : !teen && last >= 2 && last <= 4 ? "сундука" : "сундуков"}`;
}
export const storagePositionKey = (point: { x: number; y: number; z: number }) =>
  `${point.x},${point.y},${point.z}`;

export function normalizeStorageGroups(value: unknown): MineflayerStorageGroup[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.slice(0, 32).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const group = entry as Partial<MineflayerStorageGroup>;
    const id =
      typeof group.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(group.id)
        ? group.id
        : `storage-${index + 1}`;
    if (ids.has(id)) return [];
    ids.add(id);
    const positions = new Set<string>();
    const chests = (Array.isArray(group.chests) ? group.chests : [])
      .slice(0, 32)
      .filter((point) => {
        if (
          !point ||
          ![point.x, point.y, point.z].every(
            (number) => Number.isSafeInteger(number) && Math.abs(number) <= 30000000,
          )
        )
          return false;
        const key = storagePositionKey(point);
        if (positions.has(key)) return false;
        positions.add(key);
        return true;
      })
      .map(({ x, y, z }) => ({ x, y, z }));
    return [
      {
        id,
        name: typeof group.name === "string" ? group.name.slice(0, 64) : `Группа ${index + 1}`,
        enabled: group.enabled !== false,
        filters: [
          ...new Set(
            (Array.isArray(group.filters) ? group.filters : [])
              .filter((token) => typeof token === "string")
              .map((token) =>
                token
                  .trim()
                  .toLowerCase()
                  .replace(/^minecraft:/, ""),
              )
              .filter(
                (token) =>
                  STORAGE_FILTERS.some((filter) => filter.name === token) ||
                  /^[a-z0-9_]+\*?$/.test(token),
              ),
          ),
        ].slice(0, 64),
        chests,
      },
    ];
  });
}

export function storageCatalog(catalog: MinecraftCatalog): MinecraftCatalog {
  const entries = catalog.entries
    .filter((entry) => entry.kind !== "group" && (entry.item || entry.mineable))
    .map((entry) => ({
      ...entry,
      item: true,
      section: entry.kind === "group" ? "resources" : "item",
    }));
  return {
    ...catalog,
    entries: [
      ...STORAGE_FILTERS.map((filter) => ({
        ...filter,
        texture: catalog.entries.find((entry) => entry.name === filter.icon)?.texture || "",
        kind: "group" as const,
        item: true,
        mineable: false,
        section: filter.material ? "resources" : "storage",
      })),
      ...entries,
    ],
  };
}

export function moveStorageGroup(groups: MineflayerStorageGroup[], id: string, direction: -1 | 1) {
  const index = groups.findIndex((group) => group.id === id),
    next = index + direction;
  if (index < 0 || next < 0 || next >= groups.length) return groups;
  const copy = [...groups];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}
