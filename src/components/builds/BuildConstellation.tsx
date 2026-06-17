import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstalledModView, ModrinthSearchResponse } from "../../types";

interface WildEntry { projectId: string; title: string; author: string; iconUrl: string | null; kind: "mod" | "shader" | "pack"; downloads: number; }

/* ─────────────────────────────────────────────────────────────────────────
   Mod constellation — every installed item is a star carrying its real mod
   icon. We can't know real load-order dependencies, so the lines mean the
   thing we DO know: stars by the same AUTHOR are wired into one constellation.

   Toys: grab & fling stars (they keep velocity, bounce, knock neighbours and
   tug their constellation), leave comet trails when fast, spark on hard hits,
   the whole field slowly swirls, shooting stars streak the background, and
   double-clicking a star goes supernova with a shockwave that blasts the rest.
   ──────────────────────────────────────────────────────────────────────── */

type NodeKind = "mod" | "shader" | "pack";

interface SimNode {
  id: string;
  label: string;
  author: string;
  iconKey: string | null;
  filename: string | null;
  kind: NodeKind;
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  pinned: boolean;
  status?: "installing" | "ok" | "fail";
}

interface SimEdge { a: number; b: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; }
interface Ring { x: number; y: number; r: number; life: number; color: string; }
interface Shooting { x: number; y: number; vx: number; vy: number; life: number; }
interface Nebula { x: number; y: number; r: number; dx: number; dy: number; color: string; }

const COLORS: Record<NodeKind, { core: string; glow: string }> = {
  mod:    { core: "#e7e2d8", glow: "rgba(231, 226, 216, 0.34)" },
  shader: { core: "#a78bfa", glow: "rgba(167, 139, 250, 0.45)" },
  pack:   { core: "#34d399", glow: "rgba(52, 211, 153, 0.42)" },
};

// RGB triplets per kind so outlines / rings can be tinted to match.
const RGB: Record<NodeKind, string> = {
  mod: "231, 226, 216",
  shader: "167, 139, 250",
  pack: "52, 211, 153",
};

const GENERIC_AUTHORS = new Set(["", "modrinth", "local file"]);

interface Props {
  instanceId: string;
  loader: string;
  version: string;
  mods: InstalledModView[];
  packs: InstalledModView[];
  shaders: InstalledModView[];
  loading: boolean;
}

