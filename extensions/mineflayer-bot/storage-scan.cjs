const { key, matchesFilter, normalizeStorageGroups } = require("./gathering-storage.cjs");

const STORAGE_NAMES = /^(?:chest|trapped_chest|barrel|(?:[a-z_]+_)?shulker_box)$/;
const CATEGORIES = ["#valuable", "#ores", "#wood", "#food", "#bulk", "#all"];
const LABELS = {
  "#valuable": "Ценные ресурсы",
  "#ores": "Руды и металлы",
  "#wood": "Древесина",
  "#food": "Еда",
  "#bulk": "Массовые блоки и мусор",
  "#all": "Разные предметы",
  mixed: "Смешанный склад",
};
const isStorage = (name) => STORAGE_NAMES.test(name);
const point = ({ x, y, z }) => ({ x, y, z });

function chestPartner(bot, block) {
  if (!/^(chest|trapped_chest)$/.test(block.name)) return null;
  const props = block.getProperties?.() || {};
  if (props.type == null) {
    if (!["north", "south", "east", "west"].includes(props.facing)) return null;
    const adjacent = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([x, z]) => bot.blockAt(block.position.offset(x, 0, z)))
      .filter(
        (other) => other?.name === block.name && other.getProperties?.().facing === props.facing,
      );
    return adjacent.length === 1 ? adjacent[0] : null;
  }
  if (!["left", "right"].includes(props.type)) return null;
  const facing = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[props.facing];
  if (!facing) return null;
  const side = props.type === "left" ? 1 : -1;
  const partner = bot.blockAt(block.position.offset(-facing[1] * side, 0, facing[0] * side));
  const other = partner?.getProperties?.() || {};
  return partner?.name === block.name &&
    other.facing === props.facing &&
    other.type === (props.type === "left" ? "right" : "left")
    ? partner
    : null;
}

function discoverBlocks(bot, names, radius, count = 128) {
  const origin = bot.entity.position.clone();
  const matching = Object.values(bot.registry.blocksByName)
    .filter((block) => names(block.name))
    .map((block) => block.id);
  const seen = new Set();
  return bot
    .findBlocks({ point: origin, matching, maxDistance: radius, count: count * 2 })
    .map((position) => bot.blockAt(position))
    .filter((block) => block && names(block.name) && block.position.distanceTo(origin) <= radius)
    .sort((a, b) => a.position.distanceTo(origin) - b.position.distanceTo(origin))
    .flatMap((block) => {
      const partner = chestPartner(bot, block);
      const positions = [point(block.position), ...(partner ? [point(partner.position)] : [])];
      const identity = positions.map(key).sort()[0];
      if (seen.has(identity)) return [];
      seen.add(identity);
      return [
        {
          name: block.name,
          position: point(block.position),
          positions,
          distance: Math.round(block.position.distanceTo(origin) * 10) / 10,
        },
      ];
    })
    .slice(0, count);
}

function inspectContents(window, registry) {
  const slots = window.slots.slice(0, window.inventoryStart);
  const contents = new Map(),
    categories = new Set();
  for (const item of slots.filter(Boolean)) {
    contents.set(item.name, (contents.get(item.name) || 0) + item.count);
    categories.add(CATEGORIES.find((category) => matchesFilter(category, item.name, registry)));
  }
  const category = categories.size > 1 ? "mixed" : [...categories][0] || null;
  return {
    totalSlots: slots.length,
    freeSlots: slots.filter((item) => !item).length,
    contents: [...contents].map(([name, count]) => ({ name, count })),
    category,
    label: category ? LABELS[category] : "Пустой сундук",
  };
}

