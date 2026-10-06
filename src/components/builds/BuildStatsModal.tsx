import { useState, useMemo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstanceItem, InstalledModView, PlaytimeSession } from "../../types";
import { BuildConstellation } from "./BuildConstellation";
import { BuildActivityCalendar } from "./BuildActivityCalendar";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { StatsIcon } from "./StatsIcon";
import { activityByDay, dayKey, formatStatsDuration, statsCount, timestamp } from "./buildStats";

type StatsTab = "timeline" | "heatmap" | "constellation";
type EventKind = "created" | "mod" | "pack" | "shader" | "launched";
type EventFilter = "all" | "launched" | "mod" | "resources";
interface TLEvent {
  id: string;
  kind: EventKind;
  ts: number;
  title: string;
  detail: string[];
  iconUrl?: string | null;
}
interface Props {
  instance: InstanceItem;
  onClose: () => void;
}

const KIND_TAG: Record<EventKind, string> = {
  created: "Создание",
  mod: "Мод",
  pack: "Ресурс-пак",
  shader: "Шейдер",
  launched: "Игра",
};
const FILTERS: { id: EventFilter; label: string }[] = [
  { id: "all", label: "Все события" },
  { id: "launched", label: "Игра" },
  { id: "mod", label: "Моды" },
  { id: "resources", label: "Ресурсы" },
];
const TABS: { id: StatsTab; label: string }[] = [
  { id: "timeline", label: "Хронология" },
  { id: "heatmap", label: "Тепловая карта" },
  { id: "constellation", label: "Созвездие" },
];

