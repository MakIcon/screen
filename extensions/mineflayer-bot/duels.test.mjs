import assert from "node:assert/strict";
import test from "node:test";
import { duel } from "./pvp-duel-benchmark.mjs";

// Simulated duels with real player physics, Custom PvP, the navigator and
// serialized packets; see pvp-duel-benchmark.mjs for the opponent scripts and
// the server-side scoring model. SCREEN_COMBAT_RUNTIME runs them against
// another source snapshot (the 1.15.6 snapshot fails these deadlines).
for (const version of ["1.20.4", "26.1.2"]) {
  test(`sword hits a cornered opponent every 13 ticks with criticals despite our shield on ${version}`, async () => {
    const result = await duel(version, "default", "wall");
    assert.deepEqual(result.errors, []);
    assert.equal(result.meanIntervalMs, 650, JSON.stringify(result));
    assert.ok(result.landed >= 15, `landed ${result.landed}`);
    assert.ok(result.critical >= 10, `criticals ${result.critical}`);
    assert.equal(result.routedTicks, 0, "a lifted opponent is not a terrain step");
  });
  test(`spacing retains pressure against an attacking opponent with low knockback on ${version}`, async () => {
    const result = await duel(version, "spacing", "lowKnockback");
    assert.deepEqual(result.errors, []);
    assert.ok(result.landed >= 15, `landed ${result.landed}; the fixed tap baseline landed 14`);
    assert.ok(result.receivedDamage <= 105, `received ${result.receivedDamage}`);
    assert.equal(result.outOfReach, 0);
  });
  test(`spacing converts sprint-hit trades into damage without accelerating cooldowns on ${version}`, async () => {
    const result = await duel(version, "spacing", "trading");
    assert.deepEqual(result.errors, []);
    assert.ok(result.damage >= 100, `damage ${result.damage}; the fixed tap baseline dealt 94.5`);
    assert.ok(result.receivedDamage <= 84, `received ${result.receivedDamage}`);
    assert.equal(result.outOfReach, 0);
    assert.ok(result.meanIntervalMs >= 650, "the sword still needs its normal cooldown");
  });
}

test("knockback lift keeps direct pursuit on open ground", async () => {
  const result = await duel("26.1.2", "default", "cadence");
  assert.deepEqual(result.errors, []);
  assert.equal(result.routedTicks, 0);
  assert.ok(result.landed >= 10, `landed ${result.landed}`);
});

test("sprint jumps catch an opponent sprinting away", async () => {
  const result = await duel("26.1.2", "default", "runner");
  assert.deepEqual(result.errors, []);
  assert.ok(result.landed >= 3, `landed ${result.landed}`);
  assert.ok(
    result.firstHitMs !== null && result.firstHitMs <= 4000,
    `first hit ${result.firstHitMs} ms`,
  );
});

test("an opponent on a two-block pillar is hit from below", async () => {
  const result = await duel("26.1.2", "default", "pillar");
  assert.deepEqual(result.errors, []);
  assert.ok(
    result.firstHitMs !== null && result.firstHitMs <= 500,
    `first hit ${result.firstHitMs} ms`,
  );
});

test("a shield raised as the hit becomes ready is hit before it can block", async () => {
  for (const scenario of ["shieldLate", "shield"]) {
    const result = await duel("26.1.2", "default", scenario);
    assert.deepEqual(result.errors, []);
    assert.equal(result.blocked, 0, `${scenario}: never strike an effective shield`);
    if (scenario === "shieldLate") assert.ok(result.landed >= 15, `landed ${result.landed}`);
  }
  const aggressive = await duel("26.1.2", "aggressive", "shieldLate");
  assert.equal(aggressive.blocked, 0);
  assert.ok(aggressive.landed >= 19, "spacing cannot consume the shield warm-up opening");
});
