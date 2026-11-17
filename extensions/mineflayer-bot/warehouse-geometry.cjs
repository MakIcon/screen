"use strict";
const { Vec3 } = require("vec3");
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const container = /chest|barrel|shulker_box/;
const hazard = /lava|water|fire|cactus|magma|campfire|berry_bush|powder_snow|portal|cobweb/;

// Container lids are inset and are not warehouse walkways. Keep normal
// one-block stairs available, but don't sprint/jump between service shelves.
function storageMoveOptions(bot, previous = bot.pathfinder.defaultMoveSettings) {
  return {
    canDig: false, canPlace: false, allow1by1towers: false,
    allowSprinting: false, allowParkour: false, allowJumpSprint: false, allowLowCeilingJumps: false,
    maxDropDown: Math.min(1, previous.maxDropDown ?? 1),
    allowWaterDrop: false, allowBucketWaterDrop: false,
    exclusionAreasStep: [...(previous.exclusionAreasStep || []), block => {
      const p = block.position;
      return [bot.blockAt(p), bot.blockAt(p.offset(0, -1, 0))]
        .some(b => b && container.test(b.name)) ? 1000000 : 0;
    }],
  };
}

function safeStand(bot, p, waiting = false) {
  const floor = bot.blockAt(p.offset(0, -1, 0)), feet = bot.blockAt(p), head = bot.blockAt(p.offset(0, 1, 0));
  if (!floor || !feet || !head || floor.boundingBox !== "block" || container.test(floor.name) ||
      (floor.shapes && !floor.shapes.some(s => s[0] === 0 && s[2] === 0 && s[3] === 1 && s[4] === 1 && s[5] === 1)) ||
      feet.boundingBox !== "empty" || head.boundingBox !== "empty" ||
      [floor, feet, head].some(b => hazard.test(b.name) || b.getProperties?.().waterlogged)) return false;
  // Waiting on a narrow jump landing or cliff rim invites server entity pushes.
  return !waiting || [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([x, z]) => {
    const b = bot.blockAt(p.offset(x, -1, z));
    return b?.boundingBox === "block" && !container.test(b.name) && !hazard.test(b.name);
  });
}

function segmentHitsBody(from, to, entity, margin = 0.06) {
  const p = entity.position, r = (entity.width || 0.6) / 2 + margin;
  let enter = 0, leave = 1;
  for (const [axis, lo, hi] of [["x", p.x - r, p.x + r], ["y", p.y, p.y + (entity.height || 1.8)], ["z", p.z - r, p.z + r]]) {
    const d = to[axis] - from[axis];
    if (Math.abs(d) < 1e-8) { if (from[axis] < lo || from[axis] > hi) return false; }
    else { const a = (lo - from[axis]) / d, b = (hi - from[axis]) / d; enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b)); }
  }
  return enter <= leave && leave > 0 && enter < 1;
}
function blockingPlayers(bot, from, to) {
  return Object.values(bot.entities || {}).filter(e => e !== bot.entity && e.username && e.isValid !== false &&
    segmentHitsBody(from, to, e));
}

function containerClick(bot, block, feet = bot.entity.position, avoidPlayers = true, reach = 4) {
  if (!block) return null;
  const eye = feet.offset(0, bot.entity.eyeHeight || 1.62, 0);
  const faces = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)];
  const centre = block.position.offset(0.5, 0.5, 0.5);
  const samples = [centre];
  for (const face of faces) for (const u of [0.25, 0.5, 0.75]) {
    const p = centre.plus(face.scaled(0.44));
    if (face.y) p.x += u - 0.5;
    else p.y += u - 0.5;
    samples.push(p);
  }
  for (const point of samples) {
    const delta = point.minus(eye), length = delta.norm();
    if (length > reach) continue;
    let hit;
    if (bot.world?.raycast) {
      hit = bot.world.raycast(eye, delta.normalize(), Math.min(reach, length + 0.15));
      if (!hit?.position.equals(block.position) || !hit.intersect || !faces[hit.face]) continue;
    } else {
      const axis = ["x", "y", "z"].sort((a, b) => Math.abs(delta[b]) - Math.abs(delta[a]))[0];
      const face = new Vec3(0, 0, 0); face[axis] = -Math.sign(delta[axis]) || 1;
      hit = { intersect: point, face: faces.findIndex(f => f.equals(face)) };
    }
    if (avoidPlayers && blockingPlayers(bot, eye, hit.intersect).length) continue;
    return { face: faces[hit.face], cursor: hit.intersect.minus(block.position) };
  }
  return null;
}

