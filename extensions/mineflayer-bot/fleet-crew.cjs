"use strict";
// Fleet crew: bots of one launcher on one server share a local coordinator.
//
// Every worker process is a separate Node process, so without coordination all
// bots pick the same nearest log or ore and queue behind each other. The first
// worker for a server opens a local pipe and becomes the crew hub; the others
// connect to it. The hub hands out leased work sites (a tree, an ore vein cell,
// a farm plot), keeps teams small and spreads idle bots over unexplored chunks.
// If the hub process exits, a remaining bot takes over and the members restore
// their leases with the next heartbeat. Without a pipe a bot keeps a private
// hub, so solo bots use the same site and exploration logic.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SITE_TTL = 30000;
const EXPLORE_SITE_TTL = 90000;
const MEMBER_TTL = 10000;
const LEASE_TTL = 60000;
const SCAN_TTL = 6 * 60000;
const DISCOVERY_TTL = 10 * 60000;
const MAX_SITES = 160;
const MAX_CHUNKS = 2048;
const MAX_FLOORS = 40000;
const MAX_FLOORS_PER_BEAT = 512;
const MAX_FLOORS_PER_REPLY = 2048;

const hypot2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hypot3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const finite = (value) => value && ["x", "y", "z"].every((axis) => Number.isFinite(value[axis]));
const point = (value) => ({ x: Number(value.x), y: Number(value.y ?? 0), z: Number(value.z) });
const chunkCenter = (cx, cz) => ({ x: cx * 16 + 8, z: cz * 16 + 8 });

