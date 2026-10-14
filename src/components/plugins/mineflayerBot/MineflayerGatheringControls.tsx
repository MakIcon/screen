import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { ElementToggle } from "../../inputs/ElementToggle";
import { MinecraftSearchField } from "../../inputs/MinecraftSearchField";
import { MineflayerStorageGroups } from "./MineflayerStorageGroups";
import { minecraftSelectedNames } from "../../inputs/minecraftSearch";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { toErrorMessage } from "../../../utils/errors";
import bundledCatalog from "../../../data/minecraftCatalog.json";
import {
  formatBlockCoordinates,
  parseBlockCoordinates,
  gatheringAreaPreview,
} from "./gatheringCoordinates";
import type {
  MineflayerBotStatus,
  MineflayerWorkTask,
  MineflayerGatheringSettings,
  MinecraftCatalog,
} from "../../../types";

type Mode = "mine" | "forest" | "quarry" | "collect" | "tunnel";
const MODES: Array<[Mode, string]> = [
  ["mine", "Блоки и руды"],
  ["forest", "Лес"],
  ["quarry", "Область"],
  ["collect", "Дроп"],
  ["tunnel", "Туннель"],
];
const PHASES: Record<string, string> = {
  idle: "Готов к работе",
  scan: "Ищет блоки",
  move: "Подходит к блоку",
  equip: "Выбирает инструмент",
  dig: "Добывает",
  pickup: "Подбирает добычу",
  deposit: "Выгружает",
  deliver: "Несёт добычу к вам",
  return: "Возвращается",
  paused: "На паузе",
};
const OFFLINE_CATALOG = bundledCatalog as MinecraftCatalog;
function WorkCancelIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <path d="m4 4 8 8m0-8-8 8" />
    </svg>
  );
}
export function workTaskTitle(task: MineflayerWorkTask) {
  if (task.tunnel) return "Проходка тоннеля";
  if (task.kind === "forest") return "Заготовка леса";
  if (task.kind === "quarry") return "Расчистка области";
  if (task.kind === "collect") return "Сбор предметов";
  if (task.kind === "deposit") return "Выгрузка в сундук";
  if (task.kind === "deliver") return "Доставка владельцу";
  const labels: Record<string, string> = {
    iron: "железо",
    diamond: "алмазы",
    gold: "золото",
    coal: "уголь",
    copper: "медь",
    emerald: "изумруды",
    redstone: "редстоун",
    lapis: "лазурит",
  };
  const names = [
    ...new Set(
      (task.names || []).map((name) =>
        name.replace(/^deepslate_|^nether_/, "").replace(/_ore$/, ""),
      ),
    ),
  ];
  return `Добыча · ${names.length > 3 ? "руды" : names.map((name) => labels[name] || name).join(", ") || "блоки"}`;
}
function taskDetail(task: MineflayerWorkTask) {
  const values = [];
  if (task.radius) values.push(`радиус ${task.radius} блоков`);
  if (task.kind === "mine") values.push(`Y ${task.minY}…${task.maxY}`);
  if (task.area) values.push(`${task.area.volume.toLocaleString("ru-RU")} блоков в области`);
  if (task.item) values.push(task.item);
  if (["mine", "forest"].includes(task.kind))
    values.push(task.count ? `цель ${task.count} блоков` : "все доступные блоки");
  return values.join(" · ");
}