async function activateContainer(bot, block, click, guard = () => {}) {
  // activateBlock always looks at the block centre and waits for smooth aim.
  // Aim at the chosen visible face and recheck it after that asynchronous turn.
  if (!bot._client?.write || !bot.supportFeature || !bot.lookAt)
    return bot.activateBlock(block, click.face, click.cursor);
  const point = block.position.plus(click.cursor);
  await bot.lookAt(point, true);
  // A forced look changes local rotation immediately; the next physics tick
  // publishes it. Send use-block only after that rotation reaches the wire.
  if (bot.waitForTicks) await bot.waitForTicks(1);
  guard();
  const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
  const delta = point.minus(eye), length = delta.norm();
  const hit = bot.world?.raycast?.(eye, delta.normalize(), length + 0.01);
  if (!container.test(bot.blockAt(block.position)?.name || "") || length > 4 ||
      (bot.world?.raycast && (!hit?.position.equals(block.position) || hit.intersect.distanceTo(point) > 0.06)) ||
      Math.hypot(bot.entity.velocity?.x || 0, bot.entity.velocity?.z || 0) > 0.08 ||
      blockingPlayers(bot, eye, point).length || bot.getControlState?.("sneak")) {
    throw Object.assign(new Error("Позиция у сундука изменилась: нужно снова подойти к доступной грани"), { retryStorage: true });
  }
  const face = click.face;
  const direction = face.y < 0 ? 0 : face.y > 0 ? 1 : face.z < 0 ? 2 : face.z > 0 ? 3 : face.x < 0 ? 4 : 5;
  const packet = { location: block.position, direction };
  if (bot.supportFeature("blockPlaceHasHeldItem")) {
    const native = require("node:module").createRequire(require.resolve("mineflayer"));
    const Item = native("prismarine-item")(bot.registry);
    Object.assign(packet, { heldItem: Item.toNotch(bot.heldItem) });
  } else packet.hand = 0;
  const scale = bot.supportFeature("blockPlaceHasHeldItem") || bot.supportFeature("blockPlaceHasHandAndIntCursor") ? 16 : 1;
  const coordinate = value => scale === 16 ? Math.floor(value * scale) : value;
  Object.assign(packet, { cursorX: coordinate(click.cursor.x), cursorY: coordinate(click.cursor.y), cursorZ: coordinate(click.cursor.z) });
  if (bot.supportFeature("blockPlaceHasInsideBlock"))
    Object.assign(packet, { insideBlock: false, sequence: 0, worldBorderHit: false });
  // No await between the reach check and sending the interaction.
  bot._client.write("block_place", packet);
  bot.swingArm();
}

// A small clockwise loop: enter on one side of a service point, leave on the
// other. Only publish lanes whose entire body corridor has real, level floor.
// Terraces and narrow stairs keep ordinary pathfinding instead of a fake lane.
function serviceFlow(bot, bay, positions) {
  const chest = bay.chest, dx = bay.x - chest.x - 0.5, dz = bay.z - chest.z - 0.5;
  const normal = Math.abs(dx) > Math.abs(dz) ? new Vec3(Math.sign(dx), 0, 0) : new Vec3(0, 0, Math.sign(dz));
  if (!normal.x && !normal.z) return bay;
  const side = new Vec3(-normal.z, 0, normal.x), origin = new Vec3(bay.x, bay.y, bay.z);
  const clear = (from, to) => {
    const steps = Math.max(1, Math.ceil(flat(from, to) * 4));
    for (let i = 0; i <= steps; i++) {
      const p = from.plus(to.minus(from).scaled(i / steps));
      for (const x of [-0.3, 0.3]) for (const z of [-0.3, 0.3])
        if (!safeStand(bot, p.offset(x, 0, z))) return false;
    }
    return true;
  };
  for (const depth of [3, 5, 7]) {
    // Keep every waypoint at a block centre: an integer side offset preserves
    // the pathfinder's grid and its sub-half-block GoalNear arrival radius.
    const left = origin.minus(side.scaled(2)), right = origin.plus(side.scaled(2));
    const entrance = left.plus(normal.scaled(depth)), exit = right.plus(normal.scaled(depth));
    if (positions.some(p => flat(exit, p) < 4.6) ||
        !clear(entrance, left) || !clear(left, origin) || !clear(origin, right) || !clear(right, exit)) continue;
    return { ...bay, inbound: [entrance, left], outbound: [right, exit] };
  }
  return bay;
}

