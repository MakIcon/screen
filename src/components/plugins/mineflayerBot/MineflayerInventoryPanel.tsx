import { ProgressBar } from "../../display/ProgressBar";
import { useRef, useState } from "react";
import type { MineflayerBotStatus, MineflayerInventoryItem } from "../../../types";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { translate, useTranslation } from "../../../i18n/locale";
import { Button } from "../../inputs/Button";
import { useBotInvoke } from "./BotSessionContext";
import { useRuntimeMonitor } from "../../../hooks/useRuntimeMonitor";
import { toErrorMessage } from "../../../utils/errors";
import { inventoryDropSelection } from "./inventoryDrop";

const EQUIPMENT = [
  [5, "helmet"],
  [6, "chestplate"],
  [7, "leggings"],
  [8, "boots"],
  [45, "offhand"],
] as const;
function itemTitle(item: MineflayerInventoryItem) {
  return `${item.displayName} × ${item.count}${item.maxDurability ? ` · ${translate("bot.inventory.durabilityValue", { current: item.durability ?? 0, max: item.maxDurability })}` : ""}`;
}
export function MineflayerInventoryPanel({
  status,
  onOpenTasks,
}: {
  status: MineflayerBotStatus | null;
  onOpenTasks: () => void;
}) {
  const tr = useTranslation();
  const invoke = useBotInvoke();
  const monitor = useRuntimeMonitor();
  const [selected, setSelected] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);
  const droppingRef = useRef(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const connected = Boolean(status?.running && status.state === "connected");
  const inventory = connected ? status?.inventory : null;
  const selectedItem = selected !== null ? inventory?.slots[selected] : null;
  const busy = dropping || Boolean(inventory?.actionBusy);
  const allItems = inventoryDropSelection(inventory, null);
  const selectedItems = selected === null ? [] : inventoryDropSelection(inventory, selected);

  async function dropItems(all = false, one = false) {
    if (!connected || busy || droppingRef.current || (!all && selected === null)) return;
    const items = inventoryDropSelection(inventory, all ? null : selected, one);
    if (!items.length) return;
    droppingRef.current = true;
    setDropping(true);
    setError("");
    setFeedback("");
    try {
      await invoke("drop_mineflayer_bot_items", { items });
      setFeedback(
        tr("bot.inventory.dropDone", { count: items.reduce((sum, item) => sum + item.count, 0) }),
      );
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      await monitor.refresh();
      droppingRef.current = false;
      setDropping(false);
    }
  }
  function slot(index: number, label?: string) {
    const item = inventory?.slots[index];
    const held = inventory?.selectedSlot === index;
    return (
      <button
        type="button"
        key={index}
        className={`mineflayer-inventory-slot${held ? " is-held" : ""}${selected === index ? " is-selected" : ""}${item?.enchants.length ? " is-enchanted" : ""}`}
        disabled={!inventory || busy}
        aria-label={
          item
            ? `${label || `${tr("bot.inventory.slot")} ${index}`}: ${itemTitle(item)}`
            : `${label || `${tr("bot.inventory.slot")} ${index}`}: ${tr("bot.inventory.empty")}`
        }
        aria-pressed={selected === index}
        data-tooltip={item ? itemTitle(item) : label || tr("bot.inventory.emptySlot")}
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
          label: tr("bot.inventory.health"),
          value: inventory.health,
          max: inventory.maxHealth,
          symbol: "♥",
          note: "HP",
        },
        {
          key: "food",
          label: tr("bot.inventory.hunger"),
          value: inventory.food,
          max: 20,
          symbol: "◆",
          note: `${tr("bot.inventory.saturation")} ${Math.round(inventory.saturation * 10) / 10}`,
        },
        {
          key: "armor",
          label: tr("bot.inventory.armor"),
          value: inventory.armor,
          max: 20,
          symbol: "⬡",
          note: tr("bot.inventory.armorPoints"),
        },
      ]
    : [];
  return (
    <PluginSettingsGroup
      title={tr("bot.inventory.inventoryAndStatus")}
      description={tr("bot.inventory.theBotsItemsEquipment")}
      collapsible={false}
    >
      <div className="mineflayer-inventory-header">
        <div>
          <strong>{inventory?.username || status?.botUsername || tr("bot.inventory.bot")}</strong>
          <span className={connected ? "is-online" : ""}>
            {connected ? tr("bot.inventory.inGame") : tr("bot.inventory.disconnected")}
          </span>
        </div>
        <div className="mineflayer-inventory-actions">
          <button type="button" onClick={onOpenTasks}>
            {tr("bot.inventory.toGatheringTasks")}
          </button>
          <Button
            variant="danger"
            className="mf-button"
            disabled={busy || !allItems.length}
            title={tr("bot.inventory.dropAllHint")}
            onClick={() => void dropItems(true)}
          >
            {tr(dropping ? "bot.inventory.dropping" : "bot.inventory.dropAll")}
          </Button>
        </div>
      </div>
      {(error || feedback) && (
        <p
          className={`mineflayer-inventory-feedback${error ? " is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error || feedback}
        </p>
      )}
      {!inventory ? (
        <div className="mineflayer-inventory-empty" role="status">
          <strong>
            {connected ? tr("bot.inventory.loadingInventory") : tr("bot.inventory.connectTheBot")}
          </strong>
          <p>
            {connected
              ? tr("bot.inventory.statsWillAppearOnce")
              : tr("bot.inventory.clickConnectBotTo")}
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
                <ProgressBar
                  aria-label={stat.label}
                  value={stat.value}
                  max={stat.max}
                  settings={{ height: 4, showLabel: false, showValue: false }}
                />
                <p>{stat.note}</p>
              </div>
            ))}
          </div>
          <div className="mineflayer-inventory-layout">
            <div className="mineflayer-inventory-bag">
              <div className="mineflayer-work-subhead">
                <strong>{tr("bot.inventory.backpack")}</strong>
                <span>
                  {tr("bot.inventory.occupancy", {
                    occupied: inventory.occupied,
                    count: inventory.capacity,
                  })}
                </span>
              </div>
              <div
                className="mineflayer-inventory-grid"
                aria-label={tr("bot.inventory.mainInventory")}
              >
                {Array.from({ length: 27 }, (_, i) => slot(i + 9))}
              </div>
              <div className="mineflayer-work-subhead">
                <strong>{tr("bot.inventory.hotbar")}</strong>
                <span>
                  {tr("bot.inventory.inHandSlot")} {inventory.selectedSlot - 35}
                </span>
              </div>
              <div className="mineflayer-inventory-grid" aria-label={tr("bot.inventory.hotbar2")}>
                {Array.from({ length: 9 }, (_, i) => slot(i + 36))}
              </div>
            </div>
            <div className="mineflayer-inventory-equipment">
              <div className="mineflayer-work-subhead">
                <strong>{tr("bot.inventory.equipment")}</strong>
              </div>
              {EQUIPMENT.filter(([index]) => index < inventory.slots.length).map(
                ([index, slotName]) => (
                  <div className="mineflayer-equipment-row" key={index}>
                    {slot(index, tr(`bot.inventory.slot.${slotName}`))}
                    <div>
                      <span>{tr(`bot.inventory.slot.${slotName}`)}</span>
                      <strong>{inventory.slots[index]?.displayName || tr("common.empty")}</strong>
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
                    {tr("bot.inventory.itemCount", { count: selectedItem.count })}
                    {selectedItem.maxDurability
                      ? ` · ${tr("bot.inventory.durabilityValue", { current: selectedItem.durability ?? 0, max: selectedItem.maxDurability })}`
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
                <div className="mineflayer-inventory-actions mineflayer-inventory-drop-actions">
                  {selectedItem.count > 1 && (
                    <Button
                      className="mf-button"
                      disabled={busy || !selectedItems.length}
                      onClick={() => void dropItems(false, true)}
                    >
                      {tr("bot.inventory.dropOne")}
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    className="mf-button"
                    disabled={busy || !selectedItems.length}
                    onClick={() => void dropItems()}
                  >
                    {tr(
                      selectedItem.count > 1 ? "bot.inventory.dropStack" : "bot.inventory.dropItem",
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <p>
                {selected === null
                  ? tr("bot.inventory.selectAnItemTo")
                  : tr("bot.inventory.thisSlotIsEmpty")}
              </p>
            )}
          </div>
          {!inventory.dropSupported && (
            <p className="mineflayer-inventory-feedback">{tr("bot.inventory.restartToDrop")}</p>
          )}
        </>
      )}
    </PluginSettingsGroup>
  );
}