export function BuildConstellation({ instanceId, version, mods, packs, shaders, loading }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const wildPoolRef = useRef<WildEntry[]>([]);
  const [iconUrls, setIconUrls] = useState<Record<string, string | null>>({});
  const [authorMap, setAuthorMap] = useState<Record<string, string | null>>({});

  const projectIds = useMemo(
    () => Array.from(new Set(
      [...mods, ...packs, ...shaders].map((i) => i.projectId).filter((v): v is string => !!v),
    )),
    [mods, packs, shaders],
  );

  // Project ids caught via the constellation — persisted so the "installed
  // here" dot survives reopening the modal.
  const [caughtIds, setCaughtIds] = useState<Set<string>>(() => loadCaughtIds(instanceId));
  useEffect(() => { setCaughtIds(loadCaughtIds(instanceId)); }, [instanceId]);

  const graph = useMemo(() => {
    const nodes: SimNode[] = [];
    const edges: SimEdge[] = [];

    const add = (item: InstalledModView, kind: NodeKind, r: number) => {
      const fetched = item.projectId ? authorMap[item.projectId] : null;
      const author = (fetched && fetched.trim()) ? fetched : (item.author || "");
      nodes.push({
        id: `${kind}:${item.filename}`,
        label: item.title,
        author,
        iconKey: item.projectId || null,
        filename: item.filename,
        kind,
        x: 0, y: 0, vx: 0, vy: 0, r, pinned: false,
        status: item.projectId && caughtIds.has(item.projectId) ? "ok" : undefined,
      });
    };

    mods.forEach((m) => add(m, "mod", 20));
    shaders.forEach((s) => add(s, "shader", 18));
    packs.forEach((p) => add(p, "pack", 18));

    const groups = new Map<string, number[]>();
    nodes.forEach((n, i) => {
      const a = n.author.trim().toLowerCase();
      if (GENERIC_AUTHORS.has(a)) return;
      if (!groups.has(a)) groups.set(a, []);
      groups.get(a)!.push(i);
    });
    for (const idxs of groups.values()) {
      if (idxs.length === 2) {
        edges.push({ a: idxs[0], b: idxs[1] });
      } else if (idxs.length > 2) {
        for (let k = 0; k < idxs.length; k++) {
          edges.push({ a: idxs[k], b: idxs[(k + 1) % idxs.length] });
        }
      }
    }
    return { nodes, edges };
  }, [mods, packs, shaders, authorMap, caughtIds]);

  useEffect(() => {
    if (projectIds.length === 0) return;
    let alive = true;
    invoke<Record<string, string | null>>("get_modrinth_project_icons", { projectIds })
      .then((res) => { if (alive) setIconUrls(res); })
      .catch(() => { /* lettered fallback */ });
    return () => { alive = false; };
  }, [projectIds]);

  // Resolve real authors from Modrinth (installed metadata often just says the
  // source, e.g. "MODRINTH", instead of the actual author).
  useEffect(() => {
    if (projectIds.length === 0) return;
    let alive = true;
    invoke<Record<string, string | null>>("get_modrinth_project_authors", { projectIds })
      .then((res) => { if (alive) setAuthorMap(res); })
      .catch(() => { /* keep stored author */ });
    return () => { alive = false; };
  }, [projectIds]);

  useEffect(() => {
    for (const [key, url] of Object.entries(iconUrls)) {
      if (!url || imagesRef.current.has(key)) continue;
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = url;
      img.onload = () => imagesRef.current.set(key, img);
    }
  }, [iconUrls]);

  // Pool of random Modrinth content (mods + shaders + packs) that drifts past
  // the background to be caught.
  useEffect(() => {
    let alive = true;
    const gameVersion = version || "";
    const off = () => Math.floor(Math.random() * 120);
    const search = (cmd: string, limit: number) =>
      invoke<ModrinthSearchResponse>(cmd, { instanceId, query: "", gameVersion, offset: off(), limit })
        .catch(() => null);

    Promise.all([
      search("search_modrinth_mods", 18),
      search("search_modrinth_shaders", 10),
      search("search_modrinth_resourcepacks", 10),
    ]).then(([m, s, p]) => {
      if (!alive) return;
      const pool: WildEntry[] = [];
      const addHits = (res: ModrinthSearchResponse | null, kind: WildEntry["kind"]) => {
        if (!res) return;
        for (const h of res.hits) {
          if (!h.iconUrl || h.installed) continue; // skip already-installed
          pool.push({ projectId: h.projectId, title: h.title, author: h.author, iconUrl: h.iconUrl, kind, downloads: h.downloads ?? 0 });
        }
      };
      addHits(m, "mod");
      addHits(s, "shader");
      addHits(p, "pack");
      wildPoolRef.current = pool;
      for (const e of pool) {
        if (e.iconUrl && !imagesRef.current.has(e.projectId)) {
          const img = new Image();
          img.referrerPolicy = "no-referrer";
          img.src = e.iconUrl;
          img.onload = () => imagesRef.current.set(e.projectId, img);
        }
      }
    });
    return () => { alive = false; };
  }, [version, instanceId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || loading) return;
    if (graph.nodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Same trash glyph as the "delete build" button (14×14 viewBox).
    const trashPath = new Path2D(
      "M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8",
    );

    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
    let edges: SimEdge[] = [];
    let adjacency = new Set<string>();

    // Recompute same-author constellations + adjacency (called when a wild mod
    // is caught and added to the field).
    const rebuildGraph = () => {
      edges = [];
      const groups = new Map<string, number[]>();
      nodes.forEach((n, i) => {
        const a = n.author.trim().toLowerCase();
        if (GENERIC_AUTHORS.has(a)) return;
        if (!groups.has(a)) groups.set(a, []);
        groups.get(a)!.push(i);
      });
      for (const idxs of groups.values()) {
        if (idxs.length === 2) edges.push({ a: idxs[0], b: idxs[1] });
        else if (idxs.length > 2) {
          for (let k = 0; k < idxs.length; k++) edges.push({ a: idxs[k], b: idxs[(k + 1) % idxs.length] });
        }
      }
      adjacency = new Set<string>();
      edges.forEach((e) => { adjacency.add(`${e.a}-${e.b}`); adjacency.add(`${e.b}-${e.a}`); });
    };
    rebuildGraph();

    let W = 0;
    let H = 0;
    let dpr = 1;

    const stars: { x: number; y: number; r: number; a: number }[] = [];
    const particles: Particle[] = [];
    const rings: Ring[] = [];
    const shooting: Shooting[] = [];
    const nebula: Nebula[] = [];
    const wild: { projectId: string; title: string; author: string; kind: NodeKind; x: number; y: number; vx: number; vy: number; r: number }[] = [];
    const trails: { x: number; y: number }[][] = nodes.map(() => []);

    const spawnWild = () => {
      const pool = wildPoolRef.current;
      if (!pool.length) return;
      // don't fly in something that's already a star (installed or just caught)
      let p: WildEntry | null = null;
      for (let tries = 0; tries < 6; tries++) {
        const cand = pool[Math.floor(Math.random() * pool.length)];
        if (!nodes.some((n) => n.iconKey === cand.projectId)) { p = cand; break; }
      }
      if (!p) return;
      const fromLeft = Math.random() < 0.5;
      // Popularity → speed: niche (few downloads) zips by, popular drifts slow.
      const pop = Math.min(1, Math.log10((p.downloads || 0) + 1) / 7);
      const speed = 0.8 + (1 - pop) * 3;
      wild.push({
        projectId: p.projectId,
        title: p.title,
        author: p.author,
        kind: p.kind,
        x: fromLeft ? -30 : W + 30,
        y: H * (0.1 + Math.random() * 0.8),
        vx: (fromLeft ? 1 : -1) * speed,
        vy: (Math.random() - 0.5) * 0.5,
        r: p.kind === "mod" ? 15 : 14,
      });
    };

    const spawnBurst = (x: number, y: number, color: string, count: number, spd: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = spd * (0.25 + Math.random());
        particles.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 1, max: 0.45 + Math.random() * 0.7,
          size: 1 + Math.random() * 2.4, color,
        });
      }
      if (particles.length > 460) particles.splice(0, particles.length - 460);
    };

    const seedLayout = () => {
      nodes.forEach((n, i) => {
        const ang = (i / nodes.length) * Math.PI * 2 + Math.random() * 0.4;
        const rad = Math.min(W, H) * (0.12 + 0.3 * Math.random());
        n.x = W / 2 + Math.cos(ang) * rad;
        n.y = H / 2 + Math.sin(ang) * rad;
        n.vx = 0; n.vy = 0;
      });
    };
    const seedStars = () => {
      stars.length = 0;
      const count = Math.round((W * H) / 5200);
      for (let i = 0; i < count; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.1 + 0.2, a: Math.random() * 0.5 + 0.12 });
      }
    };
    const seedNebula = () => {
      nebula.length = 0;
      const palette = ["rgba(167,139,250,0.10)", "rgba(52,211,153,0.08)", "rgba(245,158,11,0.08)", "rgba(96,165,250,0.09)"];
      for (let i = 0; i < 4; i++) {
        nebula.push({
          x: Math.random() * W, y: Math.random() * H,
          r: 120 + Math.random() * 150,
          dx: (Math.random() - 0.5) * 0.15, dy: (Math.random() - 0.5) * 0.15,
          color: palette[i % palette.length],
        });
      }
    };

    let seeded = false;
    const resize = () => {
      W = wrap.clientWidth; H = wrap.clientHeight;
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedStars();
      seedNebula();
      if (!seeded) { seedLayout(); seeded = true; }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ── Interaction ─────────────────────────────────────────────────────
    let dragId = -1;
    let hoverId = -1;
    let wildHover = -1;
    let overTrash = false;
    const pointer = { x: 0, y: 0, px: 0, py: 0 };

    const trashRect = () => ({ w: 152, h: 50, x: W / 2 - 76, y: H - 62 });
    const inTrash = (x: number, y: number) => {
      const t = trashRect();
      return x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h;
    };
    const deleteNode = (i: number) => {
      const n = nodes[i];
      spawnBurst(n.x, n.y, "#ef4444", 20, 9);
      rings.push({ x: n.x, y: n.y, r: 6, life: 1, color: "rgba(239,68,68,0.85)" });
      if (n.iconKey) removeCaughtId(instanceId, n.iconKey);
      if (n.filename) {
        const cmd =
          n.kind === "shader" ? "uninstall_modrinth_shader"
          : n.kind === "pack" ? "uninstall_modrinth_resourcepack"
          : "uninstall_modrinth_mod";
        invoke(cmd, { instanceId, filename: n.filename }).catch(() => { /* already gone */ });
      }
      nodes.splice(i, 1);
      trails.splice(i, 1);
      rebuildGraph();
    };
    const toLocal = (e: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const pick = (x: number, y: number): number => {
      let best = -1; let bestD = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const d = Math.hypot(n.x - x, n.y - y);
        if (d < n.r + 6 && d < bestD) { bestD = d; best = i; }
      }
      return best;
    };
    const pickWild = (x: number, y: number): number => {
      let best = -1; let bestD = Infinity;
      for (let i = 0; i < wild.length; i++) {
        const w = wild[i];
        const d = Math.hypot(w.x - x, w.y - y);
        if (d < w.r + 8 && d < bestD) { bestD = d; best = i; }
      }
      return best;
    };
    const catchWild = (wi: number, pointerId: number) => {
      const w = wild[wi];
      wild.splice(wi, 1);
      const id = `${w.kind}:${w.projectId}`;
      if (nodes.some((n) => n.id === id)) {
        // already in the field — just a little firework, no duplicate
        spawnBurst(w.x, w.y, `rgb(${RGB[w.kind]})`, 12, 8);
        return;
      }
      const node: SimNode = {
        id, label: w.title, author: w.author, iconKey: w.projectId, filename: null, kind: w.kind,
        x: w.x, y: w.y, vx: 0, vy: 0, r: w.kind === "mod" ? 20 : 18, pinned: true, status: "installing",
      };
      nodes.push(node);
      trails.push([]);
      rebuildGraph();
      spawnBurst(w.x, w.y, "#ffffff", 14, 12);
      spawnBurst(w.x, w.y, `rgb(${RGB[w.kind]})`, 18, 9);
      rings.push({ x: w.x, y: w.y, r: 6, life: 1, color: `rgba(${RGB[w.kind]}, 0.85)` });
      dragId = nodes.length - 1;
      try { canvas.setPointerCapture(pointerId); } catch { /* noop */ }
      canvas.style.cursor = "grabbing";

      // Actually install it into the build, using the right target.
      const cmd =
        w.kind === "shader" ? "install_modrinth_shader"
        : w.kind === "pack" ? "install_modrinth_resourcepack"
        : "install_modrinth_project";
      const listCmd =
        w.kind === "shader" ? "list_installed_shaders"
        : w.kind === "pack" ? "list_installed_resourcepacks"
        : "list_installed_mods";
      invoke(cmd, { instanceId, projectId: w.projectId })
        .then(() => {
          node.status = "ok";
          addCaughtId(instanceId, w.projectId);
          spawnBurst(node.x, node.y, "#34d399", 16, 8);
          rings.push({ x: node.x, y: node.y, r: 6, life: 1, color: "rgba(52,211,153,0.85)" });
          // resolve the on-disk filename so the star can be deleted later
          invoke<InstalledModView[]>(listCmd, { instanceId })
            .then((list) => {
              const hit = list.find((m) => m.projectId === w.projectId);
              if (hit) node.filename = hit.filename;
            })
            .catch(() => { /* noop */ });
        })
        .catch(() => {
          node.status = "fail";
          spawnBurst(node.x, node.y, "#ef4444", 14, 7);
        });
    };
    const onDown = (e: PointerEvent) => {
      const { x, y } = toLocal(e);
      pointer.x = pointer.px = x; pointer.y = pointer.py = y;
      const wi = pickWild(x, y);
      if (wi >= 0) { catchWild(wi, e.pointerId); return; }
      const i = pick(x, y);
      if (i >= 0) {
        dragId = i;
        nodes[i].pinned = true;
        rings.push({ x: nodes[i].x, y: nodes[i].y, r: nodes[i].r, life: 1, color: `rgba(${RGB[nodes[i].kind]}, 0.75)` });
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
      }
    };
    const onMove = (e: PointerEvent) => {
      const { x, y } = toLocal(e);
      pointer.px = pointer.x; pointer.py = pointer.y;
      pointer.x = x; pointer.y = y;
      if (dragId >= 0) {
        nodes[dragId].x = x; nodes[dragId].y = y;
        overTrash = inTrash(x, y);
      } else {
        hoverId = pick(x, y);
        wildHover = hoverId >= 0 ? -1 : pickWild(x, y);
        canvas.style.cursor = hoverId >= 0 || wildHover >= 0 ? "grab" : "default";
      }
    };
    const onUp = (e: PointerEvent) => {
      if (dragId >= 0) {
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
        if (inTrash(pointer.x, pointer.y)) {
          deleteNode(dragId);
        } else {
          const n = nodes[dragId];
          n.vx = clamp(pointer.x - pointer.px, -40, 40);
          n.vy = clamp(pointer.y - pointer.py, -40, 40);
          n.pinned = false;
        }
      }
      dragId = -1;
      overTrash = false;
      canvas.style.cursor = "default";
    };
    const onDbl = (e: MouseEvent) => {
      const { x, y } = toLocal(e);
      const i = pick(x, y);
      const cx = i >= 0 ? nodes[i].x : x;
      const cy = i >= 0 ? nodes[i].y : y;
      const tint = i >= 0 ? COLORS[nodes[i].kind].core : "#fbbf24";
      spawnBurst(cx, cy, "#ffffff", 28, 15);
      spawnBurst(cx, cy, tint, 22, 10);
      rings.push({ x: cx, y: cy, r: 6, life: 1, color: "rgba(255,255,255,0.8)" });
      for (const n of nodes) {
        if (n.pinned) continue;
        const dx = n.x - cx; const dy = n.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 190) { const f = ((190 - d) / 190) * 26; n.vx += (dx / d) * f; n.vy += (dy / d) * f; }
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("dblclick", onDbl);
    canvas.addEventListener("pointerleave", () => { if (dragId < 0) hoverId = -1; });

    // ── Physics ─────────────────────────────────────────────────────────
    const REST = 104, SPRING = 0.014, REPULSE = 2200, DAMP = 0.9, MAX_V = 28;
    const isAdj = (a: number, b: number) => adjacency.has(`${a}-${b}`);

    const step = () => {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (a.pinned) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x; let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.01; }
          const d = Math.sqrt(d2);
          const f = REPULSE / d2;
          const nx = dx / d; const ny = dy / d;
          a.vx += nx * f; a.vy += ny * f;
          if (!b.pinned) { b.vx -= nx * f; b.vy -= ny * f; }
          const minD = a.r + b.r + 6;
          if (d < minD) {
            const push = (minD - d) * 0.5;
            a.vx += nx * push; a.vy += ny * push;
            if (!b.pinned) { b.vx -= nx * push; b.vy -= ny * push; }
            const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
            if (rel > 7 && Math.random() < 0.25) {
              spawnBurst((a.x + b.x) / 2, (a.y + b.y) / 2, "#fbbf24", 4, rel * 0.3);
            }
          }
        }
        // centering + gentle swirl + per-star jitter so motion isn't uniform
        a.vx += (W / 2 - a.x) * 0.0018;
        a.vy += (H / 2 - a.y) * 0.0018;
        const ox = a.x - W / 2; const oy = a.y - H / 2;
        a.vx += -oy * 0.00009 + (Math.random() - 0.5) * 0.06;
        a.vy += ox * 0.00009 + (Math.random() - 0.5) * 0.06;
      }
      for (const e of edges) {
        const a = nodes[e.a]; const b = nodes[e.b];
        const dx = b.x - a.x; const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const f = SPRING * (d - REST);
        const fx = (dx / d) * f; const fy = (dy / d) * f;
        if (!a.pinned) { a.vx += fx; a.vy += fy; }
        if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
      }
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n.pinned) {
          n.vx = clamp(n.vx * DAMP, -MAX_V, MAX_V);
          n.vy = clamp(n.vy * DAMP, -MAX_V, MAX_V);
          n.x += n.vx; n.y += n.vy;
          const pad = n.r + 2;
          if (n.x < pad) { n.x = pad; n.vx = Math.abs(n.vx) * 0.7; }
          if (n.x > W - pad) { n.x = W - pad; n.vx = -Math.abs(n.vx) * 0.7; }
          if (n.y < pad) { n.y = pad; n.vy = Math.abs(n.vy) * 0.7; }
          if (n.y > H - pad) { n.y = H - pad; n.vy = -Math.abs(n.vy) * 0.7; }
        }
        // comet trail for fast / dragged stars
        const spd = Math.hypot(n.vx, n.vy);
        if (spd > 3 || i === dragId) {
          trails[i].push({ x: n.x, y: n.y });
          if (trails[i].length > 12) trails[i].shift();
        } else if (trails[i].length) {
          trails[i].shift();
        }
      }

      // particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.vy += 0.02;
        p.life -= 0.016 / p.max;
        if (p.life <= 0) particles.splice(i, 1);
      }
      // shockwave rings
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.r += 5; r.life -= 0.03;
        if (r.life <= 0) rings.splice(i, 1);
      }
      // shooting stars
      if (Math.random() < 0.012 && shooting.length < 3) {
        const fromLeft = Math.random() < 0.5;
        shooting.push({
          x: fromLeft ? -20 : W + 20,
          y: Math.random() * H * 0.6,
          vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 4),
          vy: 2 + Math.random() * 2,
          life: 1,
        });
      }
      for (let i = shooting.length - 1; i >= 0; i--) {
        const s = shooting[i];
        s.x += s.vx; s.y += s.vy; s.life -= 0.012;
        if (s.life <= 0 || s.x < -40 || s.x > W + 40) shooting.splice(i, 1);
      }
      // drift nebula
      for (const nb of nebula) {
        nb.x += nb.dx; nb.y += nb.dy;
        if (nb.x < -nb.r) nb.x = W + nb.r;
        if (nb.x > W + nb.r) nb.x = -nb.r;
        if (nb.y < -nb.r) nb.y = H + nb.r;
        if (nb.y > H + nb.r) nb.y = -nb.r;
      }
      // wild Modrinth mods drifting past the background — catch them!
      if (Math.random() < 0.007 && wild.length < 3) spawnWild();
      for (let i = wild.length - 1; i >= 0; i--) {
        const w = wild[i];
        w.x += w.vx; w.y += w.vy;
        if (w.x < -60 || w.x > W + 60) wild.splice(i, 1);
      }
    };

    // ── Render ──────────────────────────────────────────────────────────
    let t = 0;
    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);

      const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      bg.addColorStop(0, "#15131a");
      bg.addColorStop(1, "#0a090d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // nebula clouds
      ctx.globalCompositeOperation = "lighter";
      for (const nb of nebula) {
        const g = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
        g.addColorStop(0, nb.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(nb.x, nb.y, nb.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // starfield twinkle
      for (const s of stars) {
        ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(t * 1.5 + s.x));
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // shooting stars
      ctx.globalCompositeOperation = "lighter";
      for (const s of shooting) {
        const tx = s.x - s.vx * 6; const ty = s.y - s.vy * 6;
        const g = ctx.createLinearGradient(s.x, s.y, tx, ty);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * s.life})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      // wild mods drifting in the back — dim, dashed "catchable" ring
      for (let i = 0; i < wild.length; i++) {
        const w = wild[i];
        const lit = i === wildHover;
        const r = w.r;
        const img = imagesRef.current.get(w.projectId);

        // faint motion streak
        ctx.globalCompositeOperation = "lighter";
        const tx = w.x - w.vx * 8; const ty = w.y - w.vy * 8;
        const sg = ctx.createLinearGradient(w.x, w.y, tx, ty);
        sg.addColorStop(0, `rgba(${RGB[w.kind]}, 0.25)`);
        sg.addColorStop(1, `rgba(${RGB[w.kind]}, 0)`);
        ctx.strokeStyle = sg;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";

        ctx.globalAlpha = lit ? 1 : 0.62;
        const x = w.x - r; const y = w.y - r; const size = r * 2;
        ctx.save();
        roundRect(ctx, x, y, size, size, 5);
        ctx.clip();
        if (img) {
          ctx.drawImage(img, x, y, size, size);
        } else {
          ctx.fillStyle = COLORS[w.kind].core;
          ctx.fillRect(x, y, size, size);
          ctx.fillStyle = "rgba(20,18,24,0.85)";
          ctx.font = `700 ${r}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText((w.title[0] || "?").toUpperCase(), w.x, w.y + 1);
        }
        ctx.restore();

        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = lit ? `rgba(${RGB[w.kind]}, 0.95)` : `rgba(${RGB[w.kind]}, 0.55)`;
        ctx.lineWidth = 1.4;
        roundRect(ctx, x - 2, y - 2, size + 4, size + 4, 6);
        ctx.stroke();
        ctx.setLineDash([]);

        if (lit) {
          const label = w.title.length > 24 ? `${w.title.slice(0, 23)}…` : w.title;
          ctx.font = "700 10px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const tw = Math.max(ctx.measureText(label).width, 50) + 16;
          const by = w.y + r + 6;
          ctx.fillStyle = "rgba(10,9,13,0.9)";
          roundRect(ctx, w.x - tw / 2, by, tw, 28, 4);
          ctx.fill();
          ctx.fillStyle = "#efeae0";
          ctx.fillText(label, w.x, by + 3);
          ctx.font = "700 8px Inter, sans-serif";
          ctx.fillStyle = `rgba(${RGB[w.kind]}, 0.95)`;
          ctx.fillText("ПОЙМАЙ МЕНЯ", w.x, by + 16);
        }
        ctx.globalAlpha = 1;
      }

      const focus = dragId >= 0 ? dragId : hoverId;

      // constellation lines + travelling energy pulse
      for (const e of edges) {
        const a = nodes[e.a]; const b = nodes[e.b];
        const lit = focus >= 0 && (e.a === focus || e.b === focus);

        ctx.strokeStyle = lit ? "rgba(245, 158, 11, 0.55)" : "rgba(255, 255, 255, 0.10)";
        ctx.lineWidth = lit ? 1.4 : 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // Flowing energy only on the focused constellation — keeps idle lines clean.
        if (lit) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
          ctx.lineWidth = 1.4;
          ctx.setLineDash([5, 10]);
          ctx.lineDashOffset = -t * 12;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      // comet trails
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < nodes.length; i++) {
        const tr = trails[i];
        if (tr.length < 2) continue;
        const col = COLORS[nodes[i].kind].core;
        for (let k = 1; k < tr.length; k++) {
          ctx.globalAlpha = (k / tr.length) * 0.5;
          ctx.strokeStyle = col;
          ctx.lineWidth = (k / tr.length) * nodes[i].r * 0.8;
          ctx.beginPath();
          ctx.moveTo(tr[k - 1].x, tr[k - 1].y);
          ctx.lineTo(tr[k].x, tr[k].y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const col = COLORS[n.kind];
        const dim = focus >= 0 && focus !== i && !isAdj(i, focus);
        const r = n.r;
        const spd = Math.hypot(n.vx, n.vy);
        const hot = Math.min(1, spd / 16);
        ctx.globalAlpha = dim ? 0.4 : 1;

        // velocity-reactive glow
        const halo = r * (2.4 + hot * 1.8);
        const g = ctx.createRadialGradient(n.x, n.y, r * 0.4, n.x, n.y, halo);
        g.addColorStop(0, col.glow);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, halo, 0, Math.PI * 2);
        ctx.fill();

        const img = n.iconKey ? imagesRef.current.get(n.iconKey) : undefined;
        const x = n.x - r; const y = n.y - r; const size = r * 2;

        ctx.save();
        roundRect(ctx, x, y, size, size, 6);
        ctx.clip();
        if (img) {
          ctx.drawImage(img, x, y, size, size);
        } else {
          ctx.fillStyle = col.core;
          ctx.fillRect(x, y, size, size);
          ctx.fillStyle = "rgba(20,18,24,0.85)";
          ctx.font = `700 ${r}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText((n.label[0] || "?").toUpperCase(), n.x, n.y + 1);
        }
        ctx.restore();

        ctx.strokeStyle = i === focus ? `rgba(${RGB[n.kind]}, 0.95)` : "rgba(255,255,255,0.35)";
        ctx.lineWidth = i === focus ? 2 : 1;
        roundRect(ctx, x, y, size, size, 6);
        ctx.stroke();

        // Install-status badge for caught mods.
        if (n.status) {
          const bx = n.x + r - 2;
          const byb = n.y - r + 2;
          const c = n.status === "ok" ? "#34d399" : n.status === "fail" ? "#ef4444" : "#fbbf24";
          const pr = n.status === "installing" ? 3.2 + Math.sin(t * 6) : 3.4;
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(bx, byb, pr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(10,9,13,0.7)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        if (i === focus && !dim) {
          ctx.globalAlpha = 1;
          const label = n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label;
          ctx.font = "700 11px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const tw = Math.max(ctx.measureText(label).width, 60) + 16;
          const by = n.y + r + 6;
          ctx.fillStyle = "rgba(10,9,13,0.85)";
          roundRect(ctx, n.x - tw / 2, by, tw, 30, 4);
          ctx.fill();
          ctx.fillStyle = "#efeae0";
          ctx.fillText(label, n.x, by + 4);
          ctx.font = "600 9px Inter, sans-serif";
          ctx.fillStyle = "rgba(245,158,11,0.85)";
          ctx.fillText(n.author.toUpperCase().slice(0, 28), n.x, by + 17);
        }
        ctx.globalAlpha = 1;
      }

      // shockwave rings
      ctx.globalCompositeOperation = "lighter";
      for (const r of rings) {
        ctx.globalAlpha = Math.max(0, r.life);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // particles
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // trash drop-zone — only while dragging a star
      if (dragId >= 0) {
        const tr = trashRect();
        const active = overTrash;

        ctx.globalAlpha = active ? 1 : 0.85;
        ctx.fillStyle = active ? "rgba(239,68,68,0.20)" : "rgba(20,18,24,0.78)";
        roundRect(ctx, tr.x, tr.y, tr.w, tr.h, 10);
        ctx.fill();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = active ? "rgba(239,68,68,0.95)" : "rgba(255,255,255,0.40)";
        ctx.lineWidth = active ? 1.8 : 1.2;
        roundRect(ctx, tr.x, tr.y, tr.w, tr.h, 10);
        ctx.stroke();
        ctx.setLineDash([]);

        const col = active ? "#ef4444" : "rgba(255,255,255,0.82)";
        const label = active ? "ОТПУСТИ" : "УДАЛИТЬ";
        const cy = tr.y + tr.h / 2;
        const iconScale = active ? 1.35 : 1.2;
        const iconW = 14 * iconScale;
        const gap = 10;
        ctx.font = "700 11px Inter, sans-serif";
        const textW = ctx.measureText(label).width;
        const groupW = iconW + gap + textW;
        const startX = tr.x + (tr.w - groupW) / 2;

        // trash glyph (14×14 viewBox centred on its slot)
        ctx.save();
        ctx.translate(startX + iconW / 2, cy);
        ctx.scale(iconScale, iconScale);
        ctx.translate(-7, -7);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2 / iconScale;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(trashPath);
        ctx.restore();

        ctx.fillStyle = col;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, startX + iconW + gap, cy);
        ctx.globalAlpha = 1;
      }
    };

    let raf = 0;
    const loop = () => { step(); draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("dblclick", onDbl);
    };
  }, [graph, loading]);

  if (loading) return <p className="stats-empty">Загрузка...</p>;
  if (graph.nodes.length === 0) {
    return (
      <div className="stats-coming-soon">
        <span className="stats-coming-label">СОЗВЕЗДИЕ МОДОВ</span>
        <p className="stats-coming-text">В этой сборке пока нет контента — установи моды, чтобы зажечь звёзды.</p>
      </div>
    );
  }

  return (
    <div className="constellation-root">
      <div className="constellation-legend">
        <span><i style={{ background: COLORS.mod.core }} /> МОД</span>
        <span><i style={{ background: COLORS.shader.core }} /> ШЕЙДЕР</span>
        <span><i style={{ background: COLORS.pack.core }} /> РЕС. ПАК</span>
        <span className="constellation-legend-note">— линии связывают звёзды одного автора</span>
      </div>
      <div className="constellation-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} />
      </div>
      <span className="constellation-hint">Хватай и кидай звёзды · лови залётные моды · тащи в корзину чтобы удалить 🗑 · двойной клик — сверхновая ⚡</span>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function caughtKey(instanceId: string): string {
  return `constellation:caught:${instanceId}`;
}
function loadCaughtIds(instanceId: string): Set<string> {
  try {
    const raw = localStorage.getItem(caughtKey(instanceId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function addCaughtId(instanceId: string, projectId: string) {
  try {
    const s = loadCaughtIds(instanceId);
    s.add(projectId);
    localStorage.setItem(caughtKey(instanceId), JSON.stringify([...s]));
  } catch { /* noop */ }
}
function removeCaughtId(instanceId: string, projectId: string) {
  try {
    const s = loadCaughtIds(instanceId);
    s.delete(projectId);
    localStorage.setItem(caughtKey(instanceId), JSON.stringify([...s]));
  } catch { /* noop */ }
}
