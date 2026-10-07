import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MineflayerBotPluginSettings, MineflayerBotStatus } from "../../../types";
import type { PluginRenderContext, PluginSettingsProps } from "../pluginTypes";
import { normalizeMineflayerBotSettings } from "../pluginSettings";
import { toErrorMessage } from "../../../utils/errors";
import { useRuntimeMonitor } from "../../../hooks/useRuntimeMonitor";
import { PlaceholderGuideButton } from "../../placeholders/PlaceholderGuideButton";
import "./MineflayerBotPlugin.css";

type CommandSource = MineflayerBotPluginSettings["commandSource"];
type SettingsSection = "connection" | "behavior" | "commands" | "control";

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  mark: string;
}> = [
  { id: "connection", label: "CONNECTION", mark: "01" },
  { id: "behavior", label: "BEHAVIOR", mark: "02" },
  { id: "commands", label: "COMMANDS", mark: "03" },
  { id: "control", label: "CONTROL", mark: "04" },
];

const MOVEMENT_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  patch: Partial<MineflayerBotPluginSettings>;
}> = [
  {
    id: "safe",
    label: "SAFE",
    description: "NO WORLD CHANGES",
    patch: {
      allowSprinting: false,
      allowParkour: false,
      canDig: false,
      maxDropDown: 2,
      gotoRadius: 2,
    },
  },
  {
    id: "balanced",
    label: "BALANCED",
    description: "DEFAULT PATHING",
    patch: {
      allowSprinting: true,
      allowParkour: true,
      canDig: false,
      maxDropDown: 3,
      gotoRadius: 1,
    },
  },
  {
    id: "explorer",
    label: "EXPLORER",
    description: "FAST & CAPABLE",
    patch: {
      allowSprinting: true,
      allowParkour: true,
      canDig: true,
      maxDropDown: 6,
      gotoRadius: 1,
    },
  },
];

function formatStatusValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "NONE";
  return String(value);
}

