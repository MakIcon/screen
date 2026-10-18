const { carriedItems } = require("./combat-inventory.cjs");
const { targetBlocking } = require("./melee-shield.cjs");

function metadataNumber(bot, entity, names) {
  const keys = bot.registry?.entitiesByName?.[entity?.name ?? "player"]?.metadataKeys;
  if (!keys) return null;
  for (const name of names) {
    const index = keys.indexOf(name),
      value = entity?.metadata?.[index];
    if (index >= 0 && typeof value === "number" && Number.isFinite(value) && value >= 0)
      return value;
  }
  return null;
}

// Do not infer HP from animation packets: armour, absorption and server damage
// rules make hit counting unreliable. Missing information stays unknown.
function observedHealth(bot, entity) {
  const health = metadataNumber(bot, entity, ["health"]);
  const absorption = metadataNumber(bot, entity, [
    "player_absorption",
    "absorption",
    "absorption_amount",
  ]);
  return { health, absorption, effective: health === null ? null : health + (absorption ?? 0) };
}

function chooseCombatAction(s) {
  const finish =
    s.enemyHealth !== null &&
    s.enemyHealth <= 4 &&
    s.distance <= 4 &&
    s.visible &&
    !s.blocking &&
    s.health > 5;
  const danger = s.health <= 7 || (s.health <= 12 && s.damage >= 5);
  if (
    s.heal &&
    s.canRecover &&
    !s.airborne &&
    !finish &&
    (danger || s.health <= 12 || (s.needsFood && (s.distance >= 6 || s.food <= 6)))
  ) {
    if (s.distance >= 6 || !s.visible) return { action: "heal", reason: "safe healing window" };
    if (s.pearlEscape && s.health >= s.pearlMinHealth && s.health > 6)
      return { action: "escape", reason: "create healing distance with pearl" };
    return { action: "retreat", reason: "create healing distance" };
  }
  if (s.blocking && s.axe) return { action: "break_shield", reason: "opponent is blocking" };
  if (finish) return { action: "finish", reason: "low reported enemy HP" };
  if (s.enemyUsingItem) return { action: "punish", reason: "opponent is using an item" };
  if (s.distance > s.reach) return { action: "push", reason: "close distance" };
  return { action: "pressure", reason: "maintain melee pressure" };
}

// Compare a feasible blast with the cost of giving up melee pressure. Geometry,
// armour, prediction, chain explosions and owner protection remain the planner's
// responsibility and are checked again immediately before the packet is sent.
function crystalOpportunity(s, action, settings) {
  const reject = (reason) => ({ use: false, score: -Infinity, reason });
  if (!action || !s) return reject("no feasible crystal action");
  const { damage, selfDamage } = action;
  if (!Number.isFinite(damage) || !Number.isFinite(selfDamage))
    return reject("unknown blast damage");
  const remaining = s.health - selfDamage;
  if (selfDamage > settings.crystalMaxSelfDamage || remaining < settings.crystalMinHealth)
    return reject("unsafe blast even if it would kill the enemy");
  if (action.finish)
    return { use: true, score: 1000 - selfDamage, reason: "finish confirmed crystal safely" };
  if (damage < settings.crystalMinDamage) return reject("insufficient crystal damage");
  const lethal = s.enemyHealth !== null && s.enemyHealth > 0 && damage >= s.enemyHealth + 1;
  const construction = action.type === "build" || action.type === "cover";
  const steps =
    action.type === "break"
      ? 1
      : action.type === "place"
        ? 2
        : action.type === "cover" && action.crystal
          ? 2
          : 3 + Number(Boolean(action.nextCover));
  const pressured = s.distance <= 3.5 || s.damage >= 4;
  if (construction && pressured && (s.health <= 14 || s.damage >= 4))
    return reject("cannot afford construction under melee pressure");
  if (s.action === "finish" && action.type !== "break")
    return reject("finish with the equipped weapon instead of building");
  if (!lethal && pressured && remaining < settings.crystalMinHealth + 2)
    return reject("leave health for the next enemy hit");
  if (!lethal && selfDamage > damage * 0.65) return reject("poor damage trade");
  const usefulDamage = Math.min(damage, s.enemyHealth ?? 20);
  const score =
    usefulDamage -
    selfDamage * 1.6 -
    (steps - 1) * 1.8 +
    (lethal ? 30 : 0) +
    (action.type === "break" ? 2 : 0) +
    (s.enemyUsingItem ? 2 : 0);
  return score >= 2 || action.committed
    ? {
        use: true,
        score: score + (action.committed ? 8 : 0),
        reason: action.committed
          ? "complete committed crystal setup"
          : lethal
            ? "safe predicted crystal finish"
            : action.type === "break"
              ? "profitable immediate explosion"
              : "profitable crystal setup",
      }
    : reject("weapon pressure is more valuable than this setup");
}

