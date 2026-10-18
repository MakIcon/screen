import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { Vec3 } = require("vec3");
const { createBowAim } = require("./bow-aim.cjs");
const custom = createRequire(require.resolve("@nxg-org/mineflayer-custom-pvp"));
const { ShotPlanner } = custom("./bow/shotPlanner.js");
const { EntityTracker } = custom("@nxg-org/mineflayer-tracker");
export const profiles = ["stationary", "run", "jump", "fall", "turn", "zigzag", "irregular"];

// Scripted inputs are deliberately separate from the predictor. Arrow scoring
// integrates one tick at a time and intersects the moving, unexpanded hitbox.
export function makeTrace(profile, distance = 24, phase = 0) {
  const points = [];
  let z = 0.5,
    y = profile === "fall" ? 80 : 64,
    vy = 0;
  const intervals = profile === "irregular" ? [3, 7, 2, 6, 4, 3, 8] : [4];
  let nextTurn = 3 + (phase % 4),
    turnIndex = 0,
    direction = 1;
  for (let i = 0; i < 240; i++) {
    if (i >= nextTurn) {
      direction *= -1;
      nextTurn += intervals[turnIndex++ % intervals.length];
    }
    const speed = profile === "stationary" || profile === "fall" ? 0 : 0.25;
    const dz = ["zigzag", "irregular"].includes(profile)
      ? speed * direction
      : profile === "turn" && i >= 28 + (phase % 4)
        ? -speed
        : speed;
    z += dz;
    if (profile === "jump" && y === 64 && i % 16 === phase % 16) vy = 0.42;
    if (profile === "fall" && i < 25) {
      y = 80;
      vy = 0;
    } else {
      y += vy;
      if (y <= 64) {
        y = 64;
        vy = 0;
      } else vy = (vy - 0.08) * 0.98;
    }
    points.push({ position: new Vec3(distance + 0.5, y, z), onGround: y === 64 });
  }
  return points;
}

export function traceAt(trace, time) {
  const t = Math.max(0, Math.min(trace.length - 1, time)),
    n = Math.floor(t);
  const a = trace[n],
    b = trace[Math.min(n + 1, trace.length - 1)];
  return {
    position: a.position.plus(b.position.minus(a.position).scaled(t - n)),
    onGround: a.onGround && b.onGround,
  };
}

function slab(from, to, half, height) {
  let enter = 0,
    leave = 1;
  for (const [axis, low, high] of [
    ["x", -half, half],
    ["y", 0, height],
    ["z", -half, half],
  ]) {
    const d = to[axis] - from[axis];
    if (Math.abs(d) < 1e-10) {
      if (from[axis] < low || from[axis] > high) return null;
    } else {
      const a = (low - from[axis]) / d,
        b = (high - from[axis]) / d;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return null;
    }
  }
  return enter;
}

export function scoreShot(bot, entity, shot, trace, release, ping = 0) {
  if (!shot || !Number.isFinite(shot.yaw) || !Number.isFinite(shot.pitch)) return false;
  const eye = bot.entity.eyeHeight ?? 1.62;
  let position = bot.entity.position.offset(0, eye - 0.1, 0);
  const inherited = bot.entity.velocity?.clone() ?? new Vec3(0, 0, 0);
  if (bot.entity.onGround !== false) inherited.y = 0;
  let v = new Vec3(
    -Math.sin(shot.yaw) * Math.cos(shot.pitch) * 3,
    Math.sin(shot.pitch) * 3,
    -Math.cos(shot.yaw) * Math.cos(shot.pitch) * 3,
  ).plus(inherited);
  const serverRelease = release + ping / 100 + 0.5;
  for (let t = 0; t < 80; t++) {
    const next = position.plus(v);
    const a = traceAt(trace, serverRelease + t).position,
      b = traceAt(trace, serverRelease + t + 1).position;
    const impact = slab(position.minus(a), next.minus(b), entity.width / 2, entity.height);
    const length = v.norm();
    const wall = bot.world.raycast(position, v.scaled(1 / length), length);
    if (
      impact !== null &&
      (!wall?.intersect || position.distanceTo(wall.intersect) >= length * impact)
    )
      return true;
    if (wall) return false;
    position = next;
    v = new Vec3(v.x * 0.99, v.y * 0.99 - 0.05, v.z * 0.99);
  }
  return false;
}

export function feedTrace(bot, aim, entity, trace, release, ping, setTime, tracker, cadence = 1) {
  const inbound = ping / 100;
  const first = release - (cadence === 1 ? 23 : 24);
  for (let tick = first; tick <= release; tick++) {
    setTime(tick * 50);
    if ((release - tick) % cadence === 0) {
      const state = traceAt(trace, tick - inbound);
      entity.position = state.position;
      entity.onGround = state.onGround;
      if (tick === first) {
        aim.reset(entity);
        tracker?.trackEntity(entity);
      }
      aim.observe(entity, true, state.onGround);
    }
    // Tracker still ticks at 20 Hz while server position packets are batched.
    tracker?.update();
  }
}

