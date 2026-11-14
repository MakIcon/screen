import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLocale, useTranslation } from "../../../i18n/locale";
import type { MinecraftCatalog, MineflayerBotProfile, MineflayerBotStatus } from "../../../types";
import { toErrorDetails, toErrorMessage } from "../../../utils/errors";
import { TextField } from "../../inputs/TextField";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { SearchableSelect } from "../../inputs/SearchableSelect";
import { MinecraftSearchField } from "../../inputs/MinecraftSearchField";
import { CustomScrollArea } from "../../layout/CustomScrollArea";
import bundledCatalog from "../../../data/minecraftCatalog.json";
import { localizeCatalog } from "./catalogLocalization";
import { MineflayerFarmCropField } from "./MineflayerFarmCropField";
import { DEFAULT_BOT_ID } from "./botFleet";
import {
  dispatchFleetRequests,
  fleetRecipients,
  fleetTaskCommand,
  fleetTaskCounts,
  parseFleetGroups,
  type FleetGroup,
  type FleetReceipt,
  type FleetRequest,
  type FleetScope,
  type FleetTask,
} from "./fleetControl";
import "./MineflayerWorkflow.css";
import "./MineflayerFleetControl.css";

const GROUPS_KEY = "screen:mineflayer:fleet-groups";
const TASKS: FleetTask[] = ["mine", "forest", "farm", "collect", "craft", "smelt", "goto"];
const commandRequest = (message: string): FleetRequest => ({
  command: "send_mineflayer_bot_chat",
  args: { message, command: true },
});

type Props = {
  profiles: MineflayerBotProfile[];
  statuses: MineflayerBotStatus[];
  activeId: string;
  onInspect: (id: string) => void;
  nameFor: (bot: MineflayerBotProfile) => string;
  refresh: () => Promise<unknown>;
  disabled: boolean;
};

