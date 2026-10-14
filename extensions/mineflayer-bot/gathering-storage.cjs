const { isDeepStrictEqual } = require("node:util");
const FILTERS = require("./storage-filters.json");
const categories = new Set(FILTERS.map((entry) => entry.name));
const materials = new Set([
  "coal",
  "iron",
  "copper",
  "gold",
  "redstone",
  "lapis",
  "diamond",
  "emerald",
  "quartz",
  "netherite",
]);
const timber =
  /^(?:stripped_)?(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|bamboo|crimson|warped)_/;
const woodItems = new Set([
  "stick",
  "ladder",
  "chest",
  "trapped_chest",
  "barrel",
  "crafting_table",
  "bookshelf",
  "chiseled_bookshelf",
  "lectern",
  "composter",
  "cartography_table",
  "fletching_table",
  "smithing_table",
  "loom",
  "note_block",
  "jukebox",
  "bowl",
  "charcoal",
]);
const stones =
  /^(?:stone|cobblestone|deepslate|cobbled_deepslate|tuff|granite|diorite|andesite|calcite|basalt|smooth_basalt|blackstone|netherrack|end_stone)(?:$|_)/;
const key = (point) => `${point.x},${point.y},${point.z}`;

function normalizeStorageGroups(input = []) {
  if (!Array.isArray(input) || input.length > 32)
    throw new Error("Можно добавить до 32 групп сундуков");
  const ids = new Set();
  return input.map((group, index) => {
    if (
      !group ||
      typeof group !== "object" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(group.id || "") ||
      ids.has(group.id)
    )
      throw new Error("У каждой группы сундуков должен быть уникальный ID");
    ids.add(group.id);
    if (
      typeof group.name !== "string" ||
      group.name.length > 64 ||
      !Array.isArray(group.filters) ||
      group.filters.length > 64 ||
      !Array.isArray(group.chests) ||
      group.chests.length > 32
    )
      throw new Error("Группа: название до 64 символов, до 64 ресурсов и до 32 сундуков");
    if (group.enabled != null && typeof group.enabled !== "boolean")
      throw new Error("Группа: включено или выключено");
    const filters = [
      ...new Set(
        group.filters.map((value) => {
          if (typeof value !== "string")
            throw new Error("Выберите предмет, блок или группу ресурсов");
          const token = value
            .trim()
            .toLowerCase()
            .replace(/^minecraft:/, "");
          if (!categories.has(token) && !/^[a-z0-9_]+\*?$/.test(token))
            throw new Error(`Неизвестный фильтр: ${value}`);
          return token;
        }),
      ),
    ];
    const positions = new Set();
    const chests = group.chests
      .map((point) => {
        if (
          !point ||
          !["x", "y", "z"].every(
            (axis) => Number.isSafeInteger(point[axis]) && Math.abs(point[axis]) <= 30000000,
          )
        )
          throw new Error("Сундук: нужны целые координаты x y z");
        return { x: point.x, y: point.y, z: point.z };
      })
      .filter((point) => {
        if (positions.has(key(point))) return false;
        positions.add(key(point));
        return true;
      });
    return {
      id: group.id,
      name: group.name.trim() || `Группа ${index + 1}`,
      enabled: group.enabled !== false,
      filters,
      chests,
    };
  });
}
function materialMatches(material, name) {
  return [
    material,
    `${material}_ore`,
    `deepslate_${material}_ore`,
    `nether_${material}_ore`,
    `raw_${material}`,
    `raw_${material}_block`,
    `${material}_ingot`,
    `${material}_nugget`,
    `${material}_block`,
    ...(material === "lapis" ? ["lapis_lazuli"] : []),
    ...(material === "netherite" ? ["ancient_debris", "netherite_scrap"] : []),
  ].includes(name);
}
function matchesFilter(token, name, registry) {
  if (token === "#all") return true;
  if (token === "#wood")
    return timber.test(name) || woodItems.has(name) || name.startsWith("wooden_");
  if (token === "#logs") return /(?:_log|_wood|_stem|_hyphae)$/.test(name);
  if (token === "#leaves")
    return /(?:_leaves|_sapling)$/.test(name) || name === "mangrove_propagule";
  if (token === "#ores")
    return /_ore$/.test(name) || [...materials].some((material) => materialMatches(material, name));
  if (token === "#stone") return stones.test(name) && !/_ore$/.test(name);
  if (token.startsWith("#") && materials.has(token.slice(1)))
    return materialMatches(token.slice(1), name);
  if (materials.has(token) && !registry?.itemsByName[token]) return materialMatches(token, name);
  if (token.endsWith("*")) return name.startsWith(token.slice(0, -1));
  if (token === name) return true;
  // Selecting a mined ore block also routes its actual drop on this server.
  return (
    /_ore$/.test(token) &&
    registry?.blocksByName[token]?.drops?.some((id) => registry.items?.[id]?.name === name)
  );
}
function storageGroupForItem(groups, item, registry) {
  const active = groups.filter(
    (group) => group.enabled && group.chests.length && group.filters.length,
  );
  return (
    active.find((group) =>
      group.filters.some((token) => token !== "#all" && matchesFilter(token, item.name, registry)),
    ) ||
    active.find((group) => group.filters.includes("#all")) ||
    null
  );
}
function sameStack(left, right) {
  return (
    left?.type === right?.type &&
    left?.metadata === right?.metadata &&
    isDeepStrictEqual(left?.nbt ?? null, right?.nbt ?? null) &&
    isDeepStrictEqual(left?.components ?? [], right?.components ?? [])
  );
}
function containerCapacity(window, item, registry) {
  if (!window.slots || !Number.isInteger(window.inventoryStart)) return item.count;
  const limit = item.stackSize || registry.itemsByName[item.name]?.stackSize || 64;
  return window.slots
    .slice(0, window.inventoryStart)
    .reduce(
      (count, stored) =>
        count + (!stored ? limit : sameStack(stored, item) ? Math.max(0, limit - stored.count) : 0),
      0,
    );
}
module.exports = {
  FILTERS,
  normalizeStorageGroups,
  storageGroupForItem,
  matchesFilter,
  containerCapacity,
  key,
};
