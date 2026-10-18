const { Vec3 } = require("vec3");
const { toNotchianYaw, toNotchianPitch, fromNotchianPitch } = require("mineflayer/lib/conversions");

const hazards = /lava|water|fire|cactus|magma|campfire|powder_snow|sweet_berry|wither_rose|portal/;
const empty = (block) => block && block.boundingBox === "empty" && !hazards.test(block.name);
const solid = (block) =>
  block &&
  !hazards.test(block.name) &&
  block.shapes?.some((s) => s[0] === 0 && s[2] === 0 && s[3] === 1 && s[5] === 1 && s[4] === 1);

function pearlOrigin(entity, registry) {
  // Mineflayer still reports standing eye height for the swimming pose.
  const pose = registry?.version?.[">="]?.("1.14") ? entity.metadata?.[6] : undefined;
  const eyes = pose === 3 || pose === "swimming" ? 0.4 : (entity.eyeHeight ?? 1.62);
  return entity.position.offset(0, eyes - 0.1, 0);
}

function modernPearlPhysics(bot) {
  return bot.registry?.version?.[">="]?.("1.21.2") ?? false;
}

function waterAt(block) {
  return (
    /^(water|flowing_water)$/.test(block?.name ?? "") ||
    block?.getProperties?.().waterlogged === true
  );
}

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
function entityBounds(entity) {
  const p = entity.position;
  const half = (entity.width ?? 0.6) / 2 + 0.125;
  return {
    low: [p.x - half, p.y - 0.125, p.z - half],
    high: [p.x + half, p.y + (entity.height ?? 1.8) + 0.125, p.z + half],
  };
}

