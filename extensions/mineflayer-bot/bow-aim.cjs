const { Vec3 } = require("vec3");

const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const finite = (v) => v && [v.x, v.y, v.z].every(Number.isFinite);
const zero = () => new Vec3(0, 0, 0);
const horizontal = (v) => Math.hypot(v.x, v.z);
const dot = (a, b) => a.x * b.x + a.z * b.z;
const PACKETS = ["rel_entity_move", "entity_move_look", "entity_teleport", "sync_entity_position"];

// Sparse updates can straddle an entire reversal. Fit only a repeated bounded
// horizontal cycle supported by at least two periods, above the sampling limit.
// This is used only when packet cadence prevents the direct reversal model.
function fitSparseCycle(samples, cadence) {
  if (samples.length < 8) return null;
  const last = samples.at(-1),
    span = (last.time - samples[0].time) / 50;
  const n = samples.length,
    meanX = samples.reduce((s, p) => s + p.position.x, 0) / n,
    meanZ = samples.reduce((s, p) => s + p.position.z, 0) / n;
  const variance =
    samples.reduce((s, p) => s + (p.position.x - meanX) ** 2 + (p.position.z - meanZ) ** 2, 0) / n;
  if (variance < 0.01) return null;
  let best = null;
  for (
    let period = Math.max(4, cadence * 2 + 0.5);
    period <= Math.min(20, span / 2);
    period += 0.25
  ) {
    const waves = samples.map((p) => {
      const angle = (2 * Math.PI * (p.time - last.time)) / (50 * period);
      return {
        s: Math.sin(angle),
        c: Math.cos(angle),
        x: p.position.x - meanX,
        z: p.position.z - meanZ,
      };
    });
    const sm = waves.reduce((s, p) => s + p.s, 0) / n,
      cm = waves.reduce((s, p) => s + p.c, 0) / n;
    let ss = 0,
      cc = 0,
      sc = 0,
      sx = 0,
      cx = 0,
      sz = 0,
      cz = 0;
    for (const p of waves) {
      const s = p.s - sm,
        c = p.c - cm;
      ss += s * s;
      cc += c * c;
      sc += s * c;
      sx += s * p.x;
      cx += c * p.x;
      sz += s * p.z;
      cz += c * p.z;
    }
    const det = ss * cc - sc * sc;
    if (det < 1e-8) continue;
    const ax = (sx * cc - cx * sc) / det,
      bx = (cx * ss - sx * sc) / det,
      az = (sz * cc - cz * sc) / det,
      bz = (cz * ss - sz * sc) / det;
    const error =
      waves.reduce(
        (sum, p) =>
          sum +
          (p.x - ax * (p.s - sm) - bx * (p.c - cm)) ** 2 +
          (p.z - az * (p.s - sm) - bz * (p.c - cm)) ** 2,
        0,
      ) / n;
    if (error < variance * 0.04 && error < 0.015 && (!best || error < best.error))
      best = { period, ax, bx, az, bz, error };
  }
  return best;
}

