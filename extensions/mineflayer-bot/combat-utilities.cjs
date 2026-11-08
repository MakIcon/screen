// Web trapping, lava bucketing and web escape use ordinary, server-confirmed
// block/item interactions. No client-side block or velocity changes are made.
const { Vec3 } = require("vec3");
const { toNotchianYaw, toNotchianPitch } = require("mineflayer/lib/conversions");
const { carriedItems, queueInventoryTask } = require("./combat-inventory.cjs");
const { activeEffect } = require("./potion-data.cjs");
const defaults = require("./combat-defaults.json");

const AIR = new Set(["air", "cave_air", "void_air"]);
const FACES = [
  new Vec3(0, 1, 0),
  new Vec3(1, 0, 0),
  new Vec3(-1, 0, 0),
  new Vec3(0, 0, 1),
  new Vec3(0, 0, -1),
  new Vec3(0, -1, 0),
];
const isWeb = (block) => ["cobweb", "web"].includes(block?.name);
const isWater = (block) => ["water", "flowing_water"].includes(block?.name);
const isLava = (block) => ["lava", "flowing_lava"].includes(block?.name);
const isFire = (block) => ["fire", "soul_fire"].includes(block?.name);
const fullCube = (block) =>
  block?.shapes?.some((s) => s.length === 6 && s.every((v, i) => v === (i < 3 ? 0 : 1)));
const eyes = (bot) => bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0);
const webAction = (kind) => kind === "web" || kind === "retreatWeb";
const waterAction = (kind) => ["water", "extinguish", "coolLava"].includes(kind);

function burning(bot) {
  const keys = bot.registry?.entitiesByName?.player?.metadataKeys ?? [];
  const index = keys.findIndex((key) => ["shared_flags", "entity_flags"].includes(key));
  const flags = bot.entity?.metadata?.[index >= 0 ? index : 0];
  return typeof flags === "number" && Boolean(flags & 1);
}

function overlaps(entity, cell, margin = 0) {
  const p = entity.position,
    half = (entity.width ?? 0.6) / 2 + margin;
  return (
    p.x + half > cell.x &&
    p.x - half < cell.x + 1 &&
    p.z + half > cell.z &&
    p.z - half < cell.z + 1 &&
    p.y + (entity.height ?? 1.8) + margin > cell.y &&
    p.y - margin < cell.y + 1
  );
}

function touchingBlocks(bot, entity, predicate) {
  if (!bot.blockAt || !entity?.position) return [];
  const p = entity.position,
    half = (entity.width ?? 0.6) / 2;
  const result = [];
  for (let x = Math.floor(p.x - half + 0.001); x <= Math.floor(p.x + half - 0.001); x++)
    for (
      let y = Math.floor(p.y + 0.001);
      y <= Math.floor(p.y + (entity.height ?? 1.8) - 0.001);
      y++
    )
      for (let z = Math.floor(p.z - half + 0.001); z <= Math.floor(p.z + half - 0.001); z++) {
        const block = bot.blockAt(new Vec3(x, y, z));
        if (predicate(block)) result.push(block);
      }
  return result.sort((a, b) => eyes(bot).distanceTo(a.position) - eyes(bot).distanceTo(b.position));
}

function touchingWebs(bot, entity = bot.entity) {
  return touchingBlocks(bot, entity, isWeb);
}

// Trace only loaded blocks, including partial collision shapes. Unknown terrain
// is never treated as an unobstructed view. Webs/fluids themselves have no solid
// collision shapes; the endpoint can be an explicitly selected web/source.
function clearRay(bot, point, endpoint, pickup = false) {
  const origin = eyes(bot),
    delta = point.minus(origin),
    length = delta.norm();
  if (length > 4.5 || !Number.isFinite(length)) return false;
  for (let d = 0; d < length; d += 0.06) {
    const p = origin.plus(delta.scaled(d / (length || 1)));
    const block = bot.blockAt(p);
    if (!block) return false;
    if (endpoint && block.position.equals(endpoint)) continue;
    // An empty bucket hits the first fluid source on its ray, even though
    // fluids have no collision boxes. Do not accidentally steal another source.
    if (pickup && (isWeb(block) || fluidSource(block, "water") || fluidSource(block, "lava")))
      return false;
    const q = p.minus(block.position);
    if (
      block.shapes?.some(
        (s) =>
          q.x > s[0] + 0.001 &&
          q.x < s[3] - 0.001 &&
          q.y > s[1] + 0.001 &&
          q.y < s[4] - 0.001 &&
          q.z > s[2] + 0.001 &&
          q.z < s[5] - 0.001,
      )
    )
      return false;
  }
  return true;
}