export async function runBenchmark(output) {
  const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
  rigRequire("ts-node").register({
    project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
    transpileOnly: true,
  });
  const { createCacheWorld } = rigRequire("./tests/setup.ts");
  const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { renderDistance: 4 });
  const bot = rig.bot;
  bot.physicsEnabled = false;
  bot.entity.onGround = true;
  let time = 0;
  const aim = createBowAim(bot, { now: () => time });
  const tracker = new EntityTracker(bot);
  // update() is driven explicitly by the observation trace, with one tick per sample.
  tracker.disable();
  const planner = new ShotPlanner(bot);
  const entity = {
    id: 200,
    position: new Vec3(24, 64, 0),
    velocity: new Vec3(0, 0, 0),
    width: 0.6,
    height: 1.8,
    isValid: true,
  };
  bot.entities[entity.id] = entity;
  const rows = [];
  const measure = (fn) => {
    const started = performance.now();
    const shot = fn();
    return { shot, ms: performance.now() - started };
  };
  try {
    for (let i = 0; i < 8; i++) {
      const trace = makeTrace("run");
      feedTrace(
        bot,
        aim,
        entity,
        trace,
        30,
        50,
        (v) => {
          time = v;
        },
        tracker,
      );
      planner.shotToEntity(entity, tracker.getEntitySpeed(entity).clone());
      aim.plan(entity);
    }
    for (const profile of profiles) {
      for (const cadence of [1, 2, 3])
        for (const distance of [12, 24, 40])
          for (const ping of [0, 50, 150])
            for (let phase = 0; phase < 4; phase++) {
              const release = 28 + phase * 2;
              const trace = makeTrace(profile, distance, phase);
              const ageTicks = phase; // old 200 ms cache: 0, 50, 100, 150 ms old at release.
              tracker.clearTrackingData();
              feedTrace(
                bot,
                aim,
                entity,
                trace,
                release - ageTicks,
                ping,
                (v) => {
                  time = v;
                },
                tracker,
                cadence,
              );
              const oldEntity = { ...entity, position: entity.position.clone() };
              const oldSpeed = tracker.getEntitySpeed(entity).clone();
              tracker.clearTrackingData();
              feedTrace(
                bot,
                aim,
                entity,
                trace,
                release,
                ping,
                (v) => {
                  time = v;
                },
                tracker,
                cadence,
              );
              bot.player = { ...bot.player, ping };
              let before, after;
              // Alternate order to avoid systematically favouring a warmed second solver.
              if (phase % 2) {
                after = measure(() => aim.plan(entity));
                before = measure(() => planner.shotToEntity(oldEntity, oldSpeed));
              } else {
                before = measure(() => planner.shotToEntity(oldEntity, oldSpeed));
                after = measure(() => aim.plan(entity));
              }
              rows.push({
                profile,
                cadenceMs: cadence * 50,
                distance,
                ping,
                phase,
                cacheAgeMs: ageTicks * 50,
                before: {
                  hit: scoreShot(bot, entity, before.shot, trace, release, ping),
                  planned: !!before.shot?.hit,
                  ms: before.ms,
                },
                after: {
                  hit: scoreShot(bot, entity, after.shot, trace, release, ping),
                  planned: !!after.shot?.hit,
                  ms: after.ms,
                  kind: after.shot?.kind,
                },
              });
            }
      process.stdout.write(
        `${profile}: ${rows.filter((r) => r.profile === profile && r.before.hit).length} -> ${rows.filter((r) => r.profile === profile && r.after.hit).length} / ${rows.filter((r) => r.profile === profile).length}\n`,
      );
    }
  } finally {
    aim.dispose();
    tracker.disable();
    rig.stopPassivePhysics();
  }
  const summarize = (items, side) => {
    const timings = items.map((r) => r[side].ms).sort((a, b) => a - b);
    return {
      attempts: items.length,
      hits: items.filter((r) => r[side].hit).length,
      planned: items.filter((r) => r[side].planned).length,
      hitPercent: (100 * items.filter((r) => r[side].hit).length) / items.length,
      meanMs: timings.reduce((a, b) => a + b, 0) / timings.length,
      medianMs: timings[Math.floor(timings.length / 2)],
      p95Ms: timings[Math.floor(timings.length * 0.95)],
    };
  };
  const report = {
    date: "2026-10-18",
    node: process.version,
    cpu: cpus()[0].model,
    method:
      "Offline deterministic traces; actual Custom PvP 1.7.16 ShotPlanner and EntityTracker versus local bow-aim; real prismarine world raycasts; independent discrete arrow/moving unexpanded 0.6 x 1.8 AABB collision; no random arrow spread, no live server. Both use same cases. Old cache ages 0/50/100/150 ms, new release-time plan. RTT 0/50/150 ms, distances 12/24/40 blocks, position packets every 50/100/150 ms. Timings include one plan and its block checks; exclude world setup, observation replay and independent scoring.",
    before: summarize(rows, "before"),
    after: summarize(rows, "after"),
    profiles: Object.fromEntries(
      profiles.map((p) => [
        p,
        {
          before: summarize(
            rows.filter((r) => r.profile === p),
            "before",
          ),
          after: summarize(
            rows.filter((r) => r.profile === p),
            "after",
          ),
        },
      ]),
    ),
    rows,
  };
  if (output) {
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify({ before: report.before, after: report.after }, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await runBenchmark(process.argv[2]);
