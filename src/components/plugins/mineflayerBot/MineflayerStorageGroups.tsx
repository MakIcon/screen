import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslation } from "../../../i18n/locale";
import { localizeCatalog, localizeStorageFilter } from "./catalogLocalization";
import { invoke } from "@tauri-apps/api/core";
import { ExpandablePanel } from "../../layout/ExpandablePanel";
import { MinecraftSearchField } from "../../inputs/MinecraftSearchField";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { minecraftSelectedNames } from "../../inputs/minecraftSearch";
import { toErrorMessage } from "../../../utils/errors";
import { formatBlockCoordinates, parseBlockCoordinates } from "./gatheringCoordinates";
import {
  STORAGE_FILTERS,
  moveStorageGroup,
  storageCatalog,
  storagePositionKey,
  storageChestCount,
} from "./storageGroups";
import type { MineflayerBotStatus, MineflayerStorageGroup, MinecraftCatalog } from "../../../types";
import "./MineflayerStorageGroups.css";

type Props = {
  groups: MineflayerStorageGroup[];
  onChange: (groups: MineflayerStorageGroup[]) => void;
  catalog: MinecraftCatalog;
  connected: boolean;
  disabled: boolean;
  status: MineflayerBotStatus | null;
  refresh: () => Promise<unknown>;
  onDeposit: () => void;
};

