const queues = new WeakMap();

function offhandItem(bot) {
  // Window.items() intentionally excludes armour and the offhand slot.
  return bot.inventory?.slots ? bot.inventory.slots[45] : bot.entity?.equipment?.[1];
}

function carriedItems(bot) {
  return [...new Set([...(bot.inventory?.items() ?? []), offhandItem(bot)].filter(Boolean))];
}

function bestMeleeWeapon(bot, preferred) {
  const items = carriedItems(bot);
  let weapons = items.filter((item) => item.name.endsWith(`_${preferred}`));
  if (!weapons.length)
    weapons = items.filter((item) => item.name.endsWith(preferred === "axe" ? "_sword" : "_axe"));
  const tier = ["netherite", "diamond", "iron", "stone", "golden", "wooden"];
  const rank = (item) => {
    const index = tier.indexOf(item.name.split("_")[0]);
    return index >= 0 ? index : tier.length;
  };
  return weapons.sort((a, b) => rank(a) - rank(b))[0];
}

function queueInventoryTask(bot, action) {
  const previous = queues.get(bot) ?? Promise.resolve();
  const operation = previous.then(action);
  queues.set(
    bot,
    operation.catch(() => {}),
  );
  return operation;
}

function equipCombatItem(bot, item, hand, current = () => true) {
  return queueInventoryTask(bot, async () => {
    if (!current() || bot.launcherSurvival?.busy || bot.launcherProduction?.busy) return;
    if (!item) throw new Error(`Missing item for ${hand}`);
    const equipped = hand === "off-hand" ? offhandItem(bot) : bot.heldItem;
    if (equipped?.name === item.name) return;
    const available =
      carriedItems(bot).find((entry) => entry === item) ??
      carriedItems(bot).find((entry) => entry.name === item.name);
    if (!available) throw new Error(`Item no longer available: ${item.name}`);
    await bot.equip(available, hand);
  });
}

module.exports = {
  offhandItem,
  carriedItems,
  bestMeleeWeapon,
  equipCombatItem,
  queueInventoryTask,
};
