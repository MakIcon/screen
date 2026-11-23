"use strict";
const cell = p => `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
const valid = p => p && [p.x, p.y, p.z].every(Number.isFinite);

// Directed, bounded hints. No controls, executor instances or mutable world
// caches cross process boundaries. The receiver revalidates every movement.
function createRouteCache({ now = Date.now, capacity = 128, ttlMs = 120000 } = {}) {
  const routes = new Map(), starts = new Map();
  function remove(id) {
    const old = routes.get(id);
    if (!old) return;
    for (const p of old.points.slice(0, -1)) {
      const key = `${old.dim}|${cell(p)}`, bucket = starts.get(key);
      bucket?.delete(id);
      if (!bucket?.size) starts.delete(key);
    }
    routes.delete(id);
  }
  function put(dim, points) {
    if (!Array.isArray(points) || points.length < 3 || points.length > 256 || !points.every(valid)) return null;
    const id = `${dim}|${cell(points[0])}|${cell(points.at(-1))}`;
    remove(id);
    const entry = { id, dim, at: now(), points: points.map(p => ({ x: p.x, y: p.y, z: p.z,
      ...(typeof p.kind === "string" ? { kind: p.kind.slice(0, 64) } : {}),
      ...(Number.isFinite(p.cost) ? { cost: p.cost } : {}),
      ...(typeof p.profile === "string" ? { profile: p.profile.slice(0, 512) } : {}) })) };
    entry.bounds = Object.fromEntries(["x", "y", "z"].map(axis => [axis,
      [Math.min(...points.map(p => p[axis])), Math.max(...points.map(p => p[axis]))]]));
    routes.set(id, entry);
    for (const p of entry.points.slice(0, -1)) {
      const key = `${dim}|${cell(p)}`;
      if (!starts.has(key)) starts.set(key, new Set());
      starts.get(key).add(id);
    }
    if (routes.size > capacity) remove(routes.keys().next().value);
    return entry;
  }
  return {
    put,
    remove,
    find(dim, start, goal) {
      let best = null;
      for (const id of starts.get(`${dim}|${cell(start)}`) || []) {
        const entry = routes.get(id);
        if (now() - entry.at > ttlMs) { remove(id); continue; }
        const from = entry.points.findIndex(p => cell(p) === cell(start));
        for (let end = from + 1; end < entry.points.length; end++) {
          const p = entry.points[end];
          if (goal(p) && (!best || end - from < best.length - 1)) {
            best = entry.points.slice(from, end + 1);
            if (entry.points[0].profile != null) best[0] = { ...best[0], profile: entry.points[0].profile };
            break;
          }
        }
      }
      return best;
    },
    invalidate(dim, position) {
      const removed = [];
      // Clearing the inside of a detour can create a shorter route even when
      // no old step touches that block. Invalidate its enclosing region too.
      for (const [id, entry] of routes) if (entry.dim === dim && ["x", "y", "z"].every(axis =>
        position[axis] >= entry.bounds[axis][0] - (axis === "y" ? 3 : 2) &&
        position[axis] <= entry.bounds[axis][1] + (axis === "y" ? 3 : 2))) { removed.push(id); remove(id); }
      return removed;
    },
    invalidateColumn(dim, column) {
      const removed = [];
      for (const [id, entry] of routes) if (entry.dim === dim && entry.points.some(p =>
        (Math.floor(p.x) >> 4) === (column.x >> 4) && (Math.floor(p.z) >> 4) === (column.z >> 4))) { removed.push(id); remove(id); }
      return removed;
    },
    clear() { routes.clear(); starts.clear(); },
    get size() { return routes.size; },
  };
}
module.exports = { createRouteCache };
