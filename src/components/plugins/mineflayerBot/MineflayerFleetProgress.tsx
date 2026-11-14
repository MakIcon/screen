import { useBotFleet } from "./BotFleetContext";
import { useTranslation } from "../../../i18n/locale";
import { CustomScrollArea } from "../../layout/CustomScrollArea";

export function MineflayerFleetProgress() {
  const fleet = useBotFleet();
  const tr = useTranslation();
  if (!fleet || fleet.recipients.length < 2) return null;
  return (
    <details className="mf-group-progress">
      <summary>
        <strong>
          {tr("bot.workspaceNew.groupProgress")}{" "}
          <span className="mf-group-progress-count">{fleet.recipients.length}</span>
        </strong>
        <span className="mf-group-progress-toggle">
          <span className="mf-group-progress-show">{tr("bot.workspaceNew.showProgress")}</span>
          <span className="mf-group-progress-hide">{tr("bot.workflowPresets.collapse")}</span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
      </summary>
      <CustomScrollArea
        className="mf-group-progress-scroll"
        tabIndex={0}
        aria-label={tr("bot.workspaceNew.groupProgress")}
      >
        <div className="mf-group-progress-grid">
          {fleet.recipients.map((bot) => {
            const status = fleet.statuses.find((value) => (value.botId ?? "default") === bot.id);
            const online = status?.running && status.state === "connected";
            const workflow = status?.inventory?.workflow;
            const completed =
              workflow?.steps.filter((step) => step.state === "complete").length ?? 0;
            return (
              <article
                key={bot.id}
                className={`mf-group-progress-bot${workflow?.phase === "error" ? " is-error" : ""}`}
              >
                <strong>
                  <span
                    className={`mf-status-dot${online ? " is-online" : ""}`}
                    aria-hidden="true"
                  />
                  {fleet.nameFor(bot)}
                </strong>
                <span>
                  {!online
                    ? tr("bot.main.notConnected")
                    : workflow && workflow.phase !== "idle"
                      ? workflow.message
                      : tr("bot.fleetControl.idle")}
                </span>
                {online && workflow && workflow.steps.length > 0 && (
                  <>
                    <progress
                      value={completed}
                      max={workflow.steps.length}
                      aria-label={tr("bot.workflow.completedSteps")}
                    />
                    <small>
                      {completed} / {workflow.steps.length}
                    </small>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </CustomScrollArea>
    </details>
  );
}
