import { useBotFleet } from "./BotFleetContext";
import { useTranslation } from "../../../i18n/locale";

export function MineflayerFleetProgress() {
  const fleet = useBotFleet();
  const tr = useTranslation();
  if (!fleet || fleet.recipients.length < 2) return null;
  return (
    <section className="mf-group-progress" aria-label={tr("bot.workspaceNew.groupProgress")}>
      <header>
        <strong>{tr("bot.workspaceNew.groupProgress")}</strong>
        <span>{tr("bot.workspaceNew.sameScenario")}</span>
      </header>
      <div>
        {fleet.recipients.map((bot) => {
          const status = fleet.statuses.find((value) => (value.botId ?? "default") === bot.id);
          const online = status?.running && status.state === "connected";
          const workflow = status?.inventory?.workflow;
          const completed = workflow?.steps.filter((step) => step.state === "complete").length ?? 0;
          return (
            <article
              key={bot.id}
              className={`mf-group-progress-bot${workflow?.phase === "error" ? " is-error" : ""}`}
            >
              <strong>
                <span className={`mf-status-dot${online ? " is-online" : ""}`} aria-hidden="true" />
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
    </section>
  );
}
