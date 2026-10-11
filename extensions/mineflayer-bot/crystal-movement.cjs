const { Vec3 } = require("vec3");

const hazardous = (block) =>
  /water|lava|fire|cactus|magma|campfire|sweet_berry/.test(block?.name ?? "");
const clear = (block) => block?.boundingBox === "empty" && !hazardous(block);

// Ground height, including slabs/steps. Unknown columns, water and drops larger
// than one block belong to the pathfinder rather than blind combat movement.
function groundAt(bot, point) {
  if (!bot.blockAt) return null;
  const bottom = Math.floor(point.y);
  for (let y = bottom + 1; y >= bottom - 2; y--) {
    const block = bot.blockAt(new Vec3(point.x, y, point.z));
    if (!block) return null;
    if (block.boundingBox !== "block" || hazardous(block)) continue;
    const top = y + Math.max(...(block.shapes ?? [[0, 0, 0, 1, 1, 1]]).map((shape) => shape[4]));
    if (top > point.y + 1.1 || top < point.y - 1.1) continue;
    const foot = new Vec3(point.x, top, point.z);
    if ([0.05, 0.9, 1.75].every((dy) => clear(bot.blockAt(foot.offset(0, dy, 0))))) return foot;
  }
  return null;
}

function walkSegment(bot, destination, range = 0, maxDistance = Infinity) {
  if (!bot.setControlState || !bot.blockAt) return null;
  const start = bot.entity.position,
    delta = destination.minus(start);
  const length = Math.hypot(delta.x, delta.z);
  if (length < 0.01) return { jump: false };
  const direction = delta.scaled(1 / length);
  const half = (bot.entity.width ?? 0.6) / 2 + 0.05;
  const travel = Math.min(maxDistance, Math.max(0.3, length - range + 0.3));
  let height = start.y,
    jump = false;
  for (let distance = 0.3; distance <= travel + 0.01; distance += 0.3) {
    const across = [];
    for (const side of [-half, 0, half]) {
      const point = start.offset(
        direction.x * distance - direction.z * side,
        height - start.y,
        direction.z * distance + direction.x * side,
      );
      const ground = groundAt(bot, point);
      if (!ground) return null;
      across.push(ground.y);
    }
    const next = Math.max(...across);
    if (Math.max(...across) - Math.min(...across) > 1.01 || Math.abs(next - height) > 1.1)
      return null;
    if (next > start.y + 0.4 && distance < 1.2) jump = true;
    height = next;
  }
  return { jump };
}

function createCrystalMovement(bot, { now = Date.now } = {}) {
  let goal = null,
    walking = false,
    revision = 0,
    stopping = null;
  let routeUntil = 0;

  function release() {
    walking = false;
    bot.clearControlStates();
  }
  function cancel() {
    revision++;
    goal = null;
    release();
  }
  function stop() {
    cancel();
    return bot.pathfinder.stop();
  }
  function setGoal(entity, range, reason = "approach") {
    if (goal?.entity !== entity || goal.range !== range) {
      revision++;
      walking = false;
      routeUntil = 0;
    }
    goal = { entity, range, reason };
    return tick();
  }
  async function tick() {
    if (!goal || bot.launcherDefendingBow || bot.launcherPearling) return;
    const current = goal,
      rev = revision;
    const delta = current.entity.position.minus(bot.entity.position);
    const distance = Math.hypot(delta.x, delta.z);
    const segment = distance <= 16 && walkSegment(bot, current.entity.position, current.range, 1.5);
    if (!segment || now() < routeUntil) {
      if (walking) release();
      if (!segment) routeUntil = now() + 600;
      bot.pathfinder.setGoal({ entity: current.entity, rangeSq: current.range * current.range });
      return;
    }
    if (bot.pathfinder.goal && !stopping)
      stopping = bot.pathfinder.stop().finally(() => {
        stopping = null;
      });
    if (stopping) await stopping;
    if (rev !== revision || goal?.entity !== current.entity || bot.launcherDefendingBow) return;
    const yaw = Math.atan2(-delta.x, -delta.z);
    const turn = Math.atan2(Math.sin(yaw - bot.entity.yaw), Math.cos(yaw - bot.entity.yaw));
    // Turn to the travel direction, then use forward. Retreats are deliberate
    // walks to one fixed waypoint, never rapid forward/back velocity braking.
    await bot.look(bot.entity.yaw + Math.max(-0.4, Math.min(0.4, turn)), 0, true);
    if (rev !== revision || goal?.entity !== current.entity) return;
    walking = distance > current.range + (walking ? 0 : 0.45);
    const forward = walking && Math.abs(turn) < 0.65;
    for (const control of ["back", "left", "right", "sneak"]) bot.setControlState(control, false);
    bot.setControlState("forward", forward);
    bot.setControlState("jump", forward && segment.jump && bot.entity.onGround);
    bot.setControlState(
      "sprint",
      forward &&
        distance > current.range + 2 &&
        !segment.jump &&
        bot.pathfinder.defaultMoveSettings?.allowSprinting !== false,
    );
  }
  return {
    setGoal,
    stop,
    cancel,
    tick,
    get goal() {
      return goal;
    },
  };
}

module.exports = { groundAt, walkSegment, createCrystalMovement };
