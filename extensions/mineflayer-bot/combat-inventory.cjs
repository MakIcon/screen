const queues = new WeakMap();

function offhandItem(bot) {
  // Window.items() intentionally excludes armour and the offhand slot.
  return bot.inventory?.slots ? bot.inventory.slots[45] : bot.entity?.equipment?.[1];
}

function carriedItems(bot) {
  return [...new Set([...(bot.inventory?.items() ?? []), offhandItem(bot)].filter(Boolean))];
}

function equipCombatItem(bot, item, hand, current = () => true) {
  const previous = queues.get(bot) ?? Promise.resolve();
  const operation = previous.then(async () => {
    if (!current()) return;
    if (!item) throw new Error(`Missing item for ${hand}`);
    const equipped = hand === "off-hand" ? offhandItem(bot) : bot.heldItem;
    if (equipped?.name === item.name) return;
    const available =
      carriedItems(bot).find((entry) => entry === item) ??
      carriedItems(bot).find((entry) => entry.name === item.name);
    if (!available) throw new Error(`Item no longer available: ${item.name}`);
    await bot.equip(available, hand);
  });
  queues.set(
    bot,
    operation.catch(() => {}),
  );
  return operation;
}

module.exports = { offhandItem, carriedItems, equipCombatItem };
