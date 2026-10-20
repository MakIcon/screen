import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../../../i18n/locale";
import type { MineflayerBotPluginSettings, MineflayerBotStatus } from "../../../types";
import type { PluginRenderContext, PluginSettingsProps } from "../pluginTypes";
import { normalizeMineflayerBotSettings } from "../pluginSettings";
import { toErrorMessage } from "../../../utils/errors";
import { useRuntimeMonitor } from "../../../hooks/useRuntimeMonitor";
import { PlaceholderGuideButton } from "../../placeholders/PlaceholderGuideButton";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { CustomScrollArea } from "../../layout/CustomScrollArea";
import { ElementToggle } from "../../inputs/ElementToggle";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { MineflayerCombatSettingsEditor } from "./MineflayerCombatSettings";
import { MineflayerGatheringControls } from "./MineflayerGatheringControls";
import { MineflayerInventoryPanel } from "./MineflayerInventoryPanel";
import { MineflayerProductionControls } from "./MineflayerProductionControls";
import { MineflayerWorkflow } from "./MineflayerWorkflow";
import { mergeScannedStorageGroups } from "./storageGroups";
import "./MineflayerBotPlugin.css";

type CommandSource = MineflayerBotPluginSettings["commandSource"];
type SettingsSection = "connection" | "behavior" | "survival" | "combat" | "commands" | "gathering";
type WorkspaceView = "scenario" | "inventory" | "production" | "settings" | "control";

const WORKSPACE_VIEWS: WorkspaceView[] = [
  "scenario",
  "inventory",
  "production",
  "settings",
  "control",
];

const SETTINGS_SECTIONS: SettingsSection[] = [
  "connection",
  "behavior",
  "survival",
  "combat",
  "gathering",
  "commands",
];

