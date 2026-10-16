// Adapted from linkle69/mineflayer-auto-eat 5.0.3 (MIT, see AUTO-EAT-LICENSE).
const { EventEmitter } = require('node:events');
const { carriedItems, queueInventoryTask } = require('./combat-inventory.cjs');

const BANNED = new Set([
  'rotten_flesh', 'pufferfish', 'chorus_fruit', 'poisonous_potato', 'spider_eye',
  'suspicious_stew', 'raw_chicken', 'chicken', 'golden_apple', 'enchanted_golden_apple',
]);

class AutoEat extends EventEmitter {
  constructor(bot, opts = {}) {
    super();
    this.bot = bot;
    this.opts = { minHunger: 15, minHealth: 14, priority: 'saturation', eatingTimeout: 4000, ...opts };
    this.enabled = opts.enabled !== false;
    this.isEating = false;
    this.revision = 0;
    this.cancel = null;
  }
  enableAuto() { this.enabled = true; }
  disableAuto() { this.enabled = false; this.cancelEat(); }
  needsFood() {
    const { bot, opts } = this;
    return this.enabled && bot.health > 0 && bot.food < 20 &&
      (bot.food <= opts.minHunger || bot.health <= opts.minHealth);
  }
  bestFood() {
    let best, score = -Infinity;
    for (const item of carriedItems(this.bot)) {
      const food = this.bot.registry.foodsByName?.[item.name];
      if (!food || BANNED.has(item.name) || (item.name === 'fish' && item.metadata === 3)) continue;
      const value = food[this.opts.priority] ?? food.foodPoints;
      if (value > score) { score = value; best = item; }
    }
    return best;
  }
  cancelEat() {
    this.revision++;
    this.cancel?.(new Error('Eating cancelled'));
  }
  async eat({ current = () => true, restore = true, item = null } = {}) {
    if (this.isEating) return false;
    const food = item ?? this.bestFood();
    const golden = /^(enchanted_)?golden_apple$/.test(food?.name ?? '');
    if (!food || (!golden && this.bot.food >= 20) || this.bot.health <= 0) return false;
    const bot = this.bot, revision = ++this.revision, previous = bot.heldItem;
    const valid = () => revision === this.revision && current() && bot.health > 0;
    this.isEating = true;
    this.previousItem = previous;
    let started = false, succeeded = false;
    try {
      await queueInventoryTask(bot, async () => {
        if (!valid()) return;
        const available = carriedItems(bot).find(item => item === food) ??
          carriedItems(bot).find(item => item.name === food.name);
        if (!available) throw new Error('Food is no longer in inventory');
        if (bot.heldItem !== available) await bot.equip(available, 'hand');
      });
      if (!valid()) return false;
      // Attach before use_item: a fast server may acknowledge use immediately.
      await new Promise((resolve, reject) => {
        let timer;
        const finish = error => {
          clearTimeout(timer);
          bot._client.off('entity_status', completed);
          bot.off('death', died); bot.off('end', died);
          this.cancel = null;
          error ? reject(error) : resolve();
        };
        const completed = packet => {
          if (packet.entityId === bot.entity.id && packet.entityStatus === 9) finish();
        };
        const died = () => finish(new Error('Eating interrupted by disconnect or death'));
        this.cancel = finish;
        bot._client.on('entity_status', completed);
        bot.on('death', died); bot.on('end', died);
        timer = setTimeout(() => finish(new Error('Server did not confirm eating')), this.opts.eatingTimeout);
        try {
          bot.deactivateItem();
          started = true;
          this.emit('eatStart', food);
          bot.activateItem();
        } catch (error) { finish(error); }
      });
      succeeded = true;
      return true;
    } finally {
      try {
        // An emergency owns the hand after cancellation. Never undo its bucket equip.
        if (current() && started) bot.deactivateItem();
        if (restore && valid() && previous && previous.name !== food.name) {
          await queueInventoryTask(bot, async () => {
            if (!valid()) return;
            const item = carriedItems(bot).find(item => item === previous) ??
              carriedItems(bot).find(item => item.name === previous.name);
            if (item) await bot.equip(item, 'hand');
          });
        }
      } finally {
        this.cancel = null;
        this.isEating = false;
        this.previousItem = null;
        this.emit('eatFinish', { food, succeeded });
      }
    }
  }
  dispose() { this.disableAuto(); this.removeAllListeners(); }
}

module.exports = { AutoEat, BANNED };
