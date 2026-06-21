import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import steveFaceIcon from "../../../assets/plugins/steve-face.svg";
import type {
  LauncherPluginsSettings,
  MineflayerBotPluginSettings,
  MineflayerBotStatus,
} from "../../../types";
import type { PluginDefinition, PluginRenderContext } from "../pluginTypes";
import { toErrorMessage } from "../../../utils/errors";
import "./MineflayerBotPlugin.css";

type BotAccountMode = MineflayerBotPluginSettings["botAccountMode"];

export const DEFAULT_MINEFLAYER_BOT_SETTINGS: MineflayerBotPluginSettings = {
  enabled: false,
  host: "",
  port: 25565,
  version: "",
  commandPrefix: "!",
  botAccountMode: "offline",
  botNickname: "SCREEN_BOT",
  botMicrosoftAccountId: null,
  followDistance: 3,
};

function normalizeText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizePort(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MINEFLAYER_BOT_SETTINGS.port;
  return Math.max(1, Math.min(Math.round(parsed), 65535));
}

function normalizeFollowDistance(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MINEFLAYER_BOT_SETTINGS.followDistance;
  }
  return Math.max(1, Math.min(Math.round(parsed), 16));
}

function normalizeBotAccountMode(value: unknown): BotAccountMode {
  return value === "microsoft" ? "microsoft" : "offline";
}

export function normalizeMineflayerBotSettings(
  value: unknown,
): MineflayerBotPluginSettings {
  const draft =
    value && typeof value === "object"
      ? (value as Partial<MineflayerBotPluginSettings>)
      : {};

  return {
    enabled:
      typeof draft.enabled === "boolean"
        ? draft.enabled
        : DEFAULT_MINEFLAYER_BOT_SETTINGS.enabled,
    host: normalizeText(draft.host, DEFAULT_MINEFLAYER_BOT_SETTINGS.host),
    port: normalizePort(draft.port),
    version: normalizeText(
      draft.version,
      DEFAULT_MINEFLAYER_BOT_SETTINGS.version,
    ),
    commandPrefix: normalizeText(
      draft.commandPrefix,
      DEFAULT_MINEFLAYER_BOT_SETTINGS.commandPrefix,
    ),
    botAccountMode: normalizeBotAccountMode(draft.botAccountMode),
    botNickname: normalizeText(
      draft.botNickname,
      DEFAULT_MINEFLAYER_BOT_SETTINGS.botNickname,
    ),
    botMicrosoftAccountId:
      typeof draft.botMicrosoftAccountId === "string"
        ? draft.botMicrosoftAccountId
        : null,
    followDistance: normalizeFollowDistance(draft.followDistance),
  };
}

function formatStatusValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "NONE";
  return String(value);
}

