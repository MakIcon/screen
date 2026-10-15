import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { MinecraftSearchField } from "../../inputs/MinecraftSearchField";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { toErrorMessage } from "../../../utils/errors";
import bundledCatalog from "../../../data/minecraftCatalog.json";
import type { MinecraftCatalog, MineflayerBotStatus } from "../../../types";

const STATIONS = [
  ["crafting_table", "Верстак"],
  ["furnace", "Печь"],
  ["blast_furnace", "Плавильная печь"],
  ["smoker", "Коптильня"],
  ["stonecutter", "Камнерез"],
  ["anvil", "Наковальня"],
  ["chipped_anvil", "Повреждённая наковальня"],
  ["damaged_anvil", "Разбитая наковальня"],
  ["enchanting_table", "Стол зачарований"],
  ["brewing_stand", "Зельеварка"],
  ["smithing_table", "Кузнечный стол"],
  ["grindstone", "Точило"],
  ["loom", "Ткацкий станок"],
  ["cartography_table", "Стол картографа"],
  ["crafter", "Сборщик"],
  ["chest", "Сундук"],
  ["barrel", "Бочка"],
  ["hopper", "Воронка"],
  ["dispenser", "Раздатчик"],
  ["dropper", "Выбрасыватель"],
];
const SLOT_HELP: Record<string, string> = {
  crafting_table:
    "0 — результат; 1–9 — сетка 3×3. Для автоматического крафта используйте форму выше.",
  furnace: "0 — сырьё; 1 — топливо; 2 — результат.",
  blast_furnace: "0 — сырьё; 1 — топливо; 2 — результат.",
  smoker: "0 — еда; 1 — топливо; 2 — результат.",
  anvil:
    "0 — предмет; 1 — материал или книга; 2 — результат. Для ремонта и объединения нужен опыт.",
  chipped_anvil: "0 — предмет; 1 — материал или книга; 2 — результат.",
  damaged_anvil: "0 — предмет; 1 — материал или книга; 2 — результат.",
  stonecutter: "0 — материал; 1 — результат. После загрузки выберите номер рецепта от 0.",
  enchanting_table: "0 — предмет; 1 — лазурит. Варианты зачарования: 0, 1, 2. Нужен опыт.",
  brewing_stand:
    "0–2 — бутылочки; 3 — ингредиент; 4 — огненный порошок. Дождитесь окончания варки.",
  smithing_table:
    "В новых версиях: 0 — шаблон; 1 — предмет; 2 — материал; 3 — результат. В старых версиях — два входа и результат.",
  grindstone: "0–1 — предметы; 2 — результат.",
  loom: "0 — флаг; 1 — краситель; 2 — узор; 3 — результат. Выберите номер узора от 0.",
  cartography_table: "0 — карта; 1 — бумага, карта или стекло; 2 — результат.",
  crafter: "0–8 — сетка сборщика. Для запуска нужен сигнал редстоуна.",
};