async function warehouseLayout(bot, positions, { signal, wait, reserved = [], targets = positions } = {}) {
  const bays = [], stages = [], seen = new Set();
  let checked = 0;
  const yieldWork = async () => {
    if (signal?.aborted) throw new Error("Поиск мест у склада прерван");
    if (++checked % 128 === 0) await (wait ? wait(bot.launcherTraffic?.workDelayMs || 0, signal) : new Promise(r => setImmediate(r)));
  };
  const chests = targets.slice(0, 64).map(p => new Vec3(p.x, p.y, p.z));
  for (const chest of chests) {
    const block = bot.blockAt(chest);
    if (!block || !container.test(block.name)) continue;
    const cells = [];
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let dy = -3; dy <= 1; dy++) {
      await yieldWork();
      const p = chest.offset(x + 0.5, dy, z + 0.5);
      if (!safeStand(bot, p) || !containerClick(bot, block, p, false, 3.65)) continue;
      cells.push({ ...p, chest: { x: chest.x, y: chest.y, z: chest.z } });
    }
    // Prefer short, straight clicks, but retain alternative sides and shelves.
    cells.sort((a, b) => flat(a, chest) + Math.abs(a.y + 1 - chest.y) - flat(b, chest) - Math.abs(b.y + 1 - chest.y));
    for (const cell of cells.slice(0, 32)) { await yieldWork(); bays.push(serviceFlow(bot, cell, positions)); }
  }
  const accessLevels = bays.length ? bays.map(p => p.y) : positions.map(p => p.y);
  const low = Math.floor(Math.min(...accessLevels, bot.entity.position.y));
  // An idle bot may already be standing on a raised warehouse landing. The
  // waiting ground can be several steps below it, outside the jump approach.
  // Every floor from just above the chests' approaches down to the ground
  // below the bot, nearest the warehouse first: its own terrace comes before
  // the bottom of the quarry it stands over.
  const top = Math.floor(Math.max(...accessLevels)) + 1;
  const levels = [...new Set([...accessLevels, bot.entity.position.y,
    ...Array.from({ length: 24 }, (_, i) => top - i)].map(Math.floor))].filter(y => y >= low - 6).slice(0, 28);
  const anchor = positions[0];
  if (anchor) for (let dx = -14; dx <= 14; dx++) for (let dz = -14; dz <= 14; dz++) for (const y of levels) {
    await yieldWork();
    const p = new Vec3(Math.floor(anchor.x) + dx + 0.5, y, Math.floor(anchor.z) + dz + 0.5);
    const id = `${p.x},${p.y},${p.z}`;
    if (seen.has(id)) continue; seen.add(id);
    const distance = Math.min(...positions.map(q => flat(p, q)));
    if (distance < 5 || distance > 14 || !safeStand(bot, p, true) ||
        bays.some(q => Math.abs(p.y - q.y) < 2 && flat(p, q) < 2.6) ||
        reserved.some(q => Math.abs(p.y - q.y) < 2 && flat(p, q) < 1.9)) continue;
    const occupied = Object.values(bot.entities || {}).some(e => e !== bot.entity && e.username && e.isValid !== false &&
      Math.abs(e.position.y - y) < 2 && flat(p, e.position) < 1.8);
    if (!occupied) stages.push(p);
  }
  // Wait beside the warehouse on its own level, close to the chests: a place
  // down in the quarry is a long walk for every wave and blocks the exit.
  const origin = bot.entity.position, floors = [...new Set(accessLevels.map(Math.floor))];
  // Steps are how colleagues reach the chests: a bot waiting at their foot or
  // head closes the warehouse for everyone, so stand a few blocks aside.
  const steps = p => {
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      if (!x && !z) continue;
      if (safeStand(bot, p.offset(x, 1, z)) || safeStand(bot, p.offset(x, -1, z))) return true;
    }
    return false;
  };
  const rank = p => Math.min(...positions.map(q => flat(p, q))) + flat(p, origin) * 0.2 +
    Math.min(...floors.map(y => Math.abs(p.y - y))) * 2.5 + (steps(p) ? 8 : 0);
  const ranks = new Map(stages.map(p => [p, rank(p)]));
  stages.sort((a, b) => ranks.get(a) - ranks.get(b));
  // A stage must not become a bollard in an entrance/exit lane. Keep candidates
  // here; the coordinator excludes lanes of the bays actually in use.
  return { bays: bays.slice(0, 192), stages: stages.slice(0, 256) };
}