// Position packets are the primary evidence. Entity.velocity is often an old
// knockback packet, and entityMoved also fires for look-only packets.
function createBowAim(bot, { now = Date.now } = {}) {
  let target = null,
    samples = [],
    revision = 0;
  function reset(entity = null) {
    target = entity;
    samples = [];
    revision++;
    if (entity) observe(entity, true);
  }
  function observe(entity, positionPacket = false, onGround) {
    if (entity !== target || !finite(entity?.position)) return;
    const time = now();
    let last = samples.at(-1);
    if (last && entity.position.equals(last.position) && !positionPacket) return;
    if (
      last &&
      (time - last.time > 400 ||
        time < last.time ||
        entity.position.distanceTo(last.position) > Math.max(4, ((time - last.time) / 50) * 1.5))
    ) {
      samples = [];
      last = null;
    }
    const ground = typeof onGround === "boolean" ? onGround : entity.onGround;
    // Coalesce packets received in one network burst; never divide by a tiny dt.
    if (last && time - last.time < 25) samples.pop();
    samples.push({ time, position: entity.position.clone(), ground });
    while (samples.length > 24 || (samples.length > 2 && time - samples[0].time > 1200))
      samples.shift();
    revision++;
  }
  const listeners = PACKETS.map((name) => {
    const listener = (packet) => {
      if (packet.entityId === target?.id) observe(target, true, packet.onGround);
    };
    bot._client?.on?.(name, listener);
    return [name, listener];
  });

  function motion() {
    const last = samples.at(-1);
    if (!last) return null;
    const age = Math.max(0, now() - last.time);
    const segments = [];
    for (let i = 1; i < samples.length; i++) {
      const dt = (samples[i].time - samples[i - 1].time) / 50;
      if (dt <= 0) continue;
      segments.push({
        velocity: samples[i].position.minus(samples[i - 1].position).scaled(1 / dt),
        dt,
        time: samples[i].time,
      });
    }
    const recent = segments.at(-1);
    let velocity = recent?.velocity.clone() ?? zero();
    let kind = "stationary";
    const reversals = [];
    const moving = segments.filter((s) => horizontal(s.velocity) > 0.05);
    for (let i = 1; i < moving.length; i++) {
      const a = moving[i - 1],
        b = moving[i];
      // A packet can straddle a reversal and report almost zero displacement.
      // Bridge that one sample; a longer pause is evidence of stopping.
      if (
        b.time - a.time <= Math.max(125, (recent?.dt ?? 1) * 125) &&
        dot(a.velocity, b.velocity) < -0.25 * horizontal(a.velocity) * horizontal(b.velocity)
      )
        reversals.push((a.time + b.time) / 2 - 25);
    }
    const previous = segments.at(-2)?.velocity;
    const turning =
      previous &&
      horizontal(previous) > 0.03 &&
      horizontal(velocity) > 0.03 &&
      dot(previous, velocity) < 0.8 * horizontal(previous) * horizontal(velocity);
    if (horizontal(velocity) > 0.015) {
      kind = turning ? "turn" : "run";
      // Smooth quantization only while directions agree. Stops and reversals
      // use the newest displacement immediately instead of a long average.
      if (!turning) {
        let weight = 1,
          sum = 1,
          vx = velocity.x,
          vz = velocity.z;
        for (let i = segments.length - 2; i >= Math.max(0, segments.length - 4); i--) {
          const v = segments[i].velocity;
          if (
            dot(v, velocity) < 0.9 * horizontal(v) * horizontal(velocity) ||
            horizontal(v) < 0.015
          )
            break;
          weight *= 0.4;
          vx += v.x * weight;
          vz += v.z * weight;
          sum += weight;
        }
        velocity.x = vx / sum;
        velocity.z = vz / sum;
      }
    }
    let period = null;
    if (reversals.length >= 2 && last.time - reversals.at(-1) < 500) {
      kind = "zigzag";
      const intervals = reversals.slice(1).map((t, i) => (t - reversals[i]) / 50);
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (
        intervals.length >= 2 &&
        mean >= 2 &&
        intervals.every((n) => Math.abs(n - mean) <= mean * 0.25)
      )
        period = mean;
    }
    if (period && (last.time - reversals.at(-1)) / 50 > period + 1.5) {
      period = null;
      kind = horizontal(velocity) > 0.015 ? "run" : "stationary";
    }
    if (period && horizontal(velocity) < 0.015 && last.time - moving.at(-1).time <= 75) {
      velocity.x = moving.at(-1).velocity.x;
      velocity.z = moving.at(-1).velocity.z;
    }
    // Displacement gives the velocity used during the previous interval, not
    // the next tick's velocity. Invert the vanilla (v - .08) * .98 recurrence.
    let grounded = last.ground ?? (recent ? Math.abs(recent.velocity.y) < 0.002 : true);
    if (recent && recent.velocity.y > 0.03) grounded = false;
    if (grounded) velocity.y = 0;
    else if (recent) {
      const decay = 0.98 ** recent.dt,
        sum = (1 - decay) / 0.02;
      velocity.y = ((recent.velocity.y * recent.dt + 3.92 * recent.dt) / sum) * decay - 3.92;
    }
    if (age > 150) {
      const decay = clamp(1 - (age - 150) / 200, 0, 1);
      velocity.x *= decay;
      velocity.z *= decay;
      period = null;
    }
    const cycle =
      age <= 150 && reversals.length >= 2 && recent?.dt >= 1.5
        ? fitSparseCycle(samples, recent.dt)
        : null;
    if (cycle) kind = "zigzag";
    const ping = Number.isFinite(bot.player?.ping) ? clamp(bot.player.ping, 0, 500) : 0;
    return {
      position: last.position.clone(),
      velocity,
      grounded,
      kind,
      period,
      cycle,
      recentJump: segments.some((s) => s.velocity.y > 0.2),
      sinceTurn: (last.time - (reversals.at(-1) ?? last.time)) / 50,
      // An observed position travels inbound; the release travels outbound.
      // Use our RTT once, plus observation age and half a server tick.
      delay: (ping + Math.min(age, 200)) / 50 + 0.5,
      age,
      revision,
    };
  }

  function plan(entity = target) {
    if (entity !== target) reset(entity);
    else observe(entity);
    const state = motion();
    if (!state || entity?.isValid === false) return null;
    return planBowShot(bot, entity, state);
  }
  return {
    reset,
    observe,
    motion,
    plan,
    get revision() {
      return revision;
    },
    dispose() {
      reset();
      for (const [name, listener] of listeners) bot._client?.off?.(name, listener);
    },
  };
}

