const { Vec3 } = require("vec3");
const farming = require("./farming.cjs");

const DEFAULTS = Object.freeze({
  ...require("./gathering-defaults.json"),
  radius: 32,
  maxRadius: 64,
  maxAreaVolume: 32768,
  maxQueue: 32,
  reserveSlots: 2,
  minHealth: 6,
  minToolDurability: 5,
  operationTimeoutMs: 30000,
  moveTimeoutMs: 10000,
  pickupTimeoutMs: 5000,
  dropWaitMs: 1000,
  rescanIntervalMs: 3000,
  digReach: 4.5,
  maxAttempts: 2,
  scanLimit: 512,
  travelBlockReserve: 64,
});

function passageSettings(input = {}, defaults = DEFAULTS) {
  const result = {};
  for (const [name, label, min, max] of [
    ["tunnelWidth", "Ширина тоннеля", 1, 3],
    ["tunnelHeight", "Высота тоннеля", 2, 4],
    ["stairWidth", "Ширина лестницы", 1, 3],
    ["stairHeight", "Просвет лестницы", 3, 4],
    ["torchInterval", "Интервал факелов", 4, 16],
  ]) result[name] = integer(input[name] ?? defaults[name], label, min, max);
  if (input.placeTorches != null && typeof input.placeTorches !== "boolean")
    throw new Error("Факелы: включено или выключено");
  result.placeTorches = input.placeTorches ?? defaults.placeTorches;
  return result;
}
function defenseSettings(input = {}, defaults = DEFAULTS) {
  const result = {};
  for (const key of ["defendMobs", "defendPlayers", "defendArrows"]) {
    if (input[key] != null && typeof input[key] !== "boolean")
      throw new Error("Защита при добыче: включено или выключено");
    result[key] = input[key] ?? defaults[key];
  }
  return result;
}
const SCAFFOLD_ITEMS = new Set([
  "dirt", "cobblestone", "cobbled_deepslate", "netherrack",
  "stone", "deepslate", "tuff", "andesite", "diorite", "granite",
]);
const AIR = new Set(["air", "cave_air", "void_air"]);
const FLUIDS = new Set(["water", "lava", "bubble_column"]);
const PROTECTED =
  /(?:chest|shulker_box|barrel|furnace|hopper|dispenser|dropper|spawner|portal|command_block|structure_block|jigsaw|beacon|bed$|vault|trial_spawner)/;
const isWood = (name) => /^(?!stripped_).+_log$/.test(name) || ["crimson_stem", "warped_stem", "mushroom_stem"].includes(name);
const isLeaves = (name) =>
  /_leaves$/.test(name) || ["nether_wart_block", "warped_wart_block", "shroomlight"].includes(name);
const isOre = (name) => /_ore$/.test(name) || name === "ancient_debris";
const key = (pos) => `${pos.x},${pos.y},${pos.z}`;

