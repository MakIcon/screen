const { Vec3 } = require("vec3");
const { toNotchianYaw, toNotchianPitch } = require("mineflayer/lib/conversions");

const hazards = /lava|water|fire|cactus|magma|campfire|powder_snow|sweet_berry|wither_rose|portal/;
const empty = (block) => block && block.boundingBox === "empty" && !hazards.test(block.name);
const solid = (block) =>
  block &&
  !hazards.test(block.name) &&
  block.shapes?.some((s) => s[0] === 0 && s[2] === 0 && s[3] === 1 && s[5] === 1 && s[4] === 1);

function safeLanding(blockAt, point) {
  for (const x of [-0.31, 0.31])
    for (const z of [-0.31, 0.31]) {
      const foot = point.offset(x, 0.02, z);
      if (
        !solid(blockAt(foot.offset(0, -0.04, 0))) ||
        !empty(blockAt(foot)) ||
        !empty(blockAt(foot.offset(0, 1, 0)))
      )
        return false;
    }
  return true;
}

// A segment/slab intersection also catches pearls hitting players before terrain.
function intersectsEntity(from, to, entity) {
  const p = entity.position;
  const half = (entity.width ?? 0.6) / 2 + 0.125;
  const low = [p.x - half, p.y - 0.125, p.z - half];
  const high = [p.x + half, p.y + (entity.height ?? 1.8) + 0.125, p.z + half];
  let first = 0,
    last = 1;
  for (const [i, axis] of ["x", "y", "z"].entries()) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-8) {
      if (from[axis] < low[i] || from[axis] > high[i]) return false;
    } else {
      const a = (low[i] - from[axis]) / delta,
        b = (high[i] - from[axis]) / delta;
      first = Math.max(first, Math.min(a, b));
      last = Math.min(last, Math.max(a, b));
      if (first > last) return false;
    }
  }
  return true;
}

function simulatePearl(bot, yaw, pitch, blockAt = (p) => bot.blockAt(p)) {
  let pos = bot.entity.position.offset(0, (bot.entity.eyeHeight ?? 1.62) - 0.1, 0);
  const inherited = bot.entity.velocity ?? new Vec3(0, 0, 0);
  let velocity = new Vec3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  )
    .scaled(1.5)
    .plus(new Vec3(inherited.x, bot.entity.onGround ? 0 : inherited.y, inherited.z));
  const entities = Object.values(bot.entities ?? {}).filter(
    (e) => e.id !== bot.entity.id && e.isValid !== false && e.position && e.height > 0,
  );
  for (let ticks = 1; ticks <= 120; ticks++) {
    const next = pos.plus(velocity);
    const length = velocity.norm();
    const hit = bot.world.raycast(pos, velocity.scaled(1 / length), length);
    const end = hit?.intersect ?? next;
    // Unknown chunks and liquid change the physics: discard these trajectories.
    for (let f = 0; f <= 1; f += 0.25) {
      const b = blockAt(pos.plus(end.minus(pos).scaled(f)));
      if (!b || hazards.test(b.name)) return null;
    }
    if (entities.some((e) => intersectsEntity(pos, end, e))) return null;
    if (hit) {
      if (hit.face !== 1 || !hit.intersect || !safeLanding(blockAt, hit.intersect)) return null;
      return { yaw, pitch, ticks, landing: hit.intersect.clone() };
    }
    pos = next;
    velocity = velocity.scaled(0.99).offset(0, -0.03, 0);
  }
  return null;
}

function planPearl(bot, destination, settings, radius = 2) {
  if (!bot.world?.raycast || !bot.blockAt || !destination) return null;
  const from = bot.entity.position;
  const remaining = from.distanceTo(destination);
  if (remaining <= Math.max(radius + 2, settings.pearlMinDistance)) return null;
  const offset = destination.minus(from);
  const yaw = Math.atan2(-offset.x, -offset.z);
  const cache = new Map();
  const blockAt = (p) => {
    const key = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
    if (!cache.has(key)) cache.set(key, bot.blockAt(p));
    return cache.get(key);
  };
  let best = null;
  // Search both flat and lobbed throws, then verify each segment in the world.
  for (const turn of [0, -0.035, 0.035])
    for (let angle = -24; angle <= 72; angle += 3) {
      const shot = simulatePearl(bot, yaw + turn, (angle * Math.PI) / 180, blockAt);
      if (!shot) continue;
      const travel = from.distanceTo(shot.landing);
      const after = shot.landing.distanceTo(destination);
      const progress = remaining - after;
      if (
        travel > settings.pearlMaxDistance ||
        progress < settings.pearlMinDistance ||
        after > remaining - 3
      )
        continue;
      // Prefer progress, then a shorter flight. Never overshoot into a worse route.
      const score = progress - shot.ticks * 0.025;
      if (!best || score > best.score) best = { ...shot, score };
    }
  return best;
}

const { equipCombatItem } = require("./combat-inventory.cjs");

