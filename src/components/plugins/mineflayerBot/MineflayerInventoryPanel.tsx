import { useState } from "react";
import type { MineflayerBotStatus, MineflayerInventoryItem } from "../../../types";
import { PluginSettingsGroup } from "../PluginSettingsGroup";

const EQUIPMENT: Array<[number, string]> = [
  [5, "Шлем"],
  [6, "Нагрудник"],
  [7, "Поножи"],
  [8, "Ботинки"],
  [45, "Вторая рука"],
];
function itemTitle(item: MineflayerInventoryItem) {
  return `${item.displayName} × ${item.count}${item.maxDurability ? ` · прочность ${item.durability}/${item.maxDurability}` : ""}`;
}
export function MineflayerInventoryPanel({
  status,
  onOpenTasks,
}: {
  status: MineflayerBotStatus | null;
  onOpenTasks: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const connected = Boolean(status?.running && status.state === "connected");
  const inventory = connected ? status?.inventory : null;
  const selectedItem = selected !== null ? inventory?.slots[selected] : null;
  function slot(index: number, label?: string) {
    const item = inventory?.slots[index];
    const held = inventory?.selectedSlot === index;
    return (
      <button
        type="button"
        key={index}
        className={`mineflayer-inventory-slot${held ? " is-held" : ""}${selected === index ? " is-selected" : ""}${item?.enchants.length ? " is-enchanted" : ""}`}
        disabled={!inventory}
        aria-label={
          item
            ? `${label || `Слот ${index}`}: ${itemTitle(item)}`
            : `${label || `Слот ${index}`}: пусто`
        }
        aria-pressed={selected === index}
        data-tooltip={item ? itemTitle(item) : label || "Пустой слот"}
        onClick={() => setSelected(selected === index ? null : index)}
      >
        {item ? (
          <>
            <img src={item.texture} alt={item.displayName} draggable={false} />
            <b>{item.count > 1 ? item.count : ""}</b>
            {item.maxDurability && (
              <span className="mineflayer-item-durability">
                <i
                  style={{
                    width: `${Math.max(0, ((item.durability || 0) / item.maxDurability) * 100)}%`,
                  }}
                />
              </span>
            )}
          </>
        ) : (
          <span className="mineflayer-slot-placeholder">{label ? label.slice(0, 1) : "·"}</span>
        )}
        {index >= 36 && index <= 44 && <small>{index - 35}</small>}
      </button>
    );
  }
  const stats = inventory
    ? [
        {
          key: "health",
          label: "ЗДОРОВЬЕ",
          value: inventory.health,
          max: inventory.maxHealth,
          symbol: "♥",
          note: "HP",
        },
        {
          key: "food",
          label: "СЫТОСТЬ",
          value: inventory.food,
          max: 20,
          symbol: "◆",
          note: `Насыщение ${Math.round(inventory.saturation * 10) / 10}`,
        },
        {
          key: "armor",
          label: "БРОНЯ",
          value: inventory.armor,
          max: 20,
          symbol: "⬡",
          note: "Очки защиты",
        },
      ]
    : [];
  return (
    <PluginSettingsGroup
      title="ИНВЕНТАРЬ И СОСТОЯНИЕ"
      description="Предметы, экипировка и показатели бота обновляются во время игры."
      collapsible={false}
    >
      <div className="mineflayer-inventory-header">
        <div>
          <strong>{inventory?.username || status?.botUsername || "Бот"}</strong>
          <span className={connected ? "is-online" : ""}>{connected ? "В игре" : "Отключён"}</span>
        </div>
        <button type="button" onClick={onOpenTasks}>
          К задачам добычи →
        </button>
      </div>
      {!inventory ? (
        <div className="mineflayer-inventory-empty" role="status">
          <strong>{connected ? "Получаем инвентарь…" : "Подключите бота"}</strong>
          <p>
            {connected
              ? "Показатели появятся после загрузки персонажа."
              : "Нажмите «Подключить бота», чтобы видеть предметы и состояние."}
          </p>
        </div>
      ) : (
        <>
          <div className="mineflayer-inventory-vitals">
            {stats.map((stat) => (
              <div
                className={`mineflayer-vital is-${stat.key}${stat.key === "health" && stat.value <= 6 ? " is-low" : ""}`}
                key={stat.key}
              >
                <span className="mineflayer-vital-symbol" aria-hidden="true">
                  {stat.symbol}
                </span>
                <div>
                  <span>{stat.label}</span>
                  <strong>
                    {Math.round(stat.value * 10) / 10}
                    <small> / {stat.max}</small>
                  </strong>
                </div>
                <progress aria-label={stat.label} value={stat.value} max={stat.max} />
                <p>{stat.note}</p>
              </div>
            ))}
          </div>
          <div className="mineflayer-inventory-layout">
            <div className="mineflayer-inventory-bag">
              <div className="mineflayer-work-subhead">
                <strong>РЮКЗАК</strong>
                <span>
                  {inventory.occupied} / {inventory.capacity} слотов
                </span>
              </div>
              <div className="mineflayer-inventory-grid" aria-label="Основной инвентарь">
                {Array.from({ length: 27 }, (_, i) => slot(i + 9))}
              </div>
              <div className="mineflayer-work-subhead">
                <strong>БЫСТРЫЙ ДОСТУП</strong>
                <span>В руке: слот {inventory.selectedSlot - 35}</span>
              </div>
              <div className="mineflayer-inventory-grid" aria-label="Панель быстрого доступа">
                {Array.from({ length: 9 }, (_, i) => slot(i + 36))}
              </div>
            </div>
            <div className="mineflayer-inventory-equipment">
              <div className="mineflayer-work-subhead">
                <strong>ЭКИПИРОВКА</strong>
              </div>
              {EQUIPMENT.filter(([index]) => index < inventory.slots.length).map(
                ([index, label]) => (
                  <div className="mineflayer-equipment-row" key={index}>
                    {slot(index, label)}
                    <div>
                      <span>{label}</span>
                      <strong>{inventory.slots[index]?.displayName || "Пусто"}</strong>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="mineflayer-inventory-detail" aria-live="polite">
            {selectedItem ? (
              <>
                <img src={selectedItem.texture} alt="" />
                <div>
                  <strong>{selectedItem.displayName}</strong>
                  <p>
                    {selectedItem.count} шт.
                    {selectedItem.maxDurability
                      ? ` · прочность ${selectedItem.durability} / ${selectedItem.maxDurability}`
                      : ""}
                  </p>
                  {selectedItem.enchants.length > 0 && (
                    <p>
                      {selectedItem.enchants
                        .map((e) => `${e.name.replace(/_/g, " ")} ${e.level}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p>
                {selected === null
                  ? "Выберите предмет, чтобы увидеть количество, прочность и зачарования."
                  : "Этот слот пуст."}
              </p>
            )}
          </div>
        </>
      )}
    </PluginSettingsGroup>
  );
}
