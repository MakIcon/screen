// Local potion controller based on the supplied AutoBuff API, with cancellation,
// server acknowledgements and the launcher's shared inventory ownership.
const { carriedItems, queueInventoryTask } = require("./combat-inventory.cjs");
const { potionData, activeEffect, effectName } = require("./potion-data.cjs");
const { toNotchianYaw, toNotchianPitch } = require("mineflayer/lib/conversions");

function splashSafe(bot) {
  if (!bot.entity.onGround || bot.entity.isInWater || bot.entity.isInLava) return false;
  return !Object.values(bot.entities ?? {}).some((entity) =>
    entity.id !== bot.entity.id && entity.isValid !== false && entity.position &&
    (entity.username || entity.type === "player" || entity.type === "mob") &&
    entity.position.distanceTo(bot.entity.position) < 4.5);
}

class AutoBuff {
  constructor(bot, { now = Date.now, timeout = 4000 } = {}) {
    this.bot = bot;
    this.now = now;
    this.timeout = timeout;
    this.revision = 0;
    this.nextUseAt = 0;
    this.isDrinking = false;
    this.disposed = false;
    this.cacheAt = -Infinity;
    this.potions = [];
    this.invalidate = () => { this.cacheAt = -Infinity; };
    bot.inventory?.on?.("updateSlot", this.invalidate);
  }
  best(healing) {
    if (this.disposed || this.isDrinking || this.now() < this.nextUseAt) return null;
    const bot = this.bot;
    if (this.now() - this.cacheAt >= 250) {
      this.potions = carriedItems(bot).flatMap((item) => {
        const data = potionData(bot, item);
        return data && !data.lingering ? [{ item, data }] : [];
      });
      this.cacheAt = this.now();
    }
    let best = null, score = -Infinity;
    for (const { item, data } of this.potions) {
      const health = data.effects.find((effect) => effect.name === "instant_health");
      const regen = data.effects.find((effect) => effect.name === "regeneration");
      const healingUseful = health || (regen && !activeEffect(bot, "regeneration", regen.amplifier));
      if (healing ? !healingUseful : healingUseful) continue;
      // Buff automation is deliberately limited to useful combat effects.
      const useful = data.effects.filter((effect) =>
        ["strength", "speed", "fire_resistance"].includes(effect.name) &&
        !activeEffect(bot, effect.name, effect.amplifier));
      if (!healing && !useful.length) continue;
      const value = healing
        ? (health ? 100 + Math.min(20, 4 * 2 ** health.amplifier) : 30 + regen.amplifier * 4) + (data.splash ? 10 : 0)
        : useful.reduce((sum, effect) => sum + ({ strength: 30, speed: 20, fire_resistance: 10 }[effect.name]) + effect.amplifier * 3, 0);
      if (value > score) { best = item; score = value; }
    }
    return best;
  }
  cancelDrinking() {
    this.revision++;
    this.cancel?.(new Error("Potion use cancelled"));
  }
  async applyItemToSelf(item, { current = () => true } = {}) {
    if (this.disposed || this.isDrinking || this.now() < this.nextUseAt) return false;
    const bot = this.bot, data = potionData(bot, item);
    if (!data || data.lingering || (data.splash && !splashSafe(bot))) return false;
    const revision = ++this.revision, previous = bot.heldItem;
    const valid = () => !this.disposed && revision === this.revision && current() && bot.health > 0;
    const fingerprint = JSON.stringify(data);
    this.isDrinking = true;
    this.previousItem = previous;
    let started = false, succeeded = false;
    try {
      await queueInventoryTask(bot, async () => {
        if (!valid()) return;
        // Every potion has the same item name. Never substitute a random potion
        // after a slot update, as the upstream name-only lookup can do.
        const available = carriedItems(bot).find((entry) => entry === item) ??
          carriedItems(bot).find((entry) => entry.slot === item.slot && JSON.stringify(potionData(bot, entry)) === fingerprint);
        if (!available) throw new Error("Potion is no longer in inventory");
        if (bot.heldItem !== available) await bot.equip(available, "hand");
      });
      if (!valid()) return false;
      if (JSON.stringify(potionData(bot, bot.heldItem)) !== fingerprint)
        throw new Error("Potion changed during equip");
      if (data.splash) {
        bot.deactivateItem();
        await bot.look(bot.entity.yaw, -Math.PI / 2, true);
        if (!valid() || !splashSafe(bot)) return false;
        if (bot._client.state === "play") bot._client.write("look", {
          yaw: Math.fround(toNotchianYaw(bot.entity.yaw)), pitch: Math.fround(toNotchianPitch(-Math.PI / 2)),
          onGround: Boolean(bot.entity.onGround),
          flags: { onGround: Boolean(bot.entity.onGround), hasHorizontalCollision: Boolean(bot.entity.isCollidedHorizontally) },
        });
      }
      await new Promise((resolve, reject) => {
        let timer, finished = false;
        const healthBefore = bot.health;
        const finish = (error) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          bot._client.off("entity_status", consumed);
          bot.off("entityEffect", affected); bot.off("health", healed);
          bot.off("death", died); bot.off("end", died);
          this.cancel = null;
          if (error) reject(error);
          else resolve();
        };
        const consumed = (packet) => {
          if (!data.splash && packet.entityId === bot.entity.id && packet.entityStatus === 9) finish();
        };
        const affected = (entity, effect) => {
          if (data.splash && entity.id === bot.entity.id && data.effects.some((entry) =>
            entry.name === effectName(bot, effect.id) && effect.amplifier >= entry.amplifier)) finish();
        };
        const healed = () => {
          if (data.splash && bot.health > healthBefore && data.effects.some((effect) => effect.name === "instant_health")) finish();
        };
        const died = () => {
          this.revision++;
          finish(new Error("Potion use interrupted by death or disconnect"));
        };
        this.cancel = finish;
        bot._client.on("entity_status", consumed);
        bot.on("entityEffect", affected); bot.on("health", healed);
        bot.on("death", died); bot.on("end", died);
        timer = setTimeout(() => finish(new Error("Server did not confirm potion use")), data.splash ? Math.min(2500, this.timeout) : this.timeout);
        try {
          if (!valid()) return finish(new Error("Potion use cancelled"));
          if (!data.splash) bot.deactivateItem();
          started = true;
          bot.activateItem();
          if (data.splash && valid()) bot.deactivateItem();
        } catch (error) { finish(error); }
      });
      succeeded = true;
      return true;
    } finally {
      try {
        if (current() && started) bot.deactivateItem();
        if (valid() && previous && previous !== item) await queueInventoryTask(bot, async () => {
          if (!valid()) return;
          const available = carriedItems(bot).find((entry) => entry === previous) ??
            carriedItems(bot).find((entry) => entry.name === previous.name && !/potion/.test(entry.name));
          if (available) await bot.equip(available, "hand");
        });
      } finally {
        this.nextUseAt = this.now() + (succeeded ? 1000 : 3000);
        this.invalidate();
        this.isDrinking = false;
        this.previousItem = null;
      }
    }
  }
  dispose() {
    this.disposed = true;
    this.cancelDrinking();
    this.bot.inventory?.off?.("updateSlot", this.invalidate);
  }
}

module.exports = { AutoBuff, splashSafe };
