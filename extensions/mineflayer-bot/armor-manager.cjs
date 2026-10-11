const { queueInventoryTask } = require("./combat-inventory.cjs");

const installed = Symbol("launcherArmorManager");

function installArmorManager(bot, onError = () => {}) {
  if (bot[installed]) return bot[installed];
  const armorManager = require("mineflayer-armor-manager");
  const { isNewArmorBetter } = require("mineflayer-armor-manager/dist/lib/invUtil");
  let disposed = false;
  let task = Promise.resolve();
  const collectListeners = [];
  // Keep the plugin's armour ranking and pickup handling, while the combat
  // controller retains ownership of the offhand (shield/bow/crystals).
  const managedBot = Object.create(bot);
  managedBot.on = (name, listener) => {
    bot.on(name, listener);
    collectListeners.push([name, listener]);
    return managedBot;
  };
  managedBot.equip = (item, destination) => {
    if (destination === "off-hand" || disposed) return Promise.resolve();
    return queueInventoryTask(bot, async () => {
      if (disposed || bot.health <= 0 || bot.launcherSurvival?.busy) return;
      const available = bot.inventory.items().find((entry) => entry.type === item.type);
      const equipped = bot.inventory.slots[bot.getEquipmentDestSlot(destination)];
      if (available && (!equipped || isNewArmorBetter(equipped, available)))
        await bot.equip(available, destination);
    }).catch(onError);
  };
  armorManager(managedBot);
  bot.armorManager = managedBot.armorManager;
  const equipAll = bot.armorManager.equipAll;
  bot.armorManager.equipAll = () => {
    task = task.then(() => (disposed ? undefined : equipAll())).catch(onError);
    return task;
  };
  function spawn() {
    void bot.armorManager.equipAll();
  }
  function dispose() {
    disposed = true;
    bot.off("spawn", spawn);
    bot.off("end", dispose);
    for (const [name, listener] of collectListeners) bot.off(name, listener);
  }
  bot.on("spawn", spawn);
  bot.on("end", dispose);
  bot[installed] = {
    dispose,
    get task() {
      return task;
    },
  };
  spawn(); // Combat is initialized during the first spawn event.
  return bot[installed];
}

module.exports = { installArmorManager };