export function MineflayerFleetControl({
  profiles,
  statuses,
  activeId,
  onInspect,
  nameFor,
  refresh,
  disabled,
}: Props) {
  const tr = useTranslation();
  const locale = useLocale();
  const [scope, setScope] = useState<FleetScope>("active");
  const [selection, setSelection] = useState<string[]>([]);
  const [groups, setGroups] = useState<FleetGroup[]>(() => {
    try {
      return parseFleetGroups(localStorage.getItem(GROUPS_KEY));
    } catch {
      return [];
    }
  });
  const [groupName, setGroupName] = useState("");
  const [task, setTask] = useState<FleetTask>("mine");
  const [item, setItem] = useState("stone");
  const [crop, setCrop] = useState("wheat");
  const [count, setCount] = useState(64);
  const [radius, setRadius] = useState(32);
  const [coordinates, setCoordinates] = useState("");
  const [split, setSplit] = useState(false);
  const [message, setMessage] = useState("");
  const [messageMode, setMessageMode] = useState("command");
  const [history, setHistory] = useState<Array<{ message: string; mode: string }>>([]);
  const [receipts, setReceipts] = useState<FleetReceipt[]>([]);
  const [lastAction, setLastAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const currentRun = useRef<{ cancelled: boolean } | null>(null);
  const stopPending = useRef(false);
  useEffect(
    () => () => {
      if (currentRun.current) currentRun.current.cancelled = true;
    },
    [],
  );
  useEffect(() => {
    if (disabled && currentRun.current) currentRun.current.cancelled = true;
  }, [disabled]);
  // The catalog's localized group names must refresh when the interface language changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const catalog = useMemo(() => localizeCatalog(bundledCatalog as MinecraftCatalog), [locale]);
  const statusFor = (id: string) => statuses.find((bot) => (bot.botId ?? DEFAULT_BOT_ID) === id);
  const recipients = fleetRecipients(profiles, statuses, scope, activeId, selection);
  const connected = recipients.filter((bot) => {
    const status = statusFor(bot.id);
    return status?.running && status.state === "connected";
  });
  const locked = disabled || busy || stopping;
  const canSend = connected.length > 0 && !locked;
  const counted = !["goto", "collect"].includes(task);
  const counts = fleetTaskCounts(count, connected.length, split && counted);
  const preview = fleetTaskCommand(task, task === "farm" ? crop : item, count, radius, coordinates);
  const ready = canSend && preview !== null;
  const toggleBot = (id: string) => {
    const previous = scope === "selected" ? selection : recipients.map((bot) => bot.id);
    setSelection(
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id],
    );
    setScope("selected");
  };

  const saveGroups = (next: FleetGroup[]) => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      setGroups(next);
      setError("");
    } catch (cause) {
      setError(toErrorMessage(cause));
    }
  };

  async function send(
    label: string,
    requests: (bot: MineflayerBotProfile, onlineIndex: number) => FleetRequest[],
    emergency = false,
  ) {
    if (disabled || stopPending.current || (!emergency && currentRun.current)) return;
    if (!connected.length) return;
    if (emergency) {
      if (currentRun.current) currentRun.current.cancelled = true;
      stopPending.current = true;
      setStopping(true);
    }
    const run = { cancelled: false };
    currentRun.current = run;
    setBusy(true);
    setError("");
    setLastAction(label);
    setReceipts([]);
    let onlineIndex = 0;
    const jobs = recipients.flatMap((bot) => {
      const offline = !connected.some((online) => online.id === bot.id);
      const planned = requests(bot, offline ? -1 : onlineIndex++);
      return !offline && !planned.length
        ? []
        : [{ botId: bot.id, name: nameFor(bot), requests: planned, offline }];
    });
    try {
      await dispatchFleetRequests(jobs, invoke, {
        cancelled: () => run.cancelled,
        offlineMessage: tr("bot.fleetControl.offline"),
        errorMessage: (cause) => {
          const message = toErrorMessage(cause);
          const detail = toErrorDetails(cause);
          return detail && detail !== message ? `${message}: ${detail}` : message;
        },
        onReceipt: (receipt) => {
          if (currentRun.current === run) setReceipts((previous) => [...previous, receipt]);
        },
      });
      await refresh();
    } catch (cause) {
      if (currentRun.current === run) setError(toErrorMessage(cause));
    } finally {
      if (currentRun.current === run) {
        currentRun.current = null;
        setBusy(false);
      }
      if (emergency) {
        stopPending.current = false;
        setStopping(false);
      }
    }
  }

  const sendTask = () => {
    if (!ready) return;
    void send(tr(`bot.fleetControl.task.${task}`), (bot, index) => {
      const amount = counted ? counts[index] : count;
      if (index >= 0 && amount === 0) return [];
      const value = fleetTaskCommand(
        task,
        task === "farm" ? crop : item,
        amount ?? count,
        radius,
        coordinates,
      );
      if (!value) return [];
      const settings = bot.settings.gathering;
      const preparation: FleetRequest[] = ["mine", "forest", "farm", "collect"].includes(task)
        ? [
            {
              command: "configure_mineflayer_bot_storage",
              args: { groups: settings.storageGroups },
            },
            commandRequest(
              `work defense ${settings.defendMobs ? "on" : "off"} ${settings.defendPlayers ? "on" : "off"} ${settings.defendArrows ? "on" : "off"}`,
            ),
          ]
        : [];
      if (task === "mine")
        preparation.push(
          commandRequest(
            `work tunnels ${settings.tunnelWidth} ${settings.tunnelHeight} ${settings.stairWidth} ${settings.stairHeight} ${settings.placeTorches ? "on" : "off"} ${settings.torchInterval}`,
          ),
        );
      return [...preparation, commandRequest(value)];
    });
  };

  const quickAction = (action: "come" | "follow" | "deliver" | "pause" | "resume" | "stop") => {
    void send(
      tr(`bot.fleetControl.action.${action}`),
      (bot) => {
        if (["pause", "resume"].includes(action)) {
          const phase = statusFor(bot.id)?.inventory?.workflow?.phase;
          if (phase && ["starting", "running", "pausing", "paused"].includes(phase))
            return [{ command: "control_mineflayer_bot_workflow", args: { action } }];
          return [commandRequest(`work ${action}`)];
        }
        return [commandRequest(action)];
      },
      action === "stop",
    );
  };

  const sendMessage = () => {
    const value = message.trim();
    if (!value || !canSend) return;
    setHistory((previous) =>
      [
        { message: value, mode: messageMode },
        ...previous.filter((entry) => entry.message !== value || entry.mode !== messageMode),
      ].slice(0, 8),
    );
    void send(value, () => [
      {
        command: "send_mineflayer_bot_chat",
        args: { message: value, command: messageMode === "command" },
      },
    ]);
  };

  return (
    <div className="mf-fleet-control">
      <div className="mf-fleet-control-heading">
        <strong>{tr("bot.fleetControl.title")}</strong>
        <div
          className="mf-fleet-scopes"
          role="group"
          aria-label={tr("bot.fleetControl.recipients")}
        >
          {(["active", "selected", "all"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className="mf-button"
              aria-pressed={scope === value}
              disabled={locked}
              onClick={() => setScope(value)}
            >
              {tr(`bot.fleetControl.scope.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <CustomScrollArea
        className="mf-fleet-roster"
        aria-label={tr("bot.fleet.select")}
        tabIndex={0}
      >
        <div className="mf-fleet-roster-grid">
          {profiles.map((bot) => {
            const status = statusFor(bot.id);
            const online = status?.running && status.state === "connected";
            const workflow = status?.inventory?.workflow;
            const activity = !online
              ? tr(status?.running ? "bot.main.connecting" : "bot.main.notConnected")
              : workflow &&
                  ["starting", "running", "pausing", "paused", "stopping", "error"].includes(
                    workflow.phase,
                  )
                ? workflow.message
                : status?.gathering?.active || status?.gathering?.suspended
                  ? status.gathering.message
                  : status?.inventory?.production?.busy
                    ? status.inventory.production.message
                    : status?.inventory?.chaoticMovement
                      ? tr("bot.chaos.start")
                      : status?.inventory?.movementGoal && status.inventory.movementGoal !== "idle"
                        ? tr(
                            status.inventory.movementGoal.startsWith("follow ")
                              ? "bot.fleetControl.following"
                              : "bot.fleetControl.moving",
                            { goal: status.inventory.movementGoal },
                          )
                        : tr("bot.fleetControl.idle");
            return (
              <div
                key={bot.id}
                className={`mf-fleet-bot${activeId === bot.id ? " is-active" : ""}${recipients.some((target) => target.id === bot.id) ? " is-recipient" : ""}`}
              >
                <input
                  type="checkbox"
                  aria-label={tr("bot.fleetControl.selectBot", { name: nameFor(bot) })}
                  checked={recipients.some((target) => target.id === bot.id)}
                  disabled={locked}
                  onChange={() => toggleBot(bot.id)}
                />
                <button
                  type="button"
                  className="mf-fleet-inspect"
                  aria-label={tr("bot.fleetControl.openBot", { name: nameFor(bot) })}
                  disabled={locked}
                  aria-pressed={activeId === bot.id}
                  title={tr("bot.fleetControl.inspect")}
                  onClick={() => onInspect(bot.id)}
                >
                  <strong>
                    <span
                      className={`mf-bot-connection-dot${online ? " is-online" : ""}`}
                      aria-hidden="true"
                    />
                    {nameFor(bot)}
                  </strong>
                  <small title={activity}>{activity}</small>
                  {online && status?.inventory && (
                    <small>
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
      </CustomScrollArea>
      <div className="mf-fleet-target-summary" role="status">
        <strong>
          {tr("bot.fleetControl.targetCount", {
            selected: recipients.length,
            connected: connected.length,
          })}
        </strong>
        <span>{recipients.map(nameFor).join(", ") || tr("bot.fleetControl.empty")}</span>
      </div>
      <details className="mf-fleet-groups">
        <summary>{tr("bot.fleetControl.groups")}</summary>
        <div className="mf-fleet-group-save">
          <TextField
            aria-label={tr("bot.fleetControl.groupName")}
            placeholder={tr("bot.fleetControl.groupName")}
            maxLength={40}
            value={groupName}
            disabled={locked}
            onChange={(event) => setGroupName(event.target.value)}
          />
          <button
            type="button"
            className="mf-button"
            disabled={locked || !groupName.trim() || !recipients.length || groups.length >= 20}
            onClick={() => {
              saveGroups([
                ...groups,
                {
                  id: crypto.randomUUID(),
                  name: groupName.trim(),
                  botIds: recipients.map((bot) => bot.id),
                },
              ]);
              setGroupName("");
            }}
          >
            {tr("bot.fleetControl.saveGroup")}
          </button>
        </div>
        <div className="mf-fleet-group-list">
          {groups.map((group) => (
            <div key={group.id}>
              <button
                type="button"
                className="mf-button"
                disabled={locked}
                onClick={() => {
                  setSelection(group.botIds);
                  setScope("selected");
                }}
              >
                {group.name} ·{" "}
                {group.botIds.filter((id) => profiles.some((bot) => bot.id === id)).length}
              </button>
              <button
                type="button"
                className="mf-button"
                disabled={locked}
                aria-label={tr("bot.fleetControl.deleteGroup", { name: group.name })}
                onClick={() => saveGroups(groups.filter((value) => value.id !== group.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </details>
      <div
        className="mf-fleet-quick-actions"
        role="group"
        aria-label={tr("bot.fleetControl.quickActions")}
      >
        {(["come", "follow", "deliver", "pause", "resume", "stop"] as const).map((action) => (
          <button
            key={action}
            type="button"
            className={`mf-button${action === "stop" ? " mf-fleet-stop-task" : ""}`}
            disabled={action === "stop" ? disabled || stopping || !connected.length : !canSend}
            onClick={() => quickAction(action)}
          >
            {tr(`bot.fleetControl.action.${action}`)}
          </button>
        ))}
      </div>
      <form
        className="mf-fleet-task-form"
        onSubmit={(event) => {
          event.preventDefault();
          sendTask();
        }}
      >
        <fieldset className="mf-fleet-task-fields" disabled={locked}>
          <label className="mineflayer-bot-field">
            <span>{tr("bot.fleetControl.taskLabel")}</span>
            <SearchableSelect
              label={tr("bot.fleetControl.taskLabel")}
              value={task}
              variant="field"
              allowEmpty={false}
              disabled={locked}
              onChange={(value) => {
                setTask(value as FleetTask);
                if (value === "craft") setItem("stone_pickaxe");
                if (value === "smelt") setItem("raw_iron");
                if (value === "mine") setItem("stone");
              }}
              options={TASKS.map((value) => ({
                value,
                label: tr(`bot.fleetControl.task.${value}`),
              }))}
            />
          </label>
          {task === "goto" ? (
            <label className="mineflayer-bot-field mf-fleet-coordinate">
              <span>{tr("bot.fleetControl.coordinates")}</span>
              <TextField
                value={coordinates}
                placeholder="100 64 -200"
                aria-label={tr("bot.fleetControl.coordinates")}
                onChange={(event) => setCoordinates(event.target.value)}
              />
            </label>
          ) : (
            <>
              {task === "farm" ? (
                <MineflayerFarmCropField value={crop} onChange={setCrop} />
              ) : (
                ["mine", "craft", "smelt"].includes(task) && (
                  <MinecraftSearchField
                    label={tr("bot.fleetControl.item")}
                    value={item}
                    onChange={setItem}
                    catalog={catalog}
                    scope={task === "mine" ? "blocks" : "items"}
                    disabled={locked}
                  />
                )
              )}
              {counted && (
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.fleetControl.count")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.fleetControl.count")}
                    value={count}
                    min={1}
                    max={1000000}
                    onChange={setCount}
                  />
                </label>
              )}
              {!["craft", "smelt"].includes(task) && (
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.fleetControl.radius")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.fleetControl.radius")}
                    value={radius}
                    min={4}
                    max={64}
                    onChange={setRadius}
                  />
                </label>
              )}
            </>
          )}
        </fieldset>
        {counted && (
          <label className="mf-fleet-split">
            <input
              type="checkbox"
              checked={split}
              disabled={locked}
              onChange={(event) => setSplit(event.target.checked)}
            />
            {tr("bot.fleetControl.split")}
          </label>
        )}
        {counted && (
          <p className="mf-fleet-control-note">
            {tr(split ? "bot.fleetControl.splitHint" : "bot.fleetControl.eachHint", {
              count,
              bots: counts.filter((value) => value > 0).length,
            })}
          </p>
        )}
        <button type="submit" className="mf-button mf-button--primary" disabled={!ready}>
          {tr(busy ? "bot.main.sending" : "bot.fleetControl.assign")}
        </button>
      </form>
      <form
        className="mf-fleet-message-form"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <SearchableSelect
          label={tr("bot.fleetControl.messageMode")}
          value={messageMode}
          onChange={setMessageMode}
          disabled={locked}
          allowEmpty={false}
          variant="field"
          options={[
            { value: "command", label: tr("bot.fleetControl.command") },
            { value: "chat", label: tr("bot.fleetControl.chat") },
          ]}
        />
        <TextField
          aria-label={tr("bot.fleetControl.message")}
          placeholder={tr(
            messageMode === "command"
              ? "bot.fleetControl.commandPlaceholder"
              : "bot.fleetControl.chatPlaceholder",
          )}
          value={message}
          maxLength={240}
          disabled={locked}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
        />
        <button type="submit" className="mf-button" disabled={!canSend || !message.trim()}>
          {tr("bot.main.send")}
        </button>
      </form>
      <p className="mf-fleet-control-note">
        {tr(
          messageMode === "command" ? "bot.fleetControl.commandHint" : "bot.fleetControl.chatHint",
        )}
      </p>
      {history.length > 0 && (
        <div className="mf-fleet-command-history" aria-label={tr("bot.fleetControl.history")}>
          {history.map((entry) => (
            <button
              type="button"
              key={`${entry.mode}:${entry.message}`}
              className="mf-button"
              disabled={locked}
              title={tr("bot.fleetControl.reuse")}
              onClick={() => {
                setMessage(entry.message);
                setMessageMode(entry.mode);
              }}
            >
              {tr(entry.mode === "command" ? "bot.fleetControl.command" : "bot.fleetControl.chat")}{" "}
              · {entry.message}
            </button>
          ))}
        </div>
      )}
      <p className="mf-fleet-control-note">
        {tr("bot.fleetControl.gameHint", {
          example: `${profiles.find((bot) => bot.id === activeId)?.settings.commandPrefix || "!"}@${statusFor(activeId)?.botUsername || nameFor(profiles.find((bot) => bot.id === activeId) || profiles[0])} mine stone 64`,
        })}
      </p>
      {(busy || receipts.length > 0) && (
        <div className="mf-fleet-receipts" aria-live="polite" aria-atomic="true">
          <strong>
            {lastAction} ·{" "}
            {tr("bot.fleetControl.results", {
              accepted: receipts.filter((value) => value.state === "accepted").length,
              failed: receipts.filter((value) => value.state === "error").length,
            })}
          </strong>
          <p className="mf-fleet-control-note">{tr("bot.fleetControl.acceptedHint")}</p>
          <CustomScrollArea className="mf-fleet-receipt-scroll" tabIndex={0}>
            <ul>
              {receipts.map((receipt) => (
                <li key={receipt.botId} className={`is-${receipt.state}`}>
                  <strong>{receipt.name}</strong>
                  <span>{receipt.error || tr(`bot.fleetControl.receipt.${receipt.state}`)}</span>
                </li>
              ))}
            </ul>
          </CustomScrollArea>
        </div>
      )}
      {error && (
        <p className="mineflayer-bot-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