function SettingToggle({
  label,
  description,
  checked,
  warning = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  warning?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={[
        "mineflayer-bot-toggle",
        checked ? "mineflayer-bot-toggle--active" : "",
        warning ? "mineflayer-bot-toggle--warning" : "",
      ].join(" ")}
      onClick={() => onChange(!checked)}
    >
      <span className="mineflayer-bot-toggle-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="mineflayer-bot-toggle-track" aria-hidden="true">
        <span />
      </span>
    </button>
  );
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
  const monitor = useRuntimeMonitor();
  const status = monitor.snapshot?.mineflayerBot ?? null;
  const packageInstalled = Boolean(
    monitor.snapshot?.optionalExtensions.find((item) => item.id === "mineflayer-bot")?.installed,
  );
  const [busyAction, setBusyAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [activeSection, setActiveSection] = useState<SettingsSection>("connection");
  const activeBotMsAccount = context.microsoftAccounts.find(
    (account) => account.id === settings.botMicrosoftAccountId,
  );
  const sameAsLauncherAccount =
    settings.botAccountMode === "microsoft" &&
    context.launcherAccountType === "MICROSOFT" &&
    Boolean(settings.botMicrosoftAccountId) &&
    settings.botMicrosoftAccountId === context.launcherMsAccountId;
  const canStart = useMemo(() => {
    if (busyAction || status?.running) return false;
    if (!settings.enabled || !packageInstalled || !settings.host.trim()) return false;
    if (settings.botAccountMode === "microsoft" && !settings.botMicrosoftAccountId) {
      return false;
    }
    return !sameAsLauncherAccount;
  }, [busyAction, packageInstalled, sameAsLauncherAccount, settings, status?.running]);

  const update = (patch: Partial<MineflayerBotPluginSettings>) => {
    onChange(normalizeMineflayerBotSettings({ ...settings, ...patch }));
  };

  const invokeStart = () =>
    invoke<MineflayerBotStatus>("start_mineflayer_bot", {
      launcherNickname: context.launcherNickname,
      launcherAccountType: context.launcherAccountType,
      launcherMsAccountId: context.launcherMsAccountId ?? undefined,
    });

  const startBot = async () => {
    if (!canStart) return;
    try {
      setBusyAction("STARTING");
      setActionError("");
      await invokeStart();
      await monitor.refresh();
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyAction("");
    }
  };

  const stopBot = async () => {
    try {
      setBusyAction("STOPPING");
      setActionError("");
      await invoke<MineflayerBotStatus>("stop_mineflayer_bot");
      await monitor.refresh();
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyAction("");
    }
  };

  const restartBot = async () => {
    if (busyAction || !status?.running) return;
    try {
      setBusyAction("RESTARTING");
      setActionError("");
      await invoke<MineflayerBotStatus>("stop_mineflayer_bot");
      await invokeStart();
      await monitor.refresh();
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="mineflayer-bot-settings">
      <div
        className={`mineflayer-bot-live ${status?.running ? "mineflayer-bot-live--online" : ""}`}
      >
        <span className="mineflayer-bot-live-dot" aria-hidden="true" />
        <div>
          <span>RUNTIME</span>
          <strong>{formatStatusValue(status?.state)}</strong>
        </div>
        <div>
          <span>SERVER</span>
          <strong>{formatStatusValue(status?.server || settings.host)}</strong>
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

      <div className="mineflayer-bot-tabs" role="tablist">
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={activeSection === section.id}
            className={activeSection === section.id ? "active" : ""}
            onClick={() => setActiveSection(section.id)}
          >
            <span>{section.mark}</span>
            {section.label}
          </button>
        ))}
      </div>

      <div className="mineflayer-bot-section" role="tabpanel">
        {activeSection === "connection" && (
          <>
            <div className="mineflayer-bot-subhead">
              <span>SERVER</span>
              <small>ADDRESS & PROTOCOL</small>
            </div>

            <div className="mineflayer-bot-grid">
              <label className="mineflayer-bot-field mineflayer-bot-field--wide">
                <span>SERVER HOST</span>
                <input
                  value={settings.host}
                  placeholder="localhost or play.example.net"
                  spellCheck={false}
                  onChange={(event) => update({ host: event.target.value })}
                />
              </label>

              <label className="mineflayer-bot-field">
                <span>PORT</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={settings.port}
                  onChange={(event) => update({ port: event.target.valueAsNumber })}
                />
              </label>

              <label className="mineflayer-bot-field">
                <span>MC VERSION</span>
                <input
                  value={settings.version}
                  placeholder="auto detect"
                  spellCheck={false}
                  onChange={(event) => update({ version: event.target.value })}
                />
              </label>
            </div>

            <div className="mineflayer-bot-subhead">
              <span>BOT ACCOUNT</span>
              <small>SEPARATE FROM THE PLAYER</small>
            </div>

            <div className="mineflayer-bot-mode" role="group">
              <button
                type="button"
                className={settings.botAccountMode === "offline" ? "active" : ""}
                onClick={() => update({ botAccountMode: "offline" })}
              >
                OFFLINE PROFILE
              </button>
              <button
                type="button"
                className={settings.botAccountMode === "microsoft" ? "active" : ""}
                onClick={() =>
                  update({
                    botAccountMode: "microsoft",
                    botMicrosoftAccountId:
                      settings.botMicrosoftAccountId ?? context.microsoftAccounts[0]?.id ?? null,
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
                  maxLength={16}
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
                      className={account.id === settings.botMicrosoftAccountId ? "active" : ""}
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

            <div className="mineflayer-bot-subhead">
              <span>RESILIENCE</span>
              <small>RECOVERY & TIMEOUTS</small>
            </div>

            <div className="mineflayer-bot-toggle-grid">
              <SettingToggle
                label="AUTO RECONNECT"
                description="REJOIN AFTER DISCONNECT"
                checked={settings.autoReconnect}
                onChange={(autoReconnect) => update({ autoReconnect })}
              />
              <SettingToggle
                label="AUTO RESPAWN"
                description="RETURN AFTER DEATH"
                checked={settings.autoRespawn}
                onChange={(autoRespawn) => update({ autoRespawn })}
              />
            </div>

            <div className="mineflayer-bot-grid mineflayer-bot-grid--three">
              <label className="mineflayer-bot-field">
                <span>RECONNECT DELAY · SEC</span>
                <input
                  type="number"
                  min={1}
                  max={300}
                  disabled={!settings.autoReconnect}
                  value={settings.reconnectDelaySeconds}
                  onChange={(event) =>
                    update({ reconnectDelaySeconds: event.target.valueAsNumber })
                  }
                />
              </label>
              <label className="mineflayer-bot-field">
                <span>MAX ATTEMPTS · 0 = ∞</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={!settings.autoReconnect}
                  value={settings.maxReconnectAttempts}
                  onChange={(event) => update({ maxReconnectAttempts: event.target.valueAsNumber })}
                />
              </label>
              <label className="mineflayer-bot-field">
                <span>TIMEOUT · SEC</span>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={settings.connectTimeoutSeconds}
                  onChange={(event) =>
                    update({ connectTimeoutSeconds: event.target.valueAsNumber })
                  }
                />
              </label>
            </div>
          </>
        )}

        {activeSection === "behavior" && (
          <>
            <div className="mineflayer-bot-subhead">
              <span>MOVEMENT PROFILE</span>
              <small>QUICK START PRESETS</small>
            </div>

            <div className="mineflayer-bot-presets">
              {MOVEMENT_PRESETS.map((preset) => (
                <button key={preset.id} type="button" onClick={() => update(preset.patch)}>
                  <strong>{preset.label}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>

            <div className="mineflayer-bot-subhead">
              <span>PATHFINDER</span>
              <small>FINE TUNING</small>
            </div>

            <div className="mineflayer-bot-grid mineflayer-bot-grid--three">
              <label className="mineflayer-bot-field">
                <span>FOLLOW DISTANCE</span>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={settings.followDistance}
                  onChange={(event) => update({ followDistance: event.target.valueAsNumber })}
                />
              </label>
              <label className="mineflayer-bot-field">
                <span>GOTO RADIUS</span>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={settings.gotoRadius}
                  onChange={(event) => update({ gotoRadius: event.target.valueAsNumber })}
                />
              </label>
              <label className="mineflayer-bot-field">
                <span>MAX GROUND DROP</span>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={settings.maxDropDown}
                  onChange={(event) => update({ maxDropDown: event.target.valueAsNumber })}
                />
              </label>
            </div>

            <div className="mineflayer-bot-toggle-grid">
              <SettingToggle
                label="SPRINTING"
                description="FASTER STRAIGHT PATHS"
                checked={settings.allowSprinting}
                onChange={(allowSprinting) => update({ allowSprinting })}
              />
              <SettingToggle
                label="PARKOUR"
                description="JUMP OVER SMALL GAPS"
                checked={settings.allowParkour}
                onChange={(allowParkour) => update({ allowParkour })}
              />
              <SettingToggle
                label="ALLOW DIGGING"
                description="MAY MODIFY THE WORLD"
                checked={settings.canDig}
                warning
                onChange={(canDig) => update({ canDig })}
              />
              <SettingToggle
                label="STAY ON WATER"
                description="SWIM UP AND KEEP AIR"
                checked={settings.stayOnWater}
                onChange={(stayOnWater) => update({ stayOnWater })}
              />
              <SettingToggle
                label="PATH DEBUG LOG"
                description="REPORT PATH UPDATES"
                checked={settings.logPathUpdates}
                onChange={(logPathUpdates) => update({ logPathUpdates })}
              />
            </div>

            <div className="mineflayer-bot-subhead">
              <span>ON SPAWN</span>
              <small>AUTOMATION</small>
            </div>

            <div className="mineflayer-bot-toggle-grid">
              <SettingToggle
                label="AUTO FOLLOW OWNER"
                description="START FOLLOWING AFTER JOIN"
                checked={settings.autoFollowOnSpawn}
                onChange={(autoFollowOnSpawn) => update({ autoFollowOnSpawn })}
              />
              <SettingToggle
                label="JOIN MESSAGE"
                description="ANNOUNCE WHEN READY"
                checked={settings.announceOnSpawn}
                onChange={(announceOnSpawn) => update({ announceOnSpawn })}
              />
            </div>

            {settings.announceOnSpawn && (
              <div>
                <label className="mineflayer-bot-field mineflayer-bot-field--full">
                  <span>MESSAGE</span>
                  <input
                    value={settings.spawnMessage}
                    maxLength={200}
                    placeholder="Ready, %owner%!"
                    onChange={(event) => update({ spawnMessage: event.target.value })}
                  />
                </label>
                <PlaceholderGuideButton compact />
              </div>
            )}
          </>
        )}

        {activeSection === "commands" && (
          <>
            <div className="mineflayer-bot-subhead">
              <span>COMMAND CHANNEL</span>
              <small>WHERE THE BOT LISTENS</small>
            </div>

            <div className="mineflayer-bot-grid">
              <label className="mineflayer-bot-field">
                <span>COMMAND PREFIX</span>
                <input
                  value={settings.commandPrefix}
                  maxLength={8}
                  spellCheck={false}
                  onChange={(event) => update({ commandPrefix: event.target.value })}
                />
              </label>
              <label className="mineflayer-bot-field">
                <span>COOLDOWN · MS</span>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={100}
                  value={settings.commandCooldownMs}
                  onChange={(event) => update({ commandCooldownMs: event.target.valueAsNumber })}
                />
              </label>
            </div>

            <div className="mineflayer-bot-source" role="group">
              {(["chat", "whisper", "both"] as CommandSource[]).map((source) => (
                <button
                  key={source}
                  type="button"
                  className={settings.commandSource === source ? "active" : ""}
                  onClick={() => update({ commandSource: source })}
                >
                  {source.toUpperCase()}
                </button>
              ))}
            </div>

            <label className="mineflayer-bot-field mineflayer-bot-field--full">
              <span>ADDITIONAL OWNERS · COMMA OR NEW LINE</span>
              <textarea
                value={settings.extraOwners}
                rows={3}
                spellCheck={false}
                placeholder="FriendOne, ModeratorTwo"
                onChange={(event) => update({ extraOwners: event.target.value })}
              />
            </label>

            <div className="mineflayer-bot-toggle-grid">
              <SettingToggle
                label="CHAT FEEDBACK"
                description="REPLY TO COMMANDS IN GAME"
                checked={settings.sendChatFeedback}
                onChange={(sendChatFeedback) => update({ sendChatFeedback })}
              />
              <SettingToggle
                label="ALLOW SAY"
                description="OWNER CAN SEND PUBLIC TEXT"
                checked={settings.allowSayCommand}
                warning
                onChange={(allowSayCommand) => update({ allowSayCommand })}
              />
              <SettingToggle
                label="ALLOW QUIT"
                description="OWNER CAN STOP THE BOT"
                checked={settings.allowQuitCommand}
                warning
                onChange={(allowQuitCommand) => update({ allowQuitCommand })}
              />
            </div>

            <div className="mineflayer-bot-subhead">
              <span>AVAILABLE COMMANDS</span>
              <small>OWNER ONLY</small>
            </div>

            <div className="mineflayer-bot-command-list">
              {[
                "help",
                "status",
                "where",
                "come",
                "follow",
                "goto x y z",
                "stop",
                "look",
                "jump",
              ].map((command) => (
                <span key={command}>
                  {settings.commandPrefix || "!"}
                  {command}
                </span>
              ))}
              <span className={!settings.allowSayCommand ? "disabled" : ""}>
                {settings.commandPrefix || "!"}say text
              </span>
              <span className={!settings.allowQuitCommand ? "disabled" : ""}>
                {settings.commandPrefix || "!"}quit
              </span>
            </div>
          </>
        )}

        {activeSection === "control" && (
          <>
            <div className="mineflayer-bot-subhead">
              <span>PROCESS CONTROL</span>
              <small>{busyAction || "READY"}</small>
            </div>

            <div className="mineflayer-bot-controls">
              <button type="button" disabled={!canStart} onClick={() => void startBot()}>
                START
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction) || !status?.running}
                onClick={() => void restartBot()}
              >
                RESTART
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction) || !status?.running}
                onClick={() => void stopBot()}
              >
                STOP
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => void monitor.refresh()}
              >
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

            <div className="mineflayer-bot-subhead">
              <span>LIVE LOG</span>
              <small>{status?.logs.length ?? 0} EVENTS</small>
            </div>

            <div className="mineflayer-bot-log" aria-live="polite">
              {(status?.logs ?? []).length === 0 ? (
                <span>NO LOGS</span>
              ) : (
                status?.logs
                  .slice(-20)
                  .map((line, index) => <span key={`${line}-${index}`}>{line}</span>)
              )}
            </div>
          </>
        )}
      </div>

      {(actionError || status?.lastError) && (
        <div className="mineflayer-bot-error">{actionError || status?.lastError}</div>
      )}
    </div>
  );
}

export function MineflayerBotSettings({ plugins, onChange, context }: PluginSettingsProps) {
  return (
    <MineflayerBotSettingsEditor
      settings={plugins.mineflayerBot}
      context={context}
      onChange={(mineflayerBot) => onChange({ ...plugins, mineflayerBot })}
    />
  );
}
