import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { VisibleUpdateState } from "./useLauncherUpdater";
import {
  formatEta,
  formatMegabytes,
  formatReleaseDate,
  formatSpeed,
  parseReleaseNotes,
  progressRatio,
} from "./updateProgress";
import "./LauncherUpdateOverlay.css";

type Props = {
  state: VisibleUpdateState;
  autoStartDelayMs: number;
  onUpdate: () => void;
  onLater: () => void;
  onDragStart?: () => void;
};

const LEAVE_MS = 460;
// Matches the end of the staggered entrance in the stylesheet.
const ENTRANCE_MS = 2200;

const STEPS = ["СКАЧИВАНИЕ", "УСТАНОВКА", "ПЕРЕЗАПУСК"] as const;

const KICKER: Record<VisibleUpdateState["stage"], string> = {
  available: "ДОСТУПНО ОБНОВЛЕНИЕ",
  downloading: "ОБНОВЛЯЕМ ЛАУНЧЕР",
  installing: "ОБНОВЛЯЕМ ЛАУНЧЕР",
  error: "ОБНОВЛЕНИЕ ПРЕРВАНО",
};

const activeStep = (state: VisibleUpdateState) =>
  state.stage === "downloading" ? 0 : state.stage === "installing" ? 1 : -1;

function LauncherMark() {
  return (
    <svg className="launcher-update__mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" fill="currentColor" />
      <path d="M7 7H22V11H11V14H25V25H7V21H21V18H7Z" fill="#fff" />
      <rect x="22" y="7" width="3" height="4" fill="#1a1a1a" />
    </svg>
  );
}

function UpdateProgress({ state }: { state: VisibleUpdateState }) {
  if (state.stage === "installing") {
    return (
      <div
        className="launcher-update__progress is-installing"
        role="progressbar"
        aria-label="Установка обновления"
        aria-valuetext="Установка"
      >
        <div className="launcher-update__progress-head">
          <span>Устанавливаем обновление</span>
          <strong>100%</strong>
        </div>
        <div className="launcher-update__track">
          <div className="launcher-update__fill" style={{ width: "100%" }} />
        </div>
        <div className="launcher-update__meta">
          <span>Лаунчер закроется и откроется сам</span>
          <span>пара секунд</span>
        </div>
      </div>
    );
  }

  if (state.stage !== "downloading") return null;

  const ratio = progressRatio(state.downloaded, state.total);
  const percent = ratio === null ? null : Math.floor(ratio * 100);
  const verifying = ratio === 1;
  const remaining = state.total === null ? 0 : state.total - state.downloaded;
  const eta =
    state.bytesPerSecond && !verifying ? formatEta(remaining, state.bytesPerSecond) : null;

  return (
    <div
      className={`launcher-update__progress${ratio === null ? " is-indeterminate" : ""}`}
      role="progressbar"
      aria-label="Загрузка обновления"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
    >
      <div className="launcher-update__progress-head">
        <span>{verifying ? "Проверяем подпись файла" : "Скачиваем обновление"}</span>
        <strong>
          {percent ?? "—"}
          {percent !== null && <small>%</small>}
        </strong>
      </div>
      <div className="launcher-update__track">
        <div
          className="launcher-update__fill"
          style={{ width: ratio === null ? undefined : `${ratio * 100}%` }}
        />
      </div>
      <div className="launcher-update__meta">
        <span>
          {formatMegabytes(state.downloaded)}
          {state.total !== null && ` из ${formatMegabytes(state.total)}`}
        </span>
        <span>
          {state.bytesPerSecond && !verifying ? formatSpeed(state.bytesPerSecond) : ""}
          {eta && ` · ${eta}`}
        </span>
      </div>
    </div>
  );
}

