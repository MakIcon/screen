import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../../../i18n/locale";
import { RuntimeMonitorScope, useRuntimeMonitor } from "../../../hooks/useRuntimeMonitor";
import type {
  MineflayerBotPluginSettings,
  MineflayerBotProfile,
  MineflayerBotStatus,
} from "../../../types";
import type { PluginSettingsProps } from "../pluginTypes";
import { normalizeMineflayerBotSettings } from "../pluginSettings";
import { flushPluginSettings } from "../pluginSettingsSync";
import { MineflayerBotCreator } from "./MineflayerBotCreator";
import { MineflayerFleetControl } from "./MineflayerFleetControl";
import { toErrorDetails, toErrorMessage } from "../../../utils/errors";
import { BotSessionContext } from "./BotSessionContext";
import { BotFleetContext } from "./BotFleetContext";
import { botConfiguration, createBotProfiles, DEFAULT_BOT_ID } from "./botFleet";
import {
  dispatchFleetRequests,
  workflowIsRunning,
  type FleetReceipt,
  type FleetRequest,
} from "./fleetControl";

type Props = PluginSettingsProps & {
  renderEditor: (
    settings: MineflayerBotPluginSettings,
    onChange: (next: MineflayerBotPluginSettings) => void,
  ) => ReactNode;
};
const commandRequest = (message: string): FleetRequest => ({
  command: "send_mineflayer_bot_chat",
  args: { message, command: true },
});
const diagnostic = (cause: unknown) => {
  const message = toErrorMessage(cause),
    detail = toErrorDetails(cause);
  return detail && detail !== message ? `${message}: ${detail}` : message;
};

