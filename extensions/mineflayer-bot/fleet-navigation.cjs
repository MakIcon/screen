"use strict";

const { Vec3 } = require("vec3");
const { availableParallelism } = require("node:os");
const { dimensionOf } = require("./fleet-crew.cjs");
const { warehouseLayout, safeStand, leaveContainerTop, storageMoveOptions } = require("./warehouse-geometry.cjs");
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const near = (a, b, radius) => Math.abs(a.y - b.y) < 1.5 && flat(a, b) < radius;
const key = p => `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
const center = p => new Vec3(Math.floor(p.x) + 0.5, Math.floor(p.y), Math.floor(p.z) + 0.5);
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const dangerous = /lava|water|fire|cactus|magma|campfire|berry_bush|powder_snow|portal|cobweb/;

function routeDistance(p, origin, route) {
  let distance = Math.abs(p.y - origin.y) < 1.5 ? flat(p, origin) : Infinity;
  let a = origin;
  for (const b of route) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / Math.max(0.001, dx * dx + dz * dz)));
    if (Math.abs(p.y - a.y - (b.y - a.y) * t) < 1.5)
      distance = Math.min(distance, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t));
    a = b;
  }
  return distance;
}

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

function createFleetNavigation(bot, crew, { enabled = true, now = Date.now, pollMs = 180, cpuCount = availableParallelism() } = {}) {
  let disposed = false, pending = false, peers = [], allowed = true, blocker = null;
  let updatedAt = -Infinity, published = [], yieldPath = [], yielded = false;
  let waitingAt = null, nextYieldAt = 0, lastResetAt = -Infinity, refuge = null;
  let bypass = false, bypassUntil = 0, nextBypassAt = 0;
  let idleYieldOrigin = null;
  let queueProgressAt = 0, queuePeer = null;
  let revision = 0, dimension = dimensionOf(bot);
  let entityCacheAt = -Infinity;
  const entities = new Map();
  let fleetSize = 1;
  let warehouse = [], storagePhase = "idle", serviceBay = null;
  let clearanceUntil = 0, clearRequests = [], clearSentAt = -Infinity;
  let evacuation = null, evacuationAbort = null, nextEvacuationAt = 0;
  let evacuationError = "";
  let parkingSequence = 0;
  let adaptedArrival = null, finishedArrival = null;
  let costAt = -Infinity;
  const costCells = new Map();
  const costKey = p => `${Math.floor(p.x / 4)},${Math.floor(p.y / 4)},${Math.floor(p.z / 4)}`;
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
      if (yielded) clearControls();
      bypass = false; refuge = null; yielded = false; waitingAt = null; idleYieldOrigin = null;
    }
    const points = enabled ? route() : [];
    pending = true;
    const version = revision;
    try {
      const reply = await crew.request("traffic", { enabled, dim, pos: bot.entity.position,
        route: points, motion: yieldPath.length ? yieldPath : refuge ? [] : points,
        corridor: enabled ? corridorFor(bypass ? yieldPath : points) : [],
        urgency: bot.launcherGathering?.retreating || bot.launcherCombat?.retreating ? "escape" : "normal",
        storage: warehouse.length ? { phase: evacuation ? "leaving" : storagePhase, positions: warehouse, bay: serviceBay } : null,
        clear: now() - clearSentAt < 1800 ? clearRequests : [] });
      if (disposed || version !== revision || dimensionOf(bot) !== dim || !reply) return;
      peers = Array.isArray(reply.peers) ? reply.peers : [];
      costAt = -Infinity;
      fleetSize = Math.max(1, Number(reply.members) || peers.length + 1);
      allowed = reply.allowed !== false;
      blocker = reply.blocker;
      updatedAt = now();
      if (reply.clearance?.length) {
        clearanceUntil = now() + 1800;
        if (!warehouse.length) warehouse = reply.clearance.flatMap(r => r.positions || []).slice(0, 128);
      }
    } catch { /* IPC is advisory; normal navigation works while reconnecting. */ }
    finally { pending = false; }
  }
  function clearControls() {
    for (const control of ["forward", "back", "left", "right", "sprint", "jump"]) bot.setControlState(control, false);
  }
  function replan() {
    if (now() - lastResetAt < 600 || !bot.pathfinder?.isPathing) return;
    lastResetAt = now();
    void bot.pathfinder.reset?.("goalUpdated").catch(() => {});
  }
  function occupied(p, radius = 0.95) {
    return activePeers().some(peer => near(p, peerPosition(peer), radius));
  }
  function safeSegment(from, to) {
    const steps = Math.max(1, Math.ceil(flat(from, to) / 0.2));
    for (let i = 1; i <= steps; i++) {
      const p = from.plus(to.minus(from).scaled(i / steps));
      if (!safeCell(bot, center(p)) || !bodySpace(bot, p) || occupied(p, 0.95)) return false;
    }
    return true;
  }
  // A bounded local search, used only after braking. No world edits, diagonal
  // corner cuts or repeated full path searches on every physics tick.
  function findBypass(to) {
    const origin = bot.entity.position, start = center(origin);
    if (Math.abs(to.y - origin.y) > 0.4) return [];
    const length = flat(origin, to);
    if (length < 0.8) return [];
    const dx = (to.x - origin.x) / length, dz = (to.z - origin.z) / length;
    const crowd = activePeers().filter(peer => near(origin, peerPosition(peer), 12));
    const seen = new Set([key(start)]), queue = [{ p: start, path: [] }];
    const safe = new Map();
    const traversable = p => {
      const id = key(p);
      if (!safe.has(id)) safe.set(id, safeCell(bot, p) && !occupied(p, 1.2));
      return safe.get(id);
    };
    let best = null;
    const ordered = [...directions].sort((a, b) => (-dz * b[0] + dx * b[1]) - (-dz * a[0] + dx * a[1]));
    for (let i = 0; i < queue.length && i < 160; i++) {
      const entry = queue[i];
      if (entry.path.length >= 8) continue;
      for (const [x, z] of ordered) {
        const p = entry.p.offset(x, 0, z), id = key(p);
        if (seen.has(id)) continue;
        seen.add(id);
        const progress = (p.x - origin.x) * dx + (p.z - origin.z) * dz;
        const side = -(p.x - origin.x) * dz + (p.z - origin.z) * dx;
        if (progress < -1 || progress > Math.min(4, length + 0.4) || Math.abs(side) > 3 || !traversable(p)) continue;
        // Leave the original lane sideways; subsequent steps stay clear of
        // the whole moving crowd, not just the first opposing worker.
        if (crowd.some(peer => routeDistance(p, peerPosition(peer), peer.route || []) < 0.9)) continue;
        const path = [...entry.path, p];
        queue.push({ p, path });
        if (progress < Math.min(2, length) || Math.abs(side) < 1.1) continue;
        const score = progress * 3 - path.length - Math.abs(side) * 0.5 + (side > 0 ? 0.25 : 0);
        if (!best || score > best.score) best = { path, score };
      }
    }
    return best?.path || [];
  }
  function walkYieldPath() {
    while (yieldPath.length && flat(bot.entity.position, yieldPath[0]) < 0.15) yieldPath.shift();
    const next = yieldPath[0];
    clearControls();
    if (!next) return false;
    if (!safeSegment(bot.entity.position, next)) { yieldPath = []; refuge = null; return false; }
    const dx = next.x - bot.entity.position.x, dz = next.z - bot.entity.position.z;
    void bot.look(Math.atan2(-dx, -dz), 0, true)?.catch(() => {});
    bot.setControlState("forward", true);
    yielded = true;
    return true;
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
        // A completed come may yield to the next arriving worker, but it must
        // stay inside the arrival area rather than walking away from its owner.
        if (!bot.pathfinder?.isPathing && finishedArrival &&
            (Math.abs(p.y - finishedArrival.y) > 1.5 || flat(p, finishedArrival) > finishedArrival.radius)) continue;
        if (!safeCell(bot, p) || occupied(p, 1.05)) continue;
        const path = [...entry.path, p];
        queue.push({ p, path });
        // A bay outside the other route is preferable to backing up. If the
        // tunnel has no bay yet, retreat away from the approaching worker.
        const clearance = Math.min(4, routeDistance(p, peerPosition(other), dangerPath),
          ...activePeers().filter(peer => peer !== other).map(peer => routeDistance(p, peerPosition(peer), peer.route || [])));
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
      nextYieldAt = now() + 400;
      yieldPath = findRefuge(other);
      const last = yieldPath[yieldPath.length - 1];
      refuge = last && activePeers().every(peer => routeDistance(last, peerPosition(peer), peer.route || []) >= 1.1) ? last : null;
    }
    walkYieldPath();
  }
  function pause(move) {
    const list = activePeers();
    if (!list.length || !bot.entity.onGround || bot.targetDigBlock || bot.launcherPearling) {
      waitingAt = null; yieldPath = []; refuge = null; bypass = false; return false;
    }
    const pos = bot.entity.position, to = move.exitPos || move;
    if (bypass) {
      if (now() < bypassUntil && walkYieldPath()) return true;
      bypass = false; yieldPath = []; yielded = false; waitingAt = null;
      clearControls(); replan(); void publish(); return true;
    }
    const ownName = String(bot.entity.username || bot.username || "").toLowerCase();
    const ahead = list.find(peer => {
      const p = peerPosition(peer), dx = to.x - pos.x, dz = to.z - pos.z;
      // Reserve an upper landing before takeoff, including a colleague above
      // our current feet height. Airborne steering cannot stop an entity push.
      // Only a jump needs it: on level ground the checks below stop us beside
      // a standing colleague instead of far away at the start of a long leg.
      if (to.y - pos.y > 0.4 && Math.abs(p.y - to.y) < 1.8 && flat(p, to) < 1.2 && flat(pos, p) < 6) return true;
      // At a tunnel mouth another worker can cross the lane diagonally.
      // Waiting until its centre enters the lane leaves too little braking
      // distance: clearing controls still coasts for several physics ticks.
      const velocity = entities.get(peer.name)?.velocity;
      const ownVelocity = bot.entity.velocity;
      const length = Math.max(0.01, Math.hypot(dx, dz));
      const rx = p.x - pos.x, rz = p.z - pos.z;
      const vx = ((velocity?.x || 0) - (ownVelocity?.x || 0)) * 3 - dx / length * 0.3;
      const vz = ((velocity?.z || 0) - (ownVelocity?.z || 0)) * 3 - dz / length * 0.3;
      const closing = rx * vx + rz * vz;
      const closest = Math.max(0, Math.min(1, -closing / Math.max(0.0001, vx * vx + vz * vz)));
      if (Math.abs(p.y - pos.y) < 1.5 && closing < -0.0001 && Math.hypot(rx + vx * closest, rz + vz * closest) < 1.15) return true;
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
    if (now() - waitingAt >= 120 && now() >= nextBypassAt) {
      nextBypassAt = now() + 500;
      const path = findBypass(to);
      if (path.length) {
        yieldPath = path; refuge = null; bypass = true; bypassUntil = now() + 3000;
        walkYieldPath(); void publish(); return true;
      }
    }
    const other = list.find(peer => peer.name === blocker) || ahead;
    if (other && !other.moving) controller.requestClearance([other.name]);
    if (other) {
      const pos = peerPosition(other);
      if (!queuePeer || queuePeer.name !== other.name || !near(queuePeer, pos, 0.2)) {
        queuePeer = { name: other.name, x: pos.x, y: pos.y, z: pos.z };
        queueProgressAt = now();
      }
    }
    const intent = other?.intent || other?.route;
    const opposing = intent?.length &&
      (intent[0].x - peerPosition(other).x) * (to.x - pos.x) +
      (intent[0].z - peerPosition(other).z) * (to.z - pos.z) < -0.1;
    const crossing = intent?.length &&
      (intent[0].x - peerPosition(other).x) * (to.x - pos.x) +
      (intent[0].z - peerPosition(other).z) * (to.z - pos.z) <= 0.1;
    const priority = peer => peer.urgency === "escape" ? 2 : peer.storage?.phase === "leaving" ? 1 : 0;
    const ownPriority = bot.launcherGathering?.retreating || bot.launcherCombat?.retreating ? 2 :
      storagePhase === "leaving" || evacuation ? 1 : 0;
    const localYield = ahead && crossing && other?.allowed !== false &&
      (ownPriority < priority(other) || ownPriority === priority(other) && ownName > String(other?.name || ""));
    // Two workers walking the same way side by side each see the other
    // closing in and both stop: a group heading for the warehouse steps
    // freezes in pairs until a timeout. Once neither has moved for a while,
    // one of the pair steps aside and its partner walks on.
    const stalemate = ahead && other === ahead && other.moving && now() - queueProgressAt > 1500 &&
      ownName > String(other.name || "");
    if (other && (denied && (opposing || !other.moving) || localYield || stalemate) && now() - waitingAt > 180) retreat(other);
    if ((!denied || now() - queueProgressAt > 1200 && !refuge) && now() - waitingAt > 700 && !yieldPath.length) replan();
    return true;
  }
  function idleYield() {
    if (disposed || !enabled || bot.health <= 0 || bot.isAlive === false || bot.pathfinder?.isPathing || !bot.entity?.onGround ||
        evacuation || !["idle", "gathering"].includes(storagePhase) ||
        bot.targetDigBlock || bot.currentWindow || bot.launcherPearling || bot.launcherSurvival?.busy ||
        (bot.launcherCombat?.status && bot.launcherCombat.status !== "idle" && bot.launcherCombat.status !== "hostile mobs")) return;
    const working = bot.launcherGathering?.busy && bot.launcherGathering?.snapshot?.phase !== "paused";
    const nearWarehouse = warehouse.some(p => Math.abs(p.y - bot.entity.position.y) < 4 && flat(p, bot.entity.position) < 4.8);
    if (storagePhase === "idle" && !working && warehouse.length && (nearWarehouse || now() < clearanceUntil) && now() >= nextEvacuationAt) {
      // Asked to move while already parked: the nearest place is this one.
      void evacuateWarehouse(!nearWarehouse); return;
    }
    // Hold the temporary refuge until the OLD place is clear. Testing only
    // our new position would pull a storage waiter straight back into the exit.
    const origin = idleYieldOrigin || bot.entity.position;
    const approaching = activePeers().find(peer => peer.moving &&
      near(peerPosition(peer), origin, 4) && routeDistance(origin, peerPosition(peer), peer.route || []) < 0.9);
    if (approaching) {
      idleYieldOrigin ||= bot.entity.position.clone();
      retreat(approaching);
    } else {
      idleYieldOrigin = null;
      if (yielded) { clearControls(); yielded = false; yieldPath = []; refuge = null; }
    }
  }
  function pathGenerated(path) {
    published = path.path || [];
    void publish();
  }
  function goalSet(goal) {
    if (goal !== adaptedArrival) finishedArrival = null;
    if (yielded) clearControls();
    bypass = false; yieldPath = []; refuge = null; yielded = false; waitingAt = null;
    idleYieldOrigin = null;
  }
  function goalFinished(goal) {
    if (goal !== adaptedArrival || !Number.isFinite(goal.x) || !Number.isFinite(goal.z)) return;
    finishedArrival = { x: goal.x, y: goal.y, z: goal.z,
      radius: Math.max(0.5, goal.distance ?? Math.sqrt(goal.sqDist ?? 1)) + 0.2 };
    yieldPath = []; refuge = null; yielded = false; waitingAt = null;
  }
  const timer = setInterval(() => void publish(), pollMs);
  timer.unref?.();
  bot.on("pathGenerated", pathGenerated);
  bot.on("physicsTick", idleYield);
  bot.on("goalSet", goalSet); bot.on("goalFinished", goalFinished);
  const controller = {
    get warehouseState() { return { phase: storagePhase, places: warehouse.length, evacuating: Boolean(evacuation), error: evacuationError }; },
    setWarehouse(positions) { warehouse = positions.slice(0, 128); },
    setStoragePhase(phase, positions, bay = null) {
      if (phase !== "idle") evacuationAbort?.abort();
      if (phase !== storagePhase) {
        // idleYield no longer runs during service/leaving. Release the inputs
        // it owns before that handoff, even if no new goto is needed at the bay.
        if (yielded) clearControls();
        bypass = false; yieldPath = []; refuge = null; yielded = false; waitingAt = null;
        idleYieldOrigin = null;
      }
      storagePhase = phase; if (positions?.length) warehouse = positions.slice(0, 128); serviceBay = bay;
      void publish();
    },
    requestClearance(names) {
      if (!enabled || !names.length || now() - clearSentAt < 600) return;
      clearRequests = names.map(s => s.toLowerCase()); clearSentAt = now(); void publish();
    },
    // Leave CPU room for protocol/physics threads and the Minecraft client.
    // Each worker searches in 5ms slices; oversubscribed fleets rest between
    // slices instead of 100 independent setImmediate loops saturating the CPU.
    get workDelayMs() { return now() - updatedAt < 1800 ? Math.min(80,
      Math.max(0, Math.ceil(5 * (fleetSize / Math.max(1, cpuCount * 0.35) - 1)))) : 0; },
    get enabled() { return enabled; },
    get clearing() { return yielded && !bot.pathfinder?.isPathing; },
    pause,
    cost(from, to) {
      if (now() - costAt >= 40) {
        costAt = now(); costCells.clear();
        for (const peer of activePeers()) {
          const entry = { peer, pos: peerPosition(peer) };
          for (const p of [entry.pos, ...peer.route.slice(0, 6)]) {
            for (let x = Math.floor((p.x - 2) / 4); x <= Math.floor((p.x + 2) / 4); x++)
              for (let y = Math.floor((p.y - 2) / 4); y <= Math.floor((p.y + 2) / 4); y++)
                for (let z = Math.floor((p.z - 2) / 4); z <= Math.floor((p.z + 2) / 4); z++) {
                  const id = `${x},${y},${z}`;
                  if (!costCells.has(id)) costCells.set(id, new Set());
                  costCells.get(id).add(entry);
                }
          }
        }
      }
      let cost = 0;
      for (const { peer, pos: p } of costCells.get(costKey(to)) || []) {
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
      adaptedArrival = goal; finishedArrival = null;
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
      costAt = -Infinity;
      waitingAt = null; yieldPath = []; refuge = null; bypass = false;
      idleYieldOrigin = null;
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
      evacuationAbort?.abort();
      bot.off("pathGenerated", pathGenerated); bot.off("physicsTick", idleYield);
      bot.off("goalSet", goalSet); bot.off("goalFinished", goalFinished);
      if (yielded) clearControls();
      void crew.request("traffic", { enabled: false }).catch(() => {});
      if (bot.launcherTraffic === controller) delete bot.launcherTraffic;
    },
  };
  async function evacuateWarehouse(aside = false) {
    if (evacuation || !bot.pathfinder?.goto) return;
    nextEvacuationAt = now() + 3000;
    const abort = new AbortController(); evacuationAbort = abort;
    const parkingToken = `clear-${++parkingSequence}`;
    evacuation = (async () => {
      const previous = { ...bot.pathfinder.defaultMoveSettings };
      const stop = () => { void bot.pathfinder.stop?.().catch(() => {}); };
      abort.signal.addEventListener("abort", stop, { once: true });
      const deadline = setTimeout(() => abort.abort(), 7000);
      try {
        await leaveContainerTop(bot, { signal: abort.signal });
        bot.setControlState("sneak", true);
        const layout = await warehouseLayout(bot, warehouse, { signal: abort.signal,
          reserved: activePeers().map(peerPosition) });
        if (aside) {
          // Step out of the colleagues' way: off this spot and off their routes.
          const here = bot.entity.position.clone(), routes = activePeers().flatMap(peer => peer.route || []);
          layout.stages = layout.stages.filter(p => flat(p, here) >= 3 && !routes.some(q => near(p, q, 2)));
        }
        if (!layout.stages.length) nextEvacuationAt = now() + 10000;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (abort.signal.aborted || disposed || storagePhase !== "idle") break;
          const reservation = await crew.request("storagePark", { token: parkingToken, dim: dimensionOf(bot), candidates: layout.stages.slice(attempt) });
          if (!reservation?.parking) break;
          const p = reservation.parking, target = new Vec3(p.x, p.y, p.z);
          if (!safeStand(bot, target, true)) continue;
          bot.pathfinder.setMoveOptions?.(storageMoveOptions(bot, previous));
          const { goals } = require("./pathfinder.cjs");
          try { await bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 0.22)); break; }
          catch (error) { evacuationError = error.message; if (abort.signal.aborted) break; }
        }
      } catch (error) { evacuationError = error.message; }
      finally {
        clearTimeout(deadline); abort.signal.removeEventListener("abort", stop);
        await crew.request("storagePark", { token: parkingToken, release: true }).catch(() => {});
        if (!disposed && storagePhase === "idle") bot.pathfinder.setMoveOptions?.(previous);
        if (!bot.pathfinder.isPathing) clearControls();
      }
    })().finally(() => { evacuation = null; evacuationAbort = null; });
    return evacuation;
  }
  bot.launcherTraffic = controller;
  void publish();
  return controller;
}

module.exports = { createFleetNavigation, safeCell };