function createHub({ now = Date.now } = {}) {
  const members = new Map();
  const claims = new Map();
  const scanned = new Map();
  const discoveries = new Map();
  const leases = new Map();
  // Floors of passages dug by the crew: `${dim}|x,y,z` -> { seq, name }.
  // Bots fetch the entries added since their cursor and never dig them out.
  const floors = new Map();
  const epoch = crypto.randomBytes(6).toString("hex");
  let floorSeq = 0;
  let prunedAt = 0;

  const scopeMap = (store, scope) => {
    let map = store.get(scope);
    if (!map) store.set(scope, (map = new Map()));
    return map;
  };
  function member(name) {
    let entry = members.get(name);
    if (!entry)
      members.set(name, (entry = { name, pos: null, dim: "", at: now(), held: new Map() }));
    entry.at = now();
    return entry;
  }
  function owners(claim, except) {
    let count = 0;
    for (const [name, until] of claim.owners) if (until > now() && name !== except) count++;
    return count;
  }
  function releaseOwner(name, full) {
    const claim = claims.get(full);
    if (claim) {
      claim.owners.delete(name);
      if (!claim.owners.size) claims.delete(full);
    }
    const scope = full.slice(0, full.indexOf("|"));
    const entry = members.get(name);
    if (entry && entry.held.get(scope) === full) entry.held.delete(scope);
  }
  function grant(name, scope, site, ttl = SITE_TTL) {
    const entry = member(name);
    const full = `${scope}|${site.key}`;
    const previous = entry.held.get(scope);
    if (previous && previous !== full) releaseOwner(name, previous);
    let claim = claims.get(full);
    if (!claim) {
      claim = {
        scope,
        key: site.key,
        pos: point(site),
        dim: site.dim ?? entry.dim,
        capacity: site.cap || 1,
        owners: new Map(),
      };
      claims.set(full, claim);
    }
    claim.pos = point(site);
    claim.capacity = Math.max(1, Number(site.cap) || claim.capacity || 1);
    claim.owners.set(name, now() + ttl);
    entry.held.set(scope, full);
    return claim;
  }
  function drop(name) {
    const entry = members.get(name);
    if (!entry) return;
    for (const full of entry.held.values()) {
      const claim = claims.get(full);
      claim?.owners.delete(name);
      if (claim && !claim.owners.size) claims.delete(full);
    }
    for (const [lease, value] of leases) if (value.name === name) leases.delete(lease);
    members.delete(name);
  }
  function prune() {
    const time = now();
    if (time - prunedAt < 500) return;
    prunedAt = time;
    for (const [name, entry] of members) if (time - entry.at > MEMBER_TTL) drop(name);
    for (const [full, claim] of claims) {
      for (const [name, until] of claim.owners) if (until <= time) claim.owners.delete(name);
      if (!claim.owners.size) claims.delete(full);
    }
    for (const [lease, value] of leases) if (value.until <= time) leases.delete(lease);
    for (const map of scanned.values())
      for (const [chunk, at] of map) if (time - at > SCAN_TTL) map.delete(chunk);
    for (const map of discoveries.values())
      for (const [key, site] of map) if (time - site.at > DISCOVERY_TTL) map.delete(key);
  }
  function others(name, dim) {
    const result = [];
    for (const entry of members.values())
      if (entry.name !== name && entry.pos && entry.dim === dim) result.push(entry);
    return result;
  }
  const zoneOf = (pos, zone) =>
    zone === "cube"
      ? `${Math.floor(pos.x / 16)}:${Math.floor(pos.y / 16)}:${Math.floor(pos.z / 16)}`
      : `${Math.floor(pos.x / 16)}:${Math.floor(pos.z / 16)}`;

  const ops = {
    beat(name, input = {}) {
      const entry = member(name);
      if (finite(input.pos)) entry.pos = point(input.pos);
      entry.dim = String(input.dim || "");
      entry.scope = input.scope || null;
      const held = Array.isArray(input.held) ? input.held.slice(0, 4) : [];
      const keep = new Set();
      for (const site of held) {
        if (
          !site ||
          typeof site.scope !== "string" ||
          typeof site.key !== "string" ||
          !finite(site)
        )
          continue;
        const full = `${site.scope}|${site.key}`;
        keep.add(full);
        const claim = claims.get(full);
        const until = claim?.owners.get(name);
        // Explore reservations keep their longer travel lease.
        grant(
          name,
          site.scope,
          { ...site, dim: entry.dim },
          until && until - now() > SITE_TTL ? until - now() : SITE_TTL,
        );
      }
      for (const [scope, full] of [...entry.held])
        if (!keep.has(full)) {
          releaseOwner(name, full);
          entry.held.delete(scope);
        }
      let crew = 0;
      for (const other of members.values()) if (other.scope && other.scope === entry.scope) crew++;
      const prefix = `${entry.dim}|`;
      for (const key of (Array.isArray(input.floors) ? input.floors : []).slice(
        0,
        MAX_FLOORS_PER_BEAT,
      )) {
        if (typeof key !== "string" || key.length > 40) continue;
        const id = prefix + key;
        floors.delete(id);
        floors.set(id, { seq: ++floorSeq, name });
      }
      // Oldest passages are forgotten first.
      for (const id of floors.keys()) {
        if (floors.size <= MAX_FLOORS) break;
        floors.delete(id);
      }
      // A new hub (after a failover) starts a new epoch: the bot rereads all.
      const cursor = input.floorEpoch === epoch ? Number(input.floorSeq) || 0 : 0;
      const added = [];
      let seen = cursor;
      if (cursor < floorSeq)
        for (const [id, floor] of floors) {
          if (floor.seq <= cursor || floor.name === name || !id.startsWith(prefix)) continue;
          if (added.length >= MAX_FLOORS_PER_REPLY) break;
          added.push(id.slice(prefix.length));
          seen = floor.seq;
        }
      if (added.length < MAX_FLOORS_PER_REPLY) seen = floorSeq;
      return { members: members.size, crew, floors: added, floorSeq: seen, floorEpoch: epoch };
    },
    claim(name, input = {}) {
      const entry = member(name);
      const scope = String(input.scope || "");
      const dim = String(input.dim ?? entry.dim ?? "");
      if (finite(input.pos)) entry.pos = point(input.pos);
      entry.dim = dim;
      entry.scope = scope;
      const sites = (Array.isArray(input.sites) ? input.sites : [])
        .filter((site) => site && typeof site.key === "string" && finite(site))
        .slice(0, MAX_SITES);
      const found = scopeMap(discoveries, scope);
      const reported = new Set(sites.map((site) => site.key));
      const done = scopeMap(scanned, scope);
      for (const chunk of (Array.isArray(input.chunks) ? input.chunks : []).slice(0, MAX_CHUNKS)) {
        if (typeof chunk !== "string") continue;
        done.set(chunk, now());
        for (const [key, site] of found)
          if (site.chunk === chunk && !reported.has(key)) found.delete(key);
      }
      for (const site of sites)
        found.set(site.key, {
          key: site.key,
          x: site.x,
          y: site.y,
          z: site.z,
          dim,
          n: Number(site.n) || 1,
          cap: Math.max(1, Number(site.cap) || 1),
          chunk: `${dim}:${Math.floor(site.x / 16)}:${Math.floor(site.z / 16)}`,
          at: now(),
          failed: found.get(site.key)?.failed || new Set(),
        });
      const zone = input.zone === "cube" ? "cube" : "column";
      const zoneCap = Math.max(1, Number(input.zoneCap) || 2);
      const near = others(name, dim);
      const zones = new Map();
      for (const other of near)
        for (const full of other.held.values()) {
          const claim = claims.get(full);
          if (!claim) continue;
          const key = zoneOf(claim.pos, zone);
          zones.set(key, (zones.get(key) || []).concat(full));
        }
      const current = entry.held.get(scope);
      let best = null,
        full = 0;
      for (const site of sites) {
        const id = `${scope}|${site.key}`;
        const claim = claims.get(id);
        const taken = claim ? owners(claim, name) : 0;
        const cap = Math.max(1, Number(site.cap) || 1);
        // A forced claim helps a staffed site, but at most one extra bot joins.
        if (taken >= cap + (input.force ? 1 : 0)) {
          full++;
          continue;
        }
        let score = (Number(site.d) || hypot3(site, entry.pos || site)) + taken * 10;
        for (const other of near)
          if (!claim?.owners.has(other.name) && hypot3(other.pos, site) < 6) score += 18;
        const zoned = (zones.get(zoneOf(site, zone)) || []).filter((value) => value !== id).length;
        score += zoned >= zoneCap ? 60 * (zoned - zoneCap + 1) : zoned * 6;
        if (current === id) score -= 8;
        if (input.force) score += Math.max(0, taken - cap + 1) * 25;
        if (!best || score < best.score) best = { site, score };
      }
      if (!best) {
        if (current) releaseOwner(name, current);
        return { key: null, full, sites: sites.length };
      }
      const claim = grant(name, scope, { ...best.site, dim });
      return { key: best.site.key, team: owners(claim), full };
    },
    release(name, input = {}) {
      const scope = String(input.scope || "");
      const full = `${scope}|${input.key}`;
      releaseOwner(name, full);
      if (input.done) discoveries.get(scope)?.delete(String(input.key));
      if (input.unreachable) discoveries.get(scope)?.get(String(input.key))?.failed.add(name);
      return { ok: true };
    },
    skip(name, input = {}) {
      const scope = String(input.scope || "");
      if (typeof input.chunk === "string") scopeMap(scanned, scope).set(input.chunk, now());
      leases.delete(`${scope}|${input.chunk}`);
      return { ok: true };
    },
    explore(name, input = {}) {
      const entry = member(name);
      const scope = String(input.scope || "");
      const dim = String(input.dim ?? entry.dim ?? "");
      if (!finite(input.pos) || !finite(input.origin)) return { type: null };
      const pos = point(input.pos),
        origin = point(input.origin);
      entry.pos = pos;
      entry.dim = dim;
      entry.scope = scope;
      const radius = Math.max(8, Math.min(Number(input.radius) || 64, 1024));
      const avoid = new Set(Array.isArray(input.avoid) ? input.avoid.slice(0, 256) : []);
      const near = others(name, dim);
      const crowd = (target) => {
        let value = 0;
        // Where bots stand now weighs less than where scouts are heading.
        for (const other of near) value += Math.max(0, 48 - hypot2(other.pos, target)) * 0.25;
        for (const [lease, owner] of leases)
          if (owner.name !== name && lease.startsWith(`${scope}|`) && owner.dim === dim)
            value += Math.max(0, 64 - hypot2(owner, target));
        return value;
      };
      // Known free sites first: another bot saw them beyond our loaded area.
      let best = null;
      for (const site of discoveries.get(scope)?.values() || []) {
        if (site.dim !== dim || site.failed.has(name) || avoid.has(site.key)) continue;
        if (hypot2(site, origin) > radius) continue;
        const claim = claims.get(`${scope}|${site.key}`);
        const taken = claim ? owners(claim, name) : 0;
        if (taken >= site.cap) continue;
        const score = hypot3(site, pos) + taken * 12 + crowd(site) * 0.5;
        if (!best || score < best.score) best = { site, score };
      }
      if (best) {
        grant(name, scope, { ...best.site, dim }, EXPLORE_SITE_TTL);
        return {
          type: "site",
          key: best.site.key,
          x: best.site.x,
          y: best.site.y,
          z: best.site.z,
          cap: best.site.cap,
        };
      }
      const done = scanned.get(scope) || new Map();
      let chunk = null;
      const min = {
        x: Math.floor((origin.x - radius) / 16),
        z: Math.floor((origin.z - radius) / 16),
      };
      const max = {
        x: Math.floor((origin.x + radius) / 16),
        z: Math.floor((origin.z + radius) / 16),
      };
      for (let cx = min.x; cx <= max.x; cx++)
        for (let cz = min.z; cz <= max.z; cz++) {
          const center = chunkCenter(cx, cz);
          if (hypot2(center, origin) > radius) continue;
          const key = `${dim}:${cx}:${cz}`;
          if (done.has(key) || avoid.has(key)) continue;
          const lease = leases.get(`${scope}|${key}`);
          if (lease && lease.name !== name && lease.until > now()) continue;
          const score = hypot2(center, pos) + crowd(center);
          if (!chunk || score < chunk.score) chunk = { key, center, score };
        }
      for (const [lease, owner] of leases)
        if (owner.name === name && lease.startsWith(`${scope}|`)) leases.delete(lease);
      if (!chunk) return { type: null };
      leases.set(`${scope}|${chunk.key}`, {
        name,
        dim,
        x: chunk.center.x,
        z: chunk.center.z,
        until: now() + LEASE_TTL,
      });
      return { type: "chunk", chunk: chunk.key, x: chunk.center.x, z: chunk.center.z };
    },
  };
  return {
    handle(name, op, input) {
      if (typeof name !== "string" || !name || !Object.hasOwn(ops, op))
        throw new Error("Неизвестный запрос бригады");
      prune();
      return ops[op](name, input);
    },
    drop,
    get size() {
      return members.size;
    },
  };
}

