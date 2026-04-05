import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstanceItem, InstalledModView } from "../../types";

type StatsTab = "timeline" | "heatmap" | "constellation";
type TLDir = "v" | "h";
type EventKind = "created" | "mod" | "pack" | "shader" | "launched";

interface TLEvent {
  kind: EventKind;
  ts: number;
  title: string;
  detail: string[];
}

interface Props {
  instance: InstanceItem;
  onClose: () => void;
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}


const KIND_TAG: Record<EventKind, string> = {
  created:  "СОЗДАНА",
  mod:      "МОД",
  pack:     "РЕС. ПАК",
  shader:   "ШЕЙДЕР",
  launched: "ЗАПУСК",
};

const KIND_SHORT: Record<EventKind, string> = {
  created:  "✦",
  mod:      "М",
  pack:     "П",
  shader:   "Ш",
  launched: "▶",
};

function IconVertical() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="3" y="1" width="1" height="12" rx="0.5" fill="currentColor" opacity="0.35"/>
      <circle cx="7.5" cy="2.5"  r="1.8" fill="currentColor"/>
      <circle cx="7.5" cy="7"    r="1.8" fill="currentColor"/>
      <circle cx="7.5" cy="11.5" r="1.8" fill="currentColor"/>
    </svg>
  );
}

function IconHorizontal() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="6.5" width="12" height="1" rx="0.5" fill="currentColor" opacity="0.35"/>
      <rect x="0.5"  y="4.5" width="3" height="3" rx="0.5" fill="currentColor"/>
      <rect x="5.5"  y="4.5" width="3" height="3" rx="0.5" fill="currentColor"/>
      <rect x="10.5" y="4.5" width="3" height="3" rx="0.5" fill="currentColor"/>
    </svg>
  );
}

// ─── Playtime Spectrum ──────────────────────────────────────────────────────
interface WeekBar {
  start: Date;
  hours: number;
  isLastPlayed: boolean;
  label: string; // tooltip
}