function EventIcon({ event }: { event: TLEvent }) {
  return event.iconUrl ? (
    <img src={event.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
  ) : event.kind === "launched" ? (
    <StatsIcon name="play" />
  ) : (
    <span aria-hidden="true">
      {event.kind === "created" ? "✦" : event.title.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function BuildStatsModal({ instance, onClose }: Props) {
  const [tab, setTab] = useState<StatsTab>("timeline");
  const [horizontal, setHorizontal] = useState(false);
  const [filter, setFilter] = useState<EventFilter>("all");
  const [newestFirst, setNewestFirst] = useState(true);
  const [mods, setMods] = useState<InstalledModView[]>([]);
  const [packs, setPacks] = useState<InstalledModView[]>([]);
  const [shaders, setShaders] = useState<InstalledModView[]>([]);
  const [sessions, setSessions] = useState<PlaytimeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [contentError, setContentError] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const [authors, setAuthors] = useState<Record<string, string | null>>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      );
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setMods([]);
    setPacks([]);
    setShaders([]);
    setIcons({});
    setAuthors({});
  }, [instance.id]);

  useEffect(() => {
    let alive = true;
    setContentError(false);
    Promise.allSettled([
      invoke<InstalledModView[]>("list_installed_mods", { instanceId: instance.id }),
      invoke<InstalledModView[]>("list_installed_resourcepacks", { instanceId: instance.id }),
      invoke<InstalledModView[]>("list_installed_shaders", { instanceId: instance.id }),
    ]).then((results) => {
      if (!alive) return;
      const [m, p, s] = results.map((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
      if (results[0].status === "fulfilled") setMods(m);
      if (results[1].status === "fulfilled") setPacks(p);
      if (results[2].status === "fulfilled") setShaders(s);
      setLoading(false);
      setContentError(results.some((result) => result.status === "rejected"));
      const ids = Array.from(
        new Set(
          [...m, ...p, ...s].map((item) => item.projectId).filter((id): id is string => !!id),
        ),
      );
      if (!ids.length) return;
      invoke<Record<string, string | null>>("get_modrinth_project_icons", { projectIds: ids })
        .then((res) => {
          if (alive) setIcons(res);
        })
        .catch(() => {});
      invoke<Record<string, string | null>>("get_modrinth_project_authors", { projectIds: ids })
        .then((res) => {
          if (alive) setAuthors(res);
        })
        .catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [instance.id, refresh]);

  useEffect(() => {
    let alive = true;
    setSessionsLoading(true);
    setSessionsError(false);
    invoke<PlaytimeSession[]>("get_playtime_sessions", { instanceId: instance.id })
      .then((res) => {
        if (alive) setSessions(res ?? []);
      })
      .catch(() => {
        if (alive) {
          setSessions([]);
          setSessionsError(true);
        }
      })
      .finally(() => {
        if (alive) setSessionsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [instance.id, instance.playtimeSecs, instance.lastPlayed, refresh]);

  const activity = useMemo(() => activityByDay(sessions), [sessions]);
  const recentSecs = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 29);
    return [...activity].reduce(
      (sum, [key, day]) => sum + (key >= dayKey(cutoff) ? day.secs : 0),
      0,
    );
  }, [activity]);
  const events = useMemo<TLEvent[]>(() => {
    const list: TLEvent[] = [];
    const createdTs = timestamp(instance.createdAt);
    if (createdTs)
      list.push({
        id: "created",
        kind: "created",
        ts: createdTs,
        title: instance.name,
        detail: [
          `Minecraft ${instance.version} · ${instance.loader}${instance.loaderVersion ? ` ${instance.loaderVersion}` : ""}`,
          `${instance.ram} ГБ памяти`,
        ],
      });
    const add = (item: InstalledModView, kind: EventKind) => {
      const ts = timestamp(item.installedAt ?? "0");
      if (!ts) return;
      const author = (item.projectId && authors[item.projectId]) || item.author;
      list.push({
        id: `${kind}:${item.filename}`,
        kind,
        ts,
        title: item.title,
        iconUrl: (item.projectId ? icons[item.projectId] : null) || item.iconUrl,
        detail: [
          author,
          item.versionNumber ? `v${item.versionNumber}` : "",
          !item.enabled ? "Отключён" : "",
        ].filter(Boolean),
      });
    };
    mods.forEach((item) => add(item, "mod"));
    packs.forEach((item) => add(item, "pack"));
    shaders.forEach((item) => add(item, "shader"));
    const validSessions = sessions.filter(
      (session) =>
        Number.isFinite(session.ts) &&
        Number.isFinite(session.secs) &&
        session.ts > 0 &&
        session.secs > 0,
    );
    validSessions.forEach((session, index) => {
      const time = (ts: number) =>
        new Date(ts * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      list.push({
        id: `session:${session.ts}:${index}`,
        kind: "launched",
        ts: session.ts,
        title: "Игровой сеанс",
        detail: [
          formatStatsDuration(session.secs),
          `${time(session.ts - session.secs)} — ${time(session.ts)}`,
        ],
      });
    });
    const lastTs = timestamp(instance.lastPlayed);
    const latestSession = validSessions.reduce(
      (latest, session) => Math.max(latest, session.ts),
      0,
    );
    if (lastTs && lastTs > latestSession)
      list.push({
        id: "last-launch",
        kind: "launched",
        ts: lastTs,
        title: "Последний запуск",
        detail: instance.status === "RUNNING" ? ["В игре"] : [],
      });
    return list.sort((a, b) => (newestFirst ? b.ts - a.ts : a.ts - b.ts));
  }, [instance, mods, packs, shaders, sessions, icons, authors, newestFirst]);
  const visibleEvents = events.filter(
    (event) =>
      filter === "all" ||
      (filter === "resources"
        ? event.kind === "pack" || event.kind === "shader"
        : event.kind === filter),
  );
  const groups = new Map<string, TLEvent[]>();
  for (const event of visibleEvents) {
    const key = dayKey(new Date(event.ts * 1000));
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return (
    <div className="confirm-overlay stats-overlay" onClick={onClose}>
      <div
        className="stats-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="build-stats-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="stats-close"
          type="button"
          aria-label="Закрыть статистику"
          onClick={onClose}
        >
          ✕
        </button>
        <header className="stats-modal-head">
          <span className="confirm-label">STATS</span>
          <h2 className="stats-modal-name" id="build-stats-title">
            {instance.name}
          </h2>
        </header>
        <div className="stats-tab-bar" role="tablist" aria-label="Раздел статистики">
          {TABS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`stats-panel-${item.id}`}
              id={`stats-tab-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              className={`stats-tab-btn${tab === item.id ? " active" : ""}`}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                let next: number;
                if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
                else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = TABS.length - 1;
                else return;
                event.preventDefault();
                setTab(TABS[next].id);
                document.getElementById(`stats-tab-${TABS[next].id}`)?.focus();
              }}
            >
              {item.label}
            </button>
          ))}
          {tab === "timeline" && (
            <div className="tl-dir-switcher">
              <button
                type="button"
                className={`stats-icon-btn${!horizontal ? " active" : ""}`}
                aria-label="Вертикальная хронология"
                data-tooltip="Вертикально"
                aria-pressed={!horizontal}
                onClick={() => setHorizontal(false)}
              >
                <StatsIcon name="list" />
              </button>
              <button
                type="button"
                className={`stats-icon-btn${horizontal ? " active" : ""}`}
                aria-label="Горизонтальная хронология"
                data-tooltip="Горизонтально"
                aria-pressed={horizontal}
                onClick={() => setHorizontal(true)}
              >
                <StatsIcon name="timeline" />
              </button>
            </div>
          )}
        </div>
        <CustomScrollArea
          key={tab}
          className="stats-tab-scroll"
          thumbThickness={7}
          onWheel={(event) => event.stopPropagation()}
        >
          <div
            className="stats-tab-body"
            role="tabpanel"
            id={`stats-panel-${tab}`}
            aria-labelledby={`stats-tab-${tab}`}
          >
            {(contentError || sessionsError) && (
              <div className="stats-error" role="status">
                <span>Часть данных не удалось загрузить.</span>
                <button type="button" onClick={() => setRefresh((value) => value + 1)}>
                  Повторить
                </button>
              </div>
            )}
            {tab === "timeline" && (
              <>
                <div className="tl-toolbar">
                  <div className="tl-filters" aria-label="Фильтр событий">
                    {FILTERS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={filter === item.id}
                        className={filter === item.id ? "active" : ""}
                        onClick={() => setFilter(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="stats-icon-btn tl-sort"
                    type="button"
                    aria-label={newestFirst ? "Сначала новые" : "Сначала старые"}
                    data-tooltip={newestFirst ? "Сначала новые" : "Сначала старые"}
                    onClick={() => setNewestFirst(!newestFirst)}
                  >
                    <StatsIcon name={newestFirst ? "sort-down" : "sort-up"} />
                  </button>
                </div>
                {loading || sessionsLoading ? (
                  <div className="stats-state" role="status">
                    Загрузка…
                  </div>
                ) : visibleEvents.length === 0 ? (
                  <div className="stats-state">Нет событий</div>
                ) : horizontal ? (
                  <CustomScrollArea
                    className="tl-horizontal-scroll"
                    orientation="horizontal"
                    thumbThickness={7}
                    tabIndex={0}
                    aria-label="Лента событий, прокручивается горизонтально"
                  >
                    <div className="tl-filmstrip">
                      {visibleEvents.map((event) => (
                        <article key={event.id} className={`tl-film-card tl-kind--${event.kind}`}>
                          <time dateTime={new Date(event.ts * 1000).toISOString()}>
                            {new Date(event.ts * 1000).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </time>
                          <div className="tl-film-marker">
                            <div className="tl-event-icon">
                              <EventIcon event={event} />
                            </div>
                          </div>
                          <span className="tl-tag">{KIND_TAG[event.kind]}</span>
                          <h4>{event.title}</h4>
                          <p>{event.detail.join(" · ")}</p>
                        </article>
                      ))}
                    </div>
                  </CustomScrollArea>
                ) : (
                  <div className="tl-root">
                    {[...groups].map(([key, dayEvents]) => (
                      <section key={key} className="tl-day-group">
                        <div className="tl-day-heading">
                          <time dateTime={key}>
                            {new Date(`${key}T12:00:00`).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </time>
                          <span>
                            {statsCount(dayEvents.length, ["событие", "события", "событий"])}
                          </span>
                        </div>
                        <div className="tl-day-events">
                          {dayEvents.map((event) => (
                            <article key={event.id} className={`tl-row tl-kind--${event.kind}`}>
                              <div className="tl-event-icon">
                                <EventIcon event={event} />
                              </div>
                              <div className="tl-event-body">
                                <div className="tl-header">
                                  <span className="tl-tag">{KIND_TAG[event.kind]}</span>
                                  <time dateTime={new Date(event.ts * 1000).toISOString()}>
                                    {new Date(event.ts * 1000).toLocaleTimeString("ru-RU", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </time>
                                </div>
                                <h4>{event.title}</h4>
                                <p>{event.detail.join(" · ")}</p>
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
            {tab === "heatmap" && (
              <BuildActivityCalendar
                instance={instance}
                activity={activity}
                loading={sessionsLoading}
                error={sessionsError}
                recentSecs={recentSecs}
              />
            )}
            {tab === "constellation" && (
              <BuildConstellation
                instanceId={instance.id}
                loader={instance.loader}
                version={instance.version}
                mods={mods}
                packs={packs}
                shaders={shaders}
                loading={loading}
                onContentChange={() => setRefresh((value) => value + 1)}
              />
            )}
          </div>
        </CustomScrollArea>
      </div>
    </div>
  );
}