function intersectsBounds(from, to, { low, high }) {
  // Most arena entities are nowhere near this segment. Reject them before
  // divisions and slab tests; bounds are built once for the entire arc search.
  if (
    (from.x < low[0] && to.x < low[0]) ||
    (from.x > high[0] && to.x > high[0]) ||
    (from.y < low[1] && to.y < low[1]) ||
    (from.y > high[1] && to.y > high[1]) ||
    (from.z < low[2] && to.z < low[2]) ||
    (from.z > high[2] && to.z > high[2])
  )
    return false;
  let first = 0,
    last = 1;
  for (let i = 0; i < 3; i++) {
    const axis = i === 0 ? "x" : i === 1 ? "y" : "z";
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

function intersectsEntity(from, to, entity) {
  return intersectsBounds(from, to, entityBounds(entity));
}

function flightContext(bot, ownerId) {
  return {
    modern: modernPearlPhysics(bot),
    entities: Object.values(bot.entities ?? {})
      .filter(
        (e) =>
          e.id !== ownerId &&
          e.isValid !== false &&
          e.position &&
          e.height > 0 &&
          !/pearl/i.test(e.name ?? ""),
      )
      .map(entityBounds),
    origin: bot.entity?.position ? pearlOrigin(bot.entity, bot.registry) : null,
    inherited: bot.entity?.velocity ?? new Vec3(0, 0, 0),
  };
}

function crossesHorizontal(origin, velocity, { low, high }) {
  let first = 0,
    last = 120;
  // Drag only shrinks horizontal velocity; the complete flight stays on this
  // segment even in water. Vertical motion still uses the full slab test.
  for (const i of [0, 2]) {
    const axis = i === 0 ? "x" : "z";
    if (velocity[axis] === 0) {
      if (origin[axis] < low[i] || origin[axis] > high[i]) return false;
    } else {
      const a = (low[i] - origin[axis]) / velocity[axis];
      const b = (high[i] - origin[axis]) / velocity[axis];
      first = Math.max(first, Math.min(a, b));
      last = Math.min(last, Math.max(a, b));
      if (first > last) return false;
    }
  }
  return true;
}

function simulatePearl(
  bot,
  yaw,
  pitch,
  blockAt = (p) => bot.blockAt(p),
  context = flightContext(bot, bot.entity.id),
) {
  const pos = context.origin;
  const inherited = context.inherited;
  const velocity = new Vec3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  )
    .scaled(1.5)
    .plus(new Vec3(inherited.x, bot.entity.onGround ? 0 : inherited.y, inherited.z));
  const shot = simulatePearlFlight(bot, pos, velocity, blockAt, bot.entity.id, context);
  if (!shot || shot.face !== 1 || !safeLanding(blockAt, shot.landing)) return null;
  return { ...shot, yaw, pitch };
}

function simulatePearlFlight(
  bot,
  origin,
  initialVelocity,
  blockAt = (p) => bot.blockAt(p),
  ownerId,
  context = null,
) {
  if (!bot.world?.raycast || !origin || !initialVelocity || initialVelocity.norm() < 1e-6)
    return null;
  let pos = origin.clone(),
    velocity = initialVelocity.clone();
  context ??= flightContext(bot, ownerId);
  const { modern } = context;
  const entities = context.entities.filter((bounds) =>
    crossesHorizontal(origin, initialVelocity, bounds),
  );
  for (let ticks = 1; ticks <= 120; ticks++) {
    const medium = blockAt(pos);
    if (!medium || (hazards.test(medium.name) && !waterAt(medium))) return null;
    // Since 1.21.2 gravity and drag run before movement; older pearls move first.
    const drag = waterAt(medium) ? Math.fround(0.8) : Math.fround(0.99);
    if (modern) velocity = velocity.offset(0, -0.03, 0).scaled(drag);
    const next = pos.plus(velocity);
    const length = velocity.norm();
    if (length < 1e-8) return null;
    const hit = bot.world.raycast(pos, velocity.scaled(1 / length), length);
    const end = hit?.intersect ?? next;
    const delta = end.minus(pos);
    // Water changes drag, but does not collide with the projectile.
    // The first sample is the medium already checked above. Several later
    // samples often occupy that same block: every crossed sampled cell still
    // gets checked, without allocating two vectors and reading it repeatedly.
    let lastX = Math.floor(pos.x),
      lastY = Math.floor(pos.y),
      lastZ = Math.floor(pos.z);
    for (let f = 0.25; f <= 1; f += 0.25) {
      const px = pos.x + delta.x * f,
        py = pos.y + delta.y * f,
        pz = pos.z + delta.z * f;
      const x = Math.floor(px),
        y = Math.floor(py),
        z = Math.floor(pz);
      if (x === lastX && y === lastY && z === lastZ) continue;
      lastX = x;
      lastY = y;
      lastZ = z;
      const b = blockAt(new Vec3(px, py, pz));
      if (!b || (hazards.test(b.name) && !waterAt(b))) return null;
    }
    if (entities.some((bounds) => intersectsBounds(pos, end, bounds))) return null;
    if (hit) {
      if (!hit.intersect) return null;
      return { ticks, face: hit.face, landing: hit.intersect.clone() };
    }
    pos = next;
    if (!modern) velocity = velocity.scaled(drag).offset(0, -0.03, 0);
  }
  return null;
}

function planPearl(bot, destination, settings, radius = 2, exact = false) {
  if (!bot.world?.raycast || !bot.blockAt || !destination) return null;
  const from = bot.entity.position;
  const remaining = from.distanceTo(destination);
  const minDistance = exact ? 4 : settings.pearlMinDistance;
  if (remaining <= Math.max(radius + 2, minDistance)) return null;
  const offset = destination.minus(from);
  const yaw = Math.atan2(-offset.x, -offset.z);
  const cache = new Map();
  const context = flightContext(bot, bot.entity.id);
  const tried = new Set();
  const blockAt = (p) => {
    const key = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
    if (!cache.has(key)) cache.set(key, bot.blockAt(p));
    return cache.get(key);
  };
  let best = null;
  function consider(turn, angle) {
    // Mineflayer's look() rounds both rotations to 0.15-degree increments
    // from the current view. Compare arcs at the rotation we can actually use.
    const step = fromNotchianPitch(0.15);
    const aimYaw = bot.entity.yaw + Math.round((yaw + turn - bot.entity.yaw) / step) * step;
    const aimPitch = bot.entity.pitch + Math.round((angle - bot.entity.pitch) / step) * step;
    const key = `${aimYaw},${aimPitch}`;
    if (tried.has(key)) return;
    tried.add(key);
    const shot = simulatePearl(bot, aimYaw, aimPitch, blockAt, context);
    if (!shot) return;
    const travel = from.distanceTo(shot.landing);
    const after = shot.landing.distanceTo(destination);
    const progress = remaining - after;
    // Exact pursuit must compare only arcs that land inside the target radius.
    // A farther overshoot can otherwise win on progress and discard every
    // usable arc when the swimmer's launch position has shifted sideways.
    if (exact && after > radius) return;
    if (travel > settings.pearlMaxDistance || progress < minDistance || after > remaining - 3)
      return;
    // Prefer progress, then a shorter flight. Never overshoot into a worse route.
    const score = progress - shot.ticks * 0.025;
    if (!best || score > best.score) best = { ...shot, score };
  }
  // Search both flat and lobbed throws, then refine the best safe arc.
  for (const turn of exact ? [0, -0.035, 0.035, -0.07, 0.07] : [0, -0.035, 0.035])
    for (let angle = -24; angle <= 72; angle += 3) consider(turn, (angle * Math.PI) / 180);
  if (best) {
    const pitch = best.pitch,
      turn = best.yaw - yaw;
    for (let offset = -3; offset <= 3; offset += 0.25)
      consider(turn, pitch + (offset * Math.PI) / 180);
  }
  if (exact && best?.landing.distanceTo(destination) > radius) return null;
  return best;
}

const { equipCombatItem, carriedItems } = require("./combat-inventory.cjs");

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
  let survivalPaused = false;
  bot.launcherPauseTravelForDefense = () => {
    defensePaused = true;
    walkRevision++;
  };
  bot.launcherResumeTravelAfterDefense = () => {
    defensePaused = false;
    if (active && !waiting && !disposed && bot.health > 0 && !survivalPaused)
      walk(active, generation);
  };
  const valid = (task, rev) =>
    !disposed &&
    active === task &&
    generation === rev &&
    bot.health > 0 &&
    (!task.current || task.current());
  function walk(task, rev, arrived = false) {
    if (task.kind === "chase" || task.kind === "escape") {
      active = null;
      bot.launcherPearling = false;
      task.onResult?.({ thrown: task.throws > 0, arrived });
      return;
    }
    if (defensePaused || survivalPaused) return;
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
    bot.launcherPearling = false;
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
      carriedItems(bot)
        .filter((i) => i.name === "ender_pearl")
        .reduce((sum, i) => sum + (i.count ?? 1), 0) > settings.pearlReserve
    );
  }
  function canThrow(allowUsingItem = false, combatChase = false) {
    return (
      !disposed &&
      !busy &&
      !waiting &&
      !defensePaused &&
      !survivalPaused &&
      (combatChase ? settings.enabled && settings.pearlChase : settings.pearlEnabled) &&
      hasPearls() &&
      (allowUsingItem || !bot.usingHeldItem) &&
      !bot.launcherDefendingBow &&
      bot.health >= settings.pearlMinHealth &&
      now() >= nextPearlAt
    );
  }
  function chase(destination, current, onResult) {
    if (!canThrow(true, true) || active) return false;
    const shot = planPearl(bot, destination(), settings, 2.5, true);
    if (!shot) return false;
    const task = { destination, current, onResult, kind: "chase", radius: 2.5, throws: 0 };
    active = task;
    launch(task, generation, shot);
    return true;
  }
  function escape(destination, current, onResult) {
    if (!settings.enabled || !settings.pearlEscape || !canThrow(true) || active) return false;
    const shot = planPearl(bot, destination(), settings, 2.5, true);
    if (!shot) return false;
    const task = { destination, current, onResult, kind: "escape", radius: 2.5, throws: 0 };
    active = task;
    launch(task, generation, shot);
    return true;
  }
  function plan(task) {
    return planPearl(
      bot,
      task.destination(),
      settings,
      task.radius,
      task.kind === "chase" || task.kind === "escape",
    );
  }
  async function throwPearl(task, rev, shot) {
    walkRevision++;
    if (task.kind === "chase" || task.kind === "escape") await bot.launcherCombat?.idleTask;
    await bot.pathfinder.stop();
    if (!valid(task, rev)) return;
    bot.clearControlStates();
    const previous = bot.heldItem;
    const pearl = carriedItems(bot).find((i) => i.name === "ender_pearl");
    try {
      await equipCombatItem(
        bot,
        pearl,
        "hand",
        () => valid(task, rev) && !bot.launcherDefendingBow,
      );
      if (!valid(task, rev) || bot.launcherDefendingBow) return;
      // The bot stopped moving while equipping; recompute with its current velocity.
      shot = plan(task);
      if (!shot || !hasPearls() || bot.health < settings.pearlMinHealth) {
        walk(task, rev);
        return;
      }
      await bot.look(shot.yaw, shot.pitch, true);
      if (!valid(task, rev) || bot.launcherDefendingBow) return;
      // Equipping/turning can take ticks while floating. Validate the actual
      // quantized rotation, launch point and inherited velocity immediately before use.
      const verified = simulatePearl(bot, bot.entity.yaw, bot.entity.pitch);
      if (
        bot.health < settings.pearlMinHealth ||
        !hasPearls() ||
        !verified ||
        verified.landing.distanceTo(shot.landing) > 1 ||
        (["chase", "escape"].includes(task.kind) &&
          verified.landing.distanceTo(task.destination()) > task.radius)
      ) {
        walk(task, rev);
        return;
      }
      shot = verified;
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
    if (!active || disposed || busy || defensePaused || survivalPaused || bot.health <= 0) return;
    const task = active,
      rev = generation;
    if (!valid(task, rev)) {
      stop();
      return;
    }
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
        const timeout = bot.entity.position.distanceTo(waiting.landing) > 3;
        waiting = null;
        if (timeout) nextPearlAt = now() + Math.max(settings.pearlCooldownMs, 5000);
        walk(task, rev, !timeout);
      }
      return;
    }
    if (
      !settings.pearlEnabled ||
      !settings[`pearl${task.kind[0].toUpperCase()}${task.kind.slice(1)}`] ||
      (!settings.pearlChain && task.throws > 0) ||
      !canThrow() ||
      now() < nextPlanAt
    )
      return;
    nextPlanAt = now() + 750;
    const shot = plan(task);
    if (!shot) return;
    launch(task, rev, shot);
  }
  function launch(task, rev, shot) {
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
        if (["chase", "escape"].includes(task.kind) && valid(task, rev) && !waiting)
          walk(task, rev);
        bot.launcherPearling = ["chase", "escape"].includes(active?.kind) && Boolean(waiting);
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
    pauseForSurvival() {
      survivalPaused = true;
      generation++;
      walkRevision++;
      waiting = null;
      bot.launcherPearling = false;
      if (["chase", "escape"].includes(active?.kind)) active = null;
    },
    resumeAfterSurvival() {
      survivalPaused = false;
      if (active && !disposed && bot.health > 0 && !defensePaused) walk(active, generation);
    },
    chase,
    escape,
    stopChase() {
      if (["chase", "escape"].includes(active?.kind)) stop();
    },
    get chasing() {
      return active?.kind === "chase";
    },
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
  pearlOrigin,
  simulatePearlFlight,
  intersectsEntity,
  simulatePearl,
  planPearl,
  createTravelController,
};
