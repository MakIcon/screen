import assert from "node:assert/strict";
import test from "node:test";
import routes from "./fleet-routes.cjs";
const p = x => ({ x: x + 0.5, y: 64, z: 0.5, kind: "Forward" });

test("directed route hints join midway, stay in their dimension and invalidate changed terrain", () => {
  const cache = routes.createRouteCache();
  const path = Array.from({ length: 12 }, (_, x) => p(x));
  path[0].profile = "same-movement-settings";
  cache.put("overworld", path);
  path[4].x = 100;
  assert.equal(cache.find("overworld", p(3), q => q.x === 9.5).length, 7);
  assert.equal(cache.find("overworld", p(3), q => q.x === 9.5)[0].profile, path[0].profile);
  assert.equal(cache.find("nether", p(3), q => q.x === 9.5), null);
  assert.equal(cache.find("overworld", p(9), q => q.x === 3.5), null);
  cache.invalidate("overworld", { x: 5, y: 63, z: 0 });
  assert.equal(cache.find("overworld", p(3), q => q.x === 9.5), null);
});

test("route hints expire and evict their spatial entries within a fixed memory bound", () => {
  let time = 0;
  const cache = routes.createRouteCache({ now: () => time, capacity: 2, ttlMs: 100 });
  for (let i = 0; i < 3; i++) cache.put("overworld", [p(i * 20), p(i * 20 + 1), p(i * 20 + 2)]);
  assert.equal(cache.size, 2);
  assert.equal(cache.find("overworld", p(0), q => q.x === 2.5), null);
  time = 101;
  assert.equal(cache.find("overworld", p(20), q => q.x === 22.5), null);
  cache.clear();
  assert.equal(cache.size, 0);
});

test("clearing an obstacle inside a detour invalidates the old longer route", () => {
  const cache = routes.createRouteCache();
  cache.put("overworld", [p(0), { ...p(0), z: 12.5 }, { ...p(12), z: 12.5 }, p(12)]);
  assert.ok(cache.find("overworld", p(0), q => q.x === 12.5));
  cache.invalidate("overworld", { x: 6, y: 64, z: 6 });
  assert.equal(cache.find("overworld", p(0), q => q.x === 12.5), null);
});
