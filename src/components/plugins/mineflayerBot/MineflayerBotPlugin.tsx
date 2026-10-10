import { useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MineflayerBotPluginSettings, MineflayerBotStatus } from "../../../types";
import type { PluginRenderContext, PluginSettingsProps } from "../pluginTypes";
import { normalizeMineflayerBotSettings } from "../pluginSettings";
import { toErrorMessage } from "../../../utils/errors";
import { useRuntimeMonitor } from "../../../hooks/useRuntimeMonitor";
import { PlaceholderGuideButton } from "../../placeholders/PlaceholderGuideButton";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { ElementToggle } from "../../inputs/ElementToggle";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { MineflayerCombatSettingsEditor } from "./MineflayerCombatSettings";
import "./MineflayerBotPlugin.css";

type CommandSource = MineflayerBotPluginSettings["commandSource"];
type SettingsSection = "connection" | "behavior" | "combat" | "commands" | "control";

const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "connection", label: "Подключение" },
  { id: "behavior", label: "Поведение" },
  { id: "combat", label: "Бой и предметы" },
  { id: "commands", label: "Команды" },
  { id: "control", label: "Управление" },
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
      setChatFeedback("Сообщение отправлено");
      void monitor.refresh();
    } catch (error) {
      setChatError(toErrorMessage(error));
    } finally {
      chatSendingRef.current = false;
      setChatSending(false);
      chatInputRef.current?.focus();
    }
  };

  return (
    <div className="mineflayer-bot-settings">
      <nav className="mineflayer-bot-tabs" aria-label="Разделы настроек Mineflayer">
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={activeSection === section.id ? "page" : undefined}
            className={activeSection === section.id ? "active" : ""}
            onClick={(event) => {
              setActiveSection(section.id);
              event.currentTarget.closest(".csa-content")?.scrollTo({ top: 0 });
            }}
          >
            <strong>{section.label}</strong>
          </button>
        ))}
      </nav>

      <div className="mineflayer-bot-section" key={activeSection}>
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
              className={`mineflayer-bot-live ${status?.running ? "mineflayer-bot-live--online" : ""}`}
            >
              <span className="mineflayer-bot-live-dot" aria-hidden="true" />
              <div>
                <span>СОСТОЯНИЕ</span>
                <strong>{formatStatusValue(status?.state)}</strong>
              </div>
              <div>
                <span>СЕРВЕР</span>
                <strong>{formatStatusValue(status?.server || settings.host)}</strong>
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

            <div className="mineflayer-bot-subhead">
              <span>УПРАВЛЕНИЕ БОТОМ</span>
              <small>{busyAction || "ГОТОВ"}</small>
            </div>

            <div className="mineflayer-bot-controls">
              <button type="button" disabled={!canStart} onClick={() => void startBot()}>
                ЗАПУСТИТЬ
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction) || !status?.running}
                onClick={() => void restartBot()}
              >
                ПЕРЕЗАПУСТИТЬ
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction) || !status?.running}
                onClick={() => void stopBot()}
              >
                ОСТАНОВИТЬ
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => void monitor.refresh()}
              >
                ОБНОВИТЬ
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

            <PluginSettingsGroup title="ЧАТ БОТА" collapsible={false}>
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
              <div className="mineflayer-bot-log" aria-live="polite">
                {(status?.logs ?? []).length === 0 ? (
                  <span>Пока нет событий</span>
                ) : (
                  status?.logs
                    .slice(-20)
                    .map((line, index) => <span key={`${line}-${index}`}>{line}</span>)
                )}
              </div>
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
