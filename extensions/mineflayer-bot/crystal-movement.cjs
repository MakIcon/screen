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
    arrived = false,
    revision = 0,
    stopping = null,
    task = null,
    route = null,
    progress = null;

  function release() {
    walking = false;
    progress = null;
    bot.clearControlStates();
  }
  function cancel() {
    revision++;
    goal = null;
    route = null;
    arrived = false;
    release();
  }
  function stopRoute() {
    route = null;
    if (!stopping)
      stopping = Promise.resolve(bot.pathfinder.stop()).finally(() => {
        stopping = null;
      });
    return stopping;
  }
  async function stop() {
    const pending = task;
    const needsStop = goal || route || bot.pathfinder.goal || stopping;
    cancel();
    // A cancelled asynchronous look still changes local yaw when it resolves.
    // Placement must wait for it before taking ownership of the next aim.
    await Promise.all([pending, needsStop ? stopRoute() : null]);
    if (!goal) release();
  }
  function setGoal(entity, range, reason = "approach") {
    if (goal?.entity !== entity || goal.range !== range) {
      revision++;
      walking = false;
      arrived = false;
      progress = null;
      route = null;
    }
    goal = { entity, range, reason };
    return tick();
  }
  function tick() {
    if (task) return task;
    task = step().finally(() => {
      task = null;
    });
    return task;
  }
  async function step() {
    if (!goal || bot.launcherDefendingBow || bot.launcherPearling) return;
    const current = goal,
      rev = revision;
    const valid = () =>
      rev === revision &&
      goal?.entity === current.entity &&
      !bot.launcherDefendingBow &&
      !bot.launcherPearling;
    const delta = current.entity.position.minus(bot.entity.position);
    const distance = Math.hypot(delta.x, delta.z);
    if (distance <= current.range + (arrived ? 0.35 : 0) && Math.abs(delta.y) <= 1.1) {
      arrived = true;
      release();
      if (route || bot.pathfinder.goal) await stopRoute();
      return;
    }
    arrived = false;
    const segment = distance <= 16 && walkSegment(bot, current.entity.position, current.range, 1.5);
    const stalled =
      progress &&
      now() - progress.at >= 650 &&
      bot.entity.position.distanceTo(progress.position) < 0.12;
    if (!segment || stalled || (route && now() < route.until)) {
      if (walking || !route) release();
      if (!route || route.entity !== current.entity || route.range !== current.range) {
        route = { entity: current.entity, range: current.range, until: now() + 1800 };
        bot.pathfinder.setGoal({ entity: current.entity, rangeSq: current.range * current.range });
      }
      return;
    }
    if (route || bot.pathfinder.goal) await stopRoute();
    if (stopping) await stopping;
    if (!valid()) return;
    const yaw = Math.atan2(-delta.x, -delta.z);
    const turn = Math.atan2(Math.sin(yaw - bot.entity.yaw), Math.cos(yaw - bot.entity.yaw));
    // Turn to the travel direction, then use forward. Retreats are deliberate
    // walks to one fixed waypoint, never rapid forward/back velocity braking.
    await bot.look(bot.entity.yaw + Math.max(-0.4, Math.min(0.4, turn)), 0, true);
    if (!valid()) return;
    walking = true;
    const forward = walking && Math.abs(turn) < 0.65;
    if (!forward) progress = null;
    else if (!progress || bot.entity.position.distanceTo(progress.position) >= 0.12)
      progress = { at: now(), position: bot.entity.position.clone() };
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
    get task() {
      return task;
    },
  };
}

module.exports = { groundAt, walkSegment, createCrystalMovement };
