import { ProgressBar } from "../components/display/ProgressBar";
import { useEffect, useState, type CSSProperties } from "react";
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
import { Trans, useTranslation } from "../i18n/locale";

type Props = {
  state: VisibleUpdateState;
  autoStartDelayMs: number;
  onUpdate: () => void;
  onLater: () => void;
  onDragStart?: () => void;
};

function LauncherMark() {
  return (
    <svg className="launcher-update__mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" fill="currentColor" />
      <path d="M7 7H22V11H11V14H25V25H7V21H21V18H7Z" fill="#fff" />
      <rect x="22" y="7" width="3" height="4" fill="#1a1a1a" />
    </svg>
  );
}

export function LauncherUpdateOverlay({
  state,
  autoStartDelayMs,
  onUpdate,
  onLater,
  onDragStart,
}: Props) {
  const tr = useTranslation();
  const steps = [
    tr("launcherUpdate.step.download"),
    tr("launcherUpdate.step.verify"),
    tr("launcherUpdate.step.restart"),
  ];
  const [notesOpen, setNotesOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.ceil(autoStartDelayMs / 1000));
  const { info } = state;
  const downloading = state.stage === "downloading";
  const installing = state.stage === "installing";
  const error = state.stage === "error";
  const transferVisible = downloading || installing;
  const autoStart = state.stage === "available" && state.autoStart;
  const canLeave = state.stage === "available" || error;
  const ratio = downloading ? progressRatio(state.downloaded, state.total) : null;
  const verifying = downloading && ratio === 1;
  const percent = installing ? 100 : ratio === null ? null : Math.floor(ratio * 100);
  const step = installing ? 2 : verifying ? 1 : downloading ? 0 : -1;
  const releaseDate = formatReleaseDate(info.date);
  const notes = info.notes ? parseReleaseNotes(info.notes) : [];
  const eta =
    downloading && state.total !== null && state.bytesPerSecond && !verifying
      ? formatEta(Math.max(0, state.total - state.downloaded), state.bytesPerSecond)
      : null;

  useEffect(() => {
    if (!autoStart) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((autoStartDelayMs - (Date.now() - startedAt)) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [autoStart, autoStartDelayMs]);

  useEffect(() => {
    if (!canLeave) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onLater();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canLeave, onLater]);

  return (
    <div
      className={`launcher-update stage-${state.stage}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="launcher-update-title"
      style={{ "--update-countdown": `${autoStartDelayMs}ms` } as CSSProperties}
    >
      <header
        className="launcher-update__bar"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          onDragStart?.();
        }}
      >
        <span className="launcher-update__brand" aria-label="ScreenLauncher">
          <LauncherMark />
          <span className="launcher-update__wordmark">
            screen<span>launcher</span>
          </span>
        </span>
        <span className="launcher-update__kicker">
          {error ? tr("launcherUpdate.updateInterrupted") : tr("launcherUpdate.newVersion")}
        </span>
      </header>

      <main className="launcher-update__body">
        <div className="launcher-update__release">
          <span>SCREENLAUNCHER</span>
          <span className="launcher-update__version">{info.version}</span>
          {releaseDate && <span className="launcher-update__date">{releaseDate}</span>}
        </div>
        <div className="launcher-update__hero">
          <div className="launcher-update__intro">
            <h2 id="launcher-update-title" className="launcher-update__title">
              {error ? (
                <>
                  <Trans k="launcherUpdate.couldNotUpdate" values={{ br: <br /> }} />
                </>
              ) : installing ? (
                <>
                  {tr("launcherUpdate.justAMoment")}
                  <br />
                  {tr("launcherUpdate.almostReadyToGo")}
                </>
              ) : (
                <>
                  {tr("launcherUpdate.aLittleBetter")}
                  <br />
                  {tr("launcherUpdate.withEveryLaunch")}
                </>
              )}
            </h2>
            <p className="launcher-update__sub">
              {error
                ? tr("launcherUpdate.yourCurrentVersionIs")
                : installing
                  ? tr("launcherUpdate.theLauncherWillClose")
                  : state.stage === "available"
                    ? tr("launcherUpdate.aLauncherUpdateIs")
                    : tr("launcherUpdate.updatingTheLauncher")}
              <br />
              {tr("launcherUpdate.yourBuildsAndSettings")}
            </p>
          </div>
          {transferVisible && (
            <div className="launcher-update__percent" aria-hidden="true">
              <span>{percent ?? "—"}</span>
              {percent !== null && <small>%</small>}
            </div>
          )}
        </div>

        {transferVisible && (
          <div
            className={`launcher-update__progress${downloading && ratio === null ? " is-indeterminate" : ""}`}
          >
            <ProgressBar
              value={installing ? 100 : ratio === null ? null : ratio * 100}
              label={
                installing
                  ? tr("launcherUpdate.installingUpdate")
                  : verifying
                    ? tr("launcherUpdate.verifyingFileSignature")
                    : tr("launcherUpdate.downloadingUpdate")
              }
              valueLabel={
                installing
                  ? tr("launcherUpdate.restartingAutomatically")
                  : verifying
                    ? tr("launcherUpdate.almostReady")
                    : eta
                      ? `${tr("launcherUpdate.remaining")} ${eta}`
                      : ""
              }
              aria-label={
                installing
                  ? tr("launcherUpdate.installingUpdate2")
                  : tr("launcherUpdate.downloadingUpdate2")
              }
              aria-valuetext={
                installing
                  ? tr("launcherUpdate.installing")
                  : verifying
                    ? tr("launcherUpdate.verifyingSignature")
                    : percent === null
                      ? tr("launcherUpdate.downloadSizeIsUnknown")
                      : undefined
              }
              headerClassName="launcher-update__progress-head"
              trackClassName="launcher-update__track"
              fillClassName="launcher-update__fill"
              settings={{ height: 5, animationDuration: 250 }}
              style={
                {
                  gap: 0,
                  "--progress-screen-fill": "var(--u-accent)",
                  "--progress-screen-track": "var(--u-track)",
                } as CSSProperties
              }
            />
            <div className="launcher-update__meta">
              <span>
                {downloading
                  ? state.total !== null
                    ? tr("launcherUpdate.progressOf", {
                        downloaded: formatMegabytes(state.downloaded),
                        total: formatMegabytes(state.total),
                      })
                    : formatMegabytes(state.downloaded)
                  : tr("launcherUpdate.applyingTheNewVersion")}
              </span>
              <span>
                {downloading && state.bytesPerSecond && !verifying
                  ? formatSpeed(state.bytesPerSecond)
                  : ""}
              </span>
            </div>
          </div>
        )}

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
                {tr("launcherUpdate.updateNow")}
                {autoStart && <em>{secondsLeft}</em>}
              </span>
            </button>
            <button type="button" className="launcher-update__secondary" onClick={onLater}>
              {tr("launcherUpdate.later")}
            </button>
            {autoStart && (
              <span className="launcher-update__countdown-hint">
                {tr("launcherUpdate.autoStart", { seconds: secondsLeft })}
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="launcher-update__error">
            <p role="alert">{state.message}</p>
            <div className="launcher-update__actions">
              <button type="button" className="launcher-update__primary" onClick={onUpdate}>
                <span className="launcher-update__primary-label">
                  {tr("launcherUpdate.tryAgain")}
                </span>
              </button>
              <button type="button" className="launcher-update__secondary" onClick={onLater}>
                {tr("launcherUpdate.continueWithoutUpdating")}
              </button>
            </div>
          </div>
        )}

        {notes.length > 0 && (
          <section
            className="launcher-update__notes"
            aria-label={tr("launcherUpdate.releaseNotes")}
          >
            <button
              type="button"
              className="launcher-update__notes-toggle"
              aria-expanded={notesOpen}
              aria-controls="launcher-update-notes"
              onClick={() => setNotesOpen((open) => !open)}
            >
              <span className="launcher-update__notes-icon" aria-hidden="true">
                {notesOpen ? "−" : "+"}
              </span>
              {tr("launcherUpdate.whatsNew")}
            </button>
            <div
              id="launcher-update-notes"
              className="launcher-update__notes-body"
              hidden={!notesOpen}
            >
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

      <footer className="launcher-update__footer">
        <ol className="launcher-update__steps" aria-label={tr("launcherUpdate.updateSteps")}>
          {steps.map((label, index) => (
            <li
              key={label}
              className={index < step ? "is-done" : index === step ? "is-active" : undefined}
              aria-current={index === step ? "step" : undefined}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {label}
            </li>
          ))}
        </ol>
        <span className="launcher-update__version-change">
          {info.currentVersion} → {info.version}
        </span>
      </footer>
    </div>
  );
}
