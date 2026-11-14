import { useState } from "react";
import { useTranslation } from "../../../i18n/locale";
import type { MineflayerBotProfile, MineflayerBotStatus } from "../../../types";
import { TextField } from "../../inputs/TextField";
import { CustomScrollArea } from "../../layout/CustomScrollArea";
import { DEFAULT_BOT_ID } from "./botFleet";
import { parseFleetGroups, type FleetGroup } from "./fleetControl";
import "./MineflayerWorkflow.css";
import "./MineflayerFleetControl.css";

const GROUPS_KEY = "screen:mineflayer:fleet-groups";

export function MineflayerFleetControl({
  profiles,
  statuses,
  selectedIds,
  onSelectionChange,
  nameFor,
  disabled,
}: {
  profiles: MineflayerBotProfile[];
  statuses: MineflayerBotStatus[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  nameFor: (bot: MineflayerBotProfile) => string;
  disabled: boolean;
}) {
  const tr = useTranslation();
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [groups, setGroups] = useState<FleetGroup[]>(() => {
    try {
      return parseFleetGroups(localStorage.getItem(GROUPS_KEY));
    } catch {
      return [];
    }
  });
  const saveGroups = (next: FleetGroup[]) => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      setGroups(next);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };
  const shown = profiles.filter((bot) => nameFor(bot).toLowerCase().includes(search.toLowerCase()));
  return (
    <section className="mf-roster" aria-label={tr("bot.fleet.title")}>
      <header className="mf-roster-heading">
        <div>
          <span className="mf-workspace-eyebrow">{tr("bot.workspaceNew.team")}</span>
          <h2>
            {tr("bot.fleet.title")} <span>{profiles.length}</span>
          </h2>
        </div>
      </header>
      <TextField
        aria-label={tr("bot.workspaceNew.search")}
        placeholder={tr("bot.workspaceNew.search")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="mf-roster-selection-tools">
        <button
          type="button"
          className="mf-text-button"
          disabled={disabled}
          onClick={() => onSelectionChange(profiles.map((bot) => bot.id))}
        >
          {tr("bot.workspaceNew.selectAll")}
        </button>
        <button
          type="button"
          className="mf-text-button"
          disabled={disabled || !selectedIds.length}
          onClick={() => onSelectionChange([])}
        >
          {tr("bot.workspaceNew.clearSelection")}
        </button>
      </div>
      <CustomScrollArea
        className="mf-roster-scroll"
        tabIndex={0}
        aria-label={tr("bot.fleet.select")}
      >
        <div className="mf-roster-list">
          {shown.map((bot) => {
            const status = statuses.find((value) => (value.botId ?? DEFAULT_BOT_ID) === bot.id);
            const online = status?.running && status.state === "connected";
            const selected = selectedIds.includes(bot.id);
            const workflow = status?.inventory?.workflow;
            const phase = workflow?.phase;
            const activity = !online
              ? tr(status?.running ? "bot.main.connecting" : "bot.main.notConnected")
              : workflow && phase && !["idle", "complete", "stopped"].includes(phase)
                ? workflow.message
                : status?.gathering?.active || status?.gathering?.suspended
                  ? status.gathering.message
                  : status?.inventory?.production?.busy
                    ? status.inventory.production.message
                    : status?.inventory?.chaoticMovement
                      ? tr("bot.chaos.start")
                      : status?.inventory?.movementGoal && status.inventory.movementGoal !== "idle"
                        ? tr("bot.workspaceNew.moving")
                        : tr("bot.fleetControl.idle");
            return (
              <div key={bot.id} className={`mf-roster-bot${selected ? " is-selected" : ""}`}>
                <input
                  type="checkbox"
                  aria-label={tr("bot.fleetControl.selectBot", { name: nameFor(bot) })}
                  checked={selected}
                  disabled={disabled}
                  onChange={() =>
                    onSelectionChange(
                      selected
                        ? selectedIds.filter((id) => id !== bot.id)
                        : [...selectedIds, bot.id],
                    )
                  }
                />
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={selectedIds.length === 1 && selected}
                  aria-label={tr("bot.workspaceNew.selectOnly", { name: nameFor(bot) })}
                  onClick={() => onSelectionChange([bot.id])}
                >
                  <span className="mf-roster-bot-name">
                    <span
                      className={`mf-status-dot${online ? " is-online" : ""}`}
                      aria-hidden="true"
                    />
                    <strong>{nameFor(bot)}</strong>
                  </span>
                  <small title={activity}>{activity}</small>
                  {online && status.inventory && (
                    <small className="mf-roster-vitals">
                      {tr("bot.fleetControl.vitals", {
                        health: Math.round(status.inventory.health),
                        food: Math.round(status.inventory.food),
                      })}
                    </small>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        {!shown.length && <p className="mf-workspace-note">{tr("bot.workspaceNew.noMatches")}</p>}
      </CustomScrollArea>
      <p className="mf-workspace-note">{tr("bot.workspaceNew.selectionHelp")}</p>
      <details className="mf-sidebar-section">
        <summary>
          {tr("bot.fleetControl.groups")} <span>{groups.length}</span>
        </summary>
        <div className="mf-sidebar-section-body">
          {groups.map((group) => (
            <div key={group.id} className="mf-saved-group">
              <button
                type="button"
                className="mf-button"
                disabled={disabled}
                onClick={() =>
                  onSelectionChange(
                    group.botIds.filter((id) => profiles.some((bot) => bot.id === id)),
                  )
                }
              >
                {group.name}{" "}
                <span>
                  {group.botIds.filter((id) => profiles.some((bot) => bot.id === id)).length}
                </span>
              </button>
              <button
                type="button"
                className="mf-text-button"
                aria-label={tr("bot.fleetControl.deleteGroup", { name: group.name })}
                disabled={disabled}
                onClick={() => saveGroups(groups.filter((value) => value.id !== group.id))}
              >
                ×
              </button>
            </div>
          ))}
          <TextField
            aria-label={tr("bot.fleetControl.groupName")}
            placeholder={tr("bot.fleetControl.groupName")}
            value={groupName}
            maxLength={40}
            disabled={disabled}
            onChange={(event) => setGroupName(event.target.value)}
          />
          <button
            type="button"
            className="mf-button"
            disabled={disabled || !selectedIds.length || !groupName.trim() || groups.length >= 20}
            onClick={() => {
              saveGroups([
                ...groups,
                { id: crypto.randomUUID(), name: groupName.trim(), botIds: selectedIds },
              ]);
              setGroupName("");
            }}
          >
            {tr("bot.fleetControl.saveGroup")}
          </button>
          {storageError && (
            <p role="alert" className="mineflayer-bot-error">
              {tr("bot.workspaceNew.storageError")}
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
