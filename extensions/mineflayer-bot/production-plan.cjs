function integer(value, label, min = 1, max = 256) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`${label}: целое число от ${min} до ${max}`);
  return parsed;
}

function itemByName(bot, value) {
  const name = String(value || "")
    .toLowerCase()
    .replace(/^minecraft:/, "");
  const item = bot.registry.itemsByName[name];
  if (!item) throw new Error(`Неизвестный предмет: ${name || "укажите название"}`);
  return item;
}

const inventoryItems = (bot) => bot.currentWindow?.items?.() ?? bot.inventory.items();
const emptySlots = (bot) => bot.currentWindow?.emptySlotCount?.() ?? bot.inventory.emptySlotCount();

// Plan against a copy of the inventory. Failed alternatives never consume
// resources, and ingredients shared by separate branches are reserved once.
function planCraft(bot, requests, mode = "auto") {
  if (!["auto", "inventory", "table"].includes(mode))
    throw new Error("Место крафта: auto, inventory или table");
  const stock = inventoryItems(bot).map((item) => ({
    id: item.type,
    metadata: item.metadata,
    count: item.count,
  }));
  const count = (items, id, metadata) =>
    items.reduce(
      (sum, item) =>
        sum + (item.id === id && (metadata == null || item.metadata === metadata) ? item.count : 0),
      0,
    );
  const change = (items, id, metadata, amount) => {
    if (amount >= 0) {
      items.push({ id, metadata, count: amount });
      return;
    }
    let remaining = -amount;
    for (const item of items) {
      if (item.id !== id || (metadata != null && metadata !== item.metadata)) continue;
      const used = Math.min(remaining, item.count);
      item.count -= used;
      remaining -= used;
    }
    if (remaining) throw new Error("Недостаточно ингредиентов");
  };
  let visits = 0;
  function ensure(items, steps, id, metadata, target, ancestors) {
    const missing = target - count(items, id, metadata);
    if (missing <= 0) return;
    const name = bot.registry.items[id]?.name || String(id);
    if (ancestors.includes(id))
      throw new Error(`Не хватает ${name} × ${missing}; добудьте или переплавьте этот ресурс`);
    if (++visits > 4000 || ancestors.length >= 16)
      throw new Error(`Не удалось составить крафт ${name}: замкнутый или слишком сложный рецепт`);
    const recipes = bot
      .recipesAll(id, metadata, true)
      .filter((recipe) => mode !== "inventory" || !recipe.requiresTable)
      .sort((a, b) => Number(a.requiresTable) - Number(b.requiresTable));
    let failure = new Error(
      `Не хватает ${name} × ${missing}; добудьте или переплавьте этот ресурс`,
    );
    for (const recipe of recipes) {
      const next = items.map((item) => ({ ...item })),
        branch = steps.slice();
      const times = Math.ceil(missing / recipe.result.count);
      try {
        if (branch.reduce((sum, step) => sum + step.times, 0) + times > 1024)
          throw new Error("Слишком много операций крафта; уменьшите количество");
        for (const delta of recipe.delta.filter((entry) => entry.count < 0)) {
          const needed = -delta.count * times;
          ensure(next, branch, delta.id, delta.metadata, needed, [...ancestors, id]);
          change(next, delta.id, delta.metadata, -needed);
        }
        for (const delta of recipe.delta.filter((entry) => entry.count > 0))
          change(next, delta.id, delta.metadata ?? 0, delta.count * times);
        branch.push({ recipe, times, name });
        items.splice(0, items.length, ...next);
        steps.splice(0, steps.length, ...branch);
        return;
      } catch (error) {
        failure = error;
      }
    }
    throw failure;
  }
  const steps = [];
  for (const request of requests) {
    const item = itemByName(bot, request.item);
    const amount = integer(request.count, "Количество");
    const target = request.additional === false ? amount : count(stock, item.id, null) + amount;
    ensure(stock, steps, item.id, null, target, []);
    // A setup item (e.g. a placed table) is unavailable to later recipes.
    if (request.reserve) change(stock, item.id, null, -amount);
  }
  return steps;
}

