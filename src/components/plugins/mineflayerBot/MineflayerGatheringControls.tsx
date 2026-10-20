import { useEffect, useMemo, useRef, useState } from "react";
import {
  isPlainMessageKey,
  translate,
  useLocale,
  useTranslation,
  Trans,
} from "../../../i18n/locale";
import { localizeCatalog } from "./catalogLocalization";
import { invoke } from "@tauri-apps/api/core";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { ElementToggle } from "../../inputs/ElementToggle";
import { MinecraftSearchField } from "../../inputs/MinecraftSearchField";
import { MineflayerStorageGroups } from "./MineflayerStorageGroups";
import { minecraftSelectedNames } from "../../inputs/minecraftSearch";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { toErrorMessage } from "../../../utils/errors";
import bundledCatalog from "../../../data/minecraftCatalog.json";
import { FARMING_KINDS, farmingNote, farmCropLabel } from "./farming";
import { MineflayerFarmCropField } from "./MineflayerFarmCropField";
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

type Mode =
  | "mine"
  | "forest"
  | "quarry"
  | "collect"
  | "tunnel"
  | "till"
  | "plant"
  | "harvest"
  | "farm";
const MODES: Mode[] = [
  "mine",
  "forest",
  "quarry",
  "collect",
  "tunnel",
  "till",
  "plant",
  "harvest",
  "farm",
];
const phaseLabel = (phase: string) => {
  const key = `bot.gathering.phase.${phase}`;
  return isPlainMessageKey(key) ? translate(key) : phase;
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
  const farmTitles: Record<string, string> = {
    till: translate("bot.gathering.tillingSoil"),
    plant: translate("bot.gathering.plantingSeeds"),
    harvest: translate("bot.gathering.harvestingCrops"),
    farm: translate("bot.gathering.tendingTheFarm"),
  };
  if (farmTitles[task.kind]) return farmTitles[task.kind];
  if (task.tunnel) return translate("bot.gathering.diggingATunnel");
  if (task.kind === "forest") return translate("bot.gathering.logging");
  if (task.kind === "quarry") return translate("bot.gathering.clearingAnArea");
  if (task.kind === "collect") return translate("bot.gathering.collectingItems");
  if (task.kind === "deposit") return translate("bot.gathering.unloadingIntoAChest");
  if (task.kind === "deliver") return translate("bot.gathering.deliveringToTheOwner");
  const labels: Record<string, string> = {
    iron: translate("bot.gathering.iron"),
    diamond: translate("bot.gathering.diamonds"),
    gold: translate("bot.gathering.gold"),
    coal: translate("bot.gathering.coal"),
    copper: translate("bot.gathering.copper"),
    emerald: translate("bot.gathering.emeralds"),
    redstone: translate("bot.gathering.redstone"),
    lapis: translate("bot.gathering.lapis"),
  };
  const names = [
    ...new Set(
      (task.names || []).map((name) =>
        name.replace(/^deepslate_|^nether_/, "").replace(/_ore$/, ""),
      ),
    ),
  ];
  return `${translate("bot.gathering.mining")} · ${names.length > 3 ? translate("bot.gathering.ores") : names.map((name) => labels[name] || name).join(", ") || translate("bot.gathering.blocks")}`;
}
function taskDetail(task: MineflayerWorkTask) {
  const values = [];
  if (task.radius) values.push(translate("bot.gathering.radiusBlocks", { count: task.radius }));
  if (task.kind === "mine") values.push(`Y ${task.minY}…${task.maxY}`);
  if (task.area)
    values.push(translate("bot.gathering.blocksInTheArea", { count: task.area.volume }));
  if (task.item)
    values.push(FARMING_KINDS.includes(task.kind) ? farmCropLabel(task.item) : task.item);
  if (["mine", "forest"].includes(task.kind))
    values.push(
      task.count
        ? translate("bot.gathering.targetBlocks", { count: task.count })
        : translate("bot.gathering.allAvailableBlocks"),
    );
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
  const locale = useLocale();
  const tr = useTranslation();
  const [mode, setMode] = useState<Mode>("forest");
  const [blocks, setBlocks] = useState("iron");
  const [count, setCount] = useState(0),
    [radius, setRadius] = useState(16);
  const [leaves, setLeaves] = useState(false),
    [scaffold, setScaffold] = useState(true);
  const [corner1, setCorner1] = useState(""),
    [corner2, setCorner2] = useState("");
  const [item, setItem] = useState("");
  const [crop, setCrop] = useState("auto");
  const [replant, setReplant] = useState(true);
  const farming = FARMING_KINDS.includes(mode);
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
  const catalog = useMemo(
    () => localizeCatalog(connected && liveCatalog ? liveCatalog : OFFLINE_CATALOG),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connected, liveCatalog, locale],
  );
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
  const command = farming
    ? mode === "till"
      ? `till ${count} ${radius}`
      : `${mode} ${crop} ${count} ${radius}${mode === "harvest" ? (replant ? " replant" : " leave") : ""}`
    : mode === "mine"
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
        /^(mine|forest|quarry|collect|tunnel|deposit|deliver|till|plant|harvest|farm)( |$)/.test(
          value,
        ) ||
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
        if (!picked) throw new Error(tr("bot.gathering.couldNotGetThe"));
        (capture === "1" ? setCorner1 : setCorner2)(formatBlockCoordinates(picked));
      }
      setFeedback(
        capture
          ? tr("bot.gathering.cornerSelectedTheCoordinates", { capture })
          : value === defenseCommand
            ? tr("bot.gathering.miningDefenseAppliedTo")
            : value === passageCommand
              ? tr("bot.gathering.settingsAppliedTheNext")
              : value === "deliver"
                ? tr("bot.gathering.theBotIsBringing")
                : tr("bot.gathering.commandAcceptedTheCurrent"),
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
        corner === "1" ? tr("bot.gathering.firstCornerXY") : tr("bot.gathering.secondCornerXY"),
        value,
        change,
        tr("bot.gathering.pickAPointIn"),
      )}
      <div className="mineflayer-coordinate-actions">
        <button
          type="button"
          disabled={disabled}
          onClick={() => void send(`area launcher ${corner} owner`, corner)}
        >
          {tr("bot.gathering.myPosition")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void send(`area launcher ${corner} look`, corner)}
        >
          {tr("bot.gathering.blockImAimingAt")}
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
      title={tr("bot.gathering.gatheringTasks")}
      description={tr("bot.gathering.addWorkToThe")}
      collapsible={false}
    >
      {!connected && (
        <p role="status" className="mineflayer-bot-combat-note">
          {tr("bot.gathering.youCanSetUp")}
        </p>
      )}
      <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
        <button type="button" disabled={disabled} onClick={() => void send("deliver")}>
          {tr("bot.gathering.bringMeTheLoot")}
        </button>
        <button type="button" onClick={onOpenInventory}>
          {tr("bot.gathering.inventoryAndStatus")}
        </button>
      </div>
      <div className="mineflayer-bot-gathering-progress" role="status" aria-live="polite">
        <strong>
          {progress ? phaseLabel(progress.phase) : tr("bot.gathering.addYourFirstTask")}
        </strong>
        {status?.gathering && (
          <span>
            {active && FARMING_KINDS.includes(active.kind)
              ? tr("bot.gathering.farmStats", {
                  tilled: active.tilled || 0,
                  planted: active.planted || 0,
                  harvested: active.harvested || 0,
                })
              : tr("bot.gathering.minedStat", { mined: status.gathering.mined })}{" "}
            ·{" "}
            {tr("bot.gathering.queueStats", {
              collected: status.gathering.collected,
              queued: status.gathering.queued,
            })}
          </span>
        )}
        {status?.gathering?.reason && <p>{status.gathering.reason}</p>}
      </div>
      <div className="mineflayer-work-list" aria-label={tr("bot.gathering.taskList")}>
        {active && (
          <article
            className={`mineflayer-work-card is-current${progress?.phase === "paused" ? " is-paused" : ""}`}
          >
            <div className="mineflayer-work-number">#{active.id}</div>
            <div className="mineflayer-work-content">
              <div className="mineflayer-work-heading">
                <strong>{workTaskTitle(active)}</strong>
                <span className="mineflayer-work-badge">
                  {phaseLabel(progress?.phase || "idle")}
                </span>
              </div>
              <p>{taskDetail(active)}</p>
              <div className="mineflayer-work-counts">
                <span>
                  {FARMING_KINDS.includes(active.kind)
                    ? tr("bot.gathering.actions")
                    : tr("bot.gathering.mined")}{" "}
                  <b>
                    {active.mined}
                    {active.count ? ` / ${active.count}` : ""}
                  </b>
                </span>
                <span>
                  {tr("bot.gathering.collected")} <b>{active.collected}</b>
                </span>
                {active.delivered > 0 && (
                  <span>
                    {tr("bot.gathering.delivered")} <b>{active.delivered}</b>
                  </span>
                )}
              </div>
              {active.count > 0 && (
                <progress
                  aria-label={tr("bot.gathering.currentTaskProgress")}
                  max={active.count}
                  value={Math.min(active.mined, active.count)}
                />
              )}
            </div>
            <button
              type="button"
              className="mineflayer-work-icon is-danger"
              disabled={disabled}
              aria-label={`${tr("bot.gathering.cancelTask")} ${active.id}`}
              data-tooltip={tr("bot.gathering.cancelTheCurrentTask")}
              onClick={() => void send(`work cancel ${active.id}`)}
            >
              <WorkCancelIcon />
            </button>
          </article>
        )}
        {progress?.suspended && (
          <p className="mineflayer-work-empty">
            {tr("bot.gathering.afterDelivery")}: #{progress.suspended.id} ·{" "}
            {workTaskTitle(progress.suspended)}
          </p>
        )}
        <div className="mineflayer-work-subhead">
          <strong>
            {tr("bot.gathering.queue")} <span>{queue.length}</span>
          </strong>
          {queue.length > 0 && (
            <button type="button" disabled={disabled} onClick={() => void send("work clear")}>
              {tr("bot.gathering.clearQueue")}
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
                  aria-label={`${tr("bot.gathering.moveTaskUp")} ${task.id}`}
                  data-tooltip={tr("bot.gathering.up")}
                  onClick={() => void send(`work move ${task.id} up`)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="mineflayer-work-icon"
                  disabled={disabled || index === queue.length - 1}
                  aria-label={`${tr("bot.gathering.moveTaskDown")} ${task.id}`}
                  data-tooltip={tr("bot.gathering.down")}
                  onClick={() => void send(`work move ${task.id} down`)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="mineflayer-work-icon is-danger"
                  disabled={disabled}
                  aria-label={`${tr("bot.gathering.removeTask")} ${task.id}`}
                  data-tooltip={tr("bot.gathering.remove")}
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
            {active ? tr("bot.gathering.theNextTaskWill") : tr("bot.gathering.theQueueIsEmpty")}
          </p>
        )}
        <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
          <button
            type="button"
            disabled={disabled || (!active && !queue.length)}
            onClick={() => void send(progress?.phase === "paused" ? "work resume" : "work pause")}
          >
            {progress?.phase === "paused" ? tr("common.resume") : tr("common.pause")}
          </button>
          <button
            type="button"
            disabled={disabled || (!active && !queue.length)}
            onClick={() => void send("work stop")}
          >
            {tr("bot.gathering.cancelAll")}
          </button>
        </div>
      </div>
      <button
        type="button"
        className="mineflayer-work-add"
        aria-expanded={showForm}
        onClick={() => setShowForm(!showForm)}
      >
        <span>{showForm ? "−" : "+"}</span> {tr("bot.gathering.addATask")}
      </button>
      {showForm && (
        <div className="mineflayer-work-form">
          <div
            className="mineflayer-bot-mode mineflayer-bot-gathering-modes"
            role="group"
            aria-label={tr("bot.gathering.typeOfWork")}
          >
            {MODES.map((value) => (
              <button
                key={value}
                type="button"
                className={mode === value ? "active" : ""}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  if (FARMING_KINDS.includes(value) && !farming) {
                    setRadius(8);
                    setCount(0);
                  }
                  setError("");
                }}
              >
                {tr(`bot.gathering.mode.${value}`)}
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
                {farming && mode !== "till" && (
                  <MineflayerFarmCropField value={crop} onChange={setCrop} />
                )}
                {farming && number(tr("bot.gathering.actions0All"), count, setCount, 0, 4096)}
                {mode === "mine" && (
                  <MinecraftSearchField
                    label={tr("bot.gathering.blocksOrGroup")}
                    value={blocks}
                    onChange={setBlocks}
                    catalog={catalog}
                    scope="blocks"
                    multiple
                    disabled={sending}
                    placeholder={tr("bot.gathering.nameOrIdDiamond")}
                  />
                )}
                {(mode === "mine" || mode === "forest") &&
                  number(tr("bot.gathering.blockCount0All"), count, setCount, 0, 1000000)}
                {mode !== "quarry" &&
                  mode !== "tunnel" &&
                  number(
                    mode === "mine"
                      ? tr("bot.gathering.horizontalRadius")
                      : tr("bot.gathering.radiusBlocks2"),
                    radius,
                    setRadius,
                    1,
                    64,
                  )}
                {mode === "mine" && !autoDepth && (
                  <>
                    {number(tr("bot.gathering.minimumY"), minY, setMinY, -64, 319)}
                    {number(tr("bot.gathering.maximumY"), maxY, setMaxY, -64, 319)}
                  </>
                )}
                {mode === "collect" && (
                  <MinecraftSearchField
                    label={tr("bot.gathering.itemEmptyAll")}
                    value={item}
                    onChange={setItem}
                    catalog={catalog}
                    scope="items"
                    disabled={sending}
                    placeholder={tr("bot.gathering.nameOrIdDiamondRawIron")}
                  />
                )}
                {mode === "quarry" && (
                  <>
                    {coordinateField("1", corner1, setCorner1)}
                    {coordinateField("2", corner2, setCorner2)}
                  </>
                )}
                {mode === "tunnel" && (
                  <>{number(tr("bot.gathering.length"), length, setLength, 1, 128)}</>
                )}
              </div>
              {mode === "harvest" && (
                <ElementToggle
                  title={tr("bot.gathering.replantAfterHarvest")}
                  note={tr("bot.gathering.useSeedsFromThe")}
                  enabled={replant}
                  onToggle={() => setReplant(!replant)}
                />
              )}
              {mode === "quarry" && (
                <div className="mineflayer-coordinate-guide">
                  <p>{tr("bot.gathering.standInTheCorner")}</p>
                  <p>
                    <Trans
                      k="bot.gathering.chatCornersHint"
                      values={{
                        first: <code>!area launcher 1 look</code>,
                        second: <code>!area launcher 2 look</code>,
                        prefix: <code>!</code>,
                      }}
                    />
                  </p>
                  {areaPreview ? (
                    <strong className={areaPreview.valid ? "" : "is-error"}>
                      {areaPreview.size.x} × {areaPreview.size.y} × {areaPreview.size.z} ·{" "}
                      {tr("bot.gathering.areaBlocks", { count: areaPreview.volume })}
                      {!areaPreview.valid && ` · ${tr("bot.gathering.limitOf32768")}`}
                    </strong>
                  ) : (corner1.trim() && !first) || (corner2.trim() && !second) ? (
                    <strong className="is-error">{tr("bot.gathering.eachCornerNeedsThree")}</strong>
                  ) : null}
                </div>
              )}
              {mode === "mine" && (
                <ElementToggle
                  title={tr("bot.gathering.searchAllDepths")}
                  note={tr("bot.gathering.fromTheBottomOf")}
                  enabled={autoDepth}
                  onToggle={() => setAutoDepth(!autoDepth)}
                />
              )}
              {mode === "forest" && (
                <div className="mineflayer-bot-toggle-grid">
                  <ElementToggle
                    title={tr("bot.gathering.removeLeaves")}
                    note={tr("bot.gathering.alongWithTheTrunks")}
                    enabled={leaves}
                    onToggle={() => setLeaves(!leaves)}
                  />
                  <ElementToggle
                    title={tr("bot.gathering.scaffoldForTallTrees")}
                    note={tr("bot.gathering.usesBlocksFromThe")}
                    enabled={scaffold}
                    onToggle={() => setScaffold(!scaffold)}
                  />
                </div>
              )}
              <p className="mineflayer-bot-combat-note">
                {farming
                  ? farmingNote()
                  : mode === "mine"
                    ? tr("bot.gathering.looksForOreUnderground")
                    : mode === "forest"
                      ? tr("bot.gathering.chopsTheTrunksOf")
                      : mode === "quarry"
                        ? tr("bot.gathering.clearsEverythingBetweenThe")
                        : mode === "tunnel"
                          ? tr("bot.gathering.digsForwardInThe")
                          : tr("bot.gathering.picksUpItemsLying")}
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
                  {active ? tr("bot.gathering.addToQueue") : tr("bot.gathering.addAndStart")}
                </button>
              </div>
            </fieldset>
          </form>
        </div>
      )}
      {history.length > 0 && (
        <details className="mineflayer-work-history">
          <summary>
            {tr("bot.gathering.completedTasks")} · {history.length}
          </summary>
          {[...history].reverse().map((task) => (
            <div key={task.id}>
              <strong>
                #{task.id} · {workTaskTitle(task)}
              </strong>
              <span>
                {task.outcome} ·{" "}
                {FARMING_KINDS.includes(task.kind)
                  ? tr("bot.gathering.historyFarm", {
                      tilled: task.tilled || 0,
                      planted: task.planted || 0,
                      harvested: task.harvested || 0,
                    })
                  : tr("bot.gathering.historyMined", { mined: task.mined })}{" "}
                · {tr("bot.gathering.historyCollected", { collected: task.collected })}
              </span>
              {task.reason && <p>{task.reason}</p>}
            </div>
          ))}
        </details>
      )}
      <PluginSettingsGroup
        title={tr("bot.gathering.defenseWhileGathering")}
        description={tr("bot.gathering.selfDefenseWhileMining")}
      >
        <ElementToggle
          title={tr("bot.gathering.defendAgainstMobs")}
          note={tr("bot.gathering.fightsOffDangerousMobs")}
          enabled={settings.defendMobs}
          onToggle={() => updatePassages({ defendMobs: !settings.defendMobs })}
        />
        <ElementToggle
          title={tr("bot.gathering.defendAgainstPlayers")}
          note={tr("bot.gathering.hitsBackReturnsTo")}
          enabled={settings.defendPlayers}
          onToggle={() => updatePassages({ defendPlayers: !settings.defendPlayers })}
        />
        <ElementToggle
          title={tr("bot.gathering.defendAgainstArrows")}
          note={tr("bot.gathering.usesAShieldIf")}
          enabled={settings.defendArrows}
          onToggle={() => updatePassages({ defendArrows: !settings.defendArrows })}
        />
        <p className="mineflayer-bot-combat-note">{tr("bot.gathering.usesTheCurrentMelee")}</p>
        <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
          <button type="button" disabled={disabled} onClick={() => void send(defenseCommand)}>
            {tr("bot.gathering.applyToBot")}
          </button>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title={tr("bot.gathering.tunnelsAndLighting")}
        description={tr("bot.gathering.passageSizeWhenMining")}
      >
        <div className="mineflayer-bot-grid">
          {number(
            tr("bot.gathering.tunnelWidthBlocks"),
            settings.tunnelWidth,
            (tunnelWidth) => updatePassages({ tunnelWidth }),
            1,
            3,
          )}
          {number(
            tr("bot.gathering.tunnelHeightBlocks"),
            settings.tunnelHeight,
            (tunnelHeight) => updatePassages({ tunnelHeight }),
            2,
            4,
          )}
          {number(
            tr("bot.gathering.stairWidthBlocks"),
            settings.stairWidth,
            (stairWidth) => updatePassages({ stairWidth }),
            1,
            3,
          )}
          {number(
            tr("bot.gathering.stairClearanceBlocks"),
            settings.stairHeight,
            (stairHeight) => updatePassages({ stairHeight }),
            3,
            4,
          )}
        </div>
        <p className="mineflayer-bot-combat-note">{tr("bot.gathering.flatTunnelsAre2")}</p>
        <ElementToggle
          title={tr("bot.gathering.placeTorchesInCaves")}
          note={tr("bot.gathering.usesRegularTorchesFrom")}
          enabled={settings.placeTorches}
          onToggle={() => updatePassages({ placeTorches: !settings.placeTorches })}
        />
        {settings.placeTorches && (
          <div className="mineflayer-bot-grid">
            {number(
              tr("bot.gathering.torchSpacingBlocks"),
              settings.torchInterval,
              (torchInterval) => updatePassages({ torchInterval }),
              4,
              16,
            )}
          </div>
        )}
        <p className="mineflayer-bot-combat-note">{tr("bot.gathering.theDefaultSpacingIs")}</p>
        <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
          <button type="button" disabled={disabled} onClick={() => void send(passageCommand)}>
            {tr("bot.gathering.applyToBot")}
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
      <p className="mineflayer-bot-combat-note">{tr("bot.gathering.lootIsKeptIn")}</p>
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
