const { Vec3 } = require("vec3");
const { toNotchianYaw, toNotchianPitch } = require("mineflayer/lib/conversions");
const { carriedItems, equipCombatItem } = require("./combat-inventory.cjs");
const { targetBlocking } = require("./melee-shield.cjs");

// Aim inside the real hitbox and measure reach from the attacker's eyes.
function maceAttackPoint(bot, target, range, position = bot.entity.position) {
  if (!target?.position || target.isValid === false) return null;
  const eyes = position.offset(0, bot.entity.eyeHeight ?? 1.62, 0);
  const half = (target.width ?? 0.6) / 2 - 0.02;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const point = new Vec3(
    clamp(eyes.x, target.position.x - half, target.position.x + half),
    clamp(eyes.y, target.position.y + 0.1, target.position.y + (target.height ?? 1.8) - 0.1),
    clamp(eyes.z, target.position.z - half, target.position.z + half),
  );
  const delta = point.minus(eyes),
    length = delta.norm();
  if (length > range) return null;
  if (length > 0.01 && bot.world?.raycast(eyes, delta.scaled(1 / length), length)) return null;
  return point;
}

function createMaceCombat(
  bot,
  settings,
  { now = Date.now, random = Math.random, onStatus = () => {}, onError = () => {} } = {},
) {
  let target = null,
    state = null,
    generation = 0,
    busy = false;
  let task = Promise.resolve(),
    nextWindAt = 0,
    nextAttackAt = 0,
    nextCpsAt = 0,
    retryAt = 0;
  let approaching = false;
  const available = () =>
    Boolean(bot.registry?.itemsByName?.mace) &&
    carriedItems(bot).some((item) => item.name === "mace");
  const current = (revision) =>
    revision === generation &&
    target?.isValid !== false &&
    target &&
    bot.health > 0 &&
    !bot.launcherDefendingBow &&
    !bot.launcherPearling &&
    !bot.launcherSurvival?.busy &&
    !bot.launcherProduction?.busy;
  function controlsOff() {
    for (const key of ["forward", "back", "left", "right", "jump", "sprint"])
      bot.setControlState(key, false);
  }
  function stop() {
    generation++;
    if (target) controlsOff();
    if (approaching) void bot.pathfinder.stop();
    approaching = false;
    target = null;
    state = null;
  }
  function start(entity) {
    stop();
    target = entity;
  }
  function run(action) {
    if (busy) return;
    const revision = generation;
    busy = true;
    task = action(revision)
      .catch((error) => {
        if (revision === generation) {
          state = null;
          retryAt = now() + 1000;
          controlsOff();
          onError(error);
        }
      })
      .finally(() => {
        busy = false;
      });
  }
  function flushLook(withPosition = false) {
    if (bot._client?.state !== "play") return;
    bot._client.write(withPosition ? "position_look" : "look", {
      ...(withPosition
        ? { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z }
        : {}),
      yaw: Math.fround(toNotchianYaw(bot.entity.yaw)),
      pitch: Math.fround(toNotchianPitch(bot.entity.pitch)),
      onGround: Boolean(bot.entity.onGround),
      flags: {
        onGround: Boolean(bot.entity.onGround),
        hasHorizontalCollision: Boolean(bot.entity.isCollidedHorizontally),
      },
    });
  }
  async function equipMace(revision) {
    const item = carriedItems(bot).find((entry) => entry.name === "mace");
    const changed = bot.heldItem?.name !== "mace";
    await equipCombatItem(bot, item, "hand", () => current(revision));
    if (changed && current(revision)) nextAttackAt = now() + 1000 / 0.6;
  }
  function approach() {
    if (approaching) return;
    approaching = true;
    bot.pathfinder.setGoal({ entity: target, rangeSq: 2.5 ** 2 });
  }
  function launchSite() {
    const position = bot.entity.position;
    const floor = bot.blockAt?.(position.offset(0, -0.1, 0));
    if (!floor || floor.boundingBox !== "block" || /water|lava/.test(floor.name)) return false;
    const eyes = position.offset(0, bot.entity.height ?? 1.8, 0);
    return !bot.world?.raycast(eyes, new Vec3(0, 1, 0), 4);
  }
  function abortLaunch() {
    controlsOff();
    state = null;
    retryAt = now() + 1000;
  }
  function beginJump() {
    if (!bot.entity.onGround || !launchSite() || now() - state.started > 1000) {
      abortLaunch();
      return;
    }
    // Releasing forward does not remove sprint momentum. Let ground friction
    // brake it before leaving the floor, where horizontal drag is much weaker.
    if (Math.hypot(bot.entity.velocity.x, bot.entity.velocity.z) > 0.025) return;
    state.phase = "jump";
    state.started = now();
    bot.setControlState("jump", true);
  }
  async function prepareJump(revision) {
    // Own the entire launch, including asynchronous inventory/pathfinder work,
    // so the combat director cannot switch engines halfway through it.
    const action = (state = { phase: "prepare", started: now(), peak: bot.entity.position.y });
    controlsOff();
    await bot.pathfinder.stop();
    approaching = false;
    if (!current(revision) || state !== action) return;
    controlsOff();
    if (bot.usingHeldItem) bot.deactivateItem();
    const charge = carriedItems(bot).find((entry) => entry.name === "wind_charge");
    await equipCombatItem(bot, charge, "hand", () => current(revision));
    if (!current(revision) || state !== action) return;
    if (bot.heldItem?.name !== "wind_charge") return abortLaunch();
    action.phase = "settle";
    action.started = now();
    beginJump();
  }
  async function throwWind(revision) {
    controlsOff();
    const action = state;
    if (!current(revision)) return;
    if (bot.heldItem?.name !== "wind_charge") return abortLaunch();
    // Aim vertically below the CURRENT feet after takeoff. Reusing a grounded
    // aim or aiming behind the player moves the impact away from the launch.
    await bot.lookAt(bot.entity.position.offset(0, -1, 0), true);
    if (!current(revision) || state !== action) return;
    if (bot.entity.onGround || bot.entity.velocity.y <= 0) return abortLaunch();
    // physicsTick precedes Mineflayer's movement publication. Send the observed
    // jump position and downward view before use_item so the server sees the
    // same jump -> throw order, not a throw from the old grounded position.
    flushLook(true);
    bot.activateItem(false);
    bot.deactivateItem();
    nextWindAt = now() + 500;
    action.phase = "burst";
    action.started = now();
    action.peak = Math.max(action.peak, bot.entity.position.y);
    action.lastVy = bot.entity.velocity.y;
    action.unboostedPeak = bot.entity.position.y;
    // Ordinary ballistic motion is not confirmation of a wind jump. The peak
    // fallback also detects a boost if a slow inventory operation skipped ticks.
    for (let vy = action.lastVy, tick = 0; vy > 0 && tick < 60; tick++, vy = (vy - 0.08) * 0.98)
      action.unboostedPeak += vy;
    await equipMace(revision);
  }
  function steer() {
    const motion = bot.tracker?.getEntitySpeed(target) ?? target.velocity ?? new Vec3(0, 0, 0);
    const delta = target.position.plus(motion.scaled(3)).minus(bot.entity.position);
    const distance = Math.hypot(delta.x, delta.z);
    const velocity = bot.entity.velocity;
    const overshooting = velocity.x * delta.x + velocity.z * delta.z > distance * 0.35;
    bot.setControlState("forward", distance > 0.65 && !overshooting);
    bot.setControlState("back", distance < 1.5 && overshooting);
    bot.setControlState("sprint", false);
  }
  async function flight(revision) {
    const action = state;
    const point = maceAttackPoint(bot, target, settings.attackRange);
    await bot.lookAt(point ?? target.position.offset(0, (target.height ?? 1.8) * 0.8, 0), true);
    if (!current(revision) || state !== action) return;
    steer();
    const smash =
      !bot.entity.onGround &&
      bot.entity.velocity.y < -0.05 &&
      action.peak - bot.entity.position.y > 1.5 &&
      !bot.entity.elytraFlying &&
      !bot.entity.isInWater &&
      !bot.entity.isInLava;
    if (!point || !smash || bot.heldItem?.name !== "mace" || now() < Math.max(retryAt, nextCpsAt))
      return;
    const hitPoint = maceAttackPoint(bot, target, settings.attackRange);
    if (!hitPoint) return;
    await bot.lookAt(hitPoint, true);
    if (
      !current(revision) ||
      state !== action ||
      !maceAttackPoint(bot, target, settings.attackRange)
    )
      return;
    // A shielded hit is not a successful combo. Let the grounded axe controller
    // break the shield instead of consuming another charge into the block.
    if (targetBlocking(bot, target)) return;
    if (random() * 100 >= settings.meleeSkill) {
      retryAt = now() + 50;
      return;
    }
    flushLook();
    action.phase = "confirm";
    action.hitAt = now();
    action.confirmed = false;
    nextAttackAt = now() + Math.max(1000 / 0.6, 1000 / settings.cps);
    nextCpsAt = now() + 1000 / settings.cps;
    bot.attack(target);
    controlsOff();
  }
  function hurt(entity) {
    if (
      entity?.id !== target?.id ||
      state?.phase !== "confirm" ||
      now() - state.hitAt > 600 ||
      targetBlocking(bot, target)
    )
      return;
    state.confirmed = true;
    onStatus("mace: smash confirmed");
  }
  function tick() {
    if (!target) return;
    if (!current(generation)) {
      stop();
      return;
    }
    if (state?.phase === "prepare" || state?.phase === "settle" || state?.phase === "burst")
      controlsOff();
    if (busy) return;
    const entity = bot.entity,
      time = now();
    if (state) state.peak = Math.max(state.peak, entity.position.y);
    if (state?.phase === "settle") {
      beginJump();
      return;
    }
    if (state?.phase === "jump") {
      if (!entity.onGround && entity.velocity.y > 0) run(throwWind);
      else if (time - state.started > 400) {
        controlsOff();
        state = null;
        retryAt = time + 1000;
      }
      return;
    }
    if (state?.phase === "burst") {
      if (entity.onGround || time - state.started > 1000 || entity.isInWater || entity.isInLava) {
        abortLaunch();
      } else if (
        (entity.velocity.y > 0.1 && entity.velocity.y > state.lastVy + 0.08) ||
        entity.position.y > state.unboostedPeak + 0.35
      ) {
        // Keep horizontal controls released until an actual upward impulse is
        // observed, including projectile travel time and server response delay.
        state.phase = "flight";
        state.started = time;
        onStatus("mace: wind boost confirmed, tracking target");
        run(flight);
      } else state.lastVy = entity.velocity.y;
      return;
    }
    if (state?.phase === "confirm") {
      // Wind Burst is observed through real upward movement after a confirmed
      // hit. The next descent can smash again without spending a wind charge.
      if (state.confirmed && !entity.onGround && entity.velocity.y > 0.1) {
        state = { phase: "flight", peak: entity.position.y, started: time };
      } else if (entity.onGround || time - state.hitAt > 650) {
        retryAt = Math.max(retryAt, state.confirmed ? nextWindAt : time + 1000);
        state = null;
      }
      return;
    }
    if (state?.phase === "flight") {
      if (entity.onGround || time - state.started > 8000 || entity.isInWater || entity.isInLava) {
        controlsOff();
        state = null;
        retryAt = time + 500;
      } else run(flight);
      return;
    }
    if (!entity.onGround) return;
    const delta = target.position.minus(entity.position);
    if (Math.hypot(delta.x, delta.z) > 3.5 || !maceAttackPoint(bot, target, 7)) {
      approach();
      return;
    }
    if (time < retryAt) return;
    const charge = carriedItems(bot).some((item) => item.name === "wind_charge");
    if (charge && time >= nextWindAt && launchSite() && !targetBlocking(bot, target)) {
      run(prepareJump);
      return;
    }
    // Grounded mace remains usable when there are no charges or no headroom.
    // Its ordinary attack uses the full 0.6 attack speed cooldown.
    run(async (revision) => {
      if (approaching) {
        await bot.pathfinder.stop();
        approaching = false;
      }
      if (!current(revision)) return;
      controlsOff();
      await equipMace(revision);
      if (!current(revision)) return;
      const point = maceAttackPoint(bot, target, settings.attackRange);
      if (!point) {
        approach();
        return;
      }
      await bot.lookAt(point, true);
      if (
        !current(revision) ||
        now() < nextAttackAt ||
        targetBlocking(bot, target) ||
        !maceAttackPoint(bot, target, settings.attackRange)
      )
        return;
      if (random() * 100 >= settings.meleeSkill) {
        retryAt = now() + 50;
        return;
      }
      if (bot.usingHeldItem) bot.deactivateItem();
      flushLook();
      bot.attack(target);
      nextAttackAt = now() + Math.max(1000 / 0.6, 1000 / settings.cps);
      nextCpsAt = now() + 1000 / settings.cps;
    });
  }
  bot.on("entityHurt", hurt);
  return {
    available,
    canLaunch: () => bot.entity.onGround && now() >= retryAt && now() >= nextWindAt && launchSite(),
    start,
    stop,
    tick,
    get active() {
      return Boolean(target);
    },
    get airborne() {
      return Boolean(state);
    },
    // MLG can acquire the hand at the start of descent. Predict the upcoming
    // reach window so it doesn't cancel a valid high jump before we get close.
    // A miss, shield, wall or distant target still yields rescue.
    get imminentSmash() {
      if (
        state?.phase !== "flight" ||
        !target ||
        settings.meleeSkill === 0 ||
        bot.heldItem?.name !== "mace" ||
        targetBlocking(bot, target)
      )
        return false;
      if (bot.entity.velocity.y >= 0) return false;
      let position = bot.entity.position.clone(),
        velocity = bot.entity.velocity.clone();
      for (let tick = 0; tick < 16; tick++) {
        if (
          state.peak - position.y > 1.5 &&
          maceAttackPoint(bot, target, settings.attackRange, position)
        )
          return true;
        const length = velocity.norm();
        if (length > 0.01 && bot.world?.raycast(position, velocity.scaled(1 / length), length))
          break;
        position = position.plus(velocity);
        velocity = velocity.scaled(0.98).offset(0, -0.0784, 0);
      }
      return false;
    },
    get task() {
      return task;
    },
    dispose() {
      stop();
      bot.off("entityHurt", hurt);
    },
  };
}

module.exports = { createMaceCombat, maceAttackPoint };
