import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../../../i18n/locale";
import { RuntimeMonitorScope, useRuntimeMonitor } from "../../../hooks/useRuntimeMonitor";
import type { MineflayerBotPluginSettings } from "../../../types";
import type { PluginSettingsProps } from "../pluginTypes";
import { normalizeMineflayerBotSettings } from "../pluginSettings";
import { flushPluginSettings } from "../pluginSettingsSync";
import { MineflayerBotCreator } from "./MineflayerBotCreator";
import { MineflayerFleetControl } from "./MineflayerFleetControl";
import { toErrorMessage } from "../../../utils/errors";
import { BotSessionContext } from "./BotSessionContext";
import {
  botConfiguration,
  createBotProfiles,
  DEFAULT_BOT_ID,
  chaoticMovementTargets,
} from "./botFleet";

type Props = PluginSettingsProps & {
  renderEditor: (
    settings: MineflayerBotPluginSettings,
    onChange: (next: MineflayerBotPluginSettings) => void,
  ) => ReactNode;
};

export function MineflayerBotFleet({ plugins, onChange, context, renderEditor }: Props) {
  const tr = useTranslation();
  const monitor = useRuntimeMonitor();
  const root = plugins.mineflayerBot;
  const [selected, setSelected] = useState(DEFAULT_BOT_ID);
  const [count, setCount] = useState(1);
  const [prefix, setPrefix] = useState("SCREEN_BOT");
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [chaosBusy, setChaosBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const stoppingRef = useRef(false);
  const chaosBusyRef = useRef(false);
  const deletingRef = useRef(false);
  const cancelled = useRef(false);
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );
  const profiles = [{ id: DEFAULT_BOT_ID, settings: botConfiguration(root) }, ...root.bots];
  const active = profiles.find((bot) => bot.id === selected) ?? profiles[0];
  const statuses =
    monitor.snapshot?.mineflayerBots ?? (monitor.snapshot ? [monitor.snapshot.mineflayerBot] : []);
  const statusFor = (id: string) =>
    statuses.find((status) => (status.botId ?? DEFAULT_BOT_ID) === id);
  const activeStatus = statusFor(active.id) ?? {
    botId: active.id,
    revision: 0,
    running: false,
    state: "idle",
    logs: [],
  };
  const connected = statuses.filter(
    (status) => status.running && status.state === "connected",
  ).length;
  const chaosActive = chaoticMovementTargets(statuses, false).length > 0;
  const packageReady = Boolean(
    monitor.snapshot?.optionalExtensions.find((extension) => extension.id === "mineflayer-bot")
      ?.installed,
  );
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

  const add = () => {
    const bots = createBotProfiles(root, active.settings, count, prefix);
    if (!bots.length) return;
    save(normalizeMineflayerBotSettings({ ...root, bots: [...root.bots, ...bots] }));
    setSelected(bots[0].id);
  };

  const startAll = async () => {
    if (busyRef.current || stoppingRef.current || deletingRef.current) return;
    busyRef.current = true;
    cancelled.current = false;
    setBusy(true);
    setError("");
    const failures: string[] = [];
    try {
      await flushPluginSettings();
      for (let index = 0; index < profiles.length; index++) {
        if (cancelled.current) break;
        const bot = profiles[index];
        if (statusFor(bot.id)?.running) continue;
        try {
          await invoke("start_mineflayer_bot", {
            botId: bot.id,
            launcherNickname: context.launcherNickname,
            launcherAccountType: context.launcherAccountType,
            launcherMsAccountId: context.launcherMsAccountId ?? undefined,
          });
        } catch (cause) {
          failures.push(`${bot.settings.botNickname}: ${toErrorMessage(cause)}`);
        }
        if (index < profiles.length - 1 && !cancelled.current)
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      if (failures.length) setError(failures.join("\n"));
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
      await monitor.refresh();
    }
  };

  const stopAll = async () => {
    if (stoppingRef.current || deletingRef.current) return;
    cancelled.current = true;
    stoppingRef.current = true;
    setStopping(true);
    setError("");
    try {
      await invoke("stop_all_mineflayer_bots");
      await monitor.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      stoppingRef.current = false;
      setStopping(false);
    }
  };

  const deleteAll = async () => {
    if (deletingRef.current || stoppingRef.current || !root.bots.length) return;
    deletingRef.current = true;
    cancelled.current = true;
    setDeleting(true);
    setError("");
    try {
      // Stop the current worker and any queued group startup before removing
      // profiles, so a deleted bot cannot remain connected in the background.
      await invoke("stop_all_mineflayer_bots");
      await flushPluginSettings();
      save({ ...root, bots: [] });
      setSelected(DEFAULT_BOT_ID);
      setCount(1);
      await flushPluginSettings();
      await monitor.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const controller = {
    ...monitor,
    snapshot: monitor.snapshot ? { ...monitor.snapshot, mineflayerBot: activeStatus } : null,
  };

  const toggleChaosAll = async () => {
    if (chaosBusyRef.current || busyRef.current || stoppingRef.current || deletingRef.current)
      return;
    const targets = chaoticMovementTargets(statuses, !chaosActive);
    if (!targets.length) return;
    chaosBusyRef.current = true;
    setChaosBusy(true);
    setError("");
    try {
      const results = await Promise.allSettled(
        targets.map((bot) =>
          invoke("send_mineflayer_bot_chat", {
            botId: bot.botId ?? DEFAULT_BOT_ID,
            message: chaosActive ? "chaos off" : "chaos on",
            command: true,
          }),
        ),
      );
      setError(
        results
          .flatMap((result, index) =>
            result.status === "rejected"
              ? [
                  `${targets[index].botUsername || targets[index].botId || root.botNickname}: ${toErrorMessage(result.reason)}`,
                ]
              : [],
          )
          .join("\n"),
      );
      await monitor.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      chaosBusyRef.current = false;
      setChaosBusy(false);
    }
  };

  return (
    <div className="mf-fleet">
      <section className="mf-fleet-panel" aria-label={tr("bot.fleet.title")}>
        <div className="mf-fleet-heading">
          <div>
            <strong>{tr("bot.fleet.title")}</strong>
            <span>{tr("bot.fleet.summary", { total: profiles.length, connected })}</span>
          </div>
          <div className="mf-bot-toolbar-actions">
            <button
              type="button"
              className="mf-button mf-chaos-button"
              aria-pressed={chaosActive}
              title={tr("bot.chaos.description")}
              disabled={chaosBusy || busy || stopping || deleting || !connected}
              onClick={() => void toggleChaosAll()}
            >
              {tr(
                chaosBusy
                  ? "bot.main.pleaseWait"
                  : chaosActive
                    ? "bot.chaos.stopAll"
                    : "bot.chaos.startAll",
              )}
            </button>
            <button
              type="button"
              className="mf-button mf-button--primary"
              disabled={busy || stopping || deleting || !root.enabled || !packageReady}
              onClick={() => void startAll()}
            >
              {tr(busy ? "bot.fleet.starting" : "bot.fleet.startAll")}
            </button>
            <button
              type="button"
              className="mf-button"
              disabled={
                stopping || deleting || (!busy && !statuses.some((status) => status.running))
              }
              onClick={() => void stopAll()}
            >
              {tr("bot.fleet.stopAll")}
            </button>
          </div>
        </div>
        <MineflayerFleetControl
          profiles={profiles}
          statuses={statuses}
          activeId={active.id}
          onInspect={setSelected}
          nameFor={(bot) =>
            statusFor(bot.id)?.botUsername ||
            (bot.settings.botAccountMode === "microsoft"
              ? context.microsoftAccounts.find(
                  (account) => account.id === bot.settings.botMicrosoftAccountId,
                )?.username || bot.settings.botNickname
              : bot.settings.botNickname)
          }
          refresh={monitor.refresh}
          disabled={busy || stopping || deleting || chaosBusy}
        />
        <div className="mf-fleet-profile-actions">
          {active.id !== DEFAULT_BOT_ID && (
            <button
              type="button"
              className="mf-button"
              disabled={busy || stopping || deleting || activeStatus.running}
              onClick={() => {
                save({ ...root, bots: root.bots.filter((bot) => bot.id !== active.id) });
                setSelected(DEFAULT_BOT_ID);
              }}
            >
              {tr("bot.fleet.remove")}
            </button>
          )}
          {root.bots.length > 0 && (
            <button
              type="button"
              className="mf-button mf-fleet-remove-all"
              title={tr("bot.fleet.removeAllHint")}
              disabled={deleting || stopping}
              onClick={() => void deleteAll()}
            >
              {tr(deleting ? "bot.fleet.removingAll" : "bot.fleet.removeAll")}
            </button>
          )}
        </div>
        <MineflayerBotCreator
          settings={root}
          count={count}
          prefix={prefix}
          disabled={busy || stopping || deleting}
          onCountChange={setCount}
          onPrefixChange={setPrefix}
          onCreate={add}
        />
        <p className="mf-fleet-note">{tr("bot.fleet.note")}</p>
        {error && (
          <p className="mineflayer-bot-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <p className="mf-fleet-editor-label">
        {tr("bot.fleetControl.editing", {
          name: activeStatus.botUsername || active.settings.botNickname,
        })}
      </p>
      <BotSessionContext.Provider value={active.id}>
        <RuntimeMonitorScope controller={controller}>
          <fieldset key={active.id} className="mf-fleet-editor" disabled={deleting}>
            {renderEditor({ ...active.settings, enabled: root.enabled, bots: [] }, updateActive)}
          </fieldset>
        </RuntimeMonitorScope>
      </BotSessionContext.Provider>
    </div>
  );
}
