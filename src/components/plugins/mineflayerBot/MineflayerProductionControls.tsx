import { TextField } from "../../inputs/TextField";
import { SearchableSelect } from "../../inputs/SearchableSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import { isPlainMessageKey, translate, useLocale, useTranslation } from "../../../i18n/locale";
import { localizeCatalog } from "./catalogLocalization";
import { invoke } from "@tauri-apps/api/core";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { MinecraftSearchField } from "../../inputs/MinecraftSearchField";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { toErrorMessage } from "../../../utils/errors";
import bundledCatalog from "../../../data/minecraftCatalog.json";
import type { MinecraftCatalog, MineflayerBotStatus } from "../../../types";

const STATIONS = [
  "crafting_table",
  "furnace",
  "blast_furnace",
  "smoker",
  "stonecutter",
  "anvil",
  "chipped_anvil",
  "damaged_anvil",
  "enchanting_table",
  "brewing_stand",
  "smithing_table",
  "grindstone",
  "loom",
  "cartography_table",
  "crafter",
  "chest",
  "barrel",
  "hopper",
  "dispenser",
  "dropper",
] as const;
type Station = (typeof STATIONS)[number];
const isStation = (name: string): name is Station => (STATIONS as readonly string[]).includes(name);
const slotHelp = (name: string) => {
  const key = `bot.production.slotHelp.${name}`;
  return isPlainMessageKey(key) ? translate(key) : undefined;
};
const stationName = (name: string) =>
  isStation(name) ? translate(`bot.production.station.${name}`) : undefined;

