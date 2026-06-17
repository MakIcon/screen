import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstanceItem, InstalledModView, PlaytimeSession } from "../../types";
import { BuildConstellation } from "./BuildConstellation";

/** Short Russian playtime label, e.g. "2 ч 15 мин", "45 мин", "30 сек". */
function fmtDuration(secs: number): string {
  if (secs <= 0) return "0 мин";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
  if (m > 0) return `${m} мин`;
  return `${secs} сек`;
}

type StatsTab = "timeline" | "heatmap" | "constellation";
type TLDir = "v" | "h";
type EventKind = "created" | "mod" | "pack" | "shader" | "launched";

interface TLEvent {
  kind: EventKind;
  ts: number;
  title: string;
  detail: string[];
  iconUrl?: string | null;
  author?: string | null;
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
type CellState = "pre" | "created" | "active" | "idle" | "lastPlayed" | "future";

interface DayCell {
  date: Date;
  weekIdx: number;   // column
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  state: CellState;
  intensity: number; // 0..1 — warmth within the active band
  playSecs: number;  // real recorded playtime for this day (0 if none)
  label: string;
}

const DAY_LABELS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

function HeatmapTab({ instance }: { instance: InstanceItem }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);
  const [sessions, setSessions] = useState<PlaytimeSession[]>([]);

  const createdTs    = parseInt(instance.createdAt,  10);
  const lastPlayedTs = parseInt(instance.lastPlayed,  10);
  const totalHrs     = instance.playtimeSecs / 3600;

  const daysSinceCreation = !isNaN(createdTs) && createdTs > 0
    ? Math.max(1, Math.floor((Date.now() / 1000 - createdTs) / 86400))
    : null;
  const weeksSinceCreation = daysSinceCreation
    ? Math.max(1, Math.floor(daysSinceCreation / 7))
    : null;

  useEffect(() => {
    let alive = true;
    invoke<PlaytimeSession[]>("get_playtime_sessions", { instanceId: instance.id })
      .then((res) => { if (alive) setSessions(res ?? []); })
      .catch(() => { if (alive) setSessions([]); });
    return () => { alive = false; };
  }, [instance.id]);

