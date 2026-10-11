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

function detectBowThreat(bot, settings, motions) {
  const entities = Object.values(bot.entities ?? {}).filter(
    (entity) =>
      entity !== bot.entity &&
      entity.id !== bot.entity.id &&
      entity.isValid !== false &&
      !motions?.get(entity.id)?.gone &&
      !motions?.get(entity.id)?.expired &&
      entity.position &&
      entity.position.distanceTo(bot.entity.position) <= settings.bowDefenseRange,
  );
  let nearest = null;
  for (const entity of entities) {
    const velocity = motions?.get(entity.id)?.velocity ?? entity.velocity;
    if (!/arrow/i.test(entity.name ?? "") || !velocity || velocity.norm() < 0.02) continue;
    const ticks = arrowHits(bot, entity.position, velocity, settings.bowDefenseMargin);
    if (ticks !== null && (!nearest || ticks < nearest.ticks))
      nearest = { entity, ticks, projectile: true };
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
        ) {
          const flightTicks = [3, 2, 1]
            .map((speed) =>
              arrowHits(bot, origin, direction.scaled(speed), settings.bowDefenseMargin),
            )
            .filter((ticks) => ticks !== null);
          return { entity, ticks: range / 3, flightTicks: Math.max(range / 3, ...flightTicks) };
        }
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
      if (ticks !== null) {
        if (nearest?.entity === entity) nearest.flightTicks = Math.max(nearest.flightTicks, ticks);
        else if (!nearest || ticks < nearest.ticks) nearest = { entity, ticks, flightTicks: ticks };
      }
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
  let releaseAt = 0,
    defensePoint = null;
  const motions = new Map();
  let nextUnavailableAt = 0;
  function sampleArrow(entity, velocityUpdate = false) {
    if (!/arrow/i.test(entity?.name ?? "") || !entity.position) return;
    const previous = motions.get(entity.id);
    const time = now();
    if (previous && !previous.gone && !velocityUpdate && previous.position.equals(entity.position))
      return;
    // Mineflayer keeps spawn velocity on relative-move packets. Estimate the
    // current flight direction from observed movement, including gravity.
    const velocity =
      previous && !previous.gone && !velocityUpdate
        ? entity.position
            .minus(previous.position)
            .scaled(1 / Math.max(1, (time - previous.at) / 50))
        : entity.velocity?.clone();
    motions.set(entity.id, { position: entity.position.clone(), velocity, at: time });
  }
  function stop() {
    const wasDefending = bot.launcherDefendingBow;
    generation++;
    if (active) bot.deactivateItem();
    active = false;
    threat = null;
    defensePoint = null;
    releaseAt = 0;
    bot.launcherDefendingBow = false;
    if (wasDefending) afterDefend();
  }
  function tick(canUseItem, immediate = false) {
    if (!settings.enabled || !settings.bowDefense || bot.health <= 0 || bot.launcherSurvival?.busy) {
      if (active || busy) stop();
      return false;
    }
    if (busy) return true;
    if (!immediate && now() < nextCheckAt) return active;
    nextCheckAt = now() + settings.bowDefenseCheckMs;
    for (const entity of Object.values(bot.entities ?? {})) {
      if (!motions.get(entity.id)?.gone) sampleArrow(entity);
    }
    for (const [id, motion] of motions) {
      if (motion.expiresAt <= now()) motion.expired = true;
      if (!bot.entities?.[id] && id !== threat?.id) motions.delete(id);
    }
    const candidate = detectBowThreat(bot, settings, motions);
    const previous = threat;
    if (candidate) {
      threat = candidate.entity;
      defensePoint = threat.position.offset(
        0,
        candidate.projectile ? 0 : (threat.height ?? 0) * 0.8,
        0,
      );
      lastThreatAt = now();
      if (candidate.projectile) {
        // A fixed impact deadline also bounds a stale arrow which never gets
        // another move/destroy packet. New movement refreshes the estimate.
        if (previous?.id !== threat.id || motions.get(threat.id)?.at === now()) {
          releaseAt = now() + candidate.ticks * 50 + settings.bowDefenseHoldMs + 150;
          const motion = motions.get(threat.id);
          if (motion) motion.expiresAt = releaseAt;
        }
      } else if (Number.isFinite(candidate.flightTicks)) {
        // Keep the shield through release -> projectile spawn/velocity updates.
        // The configured hold is additional time after the expected impact.
        releaseAt = now() + candidate.flightTicks * 50 + settings.bowDefenseHoldMs + 150;
      }
    } else {
      if (active && now() >= Math.max(releaseAt, lastThreatAt + settings.bowDefenseHoldMs)) {
        stop();
        return false;
      }
      if (!active || !threat) return active;
      if (/arrow/i.test(threat.name ?? "")) {
        const motion = motions.get(threat.id);
        // A moved arrow whose trajectory now misses/passes the bot, or an
        // observed impact/removal, clears the flight hold after the grace time.
        if (!motion?.gone && motion?.at === now()) releaseAt = now() + settings.bowDefenseHoldMs;
      }
    }
    if (!candidate && now() >= Math.max(releaseAt, lastThreatAt + settings.bowDefenseHoldMs)) {
      stop();
      return false;
    }
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
      await bot.lookAt(defensePoint ?? entity.position, true);
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
    sampleArrow(entity);
    if (
      /arrow/i.test(entity?.name ?? "") ||
      /^(bow|crossbow)$/.test(entity?.heldItem?.name ?? "") ||
      /^(bow|crossbow)$/.test(entity?.equipment?.[1]?.name ?? "") ||
      entity?.id === threat?.id
    )
      tick(true, true);
  }
  function gone(entity) {
    if (!/arrow/i.test(entity?.name ?? "")) return;
    motions.set(entity.id, { ...motions.get(entity.id), gone: true });
    if (entity.id === threat?.id) releaseAt = now() + settings.bowDefenseHoldMs;
    tick(true, true);
  }
  function velocityChanged(packet) {
    const entity = bot.entities?.[packet.entityId];
    if (!/arrow/i.test(entity?.name ?? "")) return;
    sampleArrow(entity, true);
    tick(true, true);
  }
  function spawned(entity) {
    motions.delete(entity?.id);
    changed(entity);
  }
  for (const event of ["entityMoved", "entityUpdate", "entityEquip"]) bot.on?.(event, changed);
  bot.on?.("entitySpawn", spawned);
  bot.on?.("entityGone", gone);
  bot._client?.on?.("entity_velocity", velocityChanged);
  return {
    tick,
    stop,
    dispose() {
      stop();
      for (const event of ["entityMoved", "entityUpdate", "entityEquip"]) bot.off?.(event, changed);
      bot.off?.("entitySpawn", spawned);
      bot.off?.("entityGone", gone);
      bot._client?.off?.("entity_velocity", velocityChanged);
      motions.clear();
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