export function LauncherUpdateOverlay({
  state,
  autoStartDelayMs,
  onUpdate,
  onLater,
  onDragStart,
}: Props) {
  const [leaving, setLeaving] = useState(false);
  const [settled, setSettled] = useState(false);
  const { info } = state;
  const autoStart = state.stage === "available" && state.autoStart;
  const [secondsLeft, setSecondsLeft] = useState(() => Math.ceil(autoStartDelayMs / 1000));
  const canLeave = state.stage === "available" || state.stage === "error";
  const step = activeStep(state);
  const releaseDate = formatReleaseDate(info.date);
  const notes = info.notes ? parseReleaseNotes(info.notes) : [];

  const leave = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onLater, LEAVE_MS);
  }, [leaving, onLater]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), ENTRANCE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((autoStartDelayMs - (Date.now() - startedAt)) / 1000));
      setSecondsLeft(left);
    }, 250);
    return () => window.clearInterval(timer);
  }, [autoStart, autoStartDelayMs]);

  useEffect(() => {
    if (!canLeave) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      leave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canLeave, leave]);

  return (
    <div
      className={`launcher-update stage-${state.stage}${settled ? " is-settled" : ""}${
        leaving ? " is-leaving" : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="launcher-update-title"
      style={{ "--update-countdown": `${autoStartDelayMs}ms` } as CSSProperties}
    >
      <div className="launcher-update__sheet" aria-hidden="true">
        <span className="launcher-update__ghost-version">{info.version}</span>
      </div>

      <header
        className="launcher-update__bar"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          onDragStart?.();
        }}
      >
        <span className="launcher-update__brand">ARCHIVE // UPDATE</span>
        <ol className="launcher-update__steps">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={index < step ? "is-done" : index === step ? "is-active" : undefined}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {label}
            </li>
          ))}
        </ol>
      </header>

      <main className="launcher-update__body">
        <div className="launcher-update__headline">
          <LauncherMark />
          <span className="launcher-update__kicker">{KICKER[state.stage]}</span>
        </div>

        <h2 id="launcher-update-title" className="launcher-update__version">
          <span className="launcher-update__version-prefix">v</span>
          {info.version}
        </h2>
        <p className="launcher-update__sub">
          Сейчас установлена {info.currentVersion}
          {releaseDate && <> · выпущена {releaseDate}</>}
        </p>

        <div className="launcher-update__stage" key={state.stage}>
          {state.stage === "available" && (
            <div className="launcher-update__actions">
              <button
                type="button"
                className={`launcher-update__primary${autoStart ? " is-counting" : ""}`}
                onClick={onUpdate}
                autoFocus
              >
                <span className="launcher-update__primary-fill" aria-hidden="true" />
                <span className="launcher-update__primary-label">
                  ОБНОВИТЬ СЕЙЧАС
                  {autoStart && <em>{secondsLeft}</em>}
                </span>
              </button>
              <button type="button" className="launcher-update__secondary" onClick={leave}>
                ПОЗЖЕ
              </button>
            </div>
          )}

          {(state.stage === "downloading" || state.stage === "installing") && (
            <UpdateProgress state={state} />
          )}

          {state.stage === "error" && (
            <div className="launcher-update__error">
              <p>{state.message}</p>
              <div className="launcher-update__actions">
                <button type="button" className="launcher-update__primary" onClick={onUpdate}>
                  <span className="launcher-update__primary-label">ПОВТОРИТЬ</span>
                </button>
                <button type="button" className="launcher-update__secondary" onClick={leave}>
                  ПРОДОЛЖИТЬ БЕЗ ОБНОВЛЕНИЯ
                </button>
              </div>
            </div>
          )}
        </div>

        {notes.length > 0 && (
          <section className="launcher-update__notes" aria-label="Что нового">
            <span className="launcher-update__notes-label">ЧТО НОВОГО</span>
            <div className="launcher-update__notes-body">
              {notes.map((line, index) =>
                line.kind === "heading" ? (
                  <strong key={index}>{line.text}</strong>
                ) : (
                  <p key={index} className={line.kind === "item" ? "is-item" : undefined}>
                    {line.text}
                  </p>
                ),
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="launcher-update__bar launcher-update__bar--bottom">
        <span>
          {state.stage === "downloading" || state.stage === "installing"
            ? "НЕ ЗАКРЫВАЙ ЛАУНЧЕР"
            : state.stage === "error"
              ? "ТЕКУЩАЯ ВЕРСИЯ ОСТАЛАСЬ БЕЗ ИЗМЕНЕНИЙ"
              : autoStart
                ? "ОБНОВЛЕНИЕ НАЧНЁТСЯ АВТОМАТИЧЕСКИ"
                : "SCREENLAUNCHER"}
        </span>
        <span>
          {info.currentVersion} → {info.version}
        </span>
      </footer>
    </div>
  );
}