function placementFace(bot, cell) {
  for (const face of FACES) {
    const reference = bot.blockAt(cell.minus(face));
    if (!fullCube(reference)) continue;
    const point = reference.position.offset(
      0.5 + face.x * 0.5,
      0.5 + face.y * 0.5,
      0.5 + face.z * 0.5,
    );
    // The eye must be outside the chosen face, rather than seeing the back of
    // a wall and asking the server to place through it.
    if (eyes(bot).minus(point).dot(face) <= 0.001 || !clearRay(bot, point)) continue;
    return { reference, face, point };
  }
  return null;
}

function fluidSource(block, kind) {
  if (!(kind === "water" ? isWater(block) : isLava(block))) return false;
  return Number(block.getProperties?.().level ?? block.metadata) === 0;
}

// Bucket use raycasts OUTLINE shapes on the server. A cobweb has a full outline
// despite having no collision box: looking through it at the floor pours onto
// the web's hit face instead. Predict that actual destination before use.
function bucketDestination(bot, point) {
  const origin = eyes(bot),
    delta = point.minus(origin);
  if (delta.norm() < 0.001 || delta.norm() > 4.5) return null;
  const dir = delta.normalize(),
    cell = origin.floored();
  const axes = ["x", "y", "z"];
  const steps = axes.map((a) => Math.sign(dir[a]));
  const next = axes.map((a, i) =>
    dir[a] === 0 ? Infinity : (cell[a] + (steps[i] > 0 ? 1 : 0) - origin[a]) / dir[a],
  );
  for (let distance = 0; distance <= 4.5; ) {
    const block = bot.blockAt(cell);
    if (!block) return null;
    if (!isWater(block) && !isLava(block)) {
      const shapes = isWeb(block)
        ? [[0, 0, 0, 1, 1, 1]]
        : ["fire", "soul_fire"].includes(block.name)
          ? [[0, 0, 0, 1, 1 / 16, 1]]
          : (block.shapes ?? []);
      for (const shape of shapes) {
        let near = -Infinity,
          far = Infinity,
          normal = null;
        for (let i = 0; i < 3; i++) {
          const a = axes[i],
            local = origin[a] - cell[a];
          if (!dir[a]) {
            if (local < shape[i] || local > shape[i + 3]) far = -Infinity;
            continue;
          }
          const t1 = (shape[i] - local) / dir[a],
            t2 = (shape[i + 3] - local) / dir[a];
          if (Math.min(t1, t2) > near) {
            near = Math.min(t1, t2);
            normal = new Vec3(0, 0, 0);
            normal[a] = -steps[i];
          }
          far = Math.min(far, Math.max(t1, t2));
        }
        if (normal && far >= Math.max(0, near) && Math.max(0, near) <= 4.5) {
          if (near < 0) {
            const a = axes.reduce((best, a) => (Math.abs(dir[a]) > Math.abs(dir[best]) ? a : best));
            normal = new Vec3(0, 0, 0);
            normal[a] = -Math.sign(dir[a]);
          }
          return cell.plus(normal);
        }
      }
    }
    const index = next.indexOf(Math.min(...next));
    distance = next[index];
    cell[axes[index]] += steps[index];
    next[index] += Math.abs(1 / dir[axes[index]]);
  }
  return null;
}

