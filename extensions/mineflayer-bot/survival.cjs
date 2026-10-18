const { AutoEat } = require('./auto-eat.cjs');
const { AutoBuff, splashSafe } = require('./auto-buff.cjs');
const { potionData } = require('./potion-data.cjs');
const { createEmergencyMlg } = require('./emergency-mlg.cjs');

const DEFAULTS = Object.freeze(require('./survival-defaults.json'));
function normalizeSurvival(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const result = { ...DEFAULTS };
  for (const key of ['autoEat', 'autoBuff', 'autoBuffHealing', 'autoBuffCombat', 'emergencyMlg', 'mlgPickupWater'])
    if (typeof value[key] === 'boolean') result[key] = value[key];
  for (const [key, min, max] of [['autoEatMinHunger', 1, 19], ['autoEatMinHealth', 1, 20], ['autoBuffMinHealth', 1, 20], ['mlgMinFallHeight', 4, 32]])
    if (typeof value[key] === 'number' && Number.isFinite(value[key]))
      result[key] = Math.max(min, Math.min(max, Math.round(value[key])));
  if (['foodPoints', 'saturation'].includes(value.autoEatPriority)) result.autoEatPriority = value.autoEatPriority;
  return result;
}

function createSurvivalController(bot, value, { now = Date.now, onStatus = () => {}, onError = () => {} } = {}) {
  const settings = normalizeSurvival(value);
  const autoEat = new AutoEat(bot, { enabled: settings.autoEat, minHunger: settings.autoEatMinHunger,
    minHealth: settings.autoEatMinHealth, priority: settings.autoEatPriority });
  const autoBuff = new AutoBuff(bot, { now });
  const mlg = createEmergencyMlg(bot, settings, { now, onStatus });
  let kind = null, generation = 0, disposed = false, peakY = bot.entity.position.y;
  let combatMeal = null;
  let nextEatAt = 0, nextMlgAt = 0, tickingMlg = false, task = Promise.resolve();
  const alive = () => !disposed && bot.health > 0 && bot.isAlive !== false;
  function acquire(nextKind) {
    kind = nextKind; combatMeal = null; generation++;
    // Set ownership first, invalidating queued combat/pearl equips immediately.
    bot.launcherTravel?.pauseForSurvival();
    bot.launcherCombat?.pauseForSurvival();
    bot.launcherGathering?.pauseForSurvival();
    bot.launcherProduction?.pauseForSurvival();
    if (bot.usingHeldItem) bot.deactivateItem();
    autoEat.cancelEat();
    autoBuff.cancelDrinking();
    bot.clearControlStates();
    const rev = generation;
    return () => alive() && generation === rev && kind === nextKind;
  }
  async function release(current) {
    if (!current()) return;
    kind = null;
    combatMeal = null;
    bot.clearControlStates();
    bot.launcherCombat?.resumeAfterSurvival();
    bot.launcherTravel?.resumeAfterSurvival();
    bot.launcherGathering?.resumeAfterSurvival();
    void bot.armorManager?.equipAll().catch(onError);
  }
  function tick() {
    if (!alive()) return;
    const entity = bot.entity, pos = entity.position;
    const climb = /^(ladder|vine|twisting_vines|weeping_vines)(?:_plant)?$/.test(bot.blockAt(pos)?.name ?? '');
    if (entity.onGround || entity.isInWater || entity.isInLava || climb) peakY = pos.y;
    else peakY = Math.max(peakY, pos.y);
    const plannedDrop = bot.pathfinder?.currentMove?.metadata?.waterLanding;
    const falling = !entity.onGround && !entity.isInWater && !entity.isInLava && !climb &&
      entity.velocity.y < -0.1 && !entity.elytraFlying &&
      !['creative', 'spectator'].includes(bot.game?.gameMode);
    try {
      if (combatMeal && !combatMeal.current()) {
        generation++; kind = null; combatMeal = null; autoEat.cancelEat();
        autoBuff.cancelDrinking();
        if (bot.usingHeldItem) bot.deactivateItem();
        bot.clearControlStates();
        bot.launcherCombat?.resumeAfterSurvival();
        bot.launcherTravel?.resumeAfterSurvival();
        bot.launcherGathering?.resumeAfterSurvival();
      }
      if (kind !== 'mlg' && settings.emergencyMlg && falling && !plannedDrop &&
        !bot.launcherCombat?.imminentMaceSmash && now() >= nextMlgAt) {
        const plan = mlg.plan(peakY);
        if (plan) {
          const previous = autoBuff.isDrinking ? autoBuff.previousItem : autoEat.isEating ? autoEat.previousItem : bot.heldItem;
          const current = acquire('mlg');
          // Do not wait for an airborne executor to reach safe ground first.
          void bot.pathfinder.interrupt(0, true, 'goalReassignment').catch(onError);
          task = mlg.start(plan, current, previous).catch(error => failMlg(error, current));
        }
      }
      if (kind === 'mlg') {
        if (!tickingMlg) {
          const rev = generation, current = () => alive() && generation === rev && kind === 'mlg';
          tickingMlg = true;
          task = mlg.tick().then(async done => {
            if (done && current()) {
              await mlg.finish(current);
              nextMlgAt = now() + 1000;
              await release(current);
            }
          }).catch(error => failMlg(error, current)).finally(() => { tickingMlg = false; });
        }
        return;
      }
      if (kind || !entity.onGround || climb || plannedDrop || bot.launcherPearling ||
        bot.launcherDefendingBow || now() < nextEatAt || !autoEat.needsFood()) return;
      // The combat director first creates room to eat. Ordinary hunger must not
      // make a healthy bot put away its weapon in the middle of a duel.
      if (bot.launcherCombat?.managesHealing) return;
      nextEatAt = now() + 1000; // No inventory scan/error loop on every empty tick.
      if (!autoEat.bestFood()) return;
      const current = acquire('eat');
      task = Promise.resolve(bot.pathfinder?.stop()).then(async () => {
        if (!current()) return;
        onStatus('Auto-eat: eating safe food');
        await autoEat.eat({ current });
      }).catch(error => { if (current()) onError(error); }).finally(async () => {
        nextEatAt = now() + 1000;
        await release(current);
      });
    } catch (error) {
      onError(error); nextMlgAt = now() + 1000;
      autoEat.cancelEat(); mlg.cancel();
      const rev = generation;
      void release(() => alive() && generation === rev && kind !== null).catch(onError);
    }
  }
  async function failMlg(error, current) {
    if (!current()) return;
    onError(error); nextMlgAt = now() + 1000;
    await mlg.finish(current).catch(onError);
    await release(current);
  }
  function reset() {
    const wasBusy = kind !== null;
    generation++; kind = null; combatMeal = null;
    if (wasBusy && bot._client?.state === 'play' && bot.usingHeldItem) bot.deactivateItem();
    autoEat.cancelEat(); autoBuff.cancelDrinking(); mlg.cancel();
    peakY = bot.entity.position.y;
    if (!disposed && bot.health > 0) {
      bot.launcherCombat?.resumeAfterSurvival();
      bot.launcherTravel?.resumeAfterSurvival();
    }
  }
  const controller = {
    get busy() { return kind !== null; }, get kind() { return kind; },
    get task() { return task; },
    healingPotion() {
      return settings.autoBuff && settings.autoBuffHealing && bot.health <= settings.autoBuffMinHealth
        ? autoBuff.best(true) : null;
    },
    requestCombatBuff(enemy, valid) {
      if (!settings.autoBuff || !settings.autoBuffCombat || bot.health <= settings.autoBuffMinHealth ||
        !enemy?.position || enemy.position.distanceTo(bot.entity.position) < 8 || !splashSafe(bot)) return false;
      const item = autoBuff.best(false);
      return item ? controller.requestCombatHeal(item, () => valid() &&
        enemy.position.distanceTo(bot.entity.position) >= 4.5 && splashSafe(bot)) : false;
    },
    requestCombatHeal(item, valid, onFinished = () => {}) {
      if (!alive() || kind || autoEat.isEating || autoBuff.isDrinking || !item || bot.launcherPearling ||
        bot.launcherDefendingBow || !bot.entity.onGround) return false;
      const potion = potionData(bot, item);
      if (/potion/.test(item.name) && !potion) return false;
      if (potion && (!settings.autoBuff || potion.lingering || (potion.splash && !splashSafe(bot)))) return false;
      const current = acquire(potion ? 'buff' : 'eat');
      combatMeal = { current: valid };
      let succeeded = false;
      const eatingCurrent = () => current() && valid();
      task = Promise.resolve(bot.pathfinder.stop()).then(async () => {
        if (!eatingCurrent()) return;
        onStatus(`combat ${potion ? 'potion' : 'heal'}: ${potion?.name || item.name}`);
        succeeded = potion
          ? await autoBuff.applyItemToSelf(item, { current: eatingCurrent })
          : await autoEat.eat({ item, current: eatingCurrent });
      }).catch(error => { if (eatingCurrent()) onError(error); }).finally(async () => {
        if (current()) {
          onFinished(succeeded);
          nextEatAt = now() + 1000;
          await release(current);
        }
      });
      return true;
    },
    cancelCombatHeal() {
      if (!combatMeal) return;
      generation++; kind = null; combatMeal = null;
      autoEat.cancelEat();
      autoBuff.cancelDrinking();
      if (bot.usingHeldItem) bot.deactivateItem();
      bot.clearControlStates();
      bot.launcherCombat?.resumeAfterSurvival();
      bot.launcherTravel?.resumeAfterSurvival();
      bot.launcherGathering?.resumeAfterSurvival();
    },
    dispose() {
      if (disposed) return;
      disposed = true; reset(); autoEat.dispose(); autoBuff.dispose();
      bot.off('physicsTick', tick); bot.off('death', reset); bot.off('respawn', reset); bot.off('end', controller.dispose);
    },
  };
  bot.autoEat = autoEat;
  bot.autoBuff = autoBuff;
  bot.launcherSurvival = controller;
  bot.prependListener('physicsTick', tick);
  bot.on('death', reset); bot.on('respawn', reset); bot.on('end', controller.dispose);
  return controller;
}

module.exports = { DEFAULTS, normalizeSurvival, createSurvivalController };