function pipeAddress(key) {
  const hash = crypto
    .createHash("sha1")
    .update(String(key).toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return process.platform === "win32"
    ? `\\\\.\\pipe\\screen-fleet-${hash}`
    : path.join(os.tmpdir(), `screen-fleet-${hash}.sock`);
}

// Newline-delimited JSON over a local pipe. Every call resolves: an unavailable
// or slow hub falls back to the private hub, so a bot is never blocked by it.
function createCrewLink({
  key,
  name,
  now = Date.now,
  log = () => {},
  net = require("node:net"),
  address = pipeAddress(key),
  beatMs = 1000,
  timeoutMs = 1500,
} = {}) {
  let role = "connecting",
    hub = null,
    socket = null,
    server = null;
  let disposed = false,
    retry = null,
    sequence = 0,
    beat = null,
    beatReply = null;
  const local = createHub({ now });
  const pending = new Map();
  const peers = new Set();

  function lines(stream, onLine) {
    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 4 * 1024 * 1024) {
        buffer = "";
        stream.destroy();
        return;
      }
      for (let index; (index = buffer.indexOf("\n")) >= 0; ) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        try {
          onLine(JSON.parse(line));
        } catch {
          // Ignore malformed peer input.
        }
      }
    });
  }
  function serve(peer) {
    const names = new Set();
    peers.add(peer);
    peer.on("error", () => {});
    peer.on("close", () => {
      peers.delete(peer);
      for (const value of names) hub?.drop(value);
    });
    lines(peer, (message) => {
      if (!message || typeof message.id !== "number") return;
      let reply;
      try {
        if (typeof message.name === "string") names.add(message.name);
        reply = { id: message.id, result: hub.handle(message.name, message.op, message.input) };
      } catch (error) {
        reply = { id: message.id, error: error.message };
      }
      if (!peer.destroyed) peer.write(`${JSON.stringify(reply)}\n`);
    });
  }
  function schedule() {
    if (disposed || retry) return;
    retry = setTimeout(
      () => {
        retry = null;
        elect();
      },
      150 + Math.floor(Math.random() * 450),
    );
    retry.unref?.();
  }
  function failPending() {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.fallback();
    }
  }
  function connect() {
    if (disposed) return;
    const client = net.connect(address);
    client.once("connect", () => {
      if (disposed) return client.destroy();
      socket = client;
      role = "member";
      log("Бригада: подключён к координатору ботов");
      void sendBeat();
    });
    lines(client, (message) => {
      const entry = pending.get(message?.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.fallback();
      else entry.resolve(message.result);
    });
    client.on("error", (error) => {
      if (socket === client) return;
      if (error.code === "ECONNREFUSED" && process.platform !== "win32")
        try {
          fs.unlinkSync(address);
        } catch {
          // Another bot may have removed the stale socket first.
        }
      schedule();
    });
    client.on("close", () => {
      if (socket !== client) return;
      socket = null;
      role = "connecting";
      failPending();
      schedule();
    });
  }
  function elect() {
    if (disposed) return;
    const candidate = net.createServer(serve);
    candidate.once("error", (error) => {
      candidate.close(() => {});
      if (error.code === "EADDRINUSE") connect();
      else {
        role = "solo";
        log(`Бригада недоступна (${error.code || error.message}); бот работает самостоятельно`);
      }
    });
    candidate.listen(address, () => {
      if (disposed) return candidate.close();
      candidate.removeAllListeners("error");
      candidate.on("error", () => {});
      server = candidate;
      hub = createHub({ now });
      role = "leader";
      log("Бригада: этот бот координирует работу ботов на сервере");
      void sendBeat();
    });
  }
  function request(op, input = {}) {
    if (role === "leader" && hub) {
      try {
        return Promise.resolve(hub.handle(name, op, input));
      } catch (error) {
        return Promise.reject(error);
      }
    }
    if (role !== "member" || !socket || socket.destroyed)
      return Promise.resolve().then(() => local.handle(name, op, input));
    return new Promise((resolve) => {
      const id = ++sequence;
      const fallback = () => {
        try {
          resolve(local.handle(name, op, input));
        } catch {
          resolve(null);
        }
      };
      const timer = setTimeout(() => {
        pending.delete(id);
        fallback();
      }, timeoutMs);
      timer.unref?.();
      pending.set(id, { resolve, fallback, timer });
      socket.write(`${JSON.stringify({ id, name, op, input })}\n`);
    });
  }
  async function sendBeat() {
    const input = beat?.();
    if (!input) return;
    try {
      const reply = await request("beat", input);
      if (reply) beatReply?.(reply);
    } catch {
      // A heartbeat is advisory.
    }
  }
  const heartbeat = setInterval(() => void sendBeat(), beatMs);
  heartbeat.unref?.();
  elect();
  return {
    request,
    setBeat(source, onReply) {
      beat = typeof source === "function" ? source : null;
      beatReply = typeof onReply === "function" ? onReply : null;
    },
    get role() {
      return role;
    },
    dispose() {
      disposed = true;
      clearInterval(heartbeat);
      if (retry) clearTimeout(retry);
      failPending();
      socket?.destroy();
      for (const peer of peers) peer.destroy();
      server?.close();
    },
  };
}

