/**
 * Verlet rope for a RAM warning sign that has been knocked loose: the arrow tip stays pinned
 * where it points, the arrow turns into a cord, and the sign hangs from it like a lamp.
 */

export type Point = { x: number; y: number };

type Particle = Point & { px: number; py: number; w: number };

export type Rope = {
  /** 0 is the pinned arrow tip, the last one is the hook on the sign. */
  points: Particle[];
  /** The sign's centre of mass, held at `arm` from the hook. */
  centre: Particle;
  segment: number;
  /** Segment length the cord shrinks to, so a long arrow does not drop the sign off-screen. */
  cord: number;
  arm: number;
  /**
   * Hook in the sign's own, unrotated box. It starts where the arrow left the sign and slides
   * to the middle of the top edge, so the sign ends up hanging straight.
   */
  hook: Point;
  hookFrom: Point;
  hookTo: Point;
  centreLocal: Point;
  /** Steps since release. */
  age: number;
  /** Where the pointer drags the centre to while the sign is held. */
  pull: Point | null;
  calm: number;
};

export type SignPose = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** transform-origin within the box. */
  origin: Point;
  angle: number;
};

const SEGMENTS = 18;
const GRAVITY = 2400;
const STEP = 1 / 120;
const DAMPING = 0.994;
const ITERATIONS = 24;
const SIGN_INVERSE_MASS = 1 / 6;
/** Share of the sign's spin around the hook lost per step: a lamp swings, it does not twirl. */
const SPIN_DAMPING = 0.22;
const HOOK_SLIDE_STEPS = 45;

const particle = (p: Point, w: number): Particle => ({ x: p.x, y: p.y, px: p.x, py: p.y, w });

function resample(path: Point[], count: number) {
  const lengths = [0];
  for (let i = 1; i < path.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  }
  const total = lengths[lengths.length - 1];
  const out: Point[] = [];
  let j = 1;
  for (let i = 0; i <= count; i++) {
    const at = (total * i) / count;
    while (j < path.length - 1 && lengths[j] < at) j++;
    const span = lengths[j] - lengths[j - 1] || 1;
    const t = Math.min(1, Math.max(0, (at - lengths[j - 1]) / span));
    out.push({
      x: path[j - 1].x + (path[j].x - path[j - 1].x) * t,
      y: path[j - 1].y + (path[j].y - path[j - 1].y) * t,
    });
  }
  return { points: out, total };
}

/** `arrow` runs from the sign to the tip, exactly as it is drawn while pinned. */
export function createRope(arrow: Point[], pose: SignPose, maxLength: number): Rope {
  const cos = Math.cos(pose.angle);
  const sin = Math.sin(pose.angle);
  const toScreen = ({ x, y }: Point) => {
    const dx = x - pose.origin.x;
    const dy = y - pose.origin.y;
    return {
      x: pose.left + pose.origin.x + dx * cos - dy * sin,
      y: pose.top + pose.origin.y + dx * sin + dy * cos,
    };
  };
  const toLocal = ({ x, y }: Point) => {
    const dx = x - pose.left - pose.origin.x;
    const dy = y - pose.top - pose.origin.y;
    return { x: pose.origin.x + dx * cos + dy * sin, y: pose.origin.y - dx * sin + dy * cos };
  };
  // The cord starts exactly where the arrow left the sign, so nothing jumps on release.
  const hook = toLocal(arrow[0]);
  const centreLocal = { x: pose.width / 2, y: pose.height / 2 };
  const { points, total } = resample([...arrow].reverse(), SEGMENTS);
  return {
    points: points.map((p, i) =>
      particle(p, i === 0 ? 0 : i === points.length - 1 ? SIGN_INVERSE_MASS : 1),
    ),
    centre: particle(toScreen(centreLocal), SIGN_INVERSE_MASS),
    segment: total / SEGMENTS,
    cord: Math.min(total, maxLength) / SEGMENTS,
    arm: Math.hypot(centreLocal.x - hook.x, centreLocal.y - hook.y),
    hook,
    hookFrom: hook,
    // Just inside the top edge, so the end of the cord stays tucked under the sign.
    hookTo: { x: pose.width / 2, y: 6 },
    centreLocal,
    age: 0,
    pull: null,
    calm: 0,
  };
}

/** Moves a particle without giving it any velocity. */
function shift(p: Particle, dx: number, dy: number) {
  p.x += dx;
  p.y += dy;
  p.px += dx;
  p.py += dy;
}