// Reserve the largest share of empty slot capacity for bulk. Existing contents
// and manually configured destinations always keep their purpose.
function assignStorage(records, configured = []) {
  const groups = normalizeStorageGroups(configured),
    warnings = [];
  const owned = new Set(groups.flatMap((group) => group.chests.map(key)));
  const assignments = records.map((record) => ({ ...record }));
  const generated = new Map();
  let added = 0;
  function put(record, category) {
    let group = [...groups, ...generated.values()].find(
      (group) =>
        group.enabled &&
        group.id.startsWith("auto-scan-") &&
        group.chests.length < 32 &&
        (category === "mixed"
          ? group.name === LABELS.mixed
          : category === "#all"
            ? group.filters.length === 1 && group.filters[0] === category
            : group.filters.includes(category)),
    );
    if (!group) {
      if (groups.length + generated.size >= 32) {
        warnings.push("Достигнут лимит 32 групп; часть сундуков не добавлена");
        return false;
      }
      const base = `auto-scan-${category.replace(/^#/, "")}`,
        ids = new Set([...groups, ...generated.values()].map((entry) => entry.id));
      let id = base,
        suffix = 1;
      while (ids.has(id)) id = `${base}-${suffix++}`;
      group = {
        id,
        name: LABELS[category],
        enabled: true,
        filters: category === "#bulk" ? ["#bulk", "#all"] : category === "mixed" ? [] : [category],
        chests: [],
      };
      generated.set(id, group);
    }
    if (group.chests.length >= 32) {
      warnings.push(`В группе «${group.name}» уже 32 сундука`);
      return false;
    }
    if (category === "mixed") {
      const filters = [...new Set([...group.filters, ...record.contents.map((item) => item.name)])];
      if (filters.length > 64) {
        warnings.push("Слишком много видов предметов в смешанных сундуках");
        return false;
      }
      group.filters = filters;
    }
    group.chests.push(point(record.position));
    added++;
    record.category = category;
    record.label = group.name;
    record.groupId = group.id;
    record.positions.forEach((position) => owned.add(key(position)));
    return true;
  }
  const empty = [];
  for (const record of assignments) {
    if (record.error) continue;
    const existing = groups.find((group) =>
      group.chests.some((position) =>
        record.positions.some((alias) => key(alias) === key(position)),
      ),
    );
    if (existing) {
      record.groupId = existing.id;
      record.label = existing.name;
      record.configured = true;
      continue;
    }
    if (record.positions.some((position) => owned.has(key(position)))) continue;
    if (record.contents.length) put(record, record.category);
    else empty.push(record);
  }
  // Use smaller empty containers for valuables, leave large/double chests for bulk.
  empty.sort((a, b) => a.totalSlots - b.totalSlots || a.distance - b.distance);
  const capacity = (category) => {
    const ids = new Set(
      [...groups, ...generated.values()]
        .filter((group) => group.enabled && group.filters.includes(category))
        .flatMap((group) => group.chests.map(key)),
    );
    return assignments
      .filter(
        (record) => !record.error && record.positions.some((position) => ids.has(key(position))),
      )
      .reduce((sum, record) => sum + record.freeSlots, 0);
  };
  const missingValuables = capacity("#valuable") === 0;
  if (empty.length >= 2 && missingValuables) put(empty.shift(), "#valuable");
  while (empty.length) {
    const category =
      capacity("#bulk") < capacity("#valuable") * 2 || empty.length === 1
        ? "#bulk"
        : ["#ores", "#wood", "#food"].find((category) => capacity(category) === 0) || "#bulk";
    // Allocate the biggest available box to bulk so it wins by slot capacity.
    const record = category === "#bulk" ? empty.pop() : empty.shift();
    put(record, category);
  }
  if (!capacity("#valuable"))
    warnings.push(
      "Нет отдельного свободного сундука для ценностей; добавьте ещё один сундук и повторите сканирование",
    );
  const additions = [...generated.values()].sort((a, b) => {
    const rank = (group) =>
      group.filters.includes("#valuable") ? 0 : group.filters.includes("#bulk") ? 9 : 1;
    return rank(a) - rank(b);
  });
  const combined = [...groups, ...additions];
  const precious = combined.filter(
    (group) => group.id.startsWith("auto-scan-") && group.filters.includes("#valuable"),
  );
  const ordered = combined.filter((group) => !precious.includes(group));
  const firstAuto = ordered.findIndex((group) => group.id.startsWith("auto-scan-"));
  ordered.splice(firstAuto < 0 ? ordered.length : firstAuto, 0, ...precious);
  return {
    groups: normalizeStorageGroups(ordered),
    records: assignments,
    added,
    warnings: [...new Set(warnings)],
  };
}

module.exports = { isStorage, discoverBlocks, inspectContents, assignStorage, chestPartner };
