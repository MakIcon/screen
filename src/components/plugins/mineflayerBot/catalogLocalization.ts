import type { MinecraftCatalog } from "../../../types";
import { isPlainMessageKey, translate } from "../../../i18n/locale";

// The bundled catalog and storage filters ship Russian group texts; the interface
// shows them from `bot.catalog.*` and `bot.storageFilter.*` messages instead.
function groupDescription(description: string | undefined): string | undefined {
  if (!description) return description;
  const count = description.match(/^(\d+)\s/)?.[1];
  if (count) return translate("bot.catalog.blockTypes", { count: Number(count) });
  if (description === "все руды") return translate("bot.catalog.allOres");
  if (description === "все стволы") return translate("bot.catalog.allLogs");
  return description;
}

/** Returns the catalog with group titles in the interface language. */
export function localizeCatalog<T extends MinecraftCatalog>(catalog: T): T {
  return {
    ...catalog,
    entries: catalog.entries.map((entry) => {
      if (entry.kind !== "group") return entry;
      const key = `bot.catalog.group.${entry.name}`;
      return {
        ...entry,
        displayName: isPlainMessageKey(key) ? translate(key) : entry.displayName,
        description: groupDescription(entry.description),
      };
    }),
  };
}

export function localizeStorageFilter<
  T extends { name: string; displayName: string; description: string },
>(filter: T): T {
  const base = `bot.storageFilter.${filter.name.replace(/^#/, "")}`;
  const name = `${base}.name`;
  const description = `${base}.description`;
  return {
    ...filter,
    displayName: isPlainMessageKey(name) ? translate(name) : filter.displayName,
    description: isPlainMessageKey(description) ? translate(description) : filter.description,
  };
}
