"use strict";

const { Vec3 } = require("vec3");
const { dimensionOf } = require("./fleet-crew.cjs");
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const near = (a, b, radius) => Math.abs(a.y - b.y) < 1.5 && flat(a, b) < radius;
const key = p => `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
const center = p => new Vec3(Math.floor(p.x) + 0.5, Math.floor(p.y), Math.floor(p.z) + 0.5);
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const dangerous = /lava|water|fire|cactus|magma|campfire|berry_bush|powder_snow|portal|cobweb/;

// Only level, loaded, dry ground is used for yielding. Normal navigation
// remains responsible for stairs, jumps, swimming, digging and placement.
function safeCell(bot, p) {
  const floor = bot.blockAt(p.offset(0, -1, 0));
  const feet = bot.blockAt(p), head = bot.blockAt(p.offset(0, 1, 0));
  return Boolean(floor && feet && head && floor.boundingBox === "block" &&
    (!floor.shapes || floor.shapes.some(s => s[0] === 0 && s[2] === 0 && s[3] === 1 && s[4] === 1 && s[5] === 1)) &&
    [floor, feet, head].every(b => !dangerous.test(b.name) && !b.getProperties?.().waterlogged) &&
    feet.boundingBox === "empty" && head.boundingBox === "empty");
}

function bodySpace(bot, p) {
  for (let x = Math.floor(p.x - 0.29); x <= Math.floor(p.x + 0.29); x++)
    for (let z = Math.floor(p.z - 0.29); z <= Math.floor(p.z + 0.29); z++)
      for (let y = Math.floor(p.y + 0.02); y <= Math.floor(p.y + 1.78); y++) {
        const block = bot.blockAt(new Vec3(x, y, z));
        if (!block) return false;
        for (const shape of block.shapes || (block.boundingBox === "block" ? [[0, 0, 0, 1, 1, 1]] : []))
          if (x + shape[0] < p.x + 0.29 && x + shape[3] > p.x - 0.29 &&
              y + shape[1] < p.y + 1.78 && y + shape[4] > p.y + 0.02 &&
              z + shape[2] < p.z + 0.29 && z + shape[5] > p.z - 0.29) return false;
      }
  return true;
}

function createFleetNavigation(bot, crew, { enabled = true, now = Date.now, pollMs = 180 } = {}) {
  let disposed = false, pending = false, peers = [], allowed = true, blocker = null;
  let updatedAt = -Infinity, published = [], yieldPath = [], yielded = false;
  let waitingAt = null, nextYieldAt = 0, lastResetAt = -Infinity, refuge = null;
  let queueProgressAt = 0, queuePeer = null;
  let revision = 0, dimension = dimensionOf(bot);
  let entityCacheAt = -Infinity;
  const entities = new Map();
  const activePeers = () => enabled && now() - updatedAt < 1800 ? peers : [];
  const peerPosition = peer => {
    if (now() - entityCacheAt >= 40) {
      entityCacheAt = now(); entities.clear();
      for (const entity of Object.values(bot.entities || {}))
        if (entity.username && entity.isValid !== false) entities.set(entity.username.toLowerCase(), entity);
    }
    const entity = entities.get(peer.name);
    return entity?.position || peer.pos;
  };
  function route() {
    if (!bot.pathfinder?.isPathing) return [];
    const path = bot.pathfinder.currentPath;
    let moves = path?.length ? path.slice(bot.pathfinder.currentIndex || 0) : published;
    const active = bot.pathfinder.currentMove;
    if (active) {
      // An optimizer can merge many raw steps into the current move. Its exit
      // is ahead; the raw currentIndex may still point at a passed waypoint.
      const end = moves.findIndex(move => move.exitPos?.equals(active.exitPos));
      moves = [active, ...(end >= 0 ? moves.slice(end + 1) : [])];
    }
    const points = [];
    let previous = bot.entity.position;
    for (const move of moves) {
      const target = move.exitPos || move;
      if (!target) continue;
      const steps = Math.max(1, Math.ceil(previous.distanceTo(target)));
      for (let step = 1; step <= steps && points.length < 16; step++) {
        const point = previous.plus(target.minus(previous).scaled(step / steps));
        if (!near(point, bot.entity.position, 0.25)) points.push(point);
      }
      previous = target;
      if (points.length >= 16) break;
    }
    return points;
  }
  function corridorFor(points) {
    const cells = new Map();
    const checked = new Map();
    const safe = p => {
      const id = key(p);
      if (!checked.has(id)) checked.set(id, safeCell(bot, p));
      return checked.get(id);
    };
    let previous = bot.entity.position;
    for (const point of points.slice(0, 12)) {
      const p = center(point);
      // Route samples include half-height stairs and sloping cave exits.
      // Their side clearance uses the actual collision shapes at feet height;
      // safeCell remains deliberately stricter for manual flat-ground yielding.
      const step = point.minus(previous);
      const sideways = Math.abs(step.x) >= Math.abs(step.z) ? new Vec3(0, 0, 1) : new Vec3(1, 0, 0);
      if (!bodySpace(bot, point.plus(sideways)) && !bodySpace(bot, point.minus(sideways)))
        cells.set(key(point), point);
      previous = point;
      // Extend straight narrow lanes behind and ahead. Opposing workers then
      // reserve the same lane before entering it, including at cave exits.
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const wall = (q) => !safe(q.offset(dz, 0, dx)) && !safe(q.offset(-dz, 0, -dx));
        if (!safe(p) || !wall(p)) continue;
        cells.set(key(p), p);
        for (const sign of [-1, 1]) for (let step = 1; step <= 12; step++) {
          const q = p.offset(dx * step * sign, 0, dz * step * sign);
          if (!safe(q) || !wall(q)) break;
          cells.set(key(q), q);
        }
      }
    }
    return [...cells.values()].slice(0, 96);
  }
  async function publish() {
    if (disposed || pending || !bot.entity?.position) return;
    const dim = dimensionOf(bot);
    if (dim !== dimension) {
      dimension = dim; peers = []; yieldPath = []; published = []; updatedAt = -Infinity;
    }
    const points = enabled ? route() : [];
    pending = true;
    const version = revision;
    try {
      const reply = await crew.request("traffic", { enabled, dim, pos: bot.entity.position,
        route: points, corridor: enabled ? corridorFor(points) : [] });
      if (disposed || version !== revision || dimensionOf(bot) !== dim || !reply) return;
      peers = Array.isArray(reply.peers) ? reply.peers : [];
      allowed = reply.allowed !== false;
      blocker = reply.blocker;
      updatedAt = now();
    } catch { /* IPC is advisory; normal navigation works while reconnecting. */ }
    finally { pending = false; }
  }
  function clearControls() {
    for (const control of ["forward", "back", "left", "right", "sprint", "jump"]) bot.setControlState(control, false);
  }
  function replan() {
    if (now() - lastResetAt < 2000 || !bot.pathfinder?.isPathing) return;
    lastResetAt = now();
    void bot.pathfinder.reset?.("goalUpdated").catch(() => {});
  }
  function occupied(p, radius = 0.95) {
    return activePeers().some(peer => near(p, peerPosition(peer), radius));
  }
  function findRefuge(other) {
    const start = center(bot.entity.position), queue = [{ p: start, path: [] }], seen = new Set([key(start)]);
    const dangerPath = other.route || [];
    let best = null;
    for (let i = 0; i < queue.length && i < 160; i++) {
      const entry = queue[i];
      if (entry.path.length >= 8) continue;
      for (const [dx, dz] of directions) {
        const p = entry.p.offset(dx, 0, dz), id = key(p);
        if (seen.has(id)) continue;
        seen.add(id);
        if (!safeCell(bot, p) || occupied(p, 1.05)) continue;
        const path = [...entry.path, p];
        queue.push({ p, path });
        // A bay outside the other route is preferable to backing up. If the
        // tunnel has no bay yet, retreat away from the approaching worker.
        const clearance = Math.min(4, ...dangerPath.map(q => flat(p, q)));
        const away = flat(p, peerPosition(other)) - flat(start, peerPosition(other));
        const score = (clearance >= 1.1 ? 50 : 0) + Math.min(away, 2) * 2 - path.length * 3;
        if ((clearance >= 1.1 || away >= 1.5) && (!best || score > best.score)) best = { path, score };
      }
    }
    return best?.path || [];
  }
  function retreat(other) {
    if (refuge && near(bot.entity.position, refuge, 0.2)) { clearControls(); return; }
    if (!yieldPath.length && now() >= nextYieldAt) {
      nextYieldAt = now() + 900;
      yieldPath = findRefuge(other);
      const last = yieldPath[yieldPath.length - 1];
      refuge = last && !(other.route || []).some(p => near(p, last, 1.1)) ? last : null;
    }
    while (yieldPath.length && flat(bot.entity.position, yieldPath[0]) < 0.15) yieldPath.shift();
    const next = yieldPath[0];
    if (!next || !safeCell(bot, next) || occupied(next, 0.9)) { clearControls(); return; }
    // Never cut a corner or cross a missing floor after another bot digs it.
    const midpoint = bot.entity.position.plus(next).scaled(0.5);
    if (!safeCell(bot, center(midpoint))) { yieldPath = []; clearControls(); return; }
    clearControls();
    const dx = next.x - bot.entity.position.x, dz = next.z - bot.entity.position.z;
    void bot.look(Math.atan2(-dx, -dz), 0, true)?.catch(() => {});
    bot.setControlState("forward", true);
    yielded = true;
  }
  function pause(move) {
    const list = activePeers();
    if (!list.length || !bot.entity.onGround || bot.targetDigBlock || bot.launcherPearling) {
      waitingAt = null; yieldPath = []; refuge = null; return false;
    }
    const pos = bot.entity.position, to = move.exitPos || move;
    const ahead = list.find(peer => {
      const p = peerPosition(peer), dx = to.x - pos.x, dz = to.z - pos.z;
      const projection = ((p.x - pos.x) * dx + (p.z - pos.z) * dz) / Math.max(0.01, dx * dx + dz * dz);
      const lateral = flat(p, { x: pos.x + dx * projection, z: pos.z + dz * projection });
      return near(pos, p, 2.3) && projection > 0 && projection <= 1.1 && lateral < 0.95;
    });
    const denied = !allowed && now() - updatedAt < 1800;
    if (!denied && !ahead) {
      waitingAt = null; yieldPath = []; refuge = null;
      if (yielded) { yielded = false; replan(); clearControls(); return true; }
      return false;
    }
    if (waitingAt == null) { waitingAt = now(); queueProgressAt = now(); queuePeer = null; }
    clearControls();
    const other = list.find(peer => peer.name === blocker) || ahead;
    if (other) {
      const pos = peerPosition(other);
      if (!queuePeer || queuePeer.name !== other.name || !near(queuePeer, pos, 0.2)) {
        queuePeer = { name: other.name, x: pos.x, y: pos.y, z: pos.z };
        queueProgressAt = now();
      }
    }
    const opposing = other?.route?.length &&
      (other.route[0].x - peerPosition(other).x) * (to.x - pos.x) +
      (other.route[0].z - peerPosition(other).z) * (to.z - pos.z) < -0.1;
    if (other && denied && (opposing || !other.moving) && now() - waitingAt > 350) retreat(other);
    if (!denied && now() - waitingAt > 1400 && !yieldPath.length) replan();
    return true;
  }
  function idleYield() {
    if (disposed || !enabled || bot.health <= 0 || bot.isAlive === false || bot.pathfinder?.isPathing || !bot.entity?.onGround ||
        bot.targetDigBlock || bot.currentWindow || bot.launcherPearling || bot.launcherSurvival?.busy ||
        (bot.launcherCombat?.status && bot.launcherCombat.status !== "idle" && bot.launcherCombat.status !== "hostile mobs")) return;
    const approaching = activePeers().find(peer => peer.moving &&
      near(peerPosition(peer), bot.entity.position, 3) && peer.route.some(p => near(p, bot.entity.position, 0.9)));
    if (approaching) retreat(approaching);
    else if (yielded) { clearControls(); yielded = false; yieldPath = []; refuge = null; }
  }
  function pathGenerated(path) {
    published = path.path || [];
    void publish();
  }
  const timer = setInterval(() => void publish(), pollMs);
  timer.unref?.();
  bot.on("pathGenerated", pathGenerated);
  bot.on("physicsTick", idleYield);
  const controller = {
    pause,
    cost(from, to) {
      let cost = 0;
      for (const peer of activePeers()) {
        const p = peerPosition(peer);
        if (near(to, p, 1.1)) cost += 60;
        else if (near(to, p, 2)) cost += 8;
        // Short route prefixes discourage duplicate approaches, while finite
        // costs preserve the only available cave exit and allow queuing there.
        for (let i = 0; i < Math.min(6, peer.route.length); i++)
          if (near(to, peer.route[i], 0.8)) { cost += 12 / (i + 1); break; }
      }
      return cost;
    },
    adaptGoal(goal, kind) {
      if (!["come", "follow", "goto"].includes(kind)) return goal;
      const original = goal.isEnd.bind(goal), distance = goal.distance, sqDist = goal.sqDist;
      goal.isEnd = node => {
        if (!enabled || !activePeers().length) {
          if (distance != null) goal.distance = distance;
          if (sqDist != null) goal.sqDist = sqDist;
          return original(node);
        }
        // Retain a solo bot's exact radius. A group gets enough arrival area
        // to stand separately around its owner instead of one shared point.
        if (distance != null) goal.distance = Math.max(distance, Math.min(10, Math.sqrt(activePeers().length + 1) * 1.15));
        if (sqDist != null) goal.sqDist = Math.max(sqDist, Math.min(100, (activePeers().length + 1) * 1.3225));
        const p = node.exitPos || node;
        return original(node) && !occupied(p, 1.25) && !activePeers().some(peer =>
          peer.route.length && near(p, peer.route[peer.route.length - 1], 1.2));
      };
      return goal;
    },
    setEnabled(value) {
      if (enabled === (value !== false)) return;
      enabled = value !== false; revision++; peers = []; allowed = true;
      waitingAt = null; yieldPath = []; refuge = null;
      if (yielded) clearControls();
      yielded = false;
      void publish();
      replan();
    },
    // A moving queue is progress; a permanently blocked colleague must still
    // let gathering's normal timeout report an unreachable destination.
    get waiting() { return waitingAt != null && now() - queueProgressAt < 15000; },
    dispose() {
      disposed = true; revision++; clearInterval(timer);
      bot.off("pathGenerated", pathGenerated); bot.off("physicsTick", idleYield);
      if (yielded) clearControls();
      void crew.request("traffic", { enabled: false }).catch(() => {});
      if (bot.launcherTraffic === controller) delete bot.launcherTraffic;
    },
  };
  bot.launcherTraffic = controller;
  void publish();
  return controller;
}

module.exports = { createFleetNavigation, safeCell };