export function MineflayerStorageGroups({
  groups,
  onChange,
  catalog,
  connected,
  disabled,
  status,
  refresh,
  onDeposit,
}: Props) {
  const locale = useLocale();
  const tr = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<Record<string, string>>({});
  const [filterDraft, setFilterDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [scanRadius, setScanRadius] = useState(32);
  const latest = useRef(groups);
  latest.current = groups;
  const change = useRef(onChange);
  change.current = onChange;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => storageCatalog(localizeCatalog(catalog)), [catalog, locale]);
  const production = connected ? status?.inventory?.production : null;
  const scan = production?.storageScan;
  const scanning = scan?.state === "running";
  const pending = disabled || Boolean(busy) || Boolean(production?.busy);
  const total = groups.reduce((count, group) => count + group.chests.length, 0);
  const legacy = status?.gathering?.selection?.chest;
  const liveStatus = status?.gathering?.selection?.storageStatus;
  const label = (token: string) =>
    options.entries.find((entry) => entry.name === token)?.displayName || token;
  function patch(id: string, value: Partial<MineflayerStorageGroup>) {
    if (value.filters)
      setFilterDraft((current) => ({ ...current, [id]: value.filters!.join(", ") }));
    change.current(
      latest.current.map((group) => (group.id === id ? { ...group, ...value } : group)),
    );
  }
  function create(chests: MineflayerStorageGroup["chests"] = []) {
    const id = crypto.randomUUID();
    onChange([
      ...latest.current,
      {
        id,
        name: chests.length
          ? tr("bot.storageGroups.sharedStorage")
          : tr("bot.storageGroups.newGroup"),
        enabled: true,
        filters: ["#all"],
        chests,
      },
    ]);
    setExpanded(id);
    setError("");
    setFeedback("");
  }
  function addChest(id: string, point: MineflayerStorageGroup["chests"][number]) {
    const group = latest.current.find((entry) => entry.id === id);
    if (!group) return;
    if (group.chests.some((entry) => storagePositionKey(entry) === storagePositionKey(point))) {
      setFeedback(tr("bot.storageGroups.thisChestIsAlready"));
      return;
    }
    if (group.chests.length >= 32) throw new Error(tr("bot.storageGroups.aGroupCanHold"));
    patch(id, { chests: [...group.chests, point] });
    setCoordinates((current) => ({ ...current, [id]: "" }));
    setFeedback(
      tr("bot.storageGroups.chestAddedTo", {
        chest: formatBlockCoordinates(point),
        group: group.name || tr("bot.storageGroups.newGroup"),
      }),
    );
  }
  async function capture(id: string) {
    if (pending || !connected) return;
    setBusy(id);
    setError("");
    setFeedback("");
    try {
      await invoke("send_mineflayer_bot_chat", { message: "stash pick", command: true });
      const updated = await invoke<MineflayerBotStatus>("get_mineflayer_bot_status");
      const point = updated.gathering?.selection?.storagePick;
      if (!point) throw new Error(tr("bot.storageGroups.couldNotGetThe"));
      addChest(id, point);
      await refresh();
    } catch (failure) {
      setError(toErrorMessage(failure));
    } finally {
      setBusy("");
    }
  }
  async function apply() {
    if (pending || !connected) return;
    setBusy("apply");
    setError("");
    setFeedback("");
    try {
      await invoke("configure_mineflayer_bot_storage", { groups: latest.current });
      await refresh();
      setFeedback(tr("bot.storageGroups.groupsAppliedToThe"));
    } catch (failure) {
      setError(toErrorMessage(failure));
    } finally {
      setBusy("");
    }
  }
  async function scanChests() {
    if (pending || !connected) return;
    setBusy("scan");
    setError("");
    setFeedback("");
    try {
      await invoke("configure_mineflayer_bot_storage", { groups: latest.current });
      await invoke("send_mineflayer_bot_chat", {
        message: `stash scan ${scanRadius}`,
        command: true,
      });
      await refresh();
      setFeedback(tr("bot.storageGroups.theBotIsChecking"));
    } catch (failure) {
      setError(toErrorMessage(failure));
    } finally {
      setBusy("");
    }
  }
  async function stopScan() {
    try {
      await invoke("send_mineflayer_bot_chat", { message: "station stop", command: true });
      await refresh();
    } catch (failure) {
      setError(toErrorMessage(failure));
    }
  }
  function preset(group: MineflayerStorageGroup, token: string) {
    const next =
      token === "#all"
        ? ["#all"]
        : group.filters.includes(token)
          ? group.filters.filter((value) => value !== token)
          : [...group.filters.filter((value) => value !== "#all"), token];
    patch(group.id, {
      filters: next,
      ...(group.name === "Новая группа" || group.name === "New group"
        ? { name: label(token) }
        : {}),
    });
  }
  return (
    <ExpandablePanel
      title={tr("bot.storageGroups.chestsAndSorting")}
      icon={<span className="mineflayer-chest-icon" />}
    >
      <div className="mineflayer-storage">
        <div className="mineflayer-storage-toolbar">
          <div>
            <strong>{tr("bot.storageGroups.lootStorage")}</strong>
            <span>
              {tr("bot.storageGroups.groups")}: {groups.length} · {storageChestCount(total)}
            </span>
          </div>
          <button type="button" disabled={pending || groups.length >= 32} onClick={() => create()}>
            <span aria-hidden="true">＋</span> {tr("bot.storageGroups.addGroup")}
          </button>
        </div>
        <div className="mineflayer-storage-scan">
          <strong>{tr("bot.storageGroups.autoScanChests")}</strong>
          <p>{tr("bot.storageGroups.theBotFindsChests")}</p>
          <div className="mineflayer-bot-grid">
            <label className="mineflayer-bot-field">
              <span>{tr("bot.storageGroups.radiusAroundTheBot")}</span>
              <CustomNumberInput
                ariaLabel={tr("bot.storageGroups.chestScanRadius")}
                background="transparent"
                min={4}
                max={64}
                step={1}
                value={scanRadius}
                onChange={setScanRadius}
                disabled={pending}
              />
            </label>
            <button
              type="button"
              disabled={pending || !connected}
              onClick={() => void scanChests()}
            >
              {busy === "scan" || scanning
                ? tr("bot.storageGroups.scanning")
                : tr("bot.storageGroups.scanAndAssign")}
            </button>
          </div>
          <small>{tr("bot.storageGroups.aDoubleChestCounts")}</small>
          {scan && (
            <>
              <p role="status" aria-live="polite">
                {scanning
                  ? `${tr("bot.storageGroups.checked")} ${scan.records.length}/${scan.total}. ${production?.message || ""}`
                  : scan.state === "complete"
                    ? tr("bot.storageGroups.scanCompleteFoundAdded", {
                        total: scan.total,
                        added: scan.added,
                      })
                    : scan.state === "cancelled"
                      ? tr("bot.storageGroups.scanStoppedGroupsWere")
                      : tr("bot.storageGroups.theScanDidNot")}
              </p>
              {scanning && (
                <button type="button" disabled={!connected} onClick={() => void stopScan()}>
                  {tr("bot.storageGroups.stopScan")}
                </button>
              )}
              <div
                className="mineflayer-storage-scan-results"
                aria-label={tr("bot.storageGroups.chestsFound")}
              >
                {scan.records.map((record) => (
                  <div
                    key={storagePositionKey(record.position)}
                    className={record.error ? "is-error" : ""}
                  >
                    <strong>
                      {record.label}
                      {record.configured ? ` · ${tr("bot.storageGroups.alreadyConfigured")}` : ""}
                    </strong>
                    <span>
                      {formatBlockCoordinates(record.position)} ·{" "}
                      {record.positions.length === 2
                        ? tr("bot.storageGroups.doubleChest")
                        : record.name === "barrel"
                          ? tr("bot.storageGroups.barrel")
                          : tr("bot.storageGroups.container")}{" "}
                      · {tr("units.blocksShort", { value: record.distance })}
                    </span>
                    <small>
                      {record.error ||
                        `${tr("bot.storageGroups.freeSlots")}: ${record.freeSlots}/${record.totalSlots}${
                          record.contents?.length
                            ? ` · ${record.contents
                                .slice(0, 3)
                                .map((item) => `${label(item.name)} × ${item.count}`)
                                .join(", ")}`
                            : ""
                        }`}
                    </small>
                  </div>
                ))}
              </div>
              {scan.warnings.map((warning) => (
                <p key={warning} className="mineflayer-bot-combat-note">
                  {warning}
                </p>
              ))}
            </>
          )}
        </div>
        {!groups.length && (
          <div className="mineflayer-storage-empty">
            <span className="mineflayer-storage-empty-icon" aria-hidden="true">
              <span className="mineflayer-chest-icon" />
            </span>
            <strong>{tr("bot.storageGroups.aSeparateStorageFor")}</strong>
            <p>{tr("bot.storageGroups.createAGroupChoose")}</p>
            <div className="mineflayer-storage-examples">
              <span>{tr("bot.storageGroups.wood3Chests")}</span>
              <span>{tr("bot.storageGroups.diamonds1Chest")}</span>
              <span>{tr("bot.storageGroups.stone2Chests")}</span>
            </div>
            {legacy && (
              <button type="button" disabled={pending} onClick={() => create([legacy])}>
                {tr("bot.storageGroups.addSelectedChest")} · {formatBlockCoordinates(legacy)}
              </button>
            )}
          </div>
        )}
        <div className="mineflayer-storage-groups">
          {groups.map((group, index) => {
            const open = expanded === group.id;
            const point = parseBlockCoordinates(coordinates[group.id] || "");
            const ready = group.filters.length > 0 && group.chests.length > 0;
            const icon = options.entries.find((entry) => entry.name === group.filters[0])?.texture;
            return (
              <article
                key={group.id}
                className={`mineflayer-storage-group${open ? " is-open" : ""}${!group.enabled ? " is-disabled" : ""}`}
              >
                <div className="mineflayer-storage-group-header">
                  <button
                    type="button"
                    className="mineflayer-storage-group-summary"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : group.id)}
                  >
                    <span className="mineflayer-storage-resource-icon" aria-hidden="true">
                      {icon ? (
                        <img src={icon} alt="" />
                      ) : (
                        <span className="mineflayer-chest-icon" />
                      )}
                    </span>
                    <span className="mineflayer-storage-group-title">
                      <strong>{group.name || tr("bot.storageGroups.newGroup")}</strong>
                      <small>
                        {group.filters.map(label).join(" · ") ||
                          tr("bot.storageGroups.chooseResources")}
                      </small>
                    </span>
                    <span className={`mineflayer-storage-count${!ready ? " is-empty" : ""}`}>
                      {group.chests.length
                        ? storageChestCount(group.chests.length)
                        : tr("bot.storageGroups.noChests")}
                    </span>
                    <span className="mineflayer-storage-chevron" aria-hidden="true">
                      {open ? "−" : "+"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`mineflayer-storage-enable${group.enabled ? " is-enabled" : ""}`}
                    disabled={pending}
                    aria-label={`${group.enabled ? tr("bot.storageGroups.disableGroup") : tr("bot.storageGroups.enableGroup")} ${group.name}`}
                    aria-pressed={group.enabled}
                    onClick={() => patch(group.id, { enabled: !group.enabled })}
                  >
                    <span />
                    {group.enabled ? tr("common.onCaps") : tr("common.offCaps")}
                  </button>
                </div>
                {open && (
                  <div className="mineflayer-storage-group-body">
                    <label className="mineflayer-bot-field">
                      <span>{tr("bot.storageGroups.groupName")}</span>
                      <input
                        value={group.name}
                        maxLength={64}
                        placeholder={tr("bot.storageGroups.forExampleWoodAt")}
                        disabled={pending}
                        onChange={(event) => patch(group.id, { name: event.target.value })}
                      />
                    </label>
                    <div
                      className="mineflayer-storage-presets"
                      role="group"
                      aria-label={tr("bot.storageGroups.resourceGroups")}
                    >
                      {STORAGE_FILTERS.filter((filter) => !filter.material)
                        .map(localizeStorageFilter)
                        .map((filter) => (
                          <button
                            type="button"
                            key={filter.name}
                            disabled={pending}
                            aria-pressed={group.filters.includes(filter.name)}
                            className={group.filters.includes(filter.name) ? "active" : ""}
                            onClick={() => preset(group, filter.name)}
                          >
                            {filter.displayName}
                          </button>
                        ))}
                    </div>
                    <MinecraftSearchField
                      label={tr("bot.storageGroups.whatToStore")}
                      value={filterDraft[group.id] ?? group.filters.join(", ")}
                      catalog={options}
                      scope="items"
                      multiple
                      disabled={pending}
                      sections={[
                        { id: "storage", label: tr("bot.storageGroups.storageCategories") },
                        {
                          id: "resources",
                          label: tr("bot.storageGroups.resourcesByMaterial"),
                        },
                        { id: "item", label: tr("bot.storageGroups.itemsAndBlocks") },
                      ]}
                      placeholder={tr("bot.storageGroups.anItemABlock")}
                      onChange={(value) => {
                        const tokens = minecraftSelectedNames(value);
                        if (
                          tokens.every(
                            (token) =>
                              options.entries.some((entry) => entry.name === token) ||
                              group.filters.includes(token) ||
                              /^[a-z0-9_]+\*$/.test(token),
                          )
                        )
                          patch(group.id, { filters: tokens });
                        setFilterDraft((current) => ({ ...current, [group.id]: value }));
                      }}
                    />
                    <div className="mineflayer-storage-filter-chips">
                      {group.filters.map((token) => (
                        <span key={token}>
                          {label(token)}
                          <button
                            type="button"
                            disabled={pending}
                            aria-label={`${tr("bot.storageGroups.removeResource")} ${label(token)}`}
                            onClick={() =>
                              patch(group.id, {
                                filters: group.filters.filter((value) => value !== token),
                              })
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="mineflayer-storage-chests-head">
                      <strong>{tr("bot.storageGroups.chestsInGroup")}</strong>
                      <span>{tr("bot.storageGroups.filledInOrder")}</span>
                    </div>
                    <ol className="mineflayer-storage-chests">
                      {group.chests.map((chest, chestIndex) => {
                        const key = storagePositionKey(chest),
                          progress = liveStatus?.[`${group.id}:${key}`];
                        return (
                          <li key={key}>
                            <span className="mineflayer-storage-chest-number">
                              {chestIndex + 1}
                            </span>
                            <code>{formatBlockCoordinates(chest)}</code>
                            {progress && (
                              <span
                                className={`mineflayer-storage-chest-state is-${progress.state}`}
                                data-tooltip={progress.message}
                              >
                                {progress.state === "ok"
                                  ? tr("bot.storageGroups.unloaded")
                                  : progress.state === "full"
                                    ? tr("bot.storageGroups.full")
                                    : tr("bot.storageGroups.unavailable")}
                              </span>
                            )}
                            <div className="mineflayer-storage-row-actions">
                              <button
                                type="button"
                                disabled={pending || chestIndex === 0}
                                aria-label={`${tr("bot.storageGroups.moveChestUp")} ${chestIndex + 1}`}
                                onClick={() => {
                                  const chests = [...group.chests];
                                  [chests[chestIndex], chests[chestIndex - 1]] = [
                                    chests[chestIndex - 1],
                                    chests[chestIndex],
                                  ];
                                  patch(group.id, { chests });
                                }}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={pending || chestIndex === group.chests.length - 1}
                                aria-label={`${tr("bot.storageGroups.moveChestDown")} ${chestIndex + 1}`}
                                onClick={() => {
                                  const chests = [...group.chests];
                                  [chests[chestIndex], chests[chestIndex + 1]] = [
                                    chests[chestIndex + 1],
                                    chests[chestIndex],
                                  ];
                                  patch(group.id, { chests });
                                }}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="is-danger"
                                disabled={pending}
                                aria-label={`${tr("bot.storageGroups.removeChest")} ${formatBlockCoordinates(chest)}`}
                                onClick={() =>
                                  patch(group.id, {
                                    chests: group.chests.filter(
                                      (entry) => storagePositionKey(entry) !== key,
                                    ),
                                  })
                                }
                              >
                                ×
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    {!group.chests.length && (
                      <p className="mineflayer-storage-chests-empty">
                        {tr("bot.storageGroups.addTheChestYou")}
                      </p>
                    )}
                    <div className="mineflayer-storage-add-chest">
                      <button
                        type="button"
                        disabled={pending || !connected || group.chests.length >= 32}
                        onClick={() => void capture(group.id)}
                      >
                        {busy === group.id
                          ? tr("bot.storageGroups.selecting")
                          : tr("bot.storageGroups.aimedAt")}
                      </button>
                      <div>
                        <input
                          aria-label={`${tr("bot.storageGroups.chestCoordinatesFor")} ${group.name}`}
                          placeholder="X Y Z"
                          value={coordinates[group.id] || ""}
                          disabled={pending}
                          onChange={(event) =>
                            setCoordinates((current) => ({
                              ...current,
                              [group.id]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && point && group.chests.length < 32) {
                              event.preventDefault();
                              addChest(group.id, point);
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={pending || !point || group.chests.length >= 32}
                          aria-label={tr("bot.storageGroups.addAChestBy")}
                          onClick={() => {
                            if (point) addChest(group.id, point);
                          }}
                        >
                          ＋
                        </button>
                      </div>
                    </div>
                    <div className="mineflayer-storage-group-footer">
                      <span>
                        {tr("bot.storageGroups.groupPriority")} · {index + 1}
                      </span>
                      <div className="mineflayer-storage-row-actions">
                        <button
                          type="button"
                          disabled={pending || index === 0}
                          aria-label={`${tr("bot.storageGroups.moveGroupUp")} ${group.name}`}
                          onClick={() => onChange(moveStorageGroup(groups, group.id, -1))}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={pending || index === groups.length - 1}
                          aria-label={`${tr("bot.storageGroups.moveGroupDown")} ${group.name}`}
                          onClick={() => onChange(moveStorageGroup(groups, group.id, 1))}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          disabled={pending}
                          onClick={() => onChange(groups.filter((entry) => entry.id !== group.id))}
                        >
                          {tr("bot.storageGroups.deleteGroup")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <p className="mineflayer-bot-combat-note">{tr("bot.storageGroups.groupsAreSavedIn")}</p>
        <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
          <button type="button" disabled={pending || !connected} onClick={() => void apply()}>
            {busy === "apply"
              ? tr("bot.storageGroups.applying")
              : tr("bot.storageGroups.applyToBot")}
          </button>
          <button
            type="button"
            disabled={pending || !connected || (!total && !legacy)}
            onClick={onDeposit}
          >
            {tr("bot.storageGroups.unloadLoot")}
          </button>
        </div>
        <p className="mineflayer-bot-combat-note">
          {tr("bot.storageGroups.groupsAreAppliedAutomatically")}
        </p>
        {(feedback || error) && (
          <p
            className={`mineflayer-bot-chat-feedback${error ? " is-error" : ""}`}
            role={error ? "alert" : "status"}
          >
            {error || feedback}
          </p>
        )}
      </div>
    </ExpandablePanel>
  );
}