function createTravelController(
  bot,
  settings,
  { now = Date.now, onStatus = () => {}, onError = () => {}, onFinished = () => {} } = {},
) {
  let active = null,
    generation = 0,
    walkRevision = 0,
    busy = false;
  let waiting = null,
    nextPearlAt = 0,
    nextPlanAt = 0,
    disposed = false;
  let itemTask = Promise.resolve();
  let defensePaused = false;
  bot.launcherPauseTravelForDefense = () => {
    defensePaused = true;
    walkRevision++;
  };
  bot.launcherResumeTravelAfterDefense = () => {
    defensePaused = false;
    if (active && !waiting && !disposed && bot.health > 0) walk(active, generation);
  };
  const valid = (task, rev) => !disposed && active === task && generation === rev && bot.health > 0;
  function walk(task, rev) {
    if (defensePaused) return;
    const walkId = ++walkRevision;
    void bot.pathfinder
      .goto(task.goal)
      .then(() => {
        if (!valid(task, rev) || walkId !== walkRevision) return;
        active = null;
        onFinished(task.label);
      })
      .catch((error) => {
        if (!valid(task, rev) || walkId !== walkRevision) return;
        active = null;
        onError(error);
      });
  }
  function stop() {
    generation++;
    walkRevision++;
    active = null;
    waiting = null;
    return itemTask;
  }
  function start(goal, destination, kind, label, radius) {
    stop();
    const task = { goal, destination, kind, label, radius, throws: 0 };
    active = task;
    const rev = generation;
    void Promise.all([bot.pathfinder.stop(), itemTask, bot.launcherCombat?.idleTask])
      .then(() => {
        if (valid(task, rev)) walk(task, rev);
      })
      .catch(onError);
  }
  function hasPearls() {
    return (
      bot.inventory
        .items()
        .filter((i) => i.name === "ender_pearl")
        .reduce((sum, i) => sum + (i.count ?? 1), 0) > settings.pearlReserve
    );
  }
  async function throwPearl(task, rev, shot) {
    walkRevision++;
    await bot.pathfinder.stop();
    if (!valid(task, rev)) return;
    bot.clearControlStates();
    const previous = bot.heldItem;
    const pearl = bot.inventory.items().find((i) => i.name === "ender_pearl");
    try {
      await equipCombatItem(
        bot,
        pearl,
        "hand",
        () => valid(task, rev) && !bot.launcherDefendingBow,
      );
      if (!valid(task, rev) || bot.launcherDefendingBow) return;
      // The bot stopped moving while equipping; recompute with its current velocity.
      shot = planPearl(bot, task.destination(), settings, task.radius);
      if (!shot || !hasPearls() || bot.health < settings.pearlMinHealth) {
        walk(task, rev);
        return;
      }
      await bot.look(shot.yaw, shot.pitch, true);
      if (!valid(task, rev) || bot.launcherDefendingBow) return;
      if (bot.health < settings.pearlMinHealth) {
        walk(task, rev);
        return;
      }
      // Flush the normal look packet before use, including the 26.1 flags.
      if (bot._client?.state === "play")
        bot._client.write("look", {
          yaw: Math.fround(toNotchianYaw(shot.yaw)),
          pitch: Math.fround(toNotchianPitch(shot.pitch)),
          onGround: Boolean(bot.entity.onGround),
          flags: {
            onGround: Boolean(bot.entity.onGround),
            hasHorizontalCollision: Boolean(bot.entity.isCollidedHorizontally),
          },
        });
      waiting = {
        from: bot.entity.position.clone(),
        landing: shot.landing,
        until: now() + shot.ticks * 50 + 2500,
        task,
        rev,
      };
      nextPearlAt = now() + settings.pearlCooldownMs;
      bot.activateItem();
      bot.deactivateItem();
      task.throws++;
      onStatus(`pearl ${task.kind}: ${Math.round(waiting.from.distanceTo(shot.landing))} blocks`);
    } finally {
      // Do not restore an old item over a new combat/movement command.
      if (
        previous &&
        valid(task, rev) &&
        bot.heldItem?.name === "ender_pearl" &&
        !bot.launcherDefendingBow
      )
        await equipCombatItem(
          bot,
          previous,
          "hand",
          () => valid(task, rev) && !bot.launcherDefendingBow,
        );
    }
  }
  function tick() {
    if (!active || disposed || busy || defensePaused || bot.health <= 0) return;
    const task = active,
      rev = generation;
    if (!task.destination()) {
      stop();
      void bot.pathfinder.stop();
      return;
    }
    if (waiting) {
      if (
        (bot.entity.position.distanceTo(waiting.landing) <= 3 &&
          bot.entity.position.distanceTo(waiting.from) > 3) ||
        now() >= waiting.until
      ) {
        const timeout = now() >= waiting.until;
        waiting = null;
        if (timeout) nextPearlAt = now() + Math.max(settings.pearlCooldownMs, 5000);
        walk(task, rev);
      }
      return;
    }
    if (
      !settings.pearlEnabled ||
      !settings[`pearl${task.kind[0].toUpperCase()}${task.kind.slice(1)}`] ||
      (!settings.pearlChain && task.throws > 0) ||
      !hasPearls() ||
      bot.usingHeldItem ||
      bot.launcherDefendingBow ||
      bot.health < settings.pearlMinHealth ||
      now() < nextPearlAt ||
      now() < nextPlanAt
    )
      return;
    nextPlanAt = now() + 750;
    const shot = planPearl(bot, task.destination(), settings, task.radius);
    if (!shot) return;
    busy = true;
    bot.launcherPearling = true;
    itemTask = throwPearl(task, rev, shot)
      .catch((error) => {
        if (valid(task, rev)) {
          waiting = null;
          nextPearlAt = now() + 5000;
          walk(task, rev);
          onError(error);
        }
      })
      .finally(() => {
        busy = false;
        bot.launcherPearling = false;
      });
  }
  bot.on("physicsTick", tick);
  const cancel = () => {
    stop();
    void bot.pathfinder.stop();
  };
  bot.on("death", cancel);
  return {
    start,
    stop,
    get waiting() {
      return Boolean(waiting);
    },
    dispose() {
      disposed = true;
      stop();
      bot.off("physicsTick", tick);
      bot.off("death", cancel);
      delete bot.launcherPauseTravelForDefense;
      delete bot.launcherResumeTravelAfterDefense;
    },
  };
}

module.exports = {
  safeLanding,
  intersectsEntity,
  simulatePearl,
  planPearl,
  createTravelController,
};
