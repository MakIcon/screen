import { useMemo, useState } from "react";
import type { InstanceItem } from "../../types";
import {
  calendarMonth,
  dayKey,
  formatStatsDuration,
  heatLevel,
  statsCount,
  timestamp,
  type DayActivity,
} from "./buildStats";
import { StatsIcon } from "./StatsIcon";

const WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
const LEVELS = ["Нет записей", "До 30 мин", "30–60 мин", "1–3 ч", "> 3 ч"];

export function BuildActivityCalendar({
  instance,
  activity,
  loading,
  error,
  recentSecs,
}: {
  instance: InstanceItem;
  activity: Map<string, DayActivity>;
  loading: boolean;
  error: boolean;
  recentSecs: number;
}) {
  const [period, setPeriod] = useState<3 | 12>(3);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const todayKey = dayKey(new Date());
  const createdTs = timestamp(instance.createdAt);
  const createdKey = createdTs ? dayKey(new Date(createdTs * 1000)) : "";
  const lastTs = timestamp(instance.lastPlayed);
  const lastKey = lastTs ? dayKey(new Date(lastTs * 1000)) : "";
  const months = useMemo(() => {
    const now = new Date();
    const end =
      period === 12
        ? new Date(now.getFullYear() + offset, 11, 1)
        : new Date(now.getFullYear(), now.getMonth() + offset * 3, 1);
    return Array.from(
      { length: period },
      (_, i) => new Date(end.getFullYear(), end.getMonth() - period + 1 + i, 1),
    );
  }, [period, offset]);
  const first = months[0];
  const last = months[months.length - 1];
  const rangeLabel =
    period === 12
      ? `${first.getFullYear()}`
      : `${first.toLocaleDateString("ru-RU", { month: "short" })} — ${last.toLocaleDateString("ru-RU", { month: "short", year: "numeric" })}`;
  const selectedActivity = activity.get(selected);

  return (
    <div className="activity-root">
      <div className="activity-toolbar">
        <div className="stats-segmented" aria-label="Период календаря">
          {([3, 12] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              className={period === value ? "active" : ""}
              onClick={() => {
                setPeriod(value);
                setOffset(0);
              }}
            >
              {value === 3 ? "3 месяца" : "Год"}
            </button>
          ))}
        </div>
        <div className="activity-navigation">
          <button
            type="button"
            className="stats-icon-btn"
            aria-label="Предыдущий период"
            data-tooltip="Предыдущий период"
            onClick={() => setOffset(offset - 1)}
          >
            <StatsIcon name="left" />
          </button>
          <span>{rangeLabel}</span>
          <button
            type="button"
            className="stats-icon-btn"
            aria-label="Следующий период"
            data-tooltip="Следующий период"
            disabled={offset >= 0}
            onClick={() => setOffset(offset + 1)}
          >
            <StatsIcon name="right" />
          </button>
          {offset < 0 && (
            <button type="button" className="activity-today" onClick={() => setOffset(0)}>
              Сегодня
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="stats-state" role="status">
          Загрузка…
        </div>
      ) : (
        <>
          <div className="activity-months">
            {months.map((month) => {
              const cells = calendarMonth(month);
              const monthSecs = cells.reduce(
                (sum, day) => sum + (day ? (activity.get(dayKey(day))?.secs ?? 0) : 0),
                0,
              );
              return (
                <section
                  className="activity-month"
                  key={dayKey(month)}
                  aria-label={month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
                >
                  <div className="activity-month-head">
                    <h4>{month.toLocaleDateString("ru-RU", { month: "long" })}</h4>
                    {monthSecs > 0 && <span>{formatStatsDuration(monthSecs)}</span>}
                  </div>
                  <div className="activity-grid">
                    {WEEKDAYS.map((day) => (
                      <span className="activity-weekday" key={day}>
                        {day}
                      </span>
                    ))}
                    {cells.map((day, index) => {
                      if (!day) return <span className="activity-blank" key={`blank-${index}`} />;
                      const key = dayKey(day);
                      const secs = activity.get(key)?.secs ?? 0;
                      const unavailable = key > todayKey || (!!createdKey && key < createdKey);
                      const date = day.toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "long",
                      });
                      const label = `${date}: ${secs > 0 ? formatStatsDuration(secs) : "нет записей"}${key === createdKey ? ", сборка создана" : ""}${key === todayKey ? ", сегодня" : ""}`;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`activity-day heat-${heatLevel(secs)}${key === selected ? " is-selected" : ""}${key === todayKey ? " is-today" : ""}${unavailable ? " is-unavailable" : ""}`}
                          disabled={unavailable}
                          aria-label={label}
                          aria-pressed={key === selected}
                          data-tooltip={label}
                          onClick={() => setSelected(key)}
                        >
                          {day.getDate()}
                          {key === createdKey && <i className="activity-created-dot" />}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="activity-footer">
            <div className="activity-scale">
              {LEVELS.map((label, index) => (
                <span key={label}>
                  <i className={`heat-${index}`} />
                  {label}
                </span>
              ))}
            </div>
            <span className="activity-created-key">
              <i />
              Создана
            </span>
          </div>
          <div className="activity-day-detail" aria-live="polite">
            <span>
              {new Date(`${selected}T12:00:00`).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
              })}
              {selected === createdKey ? " · создана" : ""}
              {selected === lastKey ? " · последний запуск" : ""}
            </span>
            <span>
              {selectedActivity ? (
                <>
                  <strong>{formatStatsDuration(selectedActivity.secs)}</strong> ·{" "}
                  {statsCount(selectedActivity.sessions, ["сеанс", "сеанса", "сеансов"])}
                </>
              ) : (
                "Нет записей"
              )}
            </span>
          </div>
          <div className="activity-summary">
            <div>
              <strong>{formatStatsDuration(instance.playtimeSecs)}</strong>
              <span>ВСЕГО</span>
            </div>
            <div>
              <strong>{error ? "—" : formatStatsDuration(recentSecs)}</strong>
              <span>ЗА 30 ДНЕЙ</span>
            </div>
            <div>
              <strong>{error ? "—" : activity.size}</strong>
              <span>АКТИВНЫХ ДНЕЙ</span>
            </div>
            <div>
              <strong>
                {lastTs
                  ? new Date(lastTs * 1000).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "short",
                    })
                  : "—"}
              </strong>
              <span>ПОСЛЕДНИЙ ЗАПУСК</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
