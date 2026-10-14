const { Vec3 } = require("vec3");
const { goals } = require("./pathfinder.cjs");
const { HOSTILES, canSeeTarget } = require("./combat.cjs");
const { bestMeleeWeapon } = require("./combat-inventory.cjs");
const plan = require("./gathering-plan.cjs");

const PLAYER_RETALIATION_MS = 3000;
const MELEE_SWING_WINDOW_MS = 500;

function createGatheringDefense(
  bot,
  work,
  { isOwner = () => false, now = Date.now, onStatus = () => {} } = {},
) {
  let session = null,
    disposed = false,
    pending = false,
    generation = 0;
  let task = Promise.resolve(),
    nextCheck = 0,
    actionId = 0;
  let movement = null;
  let unattributedHitAt = -Infinity;
  const attackers = new Map(),
    dead = new Set();
  const swings = new Map();
  const projectile = (entity) => /arrow/i.test(entity?.name || "");
  const player = (entity) => Boolean(entity?.username || entity?.type === "player");
  const distance = (entity) => bot.entity.position.distanceTo(entity.position);
  function permitted(entity) {
    if (
      !entity?.position ||
      entity.id === bot.entity.id ||
      entity.isValid === false ||
      dead.has(entity.id)
    )
      return false;
    if (projectile(entity)) return work.settings.defendArrows;
    if (player(entity))
      return (
        work.settings.defendPlayers &&
        !isOwner(entity.username) &&
        entity.username?.toLowerCase() !== bot.username?.toLowerCase()
      );
    return work.settings.defendMobs;
  }
  function attacking(entity) {
    return (attackers.get(entity?.id)?.until ?? -Infinity) > now();
  }
  function threat() {
    for (const [id, value] of swings)
      if (now() - value.at > MELEE_SWING_WINDOW_MS) swings.delete(id);
    for (const [id, value] of attackers)
      if (value.until <= now() || !permitted(value.entity)) attackers.delete(id);
    const bow = bot.launcherCombat?.bowThreat;
    if (work.settings.defendArrows && permitted(bow) && (!player(bow) || attacking(bow)))
      return bow;
    const candidates = Object.values(bot.entities || {}).filter(
      (entity) =>
        permitted(entity) &&
        distance(entity) <= (attackers.has(entity.id) ? 12 : 6) &&
        (attackers.has(entity.id) || (!player(entity) && HOSTILES.has(entity.name))) &&
        // A confirmed hit interrupts work even if cover briefly hides its source.
        (attackers.has(entity.id) || canSeeTarget(bot, entity)),
    );
    candidates.sort(
      (a, b) =>
        Number(shouldFlee(b)) - Number(shouldFlee(a)) ||
        Number(b.name === "creeper") - Number(a.name === "creeper") ||
        distance(a) - distance(b),
    );
    return candidates[0] || null;
  }
  function shouldFlee(entity) {
    return (
      projectile(entity) ||
      ["creeper", "warden", "wither", "ender_dragon"].includes(entity.name) ||
      bot.health <= Math.max(8, work.settings.minHealth) ||
      !bestMeleeWeapon(bot, "sword") ||
      !bot.launcherCombat
    );
  }
  function retreatPoint(entity) {
    const start = bot.entity.position;
    let away = start.minus(entity.position);
    away.y = 0;
    if (away.norm() < 0.1) away = new Vec3(1, 0, 0);
    away = away.normalize();
    let best = null,
      score = -Infinity;
    for (const range of [6, 4, 2])
      for (const angle of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
        const direction = new Vec3(
          away.x * Math.cos(angle) - away.z * Math.sin(angle),
          0,
          away.x * Math.sin(angle) + away.z * Math.cos(angle),
        );
        for (const dy of [0, 1, -1]) {
          const feet = start.plus(direction.scaled(range)).floored().offset(0, dy, 0);
          const floor = bot.blockAt(feet.offset(0, -1, 0)),
            lower = bot.blockAt(feet),
            upper = bot.blockAt(feet.offset(0, 1, 0));
          if (
            floor?.boundingBox !== "block" ||
            !plan.AIR.has(lower?.name) ||
            !plan.AIR.has(upper?.name) ||
            /lava|fire|magma|cactus|campfire|powder_snow/.test(floor.name)
          )
            continue;
          const position = feet.offset(0.5, 0, 0.5);
          const clearance = position.distanceTo(entity.position);
          if (clearance < distance(entity) + 1) continue;
          // Prefer space away from all nearby threats, using loaded safe terrain.
          const others = Object.values(bot.entities || {}).filter(
            (other) => permitted(other) && (HOSTILES.has(other.name) || attackers.has(other.id)),
          );
          const value =
            Math.min(clearance, ...others.map((other) => position.distanceTo(other.position))) -
            Math.abs(dy);
          if (value > score) {
            best = feet;
            score = value;
          }
        }
      }
    return best;
  }
  function run(action) {
    const id = ++actionId;
    pending = true;
    task = Promise.resolve()
      .then(action)
      .catch((error) => {
        if (!disposed && session) onStatus(`Защита при добыче: ${error.message}`);
      })
      .finally(() => {
        if (id === actionId) pending = false;
      });
  }
  function stop() {
    if (!session && !pending) return task;
    generation++;
    attackers.delete(session?.entity.id);
    unattributedHitAt = -Infinity;
    session = null;
    bot.launcherCombat?.stopWorkDefense();
    const previous = task;
    run(async () => {
      await bot.pathfinder.stop();
      await previous;
      await bot.launcherCombat?.idleTask;
      if (movement) bot.pathfinder.setMoveOptions?.(movement);
      movement = null;
      bot.clearControlStates?.();
    });
    return task;
  }
  function tick() {
    if (disposed || !bot.entity?.position) return;
    if (!work.protecting || bot.health <= 0) {
      unattributedHitAt = -Infinity;
      swings.clear();
      if (session) void stop();
      return;
    }
    if (
      session &&
      (!permitted(session.entity) ||
        (player(session.entity) && !attacking(session.entity)) ||
        distance(session.entity) > 12 ||
        bot.entity.position.distanceTo(session.origin) > 16)
    ) {
      void stop();
      return;
    }
    if (pending || now() < nextCheck) return;
    nextCheck = now() + 150;
    const candidate = threat();
    if (session) {
      const enemy = session.entity;
      if (
        !permitted(enemy) ||
        distance(enemy) > 12 ||
        bot.entity.position.distanceTo(session.origin) > 16 ||
        (!candidate &&
          !bot.launcherCombat?.workTarget &&
          (!shouldFlee(enemy) || projectile(enemy) || distance(enemy) >= 10))
      ) {
        void stop();
        return;
      }
      // A creeper or an incoming arrow takes precedence over a melee duel.
      if (candidate && shouldFlee(candidate)) session.entity = candidate;
      const flee = shouldFlee(session.entity);
      if (!flee && bot.launcherCombat?.workTarget?.id !== session.entity.id) {
        void stop();
        return;
      }
      if (
        flee &&
        !bot.launcherDefendingBow &&
        !bot.launcherSurvival?.busy &&
        now() >= session.nextMove
      ) {
        session.nextMove = now() + 1000;
        const rev = generation;
        bot.launcherCombat?.stopWorkDefense();
        run(async () => {
          await bot.launcherCombat?.idleTask;
          if (rev !== generation || !session) return;
          const point = retreatPoint(session.entity);
          if (!point) {
            onStatus("Нет безопасного пути отхода; жду защиты или освобождения прохода");
            return;
          }
          await bot.pathfinder.stop();
          if (rev !== generation || !session) return;
          movement ||= { ...bot.pathfinder.defaultMoveSettings };
          bot.pathfinder.setMoveOptions?.({
            canDig: false,
            canPlace: false,
            allow1by1towers: false,
            allowWaterDrop: false,
            allowBucketWaterDrop: false,
            maxDropDown: 1,
          });
          const route = bot.pathfinder.goto(new goals.GoalBlock(point.x, point.y, point.z));
          let timer;
          try {
            await Promise.race([
              route,
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error("Путь отхода занял слишком много времени")),
                  5000,
                );
              }),
            ]);
          } catch (error) {
            await bot.pathfinder.stop();
            await route.catch(() => {});
            throw error;
          } finally {
            clearTimeout(timer);
          }
        });
      }
      return;
    }
    if (!candidate) return;
    session = { entity: candidate, origin: bot.entity.position.clone(), nextMove: 0 };
    const rev = ++generation;
    const flee = shouldFlee(candidate);
    work.pauseForDefense(
      flee ? "Отхожу от опасности" : `Защищаюсь: ${candidate.username || candidate.name}`,
    );
    onStatus(
      `${flee ? "Безопасный отход" : "Самозащита"}: ${candidate.username || candidate.name}`,
    );
    run(async () => {
      await work.task;
      if (rev !== generation || !session || !work.protecting) return;
      if (!flee && !bot.launcherSurvival?.busy) bot.launcherCombat.defend(candidate);
    });
  }
  function swing(entity) {
    if (
      !work.protecting ||
      !permitted(entity) ||
      distance(entity) > 3.5 ||
      ![entity.yaw, entity.pitch].every(Number.isFinite) ||
      !canSeeTarget(bot, entity)
    )
      return;
    const eyes = entity.position.offset(0, entity.eyeHeight ?? 1.62, 0);
    const delta = bot.entity.position.offset(0, 1, 0).minus(eyes).normalize();
    const view = new Vec3(
      -Math.sin(entity.yaw) * Math.cos(entity.pitch),
      Math.sin(entity.pitch),
      -Math.cos(entity.yaw) * Math.cos(entity.pitch),
    );
    if (view.dot(delta) <= 0.9) return;
    swings.set(entity.id, { entity, at: now() });
    // Some legacy servers send the hurt status before the swing animation.
    if (now() - unattributedHitAt <= MELEE_SWING_WINDOW_MS) hurt(bot.entity);
  }
  function hurt(entity, source) {
    if (entity?.id !== bot.entity.id || !work.protecting) return;
    // Older servers omit the source. Require one unambiguous, aimed melee
    // swing next to the damage event, never mere player proximity.
    unattributedHitAt = -Infinity;
    if (!source) {
      const recent = [...swings.values()].filter(
        (value) =>
          now() - value.at <= MELEE_SWING_WINDOW_MS &&
          permitted(value.entity) && distance(value.entity) <= 3.5,
      );
      if (recent.length === 1) source = recent[0].entity;
      else if (!recent.length) unattributedHitAt = now();
    }
    if (!permitted(source)) return;
    swings.delete(source.id);
    attackers.set(source.id, {
      entity: source,
      until: player(source) ? now() + PLAYER_RETALIATION_MS : Infinity,
    });
    nextCheck = 0;
    tick();
  }
  function removed(entity) {
    if (
      session?.entity.id === entity.id ||
      attackers.has(entity.id) ||
      HOSTILES.has(entity.name) ||
      entity.username
    )
      dead.add(entity.id);
    if (dead.size > 256) dead.delete(dead.values().next().value);
    attackers.delete(entity.id);
    swings.delete(entity.id);
    if (session?.entity.id === entity.id) void stop();
  }
  function spawned(entity) {
    dead.delete(entity.id);
  }
  bot.on("entityHurt", hurt);
  bot.on("entitySwingArm", swing);
  bot.on("entityDead", removed);
  bot.on("entityGone", removed);
  bot.on("entitySpawn", spawned);
  return {
    tick,
    stop,
    get busy() {
      return Boolean(session) || pending;
    },
    get task() {
      return task;
    },
    async dispose() {
      disposed = true;
      bot.off("entityHurt", hurt);
      bot.off("entityDead", removed);
      bot.off("entitySwingArm", swing);
      bot.off("entityGone", removed);
      bot.off("entitySpawn", spawned);
      await stop();
    },
  };
}

module.exports = { createGatheringDefense };