function constrain(a: Particle, b: Particle, length: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy) || 1e-6;
  const weight = a.w + b.w;
  if (!weight) return;
  const k = (distance - length) / distance / weight;
  a.x += dx * k * a.w;
  a.y += dy * k * a.w;
  b.x -= dx * k * b.w;
  b.y -= dy * k * b.w;
}

function step(rope: Rope, tip: Point) {
  let motion = 0;
  for (const p of [...rope.points, rope.centre]) {
    if (!p.w) continue;
    const vx = (p.x - p.px) * DAMPING;
    const vy = (p.y - p.py) * DAMPING;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + GRAVITY * STEP * STEP;
    motion = Math.max(motion, Math.abs(vx) + Math.abs(vy));
  }
  const centre = rope.centre;
  const hook = rope.points[rope.points.length - 1];
  centre.px += (centre.x - centre.px - (hook.x - hook.px)) * SPIN_DAMPING;
  centre.py += (centre.y - centre.py - (hook.y - hook.py)) * SPIN_DAMPING;
  if (rope.pull) {
    rope.centre.x += (rope.pull.x - rope.centre.x) * 0.25;
    rope.centre.y += (rope.pull.y - rope.centre.y) * 0.25;
  }
  rope.segment += (rope.cord - rope.segment) * 0.012;
  if (rope.age < HOOK_SLIDE_STEPS) {
    // Slide the hook along the sign while keeping the sign's current tilt.
    const angle = signPose(rope).angle;
    const t = ++rope.age / HOOK_SLIDE_STEPS;
    const eased = t * t * (3 - 2 * t);
    rope.hook = {
      x: rope.hookFrom.x + (rope.hookTo.x - rope.hookFrom.x) * eased,
      y: rope.hookFrom.y + (rope.hookTo.y - rope.hookFrom.y) * eased,
    };
    const dx = rope.centreLocal.x - rope.hook.x;
    const dy = rope.centreLocal.y - rope.hook.y;
    shift(
      hook,
      rope.centre.x - (dx * Math.cos(angle) - dy * Math.sin(angle)) - hook.x,
      rope.centre.y - (dx * Math.sin(angle) + dy * Math.cos(angle)) - hook.y,
    );
    rope.arm = Math.hypot(dx, dy);
  }
  const first = rope.points[0];
  first.x = first.px = tip.x;
  first.y = first.py = tip.y;
  for (let i = 0; i < ITERATIONS; i++) {
    for (let j = 1; j < rope.points.length; j++) {
      constrain(rope.points[j - 1], rope.points[j], rope.segment);
    }
    constrain(hook, centre, rope.arm);
  }
  rope.calm = !rope.pull && motion < 0.01 ? rope.calm + 1 : 0;
}

/** Advances by `elapsed` seconds; returns false once the sign has stopped swinging. */
export function advanceRope(rope: Rope, tip: Point, elapsed: number) {
  const steps = Math.min(8, Math.max(1, Math.round(elapsed / STEP)));
  for (let i = 0; i < steps; i++) step(rope, tip);
  return rope.calm < 90;
}

/** Adds velocity (px/s) to the whole sign, e.g. from something landing on it. */
export function pushRope(rope: Rope, vx: number, vy: number) {
  for (const p of [rope.centre, rope.points[rope.points.length - 1]]) {
    p.px -= vx * STEP;
    p.py -= vy * STEP;
  }
  rope.calm = 0;
}

/** Keeps the hook centred when the sign's text, and so its size, changes while it hangs. */
export function resizeRope(rope: Rope, width: number, height: number) {
  rope.centreLocal = { x: width / 2, y: height / 2 };
  rope.hookTo = { x: width / 2, y: 6 };
  if (rope.age >= HOOK_SLIDE_STEPS) rope.hook = rope.hookTo;
  rope.arm = Math.hypot(rope.centreLocal.x - rope.hook.x, rope.centreLocal.y - rope.hook.y);
  rope.calm = 0;
}

/** Wakes a resting rope, e.g. after the page scrolled and the tip moved. */
export function nudgeRope(rope: Rope) {
  rope.calm = 0;
}

export function signPose(rope: Rope) {
  const hook = rope.points[rope.points.length - 1];
  const { centreLocal: local } = rope;
  return {
    left: hook.x - rope.hook.x,
    top: hook.y - rope.hook.y,
    origin: rope.hook,
    angle:
      Math.atan2(rope.centre.y - hook.y, rope.centre.x - hook.x) -
      Math.atan2(local.y - rope.hook.y, local.x - rope.hook.x),
  };
}
