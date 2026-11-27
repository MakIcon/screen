const { queueInventoryTask } = require("./combat-inventory.cjs");
const { getItemEnchantments } = require("./pathfinder.cjs");
const { findArmorDestination } = require("mineflayer-armor-manager/dist/lib/invUtil");

const installed = Symbol("launcherArmorManager");
const materials = ["leather", "golden", "chainmail", "copper", "iron", "turtle", "diamond", "netherite"];
const destinations = ["head", "torso", "legs", "feet"];

function armorRank(item) {
  return materials.indexOf(item?.name?.split("_")[0]);
}

function isArmor(item) {
  return Boolean(item?.name) && destinations.includes(findArmorDestination(item));
}

function installArmorManager(bot, onError = () => {}) {
  if (bot[installed]) return bot[installed];
  let disposed = false;
  let dirty = false;
  let queued = false;
  let task = Promise.resolve();
  const inventory = bot.inventory;
  function ready() {
    return !disposed && bot.health > 0 && bot.isAlive !== false &&
      !bot.launcherInventoryActions?.busy && !bot.launcherSurvival?.busy &&
      !bot.launcherProduction?.busy && !bot.launcherGathering?.busy &&
      !bot.launcherCombatUtility && !bot.launcherPlayerControl?.busy &&
      (!bot.currentWindow || bot.currentWindow === inventory) && !inventory?.selectedItem;
  }
  function equipAll() {
    dirty = true;
    if (queued || !ready() || !inventory?.slots || !bot.getEquipmentDestSlot) return task;
    queued = true;
    task = queueInventoryTask(bot, async () => {
      if (!ready()) return;
      dirty = false;
      for (const destination of destinations) {
        if (!ready()) { dirty = true; return; }
        const equipped = inventory.slots[bot.getEquipmentDestSlot(destination)];
        if (equipped && !["creative", 1].includes(bot.game?.gameMode) &&
            getItemEnchantments(equipped, bot.registry).some(({ name }) => name === "binding_curse")) continue;
        const rank = armorRank(equipped);
        const best = inventory.items().filter((item) => (!equipped || armorRank(item) > rank) &&
          findArmorDestination(item) === destination).sort((a, b) => armorRank(b) - armorRank(a))[0];
        if (best) {
          try {
            await bot.equip(best, destination);
          } catch (error) {
            onError(error);
          }
        }
      }
    }).catch(onError).finally(() => { queued = false; });
    return task;
  }
  bot.armorManager = { equipAll };
  function onSlot(slot, previous, item) {
    if (slot >= 9 && slot < 45 && item !== previous && isArmor(item)) void equipAll();
  }
  function onCollect(collector, entity) {
    if ((collector.id === bot.entity?.id || collector.username === bot.username) &&
        isArmor(entity.getDroppedItem?.())) void equipAll();
  }
  function tick() {
    if (dirty && !queued && ready()) void equipAll();
  }
  function dispose() {
    disposed = true;
    bot.off("spawn", equipAll);
    bot.off("physicsTick", tick);
    bot.off("playerCollect", onCollect);
    bot.off("end", dispose);
    inventory?.off?.("updateSlot", onSlot);
  }
  bot.on("spawn", equipAll);
  bot.on("physicsTick", tick);
  bot.on("playerCollect", onCollect);
  bot.on("end", dispose);
  inventory?.on?.("updateSlot", onSlot);
  bot[installed] = {
    dispose,
    get task() {
      return task;
    },
  };
  void equipAll(); // Combat is initialized during the first spawn event.
  return bot[installed];
}

module.exports = { installArmorManager };
