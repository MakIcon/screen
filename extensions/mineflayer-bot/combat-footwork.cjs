const { walkSegment } = require("./crystal-movement.cjs");

// Short, checked movement on open ground. The existing navigator owns walls,
// water, gaps and elevation changes; sideways movement never delays pursuit.
function createCombatFootwork(bot, settings, { now = Date.now, onError = () => {} } = {}) {
  let side = "left",
    nextSideAt = 0,
    stopping = null,
    revision = 0,
    lastHit = -Infinity;
  let routeUntil = 0,
    direct = false,
    obstacleJump = false;
  function reset() {
    revision++;
    direct = false;
    routeUntil = 0;
    nextSideAt = 0;
    lastHit = -Infinity;
    obstacleJump = false;
  }
  function tick(target, decision) {
    if (!target || !bot.setControlState || !bot.blockAt) return false;
    if (bot.launcherDefendingBow || bot.launcherPearling || bot.launcherSurvival?.busy) return true;
    const position = bot.entity.position,
      delta = target.position.minus(position);
    const distance = Math.hypot(delta.x, delta.z);
    const segment =
      distance <= 16 &&
      !bot.entity.isInWater &&
      !bot.entity.isInLava &&
      Math.abs(delta.y) < 0.6 &&
      walkSegment(bot, target.position, 1.8, 1.2);
    if (!segment || now() < routeUntil) {
      if (!segment) routeUntil = now() + 300;
      if (direct) {
        for (const key of ["forward", "left", "right", "back", "sprint"])
          bot.setControlState(key, false);
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
    const yaw = Math.atan2(-delta.x, -delta.z);
    const turn = Math.atan2(Math.sin(yaw - bot.entity.yaw), Math.cos(yaw - bot.entity.yaw));
    const pressing = distance > Math.min(2.1, settings.attackRange - 0.25);
    const tap = now() - lastHit < 50 && settings.sprintTap !== "off";
    bot.setControlState("back", false);
    bot.setControlState(
      "forward",
      pressing && Math.abs(turn) < 0.65 && !(tap && settings.sprintTap === "wtap"),
    );
    bot.setControlState(
      "sprint",
      pressing &&
        !tap &&
        !bot.launcherAxeAttacking &&
        bot.pathfinder.defaultMoveSettings?.allowSprinting !== false,
    );
    const jump = segment.jump && pressing && bot.entity.onGround;
    if (jump || obstacleJump) bot.setControlState("jump", Boolean(jump));
    obstacleJump = Boolean(jump);
    const strafe =
      settings.strafe !== "off" &&
      distance < settings.attackRange + 0.5 &&
      distance > 1.2 &&
      Math.abs(turn) < 0.4 &&
      decision?.action !== "finish";
    if (now() >= nextSideAt) {
      if (settings.strafe !== "circle") side = side === "left" ? "right" : "left";
      nextSideAt = now() + 550;
    }
    // Check the actual diagonal input corridor, including the player's width.
    const sign = side === "left" ? -1 : 1;
    const forward = pressing ? 0.8 : 0;
    const point = position.offset(
      -Math.sin(bot.entity.yaw) * forward + Math.cos(bot.entity.yaw) * sign,
      0,
      -Math.cos(bot.entity.yaw) * forward - Math.sin(bot.entity.yaw) * sign,
    );
    const safe = strafe && walkSegment(bot, point, 0, 1.2);
    bot.setControlState("left", Boolean(safe && side === "left"));
    bot.setControlState("right", Boolean(safe && side === "right"));
    return true;
  }
  return {
    tick,
    reset,
    attacked() {
      lastHit = now();
    },
  };
}

module.exports = { createCombatFootwork };
