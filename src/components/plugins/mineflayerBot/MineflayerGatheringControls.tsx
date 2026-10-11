import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { ElementToggle } from "../../inputs/ElementToggle";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { toErrorMessage } from "../../../utils/errors";
import type { MineflayerBotStatus } from "../../../types";
import { openUrl } from "@tauri-apps/plugin-opener";

type Mode = "mine" | "forest" | "quarry" | "collect" | "tunnel";
const MODES: Array<[Mode, string]> = [
  ["mine", "Блоки и руды"],
  ["forest", "Лес"],
  ["quarry", "Область"],
  ["collect", "Дроп"],
  ["tunnel", "Туннель"],
];

export function MineflayerGatheringControls({
  connected,
  refresh,
  status,
}: {
  connected: boolean;
  refresh: () => Promise<unknown>;
  status: MineflayerBotStatus | null;
}) {
  const [mode, setMode] = useState<Mode>("forest");
  const [blocks, setBlocks] = useState("iron");
  const [count, setCount] = useState(0),
    [radius, setRadius] = useState(16);
  const [leaves, setLeaves] = useState(false),
    [scaffold, setScaffold] = useState(true);
  const [corner1, setCorner1] = useState(""),
    [corner2, setCorner2] = useState("");
  const [item, setItem] = useState(""),
    [stash, setStash] = useState("");
  const [length, setLength] = useState(16),
    [width, setWidth] = useState(2),
    [height, setHeight] = useState(3);
  const [sending, setSending] = useState(false),
    [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const sendingRef = useRef(false);
  const disabled = !connected || sending;
  const command =
    mode === "mine"
      ? `mine ${blocks.trim()} ${count} ${radius}`
      : mode === "forest"
        ? `forest ${radius} ${count} ${leaves ? "leaves" : "logs"} ${scaffold ? "scaffold" : "plain"}`
        : mode === "quarry"
          ? `quarry ${corner1.trim()} ${corner2.trim()}`
          : mode === "tunnel"
            ? `tunnel ${length} ${width} ${height}`
            : `collect ${radius} ${item.trim()}`;

  async function send(value: string) {
    if (!connected || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    setFeedback("");
    try {
      await invoke("send_mineflayer_bot_chat", { message: value.trim(), command: true });
      setFeedback(
        value === "deliver"
          ? "Бот несёт добычу к вам, затем вернётся к работе."
          : "Команда принята. Текущий этап показан ниже.",
      );
      await refresh();
    } catch (failure) {
      setError(toErrorMessage(failure));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  const number = (
    label: string,
    value: number,
    change: (value: number) => void,
    min: number,
    max: number,
  ) => (
    <label className="mineflayer-bot-field">
      <span>{label}</span>
      <CustomNumberInput
        ariaLabel={label}
        background="transparent"
        min={min}
        max={max}
        value={value}
        onChange={change}
      />
    </label>
  );
  const text = (
    label: string,
    value: string,
    change: (value: string) => void,
    placeholder: string,
  ) => (
    <label className="mineflayer-bot-field">
      <span>{label}</span>
      <input
        value={value}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => change(event.target.value)}
      />
    </label>
  );
  return (
    <PluginSettingsGroup
      title="ДОБЫЧА И ИНВЕНТАРЬ"
      description="1. Выберите работу. 2. Нажмите «Начать». 3. Заберите добычу кнопкой «Принести мне». Сундук не требуется."
      collapsible={false}
    >
      {!connected && (
        <p role="status" className="mineflayer-bot-combat-note">
          Сначала подключите бота: вкладка «Управление» → «Запустить».
        </p>
      )}
      <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
        <button type="button" disabled={disabled} onClick={() => void send("deliver")}>
          ПРИНЕСТИ МНЕ ДОБЫЧУ
        </button>
        <button
          type="button"
          disabled={!connected || !status?.inventoryUrl}
          onClick={() => {
            if (status?.inventoryUrl)
              void openUrl(status.inventoryUrl).catch((failure) =>
                setError(toErrorMessage(failure)),
              );
          }}
        >
          ОТКРЫТЬ ВЕБ-ИНВЕНТАРЬ
        </button>
      </div>
      <div className="mineflayer-bot-gathering-progress" role="status" aria-live="polite">
        <strong>
          {status?.gathering
            ? {
                idle: "Готов к работе",
                scan: "Ищет блоки",
                move: "Идёт к блоку",
                equip: "Выбирает инструмент",
                dig: "Копает",
                pickup: "Подбирает добычу",
                deposit: "Выгружает",
                deliver: "Несёт добычу к вам",
                return: "Возвращается к работе",
                paused: "Работа на паузе",
              }[status.gathering.phase] || status.gathering.phase
            : "Выберите работу и нажмите «Начать»"}
        </strong>
        {status?.gathering && (
          <span>
            Добыто: {status.gathering.mined} · Подобрано: {status.gathering.collected} · В очереди:{" "}
            {status.gathering.queued}
          </span>
        )}
        {status?.gathering?.reason && <p>{status.gathering.reason}</p>}
      </div>
      <div
        className="mineflayer-bot-mode mineflayer-bot-gathering-modes"
        role="group"
        aria-label="Вид работы"
      >
        {MODES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={mode === value ? "active" : ""}
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(command);
        }}
      >
        <fieldset className="mineflayer-bot-gathering-fields" disabled={disabled}>
          <div className="mineflayer-bot-grid">
            {mode === "mine" &&
              text("БЛОКИ ИЛИ ГРУППА", blocks, setBlocks, "iron,diamond / ores / stone")}
            {(mode === "mine" || mode === "forest") &&
              number("КОЛИЧЕСТВО БЛОКОВ · 0 = ВСЕ", count, setCount, 0, 1000000)}
            {mode !== "quarry" &&
              mode !== "tunnel" &&
              number("РАДИУС · БЛОКИ", radius, setRadius, 1, 64)}
            {mode === "collect" && text("ПРЕДМЕТ · ПУСТО = ВСЕ", item, setItem, "raw_iron")}
            {mode === "quarry" && (
              <>
                {text("ПЕРВЫЙ УГОЛ · X Y Z", corner1, setCorner1, "100 64 100")}
                {text("ВТОРОЙ УГОЛ · X Y Z", corner2, setCorner2, "110 70 110")}
              </>
            )}
            {mode === "tunnel" && (
              <>
                {number("ДЛИНА", length, setLength, 1, 128)}
                {number("ШИРИНА", width, setWidth, 1, 8)}
                {number("ВЫСОТА", height, setHeight, 2, 8)}
              </>
            )}
          </div>
          {mode === "forest" && (
            <div className="mineflayer-bot-toggle-grid">
              <ElementToggle
                title="УБИРАТЬ ЛИСТВУ"
                note="Вместе со стволами"
                enabled={leaves}
                onToggle={() => setLeaves(!leaves)}
              />
              <ElementToggle
                title="ПОДСТАВЛЯТЬ БЛОКИ ДЛЯ ВЫСОКИХ ДЕРЕВЬЕВ"
                note="Использует блоки из инвентаря"
                enabled={scaffold}
                onToggle={() => setScaffold(!scaffold)}
              />
            </div>
          )}
          <p className="mineflayer-bot-combat-note">
            {mode === "mine"
              ? "Для подхода к руде бот может прокладывать путь внутри радиуса. Количество считается в разрушенных целевых блоках."
              : mode === "forest"
                ? "Срубает стволы выбранного леса. Для подъёма нужны строительные блоки; при спуске разбирает опоры под собой. Остальные опоры остаются."
                : mode === "quarry"
                  ? "Расчищает включительно между углами, сверху вниз. Максимум 32 768 блоков."
                  : mode === "tunnel"
                    ? "Копает вперёд по направлению взгляда бота. Пол под туннелем сохраняется."
                    : "Подбирает лежащие предметы в заданном радиусе."}
          </p>
          <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
            <button
              type="submit"
              disabled={
                disabled ||
                (mode === "mine" && !blocks.trim()) ||
                (mode === "quarry" && (!corner1.trim() || !corner2.trim()))
              }
            >
              {status?.gathering?.kind ? "ДОБАВИТЬ СЛЕДУЮЩУЮ ЗАДАЧУ" : "НАЧАТЬ"}
            </button>
          </div>
        </fieldset>
      </form>
      <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
        {[
          ["work status", "ПРОГРЕСС"],
          ["work queue", "ОЧЕРЕДЬ"],
          ["work pause", "ПАУЗА"],
          ["work resume", "ПРОДОЛЖИТЬ"],
          ["work stop", "ОТМЕНИТЬ ВСЁ"],
        ].map(([value, label]) => (
          <button key={value} type="button" disabled={disabled} onClick={() => void send(value)}>
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="mineflayer-bot-gathering-advanced"
        aria-expanded={advanced}
        onClick={() => setAdvanced(!advanced)}
      >
        {advanced ? "СКРЫТЬ НАСТРОЙКУ СУНДУКА" : "ДОПОЛНИТЕЛЬНО: СУНДУК"}
      </button>
      {advanced && (
        <div className="mineflayer-bot-grid">
          {text("СУНДУК ДЛЯ ВЫГРУЗКИ · X Y Z", stash, setStash, "100 64 98")}
          <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
            <button
              type="button"
              disabled={disabled || !stash.trim()}
              onClick={() => void send(`stash ${stash}`)}
            >
              ЗАДАТЬ СУНДУК
            </button>
            <button type="button" disabled={disabled} onClick={() => void send("deposit")}>
              ВЫГРУЗИТЬ
            </button>
          </div>
        </div>
      )}
      <p className="mineflayer-bot-combat-note">
        Добыча хранится в инвентаре бота. «Принести мне добычу» — подходит к владельцу, выбрасывает
        добычу перед ним и возвращается. Инструменты, броня и еда сохраняются. Если инвентарь
        заполнен, бот ждёт передачи добычи. Сундук можно настроить дополнительно.
      </p>
      {(error || feedback) && (
        <p
          className={`mineflayer-bot-chat-feedback${error ? " is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error || feedback}
        </p>
      )}
    </PluginSettingsGroup>
  );
}