function integer(value, label, min, max) {
  if (typeof value === "string" && !value.trim()) throw new Error(`${label}: введите число`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new Error(`${label}: целое число от ${min} до ${max}`);
  return number;
}
function position(value) {
  if (!value || !["x", "y", "z"].every((axis) => Number.isFinite(value[axis])))
    throw new Error("Нужны координаты x y z");
  return new Vec3(Math.floor(value.x), Math.floor(value.y), Math.floor(value.z));
}
function bounds(a, b, maxVolume = DEFAULTS.maxAreaVolume) {
  a = position(a);
  b = position(b);
  const min = new Vec3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
  const max = new Vec3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
  const volume = (max.x - min.x + 1) * (max.y - min.y + 1) * (max.z - min.z + 1);
  if (!Number.isSafeInteger(volume) || volume > maxVolume)
    throw new Error(`Область слишком большая: максимум ${maxVolume} блоков`);
  return { min, max, volume };
}
function contains(area, p) {
  return ["x", "y", "z"].every((axis) => p[axis] >= area.min[axis] && p[axis] <= area.max[axis]);
}
function insideTask(task, p) {
  if (task.area) return contains(task.area, p);
  if (task.kind === "mine")
    return (
      Math.hypot(p.x - task.origin.x, p.z - task.origin.z) <= task.radius &&
      p.y >= task.minY &&
      p.y <= task.maxY
    );
  return task.origin.distanceTo(p) <= task.radius;
}
function resolveBlocks(registry, input = "ores") {
  const names = Object.keys(registry.blocksByName);
  const chosen = new Set();
  for (let token of String(input).toLowerCase().split(",")) {
    token = token.trim().replace(/^minecraft:/, "");
    const matches = names.filter((name) =>
      token === "ores"
        ? isOre(name)
        : token === "wood" || token === "logs"
          ? isWood(name)
          : token === "leaves"
            ? isLeaves(name)
            : token === name ||
              (token.endsWith("*") && name.startsWith(token.slice(0, -1))) ||
              ([
                "coal",
                "iron",
                "copper",
                "gold",
                "redstone",
                "lapis",
                "diamond",
                "emerald",
                "quartz",
              ].includes(token) &&
                (name === `${token}_ore` ||
                  name === `deepslate_${token}_ore` ||
                  name === `nether_${token}_ore`)),
    );
    if (!matches.length) throw new Error(`Неизвестный блок или группа: ${token}`);
    for (const name of matches) {
      const data = registry.blocksByName[name];
      if (AIR.has(name) || FLUIDS.has(name) || PROTECTED.test(name) || data.hardness < 0)
        throw new Error(`Этот блок нельзя выбрать для добычи: ${name}`);
      chosen.add(name);
    }
  }
  return [...chosen];
}
function normalizeTask(bot, input, settings = DEFAULTS) {
  if (!input || !["mine", "forest", "quarry", "collect", "deposit", ...farming.KINDS].includes(input.kind))
    throw new Error("Задача: mine, forest, quarry, collect, deposit, till, plant, harvest или farm");
  const task = {
    kind: input.kind,
    origin: position(input.origin || bot.entity.position),
    radius: integer(input.radius ?? (farming.isFarming(input) ? 8 : settings.radius), "Радиус", 1, settings.maxRadius),
    count: integer(
      input.count ?? (input.kind === "mine" ? 64 : 0),
      "Количество блоков",
      0,
      1000000,
    ),
    leaves: input.leaves === true,
    scaffold: input.kind === "forest" && input.scaffold !== false,
    routeDig: ["mine", "forest"].includes(input.kind) && input.routeDig !== false,
    tunnel: input.kind === "quarry" && input.tunnel === true,
  };
  if (task.tunnel) {
    task.routeDig = true;
    task.tunnelWidth = integer(input.tunnelWidth ?? settings.tunnelWidth, "Ширина", 1, 8);
    task.tunnelHeight = integer(input.tunnelHeight ?? settings.tunnelHeight, "Высота", 2, 8);
  }
  if (input.kind === "mine") {
    task.names = resolveBlocks(bot.registry, input.blocks || "ores");
    const minimum = bot.game?.minY ?? (bot.registry.version[">="]("1.18") ? -64 : 0);
    const maximum = minimum + (bot.game?.height ?? (minimum < 0 ? 384 : 256)) - 1;
    task.minY = integer(input.minY ?? minimum, "Минимальная высота", minimum, maximum);
    task.maxY = integer(
      input.maxY ?? Math.min(maximum, task.origin.y + task.radius),
      "Максимальная высота",
      task.minY,
      maximum,
    );
  }
  if (input.kind === "forest") {
    task.names = Object.keys(bot.registry.blocksByName).filter(
      (name) => isWood(name) || (task.leaves && isLeaves(name)),
    );
  }
  if (input.kind === "collect" && input.item) {
    const name = String(input.item).replace(/^minecraft:/, "");
    if (!bot.registry.itemsByName[name]) throw new Error(`Неизвестный предмет: ${name}`);
    task.item = name;
  }
  if (input.area) task.area = bounds(input.area.min, input.area.max, settings.maxAreaVolume);
  if (input.kind === "quarry" && !task.area)
    throw new Error("Для расчистки задайте два угла области");
  if (input.kind === "quarry" && input.blocks)
    task.names = resolveBlocks(bot.registry, input.blocks);
  if (farming.isFarming(task)) farming.configureTask(bot, input, task);
  return task;
}
function matches(task, block) {
  if (!block || !insideTask(task, block.position) || AIR.has(block.name)) return false;
  return task.names ? task.names.includes(block.name) : true;
}
function safetyReason(bot, block) {
  if (!block) return "Чанк не загружен";
  if (AIR.has(block.name)) return "Воздух";
  if (FLUIDS.has(block.name) || block.getProperties?.().waterlogged === true) return "Жидкость";
  if (PROTECTED.test(block.name)) return "Защищённый блок или контейнер";
  if (block.hardness < 0 || block.diggable === false) return "Неразрушаемый блок";
  for (const offset of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0, 1, 0],
  ]) {
    const neighbor = bot.blockAt(block.position.offset(...offset));
    if (!neighbor) return "Соседний чанк не загружен";
    if (FLUIDS.has(neighbor.name) || neighbor.getProperties?.().waterlogged === true)
      return "Рядом жидкость";
    if (offset[1] === 1 && /^(sand|red_sand|gravel|.*concrete_powder|.*anvil)$/.test(neighbor.name))
      return "Сверху падающий блок";
  }
  return null;
}
function supportBlock(bot, block) {
  const feet = bot.entity.position;
  // Include both blocks when standing across their boundary.
  return (
    block.position.y === Math.floor(feet.y) - 1 &&
    Math.abs(block.position.x + 0.5 - feet.x) < 0.8 &&
    Math.abs(block.position.z + 0.5 - feet.z) < 0.8
  );
}
function remainingDurability(bot, item) {
  const maximum = bot.registry.itemsByName[item.name]?.maxDurability;
  if (!maximum) return Infinity;
  return maximum - (item.durabilityUsed ?? 0);
}
function keepItem(bot, item) {
  return (
    /(?:pickaxe|axe|shovel|hoe|sword|helmet|chestplate|leggings|boots|shield|bow|trident|elytra|bucket|shears|flint_and_steel)$/.test(
      item.name,
    ) ||
    ["torch", "totem_of_undying", "ender_pearl"].includes(item.name) ||
    Boolean(bot.registry.foodsByName?.[item.name])
  );
}

module.exports = {
  DEFAULTS,
  passageSettings,
  defenseSettings,
  SCAFFOLD_ITEMS,
  AIR,
  FLUIDS,
  PROTECTED,
  key,
  integer,
  position,
  bounds,
  contains,
  insideTask,
  resolveBlocks,
  normalizeTask,
  matches,
  safetyReason,
  supportBlock,
  remainingDurability,
  keepItem,
  isWood,
  isLeaves,
};