function createCombatUtilities(
  bot,
  settings,
  {
    now = Date.now,
    isOwner = () => false,
    isCombatTarget = () => false,
    onStatus = () => {},
    beforeStart = async () => {},
  } = {},
) {
  let job = null,
    source = null,
    generation = 0,
    disposed = false;
  let task = Promise.resolve(),
    nextWebAt = 0,
    nextLavaAt = 0,
    nextEscapeAt = 0;
  let waterFailedUntil = 0,
    swordFailedUntil = 0,
    combo = null;
  let nextRetreatAt = 0,
    nextExtinguishAt = 0,
    burningSince = null;
  const deferredSources = [];
  const retreatTrail = [];
  const motion = new WeakMap();
  const count = (name) =>
    carriedItems(bot).reduce((n, i) => n + (i.name === name ? (i.count ?? 1) : 0), 0);
  const item = (name) => carriedItems(bot).find((i) => i.name === name);
  const sword = () =>
    carriedItems(bot)
      .filter((i) => i.name.endsWith("_sword"))
      .sort((a, b) => (bot.digTime ? digTime(a) - digTime(b) : 0))[0];
  function digTime(weapon) {
    const web = touchingWebs(bot)[0];
    return web?.digTime?.(weapon.type, false, false, false, [], bot.entity.effects ?? {}) ?? 400;
  }
  const blocked = () =>
    disposed ||
    bot.health <= 0 ||
    bot.isAlive === false ||
    (bot._client?.state && bot._client.state !== "play") ||
    bot.launcherSurvival?.busy ||
    bot.launcherProduction?.busy ||
    bot.launcherPearling ||
    bot.launcherDefendingBow;
  const valid = (j) => job === j && j.revision === generation && !blocked() && j.current();
  const recoveryOption = (key) =>
    settings.utilityRecoverySettings ? settings[key] : defaults[key];
  const deadline = () =>
    recoveryOption("utilityConfirmTimeoutMs") +
    Math.min(1500, Math.max(0, bot.player?.ping || 0) * 2);

  function protectedCell(cell, lava = false, enemy = null) {
    const margin = lava ? 1.1 : 0.15;
    return [
      bot.entity,
      ...Object.values(bot.entities ?? {}).filter(
        (e) =>
          e.isValid !== false &&
          e.position &&
          isOwner(e.username) &&
          !(e === enemy && isCombatTarget(e)),
      ),
    ].some((e) => overlaps(e, cell, margin));
  }
  function replaceable(cell, fluid = false) {
    const block = bot.blockAt(cell);
    return (
      block &&
      (AIR.has(block.name) ||
        (fluid && (isWeb(block) || ["fire", "soul_fire"].includes(block.name))))
    );
  }
  function lavaSafe(cell, enemy) {
    if (protectedCell(cell, true, enemy) || bot.entity.isInWater || bot.entity.isInLava)
      return false;
    // Do not pour into water (obsidian/cobblestone), an unknown neighbour, or
    // an uncontained drop where the lava can run down beneath the bot/owners.
    const support = bot.blockAt(cell.offset(0, -1, 0));
    const onWeb = isWeb(support) && fullCube(bot.blockAt(cell.offset(0, -2, 0)));
    for (const face of FACES.slice(0, 5)) {
      const adjacent = bot.blockAt(cell.plus(face));
      if (!adjacent || isWater(adjacent)) return false;
      if (
        face.y === 0 &&
        !fullCube(adjacent) &&
        !fullCube(bot.blockAt(cell.plus(face).offset(0, -1, 0))) &&
        !(onWeb && fullCube(bot.blockAt(cell.plus(face).offset(0, -2, 0))))
      )
        return false;
    }
    return fullCube(support) || onWeb;
  }
  function escapeExit() {
    const p = bot.entity.position;
    return FACES.slice(1, 5)
      .map((face) => p.floored().plus(face))
      .filter(
        (cell) =>
          [cell, cell.offset(0, 1, 0)].every((c) => {
            const b = bot.blockAt(c);
            return b && (AIR.has(b.name) || isWater(b));
          }) && fullCube(bot.blockAt(cell.offset(0, -1, 0))),
      )
      .map((cell) => cell.offset(0.5, 0, 0.5))
      .sort((a, b) => p.distanceTo(a) - p.distanceTo(b))[0];
  }
  function waterPlan(webs, extinguish = false, lava = []) {
    if (
      (!extinguish && (!settings.webEscapeWater || now() < waterFailedUntil)) ||
      !item("water_bucket") ||
      /nether/i.test(String(bot.game?.dimension ?? ""))
    )
      return null;
    const exit = escapeExit();
    const cells = [
      ...lava
        .flatMap((b) => FACES.slice(1, 5).map((f) => b.position.plus(f)))
        .sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position)),
      ...webs.map((b) => b.position),
      ...(extinguish ? [bot.entity.position.floored()] : []),
      ...FACES.slice(1, 5).map((f) => bot.entity.position.floored().plus(f)),
    ];
    for (const cell of cells) {
      if (!replaceable(cell, true) || !fullCube(bot.blockAt(cell.offset(0, -1, 0)))) continue;
      if (FACES.some((f) => !bot.blockAt(cell.plus(f)))) continue;
      const face = placementFace(bot, cell);
      if (face) {
        const actual = bucketDestination(bot, face.point);
        if (
          actual &&
          replaceable(actual, true) &&
          (!lava.length || lava.some((b) => actual.distanceTo(b.position) <= 1.01)) &&
          clearRay(bot, actual.offset(0.5, 0.5, 0.5), actual)
        )
          return { cell: actual, ...face, exit, lava: lava.map((b) => b.position.clone()) };
      }
    }
    return null;
  }
  function lavaThreats() {
    if (!settings.extinguishLava || !bot.blockAt || !bot.entity?.position) return [];
    const p = bot.entity.position.floored(),
      result = [];
    const ours = [source, ...deferredSources].filter((s) => s?.kind === "lava");
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++)
        for (let y = -1; y <= 1; y++) {
          const block = bot.blockAt(p.offset(x, y, z));
          if (
            isLava(block) &&
            block.position.offset(0.5, 0, 0.5).distanceTo(bot.entity.position) <= 2.5 &&
            !ours.some((s) => s.cell.equals(block.position))
          )
            result.push(block);
        }
    return result;
  }
  function fireContact() {
    return touchingBlocks(bot, bot.entity, isFire).length > 0;
  }
  function rememberRetreat(retreating) {
    const p = bot.entity.position.floored();
    while (retreatTrail.length && now() - retreatTrail[0].at > 4000) retreatTrail.shift();
    if (!retreating) {
      retreatTrail.length = 0;
      return;
    }
    if (!retreatTrail.at(-1)?.cell.equals(p)) retreatTrail.push({ cell: p, at: now() });
  }
  function observe(enemy) {
    const old = motion.get(enemy),
      at = now();
    let velocity = old && at - old.at <= 250 ? old.velocity : new Vec3(0, 0, 0);
    if (old?.position.equals(enemy.position)) return velocity;
    if (old && !old.position.equals(enemy.position) && at > old.at) {
      velocity = enemy.position.minus(old.position).scaled(50 / Math.max(50, at - old.at));
      if (velocity.norm() > 0.7) velocity = new Vec3(0, 0, 0); // teleport, not a run
    }
    motion.set(enemy, { position: enemy.position.clone(), at, velocity });
    return velocity;
  }
  function attackPlan(enemy, velocity) {
    if (
      !enemy ||
      (isOwner(enemy.username) && !isCombatTarget(enemy)) ||
      ["creative", "spectator", "adventure"].includes(bot.game?.gameMode)
    )
      return null;
    const trapped = touchingWebs(bot, enemy).length > 0;
    if (combo && (combo.enemy !== enemy || now() > combo.until)) combo = null;
    if (combo && !trapped) return null;
    const lead = Math.min(
      settings.webPredictionTicks,
      1 + Math.max(0, bot.player?.ping || 0) / 100,
    );
    const cells = [
      enemy.position.plus(velocity.scaled(lead)).floored(),
      enemy.position.floored(),
    ].filter((cell, i, all) => all.findIndex((other) => other.equals(cell)) === i);
    const web =
      settings.webTrap &&
      !trapped &&
      !combo &&
      now() >= nextWebAt &&
      enemy.position.distanceTo(bot.entity.position) <= settings.webTrapDistance &&
      (item("cobweb") || item("web"));
    for (const cell of cells) {
      if (
        web &&
        replaceable(cell) &&
        !protectedCell(cell, false, enemy) &&
        placementFace(bot, cell)
      )
        return { kind: "web", cell, ...placementFace(bot, cell), item: web };
    }
    if (
      !settings.lavaBucket ||
      bot.health < settings.lavaMinHealth ||
      enemy.position.distanceTo(bot.entity.position) > settings.lavaMaxDistance ||
      now() < nextLavaAt ||
      !item("lava_bucket") ||
      (trapped && !settings.webLavaCombo)
    )
      return null;
    const lavaFaces = [
      ...touchingWebs(bot, enemy).map((block) => ({
        reference: block,
        face: FACES[0],
        point: block.position.offset(0.5, 1, 0.5),
      })),
      ...cells.map((cell) => placementFace(bot, cell)).filter(Boolean),
    ];
    for (const face of lavaFaces) {
      const cell = bucketDestination(bot, face.point);
      // Lava is a contact attack. Never pour at a distant predicted square and
      // hope the opponent eventually steps into a lingering source.
      if (
        !cell ||
        !overlaps(enemy, cell) ||
        !replaceable(cell) ||
        !lavaSafe(cell, enemy) ||
        !clearRay(bot, face.point)
      )
        continue;
      return { kind: "lava", cell, ...face, item: item("lava_bucket") };
    }
    return null;
  }
  function retreatPlan(enemy) {
    if (
      !settings.retreatWeb ||
      now() < nextRetreatAt ||
      bot.health > settings.retreatWebHealth ||
      enemy.position.distanceTo(bot.entity.position) > settings.retreatWebDistance ||
      (isOwner(enemy.username) && !isCombatTarget(enemy)) ||
      count("cobweb") + count("web") <= settings.retreatWebReserve ||
      ["creative", "spectator", "adventure"].includes(bot.game?.gameMode)
    )
      return null;
    const web = item("cobweb") || item("web");
    if (!web) return null;
    const p = bot.entity.position,
      behind = enemy.position.minus(p);
    behind.y = 0;
    if (behind.norm() < 0.01) return null;
    const direction = behind.normalize();
    const cells = [
      ...retreatTrail
        .slice()
        .reverse()
        .map((entry) => entry.cell),
      ...[1, 1.5, 2].map((d) => p.plus(direction.scaled(d)).floored()),
    ];
    for (const cell of cells) {
      // Only the cleared path behind us may become a trail. Never web the next
      // retreat step or a stale breadcrumb after turning away from a pursuer.
      const delta = cell.offset(0.5, 0, 0.5).minus(p);
      if (
        delta.dot(direction) <= 0.35 ||
        delta.norm() > 3 ||
        !replaceable(cell) ||
        protectedCell(cell, false, enemy)
      )
        continue;
      const face = placementFace(bot, cell);
      if (face) return { kind: "retreatWeb", cell, ...face, item: web };
    }
    return null;
  }
  function launch(j, action) {
    j.pending = true;
    task = Promise.resolve()
      .then(action)
      .catch((error) => {
        if (job !== j || j.revision !== generation) return;
        onStatus(`PvP ${j.kind}: ${error.message}`);
        if (j.kind === "water") waterFailedUntil = now() + 5000;
        if (j.kind === "dig") swordFailedUntil = now() + 3000;
        cancel();
      })
      .finally(() => {
        j.pending = false;
      });
  }
  async function equip(j, name) {
    await queueInventoryTask(bot, async () => {
      if (!valid(j)) return;
      const available = typeof name === "string" ? item(name) : name;
      if (!available) throw new Error("item is no longer available");
      if (bot.heldItem !== available) await bot.equip(available, "hand");
    });
    return valid(j);
  }
  async function aim(j, point, endpoint) {
    if (!valid(j) || !clearRay(bot, point, endpoint)) return false;
    await bot.lookAt(point, true);
    if (!valid(j) || !clearRay(bot, point, endpoint)) return false;
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
    return true;
  }
  function start(kind, plan, enemy, current) {
    const j = {
      kind,
      plan,
      enemy,
      current,
      revision: ++generation,
      phase: "starting",
      started: now(),
      until:
        now() +
        (["dig", "water"].includes(kind)
          ? settings.webEscapeTimeoutMs
          : kind === "extinguish"
            ? Math.max(5000, deadline() + 1500)
            : 5000),
      previous: bot.heldItem,
      pending: false,
    };
    job = j;
    bot.launcherCombatUtility = true;
    if (kind === "web") nextWebAt = now() + settings.webTrapCooldownMs;
    else if (kind === "retreatWeb") nextRetreatAt = now() + settings.retreatWebCooldownMs;
    else if (kind === "lava") nextLavaAt = now() + settings.lavaCooldownMs;
    else if (kind === "extinguish") nextExtinguishAt = now() + settings.extinguishCooldownMs;
    else if (kind !== "cleanup") nextEscapeAt = now() + 500;
    launch(j, async () => {
      await beforeStart(kind);
      if (!valid(j)) return;
      bot.clearControlStates();
      if (kind === "cleanup") {
        j.phase = "pickup";
        return;
      }
      if (!(await equip(j, plan.item ?? (waterAction(kind) ? "water_bucket" : "lava_bucket"))))
        return;
      const point = kind === "dig" ? plan.block.position.offset(0.5, 0.5, 0.5) : plan.point;
      if (!(await aim(j, point, kind === "dig" ? plan.block.position : undefined)))
        throw new Error("placement is out of view/reach");
      if (kind === "dig") {
        if (!isWeb(bot.blockAt(plan.block.position)) || !bot.heldItem?.name.endsWith("_sword"))
          return finish(j);
        j.phase = "digging";
        onStatus("PvP: breaking cobweb with sword");
        await bot.dig(bot.blockAt(plan.block.position), "ignore");
        if (valid(j)) finish(j);
        return;
      }
      // Recheck the enemy and our body after asynchronous equip/aim. A target
      // can move or an owner can step into the intended square during a swap.
      if (
        !replaceable(plan.cell, !webAction(kind)) ||
        (!waterAction(kind) &&
          (protectedCell(plan.cell, kind === "lava", enemy) ||
            (kind === "lava" && (!overlaps(enemy, plan.cell) || !lavaSafe(plan.cell, enemy)))))
      )
        return finish(j);
      if (webAction(kind)) {
        const face = placementFace(bot, plan.cell);
        if (
          !face ||
          !face.reference.position.equals(plan.reference.position) ||
          !face.face.equals(plan.face)
        )
          return finish(j);
      } else if (!bucketDestination(bot, plan.point)?.equals(plan.cell)) return finish(j);
      if (kind === "web" && !overlaps(enemy, plan.cell, 0.8)) return finish(j);
      j.phase = "confirm";
      j.issued = now();
      if (webAction(kind)) {
        bot.setControlState("sneak", true);
        // Pre-aimed generic placement has no delayed look callback that could
        // send a block placement after stop/death. Confirmation is polled below.
        await bot._genericPlace(plan.reference, plan.face, {
          forceLook: "ignore",
          swingArm: "right",
        });
      } else {
        source = {
          kind: waterAction(kind) ? "water" : "lava",
          cell: plan.cell.clone(),
          created: now(),
          emptyBefore: count("bucket"),
          confirmed: false,
          tries: 0,
          nextTry: 0,
        };
        bot.activateItem();
      }
    });
    return true;
  }
  function finish(j) {
    if (!valid(j) || j.phase === "restoring") return;
    j.phase = "restoring";
    // Restoration also uses the queue and ownership token, so an emergency MLG
    // or a new target cannot have its bucket overwritten by an old completion.
    launch(j, async () => {
      if (valid(j) && bot.usingHeldItem) bot.deactivateItem();
      const previous =
        j.previous &&
        (item(j.previous.name) || carriedItems(bot).find((i) => i.name.endsWith("_sword")));
      if (previous) await equip(j, previous);
      if (!valid(j)) return;
      bot.clearControlStates();
      job = null;
      bot.launcherCombatUtility = false;
    });
  }
  function cancel(abandon = false) {
    const previous = job;
    generation++;
    job = null;
    bot.launcherCombatUtility = false;
    if (previous && !disposed && bot._client?.state === "play") {
      if (previous.kind === "dig" && bot.targetDigBlock) bot.stopDigging();
      if (!bot.launcherSurvival?.busy && bot.usingHeldItem) bot.deactivateItem();
      bot.clearControlStates();
    }
    if (abandon) {
      source = null;
      combo = null;
      deferredSources.length = 0;
      burningSince = null;
    }
  }
  function pickup(j) {
    if (!source || j.pending || now() < source.nextTry) return;
    const saved = source;
    if (saved.tries >= recoveryOption("utilityPickupRetries")) {
      onStatus(`PvP: ${saved.kind} collection was not confirmed; backing off`);
      saved.nextTry = now() + 1000;
      saved.tries = 0;
      return finish(j);
    }
    saved.tries++;
    saved.nextTry = now() + Math.max(300, Math.min(1000, bot.player?.ping || 0) + 150);
    launch(j, async () => {
      if (!(await equip(j, "bucket")) || !source || source !== saved) return;
      const point = saved.cell.offset(0.5, 0.5, 0.5);
      if (
        !clearRay(bot, point, saved.cell, true) ||
        !(await aim(j, point, saved.cell)) ||
        source !== saved ||
        !fluidSource(bot.blockAt(saved.cell), saved.kind) ||
        bot.heldItem?.name !== "bucket"
      )
        return;
      saved.picking = true;
      saved.fullBeforePickup = count(`${saved.kind}_bucket`);
      bot.activateItem();
    });
  }
  function tick(enemy, { current = () => true, offensive = true, retreating = false } = {}) {
    if (!bot.blockAt || !bot.entity?.position) return false;
    if (blocked()) {
      if (job) cancel(bot.health <= 0);
      return false;
    }
    const velocity = enemy?.position ? observe(enemy) : null;
    rememberRetreat(retreating);
    if (!job && !source && deferredSources.length) source = deferredSources.shift();
    const onFire = burning(bot) || fireContact();
    const lava = settings.enabled && settings.autoExtinguish ? lavaThreats() : [];
    burningSince = onFire ? (burningSince ?? now()) : null;
    if (
      settings.enabled &&
      settings.autoExtinguish &&
      ((onFire && bot.health <= settings.extinguishHealth) || lava.length) &&
      !["extinguish", "coolLava"].includes(job?.kind) &&
      now() >= nextExtinguishAt &&
      (lava.length || now() - burningSince >= settings.extinguishDelayMs) &&
      (lava.length || !(settings.extinguishSkipResistance && activeEffect(bot, "fire_resistance")))
    ) {
      const plan =
        waterPlan(touchingWebs(bot), true, lava) ||
        (onFire ? waterPlan(touchingWebs(bot), true) : null);
      if (plan) {
        cancel();
        if (source) {
          deferredSources.push(source);
          source = null;
        }
        const kind = plan.lava.length ? "coolLava" : "extinguish";
        onStatus(
          kind === "coolLava"
            ? "PvP: countering nearby lava with water"
            : "PvP: extinguishing with water",
        );
        nextExtinguishAt = now() + settings.extinguishCooldownMs;
        return start(kind, plan, null, () => settings.enabled && settings.autoExtinguish);
      }
    }
    if (source) {
      const block = bot.blockAt(source.cell);
      source.confirmed ||= fluidSource(block, source.kind) && count("bucket") > source.emptyBefore;
      if (
        source.picking &&
        !fluidSource(block, source.kind) &&
        count(`${source.kind}_bucket`) > source.fullBeforePickup
      ) {
        onStatus(`PvP: recovered ${source.kind} bucket`);
        source = null;
      } else if (
        (source.confirmed && block && !fluidSource(block, source.kind)) ||
        now() - source.created > recoveryOption("utilitySourceLifetimeMs")
      ) {
        onStatus("PvP: placed fluid source is no longer recoverable");
        source = null;
      }
    }
    if (job) {
      const j = job;
      if (!valid(j)) {
        cancel();
        return false;
      }
      if (now() > j.until) {
        if (j.kind === "water") waterFailedUntil = now() + 5000;
        if (j.kind === "dig") swordFailedUntil = now() + 3000;
        onStatus(`PvP ${j.kind}: server confirmation timed out`);
        cancel();
        return false;
      }
      if (j.phase === "digging" && !isWeb(bot.blockAt(j.plan.block.position))) {
        if (bot.targetDigBlock) bot.stopDigging();
        if (!j.pending) finish(j);
      }
      if (j.pending || j.phase === "restoring") return true;
      if (j.phase === "confirm") {
        if (webAction(j.kind) && isWeb(bot.blockAt(j.plan.cell))) {
          if (j.kind === "web" && settings.webLavaCombo)
            combo = { enemy: j.enemy, until: now() + settings.webComboWaitMs };
          onStatus(
            j.kind === "retreatWeb"
              ? "PvP: retreat cobweb confirmed; resuming retreat"
              : "PvP: cobweb placement confirmed",
          );
          finish(j);
        } else if (source?.confirmed) {
          j.phase = ["extinguish", "coolLava"].includes(j.kind)
            ? "extinguishing"
            : j.kind === "water"
              ? "escape"
              : "hold";
          j.confirmedAt = now();
          onStatus(`PvP: ${source.kind} placement confirmed`);
        } else if (now() - j.issued > deadline()) {
          if (j.kind === "water") waterFailedUntil = now() + 5000;
          finish(j);
        }
      } else if (j.phase === "hold") {
        if (!source) finish(j);
        else if (now() - j.confirmedAt >= settings.lavaHoldMs || !overlaps(j.enemy, source.cell))
          j.phase = "pickup";
      } else if (j.phase === "extinguishing") {
        const lavaCleared =
          j.kind !== "coolLava" ||
          j.plan.lava.every((p) => {
            const block = bot.blockAt(p);
            return block && !isLava(block);
          });
        // Water at head height clears the entity fire flag before it has
        // flowed down and washed away a fire block at the feet. Keep the source
        // until that block is gone, otherwise pickup can immediately reignite us.
        if (!burning(bot) && !fireContact() && lavaCleared && now() - j.confirmedAt >= 100) {
          onStatus(
            j.kind === "coolLava"
              ? "PvP: lava neutralization confirmed"
              : "PvP: extinguishing confirmed",
          );
          if (!settings.extinguishPickupWater) {
            source = null;
            finish(j);
          } else j.phase = "pickup";
        }
      } else if (j.phase === "escape") {
        const webs = touchingWebs(bot);
        const exit = escapeExit();
        if (!source || (!webs.length && (bot.entity.onGround || bot.entity.isInWater))) {
          bot.clearControlStates();
          if (!settings.webEscapePickupWater) {
            source = null;
            finish(j);
          } else j.phase = "pickup";
        } else if (exit && now() - j.confirmedAt < settings.webEscapeMoveMs) {
          const delta = exit.minus(bot.entity.position);
          bot.entity.yaw = Math.atan2(-delta.x, -delta.z);
          bot.setControlState("sneak", false);
          bot.setControlState("forward", true);
          bot.setControlState("sprint", (bot.food ?? 20) > 6);
          bot.setControlState("jump", Boolean(bot.entity.isInWater));
        } else if (now() - j.confirmedAt >= settings.webEscapeMoveMs) {
          waterFailedUntil = now() + 5000;
          bot.clearControlStates();
          j.phase = "pickup";
        }
      } else if (j.phase === "pickup") {
        if (!source) finish(j);
        else pickup(j);
      }
      return true;
    }
    // Retain a committed source across target loss, stop and survival preemption.
    // Cleanup never places new fluid and never routes away from another task.
    if (source) {
      if (
        source.confirmed &&
        now() >= source.nextTry &&
        item("bucket") &&
        !bot.launcherGathering?.busy &&
        clearRay(bot, source.cell.offset(0.5, 0.5, 0.5), source.cell, true)
      )
        return start("cleanup", {}, null, () => true);
    }
    if (!current() || bot.launcherGathering?.busy) return false;
    const webs = touchingWebs(bot);
    if (settings.webEscape && webs.length && now() >= nextEscapeAt) {
      const weapon = settings.webEscapeSword && now() >= swordFailedUntil ? sword() : null;
      const water = source ? null : waterPlan(webs);
      if (water && (!weapon || settings.webEscapeMode !== "sword"))
        return start("water", water, enemy, current);
      const block = webs.find((b) => clearRay(bot, b.position.offset(0.5, 0.5, 0.5), b.position));
      if (weapon && block) return start("dig", { item: weapon, block }, enemy, current);
      if (water) return start("water", water, enemy, current);
      return false;
    }
    if (!enemy || source || webs.length || !bot._genericPlace) return false;
    if (retreating) {
      const plan = retreatPlan(enemy);
      return plan ? start("retreatWeb", plan, enemy, current) : false;
    }
    if (!offensive) return false;
    const plan = attackPlan(enemy, velocity);
    return plan ? start(plan.kind, plan, enemy, current) : false;
  }
  return {
    tick,
    cancel,
    get busy() {
      return Boolean(job);
    },
    get kind() {
      return job?.kind ?? null;
    },
    get extinguishNeeded() {
      return (
        settings.enabled &&
        settings.autoExtinguish &&
        (((burning(bot) || fireContact()) &&
          bot.health <= settings.extinguishHealth &&
          !(settings.extinguishSkipResistance && activeEffect(bot, "fire_resistance"))) ||
          lavaThreats().length > 0) &&
        item("water_bucket") &&
        !/nether/i.test(String(bot.game?.dimension ?? ""))
      );
    },
    get task() {
      return task;
    },
    get status() {
      return job ? `${job.kind} ${job.phase}` : null;
    },
    dispose() {
      cancel(true);
      disposed = true;
    },
  };
}

module.exports = {
  createCombatUtilities,
  touchingWebs,
  placementFace,
  fluidSource,
  clearRay,
  bucketDestination,
  burning,
};
