const { Vec3 } = require("vec3");
const { getItemEnchantments } = require("./pathfinder.cjs");
const { carriedItems } = require("./combat-inventory.cjs");
const { groundAt, walkSegment } = require("./crystal-movement.cjs");

const isCrystal = (entity) => /^(end_?crystal|ender_?crystal)$/i.test(entity.name ?? "");
const eyes = (bot) => bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0);

const air = (block) => ["air", "cave_air", "void_air"].includes(block?.name);
const faces = [
  new Vec3(0, 1, 0),
  new Vec3(-1, 0, 0),
  new Vec3(1, 0, 0),
  new Vec3(0, 0, -1),
  new Vec3(0, 0, 1),
  new Vec3(0, -1, 0),
];
const hitFaces = [faces[5], faces[0], faces[3], faces[4], faces[1], faces[2]];

function viewDirection(bot) {
  const { yaw, pitch } = bot.entity;
  return new Vec3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
}

function entityRayDistance(origin, direction, entity) {
  const half = (entity.width ?? 2) / 2;
  let near = 0,
    far = Infinity;
  for (const [axis, low, high] of [
    ["x", entity.position.x - half, entity.position.x + half],
    ["y", entity.position.y, entity.position.y + (entity.height ?? 2)],
    ["z", entity.position.z - half, entity.position.z + half],
  ]) {
    if (Math.abs(direction[axis]) < 1e-9) {
      if (origin[axis] < low || origin[axis] > high) return null;
      continue;
    }
    const a = (low - origin[axis]) / direction[axis];
    const b = (high - origin[axis]) / direction[axis];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  return near <= far && far >= 0 ? near : null;
}

function armourReduction(bot, entity, damage) {
  const armour =
    entity === bot.entity && bot.inventory?.slots
      ? bot.inventory.slots.slice(5, 9)
      : (entity.equipment ?? []).slice(2, 6);
  let points = 0,
    toughness = 0,
    protection = 0;
  const tiers = {
    leather: [1, 3, 2, 1],
    golden: [2, 5, 3, 1],
    chainmail: [2, 5, 4, 1],
    iron: [2, 6, 5, 2],
    diamond: [3, 8, 6, 3],
    netherite: [3, 8, 6, 3],
    turtle: [2, 0, 0, 0],
  };
  for (const item of armour) {
    if (!item) continue;
    const [tier, part] = item.name.split("_");
    const index = ["helmet", "chestplate", "leggings", "boots"].indexOf(part);
    if (tiers[tier] && index >= 0) {
      points += tiers[tier][index];
      toughness += tier === "netherite" ? 3 : tier === "diamond" ? 2 : 0;
    }
    for (const enchantment of getItemEnchantments(item, bot.registry)) {
      const name = String(enchantment.name ?? "").replace(/^minecraft:/, "");
      protection +=
        (enchantment.lvl ?? enchantment.level ?? 0) *
        (name === "blast_protection" ? 2 : name === "protection" ? 1 : 0);
    }
  }
  function attribute(suffix, fallback) {
    const entry = Object.entries(entity.attributes ?? {}).find(
      ([name]) => name.replace(/^minecraft:/, "").replace(/^generic[.:]/, "") === suffix,
    )?.[1];
    if (!entry) return fallback;
    let value = entry.value ?? entry.base ?? fallback;
    const base = value;
    for (const modifier of entry.modifiers ?? [])
      if (modifier.operation === 0 || modifier.operation === "add_value") value += modifier.amount;
    for (const modifier of entry.modifiers ?? [])
      if (modifier.operation === 1 || modifier.operation === "add_multiplied_base")
        value += base * modifier.amount;
    for (const modifier of entry.modifiers ?? [])
      if (modifier.operation === 2 || modifier.operation === "add_multiplied_total")
        value *= 1 + modifier.amount;
    return value;
  }
  points = attribute("armor", points);
  toughness = attribute("armor_toughness", toughness);
  damage *= 1 - Math.min(20, Math.max(points / 5, points - damage / (2 + toughness / 4))) / 25;
  const resistance = Object.values(bot.registry?.effects ?? {}).find(
    (effect) => effect.name.toLowerCase() === "resistance",
  );
  const effect = resistance && entity.effects?.[resistance.id];
  if (effect) damage *= Math.max(0, 1 - 0.2 * ((effect.amplifier ?? 0) + 1));
  return damage * (1 - Math.min(20, protection) / 25);
}

function explosionDamage(bot, entity, source) {
  if (!entity?.position || !bot.world?.raycast) return Infinity;
  const distance = entity.position.distanceTo(source);
  if (distance >= 12) return 0;
  let exposed = 0,
    samples = 0;
  const width = entity.width ?? 0.6,
    height = entity.height ?? 1.8;
  for (const x of [-0.45, 0, 0.45])
    for (const y of [0.05, 0.275, 0.5, 0.725, 0.95])
      for (const z of [-0.45, 0, 0.45]) {
        const point = entity.position.offset(x * width, y * height, z * width);
        const delta = point.minus(source),
          range = delta.norm();
        samples++;
        // Reject unknown terrain rather than treating unloaded cover as air.
        let loaded = true;
        for (let f = 0; f <= 1; f += 1 / Math.max(1, Math.ceil(range))) {
          if (!bot.blockAt(source.plus(delta.scaled(f)))) {
            loaded = false;
            break;
          }
        }
        if (!loaded) return Infinity;
        if (range < 0.01 || bot.world.raycast(source, delta.scaled(1 / range), range) === null)
          exposed++;
      }
  const impact = ((1 - distance / 12) * exposed) / samples;
  // Vanilla crystal power=6; explosion radius=12; the extra 1 applies only in radius.
  const raw = Math.floor(((impact * impact + impact) * 7 * 12) / 2 + 1);
  // Raw normal-difficulty damage can increase by 50% on hard difficulty.
  const difficulty = bot.game?.difficulty;
  const scaled =
    difficulty === "hard"
      ? raw * 1.5
      : difficulty === "easy"
        ? Math.min(raw / 2 + 1, raw)
        : difficulty === "peaceful"
          ? 0
          : raw;
  return armourReduction(bot, entity, scaled);
}

// Simulate full blocks without changing the actual world or assuming a server accepted placement.
function overlay(bot, blocks) {
  const map = new Map(blocks.map((block) => [block.position.toString(), block]));
  return {
    entity: bot.entity,
    inventory: bot.inventory,
    registry: bot.registry,
    game: bot.game,
    blockAt: (point) => map.get(point.floored().toString()) ?? bot.blockAt(point),
    world: {
      raycast(origin, direction, range) {
        let result = bot.world.raycast(origin, direction, range);
        let closest = result
          ? (result.intersect ?? result.position).distanceTo(origin)
          : range + 0.001;
        for (const block of blocks) {
          let near = 0,
            far = range,
            face = -1;
          for (const [axis, lowFace, highFace] of [
            ["x", 4, 5],
            ["y", 0, 1],
            ["z", 2, 3],
          ]) {
            if (Math.abs(direction[axis]) < 1e-9) {
              if (origin[axis] < block.position[axis] || origin[axis] > block.position[axis] + 1)
                far = -1;
              continue;
            }
            const a = (block.position[axis] - origin[axis]) / direction[axis];
            const b = (block.position[axis] + 1 - origin[axis]) / direction[axis];
            const first = Math.min(a, b);
            if (first > near) {
              near = first;
              face = a < b ? lowFace : highFace;
            }
            far = Math.min(far, Math.max(a, b));
          }
          if (near <= far && far > 1e-6 && near < closest) {
            closest = near;
            result = { ...block, face, intersect: origin.plus(direction.scaled(near)) };
          }
        }
        return result;
      },
    },
  };
}

function createCrystalPlanner(bot, settings, isOwner = () => false, { scoreAction = null } = {}) {
  let frame = null;
  function withinDecision(operation) {
    if (frame) return operation();
    const blocks = new Map();
    const world = {
      entity: bot.entity,
      inventory: bot.inventory,
      registry: bot.registry,
      game: bot.game,
      world: bot.world,
      blockAt(point) {
        const key = `${Math.floor(point.x)},${Math.floor(point.y)},${Math.floor(point.z)}`;
        if (!blocks.has(key)) blocks.set(key, bot.blockAt(point));
        return blocks.get(key);
      },
    };
    const entities = Object.values({ ...bot.entities, [bot.entity.id]: bot.entity });
    // A synchronous search sees one world state. Discard everything before any
    // await/tick; verify() always starts a fresh frame after equip and aiming.
    frame = {
      world,
      entities,
      crystals: entities.filter((e) => isCrystal(e) && e.isValid !== false),
      damage: new WeakMap(),
      predictions: new WeakMap(),
    };
    try {
      return operation();
    } finally {
      frame = null;
    }
  }
  const readWorld = (world) => (world === bot && frame ? frame.world : world);
  const blockAt = (point) => (frame?.world ?? bot).blockAt(point);
  const entities = () =>
    frame?.entities ?? Object.values({ ...bot.entities, [bot.entity.id]: bot.entity });
  function damageAt(world, entity, source) {
    world = readWorld(world);
    if (!frame) return explosionDamage(world, entity, source);
    let byEntity = frame.damage.get(world);
    if (!byEntity) frame.damage.set(world, (byEntity = new WeakMap()));
    let bySource = byEntity.get(entity);
    if (!bySource) byEntity.set(entity, (bySource = new Map()));
    const key = `${source.x},${source.y},${source.z}`;
    if (!bySource.has(key)) bySource.set(key, explosionDamage(world, entity, source));
    return bySource.get(key);
  }
  const pendingPlaces = new Map(),
    pendingBreaks = new Map(),
    pendingBlocks = new Map();
  let reason = "no reachable crystal position";
  let cycle = null,
    pendingSpawn = null,
    pendingBlock = null;
  const failedBases = new Map();
  const placed = new Map();
  function reject(message) {
    reason = message;
    return null;
  }
  function evaluate(
    target,
    source,
    world = bot,
    minimumDamage = settings.crystalMinDamage,
    predict = settings.crystalPredict,
  ) {
    world = readWorld(world);
    if (bot.health < settings.crystalMinHealth) return reject("health below crystal minimum");
    const velocity = predict
      ? (bot.tracker?.getEntitySpeed(target) ?? target.velocity ?? new Vec3(0, 0, 0))
      : new Vec3(0, 0, 0);
    let predicted = target;
    if (
      predict &&
      settings.crystalPredictionTicks > 0 &&
      (velocity.x !== 0 || velocity.y !== 0 || velocity.z !== 0)
    ) {
      predicted = frame?.predictions.get(target);
      if (!predicted) {
        predicted = {
          ...target,
          position: target.position.plus(velocity.scaled(settings.crystalPredictionTicks)),
        };
        frame?.predictions.set(target, predicted);
      }
    }
    const damage = Math.min(damageAt(world, target, source), damageAt(world, predicted, source));
    // Nearby crystals can chain. Bound the combined damage, not just this crystal.
    const nearby =
      frame?.crystals ??
      Object.values(bot.entities ?? {}).filter((e) => isCrystal(e) && e.isValid !== false);
    const sources = [source],
      included = new Set();
    // Traverse the entire connected chain, including crystals outside the first radius.
    for (let i = 0; i < sources.length; i++)
      for (const e of nearby) {
        if (included.has(e.id) || e.position.distanceTo(sources[i]) >= 12) continue;
        included.add(e.id);
        if (e.position.distanceTo(source) > 0.1) sources.push(e.position);
        if (sources.length > 128) return null;
      }
    const selfDamage = sources.reduce(
      (sum, pos, index) => sum + damageAt(index > 0 ? bot : world, bot.entity, pos),
      0,
    );
    if (
      !Number.isFinite(damage) ||
      damage < minimumDamage ||
      selfDamage > settings.crystalMaxSelfDamage ||
      bot.health - selfDamage < settings.crystalMinHealth
    )
      return reject(
        !Number.isFinite(damage) || !Number.isFinite(selfDamage)
          ? "terrain is not loaded"
          : damage < minimumDamage
            ? `target damage ${damage.toFixed(1)} < ${minimumDamage}`
            : `self damage ${selfDamage.toFixed(1)}, limit ${settings.crystalMaxSelfDamage}; health after ${(bot.health - selfDamage).toFixed(1)}`,
      );
    if (
      settings.crystalProtectOwners &&
      entities().some(
        (e) =>
          e.id !== bot.entity.id &&
          e.id !== target.id &&
          e.isValid !== false &&
          isOwner(e.username) &&
          sources.some((pos) => damageAt(bot, e, pos) > 0),
      )
    )
      return reject("owner near explosion");
    return { damage, selfDamage };
  }
  function clickable(block, world = bot) {
    world = readWorld(world);
    for (const face of faces) {
      const aim = block.position.offset(
        0.5 + face.x * 0.499,
        0.5 + face.y * 0.499,
        0.5 + face.z * 0.499,
      );
      const delta = aim.minus(eyes(bot)),
        range = delta.norm();
      if (range > settings.crystalPlaceRange || range < 0.001) continue;
      const hit = world.world.raycast(eyes(bot), delta.scaled(1 / range), range + 0.01);
      if (hit?.position.equals(block.position) && hitFaces[hit.face])
        return {
          aim: hit.intersect,
          range: hit.intersect.distanceTo(eyes(bot)),
          face: hitFaces[hit.face],
        };
    }
    return null;
  }
  function occupied(p, height = 1) {
    return entities().some((e) => {
      if (e.isValid === false || !e.position) return false;
      const half = (e.width ?? 0.6) / 2;
      return (
        e.position.x + half > p.x &&
        e.position.x - half < p.x + 1 &&
        e.position.z + half > p.z &&
        e.position.z - half < p.z + 1 &&
        e.position.y + (e.height ?? 1.8) > p.y &&
        e.position.y < p.y + height
      );
    });
  }
  function blockAction(position, item, type, time, world = bot) {
    world = readWorld(world);
    if (
      !item ||
      !air(world.blockAt(position)) ||
      occupied(position) ||
      pendingBlocks.get(position.toString()) > time
    )
      return null;
    for (const face of faces) {
      const reference = world.blockAt(position.minus(face));
      if (reference?.boundingBox !== "block") continue;
      const aim = reference.position.offset(
        0.5 + face.x * 0.499,
        0.5 + face.y * 0.499,
        0.5 + face.z * 0.499,
      );
      const delta = aim.minus(eyes(bot)),
        range = delta.norm();
      if (range > settings.crystalPlaceRange || range < 0.001) continue;
      const hit = world.world.raycast(eyes(bot), delta.scaled(1 / range), range + 0.01);
      if (hit?.position.equals(reference.position) && hitFaces[hit.face]?.equals(face))
        return { type, position, item, reference, face, aim: hit.intersect, range };
    }
    return null;
  }
  function protect(source, time, item, choice, select, additionalBlocks = [], reserved = 0) {
    const count = (item?.count ?? 1) - reserved;
    const budget = settings.crystalMaxCoverBlocks - (cycle?.covers ?? 0);
    // Once damage is within the limits, finish the attack. Continually improving
    // an already safe cover adds unnecessary walls and postpones the crystal.
    if (choice || !settings.crystalCover || !item || count <= 0 || budget <= 0) return choice;
    const direction = source.minus(bot.entity.position),
      horizontal = Math.hypot(direction.x, direction.z);
    for (const distance of [1.2, 1.8, 2.3]) {
      if (horizontal <= distance + 0.5) continue;
      const foot = bot.entity.position
        .offset((direction.x / horizontal) * distance, 0, (direction.z / horizontal) * distance)
        .floored();
      if (additionalBlocks.some((block) => block.position.equals(foot))) continue;
      for (const height of [0, 1]) {
        const position = foot.offset(0, height, 0);
        const support =
          height && air(blockAt(foot)) ? blockAction(foot, item, "cover", time) : null;
        if (support && (count < 2 || budget < 2)) continue;
        const supportBlock = { name: item.name, position: foot, boundingBox: "block" };
        const cover = blockAction(
          position,
          item,
          "cover",
          time,
          support ? overlay(readWorld(bot), [supportBlock]) : bot,
        );
        if (!cover) continue;
        const world = overlay(readWorld(bot), [
          ...additionalBlocks,
          ...(support ? [supportBlock] : []),
          { name: item.name, position, boundingBox: "block" },
        ]);
        const protectedChoice = select(world);
        if (!protectedChoice || (choice && protectedChoice.selfDamage >= choice.selfDamage - 0.25))
          continue;
        choice = { ...protectedChoice, nextCover: support ?? cover };
      }
    }
    return choice;
  }
  function placement(target, base, time, evaluateDamage = true, world = bot) {
    world = readWorld(world);
    if (!["obsidian", "bedrock"].includes(base?.name)) return null;
    const p = base.position,
      source = p.offset(0.5, 1, 0.5);
    const key = p.toString();
    if (pendingPlaces.get(key) > time) return null;
    const above = world.blockAt(p.offset(0, 1, 0)),
      second = world.blockAt(p.offset(0, 2, 0));
    // Legacy servers require two air blocks. Keep this valid on all supported versions.
    if (
      !above ||
      !second ||
      !["air", "cave_air", "void_air"].includes(above.name) ||
      !["air", "cave_air", "void_air"].includes(second.name)
    )
      return null;
    if (
      entities().some((e) => {
        if (e.isValid === false || !e.position) return false;
        const half = (e.width ?? 0.6) / 2;
        return (
          e.position.x + half > p.x &&
          e.position.x - half < p.x + 1 &&
          e.position.z + half > p.z &&
          e.position.z - half < p.z + 1 &&
          e.position.y + (e.height ?? 1.8) > p.y + 1 &&
          e.position.y < p.y + 3
        );
      })
    )
      return null;
    const click = clickable(base, world);
    if (!click) return null;
    const score = evaluateDamage ? evaluate(target, source, world) : {};
    return score && { type: "place", base, source, ...click, ...score };
  }
  function crystalRay(crystal, direction, world = bot) {
    world = readWorld(world);
    const origin = eyes(bot),
      range = entityRayDistance(origin, direction, crystal);
    if (
      range === null ||
      range > settings.crystalBreakRange ||
      world.world.raycast(origin, direction, range) !== null
    )
      return null;
    if (
      entities().some((entity) => {
        if (
          entity.id === bot.entity.id ||
          entity.id === crystal.id ||
          entity.isValid === false ||
          !entity.position
        )
          return false;
        const other = entityRayDistance(origin, direction, entity);
        return other !== null && other < range;
      })
    )
      return null;
    return range;
  }
  function breaking(target, crystal, time, world = bot, evaluateDamage = true, finish = false) {
    if (!isCrystal(crystal) || crystal.isValid === false || pendingBreaks.get(crystal.id) > time)
      return null;
    let aim, range;
    for (const fraction of [0.5, 0.98, 0.85, 0.2]) {
      const point = crystal.position.offset(0, (crystal.height ?? 2) * fraction, 0),
        delta = point.minus(eyes(bot));
      const length = delta.norm();
      const hitRange = crystalRay(
        crystal,
        length < 0.001 ? viewDirection(bot) : delta.scaled(1 / length),
        world,
      );
      if (hitRange !== null) {
        aim = point;
        range = hitRange;
        break;
      }
    }
    if (!aim) return null;
    const owned = finish || [...placed.values()].some((entry) => entry.id === crystal.id);
    const score = evaluateDamage
      ? evaluate(
          target,
          crystal.position,
          world,
          owned ? 0 : settings.crystalMinDamage,
          owned ? false : settings.crystalPredict,
        )
      : {};
    return (
      score && {
        type: "break",
        crystal,
        source: crystal.position,
        aim,
        range,
        finish: owned,
        ...score,
      }
    );
  }
  function plan(target, time) {
    if (!settings.crystalEnabled || !bot.world?.raycast || !bot.blockAt) return null;
    for (const [key, deadline] of pendingPlaces) if (deadline <= time) pendingPlaces.delete(key);
    for (const [key, deadline] of pendingBreaks) if (deadline <= time) pendingBreaks.delete(key);
    for (const [key, deadline] of pendingBlocks) if (deadline <= time) pendingBlocks.delete(key);
    for (const [key, deadline] of failedBases) if (deadline <= time) failedBases.delete(key);
    for (const [key, entry] of placed) {
      const entity = (frame?.crystals ?? entities()).find(
        (e) =>
          isCrystal(e) &&
          e.isValid !== false &&
          (e.id === entry.id || e.position.distanceTo(entry.source) < 0.5),
      );
      if (entity) entry.id = entity.id;
      else if (entry.id !== null || time >= entry.until) placed.delete(key);
    }
    reason = "no reachable crystal position with free space";
    if (pendingBlock) {
      const key = pendingBlock.position.toString();
      if (blockAt(pendingBlock.position)?.name === pendingBlock.item.name) {
        pendingBlocks.delete(key);
        pendingBlock = null;
        if (cycle) {
          cycle.blockAttempts = 0;
          cycle.progressAt = time;
        }
      } else if (time < pendingBlock.until) {
        return reject("waiting for server block confirmation");
      } else {
        pendingBlocks.delete(key);
        if (cycle && pendingBlock.type === "cover") cycle.covers--;
        pendingBlock = null;
        if (cycle?.blockAttempts >= settings.crystalRetries) {
          failedBases.set(cycle.base.toString(), time + 1000);
          cycle = null;
          return reject("server did not confirm block; replanning layout");
        }
      }
    }
    if (pendingSpawn) {
      const spawned = (frame?.crystals ?? entities()).find(
        (entity) =>
          isCrystal(entity) &&
          entity.isValid !== false &&
          entity.position.distanceTo(pendingSpawn.source) < 0.5,
      );
      if (spawned) {
        pendingPlaces.delete(pendingSpawn.base.toString());
        pendingSpawn = null;
        if (cycle) cycle.crystalId = spawned.id;
      } else if (time < pendingSpawn.until) {
        return reject("waiting for server crystal spawn");
      } else {
        const key = pendingSpawn.base.toString();
        pendingPlaces.delete(key);
        pendingSpawn = null;
        if (cycle?.attempts >= settings.crystalRetries) {
          failedBases.set(key, time + 1000);
          cycle = null;
          return reject("server did not spawn crystal; placement retries exhausted");
        }
      }
    }
    const candidates = [];
    if (
      cycle?.crystalId &&
      (bot.entities?.[cycle.crystalId]?.isValid === false || !bot.entities?.[cycle.crystalId])
    ) {
      cycle.crystalId = null;
      cycle.covers = 0;
      cycle.attempts = 0;
      cycle.progressAt = time;
    }
    if (cycle?.crystalId && pendingBreaks.get(cycle.crystalId) > time)
      return reject("waiting for server crystal removal");
    const order = { break: 0, cover: 1, place: 2, build: 3 };
    const compare = (a, b) =>
      (scoreAction?.(b) ?? 0) - (scoreAction?.(a) ?? 0) ||
      order[a.type] - order[b.type] ||
      (settings.crystalPriority === "closest"
        ? a.range - b.range || b.damage - a.damage
        : b.damage - a.damage || a.selfDamage - b.selfDamage || a.range - b.range);
    const items = carriedItems(bot),
      obsidian = items.find((i) => i.name === "obsidian");
    const coverItem =
      items.find((i) =>
        settings.crystalCoverBlock === "obsidian"
          ? i.name === "obsidian"
          : settings.crystalCoverBlock === "planks"
            ? i.name.endsWith("_planks")
            : settings.crystalCoverBlock === "cobblestone"
              ? i.name === "cobblestone"
              : false,
      ) ??
      (settings.crystalCoverBlock === "auto"
        ? (items.find((i) => i.name === "obsidian") ??
          items.find((i) => i.name === "cobblestone") ??
          items.find((i) => i.name.endsWith("_planks")))
        : null);
    if (settings.crystalBreak)
      for (const entity of [...(frame?.crystals ?? entities().filter(isCrystal))].sort(
        (a, b) =>
          Number([...placed.values()].some((p) => p.id === b.id)) -
          Number([...placed.values()].some((p) => p.id === a.id)),
      )) {
        if (!breaking(target, entity, time, bot, false)) continue;
        const choice = protect(
          entity.position,
          time,
          coverItem,
          breaking(target, entity, time),
          (world) => breaking(target, entity, time, world),
        );
        if (choice) {
          candidates.push(choice.nextCover ? { ...choice, ...choice.nextCover } : choice);
          if (choice.finish) break;
        }
      }
    const continuing = (action) => ({ ...action, committed: committed(action, time) });
    const best = () =>
      candidates
        .map(continuing)
        .filter((action) => scoreAction?.(action) !== -Infinity)
        .sort(compare)[0] ?? null;
    const immediate = best();
    if (immediate) return immediate;
    candidates.length = 0;
    // A confirmed crystal is the current job even when the opponent runs away.
    // Keep it available for a safer/visible approach instead of replacing its
    // cycle with another foundation and accumulating explosive leftovers.
    if (settings.crystalBreak && [...placed.values()].some((p) => p.id !== null)) {
      return reject("finishing placed crystal: reposition for reach, visibility or self damage");
    }
    if (settings.crystalPlace && items.some((i) => i.name === "end_crystal")) {
      // Vec3.floor() mutates its receiver: never snap the live physics position
      // back to a block corner on every planning tick.
      const origin = bot.entity.position.floored(),
        radius = Math.ceil(settings.crystalPlaceRange);
      const positions = [];
      const consider = (p, y) => {
        if (failedBases.has(p.toString())) return;
        const block = blockAt(p);
        if (
          ["obsidian", "bedrock"].includes(block?.name) ||
          (y <= 0 && settings.crystalBuildBase && obsidian && air(block))
        )
          positions.push({ p, block });
      };
      if (cycle) consider(cycle.base, cycle.base.y - origin.y);
      else
        for (let x = -radius; x <= radius; x++)
          for (let y = -3; y <= 2; y++)
            for (let z = -radius; z <= radius; z++) {
              const p = origin.offset(x, y, z);
              // No visible face of this cube can be reached outside this bound.
              const eye = eyes(bot);
              const dx = Math.max(p.x - eye.x, 0, eye.x - p.x - 1);
              const dy = Math.max(p.y - eye.y, 0, eye.y - p.y - 1);
              const dz = Math.max(p.z - eye.z, 0, eye.z - p.z - 1);
              if (dx * dx + dy * dy + dz * dz > settings.crystalPlaceRange ** 2) continue;
              consider(p, y);
            }
      // Reuse a safe existing base first. Search new foundations toward the target
      // (or toward the bot in proximity mode), stopping at the first safe layout.
      const preferred =
        settings.crystalPriority === "closest" ? bot.entity.position : target.position;
      positions.sort(
        (a, b) =>
          Number(air(a.block)) - Number(air(b.block)) ||
          a.p.distanceTo(preferred) - b.p.distanceTo(preferred),
      );
      for (const { p, block: existing } of positions) {
        if (air(existing) && candidates.length) break;
        const build =
          settings.crystalBuildBase && air(existing) && obsidian
            ? blockAction(p, obsidian, "build", time)
            : null;
        const base = build ? { name: "obsidian", position: p, boundingBox: "block" } : existing;
        if (!["obsidian", "bedrock"].includes(base?.name)) continue;
        const simulation = build ? overlay(readWorld(bot), [base]) : bot;
        const reachable = placement(target, base, time, false, simulation);
        if (!reachable) continue;
        const choice = protect(
          p.offset(0.5, 1, 0.5),
          time,
          coverItem,
          placement(target, base, time, true, simulation),
          (world) => placement(target, base, time, true, world),
          build ? [base] : [],
          build && coverItem?.name === "obsidian" ? 1 : 0,
        );
        if (choice) {
          const action = build
            ? { ...choice, ...build }
            : choice.nextCover
              ? { ...choice, ...choice.nextCover }
              : choice;
          if (scoreAction?.(continuing(action)) !== -Infinity) candidates.push(action);
        }
      }
      if (cycle && !candidates.length && time - cycle.progressAt >= settings.crystalIntervalMs) {
        failedBases.set(cycle.base.toString(), time + 1000);
        cycle = null;
        // A moving target can invalidate a layout between two actions. Select
        // another one now instead of parking at the rejected base for seconds.
        return plan(target, time);
      }
    } else if (settings.crystalPlace) {
      reason = "no end crystals in inventory";
      if (!cycle?.crystalId) cycle = null;
    }
    if (!candidates.length && settings.crystalBuildBase && !obsidian && !reason.includes("damage"))
      reason += "; no obsidian for a new base";
    const selected = best();
    if (!selected && candidates.length)
      reason = "no profitable crystal trade; maintain weapon pressure";
    return selected;
  }
  function aimed(action) {
    if (!action) return null;
    const origin = eyes(bot),
      direction = viewDirection(bot);
    if (action.type === "break") {
      // Use the same first-entity ray when selecting and verifying an attack.
      // A player blocking every ray must trigger repositioning, not endless aim retries.
      const range = crystalRay(action.crystal, direction);
      if (range === null) return null;
      return { ...action, aim: origin.plus(direction.scaled(range)), range };
    }
    const reference = action.type === "place" ? action.base : action.reference;
    const hit = bot.world.raycast(origin, direction, settings.crystalPlaceRange);
    if (!hit?.position.equals(reference.position) || !hitFaces[hit.face]?.equals(action.face))
      return null;
    return { ...action, aim: hit.intersect, range: hit.intersect.distanceTo(origin) };
  }
  function reposition(target, time, pressure = false) {
    const own = [...placed.values()].find((p) => p.id !== null);
    const focus = own ? bot.entities?.[own.id] : null;
    const origin = bot.entity.position;
    const away = origin.minus(focus?.position ?? target.position);
    away.y = 0;
    if (away.norm() < 0.01) away.set(-Math.sin(bot.entity.yaw), 0, -Math.cos(bot.entity.yaw));
    const direction = away.normalize(),
      side = new Vec3(-direction.z, 0, direction.x);
    const offsets = focus
      ? [2.5, 3.3].flatMap((distance) =>
          [0, 0.7, -0.7].map((angle) => {
            const radial = direction.scaled(Math.cos(angle)).plus(side.scaled(Math.sin(angle)));
            return focus.position.offset(
              radial.x * distance,
              origin.y - focus.position.y,
              radial.z * distance,
            );
          }),
        )
      : [
          origin.plus(direction.scaled(pressure ? 1.8 : 1.2)),
          origin.plus(side.scaled(1.6)),
          origin.minus(side.scaled(1.6)),
          origin.plus(direction.scaled(2.4)),
          origin.plus(direction.scaled(1.2)).plus(side.scaled(1.6)),
          origin.plus(direction.scaled(1.2)).minus(side.scaled(1.6)),
        ];
    const positions = offsets
      .map((point) => groundAt(bot, point))
      .filter((p) => p && p.distanceTo(origin) > 0.7);
    positions.sort(
      (a, b) =>
        Number(!walkSegment(bot, a)) - Number(!walkSegment(bot, b)) ||
        a.distanceTo(origin) - b.distanceTo(origin),
    );
    // Test the layout from the proposed standing position, including the new
    // eye ray and self damage. A waypoint must make a real next action possible.
    for (const position of positions) {
      const view = Object.create(bot);
      view.entity = { ...bot.entity, position, velocity: new Vec3(0, 0, 0) };
      view.entities = { ...bot.entities, [bot.entity.id]: view.entity };
      view.blockAt = bot.blockAt.bind(bot);
      const probe = createCrystalPlanner(
        view,
        focus
          ? { ...settings, crystalMinDamage: 0, crystalPredict: false, crystalPlace: false }
          : settings,
        isOwner,
      );
      const action = probe.plan(target, time);
      if (action && (!focus || action.crystal?.id === focus.id))
        return { position, reason: focus ? "finish crystal" : "make room for crystal" };
    }
    // No useful layout at any candidate: moving to an arbitrary side/retreat
    // point just creates an endless shuffle without improving the next action.
    return null;
  }
  function committed(action, time) {
    const base = action.base?.position ?? action.source?.offset(-0.5, -1, -0.5).floored();
    return Boolean(
      cycle &&
      base?.equals(cycle.base) &&
      time - cycle.startedAt < Math.max(4000, settings.crystalIntervalMs * 6) &&
      time - cycle.progressAt <= settings.crystalSpawnTimeoutMs + settings.crystalIntervalMs,
    );
  }
  return {
    plan: (...args) => withinDecision(() => plan(...args)),
    placement: (...args) => withinDecision(() => placement(...args)),
    breaking: (...args) => withinDecision(() => breaking(...args)),
    evaluate: (...args) => withinDecision(() => evaluate(...args)),
    reposition: (...args) => withinDecision(() => reposition(...args)),
    get active() {
      return Boolean(cycle || pendingSpawn || pendingBlock || placed.size);
    },
    get waiting() {
      return Boolean(
        pendingBlock ||
        pendingSpawn ||
        [...placed.values()].some((p) => p.id !== null && pendingBreaks.has(p.id)),
      );
    },
    get finishing() {
      return [...placed.values()].some((p) => p.id !== null);
    },
    get focus() {
      const entry = [...placed.values()].find((p) => p.id !== null);
      return entry ? bot.entities?.[entry.id] : null;
    },
    get reason() {
      return reason;
    },
    verify(target, action, time) {
      return withinDecision(() => {
        if (action.type === "place") {
          const verified = aimed(placement(target, blockAt(action.base.position), time));
          return verified && { ...verified, committed: committed(verified, time) };
        }
        if (action.type === "break") return aimed(breaking(target, action.crystal, time));
        const current = plan(target, time);
        return current?.type === action.type && current.position.equals(action.position)
          ? aimed(current)
          : null;
      });
    },
    commit(action, time) {
      if (action.type !== "break") {
        const base = action.base?.position ?? action.source.offset(-0.5, -1, -0.5).floored();
        if (!cycle || !cycle.base.equals(base))
          cycle = {
            base: base.clone(),
            covers: 0,
            attempts: 0,
            blockAttempts: 0,
            startedAt: time,
            progressAt: time,
            crystalId: action.crystal?.id,
          };
        cycle.progressAt = time;
        if (action.type === "cover") cycle.covers++;
      }
      if (action.type === "place") {
        cycle.attempts++;
        const until = time + settings.crystalSpawnTimeoutMs;
        pendingPlaces.set(action.base.position.toString(), until);
        pendingSpawn = { base: action.base.position.clone(), source: action.source.clone(), until };
        placed.set(action.base.position.toString(), {
          source: action.source.clone(),
          id: null,
          until: until + 3000,
        });
      } else if (action.type === "break")
        pendingBreaks.set(action.crystal.id, time + Math.max(500, settings.crystalIntervalMs));
      else {
        cycle.blockAttempts++;
        const until = time + settings.crystalSpawnTimeoutMs;
        pendingBlocks.set(action.position.toString(), until);
        pendingBlock = { ...action, position: action.position.clone(), until };
      }
    },
    fail(action, time) {
      if (action.type === "break") pendingBreaks.delete(action.crystal.id);
      else {
        if (cycle) failedBases.set(cycle.base.toString(), time + 1000);
        if (action.type === "place") placed.delete(action.base.position.toString());
        pendingPlaces.clear();
        pendingBlocks.clear();
        pendingSpawn = null;
        pendingBlock = null;
        cycle = null;
      }
    },
    clear() {
      pendingPlaces.clear();
      pendingBreaks.clear();
      pendingBlocks.clear();
      pendingSpawn = null;
      pendingBlock = null;
      cycle = null;
      failedBases.clear();
      placed.clear();
    },
  };
}

module.exports = { isCrystal, explosionDamage, createCrystalPlanner };
