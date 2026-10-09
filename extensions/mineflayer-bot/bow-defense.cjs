const { toNotchianYaw, toNotchianPitch } = require("mineflayer/lib/conversions");
const { carriedItems, equipCombatItem } = require("./combat-inventory.cjs");
const { Vec3 } = require("vec3");

function segmentHits(start, end, position, width, height, margin) {
  let near = 0,
    far = 1;
  const delta = end.minus(start),
    half = width / 2 + margin;
  for (const [axis, low, high] of [
    ["x", position.x - half, position.x + half],
    ["y", position.y - margin, position.y + height + margin],
    ["z", position.z - half, position.z + half],
  ]) {
    if (Math.abs(delta[axis]) < 1e-9) {
      if (start[axis] < low || start[axis] > high) return null;
      continue;
    }
    const a = (low - start[axis]) / delta[axis],
      b = (high - start[axis]) / delta[axis];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
}

function arrowHits(bot, origin, initialVelocity, margin) {
  let position = origin.clone(),
    velocity = initialVelocity.clone();
  const movement = bot.entity.velocity ?? new Vec3(0, 0, 0);
  for (let tick = 0; tick < 60; tick++) {
    const next = position.plus(velocity),
      length = velocity.norm();
    if (length < 0.01) break;
    const predicted = bot.entity.position.plus(movement.scaled(Math.min(tick, 6)));
    const fraction = segmentHits(
      position,
      next,
      predicted,
      bot.entity.width ?? 0.6,
      bot.entity.height ?? 1.8,
      margin,
    );
    const hit = bot.world?.raycast(position, velocity.scaled(1 / length), length);
    const blockedAt = hit ? (hit.intersect ?? hit.position).distanceTo(position) : Infinity;
    if (fraction !== null && fraction * length < blockedAt) return tick + fraction;
    if (hit) return null;
    position = next;
    velocity = velocity.scaled(0.99).offset(0, -0.05, 0);
    if (position.y < bot.entity.position.y - 8) break;
  }
  return null;
}

function detectBowThreat(bot, settings) {
  const entities = Object.values(bot.entities ?? {}).filter(
    (entity) =>
      entity !== bot.entity &&
      entity.id !== bot.entity.id &&
      entity.isValid !== false &&
      entity.position &&
      entity.position.distanceTo(bot.entity.position) <= settings.bowDefenseRange,
  );
  let nearest = null;
  for (const entity of entities) {
    if (!/arrow/i.test(entity.name ?? "") || !entity.velocity || entity.velocity.norm() < 0.02)
      continue;
    const ticks = arrowHits(bot, entity.position, entity.velocity, settings.bowDefenseMargin);
    if (ticks !== null && (!nearest || ticks < nearest.ticks)) nearest = { entity, ticks };
  }
  if (nearest) return nearest;
  for (const entity of entities) {
    const metadataKeys = bot.registry?.entitiesByName?.[entity.name ?? "player"]?.metadataKeys;
    const index = metadataKeys?.indexOf("living_entity_flags") ?? -1;
    const flags = index >= 0 ? entity.metadata?.[index] : undefined;
    const weapon = flags & 2 ? entity.equipment?.[1] : (entity.heldItem ?? entity.equipment?.[0]);
    if (!/^(bow|crossbow)$/.test(weapon?.name ?? "")) continue;
    if (settings.bowDefenseRequireDraw && (typeof flags !== "number" || !(flags & 1))) continue;
    if (!Number.isFinite(entity.yaw) || !Number.isFinite(entity.pitch)) continue;
    const origin = entity.position.offset(
      0,
      (entity.eyeHeight ?? (entity.height ?? 1.8) * 0.9) - 0.1,
      0,
    );
    const cosine = Math.cos(entity.pitch),
      direction = new Vec3(
        -Math.sin(entity.yaw) * cosine,
        Math.sin(entity.pitch),
        -Math.cos(entity.yaw) * cosine,
      );
    if (settings.bowDefenseMode === "early") {
      // Recognize the draw before release/charge prediction has enough history.
      // Expanded body points tolerate small head-turn and network differences.
      for (const fraction of [0.45, 0.9]) {
        const delta = bot.entity.position
            .offset(0, (bot.entity.height ?? 1.8) * fraction, 0)
            .minus(origin),
          range = delta.norm();
        const tolerance =
          Math.atan2((bot.entity.width ?? 0.6) / 2 + settings.bowDefenseMargin, range) +
          Math.PI / 90;
        if (
          range > 0.01 &&
          direction.dot(delta.scaled(1 / range)) >= Math.cos(tolerance) &&
          (!bot.world?.raycast ||
            bot.world.raycast(origin, delta.scaled(1 / range), range) === null)
        )
          return { entity, ticks: range / 3 };
      }
    }
    const toward = bot.entity.position.minus(origin);
    const horizontal = Math.hypot(direction.x, direction.z);
    if (horizontal > 0.01) {
      if (toward.x * direction.x + toward.z * direction.z <= 0) continue;
      const lateral = Math.abs(toward.x * direction.z - toward.z * direction.x) / horizontal;
      const movement = bot.entity.velocity?.norm() ?? 0;
      if (lateral > (bot.entity.width ?? 0.6) / 2 + settings.bowDefenseMargin + movement * 6)
        continue;
    }
    // Several charge speeds detect a short draw as well as a fully charged shot.
    for (const speed of weapon.name === "crossbow" ? [3.15] : [3, 2, 1]) {
      const ticks = arrowHits(bot, origin, direction.scaled(speed), settings.bowDefenseMargin);
      if (ticks !== null && (!nearest || ticks < nearest.ticks)) nearest = { entity, ticks };
    }
  }
  // Support supplied projectile adapters, without using the upstream global cache.
  if (!nearest && bot.projectiles && typeof bot.projectiles.getPlayersAimingAtBot !== "function") {
    const incoming = bot.projectiles.projectileAtMe,
      aiming = bot.projectiles.isAimedAt;
    nearest = /arrow/i.test(incoming?.entity?.name ?? "")
      ? incoming
      : /^(bow|crossbow)$/.test(aiming?.entity?.heldItem?.name ?? "")
        ? aiming
        : null;
  }
  return nearest;
}

function createBowDefense(
  bot,
  settings,
  {
    now = Date.now,
    onStatus = () => {},
    onError = () => {},
    beforeDefend = () => {},
    afterDefend = () => {},
  } = {},
) {
  let generation = 0,
    active = false,
    busy = false,
    nextCheckAt = 0,
    threat = null;
  let lastThreatAt = 0,
    task = Promise.resolve();
  let nextUnavailableAt = 0;
  function stop() {
    const wasDefending = bot.launcherDefendingBow;
    generation++;
    if (active) bot.deactivateItem();
    active = false;
    threat = null;
    bot.launcherDefendingBow = false;
    if (wasDefending) afterDefend();
  }
  function tick(canUseItem, immediate = false) {
    if (!settings.enabled || !settings.bowDefense || bot.health <= 0) {
      if (active || busy) stop();
      return false;
    }
    if (busy) return true;
    if (!immediate && now() < nextCheckAt) return active;
    nextCheckAt = now() + settings.bowDefenseCheckMs;
    const candidate = detectBowThreat(bot, settings);
    const previous = threat;
    threat = candidate?.entity ?? null;
    if (!threat) {
      if (active && now() - lastThreatAt >= settings.bowDefenseHoldMs) stop();
      return active;
    }
    lastThreatAt = now();
    if (previous?.id !== threat.id)
      onStatus(`bow threat: ${threat.username || threat.name || threat.id}`);
    const shield = carriedItems(bot).find((i) => i.name === "shield");
    if (!settings.shield || !shield || bot.supportFeature("doesntHaveOffHandSlot")) {
      if (active) stop();
      if (now() >= nextUnavailableAt) {
        onStatus(
          `bow defense unavailable: ${!settings.shield ? "shield disabled" : !shield ? "no shield in inventory or offhand" : "version has no shields"}`,
        );
        nextUnavailableAt = now() + 2000;
      }
      return false;
    }
    if (!canUseItem || bot.launcherPearling) return active;
    const starting = !bot.launcherDefendingBow;
    const rev = generation,
      entity = threat;
    busy = true;
    bot.launcherDefendingBow = true;
    task = (async () => {
      if (starting) await beforeDefend();
      if (rev !== generation || bot.health <= 0) return;
      await equipCombatItem(bot, shield, "off-hand", () => rev === generation && bot.health > 0);
      if (rev !== generation || bot.health <= 0) return;
      await bot.lookAt(entity.position.offset(0, entity.height ? entity.height * 0.8 : 0, 0), true);
      if (rev !== generation || bot.health <= 0) return;
      if (bot._client?.state === "play")
        bot._client.write("look", {
          yaw: Math.fround(toNotchianYaw(bot.entity.yaw)),
          pitch: Math.fround(toNotchianPitch(bot.entity.pitch)),
          onGround: Boolean(bot.entity.onGround),
          flags: {
            onGround: Boolean(bot.entity.onGround),
            hasHorizontalCollision: Boolean(bot.entity.isCollidedHorizontally),
          },
        });
      if (!active || bot.usingHeldItem === false) bot.activateItem(true);
      active = true;
    })()
      .catch((error) => {
        stop();
        onError(error);
      })
      .finally(() => {
        busy = false;
        if (!active) bot.launcherDefendingBow = false;
      });
    return true;
  }
  function changed(entity) {
    if (!settings.bowDefense || entity?.id === bot.entity.id) return;
    if (
      /arrow/i.test(entity?.name ?? "") ||
      /^(bow|crossbow)$/.test(entity?.heldItem?.name ?? "") ||
      /^(bow|crossbow)$/.test(entity?.equipment?.[1]?.name ?? "") ||
      entity?.id === threat?.id
    )
      tick(true, true);
  }
  for (const event of ["entityMoved", "entityUpdate", "entityEquip", "entitySpawn"])
    bot.on?.(event, changed);
  return {
    tick,
    stop,
    dispose() {
      stop();
      for (const event of ["entityMoved", "entityUpdate", "entityEquip", "entitySpawn"])
        bot.off?.(event, changed);
    },
    get task() {
      return task;
    },
    get threat() {
      return threat;
    },
  };
}

module.exports = { createBowDefense, detectBowThreat };
