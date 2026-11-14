const { carriedItems, offhandItem, queueInventoryTask } = require("./combat-inventory.cjs");
const { observedHealth } = require("./combat-brain.cjs");
const { isCrystal } = require("./crystals.cjs");

const isTotem = (item) => ["totem_of_undying", "totem"].includes(item?.name);

function createAutoTotem(bot, settings, { now = Date.now, onStatus = () => {} } = {}) {
  let disposed = false,
    protectedHand = false,
    owned = false,
    previous = null;
  let revision = 0,
    pending = false,
    holdUntil = 0,
    nextTry = 0;
  let task = Promise.resolve();
  const alive = () =>
    !disposed &&
    bot.health > 0 &&
    bot.isAlive !== false &&
    (!bot._client?.state || bot._client.state === "play");
  const supported = () =>
    !bot.supportFeature?.("doesntHaveOffHandSlot") &&
    Boolean(bot.registry?.itemsByName?.totem_of_undying || bot.registry?.itemsByName?.totem);
  const available = () => carriedItems(bot).find(isTotem);
  const accessible = () =>
    !bot.launcherInventoryActions?.busy &&
    !bot.inventory?.selectedItem && (!bot.currentWindow || bot.currentWindow === bot.inventory);
  function effectiveHealth() {
    const absorption = settings.totemUseAbsorption ? observedHealth(bot, bot.entity).absorption : 0;
    return bot.health + (absorption ?? 0);
  }
  function crystalDanger() {
    return (
      settings.totemOnCrystal &&
      Object.values(bot.entities ?? {}).some(
        (e) =>
          e.isValid !== false &&
          e.position &&
          isCrystal(e) &&
          e.position.distanceTo(bot.entity.position) <= settings.totemDangerRange,
      )
    );
  }
  function wantsTotem() {
    if (!settings.enabled || !settings.autoTotem || !supported() || !alive()) return false;
    const health = effectiveHealth();
    const danger = health <= settings.totemHealth || crystalDanger();
    if (danger) holdUntil = now() + settings.totemHoldMs;
    return (
      settings.totemMode === "always" ||
      danger ||
      now() < holdUntil ||
      (owned && (health < settings.totemReleaseHealth || !settings.totemRestoreOffhand))
    );
  }
  function schedule(action) {
    const token = revision;
    pending = true;
    task = queueInventoryTask(bot, async () => {
      if (!alive() || token !== revision || !accessible()) return;
      await action(() => alive() && token === revision && accessible());
    })
      .catch((error) => {
        if (token === revision && alive()) {
          onStatus(`Auto totem: ${error.message}`);
          nextTry = now() + 500;
        }
      })
      .finally(() => {
        pending = false;
      });
  }
  function tick() {
    if (!alive()) {
      protectedHand = false;
      return;
    }
    const held = offhandItem(bot),
      totem = available(),
      wanted = wantsTotem();
    // Publish the lock synchronously, before any queued shield/bow equip runs.
    protectedHand = wanted && Boolean(totem || isTotem(held));
    if (pending || now() < nextTry || !accessible()) return;
    if (protectedHand) {
      if (isTotem(held)) return;
      if (!owned) {
        previous = held;
        owned = true;
      }
      schedule(async (current) => {
        const candidate = available();
        if (!current() || !wantsTotem() || !candidate || isTotem(offhandItem(bot))) return;
        if (bot.usingHeldItem && offhandItem(bot)?.name === "shield" && !bot.launcherSurvival?.busy)
          bot.deactivateItem();
        await bot.equip(candidate, "off-hand");
        if (current() && isTotem(offhandItem(bot))) onStatus("Auto totem: offhand equipped");
      });
    } else if (owned) {
      if (!settings.totemRestoreOffhand) {
        owned = false;
        previous = null;
        return;
      }
      if (held && !isTotem(held)) {
        owned = false;
        previous = null;
        return;
      }
      const original = previous;
      schedule(async (current) => {
        if (!current() || (wantsTotem() && available())) return;
        const items = carriedItems(bot);
        const restore =
          original &&
          (items.find((i) => i === original) ||
            items.find(
              (i) =>
                i.name === original.name && JSON.stringify(i.nbt) === JSON.stringify(original.nbt),
            ));
        if (restore) {
          await bot.equip(restore, "off-hand");
          if (current()) onStatus("Auto totem: previous offhand restored");
        } else if (isTotem(offhandItem(bot)) && bot.unequip) {
          // Restore an originally empty hand without dropping or using the totem.
          await bot.unequip("off-hand");
        }
        if (current()) {
          owned = false;
          previous = null;
        }
      });
    }
  }
  function popped(packet) {
    if (packet.entityId !== bot.entity?.id || packet.entityStatus !== 35 || !alive()) return;
    holdUntil = now() + Math.max(500, settings.totemHoldMs);
    onStatus("Auto totem: activation confirmed; checking replacement");
    tick();
  }
  function reset() {
    revision++;
    protectedHand = false;
    owned = false;
    previous = null;
    holdUntil = 0;
  }
  const controller = {
    tick,
    get protected() {
      return protectedHand;
    },
    get task() {
      return task;
    },
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
      bot.off("physicsTick", tick);
      bot.off("health", tick);
      bot.off("entitySpawn", tick);
      bot.off("death", reset);
      bot.off("respawn", reset);
      bot.off("end", controller.dispose);
      bot.inventory?.off?.("updateSlot", tick);
      bot._client?.off?.("entity_status", popped);
      if (bot.launcherAutoTotem === controller) delete bot.launcherAutoTotem;
    },
  };
  bot.launcherAutoTotem = controller;
  bot.prependListener("physicsTick", tick);
  bot.on("health", tick);
  bot.on("entitySpawn", tick);
  bot.on("death", reset);
  bot.on("respawn", reset);
  bot.on("end", controller.dispose);
  bot.inventory?.on?.("updateSlot", tick);
  bot._client?.on?.("entity_status", popped);
  return controller;
}

module.exports = { createAutoTotem, isTotem };
