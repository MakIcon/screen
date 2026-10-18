const { Vec3 } = require("vec3");

const KINDS = ["till", "plant", "harvest", "farm"];
const CROPS = [
  { name: "wheat", seed: "wheat_seeds", block: "wheat", age: 7 },
  { name: "beetroot", seed: "beetroot_seeds", block: "beetroots", age: 3 },
  { name: "carrot", seed: "carrot", block: "carrots", age: 7 },
  { name: "potato", seed: "potato", block: "potatoes", age: 7 },
  { name: "pumpkin", seed: "pumpkin_seeds", block: "pumpkin_stem", fruit: "pumpkin" },
  { name: "melon", seed: "melon_seeds", block: "melon_stem", fruit: "melon" },
  { name: "nether_wart", seed: "nether_wart", block: "nether_wart", age: 3, soil: "soul_sand" },
];
const AIR = new Set(["air", "cave_air", "void_air"]);
const TILLABLE = new Set(["dirt", "grass_block", "dirt_path"]);
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const FRUIT_SOIL = new Set(["dirt", "grass_block", "farmland"]);
const key = (p) => `${p.x},${p.y},${p.z}`;
const isFarming = (task) => KINDS.includes(task?.kind);
function resolveCrop(value = "auto") {
  const name = String(value)
    .trim()
    .toLowerCase()
    .replace(/^minecraft:/, "");
  if (["auto", "all"].includes(name)) return null;
  const crop = CROPS.find((entry) =>
    [entry.name, entry.seed, entry.block, entry.fruit].includes(name),
  );
  if (!crop)
    throw new Error(
      `Неизвестная культура: ${value}. Выберите wheat, beetroot, carrot, potato, pumpkin, melon или nether_wart`,
    );
  return crop;
}
function configureTask(bot, input, task) {
  const crop = input.kind === "till" ? null : resolveCrop(input.crop ?? input.item ?? "auto");
  if (crop && (!bot.registry.itemsByName[crop.seed] || !bot.registry.blocksByName[crop.block]))
    throw new Error(`Культура ${crop.name} недоступна в этой версии Minecraft`);
  if (input.replant != null && typeof input.replant !== "boolean")
    throw new Error("Повторная посадка: включено или выключено");
  task.crop = crop?.name || "auto";
  task.item = task.crop;
  task.replant = input.replant !== false;
}
function cropsFor(bot, task) {
  return CROPS.filter(
    (crop) =>
      (task.crop === "auto" || task.crop === crop.name) &&
      bot.registry.itemsByName[crop.seed] &&
      bot.registry.blocksByName[crop.block],
  );
}
function seedItem(bot, crop) {
  return bot.inventory.items().find((item) => item.name === crop.seed && item.count > 0);
}
function hydrated(bot, soil) {
  if (Number(soil.getProperties?.().moisture) > 0) return true;
  for (let x = -4; x <= 4; x++)
    for (let z = -4; z <= 4; z++)
      for (let y = 0; y <= 1; y++) {
        const neighbor = bot.blockAt(soil.position.offset(x, y, z));
        if (neighbor?.name === "water" || neighbor?.getProperties?.().waterlogged === true)
          return true;
      }
  return false;
}
function matureCrop(bot, task, block) {
  for (const crop of cropsFor(bot, task)) {
    if (crop.fruit) {
      if (block.name !== crop.fruit) continue;
      // Only farm fruit next to a stem; leave decorative pumpkins alone.
      if (
        SIDES.some(([x, z]) =>
          [crop.block, `attached_${crop.block}`].includes(
            bot.blockAt(block.position.offset(x, 0, z))?.name,
          ),
        )
      )
        return crop;
    } else if (block.name === crop.block && Number(block.getProperties?.().age) >= crop.age)
      return crop;
  }
  return null;
}
function actionFor(bot, task, block) {
  if (!block) return null;
  if (["harvest", "farm"].includes(task.kind)) {
    const crop = matureCrop(bot, task, block);
    if (crop && !task.farmHarvested?.has(key(block.position)))
      return { kind: "harvest", crop, position: block.position };
  }
  if (!AIR.has(bot.blockAt(block.position.offset(0, 1, 0))?.name)) return null;
  if (["plant", "farm"].includes(task.kind)) {
    // Leave empty cells beside stems available for future pumpkin/melon fruit.
    const besideStem = SIDES.some(([x, z]) =>
      /^(?:attached_)?(?:pumpkin|melon)_stem$/.test(
        bot.blockAt(block.position.offset(x, 1, z))?.name || "",
      ),
    );
    if (besideStem && !task.restoringCrop) return null;
    const crops = cropsFor(bot, task).filter(
      (crop) =>
        (crop.soil || "farmland") === block.name &&
        (!crop.fruit ||
          SIDES.some(
            ([x, z]) =>
              AIR.has(bot.blockAt(block.position.offset(x, 1, z))?.name) &&
              FRUIT_SOIL.has(bot.blockAt(block.position.offset(x, 0, z))?.name),
          )),
    );
    if (crops.length)
      return {
        kind: "plant",
        position: block.position,
        crop: crops.find((crop) => seedItem(bot, crop)) || crops[0],
      };
  }
  if (
    ["till", "farm"].includes(task.kind) &&
    TILLABLE.has(block.name) &&
    hydrated(bot, block) &&
    (task.kind === "till" || cropsFor(bot, task).some((crop) => !crop.soil))
  )
    return { kind: "till", position: block.position };
  return null;
}
async function scanFarming(bot, task, { inside, maxAttempts, scanLimit, yieldControl }) {
  task.replants ||= new Map();
  task.farmHarvested ||= new Set();
  // Finish replanting even when the requested harvest count has been reached.
  for (const [site, action] of task.replants) {
    if ((task.failed.get(site) || 0) >= maxAttempts)
      throw new Error(`Не удалось пересадить ${action.crop.name}; проверьте грядку и продолжите`);
    const block = bot.blockAt(action.position);
    const above = bot.blockAt(action.position.offset(0, 1, 0));
    if (above?.name === action.crop.block) {
      task.replants.delete(site);
      continue;
    }
    if (block?.name !== (action.crop.soil || "farmland") || !AIR.has(above?.name))
      throw new Error("Грядка для повторной посадки изменилась или не загружена");
    return action;
  }
  if (task.count && task.mined >= task.count) return null;
  const names = new Set(["farmland", "soul_sand", ...TILLABLE]);
  for (const crop of cropsFor(bot, task)) names.add(crop.fruit || crop.block);
  const positions = bot.findBlocks({
    point: task.area ? task.area.min.plus(task.area.max).scaled(0.5) : task.origin,
    maxDistance: task.area ? task.area.min.distanceTo(task.area.max) / 2 + 1 : task.radius,
    count: scanLimit,
    matching: [...names].flatMap((name) =>
      bot.registry.blocksByName[name] ? [bot.registry.blocksByName[name].id] : [],
    ),
    useExtraInfo: (block) =>
      inside(task, block.position) &&
      (task.failed.get(key(block.position)) || 0) < maxAttempts &&
      Boolean(actionFor(bot, task, block)),
  });
  const actions = [];
  for (let i = 0; i < positions.length; i++) {
    if (i % 32 === 0) await yieldControl();
    const action = actionFor(bot, task, bot.blockAt(positions[i]));
    if (action) actions.push(action);
  }
  const priority = { harvest: 0, plant: 1, till: 2 };
  actions.sort(
    (a, b) =>
      priority[a.kind] - priority[b.kind] ||
      a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position),
  );
  return actions[0] || null;
}
async function executeFarming(bot, task, action, ctx) {
  const {
    guard,
    operation,
    approach,
    confirm,
    fail,
    remainingDurability,
    minToolDurability,
    trackDig,
  } = ctx;
  const supplies = async () => {
    guard();
    let item;
    if (action.kind === "till") {
      item = bot.inventory
        .items()
        .filter(
          (entry) =>
            /_hoe$/.test(entry.name) && remainingDurability(bot, entry) > minToolDurability,
        )
        .sort((a, b) => remainingDurability(bot, b) - remainingDurability(bot, a))[0];
      if (!item) fail("Для вспашки нужна мотыга. Положите её в инвентарь бота и продолжите");
      if (
        task.kind === "farm" &&
        !cropsFor(bot, task).some((crop) => !crop.soil && seedItem(bot, crop))
      )
        fail(
          "Нет семян для посадки. Положите семена, морковь или картофель в инвентарь бота и продолжите",
        );
    } else if (action.kind === "plant") {
      item = seedItem(bot, action.crop);
      if (!item)
        fail(`Нет ${action.crop.seed} для посадки. Положите их в инвентарь бота и продолжите`);
    }
    if (item && bot.heldItem !== item) await operation(() => bot.equip(item, "hand"));
    // Never harvest with seeds, a hoe or a Silk Touch tool in hand.
    if (action.kind === "harvest" && bot.heldItem) await operation(() => bot.unequip("hand"));
  };
  await supplies();
  let block = bot.blockAt(action.position);
  await approach(block, action.kind !== "harvest");
  guard();
  block = bot.blockAt(action.position);
  const current = actionFor(
    bot,
    action.replant ? { ...task, kind: "plant", crop: action.crop.name, restoringCrop: true } : task,
    block,
  );
  if (
    !current ||
    current.kind !== action.kind ||
    (action.crop && current.crop?.name !== action.crop.name)
  )
    return;
  // Inventory may have changed during navigation or survival actions.
  await supplies();
  guard();
  if (action.kind === "till") {
    await operation(() => bot.activateBlock(block, new Vec3(0, 1, 0), new Vec3(0.5, 1, 0.5)));
    await confirm(
      () => bot.blockAt(action.position)?.name === "farmland",
      "Сервер не подтвердил вспашку",
    );
    task.tilled = (task.tilled || 0) + 1;
  } else if (action.kind === "plant") {
    await operation(() => bot.placeBlock(block, new Vec3(0, 1, 0)));
    await confirm(
      () => bot.blockAt(action.position.offset(0, 1, 0))?.name === action.crop.block,
      "Сервер не подтвердил посадку",
    );
    task.planted = (task.planted || 0) + 1;
    if (action.replant) task.replants.delete(key(action.position));
  } else {
    if (!bot.canDigBlock(block)) throw new Error("Урожай вне досягаемости");
    trackDig(block);
    await operation(() => bot.dig(block, true, "raycast"));
    await confirm(
      () => bot.blockAt(action.position)?.type !== block.type,
      "Сервер не подтвердил сбор урожая",
    );
    task.harvested = (task.harvested || 0) + 1;
    task.farmHarvested.add(key(action.position));
    if (task.replant && !action.crop.fruit) {
      const position = action.position.offset(0, -1, 0);
      task.replants.set(key(position), {
        kind: "plant",
        crop: action.crop,
        position,
        replant: true,
      });
    }
  }
  if (!action.replant) task.mined++;
  task.failed.delete(key(action.position));
}

module.exports = {
  KINDS,
  CROPS,
  isFarming,
  resolveCrop,
  configureTask,
  seedItem,
  hydrated,
  matureCrop,
  actionFor,
  scanFarming,
  executeFarming,
};
