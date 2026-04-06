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
interface DayCell {
  date: Date;
  weekIdx: number;   // column
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  isLastPlayed: boolean;
  isCreated: boolean;
  isFuture: boolean;
  label: string;
}

const DAY_LABELS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

function HeatmapTab({ instance }: { instance: InstanceItem }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);

  const createdTs    = parseInt(instance.createdAt,  10);
  const lastPlayedTs = parseInt(instance.lastPlayed,  10);
  const totalHrs     = instance.playtimeSecs / 3600;

  const daysSinceCreation = !isNaN(createdTs) && createdTs > 0
    ? Math.max(1, Math.floor((Date.now() / 1000 - createdTs) / 86400))
    : null;
  const weeksSinceCreation = daysSinceCreation
    ? Math.max(1, Math.floor(daysSinceCreation / 7))
    : null;

  // One cell per day, from creation Monday → today + 52 weeks
  const days = useMemo<DayCell[]>(() => {
    const now = new Date(); now.setHours(23, 59, 59, 0);

    const createdDate = !isNaN(createdTs) && createdTs > 0
      ? new Date(createdTs * 1000) : new Date();

    // Align start to Monday of creation week
    const start = new Date(createdDate);
    start.setHours(0, 0, 0, 0);
    const dow0 = start.getDay();
    start.setDate(start.getDate() - (dow0 === 0 ? 6 : dow0 - 1));

    // End = today + 52 weeks
    const end = new Date(now);
    end.setDate(end.getDate() + 52 * 7);

    const lpDate = !isNaN(lastPlayedTs) && lastPlayedTs > 0
      ? new Date(lastPlayedTs * 1000) : null;
    const lpStr      = lpDate ? lpDate.toDateString() : "";
    const createdStr = createdDate.toDateString();

    const result: DayCell[] = [];
    const cur = new Date(start);
    let idx = 0;

    while (cur <= end) {
      const weekIdx   = Math.floor(idx / 7);
      const dayOfWeek = idx % 7; // 0 = Mon (start is always Monday)
      const curStr    = cur.toDateString();

      result.push({
        date:         new Date(cur),
        weekIdx,
        dayOfWeek,
        isLastPlayed: curStr === lpStr,
        isCreated:    curStr === createdStr,
        isFuture:     cur > now,
        label: cur.toLocaleDateString("ru-RU", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        }),
      });

      cur.setDate(cur.getDate() + 1);
      idx++;
    }
    return result;
  }, [instance]);

  const numWeeks = days.length > 0 ? days[days.length - 1].weekIdx + 1 : 0;
  const hasData  = lastPlayedTs > 0 && totalHrs > 0;

  // Layout constants (viewBox units)
  const PAD_L   = 22;   // room for day labels
  const PAD_R   = 6;
  const PAD_T   = 6;
  const PAD_B   = 22;
  const ROW_H   = 13;
  const ROW_GAP = 3;
  const SLOT    = 11;   // week column width
  const BAR_W   = 6;
  const HALF    = (ROW_H - 2) / 2; // 5.5 — half-height of a full bar

  const SVG_W = PAD_L + numWeeks * SLOT + PAD_R;
  const SVG_H = PAD_T + 7 * ROW_H + 6 * ROW_GAP + PAD_B;

  function rowCY(dow: number): number {
    return PAD_T + dow * (ROW_H + ROW_GAP) + ROW_H / 2;
  }

  // Month label per first week of each month
  const monthLabels: { x: number; text: string }[] = [];
  let prevMonth = -1;
  for (let w = 0; w < numWeeks; w++) {
    const monday = days.find(d => d.weekIdx === w && d.dayOfWeek === 0);
    if (monday) {
      const m = monday.date.getMonth();
      if (m !== prevMonth) {
        monthLabels.push({
          x:    PAD_L + w * SLOT,
          text: monday.date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
        });
        prevMonth = m;
      }
    }
  }

  const lpCell = days.find(d => d.isLastPlayed);
  const lastPlayedDate = !isNaN(lastPlayedTs) && lastPlayedTs > 0
    ? new Date(lastPlayedTs * 1000) : null;

  return (
    <div className="spectrum-root">
      <span className="spectrum-label">АКТИВНОСТЬ · ИСТОРИЯ СБОРКИ</span>

      <svg
        className="spectrum-svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        style={{ height: SVG_H }}
      >
        <defs>
          <linearGradient id="sp-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#c2410c" stopOpacity="0.1"/>
            <stop offset="35%"  stopColor="#c2410c" stopOpacity="0.9"/>
            <stop offset="50%"  stopColor="#c2410c" stopOpacity="1"/>
            <stop offset="65%"  stopColor="#c2410c" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#c2410c" stopOpacity="0.1"/>
          </linearGradient>
          <linearGradient id="sp-zero" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#1a1a1a" stopOpacity="0"/>
            <stop offset="50%"  stopColor="#1a1a1a" stopOpacity="0.09"/>
            <stop offset="100%" stopColor="#1a1a1a" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="sp-future" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#1a1a1a" stopOpacity="0"/>
            <stop offset="50%"  stopColor="#1a1a1a" stopOpacity="0.03"/>
            <stop offset="100%" stopColor="#1a1a1a" stopOpacity="0"/>
          </linearGradient>
          <filter id="sp-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <linearGradient id="sp-scan-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#c2410c" stopOpacity="0"/>
            <stop offset="50%"  stopColor="#c2410c" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#c2410c" stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* Day-of-week labels */}
        {DAY_LABELS.map((lbl, d) => (
          <text
            key={`dl-${d}`}
            x={PAD_L - 4}
            y={rowCY(d) + 3.5}
            fontSize="7.5"
            fontWeight="600"
            fontFamily="Inter, sans-serif"
            fill="rgba(122,122,122,0.6)"
            textAnchor="end"
          >{lbl}</text>
        ))}

        {/* Horizontal separators between rows */}
        {[1,2,3,4,5,6].map(d => (
          <line
            key={`sep-${d}`}
            x1={PAD_L - 16}
            y1={PAD_T + d * (ROW_H + ROW_GAP) - ROW_GAP / 2}
            x2={PAD_L + numWeeks * SLOT}
            y2={PAD_T + d * (ROW_H + ROW_GAP) - ROW_GAP / 2}
            stroke="rgba(26,26,26,0.06)"
            strokeWidth="1"
          />
        ))}

        {/* Day cells */}
        {days.map((cell, i) => {
          const x  = PAD_L + cell.weekIdx * SLOT;
          const cy = rowCY(cell.dayOfWeek);

          // Creation day → colored stripe
          if (cell.isCreated && !cell.isLastPlayed) {
            const rowTop = PAD_T + cell.dayOfWeek * (ROW_H + ROW_GAP);
            return (
              <g
                key={i}
                onMouseEnter={(e) => setTip({ x: e.clientX + 12, y: e.clientY - 8, text: cell.label, sub: "создана" })}
                onMouseMove={(e) => setTip(t => t ? { ...t, x: e.clientX + 12, y: e.clientY - 8 } : null)}
                onMouseLeave={() => setTip(null)}
                style={{ cursor: "default" }}
              >
                <rect x={x} y={rowTop + 1} width={BAR_W} height={ROW_H - 2} rx="1" fill="#c2410c" opacity="0.1" />
                <rect x={x + (BAR_W - 1.5) / 2} y={rowTop + 1} width={1.5} height={ROW_H - 2} fill="#c2410c" opacity="0.55" />
              </g>
            );
          }

          const hh   = cell.isLastPlayed ? HALF : 1.5;
          const fill = cell.isLastPlayed
            ? "url(#sp-grad)"
            : cell.isFuture ? "url(#sp-future)" : "url(#sp-zero)";

          return (
            <rect
              key={i}
              x={x}
              y={cy - hh}
              width={BAR_W}
              height={hh * 2}
              rx="1"
              fill={fill}
              filter={cell.isLastPlayed ? "url(#sp-glow)" : undefined}
              style={{ cursor: "default" }}
              onMouseEnter={(e) => {
                const sub = cell.isLastPlayed
                  ? `${totalHrs.toFixed(1)} ч наиграно`
                  : cell.isFuture ? "будущее" : "нет данных";
                setTip({ x: e.clientX + 12, y: e.clientY - 8, text: cell.label, sub });
              }}
              onMouseMove={(e) => setTip(t => t ? { ...t, x: e.clientX + 12, y: e.clientY - 8 } : null)}
              onMouseLeave={() => setTip(null)}
            />
          );
        })}

        {/* Glow + peak dot on last-played day */}
        {hasData && lpCell && (() => {
          const cx = PAD_L + lpCell.weekIdx * SLOT + BAR_W / 2;
          const cy = rowCY(lpCell.dayOfWeek) - HALF;
          return (
            <g>
              <circle cx={cx} cy={cy} r="6"   fill="#c2410c" opacity="0.18" className="spectrum-halo"/>
              <circle cx={cx} cy={cy} r="2.5" fill="#c2410c"/>
              <circle cx={cx} cy={cy} r="1.2" fill="#fff" opacity="0.8"/>
            </g>
          );
        })()}

        {/* Flatline scan when no playtime — runs through Thursday row */}
        {!hasData && (
          <rect
            x={0} y={rowCY(3) - 1} width={SVG_W * 0.35} height={2}
            fill="url(#sp-scan-grad)"
            className="spectrum-scan"
          />
        )}

        {/* Month labels */}
        {monthLabels.map((ml, i) => (
          <text
            key={i}
            x={ml.x}
            y={SVG_H - 5}
            fontSize="8"
            fontWeight="700"
            fontFamily="Inter, sans-serif"
            fill="rgba(122,122,122,0.75)"
            textAnchor="start"
          >{ml.text}</text>
        ))}
      </svg>

      {tip && (
        <div className="spectrum-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
          {tip.sub && <span className="spectrum-tip-sub">{tip.sub}</span>}
        </div>
      )}

      <div className="spectrum-stats">
        <div className="spectrum-stat">
          <span className="spectrum-stat-val">{totalHrs.toFixed(1)} ч</span>
          <span className="spectrum-stat-label">ВСЕГО</span>
        </div>
        {totalHrs > 0 && weeksSinceCreation && (
          <div className="spectrum-stat">
            <span className="spectrum-stat-val">{(totalHrs / weeksSinceCreation).toFixed(1)} ч</span>
            <span className="spectrum-stat-label">В НЕДЕЛЮ</span>
          </div>
        )}
        {totalHrs > 0 && daysSinceCreation && (
          <div className="spectrum-stat">
            <span className="spectrum-stat-val">{(totalHrs / daysSinceCreation).toFixed(2)} ч</span>
            <span className="spectrum-stat-label">В ДЕНЬ</span>
          </div>
        )}
        {lastPlayedDate && (
          <div className="spectrum-stat">
            <span className="spectrum-stat-val">{fmtDateShort(lastPlayedDate)}</span>
            <span className="spectrum-stat-label">ПОСЛЕДНИЙ СЕАНС</span>
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