export function MineflayerProductionControls({
  connected,
  refresh,
  status,
}: {
  connected: boolean;
  refresh: () => Promise<unknown>;
  status: MineflayerBotStatus | null;
}) {
  const locale = useLocale();
  const tr = useTranslation();
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
  const catalog = useMemo(
    () =>
      localizeCatalog(
        connected && liveCatalog ? liveCatalog : (bundledCatalog as MinecraftCatalog),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connected, liveCatalog, locale],
  );
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
      setFeedback(tr("bot.production.commandAcceptedTheResult"));
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
        title={tr("bot.production.blocksAroundTheBot")}
        description={tr("bot.production.findsWorkstationsAndContainers")}
        collapsible={false}
      >
        <div className="mineflayer-bot-grid">
          {number(tr("bot.production.scanRadiusBlocks"), scanRadius, setScanRadius, 4, 64)}
          <div className="mineflayer-coordinate-actions">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void send(`station scan ${scanRadius}`)}
            >
              {tr("bot.production.scanWorkstations")}
            </button>
          </div>
        </div>
        {progress?.nearbyScan && (
          <>
            <p role="status">
              {tr("bot.production.scanResult", {
                found: progress.nearbyScan.blocks.length,
                radius: progress.nearbyScan.radius,
              })}
            </p>
            <div
              className="mineflayer-production-slots"
              aria-label={tr("bot.production.workstationsFound")}
            >
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
                    {stationName(block.name) ||
                      catalog.entries.find((entry) => entry.name === block.name)?.displayName ||
                      block.name}
                  </strong>
                  <span>
                    {block.position.x} {block.position.y} {block.position.z} ·{" "}
                    {tr("units.blocksShort", { value: block.distance })}
                  </span>
                  <small>{tr("bot.production.walkOverAndOpen")}</small>
                </button>
              ))}
            </div>
            {!progress.nearbyScan.blocks.length && (
              <p className="mineflayer-production-hint">
                {tr("bot.production.noWorkstationsFoundWithin")}
              </p>
            )}
          </>
        )}
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title={tr("bot.production.automaticCrafting")}
        description={tr("bot.production.theBotCraftsIntermediate")}
        collapsible={false}
      >
        <div className="mineflayer-bot-grid">
          <MinecraftSearchField
            label={tr("bot.production.item")}
            value={item}
            onChange={setItem}
            catalog={catalog}
            scope="items"
            disabled={disabled}
          />
          {number(tr("bot.production.howManyToCraft"), count, setCount, 1, 256)}
          <label className="mineflayer-bot-field">
            <span>{tr("bot.production.craftingSpot")}</span>
            <SearchableSelect
              label={tr("bot.production.craftingSpot")}
              variant="field"
              allowEmpty={false}
              value={craftMode}
              onChange={setCraftMode}
              disabled={disabled}
              options={[
                { value: "auto", label: tr("bot.production.automatic") },
                { value: "inventory", label: tr("bot.production.inventory22") },
                { value: "table", label: tr("bot.production.craftingTable33") },
              ]}
            />
          </label>
        </div>
        <p className="mineflayer-production-hint">{tr("bot.production.theCountIsIn")}</p>
        <div className="mineflayer-coordinate-actions">
          <button
            type="button"
            disabled={disabled || !item.trim()}
            onClick={() => void send(`recipes ${item.trim()} ${count} ${craftMode}`)}
          >
            {tr("bot.production.checkRecipe")}
          </button>
          <button
            type="button"
            disabled={working || !item.trim()}
            onClick={() => void send(`craft ${item.trim()} ${count} ${craftMode}`)}
          >
            {tr("bot.production.craft")}
          </button>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title={tr("bot.production.smeltingAndCooking")}
        description={tr("bot.production.theBotLoadsAn")}
        collapsible={false}
      >
        <div className="mineflayer-bot-grid">
          <MinecraftSearchField
            label={tr("bot.production.rawMaterial")}
            value={smeltItem}
            onChange={setSmeltItem}
            catalog={catalog}
            scope="items"
            disabled={disabled}
          />
          {number(tr("bot.production.rawMaterialCount"), smeltCount, setSmeltCount, 1, 64)}
          <MinecraftSearchField
            label={tr("bot.production.fuelEmptyAuto")}
            value={fuel}
            onChange={setFuel}
            catalog={catalog}
            scope="items"
            disabled={disabled}
            placeholder={tr("bot.production.automatic")}
          />
          <label className="mineflayer-bot-field">
            <span>{tr("bot.production.furnace")}</span>
            <SearchableSelect
              label={tr("bot.production.furnace")}
              variant="field"
              allowEmpty={false}
              value={furnace}
              onChange={setFurnace}
              disabled={disabled}
              options={[
                { value: "auto", label: tr("bot.production.automatic") },
                { value: "furnace", label: tr("bot.production.regularFurnace") },
                { value: "blast_furnace", label: tr("bot.production.blastFurnace") },
                { value: "smoker", label: tr("bot.production.smoker") },
              ]}
            />
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
            {tr("bot.production.startSmelting")}
          </button>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title={tr("bot.production.workstations")}
        description={tr("bot.production.pickABlockThe")}
        collapsible={false}
      >
        <div className="mineflayer-bot-grid">
          <label className="mineflayer-bot-field">
            <span>{tr("bot.production.blockNearTheBot")}</span>
            <SearchableSelect
              label={tr("bot.production.blockNearTheBot")}
              variant="field"
              allowEmpty={false}
              value={station}
              onChange={setStation}
              disabled={disabled}
              options={STATIONS.map((value) => ({
                value,
                label: tr(`bot.production.station.${value}`),
              }))}
            />
          </label>
          <div className="mineflayer-coordinate-actions">
            <button
              type="button"
              disabled={working}
              onClick={() => void send(`station open ${station}`)}
            >
              {tr("bot.production.walkOverAndOpen2")}
            </button>
          </div>
        </div>
        <p className="mineflayer-production-hint">
          {slotHelp(active?.name || station) || tr("bot.production.slotNumberingStartsAt")}
        </p>
        {active && (
          <>
            <p>
              {tr("bot.production.open")}: {stationName(active.name) || active.name} ·{" "}
              {active.position.x} {active.position.y} {active.position.z}
            </p>
            <div
              className="mineflayer-production-slots"
              aria-label={tr("bot.production.workstationSlots")}
            >
              {active.slots.map((entry, index) => (
                <button
                  key={index}
                  type="button"
                  aria-pressed={slot === index}
                  disabled={working}
                  onClick={() => setSlot(index)}
                  className={slot === index ? "active" : ""}
                >
                  <small>
                    {tr("bot.production.slot")} {index}
                  </small>
                  <span>{entry ? `${entry.name} × ${entry.count}` : tr("common.empty")}</span>
                </button>
              ))}
            </div>
            <div className="mineflayer-bot-grid">
              {number(
                tr("bot.production.slotNumber"),
                slot,
                setSlot,
                0,
                Math.max(0, active.slots.length - 1),
              )}
              <MinecraftSearchField
                label={tr("bot.production.itemToLoad")}
                value={stationItem}
                onChange={setStationItem}
                catalog={catalog}
                scope="items"
                disabled={disabled}
              />
              {number(tr("bot.production.countToLoad"), stationCount, setStationCount, 1, 64)}
            </div>
            <div className="mineflayer-coordinate-actions">
              <button
                type="button"
                disabled={working || !stationItem.trim()}
                onClick={() =>
                  void send(`station put ${slot} ${stationItem.trim()} ${stationCount}`)
                }
              >
                {tr("bot.production.putIntoSlot")} {slot}
              </button>
              <button
                type="button"
                disabled={working || !active.slots[slot]}
                onClick={() => void send(`station take ${slot}`)}
              >
                {tr("bot.production.takeFromSlot")} {slot}
              </button>
            </div>
            {["stonecutter", "loom", "enchanting_table"].includes(active.name) && (
              <>
                {number(
                  active.name === "enchanting_table"
                    ? tr("bot.production.enchantmentOption02")
                    : tr("bot.production.optionNumberFrom0"),
                  choice,
                  setChoice,
                  0,
                  active.name === "enchanting_table" ? 2 : 255,
                )}
                {active.name === "enchanting_table" && (
                  <p className="mineflayer-production-hint">
                    {tr("bot.production.requiredLevels")}:{" "}
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
                    {active.name === "enchanting_table"
                      ? tr("bot.production.enchant")
                      : tr("bot.production.chooseOption")}
                  </button>
                </div>
              </>
            )}
            {/anvil$/.test(active.name) && (
              <>
                <label className="mineflayer-bot-field">
                  <span>{tr("bot.production.newItemName")}</span>
                  <TextField
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
                    {tr("bot.production.setName")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </PluginSettingsGroup>
      <PluginSettingsGroup title={tr("bot.production.currentWork")} collapsible={false}>
        <p role="status" aria-live="polite">
          {connected
            ? progress?.message || tr("bot.production.readyToWork")
            : tr("bot.production.connectTheBotTo")}
        </p>
        <div className="mineflayer-coordinate-actions">
          <button type="button" disabled={disabled} onClick={() => void send("station stop")}>
            {tr("bot.production.stopAndCloseThe")}
          </button>
        </div>
        <p className="mineflayer-production-hint">{tr("bot.production.whenSmeltingOrBrewing")}</p>
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
