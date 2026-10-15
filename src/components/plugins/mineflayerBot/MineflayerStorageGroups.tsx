import { useMemo, useRef, useState } from "react";
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
  const options = useMemo(() => storageCatalog(catalog), [catalog]);
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
        name: chests.length ? "Общий склад" : "Новая группа",
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
      setFeedback("Этот сундук уже добавлен в группу.");
      return;
    }
    if (group.chests.length >= 32) throw new Error("В группу можно добавить до 32 сундуков");
    patch(id, { chests: [...group.chests, point] });
    setCoordinates((current) => ({ ...current, [id]: "" }));
    setFeedback(
      `Сундук ${formatBlockCoordinates(point)} добавлен в «${group.name || "Новая группа"}».`,
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
      if (!point) throw new Error("Не удалось получить выбранный сундук. Повторите выбор.");
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
      setFeedback("Группы применены к боту. Он будет раскладывать добычу по выбранным ресурсам.");
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
      setFeedback(
        "Бот проверяет содержимое сундуков. Найденные назначения сохранятся автоматически.",
      );
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
      ...(group.name === "Новая группа" ? { name: label(token) } : {}),
    });
  }
  return (
    <ExpandablePanel title="СУНДУКИ И СОРТИРОВКА" icon={<span className="mineflayer-chest-icon" />}>
      <div className="mineflayer-storage">
        <div className="mineflayer-storage-toolbar">
          <div>
            <strong>СКЛАД ДОБЫЧИ</strong>
            <span>
              Групп: {groups.length} · {storageChestCount(total)}
            </span>
          </div>
          <button type="button" disabled={pending || groups.length >= 32} onClick={() => create()}>
            <span aria-hidden="true">＋</span> ДОБАВИТЬ ГРУППУ
          </button>
        </div>
        <div className="mineflayer-storage-scan">
          <strong>АВТОСКАНИРОВАНИЕ СУНДУКОВ</strong>
          <p>
            Бот найдёт сундуки, бочки и шалкеры, подойдёт к ним и определит назначение по
            содержимому. Из пустых выделит больше места под массовые блоки и мусор, отдельный склад
            — под ценности. Настроенные группы сохраняются.
          </p>
          <div className="mineflayer-bot-grid">
            <label className="mineflayer-bot-field">
              <span>РАДИУС ВОКРУГ БОТА · БЛОКОВ</span>
              <CustomNumberInput
                ariaLabel="Радиус сканирования сундуков"
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
              {busy === "scan" || scanning ? "СКАНИРУЮ…" : "СКАНИРОВАТЬ И РАСПРЕДЕЛИТЬ"}
            </button>
          </div>
          <small>
            Двойной сундук считается одним хранилищем. За проход проверяется до 64 контейнеров.
            Назначение определяет дальнейшую выгрузку добычи; содержимое сундуков остаётся на месте.
          </small>
          {scan && (
            <>
              <p role="status" aria-live="polite">
                {scanning
                  ? `Проверено ${scan.records.length}/${scan.total}. ${production?.message || ""}`
                  : scan.state === "complete"
                    ? `Сканирование завершено: найдено ${scan.total}, добавлено ${scan.added}.`
                    : scan.state === "cancelled"
                      ? "Сканирование остановлено. Группы сохранены."
                      : "Сканирование не завершилось; проверьте журнал бота."}
              </p>
              {scanning && (
                <button type="button" disabled={!connected} onClick={() => void stopScan()}>
                  ОСТАНОВИТЬ СКАНИРОВАНИЕ
                </button>
              )}
              <div className="mineflayer-storage-scan-results" aria-label="Найденные сундуки">
                {scan.records.map((record) => (
                  <div
                    key={storagePositionKey(record.position)}
                    className={record.error ? "is-error" : ""}
                  >
                    <strong>
                      {record.label}
                      {record.configured ? " · уже настроен" : ""}
                    </strong>
                    <span>
                      {formatBlockCoordinates(record.position)} ·{" "}
                      {record.positions.length === 2
                        ? "Двойной сундук"
                        : record.name === "barrel"
                          ? "Бочка"
                          : "Контейнер"}{" "}
                      · {record.distance} бл.
                    </span>
                    <small>
                      {record.error ||
                        `Свободно слотов: ${record.freeSlots}/${record.totalSlots}${
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
            <strong>Для каждого ресурса — свой склад</strong>
            <p>
              Создайте группу, выберите, что в неё складывать, и добавьте один или несколько
              сундуков.
            </p>
            <div className="mineflayer-storage-examples">
              <span>Древесина → 3 сундука</span>
              <span>Алмазы → 1 сундук</span>
              <span>Камень → 2 сундука</span>
            </div>
            {legacy && (
              <button type="button" disabled={pending} onClick={() => create([legacy])}>
                ДОБАВИТЬ ВЫБРАННЫЙ СУНДУК · {formatBlockCoordinates(legacy)}
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
                      <strong>{group.name || "Новая группа"}</strong>
                      <small>{group.filters.map(label).join(" · ") || "Выберите ресурсы"}</small>
                    </span>
                    <span className={`mineflayer-storage-count${!ready ? " is-empty" : ""}`}>
                      {group.chests.length
                        ? storageChestCount(group.chests.length)
                        : "Нет сундуков"}
                    </span>
                    <span className="mineflayer-storage-chevron" aria-hidden="true">
                      {open ? "−" : "+"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`mineflayer-storage-enable${group.enabled ? " is-enabled" : ""}`}
                    disabled={pending}
                    aria-label={`${group.enabled ? "Выключить" : "Включить"} группу ${group.name}`}
                    aria-pressed={group.enabled}
                    onClick={() => patch(group.id, { enabled: !group.enabled })}
                  >
                    <span />
                    {group.enabled ? "ВКЛ" : "ВЫКЛ"}
                  </button>
                </div>
                {open && (
                  <div className="mineflayer-storage-group-body">
                    <label className="mineflayer-bot-field">
                      <span>НАЗВАНИЕ ГРУППЫ</span>
                      <input
                        value={group.name}
                        maxLength={64}
                        placeholder="Например, древесина на базе"
                        disabled={pending}
                        onChange={(event) => patch(group.id, { name: event.target.value })}
                      />
                    </label>
                    <div
                      className="mineflayer-storage-presets"
                      role="group"
                      aria-label="Группы ресурсов"
                    >
                      {STORAGE_FILTERS.filter((filter) => !filter.material).map((filter) => (
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
                      label="ЧТО СКЛАДЫВАТЬ"
                      value={filterDraft[group.id] ?? group.filters.join(", ")}
                      catalog={options}
                      scope="items"
                      multiple
                      disabled={pending}
                      sections={[
                        { id: "storage", label: "Категории склада" },
                        { id: "resources", label: "Ресурсы по материалу" },
                        { id: "item", label: "Предметы и блоки" },
                      ]}
                      placeholder="Предмет, блок или несколько ресурсов"
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
                            aria-label={`Убрать ресурс ${label(token)}`}
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
                      <strong>СУНДУКИ В ГРУППЕ</strong>
                      <span>Заполняются по порядку</span>
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
                                  ? "Выгружено"
                                  : progress.state === "full"
                                    ? "Заполнен"
                                    : "Недоступен"}
                              </span>
                            )}
                            <div className="mineflayer-storage-row-actions">
                              <button
                                type="button"
                                disabled={pending || chestIndex === 0}
                                aria-label={`Поднять сундук ${chestIndex + 1}`}
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
                                aria-label={`Опустить сундук ${chestIndex + 1}`}
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
                                aria-label={`Удалить сундук ${formatBlockCoordinates(chest)}`}
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
                        Добавьте сундук под прицелом или введите координаты ниже.
                      </p>
                    )}
                    <div className="mineflayer-storage-add-chest">
                      <button
                        type="button"
                        disabled={pending || !connected || group.chests.length >= 32}
                        onClick={() => void capture(group.id)}
                      >
                        {busy === group.id ? "ВЫБИРАЮ…" : "⊕ ПОД ПРИЦЕЛОМ"}
                      </button>
                      <div>
                        <input
                          aria-label={`Координаты сундука для ${group.name}`}
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
                          aria-label="Добавить сундук по координатам"
                          onClick={() => {
                            if (point) addChest(group.id, point);
                          }}
                        >
                          ＋
                        </button>
                      </div>
                    </div>
                    <div className="mineflayer-storage-group-footer">
                      <span>Приоритет группы · {index + 1}</span>
                      <div className="mineflayer-storage-row-actions">
                        <button
                          type="button"
                          disabled={pending || index === 0}
                          aria-label={`Поднять группу ${group.name}`}
                          onClick={() => onChange(moveStorageGroup(groups, group.id, -1))}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={pending || index === groups.length - 1}
                          aria-label={`Опустить группу ${group.name}`}
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
                          УДАЛИТЬ ГРУППУ
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <p className="mineflayer-bot-combat-note">
          Группы сохраняются в лаунчере. Конкретные ресурсы проверяются сверху вниз; «Всё остальное»
          используется для оставшейся добычи. Если сундук заполнен или недоступен, бот пробует
          следующий в той же группе. Инструменты и еду оставляет у себя.
        </p>
        <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
          <button type="button" disabled={pending || !connected} onClick={() => void apply()}>
            {busy === "apply" ? "ПРИМЕНЯЮ…" : "ПРИМЕНИТЬ К БОТУ"}
          </button>
          <button
            type="button"
            disabled={pending || !connected || (!total && !legacy)}
            onClick={onDeposit}
          >
            ВЫГРУЗИТЬ ДОБЫЧУ
          </button>
        </div>
        <p className="mineflayer-bot-combat-note">
          Перед началом и продолжением работы, а также выгрузкой группы применяются автоматически.
          Для выбора под прицелом наведитесь на контейнер в пределах 6 блоков; бот должен видеть
          вас. Подходят сундуки, бочки и шалкеровые ящики.
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