export function MineflayerGatheringControls({
  connected,
  refresh,
  status,
  onOpenInventory,
  settings,
  onSettingsChange,
}: {
  connected: boolean;
  refresh: () => Promise<unknown>;
  status: MineflayerBotStatus | null;
  onOpenInventory: () => void;
  settings: MineflayerGatheringSettings;
  onSettingsChange: (settings: MineflayerGatheringSettings) => void;
}) {
  const [mode, setMode] = useState<Mode>("forest");
  const [blocks, setBlocks] = useState("iron");
  const [count, setCount] = useState(0),
    [radius, setRadius] = useState(16);
  const [leaves, setLeaves] = useState(false),
    [scaffold, setScaffold] = useState(true);
  const [corner1, setCorner1] = useState(""),
    [corner2, setCorner2] = useState("");
  const [item, setItem] = useState("");
  const [length, setLength] = useState(16);
  const [sending, setSending] = useState(false),
    [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [autoDepth, setAutoDepth] = useState(true),
    [minY, setMinY] = useState(-64),
    [maxY, setMaxY] = useState(64);
  const [showForm, setShowForm] = useState(true);
  const sendingRef = useRef(false);
  const disabled = !connected || sending;
  const [liveCatalog, setLiveCatalog] = useState<MinecraftCatalog | null>(null);
  const catalog = connected && liveCatalog ? liveCatalog : OFFLINE_CATALOG;
  const selection = connected ? status?.gathering?.selection : undefined;
  const capturedFirst = formatBlockCoordinates(selection?.areas.launcher?.[1]);
  const capturedSecond = formatBlockCoordinates(selection?.areas.launcher?.[2]);
  useEffect(() => {
    if (capturedFirst) setCorner1(capturedFirst);
  }, [capturedFirst]);
  useEffect(() => {
    if (capturedSecond) setCorner2(capturedSecond);
  }, [capturedSecond]);
  const first = parseBlockCoordinates(corner1),
    second = parseBlockCoordinates(corner2);
  const areaPreview = gatheringAreaPreview(corner1, corner2);
  useEffect(() => {
    let cancelled = false;
    setLiveCatalog(null);
    if (connected)
      void invoke<MinecraftCatalog | null>("get_minecraft_catalog")
        .then((value) => {
          if (!cancelled && value) {
            setLiveCatalog(value);
          }
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connected, status?.pid]);
  const command =
    mode === "mine"
      ? `mine ${minecraftSelectedNames(blocks).join(",")} ${count} ${radius}${autoDepth ? "" : ` ${minY} ${maxY}`}`
      : mode === "forest"
        ? `forest ${radius} ${count} ${leaves ? "leaves" : "logs"} ${scaffold ? "scaffold" : "plain"}`
        : mode === "quarry"
          ? `quarry ${formatBlockCoordinates(first)} ${formatBlockCoordinates(second)}`
          : mode === "tunnel"
            ? `tunnel ${length} ${settings.tunnelWidth} ${settings.tunnelHeight}`
            : `collect ${radius} ${item.trim()}`;

  const passageCommand = `work tunnels ${settings.tunnelWidth} ${settings.tunnelHeight} ${settings.stairWidth} ${settings.stairHeight} ${settings.placeTorches ? "on" : "off"} ${settings.torchInterval}`;
  const defenseCommand = `work defense ${settings.defendMobs ? "on" : "off"} ${settings.defendPlayers ? "on" : "off"} ${settings.defendArrows ? "on" : "off"}`;
  const updatePassages = (patch: Partial<MineflayerGatheringSettings>) =>
    onSettingsChange({ ...settings, ...patch });
  async function send(value: string, capture?: "1" | "2") {
    if (!connected || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    setFeedback("");
    try {
      if (
        /^(mine|forest|quarry|collect|tunnel|deposit|deliver)( |$)/.test(value) ||
        value === "work resume"
      ) {
        await invoke("configure_mineflayer_bot_storage", { groups: settings.storageGroups });
        await invoke("send_mineflayer_bot_chat", { message: defenseCommand, command: true });
      }
      if (/^(mine|tunnel) /.test(value))
        await invoke("send_mineflayer_bot_chat", { message: passageCommand, command: true });
      await invoke("send_mineflayer_bot_chat", { message: value.trim(), command: true });
      if (capture) {
        const updated = await invoke<MineflayerBotStatus>("get_mineflayer_bot_status");
        const picked = updated.gathering?.selection?.areas.launcher?.[capture];
        if (!picked)
          throw new Error(
            "Не удалось получить выбранную точку. Переподключите бота и повторите выбор.",
          );
        (capture === "1" ? setCorner1 : setCorner2)(formatBlockCoordinates(picked));
      }
      setFeedback(
        capture
          ? `Угол ${capture} выбран. Координаты подставлены в форму.`
          : value === defenseCommand
            ? "Защита при добыче применена к боту."
            : value === passageCommand
              ? "Настройки применены. Следующий проход будет нового размера."
              : value === "deliver"
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
  const coordinateField = (corner: "1" | "2", value: string, change: (value: string) => void) => (
    <div className="mineflayer-coordinate-field">
      {text(
        corner === "1" ? "ПЕРВЫЙ УГОЛ · X Y Z" : "ВТОРОЙ УГОЛ · X Y Z",
        value,
        change,
        "Выберите точку в игре или введите X Y Z",
      )}
      <div className="mineflayer-coordinate-actions">
        <button
          type="button"
          disabled={disabled}
          onClick={() => void send(`area launcher ${corner} owner`, corner)}
        >
          Моя позиция
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void send(`area launcher ${corner} look`, corner)}
        >
          Блок под прицелом
        </button>
      </div>
    </div>
  );
  const progress = status?.gathering;
  const active = progress?.active;
  const queue = progress?.queue || [];
  const history = progress?.history || [];
  return (
    <PluginSettingsGroup
      title="ЗАДАЧИ ДОБЫЧИ"
      description="Добавляйте работу в очередь. Бот выполняет задачи по порядку и хранит добычу в инвентаре."
      collapsible={false}
    >
      {!connected && (
        <p role="status" className="mineflayer-bot-combat-note">
          Можно настроить задачу заранее. Для запуска подключите бота: вкладка «Управление» →
          «Запустить».
        </p>
      )}
      <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
        <button type="button" disabled={disabled} onClick={() => void send("deliver")}>
          ПРИНЕСТИ МНЕ ДОБЫЧУ
        </button>
        <button type="button" onClick={onOpenInventory}>
          ИНВЕНТАРЬ И СОСТОЯНИЕ
        </button>
      </div>
      <div className="mineflayer-bot-gathering-progress" role="status" aria-live="polite">
        <strong>
          {progress ? PHASES[progress.phase] || progress.phase : "Добавьте первую задачу"}
        </strong>
        {status?.gathering && (
          <span>
            Добыто: {status.gathering.mined} · Подобрано: {status.gathering.collected} · В очереди:{" "}
            {status.gathering.queued}
          </span>
        )}
        {status?.gathering?.reason && <p>{status.gathering.reason}</p>}
      </div>
      <div className="mineflayer-work-list" aria-label="Список задач">
        {active && (
          <article
            className={`mineflayer-work-card is-current${progress?.phase === "paused" ? " is-paused" : ""}`}
          >
            <div className="mineflayer-work-number">#{active.id}</div>
            <div className="mineflayer-work-content">
              <div className="mineflayer-work-heading">
                <strong>{workTaskTitle(active)}</strong>
                <span className="mineflayer-work-badge">{PHASES[progress?.phase || "idle"]}</span>
              </div>
              <p>{taskDetail(active)}</p>
              <div className="mineflayer-work-counts">
                <span>
                  Добыто{" "}
                  <b>
                    {active.mined}
                    {active.count ? ` / ${active.count}` : ""}
                  </b>
                </span>
                <span>
                  Подобрано <b>{active.collected}</b>
                </span>
                {active.delivered > 0 && (
                  <span>
                    Передано <b>{active.delivered}</b>
                  </span>
                )}
              </div>
              {active.count > 0 && (
                <progress
                  aria-label="Выполнение текущей задачи"
                  max={active.count}
                  value={Math.min(active.mined, active.count)}
                />
              )}
            </div>
            <button
              type="button"
              className="mineflayer-work-icon is-danger"
              disabled={disabled}
              aria-label={`Отменить задачу ${active.id}`}
              title="Отменить текущую задачу"
              onClick={() => void send(`work cancel ${active.id}`)}
            >
              <WorkCancelIcon />
            </button>
          </article>
        )}
        {progress?.suspended && (
          <p className="mineflayer-work-empty">
            После доставки: #{progress.suspended.id} · {workTaskTitle(progress.suspended)}
          </p>
        )}
        <div className="mineflayer-work-subhead">
          <strong>
            ОЧЕРЕДЬ <span>{queue.length}</span>
          </strong>
          {queue.length > 0 && (
            <button type="button" disabled={disabled} onClick={() => void send("work clear")}>
              Очистить очередь
            </button>
          )}
        </div>
        <ol className="mineflayer-work-queue">
          {queue.map((task, index) => (
            <li className="mineflayer-work-card" key={task.id}>
              <div className="mineflayer-work-number">{index + 1}</div>
              <div className="mineflayer-work-content">
                <strong>{workTaskTitle(task)}</strong>
                <p>
                  #{task.id} · {taskDetail(task)}
                </p>
              </div>
              <div className="mineflayer-work-row-actions">
                <button
                  type="button"
                  className="mineflayer-work-icon"
                  disabled={disabled || index === 0}
                  aria-label={`Поднять задачу ${task.id}`}
                  title="Выше"
                  onClick={() => void send(`work move ${task.id} up`)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="mineflayer-work-icon"
                  disabled={disabled || index === queue.length - 1}
                  aria-label={`Опустить задачу ${task.id}`}
                  title="Ниже"
                  onClick={() => void send(`work move ${task.id} down`)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="mineflayer-work-icon is-danger"
                  disabled={disabled}
                  aria-label={`Удалить задачу ${task.id}`}
                  title="Удалить"
                  onClick={() => void send(`work remove ${task.id}`)}
                >
                  <WorkCancelIcon />
                </button>
              </div>
            </li>
          ))}
        </ol>
        {!queue.length && (
          <p className="mineflayer-work-empty">
            {active
              ? "Следующая задача появится здесь после добавления."
              : "Очередь пуста. Выберите работу ниже."}
          </p>
        )}
        <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
          <button
            type="button"
            disabled={disabled || (!active && !queue.length)}
            onClick={() => void send(progress?.phase === "paused" ? "work resume" : "work pause")}
          >
            {progress?.phase === "paused" ? "ПРОДОЛЖИТЬ" : "ПАУЗА"}
          </button>
          <button
            type="button"
            disabled={disabled || (!active && !queue.length)}
            onClick={() => void send("work stop")}
          >
            ОТМЕНИТЬ ВСЁ
          </button>
        </div>
      </div>
      <button
        type="button"
        className="mineflayer-work-add"
        aria-expanded={showForm}
        onClick={() => setShowForm(!showForm)}
      >
        <span>{showForm ? "−" : "+"}</span> ДОБАВИТЬ ЗАДАЧУ
      </button>
      {showForm && (
        <div className="mineflayer-work-form">
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
            <fieldset className="mineflayer-bot-gathering-fields" disabled={sending}>
              <div className="mineflayer-bot-grid">
                {mode === "mine" && (
                  <MinecraftSearchField
                    label="БЛОКИ ИЛИ ГРУППА"
                    value={blocks}
                    onChange={setBlocks}
                    catalog={catalog}
                    scope="blocks"
                    multiple
                    disabled={sending}
                    placeholder="Название или ID · diamond, iron, ores"
                  />
                )}
                {(mode === "mine" || mode === "forest") &&
                  number("КОЛИЧЕСТВО БЛОКОВ · 0 = ВСЕ", count, setCount, 0, 1000000)}
                {mode !== "quarry" &&
                  mode !== "tunnel" &&
                  number(
                    mode === "mine" ? "РАДИУС ПО ГОРИЗОНТАЛИ" : "РАДИУС · БЛОКИ",
                    radius,
                    setRadius,
                    1,
                    64,
                  )}
                {mode === "mine" && !autoDepth && (
                  <>
                    {number("МИНИМАЛЬНАЯ ВЫСОТА Y", minY, setMinY, -64, 319)}
                    {number("МАКСИМАЛЬНАЯ ВЫСОТА Y", maxY, setMaxY, -64, 319)}
                  </>
                )}
                {mode === "collect" && (
                  <MinecraftSearchField
                    label="ПРЕДМЕТ · ПУСТО = ВСЕ"
                    value={item}
                    onChange={setItem}
                    catalog={catalog}
                    scope="items"
                    disabled={sending}
                    placeholder="Название или ID · diamond, raw_iron"
                  />
                )}
                {mode === "quarry" && (
                  <>
                    {coordinateField("1", corner1, setCorner1)}
                    {coordinateField("2", corner2, setCorner2)}
                  </>
                )}
                {mode === "tunnel" && <>{number("ДЛИНА", length, setLength, 1, 128)}</>}
              </div>
              {mode === "quarry" && (
                <div className="mineflayer-coordinate-guide">
                  <p>
                    Встаньте в нужном углу или наведитесь на его блок, затем выберите точку. Бот
                    должен видеть вас; блок под прицелом — не дальше 6 блоков.
                  </p>
                  <p>
                    Можно отметить оба угла прямо в игровом чате: <code>!area launcher 1 look</code>{" "}
                    и <code>!area launcher 2 look</code>. Вместо <code>!</code> используйте свой
                    префикс.
                  </p>
                  {areaPreview ? (
                    <strong className={areaPreview.valid ? "" : "is-error"}>
                      {areaPreview.size.x} × {areaPreview.size.y} × {areaPreview.size.z} ·{" "}
                      {areaPreview.volume.toLocaleString("ru-RU")} блоков
                      {!areaPreview.valid && " · превышен лимит 32 768"}
                    </strong>
                  ) : (corner1.trim() && !first) || (corner2.trim() && !second) ? (
                    <strong className="is-error">Нужны три числа X Y Z для каждого угла.</strong>
                  ) : null}
                </div>
              )}
              {mode === "mine" && (
                <ElementToggle
                  title="ИСКАТЬ ПО ВСЕЙ ГЛУБИНЕ"
                  note="От нижней границы мира; проверяет загруженные чанки"
                  enabled={autoDepth}
                  onToggle={() => setAutoDepth(!autoDepth)}
                />
              )}
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
                  ? "Ищет руду под землёй и прокладывает проход к залежи. Радиус ограничивает поиск по горизонтали, высота задаётся отдельно. Нужна подходящая кирка."
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
                    (mode === "quarry" && !areaPreview?.valid)
                  }
                >
                  {active ? "ДОБАВИТЬ В ОЧЕРЕДЬ" : "ДОБАВИТЬ И НАЧАТЬ"}
                </button>
              </div>
            </fieldset>
          </form>
        </div>
      )}
      {history.length > 0 && (
        <details className="mineflayer-work-history">
          <summary>Завершённые задачи · {history.length}</summary>
          {[...history].reverse().map((task) => (
            <div key={task.id}>
              <strong>
                #{task.id} · {workTaskTitle(task)}
              </strong>
              <span>
                {task.outcome} · добыто {task.mined} · подобрано {task.collected}
              </span>
              {task.reason && <p>{task.reason}</p>}
            </div>
          ))}
        </details>
      )}
      <PluginSettingsGroup
        title="ЗАЩИТА ПРИ ДОБЫЧЕ"
        description="Самозащита во время добычи руды, заготовки леса, сбора и выгрузки"
      >
        <ElementToggle
          title="ЗАЩИЩАТЬСЯ ОТ МОБОВ"
          note="Отбивается от опасных мобов рядом и тех, кто напал на бота"
          enabled={settings.defendMobs}
          onToggle={() => updatePassages({ defendMobs: !settings.defendMobs })}
        />
        <ElementToggle
          title="ЗАЩИЩАТЬСЯ ОТ ИГРОКОВ"
          note="Отвечает на удары; через 3 секунды без новых ударов возвращается к работе"
          enabled={settings.defendPlayers}
          onToggle={() => updatePassages({ defendPlayers: !settings.defendPlayers })}
        />
        <ElementToggle
          title="ЗАЩИЩАТЬСЯ ОТ СТРЕЛ"
          note="Использует имеющуюся защиту щитом, а без щита ищет безопасный отход"
          enabled={settings.defendArrows}
          onToggle={() => updatePassages({ defendArrows: !settings.defendArrows })}
        />
        <p className="mineflayer-bot-combat-note">
          Использует текущие настройки ближнего боя. При низком здоровье, без оружия или рядом с
          крипером отходит по безопасному пути. После опасности продолжает ту же задачу. Ручная
          пауза сохраняется. Настройки действуют и при выключенном автоматическом PvP.
        </p>
        <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
          <button type="button" disabled={disabled} onClick={() => void send(defenseCommand)}>
            ПРИМЕНИТЬ К БОТУ
          </button>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title="ТОННЕЛИ И ОСВЕЩЕНИЕ"
        description="Размер проходов при добыче руды, лестницы и факелы на стенах"
      >
        <div className="mineflayer-bot-grid">
          {number(
            "ШИРИНА ТОННЕЛЯ · БЛОКИ",
            settings.tunnelWidth,
            (tunnelWidth) => updatePassages({ tunnelWidth }),
            1,
            3,
          )}
          {number(
            "ВЫСОТА ТОННЕЛЯ · БЛОКИ",
            settings.tunnelHeight,
            (tunnelHeight) => updatePassages({ tunnelHeight }),
            2,
            4,
          )}
          {number(
            "ШИРИНА ЛЕСТНИЦЫ · БЛОКИ",
            settings.stairWidth,
            (stairWidth) => updatePassages({ stairWidth }),
            1,
            3,
          )}
          {number(
            "ПРОСВЕТ ЛЕСТНИЦЫ · БЛОКИ",
            settings.stairHeight,
            (stairHeight) => updatePassages({ stairHeight }),
            3,
            4,
          )}
        </div>
        <p className="mineflayer-bot-combat-note">
          Ровные тоннели по умолчанию 2 × 2. Лестницы поднимаются или опускаются на один блок за
          шаг; просвет от пола — минимум три блока, чтобы прыгать без удара головой. Для доставки и
          возвращения бот ищет путь по готовым проходам.
        </p>
        <ElementToggle
          title="СТАВИТЬ ФАКЕЛЫ В ПЕЩЕРЕ"
          note="Использует обычные факелы из инвентаря и крепит их к стенам"
          enabled={settings.placeTorches}
          onToggle={() => updatePassages({ placeTorches: !settings.placeTorches })}
        />
        {settings.placeTorches && (
          <div className="mineflayer-bot-grid">
            {number(
              "ИНТЕРВАЛ ФАКЕЛОВ · БЛОКИ",
              settings.torchInterval,
              (torchInterval) => updatePassages({ torchInterval }),
              4,
              16,
            )}
          </div>
        )}
        <p className="mineflayer-bot-combat-note">
          Интервал по умолчанию — 8 блоков. Если факелов или подходящей стены нет, бот продолжает
          работу. Настройки сохраняются и применяются при добавлении добычи или тоннеля; для текущей
          работы нажмите «Применить к боту».
        </p>
        <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
          <button type="button" disabled={disabled} onClick={() => void send(passageCommand)}>
            ПРИМЕНИТЬ К БОТУ
          </button>
        </div>
      </PluginSettingsGroup>
      <MineflayerStorageGroups
        groups={settings.storageGroups}
        onChange={(storageGroups) => updatePassages({ storageGroups })}
        catalog={catalog}
        connected={connected}
        disabled={sending}
        status={status}
        refresh={refresh}
        onDeposit={() => void send("deposit")}
      />
      <p className="mineflayer-bot-combat-note">
        Добыча хранится в инвентаре бота. «Принести мне добычу» — подходит к владельцу, выбрасывает
        добычу перед ним и возвращается. Инструменты, броня, еда и до 64 строительных блоков для
        пути сохраняются. При заполнении инвентаря бот раскладывает добычу по настроенным группам
        сундуков. Предметы без подходящей группы остаются у бота.
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