// A pushed or landed bot can stand on a chest lid (14/16 high). The route
// search has no node there, so every path from it fails its first alignment
// ("Too many failures"). Walk off across the lids to real footing first.
function lidExit(bot) {
  const pos = bot.entity.position, under = bot.blockAt(pos.offset(0, -0.3, 0));
  if (!bot.entity.onGround || !under || !container.test(under.name) || pos.y - under.position.y < 0.5) return null;
  const y = under.position.y, empty = p => bot.blockAt(p)?.boundingBox === "empty";
  const busy = p => Object.values(bot.entities || {}).some(e => e !== bot.entity && e.username && e.isValid !== false &&
    Math.abs(e.position.y - p.y) < 2 && flat(e.position, p) < 0.9);
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const start = under.position, queue = [{ cell: start, path: [] }], seen = new Set([String(start)]);
  for (let i = 0; i < queue.length && i < 48; i++) {
    const { cell, path } = queue[i];
    for (const [dx, dz] of sides) {
      const next = cell.offset(dx, 0, dz), id = String(next);
      if (seen.has(id)) continue;
      seen.add(id);
      // The body sweeps this column at lid height on the way out.
      if (!empty(next.offset(0, 1, 0)) || !empty(next.offset(0, 2, 0))) continue;
      for (const dy of [1, 0, -1]) {
        const p = new Vec3(next.x + 0.5, y + dy, next.z + 0.5);
        if (safeStand(bot, p) && !busy(p)) return [...path, p];
      }
      const lid = bot.blockAt(next);
      if (lid && container.test(lid.name) && path.length < 6)
        queue.push({ cell: next, path: [...path, new Vec3(next.x + 0.5, y + 0.875, next.z + 0.5)] });
    }
  }
  return null;
}
async function leaveContainerTop(bot, { signal, timeoutMs = 2500 } = {}) {
  const path = lidExit(bot);
  if (!path) return false;
  const controls = ["forward", "back", "left", "right", "sprint", "jump", "sneak"];
  try {
    for (const p of path) {
      const until = Date.now() + timeoutMs;
      for (;;) {
        if (signal?.aborted || Date.now() > until) return false;
        const pos = bot.entity.position;
        if (flat(pos, p) < 0.22 && bot.entity.onGround && Math.abs(pos.y - p.y) < 0.3) break;
        // A colleague may enter a previously empty step-off after planning.
        // Check the swept player width, not only the destination or click ray.
        const blockers = Object.values(bot.entities || {}).filter(e => e !== bot.entity && e.username && e.isValid !== false &&
          segmentHitsBody(pos.offset(0, 0.9, 0), p.offset(0, 0.9, 0), e, 0.34));
        if (blockers.length) {
          for (const control of controls) bot.setControlState(control, control === "sneak");
          bot.launcherTraffic?.requestClearance?.(blockers.map(e => e.username));
          await new Promise(resolve => setTimeout(resolve, 40));
          continue;
        }
        for (const control of controls) bot.setControlState(control, control === "forward");
        await bot.look(Math.atan2(-(p.x - pos.x), -(p.z - pos.z)), 0, true)?.catch?.(() => {});
        await new Promise(resolve => setTimeout(resolve, 40));
      }
    }
    return true;
  } finally { for (const control of controls) bot.setControlState(control, false); }
}
module.exports = { safeStand, containerClick, activateContainer, blockingPlayers, segmentHitsBody, warehouseLayout, flat, lidExit, leaveContainerTop, storageMoveOptions };
