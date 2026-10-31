const { Vec3 } = require("vec3");
const { walkSegment } = require("./crystal-movement.cjs");
const { targetBlocking } = require("./melee-shield.cjs");

// A sprint jump covers about this distance before landing (12 ticks in air).
const JUMP_RUN = 4.3;
const JUMP_TICKS = 12;
const GROUND_DRAG = 0.546;

// Ground beneath an airborne entity. Knockback lifts a player more than a block;
// that height is not a terrain step and must not hand the chase to the navigator.
// Mineflayer does not track onGround for other entities, so the caller passes
// whether the height changed since the previous tick. Each hitbox corner is
// checked: a player standing on a block edge keeps its own height.
function groundBelow(bot, entity, airborne = true) {
  const { x, y, z } = entity.position;
  if (!airborne) return y;
  const half = (entity.width ?? 0.6) / 2 - 0.01;
  let ground = null;
  for (const [dx, dz] of [
    [0, 0],
    [-half, -half],
    [-half, half],
    [half, -half],
    [half, half],
  ]) {
    for (let level = Math.floor(y); level >= Math.floor(y) - 4; level--) {
      const block = bot.blockAt(new Vec3(x + dx, level, z + dz));
      if (!block) return y;
      if (block.boundingBox !== "block") continue;
      const shapes = block.shapes?.length ? block.shapes : [[0, 0, 0, 1, 1, 1]];
      const top = level + Math.max(...shapes.map((shape) => shape[4]));
      if (top <= y + 0.01) {
        ground = Math.max(ground ?? -Infinity, top);
        break;
      }
    }
  }
  return ground ?? y;
}

// Horizontal centre distance at which a higher/lower hitbox is within `reach`
// of the eyes while standing on `ground`, or null when it cannot be reached.
function reachDistance(bot, target, ground, reach) {
  const eyes = ground + (bot.entity.eyeHeight ?? 1.62);
  const bottom = target.position.y,
    top = bottom + (target.height ?? 1.8);
  const vertical = Math.max(bottom - eyes, 0, eyes - top);
  if (vertical >= reach) return null;
  return Math.sqrt(reach * reach - vertical * vertical) + (target.width ?? 0.6) / 2;
}

