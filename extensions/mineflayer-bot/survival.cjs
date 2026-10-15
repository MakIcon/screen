const { AutoEat } = require('./auto-eat.cjs');
const { createEmergencyMlg } = require('./emergency-mlg.cjs');

const DEFAULTS = Object.freeze(require('./survival-defaults.json'));
function normalizeSurvival(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const result = { ...DEFAULTS };
  for (const key of ['autoEat', 'emergencyMlg', 'mlgPickupWater'])
    if (typeof value[key] === 'boolean') result[key] = value[key];
  for (const [key, min, max] of [['autoEatMinHunger', 1, 19], ['autoEatMinHealth', 1, 20], ['mlgMinFallHeight', 4, 32]])
    if (typeof value[key] === 'number' && Number.isFinite(value[key]))
      result[key] = Math.max(min, Math.min(max, Math.round(value[key])));
  if (['foodPoints', 'saturation'].includes(value.autoEatPriority)) result.autoEatPriority = value.autoEatPriority;
  return result;
}

function createSurvivalController(bot, value, { now = Date.now, onStatus = () => {}, onError = () => {} } = {}) {
  const settings = normalizeSurvival(value);
  const autoEat = new AutoEat(bot, { enabled: settings.autoEat, minHunger: settings.autoEatMinHunger,
    minHealth: settings.autoEatMinHealth, priority: settings.autoEatPriority });
  const mlg = createEmergencyMlg(bot, settings, { now, onStatus });
  let kind = null, generation = 0, disposed = false, peakY = bot.entity.position.y;
  let nextEatAt = 0, nextMlgAt = 0, tickingMlg = false, task = Promise.resolve();
  const alive = () => !disposed && bot.health > 0 && bot.isAlive !== false;
  function acquire(nextKind) {
    kind = nextKind; generation++;
    // Set ownership first, invalidating queued combat/pearl equips immediately.
    bot.launcherTravel?.pauseForSurvival();
    bot.launcherCombat?.pauseForSurvival();
    bot.launcherGathering?.pauseForSurvival();
    bot.launcherProduction?.pauseForSurvival();
    if (bot.usingHeldItem) bot.deactivateItem();
    autoEat.cancelEat();
    bot.clearControlStates();
    const rev = generation;
    return () => alive() && generation === rev && kind === nextKind;
  }
  async function release(current) {
    if (!current()) return;
    kind = null;
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
      if (kind !== 'mlg' && settings.emergencyMlg && falling && !plannedDrop && now() >= nextMlgAt) {
        const plan = mlg.plan(peakY);
        if (plan) {
          const previous = autoEat.isEating ? autoEat.previousItem : bot.heldItem;
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
    generation++; kind = null;
    if (wasBusy && bot._client?.state === 'play' && bot.usingHeldItem) bot.deactivateItem();
    autoEat.cancelEat(); mlg.cancel();
    peakY = bot.entity.position.y;
    if (!disposed && bot.health > 0) {
      bot.launcherCombat?.resumeAfterSurvival();
      bot.launcherTravel?.resumeAfterSurvival();
    }
  }
  const controller = {
    get busy() { return kind !== null; }, get kind() { return kind; },
    get task() { return task; },
    dispose() {
      if (disposed) return;
      disposed = true; reset(); autoEat.dispose();
      bot.off('physicsTick', tick); bot.off('death', reset); bot.off('respawn', reset); bot.off('end', controller.dispose);
    },
  };
  bot.autoEat = autoEat;
  bot.launcherSurvival = controller;
  bot.prependListener('physicsTick', tick);
  bot.on('death', reset); bot.on('respawn', reset); bot.on('end', controller.dispose);
  return controller;
}

module.exports = { DEFAULTS, normalizeSurvival, createSurvivalController };