  // Bucket recorded sessions into local-day totals (key = Date.toDateString()).
  const dayPlay = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (!s || s.ts <= 0 || s.secs <= 0) continue;
      const key = new Date(s.ts * 1000).toDateString();
      map.set(key, (map.get(key) ?? 0) + s.secs);
    }
    return map;
  }, [sessions]);

  const maxDaySecs = useMemo(() => {
    let m = 0;
    for (const v of dayPlay.values()) if (v > m) m = v;
    return m;
  }, [dayPlay]);

  // One cell per day, from creation Monday → end of current week (no empty
  // year-long tail). Cell warmth is driven by real recorded playtime when we
  // have it, falling back to the active-band ramp for legacy builds.
  const days = useMemo<DayCell[]>(() => {
    const now = new Date(); now.setHours(23, 59, 59, 0);

    const createdDate = !isNaN(createdTs) && createdTs > 0
      ? new Date(createdTs * 1000) : new Date();
    createdDate.setHours(0, 0, 0, 0);

    // Align start to Monday of creation week
    const start = new Date(createdDate);
    const dow0 = start.getDay();
    start.setDate(start.getDate() - (dow0 === 0 ? 6 : dow0 - 1));

    // End = Sunday of the current week (keeps the grid compact & rectangular)
    const end = new Date(now);
    const dowE = end.getDay();
    end.setDate(end.getDate() + (dowE === 0 ? 0 : 7 - dowE));
    end.setHours(23, 59, 59, 0);

    const lpDate = !isNaN(lastPlayedTs) && lastPlayedTs > 0
      ? new Date(lastPlayedTs * 1000) : null;
    if (lpDate) lpDate.setHours(0, 0, 0, 0);
    const lpStr      = lpDate ? lpDate.toDateString() : "";
    const createdStr = createdDate.toDateString();

    const createdT = createdDate.getTime();
    const lpT      = lpDate ? lpDate.getTime() : createdT;
    const span     = Math.max(1, lpT - createdT);
    const haveDayData = maxDaySecs > 0;

    const result: DayCell[] = [];
    const cur = new Date(start);
    let idx = 0;

    while (cur <= end) {
      const weekIdx   = Math.floor(idx / 7);
      const dayOfWeek = idx % 7; // 0 = Mon (start is always Monday)
      const curStr    = cur.toDateString();
      const curT      = new Date(cur).setHours(0, 0, 0, 0);
      const playSecs  = dayPlay.get(curStr) ?? 0;

      let state: CellState;
      let intensity = 0;
      if (curStr === createdStr)        state = "created";
      else if (lpDate && curStr === lpStr) state = "lastPlayed";
      else if (curT < createdT)         state = "pre";
      else if (cur > now)               state = "future";
      else if (playSecs > 0)            state = "active";
      else if (haveDayData)             state = "idle"; // have data → this day had none
      else if (lpDate && curT > lpT)    state = "idle";
      else {
        state = "active";
        intensity = (curT - createdT) / span; // legacy ramp (no per-day data)
      }

      if (haveDayData && playSecs > 0) {
        // Real heatmap: warmth proportional to that day's playtime
        intensity = playSecs / maxDaySecs;
      }

      result.push({
        date:    new Date(cur),
        weekIdx,
        dayOfWeek,
        state,
        intensity,
        playSecs,
        label: cur.toLocaleDateString("ru-RU", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        }),
      });

      cur.setDate(cur.getDate() + 1);
      idx++;
    }
    return result;
  }, [instance, dayPlay, maxDaySecs]);

  const numWeeks = days.length > 0 ? days[days.length - 1].weekIdx + 1 : 0;
  const hasData  = lastPlayedTs > 0 && totalHrs > 0;

  // Layout constants (viewBox units) — square rounded cells, GitHub-style
  const PAD_L   = 26;   // room for day labels
  const PAD_R   = 8;
  const PAD_T   = 10;
  const PAD_B   = 22;
  const CELL    = 11;
  const GAP     = 3;
  const SLOT    = CELL + GAP;

  const SVG_W = PAD_L + numWeeks * SLOT + PAD_R;
  const SVG_H = PAD_T + 7 * SLOT - GAP + PAD_B;

  function cellX(w: number): number { return PAD_L + w * SLOT; }
  function cellY(dow: number): number { return PAD_T + dow * SLOT; }

  // Warm fill for active cells (accent, intensity-ramped opacity)
  function activeFill(intensity: number): string {
    const op = 0.16 + intensity * 0.5; // 0.16 … 0.66
    return `rgba(194,65,12,${op.toFixed(3)})`;
  }

  function cellTip(cell: DayCell): string {
    // Real recorded playtime always takes priority in the tooltip.
    if (cell.playSecs > 0) {
      const played = `сыграно ${fmtDuration(cell.playSecs)}`;
      if (cell.state === "created")    return `сборка создана · ${played}`;
      if (cell.state === "lastPlayed") return `последний сеанс · ${played}`;
      return played;
    }
    switch (cell.state) {
      case "created":    return "сборка создана";
      case "lastPlayed": return hasData ? `последний сеанс · ${totalHrs.toFixed(1)} ч всего` : "последний сеанс";
      case "active":     return "нет записи о времени";
      case "idle":       return "не играли";
      case "future":     return "будущее";
      default:           return "";
    }
  }

  // Month label per first week each month appears
  const monthLabels: { x: number; text: string }[] = [];
  let prevMonth = -1;
  for (let w = 0; w < numWeeks; w++) {
    const monday = days.find(d => d.weekIdx === w && d.dayOfWeek === 0);
    if (monday) {
      const m = monday.date.getMonth();
      if (m !== prevMonth) {
        monthLabels.push({
          x:    cellX(w),
          text: monday.date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
        });
        prevMonth = m;
      }
    }
  }

  const lpCell = days.find(d => d.state === "lastPlayed");
  const createdCell = days.find(d => d.state === "created");
  const lastPlayedDate = !isNaN(lastPlayedTs) && lastPlayedTs > 0
    ? new Date(lastPlayedTs * 1000) : null;

  return (
    <div className="spectrum-root">
      <span className="spectrum-label">АКТИВНОСТЬ · ИСТОРИЯ СБОРКИ</span>

      <svg
        className="spectrum-svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMinYMin meet"
        style={{ height: SVG_H }}
      >
        <defs>
          <filter id="sp-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Day-of-week labels (Mon / Wed / Fri only — cleaner) */}
        {DAY_LABELS.map((lbl, d) => (
          d % 2 === 0 ? (
            <text
              key={`dl-${d}`}
              x={PAD_L - 6}
              y={cellY(d) + CELL / 2 + 2.6}
              fontSize="7"
              fontWeight="600"
              fontFamily="Inter, sans-serif"
              fill="rgba(122,122,122,0.55)"
              textAnchor="end"
            >{lbl}</text>
          ) : null
        ))}

        {/* Day cells */}
        {days.map((cell, i) => {
          const x = cellX(cell.weekIdx);
          const y = cellY(cell.dayOfWeek);

          let fill = "rgba(26,26,26,0.045)"; // empty / pre / future baseline
          let stroke = "none";
          if (cell.state === "future")     fill = "rgba(26,26,26,0.02)";
          else if (cell.state === "idle")  fill = "rgba(26,26,26,0.06)";
          else if (cell.state === "active") fill = activeFill(cell.intensity);
          else if (cell.state === "created") {
            fill = "rgba(194,65,12,0.10)";
            stroke = "rgba(194,65,12,0.55)";
          } else if (cell.state === "lastPlayed") {
            fill = "#c2410c";
          }

          const interactive = cell.state !== "pre" && cell.state !== "future";

          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx="2.5"
              fill={fill}
              stroke={stroke}
              strokeWidth={stroke === "none" ? 0 : 1}
              filter={cell.state === "lastPlayed" ? "url(#sp-glow)" : undefined}
              style={{ cursor: "default" }}
              onMouseEnter={interactive ? (e) =>
                setTip({ x: e.clientX + 12, y: e.clientY - 8, text: cell.label, sub: cellTip(cell) }) : undefined}
              onMouseMove={interactive ? (e) =>
                setTip(t => t ? { ...t, x: e.clientX + 12, y: e.clientY - 8 } : null) : undefined}
              onMouseLeave={interactive ? () => setTip(null) : undefined}
            />
          );
        })}

        {/* Pulsing halo on the last-played cell */}
        {hasData && lpCell && (() => {
          const cx = cellX(lpCell.weekIdx) + CELL / 2;
          const cy = cellY(lpCell.dayOfWeek) + CELL / 2;
          return (
            <g pointerEvents="none">
              <circle cx={cx} cy={cy} r="7" fill="#c2410c" opacity="0.16" className="spectrum-halo"/>
            </g>
          );
        })()}

        {/* Month labels */}
        {monthLabels.map((ml, i) => (
          <text
            key={i}
            x={ml.x}
            y={SVG_H - 6}
            fontSize="7.5"
            fontWeight="700"
            fontFamily="Inter, sans-serif"
            fill="rgba(122,122,122,0.7)"
            textAnchor="start"
          >{ml.text}</text>
        ))}
      </svg>

      {/* Legend */}
      <div className="spectrum-legend">
        {createdCell && (
          <span className="spectrum-legend-item">
            <i className="spectrum-legend-swatch is-created" /> создана
          </span>
        )}
        <span className="spectrum-legend-item">
          <i className="spectrum-legend-swatch is-active" /> активность
        </span>
        {hasData && (
          <span className="spectrum-legend-item">
            <i className="spectrum-legend-swatch is-last" /> последний сеанс
          </span>
        )}
      </div>

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
  const [icons, setIcons]     = useState<Record<string, string | null>>({});
  const [authors, setAuthors] = useState<Record<string, string | null>>({});

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

      const ids = Array.from(new Set(
        [...m, ...p, ...s].map((i) => i.projectId).filter((v): v is string => !!v),
      ));
      if (ids.length === 0) return;
      invoke<Record<string, string | null>>("get_modrinth_project_icons", { projectIds: ids })
        .then((res) => { if (alive) setIcons(res); }).catch(() => { /* no covers */ });
      invoke<Record<string, string | null>>("get_modrinth_project_authors", { projectIds: ids })
        .then((res) => { if (alive) setAuthors(res); }).catch(() => { /* keep stored */ });
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

    const realAuthor = (item: InstalledModView): string => {
      const fetched = item.projectId ? authors[item.projectId] : null;
      return (fetched && fetched.trim()) ? fetched : item.author;
    };
    const cover = (item: InstalledModView): string | null =>
      (item.projectId ? icons[item.projectId] : null) ?? null;

    const pushItem = (item: InstalledModView, kind: EventKind) => {
      const ts = parseInt(item.installedAt ?? "0", 10);
      if (ts <= 0) return;
      const author = realAuthor(item);
      list.push({
        kind, ts, title: item.title, iconUrl: cover(item), author,
        detail: [author ? `Автор: ${author}` : "", item.versionNumber ? `Версия: ${item.versionNumber}` : ""].filter(Boolean),
      });
    };

    for (const m of mods) pushItem(m, "mod");
    for (const p of packs) pushItem(p, "pack");
    for (const s of shaders) pushItem(s, "shader");

    const lpTs = parseInt(instance.lastPlayed, 10);
    if (!isNaN(lpTs) && lpTs > 0) {
      const hrs = (instance.playtimeSecs / 3600).toFixed(1);
      list.push({
        kind: "launched", ts: lpTs, title: "Последний запуск",
        detail: instance.playtimeSecs > 0 ? [`Наиграно суммарно: ${hrs} ч`] : [],
      });
    }

    return list.sort((a, b) => a.ts - b.ts);
  }, [instance, mods, packs, shaders, icons, authors]);

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
                {evt.iconUrl && (
                  <img className="tl-icon" src={evt.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                )}
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
              {evt.iconUrl ? (
                <img className="tl-h-square tl-h-square--icon" src={evt.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <div className="tl-h-square" />
              )}
              <span className="tl-h-short">{KIND_SHORT[evt.kind]}</span>
              <div className={`tl-h-hover-info${flip ? " tl-h-hover-info--flip" : ""}`}>
                <span className={`tl-tag tl-tag--${evt.kind}`}>{KIND_TAG[evt.kind]}</span>
                <span className="tl-h-title">{evt.title}</span>
                {evt.author && <span className="tl-h-author">{evt.author}</span>}
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
            <BuildConstellation
              instanceId={instance.id}
              loader={instance.loader}
              version={instance.version}
              mods={mods}
              packs={packs}
              shaders={shaders}
              loading={loading}
            />
          )}
        </div>
      </div>
    </div>
  );
}