function MineflayerBotSettingsEditor({
  settings,
  onChange,
  context,
}: {
  settings: MineflayerBotPluginSettings;
  onChange: (settings: MineflayerBotPluginSettings) => void;
  context: PluginRenderContext;
}) {
  const [status, setStatus] = useState<MineflayerBotStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const activeBotMsAccount = context.microsoftAccounts.find(
    (account) => account.id === settings.botMicrosoftAccountId,
  );
  const sameAsLauncherAccount =
    settings.botAccountMode === "microsoft" &&
    context.launcherAccountType === "MICROSOFT" &&
    Boolean(settings.botMicrosoftAccountId) &&
    settings.botMicrosoftAccountId === context.launcherMsAccountId;
  const canStart = useMemo(() => {
    if (busy) return false;
    if (!settings.enabled) return false;
    if (!settings.host.trim()) return false;
    if (settings.botAccountMode === "microsoft" && !settings.botMicrosoftAccountId) {
      return false;
    }
    if (sameAsLauncherAccount) return false;
    return true;
  }, [busy, sameAsLauncherAccount, settings]);

  const update = (patch: Partial<MineflayerBotPluginSettings>) => {
    onChange(normalizeMineflayerBotSettings({ ...settings, ...patch }));
  };

  const refreshStatus = async () => {
    try {
      const next = await invoke<MineflayerBotStatus>("get_mineflayer_bot_status");
      setStatus(next);
      setActionError("");
    } catch (error) {
      setActionError(toErrorMessage(error));
    }
  };

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 2500);
    return () => window.clearInterval(timer);
  }, []);

  const startBot = async () => {
    if (!canStart) return;
    try {
      setBusy(true);
      setActionError("");
      const next = await invoke<MineflayerBotStatus>("start_mineflayer_bot", {
        launcherNickname: context.launcherNickname,
        launcherAccountType: context.launcherAccountType,
        launcherMsAccountId: context.launcherMsAccountId ?? undefined,
      });
      setStatus(next);
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const stopBot = async () => {
    try {
      setBusy(true);
      setActionError("");
      const next = await invoke<MineflayerBotStatus>("stop_mineflayer_bot");
      setStatus(next);
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mineflayer-bot-settings">
      <div className="mineflayer-bot-grid">
        <label className="mineflayer-bot-field mineflayer-bot-field--wide">
          <span>SERVER HOST</span>
          <input
            value={settings.host}
            placeholder="localhost"
            spellCheck={false}
            onChange={(event) => update({ host: event.target.value })}
          />
        </label>

        <label className="mineflayer-bot-field">
          <span>PORT</span>
          <input
            value={settings.port}
            inputMode="numeric"
            onChange={(event) => update({ port: Number(event.target.value) })}
          />
        </label>

        <label className="mineflayer-bot-field">
          <span>VERSION</span>
          <input
            value={settings.version}
            placeholder="auto"
            spellCheck={false}
            onChange={(event) => update({ version: event.target.value })}
          />
        </label>

        <label className="mineflayer-bot-field">
          <span>PREFIX</span>
          <input
            value={settings.commandPrefix}
            maxLength={6}
            spellCheck={false}
            onChange={(event) => update({ commandPrefix: event.target.value })}
          />
        </label>

        <label className="mineflayer-bot-field">
          <span>FOLLOW DISTANCE</span>
          <input
            value={settings.followDistance}
            inputMode="numeric"
            onChange={(event) =>
              update({ followDistance: Number(event.target.value) })
            }
          />
        </label>
      </div>

      <div className="mineflayer-bot-subhead">BOT ACCOUNT</div>

      <div className="mineflayer-bot-mode" role="group">
        <button
          type="button"
          className={settings.botAccountMode === "offline" ? "active" : ""}
          onClick={() => update({ botAccountMode: "offline" })}
        >
          OFFLINE
        </button>
        <button
          type="button"
          className={settings.botAccountMode === "microsoft" ? "active" : ""}
          onClick={() =>
            update({
              botAccountMode: "microsoft",
              botMicrosoftAccountId:
                settings.botMicrosoftAccountId ??
                context.microsoftAccounts[0]?.id ??
                null,
            })
          }
        >
          MICROSOFT
        </button>
      </div>

      {settings.botAccountMode === "offline" ? (
        <label className="mineflayer-bot-field mineflayer-bot-field--full">
          <span>BOT NICKNAME</span>
          <input
            value={settings.botNickname}
            spellCheck={false}
            onChange={(event) => update({ botNickname: event.target.value })}
          />
        </label>
      ) : (
        <div className="mineflayer-bot-account-list">
          {context.microsoftAccounts.length === 0 ? (
            <div className="mineflayer-bot-empty">NO MICROSOFT ACCOUNTS</div>
          ) : (
            context.microsoftAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={
                  account.id === settings.botMicrosoftAccountId ? "active" : ""
                }
                onClick={() => update({ botMicrosoftAccountId: account.id })}
              >
                <img
                  src={`https://mc-heads.net/avatar/${account.uuid}/24`}
                  alt=""
                  width={24}
                  height={24}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
                <span>{account.username}</span>
              </button>
            ))
          )}
        </div>
      )}

      {sameAsLauncherAccount && (
        <div className="mineflayer-bot-warning">
          BOT ACCOUNT MATCHES ACTIVE PLAYER ACCOUNT
        </div>
      )}

      <div className="mineflayer-bot-subhead">CONTROL</div>

      <div className="mineflayer-bot-controls">
        <button type="button" disabled={!canStart} onClick={() => void startBot()}>
          {busy ? "WORKING" : "START"}
        </button>
        <button
          type="button"
          disabled={busy || !status?.running}
          onClick={() => void stopBot()}
        >
          STOP
        </button>
        <button type="button" disabled={busy} onClick={() => void refreshStatus()}>
          REFRESH
        </button>
      </div>

      <div className="mineflayer-bot-status">
        <div>
          <span>STATE</span>
          <strong>{formatStatusValue(status?.state)}</strong>
        </div>
        <div>
          <span>PID</span>
          <strong>{formatStatusValue(status?.pid)}</strong>
        </div>
        <div>
          <span>SERVER</span>
          <strong>{formatStatusValue(status?.server)}</strong>
        </div>
        <div>
          <span>OWNER</span>
          <strong>{formatStatusValue(status?.ownerName)}</strong>
        </div>
        <div>
          <span>BOT</span>
          <strong>
            {formatStatusValue(
              status?.botUsername ?? activeBotMsAccount?.username ?? settings.botNickname,
            )}
          </strong>
        </div>
      </div>

      {(actionError || status?.lastError) && (
        <div className="mineflayer-bot-error">
          {actionError || status?.lastError}
        </div>
      )}

      <div className="mineflayer-bot-log" aria-live="polite">
        {(status?.logs ?? []).length === 0 ? (
          <span>NO LOGS</span>
        ) : (
          status?.logs.slice(-10).map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))
        )}
      </div>
    </div>
  );
}

export const MINEFLAYER_BOT_PLUGIN_DEFINITION: PluginDefinition = {
  id: "mineflayerBot",
  title: "MINEFLAYER BOT",
  tag: "BOT",
  mark: "BOT",
  icon: {
    src: steveFaceIcon,
    alt: "Steve face",
  },
  description: "Runs a trusted Minecraft bot that listens to owner-only commands.",
  getEnabled: (plugins) => plugins.mineflayerBot.enabled,
  getStatus: (plugins) => {
    if (!plugins.mineflayerBot.enabled) return "OFF";
    if (!plugins.mineflayerBot.host.trim()) return "NEEDS SERVER";
    if (
      plugins.mineflayerBot.botAccountMode === "microsoft" &&
      !plugins.mineflayerBot.botMicrosoftAccountId
    ) {
      return "NEEDS ACCOUNT";
    }
    return "ON";
  },
  setEnabled: (plugins, enabled) => ({
    ...plugins,
    mineflayerBot: {
      ...plugins.mineflayerBot,
      enabled,
    },
  }),
  renderSettings: (
    plugins: LauncherPluginsSettings,
    onChange: (plugins: LauncherPluginsSettings) => void,
    context: PluginRenderContext,
  ) => (
    <MineflayerBotSettingsEditor
      settings={plugins.mineflayerBot}
      context={context}
      onChange={(mineflayerBot) => onChange({ ...plugins, mineflayerBot })}
    />
  ),
};
