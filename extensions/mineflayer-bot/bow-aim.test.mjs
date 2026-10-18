import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";
import path from "node:path";
import { makeTrace, feedTrace, scoreShot } from "./bow-benchmark.mjs";

const require = createRequire(import.meta.url);
const { Vec3 } = require("vec3");
const runtimeRequire = process.env.SCREEN_COMBAT_RUNTIME
  ? createRequire(path.resolve(process.env.SCREEN_COMBAT_RUNTIME, "package.json"))
  : require;
const { createBowAim } = runtimeRequire("./bow-aim.cjs");

function fixture() {
  let time = 0;
  const bot = {
    _client: new EventEmitter(),
    player: { ping: 50 },
    entity: { position: new Vec3(0.5, 64, 0.5), velocity: new Vec3(0, 0, 0), onGround: true },
    blockAt: (p) => ({ boundingBox: p.y < 64 ? "block" : "empty" }),
    world: {
      raycast(p, d, range) {
        if (d.y < 0 && p.y >= 64 && p.y + d.y * range <= 64)
          return { intersect: p.plus(d.scaled((64 - p.y) / d.y)) };
        return null;
      },
    },
  };
  const entity = {
    id: 2,
    position: new Vec3(24, 64, 0),
    velocity: new Vec3(0, 0, 0),
    width: 0.6,
    height: 1.8,
    isValid: true,
    onGround: true,
  };
  const aim = createBowAim(bot, { now: () => time });
  return {
    bot,
    entity,
    aim,
    setTime: (v) => {
      time = v;
    },
  };
}

for (const profile of ["stationary", "run", "jump", "fall", "zigzag"]) {
  test(`independent moving-hitbox simulation: ${profile}, varied distance, delay and phase`, () => {
    const f = fixture();
    try {
      for (const distance of [9, 19, 31, 45])
        for (const ping of [0, 70, 180])
          for (let phase = 0; phase < 4; phase++) {
            const release = 28 + phase * 2;
            f.bot.player.ping = ping;
            const trace = makeTrace(profile, distance, phase);
            feedTrace(f.bot, f.aim, f.entity, trace, release, ping, f.setTime);
            const plan = f.aim.plan(f.entity);
            assert.ok(plan, `${profile}, distance ${distance}, ping ${ping}, phase ${phase}`);
            assert.ok(
              scoreShot(f.bot, f.entity, plan, trace, release, ping),
              `${profile}, distance ${distance}, ping ${ping}, phase ${phase}`,
            );
          }
    } finally {
      f.aim.dispose();
    }
  });
}

test("a sharp reversal and a stop replace old running velocity on the first fresh sample", () => {
  const f = fixture();
  try {
    const trace = makeTrace("run");
    feedTrace(f.bot, f.aim, f.entity, trace, 30, 0, f.setTime);
    assert.ok(f.aim.motion().velocity.z > 0.2);
    f.setTime(1550);
    f.entity.position.z -= 0.25;
    f.aim.observe(f.entity, true);
    assert.ok(f.aim.motion().velocity.z < -0.2);
    assert.equal(f.aim.motion().kind, "turn");
    f.setTime(1600);
    f.aim.observe(f.entity, true);
    assert.equal(f.aim.motion().velocity.z, 0);
  } finally {
    f.aim.dispose();
  }
});

test("batched position packets preserve jumps, falls and repeated strafing at 100/150 ms cadence", () => {
  const f = fixture();
  try {
    for (const profile of ["run", "jump", "fall", "zigzag"])
      for (const cadence of [2, 3])
        for (const release of [28, 30, 32, 34, 36, 38])
          for (const ping of [0, 50, 150]) {
            const trace = makeTrace(profile, 24);
            f.bot.player.ping = ping;
            feedTrace(f.bot, f.aim, f.entity, trace, release, ping, f.setTime, null, cadence);
            const shot = f.aim.plan(f.entity);
            assert.ok(
              scoreShot(f.bot, f.entity, shot, trace, release, ping),
              `${profile}, cadence ${cadence}, release ${release}, ping ${ping}`,
            );
          }
  } finally {
    f.aim.dispose();
  }
});

test("look-only updates preserve observation age; same-time bursts stay finite; teleports reset history", () => {
  const f = fixture();
  try {
    feedTrace(f.bot, f.aim, f.entity, makeTrace("run"), 30, 0, f.setTime);
    f.setTime(1600);
    const revision = f.aim.revision;
    f.aim.observe(f.entity);
    assert.equal(f.aim.revision, revision);
    assert.equal(f.aim.motion().age, 100);
    for (let i = 0; i < 5; i++) {
      f.entity.position.z += 0.01;
      f.aim.observe(f.entity, true);
    }
    assert.ok(Number.isFinite(f.aim.plan(f.entity).pitch));
    f.setTime(1650);
    f.entity.position.x += 30;
    f.aim.observe(f.entity, true);
    assert.equal(f.aim.motion().velocity.norm(), 0);
    assert.equal(f.aim.motion().kind, "stationary");
  } finally {
    f.aim.dispose();
  }
});

test("position packet supplies ground state, stale horizontal lead decays and dispose removes every listener", () => {
  const f = fixture();
  feedTrace(f.bot, f.aim, f.entity, makeTrace("run"), 30, 0, f.setTime);
  f.setTime(1550);
  f.bot._client.emit("rel_entity_move", { entityId: 2, onGround: true });
  assert.equal(f.aim.motion().grounded, true);
  f.setTime(2000);
  assert.equal(f.aim.motion().velocity.z, 0);
  f.aim.dispose();
  assert.equal(f.bot._client.eventNames().length, 0);
});

test("arrow inherits a moving shooter's velocity and blocked arcs cannot produce a shot", () => {
  const f = fixture();
  try {
    const trace = makeTrace("run", 31);
    feedTrace(f.bot, f.aim, f.entity, trace, 30, 50, f.setTime);
    f.bot.entity.velocity = new Vec3(0.15, 0, -0.2);
    assert.ok(scoreShot(f.bot, f.entity, f.aim.plan(f.entity), trace, 30, 50));
    f.bot.world.raycast = () => ({ intersect: new Vec3(5, 65, 0) });
    assert.equal(f.aim.plan(f.entity), null);
    f.entity.isValid = false;
    assert.equal(f.aim.plan(f.entity), null);
  } finally {
    f.aim.dispose();
  }
});