// Short, checked movement on open ground. The existing navigator owns walls,
// water, gaps and elevation changes; sideways movement never delays pursuit.
function createCombatFootwork(
  bot,
  settings,
  { now = Date.now, onError = () => {}, blocking = (entity) => targetBlocking(bot, entity) } = {},
) {
  let side = "left",
    nextSideAt = 0,
    stopping = null,
    revision = 0,
    tapTicks = 0;
  let routeUntil = 0,
    direct = false,
    jumping = false,
    progress = null,
    grounded = null,
    samples = [],
    lead = null,
    recentShield = null,
    motion = new Vec3(0, 0, 0),
    hit = null;
  function reset() {
    revision++;
    direct = false;
    routeUntil = 0;
    nextSideAt = 0;
    tapTicks = 0;
    jumping = false;
    progress = null;
    grounded = null;
    samples = [];
    lead = null;
    recentShield = null;
    hit = null;
  }
  // Opponent velocity in blocks per tick from the last few observed positions.
  function observe(target) {
    const position = target.position.clone();
    const previous = samples.at(-1);
    samples = samples.filter((sample) => now() - sample.at <= 250);
    const last = samples.at(-1);
    if (previous && (previous.target !== target || position.distanceTo(previous.position) > 4)) {
      samples = [];
      hit = null;
      tapTicks = 0;
      recentShield = null;
    }
    if (targetBlocking(bot, target)) recentShield = { target, at: now() };
    samples.push({ target, position, at: now() });
    if (samples.length > 4) samples.shift();
    const first = samples[0];
    const ticks = (now() - first.at) / 50;
    return {
      velocity: ticks < 0.5 ? new Vec3(0, 0, 0) : position.minus(first.position).scaled(1 / ticks),
      airborne: Boolean(
        last && last.target === target && Math.abs(position.y - last.position.y) > 1e-3,
      ),
    };
  }
  // Backing is limited to a short, flat corridor. In particular, a one-block
  // drop that forward navigation may accept is not safe for a blind S-tap.
  function canBack(position) {
    const yaw = bot.entity.yaw;
    const end = position.offset(Math.sin(yaw) * 0.9, 0, Math.cos(yaw) * 0.9);
    if (walkSegment(bot, end, 0, 0.9, position)?.jump !== false) return false;
    const half = (bot.entity.width ?? 0.6) / 2 + 0.05;
    for (const distance of [0.3, 0.6, 0.9])
      for (const side of [-half, 0, half]) {
        const point = position.offset(
          Math.sin(yaw) * distance + Math.cos(yaw) * side,
          -0.05,
          Math.cos(yaw) * distance - Math.sin(yaw) * side,
        );
        const block = bot.blockAt(point);
        if (block?.boundingBox !== "block") return false;
        const shapes = block.shapes ?? [[0, 0, 0, 1, 1, 1]];
        const supported = shapes.some(
          (shape) =>
            point.x - Math.floor(point.x) >= shape[0] &&
            point.x - Math.floor(point.x) <= shape[3] &&
            point.z - Math.floor(point.z) >= shape[2] &&
            point.z - Math.floor(point.z) <= shape[5] &&
            Math.abs(Math.floor(point.y) + shape[4] - position.y) < 0.05,
        );
        if (!supported) return false;
      }
    return true;
  }
  function spacing(target, decision, distance, delta, ground, airborne, shielded, sprintAllowed) {
    const engine = bot.swordpvp;
    if (
      !hit ||
      hit.target !== target ||
      now() - hit.at > 750 ||
      settings.sprintTap === "off" ||
      bot.supportFeature?.("doesntHaveOffHandSlot") ||
      !bot.heldItem?.name.endsWith("_sword") ||
      bot.launcherAxeAttacking ||
      engine?.tickOverride ||
      decision?.visible === false ||
      decision?.facing === false ||
      ["finish", "punish"].includes(decision?.action) ||
      (recentShield?.target === target && now() - recentShield.at < 800) ||
      blocking(target) ||
      distance < 0.05 ||
      distance > settings.attackRange + 1
    )
      return null;
    // Low lift is a useful opening for the selected crit style. Do not trade
    // away that close pressure just to impose sword-combo spacing on every kit.
    if (settings.criticals !== "off" && target.position.y - ground.y < 0.55) return null;
    const direction = delta.scaled(1 / distance);
    const enemyGround = target.position.offset(0, ground.y - target.position.y, 0);
    // A cornered opponent cannot be comboed away. Preserve close crit pressure
    // instead of stepping back from a useful wall pin.
    if (
      walkSegment(bot, enemyGround.plus(direction.scaled(0.7)), 0, 0.7, enemyGround)?.jump !== false
    )
      return null;
    const radial = (velocity) => velocity.x * direction.x + velocity.z * direction.z;
    const horizon = Math.max(1, Math.min(4, (engine?.ticksToNextAttack ?? 0) + 1));
    const drag = airborne ? 0.91 : GROUND_DRAG;
    const enemyTravel = (1 - drag ** horizon) / (1 - drag);
    const current = Math.max(-0.6, Math.min(0.9, radial(motion)));
    // Separate the observed impulse from the pre-hit running velocity. A new
    // approach/reversal immediately replaces the old away prediction.
    const running =
      current < 0 ? current : Math.max(-0.35, Math.min(current, radial(hit.velocity)));
    const predicted = distance + running * horizon + Math.max(0, current - running) * enemyTravel;
    const ownDrag = bot.entity.onGround ? GROUND_DRAG : 0.91;
    const ownTravel = (1 - ownDrag ** horizon) / (1 - ownDrag);
    const ownVelocity = radial(bot.entity.velocity ?? new Vec3(0, 0, 0));
    const speed =
      Math.max(
        sprintAllowed && (bot.food ?? 20) > 6 ? 0.2806 : 0.2158,
        Math.min(0.6, ownVelocity),
      ) * (shielded ? 0.2 : 1);
    // Mineflayer stores velocity after drag; the next tick adds acceleration
    // before moving. Include that first input instead of reacting a tick late.
    const forward = predicted - ownVelocity * ownTravel - speed * (horizon - ownDrag * ownTravel);
    const coast = predicted - ownVelocity * ownTravel;
    const ping = Number.isFinite(bot.player?.ping) ? Math.max(0, bot.player.ping) : 100;
    const margin = 0.3 + Math.min(0.3, (ping / 1000) * Math.abs(current - ownVelocity));
    const desired = Math.max(0.5, settings.attackRange + (target.width ?? 0.6) / 2 - margin);
    // Keep a little hysteresis around the useful distance. Chasing a runner
    // must not lose a tick of forward input merely to perform a fixed W-tap.
    if (forward >= desired - 0.12 || distance > settings.attackRange + 0.15) return "forward";
    if (
      coast < desired - 0.35 &&
      distance < desired - 0.2 &&
      bot.entity.onGround &&
      hit.backTicks < 3 &&
      canBack(ground)
    ) {
      hit.backTicks++;
      return "back";
    }
    return "coast";
  }
  function tick(target, decision) {
    if (!target || !bot.setControlState || !bot.blockAt) return false;
    if (bot.launcherDefendingBow || bot.launcherPearling || bot.launcherSurvival?.busy) return true;
    const position = bot.entity.position,
      delta = target.position.minus(position);
    const observed = observe(target),
      airborne = observed.airborne;
    motion = observed.velocity;
    if (bot.entity.onGround) grounded = { y: position.y, at: now() };
    // A normal critical or pursuit jump is still the same checked ground
    // corridor. Using the rising feet as ground height used to start a route at
    // every apex.
    const shortJump =
      direct &&
      grounded &&
      now() - grounded.at < 1000 &&
      position.y >= grounded.y - 0.1 &&
      position.y <= grounded.y + 1.6;
    const groundPosition = shortJump ? position.offset(0, grounded.y - position.y, 0) : position;
    const distance = Math.hypot(delta.x, delta.z);
    const level = Math.abs(groundBelow(bot, target, airborne) - groundPosition.y) <= 1.1;
    // A player on a pillar or ledge can still be hit from below. Walk until the
    // hitbox is within reach instead of waiting for a route on top of them.
    const standoff = level
      ? 1.8
      : distance <= settings.attackRange + 6 &&
        reachDistance(bot, target, groundPosition.y, settings.attackRange - 0.35);
    const hidden = !level && distance <= standoff + 0.3 && decision?.visible === false;
    // Lead a distant runner along its observed velocity, bounded to half a second.
    const far = level && distance > settings.attackRange + 1;
    const leadTicks = far ? Math.min(10, (distance - settings.attackRange) / 0.3) : 0;
    const predicted = target.position.plus(new Vec3(motion.x, 0, motion.z).scaled(leadTicks));
    const leadSegment = leadTicks > 0 && walkSegment(bot, predicted, 1.8, 1.5, groundPosition);
    const goal = leadSegment ? predicted : target.position;
    const stop = level
      ? Math.min(2.1, settings.attackRange - 0.25)
      : Math.max(0.5, (standoff || 0) - 0.2);
    // Already close enough: no corridor is needed to stand and strike. After a
    // critical jump the bot can end up beside a cornered opponent, where a
    // corridor sample ahead would fall inside the wall behind it.
    const segment =
      standoff &&
      !hidden &&
      !bot.entity.isInWater &&
      !bot.entity.isInLava &&
      (direct && distance <= stop
        ? { jump: false }
        : direct && leadSegment
          ? leadSegment
          : walkSegment(bot, goal, standoff, direct ? 1.5 : 6, groundPosition));
    const stalled =
      progress && now() - progress.at >= 650 && position.distanceTo(progress.position) < 0.12;
    if (!segment || stalled || now() < routeUntil) {
      // Give the route enough time to clear a corner before reclaiming it.
      if ((direct && !segment) || stalled) routeUntil = now() + 1800;
      progress = null;
      lead = null;
      if (direct) {
        for (const key of ["forward", "left", "right", "back", "sprint"])
          bot.setControlState(key, false);
        if (jumping) bot.setControlState("jump", false);
        jumping = false;
        direct = false;
      }
      return false;
    }
    if (bot.pathfinder.goal && !stopping) {
      const rev = revision;
      stopping = bot.pathfinder
        .stop()
        .catch(onError)
        .finally(() => {
          stopping = null;
          if (rev === revision) bot.swordpvp.targetGoal = undefined;
        });
    }
    if (stopping) return true;
    direct = true;
    lead = goal === target.position ? null : goal;
    const heading = goal.minus(position);
    const yaw = Math.atan2(-heading.x, -heading.z);
    const turn = Math.atan2(Math.sin(yaw - bot.entity.yaw), Math.cos(yaw - bot.entity.yaw));
    const committed = bot.launcherAxeAttacking;
    const shielding = bot.usingHeldItem && bot.inventory?.slots?.[45]?.name === "shield";
    let pressing = !(committed && !bot.entity.onGround) && distance > stop;
    // Reset sprint on the tick after every hit, so the server sees the next
    // charged hit as a sprint hit again. A time window missed most 50 ms ticks.
    const tap = tapTicks > 0 && settings.sprintTap !== "off";
    if (tapTicks > 0) tapTicks--;
    const sprintAllowed = bot.pathfinder.defaultMoveSettings?.allowSprinting !== false;
    const correction =
      level && segment.jump === false && Math.abs(turn) < 0.4
        ? spacing(
            target,
            decision,
            distance,
            delta,
            groundPosition,
            airborne,
            shielding,
            sprintAllowed,
          )
        : null;
    if (correction) pressing = correction === "forward";
    const movingForward =
      pressing && Math.abs(turn) < 0.65 && !(tap && settings.sprintTap === "wtap" && !correction);
    // Custom PvP releases sprint for a critical whenever a ready attack meets a
    // fast fall. Agree with it instead of toggling sprint twice per tick.
    const engine = bot.swordpvp;
    const critRelease =
      engine?.ticksToNextAttack <= -1 && !engine.tickOverride && bot.entity.velocity.y <= -0.25;
    bot.setControlState("back", correction === "back");
    bot.setControlState("forward", movingForward);
    if (!movingForward) progress = null;
    else if (!progress || position.distanceTo(progress.position) >= 0.12)
      progress = { at: now(), position: position.clone() };
    bot.setControlState(
      "sprint",
      movingForward && !tap && !critRelease && !bot.launcherAxeAttacking && sprintAllowed,
    );
    // Our hit adds knockback that decays: about 1.2 ticks of travel on the
    // ground (×0.546 per tick), about 5 while still airborne (×0.91). The
    // opponent's own running speed is the one observed before that hit.
    const radial = (v) => (distance > 0.01 ? (v.x * delta.x + v.z * delta.z) / distance : 0);
    const before = hit && now() - hit.at < 600 ? hit.velocity : null;
    const knockback = before
      ? Math.max(0, radial(motion) - radial(before)) * (airborne ? 5 : 1.2)
      : 0;
    const landing = distance - JUMP_RUN + radial(before ?? motion) * JUMP_TICKS + knockback;
    // Sprint jumps are about a quarter faster than sprinting on open ground once
    // running (a jump from a standstill is slower). Jump only when the landing
    // stays short of the opponent and the flight corridor is flat, supported
    // and hazard free.
    const pursuitJump =
      level &&
      pressing &&
      !tap &&
      !committed &&
      sprintAllowed &&
      bot.pathfinder.defaultMoveSettings?.allowJumpSprint !== false &&
      (bot.food ?? 20) > 6 &&
      bot.entity.onGround &&
      bot.getControlState?.("sprint") &&
      Math.hypot(bot.entity.velocity.x, bot.entity.velocity.z) >= 0.13 &&
      Math.abs(turn) < 0.3 &&
      distance > settings.attackRange + 0.3 &&
      landing >= 1.2 &&
      walkSegment(bot, goal, 0, Math.min(JUMP_RUN + 0.6, distance), groundPosition)?.jump === false;
    const jump = pressing && bot.entity.onGround && (segment.jump || pursuitJump);
    if (jump || jumping) bot.setControlState("jump", Boolean(jump));
    jumping = Boolean(jump);
    // Strafing dodges the opponent's aim. Skip it when the opponent cannot hit
    // back: it is eating, drinking or drawing a bow ("punish"), or faces away.
    const strafe =
      settings.strafe !== "off" &&
      !correction &&
      level &&
      decision?.facing !== false &&
      !committed &&
      !shielding &&
      !blocking(target) &&
      distance < settings.attackRange + 0.5 &&
      distance > 1.2 &&
      Math.abs(turn) < 0.4 &&
      !["finish", "punish"].includes(decision?.action);
    if (now() >= nextSideAt) {
      if (settings.strafe !== "circle") side = side === "left" ? "right" : "left";
      nextSideAt = now() + 550;
    }
    // Check the actual diagonal input corridor, including the player's width.
    let safe = false;
    if (strafe) {
      const sign = side === "left" ? -1 : 1;
      const forward = pressing ? 0.8 : 0;
      const point = position.offset(
        -Math.sin(bot.entity.yaw) * forward + Math.cos(bot.entity.yaw) * sign,
        0,
        -Math.cos(bot.entity.yaw) * forward - Math.sin(bot.entity.yaw) * sign,
      );
      safe = walkSegment(bot, point, 0, 1.2);
    }
    bot.setControlState("left", Boolean(safe && side === "left"));
    bot.setControlState("right", Boolean(safe && side === "right"));
    return true;
  }
  return {
    tick,
    reset,
    attacked(target, reason) {
      tapTicks = 1;
      hit = {
        target,
        at: now(),
        velocity: motion.clone(),
        backTicks: 0,
      };
      if (reason === "disableshield") hit = null;
    },
    // Point to face while closing distance on a runner; null means the target.
    get lead() {
      return direct ? lead : null;
    },
  };
}

module.exports = { createCombatFootwork, groundBelow, reachDistance };