// --- Bot-side helpers: site layout per job kind ---------------------------

const SITE_LAYOUT = {
  // Ore veins rarely exceed a 4-block extent; an 8-block cube keeps a vein in
  // one site and caps caves at two miners per 16-block cube.
  mine: { size: 8, cube: true, zone: "cube", zoneCap: 2, capacity: (n) => (n >= 8 ? 2 : 1) },
  // A tree trunk and most of its canopy share a 4x4 column. Bigger trees take
  // a pair or a trio; branch cells let a partner join the same tree.
  forest: {
    size: 4,
    cube: false,
    zone: "column",
    zoneCap: 3,
    capacity: (n) => (n <= 6 ? 1 : n <= 18 ? 2 : 3),
  },
  // Farm plots are 4x4: one bot per plot, neighbours split a field.
  farm: { size: 4, cube: false, zone: "column", zoneCap: 8, capacity: () => 1 },
};
function layoutFor(task) {
  if (task.kind === "mine") return SITE_LAYOUT.mine;
  if (task.kind === "forest") return SITE_LAYOUT.forest;
  return SITE_LAYOUT.farm;
}
function scopeOf(task) {
  const names = [...(task.names || [])].sort().join(",") || task.crop || task.item || "";
  const hash = crypto.createHash("sha1").update(`${task.kind}:${names}`).digest("hex").slice(0, 10);
  return `${task.kind}:${hash}`;
}
function dimensionOf(bot) {
  return String(bot.game?.dimension || "overworld").replace(/^minecraft:/, "");
}
function siteKey(layout, dim, pos) {
  const size = layout.size;
  return layout.cube
    ? `${dim}:${Math.floor(pos.x / size)}:${Math.floor(pos.y / size)}:${Math.floor(pos.z / size)}`
    : `${dim}:${Math.floor(pos.x / size)}:${Math.floor(pos.z / size)}`;
}
// Cost of reaching a block from the bot: vertical digging is slower than
// walking, so it weighs more for mining jobs.
function travelCost(layout, from, pos) {
  const flat = Math.hypot(pos.x + 0.5 - from.x, pos.z + 0.5 - from.z);
  return flat + Math.abs(pos.y - from.y) * (layout.cube ? 1.3 : 0.6);
}
function groupSites(task, positions, from, dim, weight = () => 0) {
  const layout = layoutFor(task);
  const sites = new Map();
  for (const pos of positions) {
    const key = siteKey(layout, dim, pos);
    let site = sites.get(key);
    if (!site)
      sites.set(
        key,
        (site = { key, positions: [], d: Infinity, x: pos.x, y: pos.y, z: pos.z, n: 0, cap: 1 }),
      );
    site.positions.push(pos);
    site.n++;
    const cost = travelCost(layout, from, pos) + weight(pos);
    if (cost < site.d) Object.assign(site, { d: cost, x: pos.x, y: pos.y, z: pos.z });
  }
  for (const site of sites.values()) site.cap = layout.capacity(site.n);
  return sites;
}
function siteSummary(site) {
  return {
    key: site.key,
    x: site.x,
    y: site.y,
    z: site.z,
    n: site.n,
    cap: site.cap,
    d: Math.round(site.d * 10) / 10,
  };
}
// Chunks whose loaded blocks have been examined for this job.
function scannedChunks(bot, task, center, distance) {
  if (!bot.world?.getColumn || !center) return [];
  const dim = dimensionOf(bot);
  const result = [];
  const reach = Math.max(0, distance);
  for (
    let cx = Math.floor((center.x - reach) / 16);
    cx <= Math.floor((center.x + reach) / 16);
    cx++
  )
    for (
      let cz = Math.floor((center.z - reach) / 16);
      cz <= Math.floor((center.z + reach) / 16);
      cz++
    ) {
      const middle = chunkCenter(cx, cz);
      if (hypot2(middle, center) > reach + 12) continue;
      if (task.origin && hypot2(middle, task.origin) > task.radius + 12) continue;
      if (!bot.world.getColumn(cx, cz)) continue;
      result.push(`${dim}:${cx}:${cz}`);
      if (result.length >= MAX_CHUNKS) return result;
    }
  return result;
}

module.exports = {
  createHub,
  createCrewLink,
  pipeAddress,
  scopeOf,
  dimensionOf,
  layoutFor,
  siteKey,
  groupSites,
  siteSummary,
  scannedChunks,
  SITE_LAYOUT,
};
