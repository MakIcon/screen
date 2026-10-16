const {
  carriedItems,
  bestMeleeWeapon,
  equipCombatItem,
  offhandItem,
  meleeCooldownTicks,
} = require("./combat-inventory.cjs");

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
  return Boolean(
    entity.metadata &&
    entity.equipment?.[1]?.name === "shield" &&
    bot.util?.entity?.isOffHandActive(entity),
  );
}

function installShieldBreak(
  bot,
  settings,
  aimedAt,
  onError = () => {},
  focus = () => Promise.resolve(),
) {
  const engine = bot.swordpvp;
  const preferredWeapon = settings.weapon === "mace" ? "sword" : settings.weapon;
  engine.launcherShieldBreak?.dispose();
  engine[originals] ??= {
    update: engine.update,
    stop: engine.stop.bind(engine),
    causeCritical: engine.causeCritical.bind(engine),
    toggleShield: engine.toggleShield.bind(engine),
    doMove: engine.doMove.bind(engine),
    doStrafe: engine.doStrafe.bind(engine),
  };
  const original = engine[originals];
  let state = null;
  let task = Promise.resolve();
  let disposed = false;
  let attacks = 0;
  let ownsShield = false;
  let restoring = false;
  let revision = 0;
  const attacked = () => {
    attacks++;
  };
  engine.on("attackedTarget", attacked);
  function cooldown() {
    return Math.max(engine.meleeAttackRate.getTicks(bot.heldItem), meleeCooldownTicks(bot));
  }

  function reset() {
    revision++;
    if (state || restoring) engine.tickOverride = false;
    restoring = false;
    state = null;
    bot.launcherBreakingShield = false;
    bot.launcherAxeAttacking = false;
    engine.weaponOfChoice = preferredWeapon;
    shield(false);
    engine.clearShieldToggleListener();
  }
  function shield(raise) {
    const available =
      settings.shield &&
      !bot.supportFeature("doesntHaveOffHandSlot") &&
      offhandItem(bot)?.name === "shield";
    if (raise && available) {
      if (!bot.usingHeldItem) bot.activateItem(true);
      ownsShield = true;
    } else if (ownsShield) {
      ownsShield = false;
      if (bot.usingHeldItem) bot.deactivateItem();
    }
  }
  function holdPosition() {
    for (const control of ["forward", "back", "left", "right", "sprint"])
      bot.setControlState(control, false);
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
      action.target.isValid !== false &&
      engine.botReach() <= settings.attackRange + (bot.entity.onGround ? 0.4 : 1.5) &&
      bot.health > 0 &&
      !bot.launcherDefendingBow &&
      !bot.launcherSurvival?.busy
    );
  }
  function prepare() {
    if (
      bot.supportFeature("doesntHaveOffHandSlot") ||
      !engine.target ||
      bot.health <= 0 ||
      bot.launcherDefendingBow ||
      bot.launcherSurvival?.busy
    ) {
      reset();
      return;
    }
    const target = engine.target;
    const reason = attackReason(target);
    if (
      state &&
      (state.target !== target ||
        (!reason && bot.entity.onGround) ||
        engine.botReach() > settings.attackRange + (bot.entity.onGround ? 0.4 : 1.5))
    ) {
      reset();
      const preferred = bestMeleeWeapon(bot, preferredWeapon);
      if (preferred) {
        const rev = revision;
        const valid = () =>
          !disposed &&
          rev === revision &&
          !state &&
          engine.target === target &&
          !bot.launcherDefendingBow &&
          !bot.launcherSurvival?.busy;
        restoring = true;
        engine.tickOverride = true;
        task = equipCombatItem(bot, preferred, "hand", valid)
          .then(() => {
            if (valid())
              engine.ticksToNextAttack = Math.max(
                engine.ticksToNextAttack,
                engine.meleeAttackRate.getTicks(bot.heldItem),
              );
          })
          .catch(onError)
          .finally(() => {
            if (rev === revision && !state) {
              restoring = false;
              engine.tickOverride = false;
            }
          });
      }
    }
    if (state) {
      if (reason) state.reason = reason;
      bot.launcherBreakingShield = state.reason === "disableshield";
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
    if (!state || !current(state) || ["equip", "strike"].includes(state.phase)) return;
    const action = state;
    bot.setControlState("sprint", false);
    // Shield breaking owns its critical jump independently of the general crit
    // option. Ordinary axe combat also waits for a falling hit on every cycle.
    if (!bot.entity.isInWater && !bot.entity.isInLava) {
      if (action.phase === "charge") {
        if (
          engine.ticksToNextAttack > 8 ||
          engine.botReach() > Math.min(settings.attackRange - 0.2, 2.5) ||
          !aimedAt(action.target) ||
          bot.pathfinder.goal
        ) {
          shield(true);
          return;
        }
        holdPosition();
        shield(false);
        if (bot.usingHeldItem) bot.deactivateItem();
        if (bot.entity.onGround) {
          bot.setControlState("jump", true);
          bot.setControlState("jump", false);
        }
        action.phase = "fall";
        action.airTicks = 0;
        return;
      }
      holdPosition();
      shield(false);
      action.airTicks++;
      if (bot.entity.onGround || bot.entity.velocity.y >= 0) {
        if (action.airTicks >= 12) action.phase = "charge";
        return;
      }
    }
    if (engine.ticksToNextAttack > 0 || engine.botReach() > settings.attackRange) return;
    // The regular update still maintains range, visibility, aim and timers.
    // Only this branch may strike while the axe cycle owns the attack.
    const before = attacks;
    action.phase = "strike";
    task = Promise.resolve(focus(action.target, true))
      .then(async () => {
        if (
          !current(action) ||
          engine.botReach() > settings.attackRange ||
          !aimedAt(action.target) ||
          (!bot.entity.isInWater &&
            !bot.entity.isInLava &&
            (bot.entity.onGround || bot.entity.velocity.y >= 0))
        )
          return;
        shield(false);
        if (bot.usingHeldItem) bot.deactivateItem();
        await engine.attemptAttack(action.reason);
        if (current(action) && attacks > before)
          engine.ticksToNextAttack = Math.max(engine.ticksToNextAttack, cooldown());
      })
      .catch(onError)
      .finally(() => {
        if (state === action)
          action.phase = attacks > before || bot.entity.onGround ? "charge" : "fall";
      });
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
    state || restoring || ownsShield || targetBlocking(bot, engine.target)
      ? Promise.resolve(false)
      : original.causeCritical(...args);
  engine.doMove = (...args) => {
    if (state && ["fall", "strike"].includes(state.phase)) return holdPosition();
    return original.doMove(...args);
  };
  engine.doStrafe = (...args) => {
    if (state || ownsShield || targetBlocking(bot, engine.target)) return;
    return original.doStrafe(...args);
  };
  engine.toggleShield = () => {
    if (state) return Promise.resolve(false);
    engine.clearShieldToggleListener();
    const target = engine.target;
    shield(
      Boolean(
        target &&
        !bot.pathfinder.goal &&
        engine.wasVisible &&
        engine.botReach() <= settings.attackRange + 1 &&
        (restoring || engine.ticksToNextAttack > 0 || targetBlocking(bot, target)),
      ),
    );
    return Promise.resolve();
  };
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
