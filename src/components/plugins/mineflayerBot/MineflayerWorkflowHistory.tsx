import { useState } from "react";
import type { MineflayerWorkflowStep } from "../../../types";
import type { WorkflowHistoryEntry } from "./workflowHistory";
import { WORKFLOW_ACTIONS } from "./workflowDraft";
import { MineflayerActionIcon } from "./MineflayerActionIcon";

const states = { complete: "Выполнен", stopped: "Остановлен", error: "Прерван" };
function duration(entry: WorkflowHistoryEntry) {
  const seconds = Math.max(1, Math.round((entry.finishedAt - entry.startedAt) / 1000));
  return seconds < 60 ? `${seconds} сек.` : `${Math.floor(seconds / 60)} мин. ${seconds % 60} сек.`;
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
  const [view, setView] = useState<"complete" | "all">("complete");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const complete = entries.filter((entry) => entry.phase === "complete");
  const shown = view === "complete" ? complete : entries;
  return (
    <section className="mf-history" aria-label="История сценариев">
      <header className="mf-history-header">
        <h3 aria-live="polite">
          ЗАВЕРШЁННЫЕ СЦЕНАРИИ <span>{complete.length}</span>
        </h3>
        <div className="mf-history-filters" role="group" aria-label="Показать сценарии">
          <button
            type="button"
            aria-pressed={view === "complete"}
            onClick={() => setView("complete")}
          >
            Выполненные
          </button>
          <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}>
            Все запуски
          </button>
        </div>
      </header>
      {!shown.length ? (
        <p className="mf-history-empty">
          {view === "complete"
            ? "Выполненные сценарии появятся здесь — с шагами и временем работы."
            : "Здесь сохраняются результаты запусков сценариев."}
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
                      {states[entry.phase]} · {completed} / {entry.steps.length} шагов ·{" "}
                      {duration(entry)}
                    </span>
                  </span>
                  <time dateTime={new Date(entry.finishedAt).toISOString()}>
                    {new Date(entry.finishedAt).toLocaleString("ru-RU", {
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
                                ? "Выполнен"
                                : step.state === "error"
                                  ? "Ошибка"
                                  : step.state === "stopped"
                                    ? "Остановлен"
                                    : "Не выполнен"
                            }
                          >
                            {step.state === "complete" ? "✓" : index + 1}
                          </span>
                          <MineflayerActionIcon kind={step.kind} />
                          <span>
                            <strong>
                              {WORKFLOW_ACTIONS.find((action) => action.kind === step.kind)?.label}
                            </strong>
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
                        data-tooltip="Загрузить шаги в редактор сценария"
                      >
                        Повторить сценарий
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