function createCombatBrain(
  bot,
  settings,
  { now = Date.now, blocking = (entity) => targetBlocking(bot, entity) } = {},
) {
  let inventory = [],
    capabilities = {},
    inventoryAt = -Infinity,
    damage = [],
    lastHealth = bot.health;
  let lastDecision = null,
    nextRecoveryAt = 0,
    nextAppleAt = 0;
  const invalidate = () => {
    inventoryAt = -Infinity;
  };
  const healthChanged = () => {
    if (Number.isFinite(lastHealth) && bot.health < lastHealth)
      damage.push({ at: now(), amount: lastHealth - bot.health });
    lastHealth = bot.health;
  };
  bot.inventory?.on?.("updateSlot", invalidate);
  bot.on("health", healthChanged);
  function reset() {
    damage = [];
    lastHealth = bot.health;
    lastDecision = null;
    nextRecoveryAt = 0;
    inventoryAt = -Infinity;
  }
  return {
    evaluate(target, { visible, airborne = false, recover = true } = {}) {
      healthChanged();
      const time = now();
      if (time - inventoryAt >= 250) {
        inventory = carriedItems(bot);
        capabilities = { axe: false, mace: false, wind: false, pearls: 0 };
        for (const item of inventory) {
          if (item.name.endsWith("_axe")) capabilities.axe = true;
          else if (item.name === "mace") capabilities.mace = true;
          else if (item.name === "wind_charge") capabilities.wind = true;
          else if (item.name === "ender_pearl") capabilities.pearls += item.count ?? 1;
          else if (item.name === "golden_apple") capabilities.apple ??= item;
          else if (item.name === "enchanted_golden_apple") capabilities.enchantedApple ??= item;
        }
        inventoryAt = time;
      }
      damage = damage.filter((hit) => time - hit.at < 2000);
      const enemy = observedHealth(bot, target);
      const flags = metadataNumber(bot, target, ["living_entity_flags"]);
      const held =
        flags !== null && flags & 2
          ? target.equipment?.[1]
          : (target.heldItem ?? target.equipment?.[0]);
      const apple = time >= nextAppleAt && (capabilities.apple ?? capabilities.enchantedApple);
      const food = bot.autoEat?.needsFood() && bot.autoEat.bestFood();
      const heal =
        settings.combatHealing &&
        bot.launcherSurvival?.requestCombatHeal &&
        ((bot.health <= 12 && apple) || food);
      // An opponent looking more than ~100° away cannot aim a hit back.
      const away = bot.entity.position.minus(target.position);
      const awayLength = Math.hypot(away.x, away.z);
      const facing =
        !Number.isFinite(target.yaw) ||
        awayLength < 0.01 ||
        (-Math.sin(target.yaw) * away.x - Math.cos(target.yaw) * away.z) / awayLength > -0.2;
      const snapshot = {
        health: bot.health,
        enemyHealth: enemy.effective,
        enemy,
        facing,
        distance: bot.entity.position.distanceTo(target.position),
        reach: settings.attackRange,
        damage: damage.reduce((total, hit) => total + hit.amount, 0),
        visible,
        airborne,
        blocking: Boolean(blocking(target)),
        axe: settings.shieldBreak && capabilities.axe,
        mace: Boolean(bot.registry?.itemsByName?.mace) && capabilities.mace,
        wind: capabilities.wind,
        enemyUsingItem: Boolean(
          flags !== null &&
          flags & 1 &&
          /apple|potion|bow|beef|porkchop|bread|carrot/.test(held?.name ?? ""),
        ),
        heal: heal || null,
        needsFood: Boolean(food),
        food: bot.food,
        canRecover: recover && time >= nextRecoveryAt,
        pearlEscape:
          settings.pearlEnabled &&
          settings.pearlEscape &&
          capabilities.pearls > settings.pearlReserve,
        pearlMinHealth: settings.pearlMinHealth,
      };
      lastDecision = { ...chooseCombatAction(snapshot), ...snapshot };
      return lastDecision;
    },
    recovered(item, succeeded) {
      nextRecoveryAt = now() + (succeeded ? 1000 : 2000);
      if (succeeded && /golden_apple/.test(item?.name ?? "")) nextAppleAt = now() + 5000;
    },
    deferRecovery() {
      nextRecoveryAt = now() + 2000;
    },
    reset,
    get decision() {
      return lastDecision;
    },
    dispose() {
      bot.inventory?.off?.("updateSlot", invalidate);
      bot.off("health", healthChanged);
      reset();
    },
  };
}

module.exports = { observedHealth, chooseCombatAction, crystalOpportunity, createCombatBrain };
