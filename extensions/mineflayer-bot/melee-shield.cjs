const { carriedItems, bestMeleeWeapon, equipCombatItem } = require("./combat-inventory.cjs");

const originals = Symbol("launcherShieldBreakOriginals");

function targetBlocking(bot, entity) {
  if (!entity || entity.isValid === false) return false;
  const keys = bot.registry?.entitiesByName?.[entity.name ?? "player"]?.metadataKeys;
  const index = keys?.indexOf("living_entity_flags") ?? -1;
  const flags = index >= 0 ? entity.metadata?.[index] : undefined;
  if (typeof flags === "number") {
    const item = flags & 2 ? entity.equipment?.[1] : (entity.heldItem ?? entity.equipment?.[0]);
    return Boolean(flags & 1) && item?.name === "shield";
  }
  return bot.util?.entity?.isOffHandActive(entity) && entity.equipment?.[1]?.name === "shield";
}

function installShieldBreak(bot, settings, aimedAt, onError = () => {}) {
  const engine = bot.swordpvp;
  const preferredWeapon = settings.weapon === "mace" ? "sword" : settings.weapon;
  engine.launcherShieldBreak?.dispose();
  engine[originals] ??= {
    update: engine.update,
    stop: engine.stop.bind(engine),
    causeCritical: engine.causeCritical.bind(engine),
    toggleShield: engine.toggleShield.bind(engine),
  };
  const original = engine[originals];
  let state = null;
  let task = Promise.resolve();
  let disposed = false;
  let attacks = 0;
  const attacked = () => {
    attacks++;
  };
  engine.on("attackedTarget", attacked);
  function cooldown() {
    const speeds = {
      wooden_axe: 0.8,
      stone_axe: 0.8,
      iron_axe: 0.9,
      golden_axe: 1,
      diamond_axe: 1,
      netherite_axe: 1,
    };
    return Math.max(
      engine.meleeAttackRate.getTicks(bot.heldItem),
      Math.ceil(20 / (speeds[bot.heldItem?.name] ?? 1)),
    );
  }

  function reset() {
    if (state) engine.tickOverride = false;
    state = null;
    bot.launcherBreakingShield = false;
    bot.launcherAxeAttacking = false;
    engine.weaponOfChoice = preferredWeapon;
  }
  function attackReason(target) {
    if (settings.shieldBreak && targetBlocking(bot, target)) return "disableshield";
    const weapon = bestMeleeWeapon(bot, preferredWeapon);
    const onlyAxes = !carriedItems(bot).some((item) => item.name.endsWith("_sword"));
    return weapon?.name.endsWith("_axe") && (settings.criticals !== "off" || onlyAxes)
      ? "axecritical"
      : null;
  }
  function current(action) {
    return (
      !disposed &&
      state === action &&
      engine.target === action.target &&
      attackReason(action.target) &&
      engine.botReach() <= settings.attackRange &&
      bot.health > 0 &&
      !bot.launcherDefendingBow && !bot.launcherSurvival?.busy
    );
  }
  function prepare() {
    if (
      bot.supportFeature("doesntHaveOffHandSlot") ||
      !engine.target ||
      bot.health <= 0 ||
      bot.launcherDefendingBow || bot.launcherSurvival?.busy
    ) {
      reset();
      return;
    }
    const target = engine.target;
    const reason = attackReason(target);
    if (state && (state.target !== target || !reason || engine.botReach() > settings.attackRange)) {
      reset();
      const preferred = bestMeleeWeapon(bot, preferredWeapon);
      if (preferred)
        task = equipCombatItem(
          bot,
          preferred,
          "hand",
          () => !disposed && !state && engine.target === target && !bot.launcherDefendingBow,
        ).catch(onError);
    }
    if (state) {
      state.reason = reason;
      bot.launcherBreakingShield = reason === "disableshield";
    }
    if (state || !reason || engine.botReach() > settings.attackRange || engine.tickOverride) return;
    const axe = bot.heldItem?.name.endsWith("_axe") ? bot.heldItem : bestMeleeWeapon(bot, "axe");
    if (!axe?.name.endsWith("_axe")) return;
    const action = { target, reason, phase: "equip", airTicks: 0 };
    state = action;
    engine.tickOverride = true;
    bot.launcherBreakingShield = reason === "disableshield";
    bot.launcherAxeAttacking = true;
    engine.weaponOfChoice = "_axe";
    engine.clearShieldToggleListener();
    if (bot.usingHeldItem) bot.deactivateItem();
    task = equipCombatItem(bot, axe, "hand", () => current(action))
      .then(() => {
        if (!current(action)) return;
        // Switching weapons resets attack strength on the server. Charge the axe
        // fully instead of the upstream fixed three-tick shield attack.
        engine.ticksToNextAttack = cooldown();
        action.phase = "charge";
      })
      .catch((error) => {
        if (state === action) reset();
        onError(error);
      });
  }
  function tick() {
    if (!state || !current(state) || state.phase === "equip") return;
    const action = state;
    bot.setControlState("sprint", false);
    if (bot.usingHeldItem) bot.deactivateItem();
    // Shield breaking owns its critical jump independently of the general crit
    // option. Ordinary axe combat also waits for a falling hit on every cycle.
    if (!bot.entity.isInWater && !bot.entity.isInLava) {
      if (action.phase === "charge") {
        if (engine.ticksToNextAttack > 8) return;
        if (bot.entity.onGround) {
          bot.setControlState("jump", true);
          bot.setControlState("jump", false);
        }
        action.phase = "fall";
        action.airTicks = 0;
        return;
      }
      action.airTicks++;
      if (bot.entity.onGround || bot.entity.velocity.y >= 0) {
        if (action.airTicks >= 12) action.phase = "charge";
        return;
      }
    }
    if (engine.ticksToNextAttack > 0 || !aimedAt(action.target)) return;
    // The regular update still maintains range, visibility, aim and timers.
    // Only this branch may strike while the axe cycle owns the attack.
    const before = attacks;
    void engine
      .attemptAttack(action.reason)
      .then(() => {
        if (current(action) && attacks > before)
          engine.ticksToNextAttack = Math.max(engine.ticksToNextAttack, cooldown());
      })
      .catch(onError);
    action.phase = "charge";
  }
  function update() {
    prepare();
    if (!bot.launcherDefendingBow && !bot.launcherSurvival?.busy) original.update();
    tick();
  }
  function checkForShield() {} // Shield switching is owned by the cycle above.
  bot.off("physicsTick", engine.update);
  bot.off("physicsTick", engine.checkForShield);
  engine.update = update;
  engine.checkForShield = checkForShield;
  engine.causeCritical = (...args) =>
    state ? Promise.resolve(false) : original.causeCritical(...args);
  engine.toggleShield = (...args) =>
    state ? Promise.resolve(false) : original.toggleShield(...args);
  engine.stop = () => {
    reset();
    return original.stop();
  };
  bot.on("physicsTick", update);
  bot.on("physicsTick", checkForShield);
  engine.launcherShieldBreak = {
    dispose() {
      disposed = true;
      reset();
      bot.off("physicsTick", update);
      bot.off("physicsTick", checkForShield);
      engine.off("attackedTarget", attacked);
    },
    get task() {
      return task;
    },
  };
}

module.exports = { installShieldBreak, targetBlocking };
