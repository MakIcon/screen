export type ElasticPoint = { x: number; y: number };
export type PaletteConnection = {
  start: ElasticPoint;
  end: ElasticPoint;
  edge: "left" | "top";
};
export type PaletteSpring = ElasticPoint & { vx: number; vy: number };

export const restingPaletteSpring = (): PaletteSpring => ({ x: 0, y: 0, vx: 0, vy: 0 });

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

// Resistance increases with distance; even a pointer outside the window cannot pull it away.
export function resistPaletteDrag(distance: number, limit: number): number {
  return limit > 0 ? (distance * limit) / (limit + Math.abs(distance)) : 0;
}

export function advancePaletteSpring(
  motion: PaletteSpring,
  target: ElasticPoint,
  elapsed: number,
): PaletteSpring {
  // Exact damped-spring solution: consistent at any refresh rate, including a throttled tab.
  const duration = Math.max(0, Math.min(elapsed, 10));
  const damping = 8.5;
  const stiffness = 190;
  const frequency = Math.sqrt(stiffness - damping * damping);
  const decay = Math.exp(-damping * duration);
  const cosine = Math.cos(frequency * duration);
  const sine = Math.sin(frequency * duration);
  const axis = (position: number, velocity: number, destination: number) => {
    const offset = position - destination;
    return {
      position:
        destination +
        decay * (offset * cosine + ((velocity + damping * offset) / frequency) * sine),
      velocity:
        decay *
        (velocity * cosine - ((damping * velocity + stiffness * offset) / frequency) * sine),
    };
  };
  const x = axis(motion.x, motion.vx, target.x);
  const y = axis(motion.y, motion.vy, target.y);
  return { x: x.position, y: y.position, vx: x.velocity, vy: y.velocity };
}

export function isPaletteSpringSettled(motion: PaletteSpring, target: ElasticPoint): boolean {
  return (
    Math.hypot(motion.x - target.x, motion.y - target.y) < 0.025 &&
    Math.hypot(motion.vx, motion.vy) < 0.15
  );
}

export function getPaletteElasticTransform(motion: PaletteSpring, animated: boolean): string {
  const translate = `translate3d(${motion.x.toFixed(3)}px, ${motion.y.toFixed(3)}px, 0)`;
  if (!animated) return translate;
  const tilt = clamp(motion.x * 0.006 + motion.vx * 0.002, 2.1);
  const shear = clamp(-motion.x * 0.004 - motion.vx * 0.003, 2.4);
  const stretchX = clamp(motion.x / 18000 + motion.vx / 40000, 0.022);
  const stretchY = clamp(motion.y / 18000 + motion.vy / 40000, 0.022);
  return `${translate} rotate(${tilt.toFixed(4)}deg) skewX(${shear.toFixed(4)}deg) scale(${(1 + stretchX - stretchY * 0.4).toFixed(5)}, ${(1 + stretchY - stretchX * 0.4).toFixed(5)})`;
}

export function getPaletteElasticConnector(
  connection: PaletteConnection,
  motion: PaletteSpring = restingPaletteSpring(),
): { path: string; end: ElasticPoint } {
  const { start, edge } = connection;
  const end = { x: connection.end.x + motion.x, y: connection.end.y + motion.y };
  const span = edge === "left" ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y);
  const handle = Math.min(160, Math.max(12, span * 0.45));
  const bow = clamp(
    (edge === "left" ? motion.y : motion.x) * 0.08 +
      (edge === "left" ? motion.vy : motion.vx) * 0.008,
    24,
  );
  const first =
    edge === "left"
      ? { x: start.x + handle, y: start.y + bow }
      : { x: start.x + bow, y: start.y + handle };
  const second =
    edge === "left" ? { x: end.x - handle, y: end.y + bow } : { x: end.x + bow, y: end.y - handle };
  return {
    path: `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${end.x} ${end.y}`,
    end,
  };
}