export function MineflayerBotFleet({ plugins, onChange, context, renderEditor }: Props) {
  const tr = useTranslation();
  const monitor = useRuntimeMonitor();
  const root = plugins.mineflayerBot;
  const [selection, setSelection] = useState<string[]>([DEFAULT_BOT_ID]);
  const [focusId, setFocusId] = useState(DEFAULT_BOT_ID);
  const [count, setCount] = useState(1),
    [prefix, setPrefix] = useState("SCREEN_BOT");
  const [lifecycle, setLifecycle] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [receipts, setReceipts] = useState<FleetReceipt[]>([]);
  const [lastAction, setLastAction] = useState("");
  const [error, setError] = useState("");
  const lifecycleRef = useRef("");
  const cancelledStartup = useRef(false);
  const startupGeneration = useRef(0);
  const currentRun = useRef<{ cancelled: boolean } | null>(null);
  useEffect(
    () => () => {
      cancelledStartup.current = true;
      if (currentRun.current) currentRun.current.cancelled = true;
      currentRun.current = null;
    },
    [],
  );
  const profiles = [{ id: DEFAULT_BOT_ID, settings: botConfiguration(root) }, ...root.bots];
  const recipients = profiles.filter((bot) => selection.includes(bot.id));
  const active = recipients.find((bot) => bot.id === focusId) ?? recipients[0] ?? profiles[0];
  const statuses =
    monitor.snapshot?.mineflayerBots ?? (monitor.snapshot ? [monitor.snapshot.mineflayerBot] : []);
  const statusFor = (id: string) =>
    statuses.find((status) => (status.botId ?? DEFAULT_BOT_ID) === id);
  const activeStatus: MineflayerBotStatus = statusFor(active.id) ?? {
    botId: active.id,
    revision: 0,
    running: false,
    state: "idle",
    logs: [],
  };
  const online = recipients.filter(
    (bot) => statusFor(bot.id)?.running && statusFor(bot.id)?.state === "connected",
  );
  const packageReady = Boolean(
    monitor.snapshot?.optionalExtensions.find((item) => item.id === "mineflayer-bot")?.installed,
  );
  const locked = Boolean(lifecycle) || dispatching;
  const nameFor = (bot: MineflayerBotProfile) =>
    statusFor(bot.id)?.botUsername ||
    (bot.settings.botAccountMode === "microsoft"
      ? context.microsoftAccounts.find(
          (account) => account.id === bot.settings.botMicrosoftAccountId,
        )?.username
      : null) ||
    bot.settings.botNickname;
  const save = (mineflayerBot: MineflayerBotPluginSettings) =>
    onChange({ ...plugins, mineflayerBot });
  const updateActive = (next: MineflayerBotPluginSettings) => {
    if (active.id === DEFAULT_BOT_ID) save({ ...next, bots: root.bots });
    else
      save({
        ...root,
        bots: root.bots.map((bot) =>
          bot.id === active.id ? { ...bot, settings: botConfiguration(next) } : bot,
        ),
      });
  };
  const select = (ids: string[]) => {
    setSelection(ids);
    if (!ids.includes(focusId)) setFocusId(ids[0] ?? DEFAULT_BOT_ID);
  };

  async function run(
    label: string,
    requests: (bot: MineflayerBotProfile, status?: MineflayerBotStatus) => FleetRequest[],
    emergency = false,
  ) {
    if (lifecycleRef.current || (!emergency && currentRun.current) || !recipients.length) return;
    if (currentRun.current) currentRun.current.cancelled = true;
    const token = { cancelled: false };
    currentRun.current = token;
    setDispatching(true);
    setError("");
    setLastAction(label);
    setReceipts([]);
    try {
      const jobs = recipients.flatMap((bot) => {
        const status = statusFor(bot.id);
        const offline = !status?.running || status.state !== "connected";
        const planned = requests(bot, status);
        return !offline && !planned.length
          ? []
          : [{ botId: bot.id, name: nameFor(bot), requests: planned, offline }];
      });
      await dispatchFleetRequests(jobs, invoke, {
        cancelled: () => token.cancelled,
        offlineMessage: tr("bot.fleetControl.offline"),
        errorMessage: diagnostic,
        onReceipt: (receipt) => {
          if (currentRun.current === token) setReceipts((previous) => [...previous, receipt]);
        },
      });
      await monitor.refresh();
    } catch (cause) {
      if (currentRun.current === token) setError(diagnostic(cause));
    } finally {
      if (currentRun.current === token) {
        currentRun.current = null;
        setDispatching(false);
      }
    }
  }

  async function connectSelected() {
    if (lifecycleRef.current || currentRun.current || !recipients.length) return;
    lifecycleRef.current = "start";
    setLifecycle("start");
    setError("");
    cancelledStartup.current = false;
    const generation = ++startupGeneration.current;
    const failures: string[] = [];
    try {
      await flushPluginSettings();
      for (const [index, bot] of recipients.entries()) {
        if (cancelledStartup.current || generation !== startupGeneration.current) break;
        if (statusFor(bot.id)?.running) continue;
        try {
          await invoke("start_mineflayer_bot", {
            botId: bot.id,
            launcherNickname: context.launcherNickname,
            launcherAccountType: context.launcherAccountType,
            launcherMsAccountId: context.launcherMsAccountId ?? undefined,
          });
        } catch (cause) {
          failures.push(`${nameFor(bot)}: ${diagnostic(cause)}`);
        }
        if (
          index < recipients.length - 1 &&
          !cancelledStartup.current &&
          generation === startupGeneration.current
        )
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      if (generation === startupGeneration.current) setError(failures.join("\n"));
    } catch (cause) {
      if (generation === startupGeneration.current) setError(diagnostic(cause));
    } finally {
      if (generation === startupGeneration.current && lifecycleRef.current === "start") {
        lifecycleRef.current = "";
        setLifecycle("");
      }
      await monitor.refresh();
    }
  }

  async function disconnectSelected() {
    if (lifecycleRef.current && lifecycleRef.current !== "start") return;
    cancelledStartup.current = true;
    startupGeneration.current++;
    if (currentRun.current) currentRun.current.cancelled = true;
    lifecycleRef.current = "stop";
    setLifecycle("stop");
    setError("");
    try {
      const results = await Promise.allSettled(
        recipients.map((bot) => invoke("stop_mineflayer_bot", { botId: bot.id })),
      );
      setError(
        results
          .flatMap((result, index) =>
            result.status === "rejected"
              ? [`${nameFor(recipients[index])}: ${diagnostic(result.reason)}`]
              : [],
          )
          .join("\n"),
      );
    } finally {
      lifecycleRef.current = "";
      setLifecycle("");
      await monitor.refresh();
    }
  }

  async function removeProfiles(all: boolean) {
    if (lifecycleRef.current || currentRun.current) return;
    const ids = (all ? root.bots : recipients)
      .filter((bot) => bot.id !== DEFAULT_BOT_ID)
      .map((bot) => bot.id);
    if (!ids.length) return;
    lifecycleRef.current = "delete";
    setLifecycle("delete");
    setError("");
    try {
      await Promise.all(ids.map((botId) => invoke("stop_mineflayer_bot", { botId })));
      await flushPluginSettings();
      save({ ...root, bots: root.bots.filter((bot) => !ids.includes(bot.id)) });
      select([DEFAULT_BOT_ID]);
      await flushPluginSettings();
    } catch (cause) {
      setError(diagnostic(cause));
    } finally {
      lifecycleRef.current = "";
      setLifecycle("");
      await monitor.refresh();
    }
  }

  const quick = (action: "come" | "follow" | "deliver" | "pause" | "resume" | "stop") =>
    void run(
      tr(`bot.fleetControl.action.${action}`),
      (_bot, status) => {
        if (["pause", "resume"].includes(action)) {
          const phase = status?.inventory?.workflow?.phase;
          if (workflowIsRunning(status)) {
            if (action === "resume" && !["paused", "pausing"].includes(phase ?? "")) return [];
            if (action === "pause" && !["starting", "running"].includes(phase ?? "")) return [];
            return [{ command: "control_mineflayer_bot_workflow", args: { action } }];
          }
          if (!status?.gathering?.active && !status?.gathering?.suspended) return [];
          return [commandRequest(`work ${action}`)];
        }
        return [commandRequest(action)];
      },
      action === "stop",
    );
  const chaosActive = online.some((bot) => statusFor(bot.id)?.inventory?.chaoticMovement);
  const failed = receipts.filter((receipt) => receipt.state === "error").length;
  const controller = {
    ...monitor,
    snapshot: monitor.snapshot ? { ...monitor.snapshot, mineflayerBot: activeStatus } : null,
  };

  return (
    <div className="mf-workspace">
      <div className="mf-workspace-layout">
        <aside className="mf-workspace-sidebar">
          <MineflayerFleetControl
            profiles={profiles}
            statuses={statuses}
            selectedIds={recipients.map((bot) => bot.id)}
            onSelectionChange={select}
            nameFor={nameFor}
            disabled={locked}
          />
          <details className="mf-sidebar-section">
            <summary>{tr("bot.workspaceNew.addBots")}</summary>
            <div className="mf-sidebar-section-body">
              <MineflayerBotCreator
                settings={root}
                count={count}
                prefix={prefix}
                disabled={locked}
                onCountChange={setCount}
                onPrefixChange={setPrefix}
                onCreate={() => {
                  const created = createBotProfiles(root, active.settings, count, prefix);
                  if (!created.length) return;
                  save(
                    normalizeMineflayerBotSettings({ ...root, bots: [...root.bots, ...created] }),
                  );
                  select(created.map((bot) => bot.id));
                }}
              />
            </div>
          </details>
          <details className="mf-sidebar-section mf-sidebar-manage">
            <summary>{tr("bot.workspaceNew.manage")}</summary>
            <div className="mf-sidebar-section-body">
              <button
                type="button"
                className="mf-button"
                disabled={locked || !recipients.some((bot) => bot.id !== DEFAULT_BOT_ID)}
                onClick={() => void removeProfiles(false)}
              >
                {tr("bot.workspaceNew.deleteSelected")}
              </button>
              <button
                type="button"
                className="mf-button mf-danger-button"
                disabled={locked || !root.bots.length}
                onClick={() => void removeProfiles(true)}
              >
                {tr("bot.workspaceNew.deleteAdditional")}
              </button>
              <p className="mf-workspace-note">{tr("bot.workspaceNew.deleteHint")}</p>
            </div>
          </details>
        </aside>
        <main className="mf-workspace-main">
          <header className="mf-workspace-header">
            <div className="mf-workspace-target">
              <span className="mf-workspace-eyebrow">{tr("bot.workspaceNew.control")}</span>
              <h2>
                {recipients.length === 1
                  ? nameFor(recipients[0])
                  : tr(
                      recipients.length
                        ? "bot.workspaceNew.groupTitle"
                        : "bot.workspaceNew.chooseBots",
                      { count: recipients.length },
                    )}
              </h2>
              <p>
                {tr("bot.workspaceNew.onlineSummary", {
                  online: online.length,
                  total: recipients.length,
                })}
              </p>
            </div>
            <div className="mf-workspace-connection-actions">
              <button
                type="button"
                className="mf-button mf-button--primary"
                disabled={
                  locked ||
                  !recipients.length ||
                  !root.enabled ||
                  !packageReady ||
                  recipients.every((bot) => statusFor(bot.id)?.running)
                }
                onClick={() => void connectSelected()}
              >
                {tr(
                  lifecycle === "start"
                    ? "bot.fleet.starting"
                    : recipients.length === 1
                      ? "bot.main.connectBot"
                      : "bot.workspaceNew.connect",
                )}
              </button>
              <button
                type="button"
                className="mf-button"
                disabled={
                  Boolean(lifecycle && lifecycle !== "start") ||
                  (!lifecycle && !recipients.some((bot) => statusFor(bot.id)?.running))
                }
                onClick={() => void disconnectSelected()}
              >
                {tr(
                  recipients.length === 1 ? "bot.main.disconnect" : "bot.workspaceNew.disconnect",
                )}
              </button>
            </div>
          </header>
          <div
            className="mf-workspace-quick"
            role="group"
            aria-label={tr("bot.fleetControl.quickActions")}
          >
            {(["come", "follow", "deliver", "pause", "resume", "stop"] as const).map((action) => (
              <button
                key={action}
                type="button"
                className={`mf-button${action === "stop" ? " mf-danger-button" : ""}`}
                disabled={
                  action === "stop"
                    ? Boolean(lifecycle) || !online.length
                    : locked || !online.length
                }
                onClick={() => quick(action)}
              >
                {tr(`bot.fleetControl.action.${action}`)}
              </button>
            ))}
            <details className="mf-workspace-more">
              <summary aria-label={tr("bot.workspaceNew.more")}>···</summary>
              <div>
                <button
                  type="button"
                  className="mf-button"
                  disabled={locked || !online.length}
                  aria-pressed={chaosActive}
                  onClick={() =>
                    void run(
                      tr(chaosActive ? "bot.chaos.stop" : "bot.chaos.start"),
                      (_bot, status) =>
                        chaosActive && !status?.inventory?.chaoticMovement
                          ? []
                          : [commandRequest(chaosActive ? "chaos off" : "chaos on")],
                    )
                  }
                >
                  {tr(chaosActive ? "bot.chaos.stop" : "bot.chaos.start")}
                </button>
              </div>
            </details>
          </div>
          {error && (
            <p className="mineflayer-bot-error" role="alert">
              {error}
            </p>
          )}
          {(receipts.length > 0 || dispatching) && (
            <details
              key={lastAction + String(failed > 0)}
              className={`mf-workspace-receipts${failed ? " has-errors" : ""}`}
              open={failed > 0}
            >
              <summary>
                <strong>{lastAction}</strong>
                <span role="status">
                  {dispatching
                    ? tr("bot.main.sending")
                    : tr("bot.fleetControl.results", {
                        accepted: receipts.filter((receipt) => receipt.state === "accepted").length,
                        failed,
                      })}
                </span>
              </summary>
              <ul>
                {receipts.map((receipt) => (
                  <li key={receipt.botId} className={`is-${receipt.state}`}>
                    <strong>{receipt.name}</strong>
                    <span>{receipt.error || tr(`bot.fleetControl.receipt.${receipt.state}`)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <BotFleetContext.Provider
            value={{
              recipients,
              statuses,
              busy: locked,
              focusId: active.id,
              focus: setFocusId,
              nameFor,
              run,
            }}
          >
            <BotSessionContext.Provider value={active.id}>
              <RuntimeMonitorScope controller={controller}>
                <fieldset className="mf-fleet-editor" disabled={Boolean(lifecycle)}>
                  {renderEditor(
                    { ...active.settings, enabled: root.enabled, bots: [] },
                    updateActive,
                  )}
                </fieldset>
              </RuntimeMonitorScope>
            </BotSessionContext.Provider>
          </BotFleetContext.Provider>
        </main>
      </div>
    </div>
  );
}
