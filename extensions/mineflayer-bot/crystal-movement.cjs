const { Vec3 } = require("vec3");

const hazardous = (block) =>
  /water|lava|fire|cactus|magma|campfire|sweet_berry/.test(block?.name ?? "");
const clear = (block) => block?.boundingBox === "empty" && !hazardous(block);

// Ground height, including slabs/steps. Unknown columns, water and drops larger
// than one block belong to the pathfinder rather than blind combat movement.
function groundAt(bot, point, blockAt = (p) => bot.blockAt(p)) {
  if (!bot.blockAt) return null;
  const bottom = Math.floor(point.y);
  for (let y = bottom + 1; y >= bottom - 2; y--) {
    const block = blockAt(new Vec3(point.x, y, point.z));
    if (!block) return null;
    if (block.boundingBox !== "block" || hazardous(block)) continue;
    const top = y + Math.max(...(block.shapes ?? [[0, 0, 0, 1, 1, 1]]).map((shape) => shape[4]));
    if (top > point.y + 1.1 || top < point.y - 1.1) continue;
    const foot = new Vec3(point.x, top, point.z);
    if ([0.05, 0.9, 1.75].every((dy) => clear(blockAt(foot.offset(0, dy, 0))))) return foot;
  }
  return null;
}

function walkSegment(
  bot,
  destination,
  range = 0,
  maxDistance = Infinity,
  start = bot.entity.position,
) {
  if (!bot.setControlState || !bot.blockAt) return null;
  const delta = destination.minus(start);
  const length = Math.hypot(delta.x, delta.z);
  if (length < 0.01) return { jump: false };
  const direction = delta.scaled(1 / length);
  const half = (bot.entity.width ?? 0.6) / 2 + 0.05;
  const travel = Math.min(maxDistance, Math.max(0.3, length - range + 0.3));
  // The three width samples frequently revisit the same block. Cache only for
  // this synchronous corridor check so a new obstacle is visible next tick.
  const blocks = new Map();
  const blockAt = (point) => {
    const key = `${Math.floor(point.x)},${Math.floor(point.y)},${Math.floor(point.z)}`;
    if (!blocks.has(key)) blocks.set(key, bot.blockAt(point));
    return blocks.get(key);
  };
  // Ground and headroom depend on the block column and the exact input height,
  // not the fractional X/Z sample. Reuse only inside this corridor check;
  // the next call must see newly placed blocks and removed support immediately.
  const columns = new Map();
  const groundHeight = (x, y, z) => {
    const key = `${Math.floor(x)},${y},${Math.floor(z)}`;
    let height = columns.get(key);
    if (height === undefined) {
      height = groundAt(bot, new Vec3(x, y, z), blockAt)?.y ?? null;
      columns.set(key, height);
    }
    return height;
  };
  const sides = [-half, 0, half];
  let height = start.y,
    jump = false;
  for (let distance = 0.3; distance <= travel + 0.01; distance += 0.3) {
    let low = Infinity,
      next = -Infinity;
    for (const side of sides) {
      const ground = groundHeight(
        start.x + (direction.x * distance - direction.z * side),
        start.y + (height - start.y),
        start.z + (direction.z * distance + direction.x * side),
      );
      if (ground === null) return null;
      low = Math.min(low, ground);
      next = Math.max(next, ground);
    }
    if (next - low > 1.01 || Math.abs(next - height) > 1.1) return null;
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
