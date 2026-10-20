import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

const WORKSPACE_VIEWS: Array<{ id: WorkspaceView; label: string }> = [
  { id: "scenario", label: "Сценарий" },
  { id: "inventory", label: "Инвентарь" },
  { id: "production", label: "Рабочие блоки" },
  { id: "settings", label: "Настройки" },
  { id: "control", label: "Журнал и чат" },
];

const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "connection", label: "Подключение" },
  { id: "behavior", label: "Движение" },
  { id: "survival", label: "Выживание" },
  { id: "combat", label: "Бой и предметы" },
  { id: "gathering", label: "Добыча и склад" },
  { id: "commands", label: "Команды" },
];

const MOVEMENT_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  patch: Partial<MineflayerBotPluginSettings>;
}> = [
  {
    id: "safe",
    label: "ОСТОРОЖНЫЙ",
    description: "Без изменения мира",
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
    label: "СБАЛАНСИРОВАННЫЙ",
    description: "Обычное движение",
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
    label: "ИССЛЕДОВАТЕЛЬ",
    description: "Быстро, с разрушением блоков",
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
    if (storageScan.added) onChange(normalizeMineflayerBotSettings({ ...settings,
      gathering: { ...settings.gathering, storageGroups: mergeScannedStorageGroups(settings.gathering.storageGroups, storageScan.groups) } }));
    void invoke("send_mineflayer_bot_chat", { message: `stash scan saved ${storageScan.id}`, command: true })
      .catch(error => setActionError(toErrorMessage(error)));
  }, [storageScan, status?.pid, settings, onChange]);
  const [activeView, setActiveView] = useState<WorkspaceView>("scenario");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("connection");
  const activeSection = activeView === "settings" ? settingsSection : activeView;
  const openSettings = (section: SettingsSection) => { setSettingsSection(section); setActiveView("settings"); };
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
      setChatFeedback("Отправлено боту");
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
        <button type="button" className="mf-button" disabled={Boolean(busyAction)} onClick={() => void restartBot()}>
          Перезапустить
        </button>
      )}
      <button
        type="button"
        className={`mf-button${status?.running ? "" : " mf-button--primary"}`}
        disabled={status?.running ? Boolean(busyAction) : !canStart}
        onClick={() => void (status?.running ? stopBot() : startBot())}
      >
        {busyAction ? "Подождите…" : status?.running ? "Отключить" : "Подключить бота"}
      </button>
    </>
  );

  return (
    <div className="mineflayer-bot-settings">
      <header className="mf-bot-toolbar">
        <div className={`mf-bot-identity${chatConnected ? " is-connected" : ""}`}>
          <span className="mf-bot-connection-dot" aria-hidden="true" />
          <div><strong>{status?.botUsername || activeBotMsAccount?.username || settings.botNickname || "Mineflayer Bot"}</strong><span>{chatConnected ? "Подключён" : status?.state === "reconnecting" ? "Переподключается…" : status?.running ? "Подключается…" : "Не подключён"}<span aria-hidden="true"> · </span>{settings.host || "Сервер не указан"}{settings.host ? `:${settings.port}` : ""}</span></div>
        </div>
        <div className="mf-bot-toolbar-actions">
          {connectionControls}
        </div>
      </header>
      {!status?.running && (!settings.enabled || !settings.host.trim() || sameAsLauncherAccount || (settings.botAccountMode === "microsoft" && !settings.botMicrosoftAccountId)) && <p className="mf-bot-connection-hint">{!settings.enabled ? "Включите расширение переключателем выше." : sameAsLauncherAccount ? "Выберите для бота отдельный Microsoft-аккаунт." : "Укажите сервер и аккаунт бота в настройках подключения."}<button type="button" className="mf-text-button" onClick={() => openSettings("connection")}>Открыть настройки ↗</button></p>}
      <nav className="mineflayer-bot-tabs" aria-label="Рабочая область бота">
        {WORKSPACE_VIEWS.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={activeView === section.id ? "page" : undefined}
            className={activeView === section.id ? "active" : ""}
            onClick={(event) => {
              setActiveView(section.id);
              event.currentTarget.closest(".csa-content")?.scrollTo({ top: 0 });
            }}
          >
            <strong>{section.label}</strong>
          </button>
        ))}
      </nav>

      <div hidden={activeView !== "scenario"}>
        <MineflayerWorkflow connected={chatConnected} status={status} gatheringSettings={settings.gathering} refresh={monitor.refresh} onOpenConnection={() => openSettings("connection")} onOpenStorage={() => openSettings("gathering")} />
      </div>
      {activeView === "settings" && <nav className="mf-settings-nav" aria-label="Разделы настроек">{SETTINGS_SECTIONS.map(section => <button key={section.id} type="button" aria-current={settingsSection === section.id ? "page" : undefined} className={settingsSection === section.id ? "active" : ""} onClick={() => setSettingsSection(section.id)}>{section.label}</button>)}</nav>}
      <div className="mineflayer-bot-section" key={activeSection}>
        {activeSection === "gathering" && <MineflayerGatheringControls connected={chatConnected} refresh={monitor.refresh} status={status} settings={settings.gathering} onSettingsChange={(gathering) => update({ gathering })} onOpenInventory={() => setActiveView("inventory")} />}
        {activeSection === "inventory" && <MineflayerInventoryPanel status={status} onOpenTasks={() => setActiveView("scenario")} />}
        {activeSection === "production" && <MineflayerProductionControls connected={chatConnected} refresh={monitor.refresh} status={status} />}
        {activeSection === "connection" && (
          <div className="mineflayer-bot-connection-grid">
            <PluginSettingsGroup title="СЕРВЕР" collapsible={false}>
              <div className="mineflayer-bot-grid">
                <label className="mineflayer-bot-field mineflayer-bot-field--wide">
                  <span>АДРЕС СЕРВЕРА</span>
                  <input
                    value={settings.host}
                    placeholder="localhost или play.example.net"
                    spellCheck={false}
                    onChange={(event) => update({ host: event.target.value })}
                  />
                </label>

                <label className="mineflayer-bot-field">
                  <span>ПОРТ</span>
                  <CustomNumberInput
                    ariaLabel="ПОРТ"
                    background="transparent"
                    min={1}
                    max={65535}
                    value={settings.port}
                    onChange={(port) => update({ port })}
                  />
                </label>

                <label className="mineflayer-bot-field">
                  <span>ВЕРСИЯ</span>
                  <input
                    value={settings.version}
                    placeholder="Авто"
                    spellCheck={false}
                    onChange={(event) => update({ version: event.target.value })}
                  />
                </label>
              </div>
            </PluginSettingsGroup>
            <PluginSettingsGroup title="АККАУНТ БОТА" collapsible={false}>
              <div className="mineflayer-bot-mode" role="group">
                <button
                  type="button"
                  aria-pressed={settings.botAccountMode === "offline"}
                  className={settings.botAccountMode === "offline" ? "active" : ""}
                  onClick={() => update({ botAccountMode: "offline" })}
                >
                  ОФЛАЙН
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
                  <span>НИК БОТА</span>
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
                      Нет аккаунтов Microsoft. Добавьте отдельный аккаунт в лаунчере.
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
                  Выбран аккаунт активного игрока. Для бота нужен отдельный аккаунт.
                </div>
              )}
            </PluginSettingsGroup>
            <PluginSettingsGroup title="ПОВТОРНОЕ ПОДКЛЮЧЕНИЕ" collapsible={false}>
              <div className="mineflayer-bot-toggle-grid">
                <SettingToggle
                  label="АВТОПЕРЕПОДКЛЮЧЕНИЕ"
                  description="Возвращаться после разрыва соединения"
                  checked={settings.autoReconnect}
                  onChange={(autoReconnect) => update({ autoReconnect })}
                />
                <SettingToggle
                  label="АВТОВОЗРОЖДЕНИЕ"
                  description="Возрождаться после смерти"
                  checked={settings.autoRespawn}
                  onChange={(autoRespawn) => update({ autoRespawn })}
                />
              </div>

              <div className="mineflayer-bot-grid mineflayer-bot-grid--three">
                <label className="mineflayer-bot-field">
                  <span>ЗАДЕРЖКА ПОВТОРА · СЕК</span>
                  <CustomNumberInput
                    ariaLabel="ЗАДЕРЖКА ПОВТОРА · СЕК"
                    background="transparent"
                    min={1}
                    max={300}
                    disabled={!settings.autoReconnect}
                    value={settings.reconnectDelaySeconds}
                    onChange={(reconnectDelaySeconds) => update({ reconnectDelaySeconds })}
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>ПОПЫТКИ · 0 = БЕЗ ЛИМИТА</span>
                  <CustomNumberInput
                    ariaLabel="ПОПЫТКИ · 0 = БЕЗ ЛИМИТА"
                    background="transparent"
                    min={0}
                    max={100}
                    disabled={!settings.autoReconnect}
                    value={settings.maxReconnectAttempts}
                    onChange={(maxReconnectAttempts) => update({ maxReconnectAttempts })}
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>ТАЙМАУТ ВХОДА · СЕК</span>
                  <CustomNumberInput
                    ariaLabel="ТАЙМАУТ ВХОДА · СЕК"
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
              <span>ПРОФИЛЬ ДВИЖЕНИЯ</span>
            </div>

            <div className="mineflayer-bot-presets">
              {MOVEMENT_PRESETS.map((preset) => (
                <button key={preset.id} type="button" onClick={() => update(preset.patch)}>
                  <strong>{preset.label}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>

            <PluginSettingsGroup title="ДВИЖЕНИЕ И МАРШРУТ" collapsible={false}>
              <div className="mineflayer-bot-grid mineflayer-bot-grid--three">
                <label className="mineflayer-bot-field">
                  <span>ДИСТАНЦИЯ СЛЕДОВАНИЯ</span>
                  <CustomNumberInput
                    ariaLabel="ДИСТАНЦИЯ СЛЕДОВАНИЯ"
                    background="transparent"
                    min={1}
                    max={16}
                    value={settings.followDistance}
                    onChange={(followDistance) => update({ followDistance })}
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>РАДИУС ПРИБЫТИЯ</span>
                  <CustomNumberInput
                    ariaLabel="РАДИУС ПРИБЫТИЯ"
                    background="transparent"
                    min={1}
                    max={16}
                    value={settings.gotoRadius}
                    onChange={(gotoRadius) => update({ gotoRadius })}
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>МАКСИМАЛЬНАЯ ВЫСОТА ПАДЕНИЯ</span>
                  <CustomNumberInput
                    ariaLabel="МАКСИМАЛЬНАЯ ВЫСОТА ПАДЕНИЯ"
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
                  label="СПРИНТ"
                  description="Бежать на прямых участках"
                  checked={settings.allowSprinting}
                  onChange={(allowSprinting) => update({ allowSprinting })}
                />
                <SettingToggle
                  label="ПРЫЖКИ ПОД НИЗКИМ ПОТОЛКОМ"
                  description="Частые спринт-прыжки в тоннелях высотой два блока и под листвой · нужен спринт"
                  checked={settings.allowLowCeilingJumps}
                  onChange={(allowLowCeilingJumps) => update({ allowLowCeilingJumps })}
                />
                <SettingToggle
                  label="ПАРКУР"
                  description="Перепрыгивать небольшие разрывы"
                  checked={settings.allowParkour}
                  onChange={(allowParkour) => update({ allowParkour })}
                />
                <SettingToggle
                  label="РАЗРУШЕНИЕ БЛОКОВ"
                  description="Разрешает боту изменять мир"
                  checked={settings.canDig}
                  warning
                  onChange={(canDig) => update({ canDig })}
                />
                <SettingToggle
                  label="ПОВОРОТ В ПРЫЖКЕ"
                  description="Поворот на 45° для дальнего прыжка"
                  checked={settings.allowAirStrafe}
                  onChange={(allowAirStrafe) => update({ allowAirStrafe })}
                />
                <SettingToggle
                  label="ПЛАВАНИЕ"
                  description="Плыть быстро и сохранять воздух"
                  checked={settings.stayOnWater}
                  onChange={(stayOnWater) => update({ stayOnWater })}
                />
                <SettingToggle
                  label="WATER DROP В ВОДОЁМ"
                  description="Прыгать в воду после проверки траектории"
                  checked={settings.allowWaterDrop}
                  onChange={(allowWaterDrop) => update({ allowWaterDrop })}
                />
                <SettingToggle
                  label="WATER DROP С ВЕДРОМ"
                  description="Ставить воду перед приземлением и забирать её"
                  checked={settings.allowBucketWaterDrop}
                  onChange={(allowBucketWaterDrop) => update({ allowBucketWaterDrop })}
                />
                <SettingToggle
                  label="ОТЛАДКА МАРШРУТА"
                  description="Записывать изменения пути в журнал"
                  checked={settings.logPathUpdates}
                  onChange={(logPathUpdates) => update({ logPathUpdates })}
                />
                <SettingToggle
                  label="АНТИОТБРАСЫВАНИЕ"
                  description="БЛОКИРОВАТЬ ТОЛЧКИ И УДАРЫ · ПОСЛЕ ПЕРЕЗАПУСКА БОТА"
                  checked={settings.antiKnockback}
                  onChange={(antiKnockback) => update({ antiKnockback })}
                />
              </div>
            </PluginSettingsGroup>
            <PluginSettingsGroup title="ПОСЛЕ ВХОДА НА СЕРВЕР" collapsible={false}>
              <div className="mineflayer-bot-toggle-grid">
                <SettingToggle
                  label="СЛЕДОВАТЬ ЗА ВЛАДЕЛЬЦЕМ"
                  description="Начинать движение после входа"
                  checked={settings.autoFollowOnSpawn}
                  onChange={(autoFollowOnSpawn) => update({ autoFollowOnSpawn })}
                />
              </div>
              <PluginSettingsGroup
                title="СООБЩЕНИЕ ПРИ ВХОДЕ"
                description="Текст приветствия и плейсхолдеры"
                enabled={settings.announceOnSpawn}
                onToggle={() => update({ announceOnSpawn: !settings.announceOnSpawn })}
              >
                <label className="mineflayer-bot-field mineflayer-bot-field--full">
                  <span>ТЕКСТ СООБЩЕНИЯ</span>
                  <input
                    value={settings.spawnMessage}
                    maxLength={200}
                    placeholder="Готов, %owner%!"
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
              title="АВТОЕДА"
              description="Безопасная пища из инвентаря · настройки применяются после перезапуска бота"
              enabled={settings.survival.autoEat}
              onToggle={() => update({ survival: { ...settings.survival, autoEat: !settings.survival.autoEat } })}
            >
              <div className="mineflayer-bot-grid">
                <label className="mineflayer-bot-field">
                  <span>ЕСТЬ ПРИ ГОЛОДЕ ≤ · ИЗ 20</span>
                  <CustomNumberInput ariaLabel="ЕСТЬ ПРИ ГОЛОДЕ" background="transparent" min={1} max={19}
                    value={settings.survival.autoEatMinHunger}
                    onChange={(autoEatMinHunger) => update({ survival: { ...settings.survival, autoEatMinHunger } })} />
                </label>
                <label className="mineflayer-bot-field">
                  <span>ЕСТЬ ПРИ ЗДОРОВЬЕ ≤ · ИЗ 20</span>
                  <CustomNumberInput ariaLabel="ЕСТЬ ПРИ ЗДОРОВЬЕ" background="transparent" min={1} max={20}
                    value={settings.survival.autoEatMinHealth}
                    onChange={(autoEatMinHealth) => update({ survival: { ...settings.survival, autoEatMinHealth } })} />
                </label>
                <div className="mineflayer-bot-field mineflayer-bot-field--full">
                  <span>ВЫБОР ЕДЫ</span>
                  <div className="mineflayer-bot-mode" role="group" aria-label="ВЫБОР ЕДЫ">
                    {(["saturation", "foodPoints"] as const).map((priority) => (
                      <button key={priority} type="button" aria-pressed={settings.survival.autoEatPriority === priority}
                        className={settings.survival.autoEatPriority === priority ? "active" : ""}
                        onClick={() => update({ survival: { ...settings.survival, autoEatPriority: priority } })}>
                        {priority === "saturation" ? "Больше насыщения" : "Больше очков голода"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mineflayer-bot-combat-note">Бот делает паузу для еды и возвращает прежний предмет. Опасная еда и золотые яблоки сохраняются. При полном голоде обычная еда не используется.</p>
            </PluginSettingsGroup>
            <PluginSettingsGroup
              title="АВТОБАФЫ И ЛЕЧЕБНЫЕ ЗЕЛЬЯ"
              description="Зелья из инвентаря в бою · настройки применяются после перезапуска бота"
              enabled={settings.survival.autoBuff}
              onToggle={() => update({ survival: { ...settings.survival, autoBuff: !settings.survival.autoBuff } })}
            >
              <SettingToggle label="ЛЕЧЕБНЫЕ ЗЕЛЬЯ" description="Мгновенное лечение и регенерация при низком здоровье"
                checked={settings.survival.autoBuffHealing}
                onChange={(autoBuffHealing) => update({ survival: { ...settings.survival, autoBuffHealing } })} />
              <SettingToggle label="БОЕВЫЕ УСИЛЕНИЯ" description="Сила, скорость и огнестойкость при безопасной дистанции"
                checked={settings.survival.autoBuffCombat}
                onChange={(autoBuffCombat) => update({ survival: { ...settings.survival, autoBuffCombat } })} />
              <div className="mineflayer-bot-grid">
                <label className="mineflayer-bot-field">
                  <span>ЛЕЧИТЬСЯ ПРИ ЗДОРОВЬЕ ≤ · HP</span>
                  <CustomNumberInput ariaLabel="ЗДОРОВЬЕ ДЛЯ ЛЕЧЕБНОГО ЗЕЛЬЯ" background="transparent" min={1} max={20}
                    value={settings.survival.autoBuffMinHealth}
                    onChange={(autoBuffMinHealth) => update({ survival: { ...settings.survival, autoBuffMinHealth } })} />
                </label>
              </div>
              <p className="mineflayer-bot-combat-note">Бот использует питьевые и взрывные зелья, учитывает действующие эффекты и возвращает оружие. Взрывные зелья бросаются под ноги вдали от других существ. Туманные зелья сохраняются. Адаптивный бой помогает отойти для лечения.</p>
            </PluginSettingsGroup>
            <PluginSettingsGroup
              title="АВАРИЙНЫЙ MLG"
              description="Спасение ведром воды при случайном падении или отбрасывании"
              enabled={settings.survival.emergencyMlg}
              onToggle={() => update({ survival: { ...settings.survival, emergencyMlg: !settings.survival.emergencyMlg } })}
            >
              <div className="mineflayer-bot-grid">
                <label className="mineflayer-bot-field">
                  <span>МИНИМАЛЬНОЕ ПАДЕНИЕ · БЛОКИ</span>
                  <CustomNumberInput ariaLabel="МИНИМАЛЬНОЕ ПАДЕНИЕ ДЛЯ MLG" background="transparent" min={4} max={32}
                    value={settings.survival.mlgMinFallHeight}
                    onChange={(mlgMinFallHeight) => update({ survival: { ...settings.survival, mlgMinFallHeight } })} />
                </label>
              </div>
              <SettingToggle label="ЗАБИРАТЬ ВОДУ ПОСЛЕ MLG" description="Только свой источник и только после приземления"
                checked={settings.survival.mlgPickupWater}
                onChange={(mlgPickupWater) => update({ survival: { ...settings.survival, mlgPickupWater } })} />
              <p className="mineflayer-bot-combat-note">Нужно ведро воды в инвентаре. Бот рассчитывает траекторию с учётом скорости и препятствий. В Нижнем мире вода не ставится. Плановые Water Drop настраиваются во вкладке «Поведение».</p>
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
            <PluginSettingsGroup title="ДОСТУП К КОМАНДАМ" collapsible={false}>
              <div className="mineflayer-bot-grid">
                <label className="mineflayer-bot-field">
                  <span>ПРЕФИКС КОМАНД</span>
                  <input
                    value={settings.commandPrefix}
                    maxLength={8}
                    spellCheck={false}
                    onChange={(event) => update({ commandPrefix: event.target.value })}
                  />
                </label>
                <label className="mineflayer-bot-field">
                  <span>ПЕРЕРЫВ МЕЖДУ КОМАНДАМИ · МС</span>
                  <CustomNumberInput
                    ariaLabel="ПЕРЕРЫВ МЕЖДУ КОМАНДАМИ · МС"
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
                      ? "Общий чат"
                      : source === "whisper"
                        ? "Личные сообщения"
                        : "Оба канала"}
                  </button>
                ))}
              </div>

              <label className="mineflayer-bot-field mineflayer-bot-field--full">
                <span>ДОПОЛНИТЕЛЬНЫЕ ВЛАДЕЛЬЦЫ · ЧЕРЕЗ ЗАПЯТУЮ ИЛИ С НОВОЙ СТРОКИ</span>
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
                  label="ОТВЕТЫ В ЧАТ"
                  description="Подтверждать команды в игре"
                  checked={settings.sendChatFeedback}
                  onChange={(sendChatFeedback) => update({ sendChatFeedback })}
                />
                <SettingToggle
                  label="КОМАНДА SAY"
                  description="Владелец может писать от имени бота"
                  checked={settings.allowSayCommand}
                  warning
                  onChange={(allowSayCommand) => update({ allowSayCommand })}
                />
                <SettingToggle
                  label="КОМАНДА QUIT"
                  description="Владелец может отключить бота"
                  checked={settings.allowQuitCommand}
                  warning
                  onChange={(allowQuitCommand) => update({ allowQuitCommand })}
                />
              </div>
            </PluginSettingsGroup>
            <PluginSettingsGroup title="СПРАВОЧНИК КОМАНД" collapsible={false}>
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
            <div className="mf-journal-controls" role="group" aria-label="Подключение бота">
              {connectionControls}
              <button type="button" className="mf-button" disabled={Boolean(busyAction)} onClick={() => void refreshBotStatus()}>
                Обновить статус
              </button>
            </div>
            <div className="mineflayer-bot-status">
              <div>
                <span>СОСТОЯНИЕ</span>
                <strong>{formatStatusValue(status?.state)}</strong>
              </div>
              <div>
                <span>PID</span>
                <strong>{formatStatusValue(status?.pid)}</strong>
              </div>
              <div>
                <span>СЕРВЕР</span>
                <strong>{formatStatusValue(status?.server)}</strong>
              </div>
              <div>
                <span>ВЛАДЕЛЕЦ</span>
                <strong>{formatStatusValue(status?.ownerName)}</strong>
              </div>
              <div>
                <span>БОТ</span>
                <strong>
                  {formatStatusValue(
                    status?.botUsername ?? activeBotMsAccount?.username ?? settings.botNickname,
                  )}
                </strong>
              </div>
            </div>

            <PluginSettingsGroup title="ЧАТ И КОМАНДЫ БОТА" description="forest — рубить лес, deliver — принести добычу, craft — крафтить, smelt — переплавлять, station — работать со станками. Эти команды работают и без префикса. Остальной текст идёт в игровой чат." collapsible={false}>
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
                    aria-label="Сообщение от имени бота"
                    placeholder={chatConnected ? "Введите сообщение…" : "Подключите бота к серверу"}
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
                  {chatSending ? "Отправка…" : "Отправить"}
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

            <PluginSettingsGroup title="ЖУРНАЛ СОБЫТИЙ" collapsible={false}>
              <CustomScrollArea
                className="mineflayer-bot-log"
                style={{ minHeight: 150 }}
                tabIndex={0}
                aria-label="Журнал событий"
              >
                <div className="mineflayer-bot-log-lines" aria-live="polite">
                  {(status?.logs ?? []).length === 0 ? (
                    <span>Пока нет событий</span>
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