export function MineflayerProductionControls({
  connected,
  refresh,
  status,
}: {
  connected: boolean;
  refresh: () => Promise<unknown>;
  status: MineflayerBotStatus | null;
}) {
  const [item, setItem] = useState("stone_pickaxe"),
    [count, setCount] = useState(1);
  const [craftMode, setCraftMode] = useState("auto");
  const [smeltItem, setSmeltItem] = useState("raw_iron"),
    [smeltCount, setSmeltCount] = useState(8);
  const [fuel, setFuel] = useState(""),
    [furnace, setFurnace] = useState("auto");
  const [station, setStation] = useState("stonecutter"),
    [slot, setSlot] = useState(0);
  const [stationItem, setStationItem] = useState("stone"),
    [stationCount, setStationCount] = useState(1);
  const [choice, setChoice] = useState(0),
    [name, setName] = useState("");
  const [scanRadius, setScanRadius] = useState(32);
  const [sending, setSending] = useState(false),
    [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const sendingRef = useRef(false);
  const [liveCatalog, setLiveCatalog] = useState<MinecraftCatalog | null>(null);
  const catalog = connected && liveCatalog ? liveCatalog : (bundledCatalog as MinecraftCatalog);
  const progress = connected ? status?.inventory?.production : null;
  const active = progress?.station;
  const disabled = !connected || sending;
  const working = disabled || Boolean(progress?.busy);
  useEffect(() => {
    let cancelled = false;
    setLiveCatalog(null);
    if (connected)
      void invoke<MinecraftCatalog | null>("get_minecraft_catalog")
        .then((value) => {
          if (!cancelled) setLiveCatalog(value);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connected, status?.pid]);
  async function send(command: string) {
    if (!connected || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    setFeedback("");
    try {
      await invoke("send_mineflayer_bot_chat", { message: command, command: true });
      setFeedback("Команда принята. Результат и текущий этап появятся ниже.");
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
    update: (value: number) => void,
    min: number,
    max: number,
  ) => (
    <label className="mineflayer-bot-field">
      <span>{label}</span>
      <CustomNumberInput
        ariaLabel={label}
        background="transparent"
        value={value}
        onChange={update}
        min={min}
        max={max}
        step={1}
        disabled={disabled}
      />
    </label>
  );
  return (
    <>
      <PluginSettingsGroup
        title="БЛОКИ ВОКРУГ БОТА"
        description="Находит рабочие блоки и контейнеры в загруженной области вокруг бота. Выберите найденный блок, чтобы бот подошёл и открыл его."
        collapsible={false}
      >
        <div className="mineflayer-bot-grid">
          {number("РАДИУС СКАНИРОВАНИЯ · БЛОКОВ", scanRadius, setScanRadius, 4, 64)}
          <div className="mineflayer-coordinate-actions">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void send(`station scan ${scanRadius}`)}
            >
              Сканировать рабочие блоки
            </button>
          </div>
        </div>
        {progress?.nearbyScan && (
          <>
            <p role="status">
              Найдено: {progress.nearbyScan.blocks.length} · радиус {progress.nearbyScan.radius}{" "}
              блоков
            </p>
            <div className="mineflayer-production-slots" aria-label="Найденные рабочие блоки">
              {progress.nearbyScan.blocks.map((block) => (
                <button
                  type="button"
                  key={`${block.position.x},${block.position.y},${block.position.z}`}
                  disabled={working}
                  onClick={() =>
                    void send(
                      `station open ${block.position.x} ${block.position.y} ${block.position.z}`,
                    )
                  }
                >
                  <strong>
                    {STATIONS.find(([value]) => value === block.name)?.[1] ||
                      catalog.entries.find((entry) => entry.name === block.name)?.displayName ||
                      block.name}
                  </strong>
                  <span>
                    {block.position.x} {block.position.y} {block.position.z} · {block.distance} бл.
                  </span>
                  <small>ПОДОЙТИ И ОТКРЫТЬ</small>
                </button>
              ))}
            </div>
            {!progress.nearbyScan.blocks.length && (
              <p className="mineflayer-production-hint">
                В этом радиусе рабочих блоков не найдено. Подойдите к базе или увеличьте радиус.
              </p>
            )}
          </>
        )}
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title="АВТОМАТИЧЕСКИЙ КРАФТ"
        description="Бот изготовит промежуточные ингредиенты из ресурсов в инвентаре. Найдёт верстак в радиусе 32 блоков или изготовит и поставит его рядом."
        collapsible={false}
      >
        <div className="mineflayer-bot-grid">
          <MinecraftSearchField
            label="ПРЕДМЕТ"
            value={item}
            onChange={setItem}
            catalog={catalog}
            scope="items"
            disabled={disabled}
          />
          {number("СКОЛЬКО ИЗГОТОВИТЬ", count, setCount, 1, 256)}
          <label className="mineflayer-bot-field">
            <span>МЕСТО КРАФТА</span>
            <select
              value={craftMode}
              onChange={(event) => setCraftMode(event.target.value)}
              disabled={disabled}
            >
              <option value="auto">Автоматически</option>
              <option value="inventory">Инвентарь · 2×2</option>
              <option value="table">Верстак · 3×3</option>
            </select>
          </label>
        </div>
        <p className="mineflayer-production-hint">
          Количество указано в предметах. Если рецепт выдаёт несколько штук, бот округлит до целой
          партии. Недостающие исходные ресурсы нужно добыть заранее.
        </p>
        <div className="mineflayer-coordinate-actions">
          <button
            type="button"
            disabled={disabled || !item.trim()}
            onClick={() => void send(`recipes ${item.trim()} ${count} ${craftMode}`)}
          >
            Проверить рецепт
          </button>
          <button
            type="button"
            disabled={working || !item.trim()}
            onClick={() => void send(`craft ${item.trim()} ${count} ${craftMode}`)}
          >
            Изготовить
          </button>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title="ПЕРЕПЛАВКА И ГОТОВКА"
        description="Бот загрузит пустую печь, подберёт топливо, дождётся результата и заберёт его. Коптильня подходит для еды, плавильная печь — для руд и металла."
        collapsible={false}
      >
        <div className="mineflayer-bot-grid">
          <MinecraftSearchField
            label="СЫРЬЁ"
            value={smeltItem}
            onChange={setSmeltItem}
            catalog={catalog}
            scope="items"
            disabled={disabled}
          />
          {number("КОЛИЧЕСТВО СЫРЬЯ", smeltCount, setSmeltCount, 1, 64)}
          <MinecraftSearchField
            label="ТОПЛИВО · ПУСТО = АВТОВЫБОР"
            value={fuel}
            onChange={setFuel}
            catalog={catalog}
            scope="items"
            disabled={disabled}
            placeholder="Автоматически"
          />
          <label className="mineflayer-bot-field">
            <span>ПЕЧЬ</span>
            <select
              value={furnace}
              onChange={(event) => setFurnace(event.target.value)}
              disabled={disabled}
            >
              <option value="auto">Автоматически</option>
              <option value="furnace">Обычная печь</option>
              <option value="blast_furnace">Плавильная печь</option>
              <option value="smoker">Коптильня</option>
            </select>
          </label>
        </div>
        <div className="mineflayer-coordinate-actions">
          <button
            type="button"
            disabled={working || !smeltItem.trim()}
            onClick={() =>
              void send(
                `smelt ${smeltItem.trim()} ${smeltCount} ${fuel.trim() || "auto"} ${furnace}`,
              )
            }
          >
            Начать переплавку
          </button>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title="РАБОЧИЕ БЛОКИ"
        description="Выберите блок: бот подойдёт и откроет его. Затем положите материалы в нужные слоты, выберите действие и заберите результат."
        collapsible={false}
      >
        <div className="mineflayer-bot-grid">
          <label className="mineflayer-bot-field">
            <span>БЛОК РЯДОМ С БОТОМ</span>
            <select
              value={station}
              onChange={(event) => setStation(event.target.value)}
              disabled={disabled}
            >
              {STATIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="mineflayer-coordinate-actions">
            <button
              type="button"
              disabled={working}
              onClick={() => void send(`station open ${station}`)}
            >
              Подойти и открыть
            </button>
          </div>
        </div>
        <p className="mineflayer-production-hint">
          {SLOT_HELP[active?.name || station] ||
            "Нумерация слотов начинается с 0. Предметы переносятся между блоком и инвентарём бота."}
        </p>
        {active && (
          <>
            <p>
              Открыт: {STATIONS.find(([value]) => value === active.name)?.[1] || active.name} ·{" "}
              {active.position.x} {active.position.y} {active.position.z}
            </p>
            <div className="mineflayer-production-slots" aria-label="Слоты рабочего блока">
              {active.slots.map((entry, index) => (
                <button
                  key={index}
                  type="button"
                  aria-pressed={slot === index}
                  disabled={working}
                  onClick={() => setSlot(index)}
                  className={slot === index ? "active" : ""}
                >
                  <small>СЛОТ {index}</small>
                  <span>{entry ? `${entry.name} × ${entry.count}` : "Пусто"}</span>
                </button>
              ))}
            </div>
            <div className="mineflayer-bot-grid">
              {number("НОМЕР СЛОТА", slot, setSlot, 0, Math.max(0, active.slots.length - 1))}
              <MinecraftSearchField
                label="ПРЕДМЕТ ДЛЯ ЗАГРУЗКИ"
                value={stationItem}
                onChange={setStationItem}
                catalog={catalog}
                scope="items"
                disabled={disabled}
              />
              {number("КОЛИЧЕСТВО ДЛЯ ЗАГРУЗКИ", stationCount, setStationCount, 1, 64)}
            </div>
            <div className="mineflayer-coordinate-actions">
              <button
                type="button"
                disabled={working || !stationItem.trim()}
                onClick={() =>
                  void send(`station put ${slot} ${stationItem.trim()} ${stationCount}`)
                }
              >
                Положить в слот {slot}
              </button>
              <button
                type="button"
                disabled={working || !active.slots[slot]}
                onClick={() => void send(`station take ${slot}`)}
              >
                Забрать из слота {slot}
              </button>
            </div>
            {["stonecutter", "loom", "enchanting_table"].includes(active.name) && (
              <>
                {number(
                  active.name === "enchanting_table"
                    ? "ВАРИАНТ ЗАЧАРОВАНИЯ · 0–2"
                    : "НОМЕР ВАРИАНТА · ОТ 0",
                  choice,
                  setChoice,
                  0,
                  active.name === "enchanting_table" ? 2 : 255,
                )}
                {active.name === "enchanting_table" && (
                  <p className="mineflayer-production-hint">
                    Нужные уровни:{" "}
                    {[0, 1, 2]
                      .map((index) => `${index}: ${active.properties[index] ?? "—"}`)
                      .join(" · ")}
                  </p>
                )}
                <div className="mineflayer-coordinate-actions">
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void send(`station select ${choice}`)}
                  >
                    {active.name === "enchanting_table" ? "Зачаровать" : "Выбрать вариант"}
                  </button>
                </div>
              </>
            )}
            {/anvil$/.test(active.name) && (
              <>
                <label className="mineflayer-bot-field">
                  <span>НОВОЕ ИМЯ ПРЕДМЕТА</span>
                  <input
                    value={name}
                    maxLength={35}
                    disabled={disabled}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <div className="mineflayer-coordinate-actions">
                  <button
                    type="button"
                    disabled={working || !name.trim()}
                    onClick={() => void send(`station rename ${name.trim()}`)}
                  >
                    Задать имя
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </PluginSettingsGroup>
      <PluginSettingsGroup title="ТЕКУЩАЯ РАБОТА" collapsible={false}>
        <p role="status" aria-live="polite">
          {connected ? progress?.message || "Готов к работе" : "Подключите бота к серверу"}
        </p>
        <div className="mineflayer-coordinate-actions">
          <button type="button" disabled={disabled} onClick={() => void send("station stop")}>
            Остановить и закрыть блок
          </button>
        </div>
        <p className="mineflayer-production-hint">
          При остановке переплавки или варки материалы остаются в блоке. Откройте его, чтобы забрать
          содержимое.
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
    </>
  );
}
