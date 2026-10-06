export type NodeKind = "mod" | "shader" | "pack";

export interface SimNode {
  id: string;
  label: string;
  author: string;
  iconKey: string | null;
  filename: string | null;
  version?: string | null;
  kind: NodeKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pinned: boolean;
  status?: "installing" | "ok" | "fail";
}

export function sameConstellationNode(live: SimNode, installed: SimNode) {
  return (
    live.kind === installed.kind &&
    (live.id === installed.id ||
      (!!live.filename && live.filename === installed.filename) ||
      (!live.filename && !!live.iconKey && live.iconKey === installed.iconKey))
  );
}

export function constellationNodeIsFixed(node: SimNode) {
  return node.pinned || node.status === "installing";
}

/** Patch installed metadata while keeping live objects, motion and drag state. */
export function reconcileConstellationNodes(
  current: SimNode[],
  installed: SimNode[],
  pending: ReadonlySet<SimNode>,
): SimNode[] {
  const remaining = new Set(installed);
  const next: SimNode[] = [];
  for (const node of current) {
    const match = [...remaining].find((entry) => sameConstellationNode(node, entry));
    if (match) {
      remaining.delete(match);
      node.id = match.id;
      node.label = match.label;
      node.author = match.author;
      node.iconKey = match.iconKey;
      node.filename = match.filename;
      node.version = match.version;
      node.r = match.r;
      // A file may already be listed while dependencies are still downloading.
      // Only the installation promise can finish the live loading state.
      if (node.status !== "installing") node.status = match.status ?? node.status;
      next.push(node);
    } else if (pending.has(node)) {
      // Another refresh can finish before this installation has reached disk.
      next.push(node);
    }
  }
  for (const node of remaining) next.push({ ...node });
  return next;
}
