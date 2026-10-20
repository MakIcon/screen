import { useState } from "react";
import type { MineflayerWorkflowStep } from "../../../types";
import type { WorkflowHistoryEntry } from "./workflowHistory";
import { workflowActionLabel } from "./workflowDraft";
import { translate, useLocale, useTranslation, intlLocale } from "../../../i18n/locale";
import { MineflayerActionIcon } from "./MineflayerActionIcon";

const stateLabel = (phase: "complete" | "stopped" | "error") =>
  ({
    complete: translate("bot.workflowHistory.completed"),
    stopped: translate("bot.workflowHistory.stopped"),
    error: translate("bot.workflowHistory.interrupted"),
  })[phase];
function duration(entry: WorkflowHistoryEntry) {
  const seconds = Math.max(1, Math.round((entry.finishedAt - entry.startedAt) / 1000));
  return seconds < 60
    ? translate("duration.seconds", { seconds })
    : translate("duration.minutesSeconds", {
        minutes: Math.floor(seconds / 60),
        seconds: seconds % 60,
      });
}

export function MineflayerWorkflowHistory({
  entries,
  locked,
  detail,
  onRepeat,
}: {
  entries: WorkflowHistoryEntry[];
  locked: boolean;
  detail: (step: MineflayerWorkflowStep) => string;
  onRepeat: (entry: WorkflowHistoryEntry) => void;
}) {
  const locale = useLocale();
  const tr = useTranslation();
  const [view, setView] = useState<"complete" | "all">("complete");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const complete = entries.filter((entry) => entry.phase === "complete");
  const shown = view === "complete" ? complete : entries;
  return (
    <section className="mf-history" aria-label={tr("bot.workflowHistory.workflowHistory")}>
      <header className="mf-history-header">
        <h3 aria-live="polite">
          {tr("bot.workflowHistory.completedWorkflows")} <span>{complete.length}</span>
        </h3>
        <div
          className="mf-history-filters"
          role="group"
          aria-label={tr("bot.workflowHistory.showWorkflows")}
        >
          <button
            type="button"
            aria-pressed={view === "complete"}
            onClick={() => setView("complete")}
          >
            {tr("bot.workflowHistory.completed2")}
          </button>
          <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}>
            {tr("bot.workflowHistory.allRuns")}
          </button>
        </div>
      </header>
      {!shown.length ? (
        <p className="mf-history-empty">
          {view === "complete"
            ? tr("bot.workflowHistory.completedWorkflowsWillAppear")
            : tr("bot.workflowHistory.workflowRunResultsAre")}
        </p>
      ) : (
        <div className="mf-history-list">
          {shown.map((entry) => {
            const completed = entry.steps.filter((step) => step.state === "complete").length;
            return (
              <details
                className={`mf-history-entry is-${entry.phase}`}
                key={entry.id}
                onToggle={(event) => {
                  const open = event.currentTarget.open;
                  setExpanded((previous) => {
                    if (previous.has(entry.id) === open) return previous;
                    const next = new Set(previous);
                    if (open) next.add(entry.id);
                    else next.delete(entry.id);
                    return next;
                  });
                }}
              >
                <summary>
                  <span className="mf-history-result" aria-hidden="true">
                    {entry.phase === "complete" ? "✓" : entry.phase === "stopped" ? "−" : "!"}
                  </span>
                  <span className="mf-history-copy">
                    <strong>{entry.name}</strong>
                    <span>
                      {stateLabel(entry.phase)} ·{" "}
                      {tr("bot.workflowHistory.progress", { completed, count: entry.steps.length })}{" "}
                      · {duration(entry)}
                    </span>
                  </span>
                  <time dateTime={new Date(entry.finishedAt).toISOString()}>
                    {new Date(entry.finishedAt).toLocaleString(intlLocale(locale), {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <svg
                    className="mf-history-chevron"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </summary>
                {expanded.has(entry.id) && (
                  <div className="mf-history-details">
                    <ol>
                      {entry.steps.map((step, index) => (
                        <li key={index}>
                          <span
                            className={`mf-history-step-state is-${step.state}`}
                            aria-label={
                              step.state === "complete"
                                ? tr("bot.workflowHistory.completed")
                                : step.state === "error"
                                  ? tr("bot.workflowHistory.error")
                                  : step.state === "stopped"
                                    ? tr("bot.workflowHistory.stopped")
                                    : tr("bot.workflowHistory.notRun")
                            }
                          >
                            {step.state === "complete" ? "✓" : index + 1}
                          </span>
                          <MineflayerActionIcon kind={step.kind} />
                          <span>
                            <strong>{workflowActionLabel(step.kind, tr)}</strong>
                            <small>{detail(step)}</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                    {entry.phase !== "complete" && (
                      <p className="mf-history-message">{entry.message}</p>
                    )}
                    <footer>
                      <span>{entry.server}</span>
                      <button
                        type="button"
                        className="mf-button"
                        disabled={locked}
                        onClick={() => onRepeat(entry)}
                        data-tooltip={tr("bot.workflowHistory.loadTheStepsInto")}
                      >
                        {tr("bot.workflowHistory.repeatWorkflow")}
                      </button>
                    </footer>
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