function HeatmapTab({ instance }: { instance: InstanceItem }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);

  const createdTs    = parseInt(instance.createdAt,  10);
  const lastPlayedTs = parseInt(instance.lastPlayed,  10);
  const totalHrs     = instance.playtimeSecs / 3600;

  // Build 52 weekly bars
  const bars = useMemo<WeekBar[]>(() => {
    const today = new Date(); today.setHours(23, 59, 59, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 52 * 7 + 1);
    // align to Monday
    const dow = start.getDay();
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));

    const lpDate = !isNaN(lastPlayedTs) && lastPlayedTs > 0
      ? new Date(lastPlayedTs * 1000) : null;

    const result: WeekBar[] = [];
    const cur = new Date(start);

    while (cur <= today) {
      const wStart = new Date(cur);
      const wEnd   = new Date(cur); wEnd.setDate(wEnd.getDate() + 6);
      const isLP   = lpDate ? lpDate >= wStart && lpDate <= wEnd : false;
      const month  = wStart.toLocaleDateString("ru-RU", { month: "long" });
      const y1     = wStart.toLocaleDateString("ru-RU", { day: "numeric" });
      const y2     = wEnd.toLocaleDateString("ru-RU",   { day: "numeric", year: "numeric" });

      result.push({
        start: new Date(wStart),
        hours: isLP ? totalHrs : 0,
        isLastPlayed: isLP,
        label: `${y1} – ${y2} ${month}`,
      });
      cur.setDate(cur.getDate() + 7);
    }
    return result;
  }, [instance]);

  const hasData    = lastPlayedTs > 0 && totalHrs > 0;
  const maxHours   = Math.max(...bars.map(b => b.hours), 0.01);

  // SVG layout constants
  const N       = bars.length;
  const BAR_W   = 7;
  const SLOT    = 11;          // bar + gap
  const PAD_L   = 6;
  const PAD_R   = 6;
  const PAD_T   = 10;
  const PAD_B   = 28;          // room for month labels
  const HALF_H  = 70;          // max half-height of a bar
  const SVG_W   = N * SLOT + PAD_L + PAD_R;
  const SVG_H   = PAD_T + HALF_H * 2 + PAD_B;
  const CY      = PAD_T + HALF_H; // vertical center (baseline)

  // Month label positions
  const monthLabels: { x: number; text: string }[] = [];
  bars.forEach((b, i) => {
    const isNew = i === 0 || bars[i - 1].start.getMonth() !== b.start.getMonth();
    if (isNew) {
      monthLabels.push({
        x: PAD_L + i * SLOT,
        text: b.start.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
      });
    }
  });

  function barHalf(hours: number): number {
    if (hours <= 0) return 1.5;
    return Math.max(4, (hours / maxHours) * HALF_H);
  }

  const lpBar = bars.find(b => b.isLastPlayed);
  const lpIdx = bars.findIndex(b => b.isLastPlayed);

  const createdDate = !isNaN(createdTs) && createdTs > 0
    ? new Date(createdTs * 1000) : null;
  const lastPlayedDate = !isNaN(lastPlayedTs) && lastPlayedTs > 0
    ? new Date(lastPlayedTs * 1000) : null;

  return (
    <div className="spectrum-root">
      <span className="spectrum-label">АКТИВНОСТЬ · ПОСЛЕДНИЕ 52 НЕДЕЛИ</span>

      {/* SVG waveform */}
      <svg
        className="spectrum-svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        style={{ height: SVG_H }}
      >
        <defs>
          {/* Accent gradient: transparent → orange → transparent (symmetric) */}
          <linearGradient id="sp-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#c2410c" stopOpacity="0"/>
            <stop offset="40%"  stopColor="#c2410c" stopOpacity="0.85"/>
            <stop offset="50%"  stopColor="#c2410c" stopOpacity="1"/>
            <stop offset="60%"  stopColor="#c2410c" stopOpacity="0.85"/>
            <stop offset="100%" stopColor="#c2410c" stopOpacity="0"/>
          </linearGradient>

          {/* Faint gradient for zero bars */}
          <linearGradient id="sp-zero" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#1a1a1a" stopOpacity="0"/>
            <stop offset="50%"  stopColor="#1a1a1a" stopOpacity="0.08"/>
            <stop offset="100%" stopColor="#1a1a1a" stopOpacity="0"/>
          </linearGradient>

          {/* Soft glow filter for the active bar */}
          <filter id="sp-glow" x="-60%" y="-40%" width="220%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Scan gradient for flatline (no data) */}
          <linearGradient id="sp-scan-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#c2410c" stopOpacity="0"/>
            <stop offset="50%"  stopColor="#c2410c" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="#c2410c" stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* Baseline */}
        <line
          x1={PAD_L} y1={CY} x2={PAD_L + N * SLOT} y2={CY}
          stroke="rgba(26,26,26,0.1)" strokeWidth="1"
        />

        {/* All bars */}
        {bars.map((b, i) => {
          const x   = PAD_L + i * SLOT;
          const hh  = barHalf(b.hours);
          const isZ = b.hours <= 0;
          return (
            <rect
              key={i}
              x={x}
              y={CY - hh}
              width={BAR_W}
              height={hh * 2}
              rx="1.5"
              fill={isZ ? "url(#sp-zero)" : "url(#sp-grad)"}
              filter={b.isLastPlayed ? "url(#sp-glow)" : undefined}
              style={{ cursor: "default" }}
              onMouseEnter={(e) => {
                const hrs = b.hours > 0 ? `${b.hours.toFixed(1)} ч наиграно` : "нет данных";
                setTip({ x: e.clientX + 12, y: e.clientY - 8, text: b.label, sub: hrs });
              }}
              onMouseMove={(e) => {
                setTip(t => t ? { ...t, x: e.clientX + 12, y: e.clientY - 8 } : null);
              }}
              onMouseLeave={() => setTip(null)}
            />
          );
        })}

        {/* Glowing halo + peak dot on the last-played bar */}
        {hasData && lpIdx >= 0 && lpBar && (() => {
          const cx = PAD_L + lpIdx * SLOT + BAR_W / 2;
          const cy = CY - barHalf(lpBar.hours);
          return (
            <g>
              <circle cx={cx} cy={cy} r="8"  fill="#c2410c" opacity="0.18" className="spectrum-halo"/>
              <circle cx={cx} cy={cy} r="3"  fill="#c2410c"/>
              <circle cx={cx} cy={cy} r="1.5" fill="#fff" opacity="0.8"/>
            </g>
          );
        })()}

        {/* Flatline scan animation when no playtime */}
        {!hasData && (
          <rect
            x={0} y={CY - 1} width={SVG_W * 0.35} height={2}
            fill="url(#sp-scan-grad)"
            className="spectrum-scan"
          />
        )}

        {/* Month labels */}
        {monthLabels.map((ml, i) => (
          <text
            key={i}
            x={ml.x}
            y={SVG_H - 6}
            fontSize="8"
            fontWeight="700"
            fontFamily="Inter, sans-serif"
            fill="rgba(122,122,122,0.75)"
            textAnchor="start"
          >
            {ml.text}
          </text>
        ))}
      </svg>

      {/* Fixed tooltip */}
      {tip && (
        <div className="spectrum-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
          <span className="spectrum-tip-sub">{tip.sub}</span>
        </div>
      )}

      {/* Stats row */}
      <div className="spectrum-stats">
        <div className="spectrum-stat">
          <span className="spectrum-stat-val">{totalHrs.toFixed(1)} ч</span>
          <span className="spectrum-stat-label">ВСЕГО</span>
        </div>
        {lastPlayedDate && (
          <div className="spectrum-stat">
            <span className="spectrum-stat-val">{fmtDateShort(lastPlayedDate)}</span>
            <span className="spectrum-stat-label">ПОСЛЕДНИЙ СЕАНС</span>
          </div>
        )}
        {createdDate && (
          <div className="spectrum-stat">
            <span className="spectrum-stat-val">{fmtDateShort(createdDate)}</span>
            <span className="spectrum-stat-label">СОЗДАНА</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main modal ─────────────────────────────────────────────────────────────
export function BuildStatsModal({ instance, onClose }: Props) {
  const [tab, setTab]         = useState<StatsTab>("timeline");
  const [dir, setDir]         = useState<TLDir>("v");
  const [mods, setMods]       = useState<InstalledModView[]>([]);
  const [packs, setPacks]     = useState<InstalledModView[]>([]);
  const [shaders, setShaders] = useState<InstalledModView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      invoke<InstalledModView[]>("list_installed_mods",          { instanceId: instance.id }).catch(() => [] as InstalledModView[]),
      invoke<InstalledModView[]>("list_installed_resourcepacks", { instanceId: instance.id }).catch(() => [] as InstalledModView[]),
      invoke<InstalledModView[]>("list_installed_shaders",       { instanceId: instance.id }).catch(() => [] as InstalledModView[]),
    ]).then(([m, p, s]) => {
      if (!alive) return;
      setMods(m); setPacks(p); setShaders(s);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [instance.id]);

  const events = useMemo<TLEvent[]>(() => {
    const list: TLEvent[] = [];

    const createdTs = parseInt(instance.createdAt, 10);
    if (!isNaN(createdTs) && createdTs > 0) {
      const loaderLabel =
        instance.loader === "Vanilla"
          ? "Vanilla"
          : `${instance.loader}${instance.fabricLoaderVersion ? ` ${instance.fabricLoaderVersion}` : ""}`;
      list.push({
        kind: "created", ts: createdTs, title: instance.name,
        detail: [`${instance.version} · ${loaderLabel}`, `RAM: ${instance.ram} GB`],
      });
    }

    for (const m of mods) {
      const ts = parseInt(m.installedAt ?? "0", 10);
      if (ts > 0) list.push({
        kind: "mod", ts, title: m.title,
        detail: [m.author ? `Автор: ${m.author}` : "", m.versionNumber ? `Версия: ${m.versionNumber}` : ""].filter(Boolean),
      });
    }
    for (const p of packs) {
      const ts = parseInt(p.installedAt ?? "0", 10);
      if (ts > 0) list.push({
        kind: "pack", ts, title: p.title,
        detail: [p.author ? `Автор: ${p.author}` : "", p.versionNumber ? `Версия: ${p.versionNumber}` : ""].filter(Boolean),
      });
    }
    for (const s of shaders) {
      const ts = parseInt(s.installedAt ?? "0", 10);
      if (ts > 0) list.push({
        kind: "shader", ts, title: s.title,
        detail: [s.author ? `Автор: ${s.author}` : "", s.versionNumber ? `Версия: ${s.versionNumber}` : ""].filter(Boolean),
      });
    }

    const lpTs = parseInt(instance.lastPlayed, 10);
    if (!isNaN(lpTs) && lpTs > 0) {
      const hrs = (instance.playtimeSecs / 3600).toFixed(1);
      list.push({
        kind: "launched", ts: lpTs, title: "Последний запуск",
        detail: instance.playtimeSecs > 0 ? [`Наиграно суммарно: ${hrs} ч`] : [],
      });
    }

    return list.sort((a, b) => a.ts - b.ts);
  }, [instance, mods, packs, shaders]);

  const n = events.length;
  function getLeft(i: number): number {
    if (n <= 1) return 50;
    return 3 + (i / (n - 1)) * 94; // 3% … 97%
  }

  const TAB_LABELS: Record<StatsTab, string> = {
    timeline: "ХРОНОЛОГИЯ", heatmap: "ТЕПЛОВАЯ КАРТА", constellation: "СОЗВЕЗДИЕ",
  };

  const timelineContent =
    loading ? <p className="stats-empty">Загрузка...</p>
    : events.length === 0 ? <p className="stats-empty">Нет данных</p>
    : dir === "v" ? (
      /* ── Vertical ── */
      <div className="tl-root">
        {events.map((evt, i) => (
          <div key={i} className={`tl-row tl-row--${evt.kind}`}>
            <div className="tl-spine-col">
              <div className="tl-dot-wrap"><div className="tl-dot" /></div>
              {i < n - 1 && <div className="tl-seg" />}
            </div>
            <div className="tl-body">
              <div className="tl-header">
                <span className={`tl-tag tl-tag--${evt.kind}`}>{KIND_TAG[evt.kind]}</span>
                <span className="tl-title">{evt.title}</span>
                <span className="tl-date">{fmtDate(evt.ts)}</span>
              </div>
              {evt.detail.length > 0 && (
                <div className="tl-reveal">
                  {evt.detail.map((line, j) => <span key={j} className="tl-reveal-line">{line}</span>)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    ) : (
      /* ── Horizontal fixed ── */
      <div className="tl-h-root">
        <div className="tl-h-track" />
        {events.map((evt, i) => {
          const left = getLeft(i);
          const flip = left > 68; // flip tooltip for right-side marks
          return (
            <div
              key={i}
              className={`tl-h-mark tl-h-mark--${evt.kind}`}
              style={{ left: `${left}%` }}
            >
              <span className="tl-h-date">{fmtDate(evt.ts)}</span>
              <div className="tl-h-square" />
              <span className="tl-h-short">{KIND_SHORT[evt.kind]}</span>
              <div className={`tl-h-hover-info${flip ? " tl-h-hover-info--flip" : ""}`}>
                <span className={`tl-tag tl-tag--${evt.kind}`}>{KIND_TAG[evt.kind]}</span>
                <span className="tl-h-title">{evt.title}</span>
              </div>
            </div>
          );
        })}
      </div>
    );

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-icon" type="button" onClick={onClose}>✕</button>

        <div className="stats-modal-head">
          <span className="confirm-label">STATS</span>
          <h2 className="stats-modal-name">{instance.name}</h2>
        </div>

        <div className="stats-tab-bar">
          {(["timeline", "heatmap", "constellation"] as StatsTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`stats-tab-btn${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}

          {tab === "timeline" && (
            <div className="tl-dir-switcher">
              <button type="button" className={`tl-dir-btn${dir === "v" ? " active" : ""}`} title="Вертикально" onClick={() => setDir("v")}>
                <IconVertical />
              </button>
              <button type="button" className={`tl-dir-btn${dir === "h" ? " active" : ""}`} title="Горизонтально" onClick={() => setDir("h")}>
                <IconHorizontal />
              </button>
            </div>
          )}
        </div>

        <div className="stats-tab-body">
          {tab === "timeline"      && timelineContent}
          {tab === "heatmap"       && <HeatmapTab instance={instance} />}
          {tab === "constellation" && (
            <div className="stats-coming-soon">
              <span className="stats-coming-label">СОЗВЕЗДИЕ МОДОВ</span>
              <p className="stats-coming-text">Здесь будет граф зависимостей установленных модов</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