function displacement(state, ticks, alternative = false) {
  if (state.cycle && !alternative) {
    const c = state.cycle,
      angle = (2 * Math.PI * ticks) / c.period,
      s = Math.sin(angle),
      cosine = Math.cos(angle) - 1;
    return state.position.offset(c.ax * s + c.bx * cosine, 0, c.az * s + c.bz * cosine);
  }
  let travel = ticks;
  if (state.kind === "zigzag" && !alternative) {
    if (state.period) {
      let left = ticks,
        next = Math.max(0, state.period - state.sinceTurn),
        direction = 1;
      travel = 0;
      // A stale repeating pattern is deliberately bounded to this short forecast.
      for (let i = 0; i < 100 && left > 0; i++) {
        const step = Math.min(left, next);
        travel += direction * step;
        left -= step;
        direction *= -1;
        next = state.period;
      }
    } else travel = 3 * (1 - Math.exp(-ticks / 3));
  }
  return state.position.offset(state.velocity.x * travel, 0, state.velocity.z * travel);
}

function forecast(bot, state, count, alternative = false) {
  const points = [state.position.clone()];
  let vy = state.velocity.y,
    grounded = state.grounded;
  for (let tick = 1; tick <= count; tick++) {
    const point = displacement(state, tick, alternative);
    const previous = points[tick - 1];
    // Stop the forecast at a wall instead of leading through it.
    const step = new Vec3(point.x - previous.x, 0, point.z - previous.z);
    const length = step.norm();
    if (
      length > 0.001 &&
      bot.world?.raycast?.(previous.offset(0, 0.6, 0), step.scaled(1 / length), length)
    ) {
      point.x = previous.x;
      point.z = previous.z;
    }
    if (grounded && bot.blockAt) {
      const block = bot.blockAt(new Vec3(point.x, previous.y - 0.05, point.z));
      if (block && block.boundingBox === "empty") grounded = false;
    }
    point.y = previous.y + (grounded ? 0 : vy);
    if (!grounded && vy <= 0 && bot.world?.raycast) {
      const hit = bot.world.raycast(
        new Vec3(point.x, previous.y + 0.01, point.z),
        new Vec3(0, -1, 0),
        Math.max(0.02, previous.y - point.y + 0.02),
      );
      if (hit?.intersect) {
        point.y = hit.intersect.y;
        grounded = true;
      }
    }
    vy = grounded ? 0 : (vy - 0.08) * 0.98;
    points.push(point);
  }
  return points;
}

function interpolate(points, time) {
  const t = clamp(time, 0, points.length - 1),
    index = Math.floor(t);
  const a = points[index],
    b = points[Math.min(index + 1, points.length - 1)];
  return a.plus(b.minus(a).scaled(t - index));
}