const FOOD = {
  beef: "cooked_beef",
  porkchop: "cooked_porkchop",
  chicken: "cooked_chicken",
  mutton: "cooked_mutton",
  rabbit: "cooked_rabbit",
  cod: "cooked_cod",
  salmon: "cooked_salmon",
  potato: "baked_potato",
  kelp: "dried_kelp",
};
const SMELTING = {
  raw_iron: "iron_ingot",
  iron_ore: "iron_ingot",
  deepslate_iron_ore: "iron_ingot",
  raw_gold: "gold_ingot",
  gold_ore: "gold_ingot",
  deepslate_gold_ore: "gold_ingot",
  nether_gold_ore: "gold_ingot",
  raw_copper: "copper_ingot",
  copper_ore: "copper_ingot",
  deepslate_copper_ore: "copper_ingot",
  ancient_debris: "netherite_scrap",
  sand: "glass",
  red_sand: "glass",
  cobblestone: "stone",
  stone: "smooth_stone",
  cobbled_deepslate: "deepslate",
  netherrack: "nether_brick",
  clay_ball: "brick",
  clay: "terracotta",
  stone_bricks: "cracked_stone_bricks",
  nether_bricks: "cracked_nether_bricks",
  deepslate_bricks: "cracked_deepslate_bricks",
  deepslate_tiles: "cracked_deepslate_tiles",
  polished_blackstone_bricks: "cracked_polished_blackstone_bricks",
  sandstone: "smooth_sandstone",
  red_sandstone: "smooth_red_sandstone",
  quartz_block: "smooth_quartz",
  cactus: "green_dye",
  sea_pickle: "lime_dye",
  wet_sponge: "sponge",
  chorus_fruit: "popped_chorus_fruit",
  ...FOOD,
};
function smeltingRecipe(bot, value, station = "auto") {
  const input = itemByName(bot, value);
  let output = SMELTING[input.name];
  const metal =
    /^(?:(?:raw_|deepslate_)?(?:iron|gold|copper)(?:_ore)?|nether_gold_ore|ancient_debris)$/.test(
      input.name,
    );
  if (/(?:_log|_wood|_stem|_hyphae)$/.test(input.name) && !/crimson|warped/.test(input.name))
    output = "charcoal";
  if (/^(?:deepslate_)?(coal|diamond|emerald|lapis|redstone)_ore$/.test(input.name))
    output = input.name
      .replace(/^deepslate_/, "")
      .replace(/_ore$/, "")
      .replace(/^lapis$/, "lapis_lazuli");
  if (input.name === "nether_quartz_ore") output = "quartz";
  if (
    /^(iron|chainmail)_(?:helmet|chestplate|leggings|boots)$|^iron_(?:sword|axe|pickaxe|shovel|hoe)$/.test(
      input.name,
    )
  )
    output = "iron_nugget";
  if (/^golden_(?:helmet|chestplate|leggings|boots|sword|axe|pickaxe|shovel|hoe)$/.test(input.name))
    output = "gold_nugget";
  const result = output && bot.registry.itemsByName[output];
  if (!result) throw new Error(`Нет поддерживаемого рецепта переплавки для ${input.name}`);
  const blast = metal || /_ore$/.test(input.name) || /_nugget$/.test(output);
  const stations = [
    "furnace",
    ...(FOOD[input.name] ? ["smoker"] : []),
    ...(blast ? ["blast_furnace"] : []),
  ];
  if (station !== "auto" && !stations.includes(station))
    throw new Error(
      `${station} не подходит для ${input.name}; используйте ${stations.join(" / ")}`,
    );
  return { input, output: result, stations: station === "auto" ? stations : [station] };
}

function fuelItems(bot) {
  const burns = {
    coal: 8,
    charcoal: 8,
    coal_block: 80,
    dried_kelp_block: 20,
    blaze_rod: 12,
    lava_bucket: 100,
    bamboo: 0.25,
    stick: 0.5,
  };
  return inventoryItems(bot).flatMap((item) => {
    const burn =
      burns[item.name] ||
      (!/crimson|warped/.test(item.name) && /(?:_planks|_log|_wood)$/.test(item.name) ? 1.5 : 0);
    return burn ? [{ item, burn }] : [];
  });
}

module.exports = {
  integer,
  itemByName,
  planCraft,
  smeltingRecipe,
  fuelItems,
  inventoryItems,
  emptySlots,
};