const MOVEMENT_PRESETS: Array<{
  id: "safe" | "balanced" | "explorer";
  patch: Partial<MineflayerBotPluginSettings>;
}> = [
  {
    id: "safe",
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
  if (value === null || value === undefined || value === "") return "—";
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
    <div className={warning ? "mineflayer-bot-toggle-warning" : undefined}>
      <ElementToggle
        size={0.75}
        title={label}
        note={description}
        enabled={checked}
        onToggle={() => onChange(!checked)}
      />
    </div>
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
  const tr = useTranslation();
  const monitor = useRuntimeMonitor();
  const status = monitor.snapshot?.mineflayerBot ?? null;
  const packageInstalled = Boolean(
    monitor.snapshot?.optionalExtensions.find((item) => item.id === "mineflayer-bot")?.installed,
  );
  const [busyAction, setBusyAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatFeedback, setChatFeedback] = useState("");
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatSendingRef = useRef(false);
  const chatConnected = Boolean(status?.running && status.state === "connected");
  const savedScan = useRef("");
  const storageScan = chatConnected ? status?.inventory?.production?.storageScan : null;
  useEffect(() => {
    if (!storageScan || storageScan.state !== "complete" || storageScan.saved) return;
    const key = `${status?.pid}:${storageScan.id}`;
    if (savedScan.current === key) return;
    savedScan.current = key;
    if (storageScan.added)
      onChange(
        normalizeMineflayerBotSettings({
          ...settings,
          gathering: {
            ...settings.gathering,
            storageGroups: mergeScannedStorageGroups(
              settings.gathering.storageGroups,
              storageScan.groups,
            ),
          },
        }),
      );
    void invoke("send_mineflayer_bot_chat", {
      message: `stash scan saved ${storageScan.id}`,
      command: true,
    }).catch((error) => setActionError(toErrorMessage(error)));
  }, [storageScan, status?.pid, settings, onChange]);
  const [activeView, setActiveView] = useState<WorkspaceView>("scenario");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("connection");
  const activeSection = activeView === "settings" ? settingsSection : activeView;
  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setActiveView("settings");
  };
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

  const refreshBotStatus = async () => {
    if (busyAction) return;
    try {
      setBusyAction("REFRESHING");
      setActionError("");
      await monitor.refresh();
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyAction("");
    }
  };

  const sendChatMessage = async () => {
    const draft = chatMessage;
    const message = draft.trim();
    if (!chatConnected || !message || chatSendingRef.current) return;
    chatSendingRef.current = true;
    setChatSending(true);
    setChatError("");
    setChatFeedback("");
    try {
      await invoke("send_mineflayer_bot_chat", { message });
      setChatMessage((current) => (current === draft ? "" : current));
      setChatFeedback(tr("bot.main.sentToTheBot"));
      void monitor.refresh();
    } catch (error) {
      setChatError(toErrorMessage(error));
    } finally {
      chatSendingRef.current = false;
      setChatSending(false);
      chatInputRef.current?.focus();
    }
  };

  const connectionControls = (
    <>
      {status?.running && (
        <button
          type="button"
          className="mf-button"
          disabled={Boolean(busyAction)}
          onClick={() => void restartBot()}
        >
          {tr("bot.main.restart")}
        </button>
      )}
      <button
        type="button"
        className={`mf-button${status?.running ? "" : " mf-button--primary"}`}
        disabled={status?.running ? Boolean(busyAction) : !canStart}
        onClick={() => void (status?.running ? stopBot() : startBot())}
      >
        {busyAction
          ? tr("bot.main.pleaseWait")
          : status?.running
            ? tr("bot.main.disconnect")
            : tr("bot.main.connectBot")}
      </button>
    </>
  );

  return (
    <div className="mineflayer-bot-settings">
      <header className="mf-bot-toolbar">
        <div className={`mf-bot-identity${chatConnected ? " is-connected" : ""}`}>
          <span className="mf-bot-connection-dot" aria-hidden="true" />
          <div>
            <strong>
              {status?.botUsername ||
                activeBotMsAccount?.username ||
                settings.botNickname ||
                "Mineflayer Bot"}
            </strong>
            <span>
              {chatConnected
                ? tr("bot.main.connected")
                : status?.state === "reconnecting"
                  ? tr("bot.main.reconnecting")
                  : status?.running
                    ? tr("bot.main.connecting")
                    : tr("bot.main.notConnected")}
              <span aria-hidden="true"> · </span>
              {settings.host || tr("bot.main.noServerSet")}
              {settings.host ? `:${settings.port}` : ""}
            </span>
          </div>
        </div>
        <div className="mf-bot-toolbar-actions">{connectionControls}</div>
      </header>
      {!status?.running &&
        (!settings.enabled ||
          !settings.host.trim() ||
          sameAsLauncherAccount ||
          (settings.botAccountMode === "microsoft" && !settings.botMicrosoftAccountId)) && (
          <p className="mf-bot-connection-hint">
            {!settings.enabled
              ? tr("bot.main.turnTheExtensionOn")
              : sameAsLauncherAccount
                ? tr("bot.main.chooseASeparateMicrosoft")
                : tr("bot.main.setTheServerAnd")}
            <button
              type="button"
              className="mf-text-button"
              onClick={() => openSettings("connection")}
            >
              {tr("bot.main.openSettings")}
            </button>
          </p>
        )}
      <nav className="mineflayer-bot-tabs" aria-label={tr("bot.main.botWorkspace")}>
        {WORKSPACE_VIEWS.map((section) => (
          <button
            key={section}
            type="button"
            aria-current={activeView === section ? "page" : undefined}
            className={activeView === section ? "active" : ""}
            onClick={(event) => {
              setActiveView(section);
              event.currentTarget.closest(".csa-content")?.scrollTo({ top: 0 });
            }}
          >
            <strong>{tr(`bot.workspace.${section}`)}</strong>
          </button>
        ))}
      </nav>

      <div hidden={activeView !== "scenario"}>
        <MineflayerWorkflow
          connected={chatConnected}
          status={status}
          gatheringSettings={settings.gathering}
          refresh={monitor.refresh}
          onOpenConnection={() => openSettings("connection")}
          onOpenStorage={() => openSettings("gathering")}
        />
      </div>
      {activeView === "settings" && (
        <nav className="mf-settings-nav" aria-label={tr("bot.main.settingsSections")}>
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              aria-current={settingsSection === section ? "page" : undefined}
              className={settingsSection === section ? "active" : ""}
              onClick={() => setSettingsSection(section)}
            >
              {tr(`bot.settingsSection.${section}`)}
            </button>
          ))}
        </nav>
      )}
      <div className="mineflayer-bot-section" key={activeSection}>
        {activeSection === "gathering" && (
          <MineflayerGatheringControls
            connected={chatConnected}
            refresh={monitor.refresh}
            status={status}
            settings={settings.gathering}
            onSettingsChange={(gathering) => update({ gathering })}
            onOpenInventory={() => setActiveView("inventory")}
          />
        )}
        {activeSection === "inventory" && (
          <MineflayerInventoryPanel status={status} onOpenTasks={() => setActiveView("scenario")} />
        )}
        {activeSection === "production" && (
          <MineflayerProductionControls
            connected={chatConnected}
            refresh={monitor.refresh}
            status={status}
          />
        )}
        {activeSection === "connection" && (
          <div className="mineflayer-bot-connection-grid">
            <PluginSettingsGroup title={tr("bot.main.server")} collapsible={false}>
              <div className="mineflayer-bot-grid">
                <label className="mineflayer-bot-field mineflayer-bot-field--wide">
                  <span>{tr("bot.main.serverAddress")}</span>
                  <input
                    value={settings.host}
                    placeholder={tr("bot.main.localhostOrPlayExample")}
                    spellCheck={false}
                    onChange={(event) => update({ host: event.target.value })}
                  />
                </label>

                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.port")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.port")}
                    background="transparent"
                    min={1}
                    max={65535}
                    value={settings.port}
                    onChange={(port) => update({ port })}
                  />
                </label>

                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.version")}</span>
                  <input
                    value={settings.version}
                    placeholder={tr("common.auto")}
                    spellCheck={false}
                    onChange={(event) => update({ version: event.target.value })}
                  />
                </label>
              </div>
            </PluginSettingsGroup>
            <PluginSettingsGroup title={tr("bot.main.botAccount")} collapsible={false}>
              <div className="mineflayer-bot-mode" role="group">
                <button
                  type="button"
                  aria-pressed={settings.botAccountMode === "offline"}
                  className={settings.botAccountMode === "offline" ? "active" : ""}
                  onClick={() => update({ botAccountMode: "offline" })}
                >
                  {tr("bot.main.offline")}
                </button>
                <button
                  type="button"
                  aria-pressed={settings.botAccountMode === "microsoft"}
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
                  <span>{tr("bot.main.botNickname")}</span>
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
                    <div className="mineflayer-bot-empty">
                      {tr("bot.main.noMicrosoftAccountsAdd")}
                    </div>
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
                  {tr("bot.main.theActivePlayersAccount")}
                </div>
              )}
            </PluginSettingsGroup>
            <PluginSettingsGroup title={tr("bot.main.reconnecting2")} collapsible={false}>
              <div className="mineflayer-bot-toggle-grid">
                <SettingToggle
                  label={tr("bot.main.autoReconnect")}
                  description={tr("bot.main.comeBackAfterA")}
                  checked={settings.autoReconnect}
                  onChange={(autoReconnect) => update({ autoReconnect })}
                />
                <SettingToggle
                  label={tr("bot.main.autoRespawn")}
                  description={tr("bot.main.respawnAfterDying")}
                  checked={settings.autoRespawn}
                  onChange={(autoRespawn) => update({ autoRespawn })}
                />
              </div>

              <div className="mineflayer-bot-grid mineflayer-bot-grid--three">
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.retryDelaySec")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.retryDelaySec")}
                    background="transparent"
                    min={1}
                    max={300}
                    disabled={!settings.autoReconnect}
                    value={settings.reconnectDelaySeconds}
                    onChange={(reconnectDelaySeconds) => update({ reconnectDelaySeconds })}
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.attempts0Unlimited")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.attempts0Unlimited")}
                    background="transparent"
                    min={0}
                    max={100}
                    disabled={!settings.autoReconnect}
                    value={settings.maxReconnectAttempts}
                    onChange={(maxReconnectAttempts) => update({ maxReconnectAttempts })}
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.loginTimeoutSec")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.loginTimeoutSec")}
                    background="transparent"
                    min={5}
                    max={300}
                    value={settings.connectTimeoutSeconds}
                    onChange={(connectTimeoutSeconds) => update({ connectTimeoutSeconds })}
                  />
                </label>
              </div>
            </PluginSettingsGroup>
          </div>
        )}

        {activeSection === "behavior" && (
          <>
            <div className="mineflayer-bot-subhead">
              <span>{tr("bot.main.movementProfile")}</span>
            </div>

            <div className="mineflayer-bot-presets">
              {MOVEMENT_PRESETS.map((preset) => (
                <button key={preset.id} type="button" onClick={() => update(preset.patch)}>
                  <strong>{tr(`bot.movementPreset.${preset.id}.label`)}</strong>
                  <span>{tr(`bot.movementPreset.${preset.id}.description`)}</span>
                </button>
              ))}
            </div>

            <PluginSettingsGroup title={tr("bot.main.movementAndRoute")} collapsible={false}>
              <div className="mineflayer-bot-grid mineflayer-bot-grid--three">
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.followDistance")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.followDistance")}
                    background="transparent"
                    min={1}
                    max={16}
                    value={settings.followDistance}
                    onChange={(followDistance) => update({ followDistance })}
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.arrivalRadius")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.arrivalRadius")}
                    background="transparent"
                    min={1}
                    max={16}
                    value={settings.gotoRadius}
                    onChange={(gotoRadius) => update({ gotoRadius })}
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.maxFallHeight")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.maxFallHeight")}
                    background="transparent"
                    min={1}
                    max={16}
                    value={settings.maxDropDown}
                    onChange={(maxDropDown) => update({ maxDropDown })}
                  />
                </label>
              </div>

              <div className="mineflayer-bot-toggle-grid">
                <SettingToggle
                  label={tr("bot.main.sprint")}
                  description={tr("bot.main.runOnStraightStretches")}
                  checked={settings.allowSprinting}
                  onChange={(allowSprinting) => update({ allowSprinting })}
                />
                <SettingToggle
                  label={tr("bot.main.lowCeilingJumps")}
                  description={tr("bot.main.frequentSprintJumpsIn")}
                  checked={settings.allowLowCeilingJumps}
                  onChange={(allowLowCeilingJumps) => update({ allowLowCeilingJumps })}
                />
                <SettingToggle
                  label={tr("bot.main.parkour")}
                  description={tr("bot.main.jumpAcrossSmallGaps")}
                  checked={settings.allowParkour}
                  onChange={(allowParkour) => update({ allowParkour })}
                />
                <SettingToggle
                  label={tr("bot.main.blockBreaking")}
                  description={tr("bot.main.letsTheBotChange")}
                  checked={settings.canDig}
                  warning
                  onChange={(canDig) => update({ canDig })}
                />
                <SettingToggle
                  label={tr("bot.main.airStrafe")}
                  description={tr("bot.main.a45TurnFor")}
                  checked={settings.allowAirStrafe}
                  onChange={(allowAirStrafe) => update({ allowAirStrafe })}
                />
                <SettingToggle
                  label={tr("bot.main.swimming")}
                  description={tr("bot.main.swimFastAndConserve")}
                  checked={settings.stayOnWater}
                  onChange={(stayOnWater) => update({ stayOnWater })}
                />
                <SettingToggle
                  label={tr("bot.main.waterDropIntoWater")}
                  description={tr("bot.main.jumpIntoWaterAfter")}
                  checked={settings.allowWaterDrop}
                  onChange={(allowWaterDrop) => update({ allowWaterDrop })}
                />
                <SettingToggle
                  label={tr("bot.main.waterDropWithA")}
                  description={tr("bot.main.placeWaterBeforeLanding")}
                  checked={settings.allowBucketWaterDrop}
                  onChange={(allowBucketWaterDrop) => update({ allowBucketWaterDrop })}
                />
                <SettingToggle
                  label={tr("bot.main.routeDebugging")}
                  description={tr("bot.main.writeRouteChangesTo")}
                  checked={settings.logPathUpdates}
                  onChange={(logPathUpdates) => update({ logPathUpdates })}
                />
                <SettingToggle
                  label={tr("bot.main.antiKnockback")}
                  description={tr("bot.main.blockPushesAndHits")}
                  checked={settings.antiKnockback}
                  onChange={(antiKnockback) => update({ antiKnockback })}
                />
              </div>
            </PluginSettingsGroup>
            <PluginSettingsGroup title={tr("bot.main.afterJoiningTheServer")} collapsible={false}>
              <div className="mineflayer-bot-toggle-grid">
                <SettingToggle
                  label={tr("bot.main.followTheOwner")}
                  description={tr("bot.main.startMovingAfterJoining")}
                  checked={settings.autoFollowOnSpawn}
                  onChange={(autoFollowOnSpawn) => update({ autoFollowOnSpawn })}
                />
              </div>
              <PluginSettingsGroup
                title={tr("bot.main.joinMessage")}
                description={tr("bot.main.greetingTextAndPlaceholders")}
                enabled={settings.announceOnSpawn}
                onToggle={() => update({ announceOnSpawn: !settings.announceOnSpawn })}
              >
                <label className="mineflayer-bot-field mineflayer-bot-field--full">
                  <span>{tr("bot.main.messageText")}</span>
                  <input
                    value={settings.spawnMessage}
                    maxLength={200}
                    placeholder={tr("bot.main.readyOwner")}
                    onChange={(event) => update({ spawnMessage: event.target.value })}
                  />
                </label>
                <PlaceholderGuideButton compact />
              </PluginSettingsGroup>
            </PluginSettingsGroup>
          </>
        )}

        {activeSection === "survival" && (
          <>
            <PluginSettingsGroup
              title={tr("bot.main.autoEat")}
              description={tr("bot.main.safeFoodFromThe")}
              enabled={settings.survival.autoEat}
              onToggle={() =>
                update({ survival: { ...settings.survival, autoEat: !settings.survival.autoEat } })
              }
            >
              <div className="mineflayer-bot-grid">
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.eatAtHungerOut")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.eatAtHunger")}
                    background="transparent"
                    min={1}
                    max={19}
                    value={settings.survival.autoEatMinHunger}
                    onChange={(autoEatMinHunger) =>
                      update({ survival: { ...settings.survival, autoEatMinHunger } })
                    }
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.eatAtHealthOut")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.eatAtHealth")}
                    background="transparent"
                    min={1}
                    max={20}
                    value={settings.survival.autoEatMinHealth}
                    onChange={(autoEatMinHealth) =>
                      update({ survival: { ...settings.survival, autoEatMinHealth } })
                    }
                  />
                </label>
                <div className="mineflayer-bot-field mineflayer-bot-field--full">
                  <span>{tr("bot.main.foodChoice")}</span>
                  <div
                    className="mineflayer-bot-mode"
                    role="group"
                    aria-label={tr("bot.main.foodChoice")}
                  >
                    {(["saturation", "foodPoints"] as const).map((priority) => (
                      <button
                        key={priority}
                        type="button"
                        aria-pressed={settings.survival.autoEatPriority === priority}
                        className={settings.survival.autoEatPriority === priority ? "active" : ""}
                        onClick={() =>
                          update({ survival: { ...settings.survival, autoEatPriority: priority } })
                        }
                      >
                        {priority === "saturation"
                          ? tr("bot.main.moreSaturation")
                          : tr("bot.main.moreFoodPoints")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mineflayer-bot-combat-note">{tr("bot.main.theBotPausesTo")}</p>
            </PluginSettingsGroup>
            <PluginSettingsGroup
              title={tr("bot.main.autoBuffsAndHealing")}
              description={tr("bot.main.potionsFromTheInventory")}
              enabled={settings.survival.autoBuff}
              onToggle={() =>
                update({
                  survival: { ...settings.survival, autoBuff: !settings.survival.autoBuff },
                })
              }
            >
              <SettingToggle
                label={tr("bot.main.healingPotions")}
                description={tr("bot.main.instantHealingAndRegeneration")}
                checked={settings.survival.autoBuffHealing}
                onChange={(autoBuffHealing) =>
                  update({ survival: { ...settings.survival, autoBuffHealing } })
                }
              />
              <SettingToggle
                label={tr("bot.main.combatBuffs")}
                description={tr("bot.main.strengthSpeedAndFire")}
                checked={settings.survival.autoBuffCombat}
                onChange={(autoBuffCombat) =>
                  update({ survival: { ...settings.survival, autoBuffCombat } })
                }
              />
              <div className="mineflayer-bot-grid">
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.healAtHealthHp")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.healthForHealingPotion")}
                    background="transparent"
                    min={1}
                    max={20}
                    value={settings.survival.autoBuffMinHealth}
                    onChange={(autoBuffMinHealth) =>
                      update({ survival: { ...settings.survival, autoBuffMinHealth } })
                    }
                  />
                </label>
              </div>
              <p className="mineflayer-bot-combat-note">{tr("bot.main.theBotUsesDrinkable")}</p>
            </PluginSettingsGroup>
            <PluginSettingsGroup
              title={tr("bot.main.emergencyMlg")}
              description={tr("bot.main.aWaterBucketSave")}
              enabled={settings.survival.emergencyMlg}
              onToggle={() =>
                update({
                  survival: { ...settings.survival, emergencyMlg: !settings.survival.emergencyMlg },
                })
              }
            >
              <div className="mineflayer-bot-grid">
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.minFallBlocks")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.minFallForMlg")}
                    background="transparent"
                    min={4}
                    max={32}
                    value={settings.survival.mlgMinFallHeight}
                    onChange={(mlgMinFallHeight) =>
                      update({ survival: { ...settings.survival, mlgMinFallHeight } })
                    }
                  />
                </label>
              </div>
              <SettingToggle
                label={tr("bot.main.pickUpWaterAfter")}
                description={tr("bot.main.onlyYourOwnSource")}
                checked={settings.survival.mlgPickupWater}
                onChange={(mlgPickupWater) =>
                  update({ survival: { ...settings.survival, mlgPickupWater } })
                }
              />
              <p className="mineflayer-bot-combat-note">{tr("bot.main.aWaterBucketIs")}</p>
            </PluginSettingsGroup>
          </>
        )}

        {activeSection === "combat" && (
          <MineflayerCombatSettingsEditor
            settings={settings.combat}
            onChange={(combat) => update({ combat })}
            commandPrefix={settings.commandPrefix || "!"}
          />
        )}

        {activeSection === "commands" && (
          <>
            <PluginSettingsGroup title={tr("bot.main.commandAccess")} collapsible={false}>
              <div className="mineflayer-bot-grid">
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.commandPrefix")}</span>
                  <input
                    value={settings.commandPrefix}
                    maxLength={8}
                    spellCheck={false}
                    onChange={(event) => update({ commandPrefix: event.target.value })}
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.main.pauseBetweenCommandsMs")}</span>
                  <CustomNumberInput
                    ariaLabel={tr("bot.main.pauseBetweenCommandsMs")}
                    background="transparent"
                    min={0}
                    max={10000}
                    step={100}
                    value={settings.commandCooldownMs}
                    onChange={(commandCooldownMs) => update({ commandCooldownMs })}
                  />
                </label>
              </div>

              <div className="mineflayer-bot-source" role="group">
                {(["chat", "whisper", "both"] as CommandSource[]).map((source) => (
                  <button
                    key={source}
                    type="button"
                    aria-pressed={settings.commandSource === source}
                    className={settings.commandSource === source ? "active" : ""}
                    onClick={() => update({ commandSource: source })}
                  >
                    {source === "chat"
                      ? tr("bot.main.publicChat")
                      : source === "whisper"
                        ? tr("bot.main.whispers")
                        : tr("bot.main.bothChannels")}
                  </button>
                ))}
              </div>

              <label className="mineflayer-bot-field mineflayer-bot-field--full">
                <span>{tr("bot.main.extraOwnersCommaSeparated")}</span>
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
                  label={tr("bot.main.chatReplies")}
                  description={tr("bot.main.confirmCommandsInGame")}
                  checked={settings.sendChatFeedback}
                  onChange={(sendChatFeedback) => update({ sendChatFeedback })}
                />
                <SettingToggle
                  label={tr("bot.main.sayCommand")}
                  description={tr("bot.main.theOwnerCanType")}
                  checked={settings.allowSayCommand}
                  warning
                  onChange={(allowSayCommand) => update({ allowSayCommand })}
                />
                <SettingToggle
                  label={tr("bot.main.quitCommand")}
                  description={tr("bot.main.theOwnerCanDisconnect")}
                  checked={settings.allowQuitCommand}
                  warning
                  onChange={(allowQuitCommand) => update({ allowQuitCommand })}
                />
              </div>
            </PluginSettingsGroup>
            <PluginSettingsGroup title={tr("bot.main.commandReference")} collapsible={false}>
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
                  "attack player",
                  "bow player",
                  "pvp auto",
                  "pvp stop",
                  "pvp status",
                  "mine iron,diamond 64 32",
                  "ores 64 32",
                  "forest 16 0 logs",
                  "area arena 1 x y z",
                  "area arena 2 x y z",
                  "quarry arena",
                  "tunnel 16 2 3",
                  "collect 16",
                  "stash x y z",
                  "deposit",
                  "work status",
                  "work queue",
                  "work pause",
                  "work resume",
                  "work stop",
                  "craft stone_pickaxe 1",
                  "recipes torch 64",
                  "smelt raw_iron 16 auto auto",
                  "station open stonecutter",
                  "station scan 32",
                  "stash scan 32",
                  "station put 0 stone 16",
                  "station select 0",
                  "station take 1",
                  "station close",
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
            </PluginSettingsGroup>
          </>
        )}

        {activeSection === "control" && (
          <>
            <div
              className="mf-journal-controls"
              role="group"
              aria-label={tr("bot.main.botConnection")}
            >
              {connectionControls}
              <button
                type="button"
                className="mf-button"
                disabled={Boolean(busyAction)}
                onClick={() => void refreshBotStatus()}
              >
                {tr("bot.main.refreshStatus")}
              </button>
            </div>
            <div className="mineflayer-bot-status">
              <div>
                <span>{tr("bot.main.state")}</span>
                <strong>{formatStatusValue(status?.state)}</strong>
              </div>
              <div>
                <span>PID</span>
                <strong>{formatStatusValue(status?.pid)}</strong>
              </div>
              <div>
                <span>{tr("bot.main.server")}</span>
                <strong>{formatStatusValue(status?.server)}</strong>
              </div>
              <div>
                <span>{tr("bot.main.owner")}</span>
                <strong>{formatStatusValue(status?.ownerName)}</strong>
              </div>
              <div>
                <span>{tr("bot.main.bot")}</span>
                <strong>
                  {formatStatusValue(
                    status?.botUsername ?? activeBotMsAccount?.username ?? settings.botNickname,
                  )}
                </strong>
              </div>
            </div>

            <PluginSettingsGroup
              title={tr("bot.main.botChatAndCommands")}
              description={tr("bot.main.forestChopTreesDeliver")}
              collapsible={false}
            >
              <form
                className="mineflayer-bot-chat"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendChatMessage();
                }}
              >
                <label className="mineflayer-bot-field">
                  <input
                    ref={chatInputRef}
                    aria-label={tr("bot.main.messageAsTheBot")}
                    placeholder={
                      chatConnected ? tr("bot.main.typeAMessage") : tr("bot.main.connectTheBotTo")
                    }
                    value={chatMessage}
                    maxLength={240}
                    disabled={!chatConnected}
                    onChange={(event) => {
                      setChatMessage(event.target.value);
                      setChatError("");
                      setChatFeedback("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && event.nativeEvent.isComposing) {
                        event.preventDefault();
                      }
                    }}
                  />
                </label>
                <button
                  type="submit"
                  disabled={!chatConnected || chatSending || !chatMessage.trim()}
                >
                  {chatSending ? tr("bot.main.sending") : tr("bot.main.send")}
                </button>
              </form>
              {(chatError || chatFeedback) && (
                <p
                  className={`mineflayer-bot-chat-feedback${chatError ? " is-error" : ""}`}
                  role={chatError ? "alert" : "status"}
                >
                  {chatError || chatFeedback}
                </p>
              )}
            </PluginSettingsGroup>

            <PluginSettingsGroup title={tr("bot.main.eventLog")} collapsible={false}>
              <CustomScrollArea
                className="mineflayer-bot-log"
                style={{ minHeight: 150 }}
                tabIndex={0}
                aria-label={tr("bot.main.eventLog2")}
              >
                <div className="mineflayer-bot-log-lines" aria-live="polite">
                  {(status?.logs ?? []).length === 0 ? (
                    <span>{tr("common.noEventsYet")}</span>
                  ) : (
                    status?.logs
                      .slice(-20)
                      .map((line, index) => <span key={`${line}-${index}`}>{line}</span>)
                  )}
                </div>
              </CustomScrollArea>
            </PluginSettingsGroup>
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
