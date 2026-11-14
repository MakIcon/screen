const { createHash } = require("node:crypto");
const { queueInventoryTask } = require("./combat-inventory.cjs");
const { getItemEnchantments } = require("./pathfinder.cjs");

function inventoryItemFingerprint(item) {
  if (!item) return null;
  const identity = JSON.stringify(
    {
      type: item.type,
      name: item.name,
      count: item.count,
      metadata: item.metadata ?? 0,
      nbt: item.nbt,
      components: item.components,
      removedComponents: item.removedComponents,
      durabilityUsed: item.durabilityUsed,
    },
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
  );
  return createHash("sha256").update(identity).digest("hex");
}

function playerInventorySlots(bot) {
  const slots = [...(bot.inventory?.slots || [])];
  const window = bot.currentWindow;
  if (window && window !== bot.inventory) {
    for (let index = window.inventoryStart; index < window.inventoryEnd; index++) {
      const playerSlot = index - window.inventoryStart + 9;
      if (playerSlot > 44) break;
      slots[playerSlot] = window.slots[index];
    }
  }
  return slots;
}

function validateDropItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 41)
    throw new Error("Выберите от 1 до 41 занятого слота");
  const slots = new Set();
  for (const item of items) {
    if (
      !Number.isInteger(item?.slot) ||
      item.slot < 5 ||
      item.slot > 45 ||
      slots.has(item.slot) ||
      !Number.isInteger(item.count) ||
      item.count < 1 ||
      item.count > 2147483647 ||
      typeof item.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.fingerprint)
    )
      throw new Error("Некорректный предмет для выбрасывания");
    slots.add(item.slot);
  }
}

function createInventoryActions(
  bot,
  { prepare = async () => true, onChange = () => {}, now = Date.now } = {},
) {
  let busy = false,
    disposed = false,
    generation = 0;
  function ready() {
    if (
      disposed ||
      bot.health <= 0 ||
      bot.isAlive === false ||
      (bot._client?.state && bot._client.state !== "play")
    )
      throw new Error("Бот отключился или погиб");
    if (bot.launcherSurvival?.busy) throw new Error("Дождитесь завершения еды или спасения бота");
    if (bot.inventory?.selectedItem || bot.currentWindow?.selectedItem)
      throw new Error("Сначала завершите перенос предмета в открытом окне");
  }
  function validateCurrent(request) {
    const item = bot.inventory?.slots[request.slot];
    if (!item || inventoryItemFingerprint(item) !== request.fingerprint)
      throw new Error("Инвентарь изменился. Выберите предмет заново");
    if (request.count !== 1 && request.count !== item.count)
      throw new Error("Можно выбросить один предмет или всю стопку");
    if (
      request.slot < 9 &&
      !["creative", 1].includes(bot.game?.gameMode) &&
      getItemEnchantments(item, bot.registry).some((enchant) => /binding/.test(enchant.name))
    )
      throw new Error("Броню с проклятием несъёмности нельзя выбросить в этом режиме игры");
    return item;
  }
  async function drop(items) {
    validateDropItems(items);
    if (busy) throw new Error("Бот уже выбрасывает предметы");
    ready();
    busy = true;
    const token = ++generation;
    let dropped = 0;
    const deadline = now() + 45000;
    try {
      onChange();
      if ((await prepare()) === false) throw new Error("Действие отменено другой командой");
      return await queueInventoryTask(bot, async () => {
        if (token !== generation) throw new Error("Выбрасывание отменено");
        ready();
        if (bot.currentWindow && bot.currentWindow !== bot.inventory)
          bot.closeWindow(bot.currentWindow);
        // Validate the entire selection before the first irreversible click.
        for (const item of items) validateCurrent(item);
        for (const item of items) {
          if (token !== generation) throw new Error("Выбрасывание отменено");
          ready();
          if (now() > deadline) throw new Error("Истекло время выбрасывания предметов");
          if (bot.currentWindow && bot.currentWindow !== bot.inventory)
            throw new Error("Открыто другое окно. Повторите действие");
          validateCurrent(item);
          // Minecraft's drop mode acts on this exact slot, including armour and
          // offhand, without moving anything to the cursor or searching by type.
          await bot.clickWindow(item.slot, item.count === 1 ? 0 : 1, 4);
          dropped += item.count;
        }
        return `Выброшено предметов: ${dropped}`;
      });
    } catch (error) {
      if (dropped)
        throw new Error(`${error.message || String(error)}. Уже выброшено: ${dropped}`, {
          cause: error,
        });
      throw error;
    } finally {
      busy = false;
      onChange();
    }
  }
  function dispose() {
    disposed = true;
    bot.off("end", dispose);
  }
  bot.on("end", dispose);
  return {
    drop,
    cancel() {
      generation++;
    },
    dispose,
    get busy() {
      return busy;
    },
  };
}

module.exports = {
  createInventoryActions,
  inventoryItemFingerprint,
  playerInventorySlots,
  validateDropItems,
};