// Exact discrete arrow drag with a fractional final segment. Solve flight time
// instead of sweeping hundreds of yaw/pitch combinations.
function arrowFactors(ticks) {
  const n = Math.floor(ticks),
    fraction = ticks - n,
    decay = 0.99 ** n;
  const sum = (1 - decay) / 0.01;
  return { travel: sum + fraction * decay, drop: 5 * (n - sum + fraction * (1 - decay)) };
}

function arrowOrigin(bot) {
  const pose = bot.entity.metadata?.[6];
  const eye = pose === 3 || pose === "swimming" ? 0.4 : (bot.entity.eyeHeight ?? 1.62);
  return bot.entity.position.offset(0, eye - 0.1, 0);
}

function clearArc(bot, origin, velocity, ticks) {
  if (!bot.world?.raycast) return false;
  let position = origin.clone(),
    v = velocity.clone();
  for (let t = 0; t < ticks; t++) {
    const delta = v.scaled(Math.min(1, ticks - t)),
      length = delta.norm();
    if (length && bot.world.raycast(position, delta.scaled(1 / length), length)) return false;
    position.add(delta);
    v = v.scaled(0.99);
    v.y -= 0.05;
  }
  return true;
}

function planBowShot(bot, entity, state) {
  if (!finite(bot.entity?.position) || !finite(state.position) || !finite(state.velocity))
    return null;
  const origin = arrowOrigin(bot),
    inherited = finite(bot.entity.velocity) ? bot.entity.velocity.clone() : zero();
  if (bot.entity.onGround !== false) inherited.y = 0;
  const limit = 80,
    count = Math.ceil(limit + state.delay + 1);
  const primary = forecast(bot, state, count);
  const secondary = state.kind === "zigzag" ? forecast(bot, state, count, true) : null;
  const height = clamp(entity.height ?? 1.8, 0.2, 8),
    half = clamp(entity.width ?? 0.6, 0.1, 8) / 2;
  function aimAt(ticks, fraction) {
    const p = interpolate(primary, ticks + state.delay);
    // Choose the overlap of plausible hitboxes when possible; otherwise keep
    // the more strongly supported motion model. These weights are heuristics,
    // not calibrated hit probabilities.
    if (secondary) {
      const q = interpolate(secondary, ticks + state.delay);
      if (Math.abs(p.x - q.x) < half * 1.5 && Math.abs(p.z - q.z) < half * 1.5) {
        p.x += (q.x - p.x) * 0.3;
        p.z += (q.z - p.z) * 0.3;
      }
    }
    return p.offset(0, height * fraction, 0);
  }
  // The upper torso overlaps both a grounded hitbox and the apex of an
  // ordinary repeated jump. It tolerates an unobserved next takeoff without
  // inventing a future jump input or extrapolating upward indefinitely.
  for (const fraction of [state.recentJump ? 0.78 : 0.5, 0.75, 0.3]) {
    function required(ticks) {
      const point = aimAt(ticks, fraction),
        { travel, drop } = arrowFactors(ticks);
      return {
        point,
        launch: point
          .minus(origin)
          .offset(0, drop, 0)
          .scaled(1 / travel)
          .minus(inherited),
      };
    }
    let low = 0.05,
      high,
      found = false;
    for (high = 0.5; high <= limit; high += 0.5) {
      if (required(high).launch.norm() <= 3) {
        found = true;
        break;
      }
      low = high;
    }
    if (!found) continue;
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      if (required(mid).launch.norm() > 3) low = mid;
      else high = mid;
    }
    const ticks = (low + high) / 2,
      { point, launch } = required(ticks);
    const yaw = Math.atan2(-launch.x, -launch.z),
      pitch = Math.atan2(launch.y, horizontal(launch));
    const velocity = launch.scaled(3 / launch.norm()).plus(inherited);
    if (!clearArc(bot, origin, velocity, ticks)) continue;
    return {
      hit: true,
      yaw,
      pitch,
      ticks,
      point,
      kind: state.kind,
      revision: state.revision,
      observationAgeMs: state.age,
      leadTicks: state.delay,
    };
  }
  return null;
}

module.exports = { createBowAim, planBowShot, arrowFactors, arrowOrigin };
