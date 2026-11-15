import { useState } from "react";
import { useTranslation } from "../../../i18n/locale";
import { ElementToggle } from "../../inputs/ElementToggle";
import { TextField } from "../../inputs/TextField";
import { CustomScrollArea } from "../../layout/CustomScrollArea";
import { useBotFleet } from "./BotFleetContext";
import { fleetOverview } from "./fleetOverview";
import "./MineflayerBotsOverview.css";

export function MineflayerBotsOverview() {
  const fleet = useBotFleet();
  const tr = useTranslation();
  const [scope, setScope] = useState("all");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  if (!fleet) return null;
  const summary = fleetOverview(
    scope === "all" ? fleet.profiles : fleet.recipients,
    fleet.statuses,
  );
  const number = (value: number) => value.toLocaleString();
  const visible = summary.bots.filter(
    (bot) =>
      filter === "all" ||
      (filter === "complete"
        ? bot.phase === "complete"
        : filter === "error"
          ? bot.phase === "error"
          : filter === "offline"
            ? !bot.online
            : bot.online && ["starting", "running", "pausing", "stopping"].includes(bot.phase)),
  );
  const items = summary.items.filter((item) =>
    `${item.displayName} ${item.name}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <section className="mf-bots-overview" aria-label={tr("bot.workspace.bots")}>
      <header className="mf-bots-heading">
        <div>
          <h3>{tr("bot.overview.title")}</h3>
          <p>{tr("bot.overview.hint")}</p>
        </div>
        <div className="mf-bots-scope" role="group" aria-label={tr("bot.overview.scope")}>
          {(["all", "selected"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className="mf-button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
            >
              {tr(`bot.overview.scope.${value}`)}
            </button>
          ))}
        </div>
      </header>
      <div className="mf-bots-metrics">
        {(
          [
            ["online", summary.online],
            ["complete", summary.complete],
            ["running", summary.running],
            ["error", summary.errors],
          ] as const
        ).map(([key, value]) => (
          <article key={key} className={`mf-bots-metric is-${key}`}>
            <span>{tr(`bot.overview.${key}`)}</span>
            <strong>
              {number(value)}
              <small> / {summary.bots.length}</small>
            </strong>
          </article>
        ))}
      </div>
      <div className="mf-bots-traffic">
        <ElementToggle
          size="small"
          title={tr("bot.workspaceNew.crowdAvoidance")}
          note={tr("bot.workspaceNew.crowdAvoidanceHint")}
          enabled={fleet.crowdAvoidance}
          onToggle={() => fleet.setCrowdAvoidance(!fleet.crowdAvoidance)}
        />
      </div>
      <div className="mf-bots-columns">
        <section className="mf-bots-panel">
          <h4>{tr("bot.overview.scenarios")}</h4>
          <div className="mf-bots-filters" role="group" aria-label={tr("bot.overview.filter")}>
            {(["all", "running", "complete", "error", "offline"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {tr(`bot.overview.filter.${value}`)}
              </button>
            ))}
          </div>
          <CustomScrollArea
            className="mf-bots-scroll"
            tabIndex={0}
            aria-label={tr("bot.overview.scenarios")}
          >
            <div className="mf-bots-rows">
              {visible.map((bot) => (
                <article key={bot.profile.id} className={`mf-bots-row is-${bot.phase}`}>
                  <div className="mf-bots-row-title">
                    <strong>
                      <i
                        className={`mf-status-dot${bot.online ? " is-online" : ""}`}
                        aria-hidden="true"
                      />
                      {fleet.nameFor(bot.profile)}
                    </strong>
                    <span>
                      {tr(bot.online ? `bot.overview.phase.${bot.phase}` : "bot.main.notConnected")}
                    </span>
                  </div>
                  <span className="mf-bots-scenario-name">
                    {bot.workflow?.name || tr("bot.overview.noScenario")}
                  </span>
                  {!!bot.workflow?.steps.length && (
                    <div className="mf-bots-progress">
                      <progress
                        value={bot.completed}
                        max={bot.workflow.steps.length}
                        aria-label={tr("bot.workflow.completedSteps")}
                      />
                      <small>
                        {bot.completed} / {bot.workflow.steps.length}
                      </small>
                    </div>
                  )}
                  {(bot.workflow?.message || bot.status?.lastError) && (
                    <p>{bot.status?.lastError || bot.workflow?.message}</p>
                  )}
                </article>
              ))}
              {!visible.length && <p className="mf-bots-empty">{tr("bot.overview.noBots")}</p>}
            </div>
          </CustomScrollArea>
        </section>
        <section className="mf-bots-panel">
          <div className="mf-bots-inventory-heading">
            <h4>{tr("bot.overview.inventory")}</h4>
            <strong>
              {number(summary.items.reduce((sum, item) => sum + item.count, 0))}
              <small> {tr("bot.overview.items")}</small>
            </strong>
          </div>
          <p className="mf-bots-inventory-note">
            {tr("bot.overview.inventoryHint", { count: summary.reporting, total: summary.online })}
          </p>
          <TextField
            aria-label={tr("bot.overview.searchItems")}
            placeholder={tr("bot.overview.searchItems")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <CustomScrollArea
            className="mf-bots-scroll"
            tabIndex={0}
            aria-label={tr("bot.overview.inventory")}
          >
            <div className="mf-bots-items">
              {items.map((item) => (
                <article key={item.name} className="mf-bots-item">
                  <img src={item.texture} alt="" loading="lazy" />
                  <div>
                    <strong>{item.displayName}</strong>
                    <small>{tr("bot.overview.heldBy", { count: item.bots })}</small>
                  </div>
                  <b>{number(item.count)}</b>
                </article>
              ))}
              {!items.length && (
                <p className="mf-bots-empty">
                  {tr(query ? "bot.overview.noItemsFound" : "bot.overview.noItems")}
                </p>
              )}
            </div>
          </CustomScrollArea>
        </section>
      </div>
    </section>
  );
}
