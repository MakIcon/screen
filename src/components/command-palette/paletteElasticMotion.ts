export type ElasticPoint = { x: number; y: number };
export type PaletteConnection = { start: ElasticPoint; end: ElasticPoint; edge: "left" | "top" };
export type MeshPoint = ElasticPoint & { vx: number; vy: number };
export type PaletteMesh = readonly MeshPoint[];
export type PaletteSize = { width: number; height: number };

export const PALETTE_GRID = 6;
const LAST = PALETTE_GRID - 1;
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export const restingPaletteMesh = () => uniformPaletteMesh({ x: 0, y: 0 });

export function uniformPaletteMesh(target: ElasticPoint): PaletteMesh {
  return Array.from({ length: PALETTE_GRID ** 2 }, () => ({ ...target, vx: 0, vy: 0 }));
}

export function resistPaletteDrag(distance: number, limit: number): number {
  if (limit <= 0) return 0;
  const free = limit * 0.75;
  const pull = Math.max(0, Math.abs(distance) - free);
  const remaining = limit - free;
  return (
    Math.sign(distance) *
    (Math.min(Math.abs(distance), free) + (pull * remaining) / (remaining + pull))
  );
}

export function getPaletteMeshWeights(grab: { u: number; v: number }, size: PaletteSize): number[] {
  const distances = Array.from({ length: PALETTE_GRID ** 2 }, (_, i) =>
    Math.hypot(
      ((i % PALETTE_GRID) / LAST - grab.u) * size.width,
      (Math.floor(i / PALETTE_GRID) / LAST - grab.v) * size.height,
    ),
  );
  const farthest = Math.max(...distances, 1);
  return distances.map((distance) => distance / farthest);
}

export function advancePaletteMesh(
  mesh: PaletteMesh,
  target: ElasticPoint,
  weights: readonly number[],
  elapsed: number,
  dragging = false,
): PaletteMesh {
  // Don't replay a hidden window's missed frames.
  if (elapsed > 0.25) return uniformPaletteMesh(target);
  const duration = Math.max(0, elapsed);
  const steps = Math.max(1, Math.ceil(duration * 240));
  const dt = duration / steps;
  const next = mesh.map((point) => ({ ...point }));
  const forceX = new Float64Array(next.length);
  const forceY = new Float64Array(next.length);
  // While dragging the sheet is well damped: shaking it quickly must not hit resonance.
  const stiffness = weights.map((weight) => (dragging ? 600 - weight * 490 : 360 - weight * 290));
  const damping = weights.map((weight) => (dragging ? 34 - weight * 8 : 18 - weight * 8));

  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < next.length; i++) {
      const point = next[i];
      forceX[i] = stiffness[i] * (target.x - point.x) - damping[i] * point.vx;
      forceY[i] = stiffness[i] * (target.y - point.y) - damping[i] * point.vy;
    }
    // Neighbouring springs carry a bend across the sheet, including the middle of each edge.
    for (let i = 0; i < next.length; i++) {
      const connect = (j: number) => {
        const x = (next[j].x - next[i].x) * 100 + (next[j].vx - next[i].vx) * 1.5;
        const y = (next[j].y - next[i].y) * 100 + (next[j].vy - next[i].vy) * 1.5;
        forceX[i] += x;
        forceY[i] += y;
        forceX[j] -= x;
        forceY[j] -= y;
      };
      if (i % PALETTE_GRID < LAST) connect(i + 1);
      if (i < next.length - PALETTE_GRID) connect(i + PALETTE_GRID);
    }
    for (let i = 0; i < next.length; i++) {
      const point = next[i];
      point.vx += forceX[i] * dt;
      point.vy += forceY[i] * dt;
      point.x += point.vx * dt;
      point.y += point.vy * dt;
    }
  }
  return next;
}

export function isPaletteMeshSettled(mesh: PaletteMesh, target: ElasticPoint): boolean {
  return mesh.every(
    (p) => Math.hypot(p.x - target.x, p.y - target.y) < 0.04 && Math.hypot(p.vx, p.vy) < 0.25,
  );
}

export function isPaletteMeshAtRest(mesh: PaletteMesh): boolean {
  return mesh.every((p) => p.x === 0 && p.y === 0);
}

