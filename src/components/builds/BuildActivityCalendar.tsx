import { useMemo, useState } from "react";
import type { InstanceItem } from "../../types";
import {
  calendarMonth,
  dayKey,
  formatStatsDuration,
  heatLevel,
  timestamp,
  type DayActivity,
} from "./buildStats";
import { StatsIcon } from "./StatsIcon";
import { intlLocale as toIntlLocale, useLocale, useTranslation } from "../../i18n/locale";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const LEVELS = [0, 1, 2, 3, 4] as const;

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
  const locale = useLocale();
  const tr = useTranslation();
  const intlLocale = toIntlLocale(locale);
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
      : `${first.toLocaleDateString(intlLocale, { month: "short" })} — ${last.toLocaleDateString(intlLocale, { month: "short", year: "numeric" })}`;
  const selectedActivity = activity.get(selected);

  return (
    <div className="activity-root">
      <div className="activity-toolbar">
        <div className="stats-segmented" aria-label={tr("buildActivityCalendar.calendarPeriod")}>
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
              {value === 3 ? tr("buildActivityCalendar.3Months") : tr("buildActivityCalendar.year")}
            </button>
          ))}
        </div>
        <div className="activity-navigation">
          <button
            type="button"
            className="stats-icon-btn"
            aria-label={tr("buildActivityCalendar.previousPeriod")}
            data-tooltip={tr("buildActivityCalendar.previousPeriod")}
            onClick={() => setOffset(offset - 1)}
          >
            <StatsIcon name="left" />
          </button>
          <span>{rangeLabel}</span>
          <button
            type="button"
            className="stats-icon-btn"
            aria-label={tr("buildActivityCalendar.nextPeriod")}
            data-tooltip={tr("buildActivityCalendar.nextPeriod")}
            disabled={offset >= 0}
            onClick={() => setOffset(offset + 1)}
          >
            <StatsIcon name="right" />
          </button>
          {offset < 0 && (
            <button type="button" className="activity-today" onClick={() => setOffset(0)}>
              {tr("buildActivityCalendar.today")}
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="stats-state" role="status">
          {tr("common.loading")}
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
                  aria-label={month.toLocaleDateString(intlLocale, {
                    month: "long",
                    year: "numeric",
                  })}
                >
                  <div className="activity-month-head">
                    <h4>{month.toLocaleDateString(intlLocale, { month: "long" })}</h4>
                    {monthSecs > 0 && <span>{formatStatsDuration(monthSecs, locale)}</span>}
                  </div>
                  <div className="activity-grid">
                    {WEEKDAYS.map((day) => (
                      <span className="activity-weekday" key={day}>
                        {tr(`buildActivityCalendar.weekday.${day}`)}
                      </span>
                    ))}
                    {cells.map((day, index) => {
                      if (!day) return <span className="activity-blank" key={`blank-${index}`} />;
                      const key = dayKey(day);
                      const secs = activity.get(key)?.secs ?? 0;
                      const unavailable = key > todayKey || (!!createdKey && key < createdKey);
                      const date = day.toLocaleDateString(intlLocale, {
                        day: "numeric",
                        month: "long",
                      });
                      const label = `${date}: ${secs > 0 ? formatStatsDuration(secs, locale) : tr("buildActivityCalendar.noActivity")}${key === createdKey ? tr("buildActivityCalendar.buildCreated") : ""}${key === todayKey ? tr("buildActivityCalendar.today2") : ""}`;
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
              {LEVELS.map((level) => (
                <span key={level}>
                  <i className={`heat-${level}`} />
                  {tr(`buildActivityCalendar.level.${level}`)}
                </span>
              ))}
            </div>
            <span className="activity-created-key">
              <i />
              {tr("buildActivityCalendar.created")}
            </span>
          </div>
          <div className="activity-day-detail" aria-live="polite">
            <span>
              {new Date(`${selected}T12:00:00`).toLocaleDateString(intlLocale, {
                day: "numeric",
                month: "long",
              })}
              {selected === createdKey ? tr("buildActivityCalendar.created2") : ""}
              {selected === lastKey ? tr("buildActivityCalendar.lastLaunch") : ""}
            </span>
            <span>
              {selectedActivity ? (
                <>
                  <strong>{formatStatsDuration(selectedActivity.secs, locale)}</strong> ·{" "}
                  {tr("buildActivityCalendar.sessions", { count: selectedActivity.sessions })}
                </>
              ) : (
                tr("buildActivityCalendar.noActivity2")
              )}
            </span>
          </div>
          <div className="activity-summary">
            <div>
              <strong>{formatStatsDuration(instance.playtimeSecs, locale)}</strong>
              <span>{tr("buildActivityCalendar.total")}</span>
            </div>
            <div>
              <strong>{error ? "—" : formatStatsDuration(recentSecs, locale)}</strong>
              <span>{tr("buildActivityCalendar.last30Days")}</span>
            </div>
            <div>
              <strong>{error ? "—" : activity.size}</strong>
              <span>{tr("buildActivityCalendar.activeDays")}</span>
            </div>
            <div>
              <strong>
                {lastTs
                  ? new Date(lastTs * 1000).toLocaleDateString(intlLocale, {
                      day: "numeric",
                      month: "short",
                    })
                  : "—"}
              </strong>
              <span>{tr("buildActivityCalendar.lastLaunch2")}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