export function samplePaletteMesh(
  mesh: PaletteMesh,
  u: number,
  v: number,
  result: ElasticPoint,
): ElasticPoint {
  const x = Math.max(0, Math.min(1, u)) * LAST;
  const y = Math.max(0, Math.min(1, v)) * LAST;
  const col = Math.min(LAST - 1, Math.floor(x));
  const row = Math.min(LAST - 1, Math.floor(y));
  const a = mesh[row * PALETTE_GRID + col];
  const b = mesh[row * PALETTE_GRID + col + 1];
  const c = mesh[(row + 1) * PALETTE_GRID + col];
  const d = mesh[(row + 1) * PALETTE_GRID + col + 1];
  const tx = x - col;
  const ty = y - row;
  result.x = (a.x * (1 - tx) + b.x * tx) * (1 - ty) + (c.x * (1 - tx) + d.x * tx) * ty;
  result.y = (a.y * (1 - tx) + b.y * tx) * (1 - ty) + (c.y * (1 - tx) + d.y * tx) * ty;
  return result;
}

export function getPaletteMeshOffset(
  mesh: PaletteMesh,
  _size: PaletteSize,
  u: number,
  v: number,
): ElasticPoint {
  return samplePaletteMesh(mesh, u, v, { x: 0, y: 0 });
}

export const paletteWaveLimit = (size: PaletteSize) =>
  Math.min(112, Math.min(size.width, size.height) * 0.32);

export function constrainPaletteMesh(mesh: PaletteMesh, size: PaletteSize): PaletteMesh {
  const center = getPaletteMeshOffset(mesh, size, 0.5, 0.5);
  const cellWidth = size.width / LAST;
  const cellHeight = size.height / LAST;
  let gradient = 0;
  let amplitude = 0;
  for (const point of mesh)
    amplitude = Math.max(amplitude, Math.abs(point.x - center.x), Math.abs(point.y - center.y));
  for (let row = 0; row < LAST; row++) {
    for (let col = 0; col < LAST; col++) {
      const a = mesh[row * PALETTE_GRID + col];
      const b = mesh[row * PALETTE_GRID + col + 1];
      const c = mesh[(row + 1) * PALETTE_GRID + col];
      const d = mesh[(row + 1) * PALETTE_GRID + col + 1];
      for (const axis of ["x", "y"] as const) {
        const horizontal = Math.max(Math.abs(b[axis] - a[axis]), Math.abs(d[axis] - c[axis]));
        const vertical = Math.max(Math.abs(c[axis] - a[axis]), Math.abs(d[axis] - b[axis]));
        gradient = Math.max(gradient, horizontal / cellWidth + vertical / cellHeight);
      }
    }
  }
  // Keep the sheet invertible: a sharp reversal must bend it without folding pixels over.
  const scale = Math.min(1, 0.55 / gradient, paletteWaveLimit(size) / amplitude);
  if (scale >= 1) return mesh;
  return mesh.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
    vx: point.vx * scale,
    vy: point.vy * scale,
  }));
}

export function pinPaletteMesh(
  mesh: PaletteMesh,
  size: PaletteSize,
  grab: { u: number; v: number },
  target: ElasticPoint,
): PaletteMesh {
  const held = getPaletteMeshOffset(mesh, size, grab.u, grab.v);
  return mesh.map((p) => ({
    ...p,
    x: target.x + p.x - held.x,
    y: target.y + p.y - held.y,
  }));
}

export function getPaletteMeshTransform(mesh: PaletteMesh, size: PaletteSize): string {
  const center = getPaletteMeshOffset(mesh, size, 0.5, 0.5);
  return `translate3d(${center.x.toFixed(3)}px, ${center.y.toFixed(3)}px, 0)`;
}

export function getPaletteElasticConnector(
  connection: PaletteConnection,
  offset: ElasticPoint = { x: 0, y: 0 },
): { path: string; end: ElasticPoint } {
  const { start, edge } = connection;
  const end = { x: connection.end.x + offset.x, y: connection.end.y + offset.y };
  const span = edge === "left" ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y);
  const handle = Math.min(160, Math.max(12, span * 0.45));
  const bow = clamp((edge === "left" ? offset.y : offset.x) * 0.08, 24);
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
