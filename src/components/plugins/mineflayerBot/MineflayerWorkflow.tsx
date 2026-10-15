import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import type {
  MinecraftCatalog,
  MineflayerBotStatus,
  MineflayerWorkflowStep,
  MineflayerGatheringSettings,
} from "../../../types";
import bundledCatalog from "../../../data/minecraftCatalog.json";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { MinecraftSearchField } from "../../inputs/MinecraftSearchField";
import { toErrorMessage } from "../../../utils/errors";
import { MineflayerActionIcon } from "./MineflayerActionIcon";
import { MineflayerWorkflowHistory } from "./MineflayerWorkflowHistory";
import { useWorkflowStepDrag } from "./useWorkflowStepDrag";
import {
  workflowName,
  readCustomWorkflowName,
  readWorkflowNameVariant,
  findWorkflowNameVariant,
  WORKFLOW_ITEM_LABELS,
} from "./workflowName";
import {
  WORKFLOW_HISTORY_KEY,
  WORKFLOW_NAME_KEY,
  readWorkflowHistory,
  mergeWorkflowHistory,
  sameWorkflow,
  type WorkflowHistoryEntry,
} from "./workflowHistory";
import {
  WORKFLOW_ACTIONS,
  WORKFLOW_DRAFT_KEY,
  WORKFLOW_STEP_LIMIT,
  newWorkflowStep,
  workflowTemplate,
  workflowPayload,
  readWorkflowDraft,
  moveWorkflowStep,
  placeWorkflowStep,
  type WorkflowDraftStep,
} from "./workflowDraft";
import "./MineflayerWorkflow.css";

function WorkflowIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    play: "m8 4 12 8-12 8V4Z",
    up: "m6 15 6-6 6 6",
    down: "m6 9 6 6 6-6",
    copy: "M9 9h12v12H9V9ZM15 9V3H3v12h6",
    remove: "m6 6 12 12M18 6 6 18",
    plus: "M12 5v14M5 12h14",
    check: "m5 12 4 4L19 6",
    grip: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

function loadDraft() {
  try {
    return readWorkflowDraft(localStorage.getItem(WORKFLOW_DRAFT_KEY));
  } catch {
    return [];
  }
}
function loadHistory() {
  try {
    return readWorkflowHistory(localStorage.getItem(WORKFLOW_HISTORY_KEY));
  } catch {
    return [];
  }
}
function loadName() {
  try {
    return readCustomWorkflowName(localStorage.getItem(WORKFLOW_NAME_KEY));
  } catch {
    return null;
  }
}
function loadNameVariant() {
  try {
    return readWorkflowNameVariant(localStorage.getItem(WORKFLOW_NAME_KEY));
  } catch {
    return 0;
  }
}

const ACTION_LABELS: Record<MineflayerWorkflowStep["kind"], string> = {
  mine: "Добыть",
  forest: "Дерево",
  craft: "Крафт",
  smelt: "Переплавка",
  return: "Вернуться",
  collect: "Подобрать",
  deposit: "В сундуки",
};

export function MineflayerWorkflow({
  connected,
  status,
  gatheringSettings,
  refresh,
  onOpenConnection,
  onOpenStorage,
}: {
  connected: boolean;
  status: MineflayerBotStatus | null;
  gatheringSettings: MineflayerGatheringSettings;
  refresh: () => Promise<unknown>;
  onOpenConnection: () => void;
  onOpenStorage: () => void;
}) {
  const [steps, setSteps] = useState<WorkflowDraftStep[]>(loadDraft);
  const [customName, setCustomName] = useState(loadName);
  const [nameVariant, setNameVariant] = useState(loadNameVariant);
  const automaticName = workflowName(steps, nameVariant);
  const name = customName?.trim() || automaticName;
  const [history, setHistory] = useState<WorkflowHistoryEntry[]>(loadHistory);
  const historyRef = useRef(history);
  const planRef = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState(bundledCatalog as MinecraftCatalog);
  const searchCatalog = useMemo(
    () => ({
      ...catalog,
      entries: catalog.entries.map((entry) =>
        WORKFLOW_ITEM_LABELS[entry.name]
          ? { ...entry, displayName: WORKFLOW_ITEM_LABELS[entry.name] }
          : entry,
      ),
    }),
    [catalog],
  );
  const workflow = connected ? status?.inventory?.workflow : null;
  const running = Boolean(
    workflow && ["starting", "running", "pausing", "paused", "stopping"].includes(workflow.phase),
  );
  const locked = running || sending;
  const reorder = useCallback((id: string, beforeId: string | null) => {
    setSteps((current) => placeWorkflowStep(current, id, beforeId));
  }, []);
  const { drag, onPointerDown, onClickCapture } = useWorkflowStepDrag(steps, locked, reorder);
  const draggedStep = drag ? steps.find((step) => step.id === drag.id) : null;
  const shownSteps = running
    ? workflow!.steps.map((step, index) => ({ ...step, id: `run-${index}` }))
    : steps;
  const otherWork = Boolean(
    status?.gathering?.active ||
    status?.gathering?.queued ||
    status?.inventory?.production?.busy ||
    status?.inventory?.production?.station,
  );
  const completed = workflow?.steps.filter((step) => step.state === "complete").length || 0;
  const canAdd = !locked && steps.length < WORKFLOW_STEP_LIMIT;
  const incomingHistoryJson = JSON.stringify(
    (status?.inventory?.workflow?.history || []).map((entry) => ({
      ...entry,
      server: status?.server || "",
    })),
  );
  const incomingHistory = useMemo(
    () => readWorkflowHistory(incomingHistoryJson),
    [incomingHistoryJson],
  );

  useEffect(() => {
    if (!incomingHistory?.length) return;
    const incoming = incomingHistory;
    const latest = incoming[0];
    const newComplete =
      latest?.phase === "complete" &&
      !historyRef.current.some((previous) => previous.id === latest.id)
        ? latest
        : undefined;
    const merged = mergeWorkflowHistory(historyRef.current, incoming);
    if (JSON.stringify(merged) !== JSON.stringify(historyRef.current)) {
      historyRef.current = merged;
      setHistory(merged);
    }
    if (newComplete && sameWorkflow(steps, newComplete)) {
      setSteps([]);
      setEditing(null);
      setCustomName(null);
      setNameVariant(0);
    }
  }, [incomingHistory, steps]);
  useEffect(() => {
    try {
      localStorage.setItem(WORKFLOW_HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* History remains available for this session. */
    }
  }, [history]);
  useEffect(() => {
    try {
      localStorage.setItem(
        WORKFLOW_NAME_KEY,
        JSON.stringify({ manual: customName, variant: nameVariant }),
      );
    } catch {
      /* Name remains editable for this session. */
    }
  }, [customName, nameVariant]);

  useEffect(() => {
    try {
      localStorage.setItem(WORKFLOW_DRAFT_KEY, JSON.stringify(workflowPayload(steps)));
    } catch {
      /* Draft remains editable when storage is unavailable. */
    }
  }, [steps]);
  useEffect(() => {
    let cancelled = false;
    setCatalog(bundledCatalog as MinecraftCatalog);
    if (connected)
      void invoke<MinecraftCatalog | null>("get_minecraft_catalog")
        .then((value) => {
          if (value && !cancelled) setCatalog(value);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connected, status?.pid]);

  function append(added: WorkflowDraftStep[]) {
    if (locked || steps.length + added.length > WORKFLOW_STEP_LIMIT) return;
    setSteps((current) => [...current, ...added]);
    setEditing(added.length === 1 ? added[0].id : null);
    setError("");
  }
  function patch(id: string, value: Partial<MineflayerWorkflowStep>) {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...value } : step)));
    setError("");
  }
  async function control(action: "start" | "pause" | "resume" | "stop") {
    if (!connected || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      if (action === "start") {
        await invoke("configure_mineflayer_bot_storage", {
          groups: gatheringSettings.storageGroups,
        });
        await invoke("send_mineflayer_bot_chat", {
          message: `work defense ${gatheringSettings.defendMobs ? "on" : "off"} ${gatheringSettings.defendPlayers ? "on" : "off"} ${gatheringSettings.defendArrows ? "on" : "off"}`,
          command: true,
        });
        await invoke("send_mineflayer_bot_chat", {
          message: `work tunnels ${gatheringSettings.tunnelWidth} ${gatheringSettings.tunnelHeight} ${gatheringSettings.stairWidth} ${gatheringSettings.stairHeight} ${gatheringSettings.placeTorches ? "on" : "off"} ${gatheringSettings.torchInterval}`,
          command: true,
        });
      }
      await invoke("control_mineflayer_bot_workflow", {
        action,
        steps: action === "start" ? workflowPayload(steps) : null,
        name: action === "start" ? name : null,
      });
      setEditing(null);
      await refresh();
    } catch (failure) {
      setError(toErrorMessage(failure));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  function itemName(value?: string) {
    return (
      value
        ?.split(",")
        .map(
          (name) =>
            searchCatalog.entries.find((entry) => entry.name === name.trim())?.displayName ||
            name.trim(),
        )
        .join(", ") || "Выберите предмет"
    );
  }
  function detail(step: MineflayerWorkflowStep) {
    if (step.kind === "mine")
      return `${itemName(step.item)} · блоков: ${step.count} · радиус ${step.radius}`;
    if (step.kind === "forest") return `Брёвна: ${step.count} · радиус ${step.radius}`;
    if (step.kind === "collect") return `В радиусе ${step.radius} блоков`;
    if (step.kind === "return") return "К месту запуска сценария";
    if (step.kind === "deposit") return "В сундуки настроенного склада";
    return `${itemName(step.item)} × ${step.count} · ${step.mode === "table" ? "верстак" : step.mode === "inventory" ? "инвентарь" : step.mode === "blast_furnace" ? "плавильная печь" : step.mode === "smoker" ? "коптильня" : "автоматически"}`;
  }
  const number = (step: WorkflowDraftStep, key: "count" | "radius", label: string, max: number) => (
    <label className="mineflayer-bot-field">
      <span>{label}</span>
      <CustomNumberInput
        ariaLabel={`${label}, шаг ${steps.findIndex((entry) => entry.id === step.id) + 1}`}
        value={step[key] || 1}
        min={key === "radius" ? 4 : 1}
        max={max}
        step={1}
        background="transparent"
        onChange={(value) => patch(step.id, { [key]: value })}
      />
    </label>
  );

  return (
    <div className="mf-workflow">
      <section className="mf-workflow-actions" aria-label="Добавить действие">
        <div className="mf-actions-heading">
          <h3>ДОБАВИТЬ ДЕЙСТВИЕ</h3>
          <button
            type="button"
            className="mf-button mf-storage-button"
            onClick={onOpenStorage}
            data-tooltip="Сундуки и сортировка добычи"
          >
            <MineflayerActionIcon kind="deposit" />
            Настроить склад
          </button>
        </div>
        <div className="mf-action-buttons">
          {WORKFLOW_ACTIONS.map((action) => (
            <button
              key={action.kind}
              type="button"
              disabled={!canAdd}
              aria-label={`Добавить: ${action.label}`}
              data-tooltip={action.note}
              onClick={() => append([newWorkflowStep(action.kind)])}
            >
              <MineflayerActionIcon kind={action.kind} />
              <span>{ACTION_LABELS[action.kind]}</span>
            </button>
          ))}
        </div>
        <div className="mf-workflow-templates" aria-label="Пресеты сценария">
          <span>Пресеты:</span>
          <button
            type="button"
            disabled={locked || steps.length + 11 > WORKFLOW_STEP_LIMIT}
            data-tooltip="Добавить 11 шагов: добыча, возврат на базу, крафт и переплавка"
            onClick={() => append(workflowTemplate("iron"))}
          >
            Железные инструменты
          </button>
          <button
            type="button"
            disabled={locked || steps.length + 2 > WORKFLOW_STEP_LIMIT}
            data-tooltip="Добавить 2 шага: заготовить дерево и скрафтить 16 палок"
            onClick={() => append(workflowTemplate("wood"))}
          >
            Дерево → палки
          </button>
        </div>
      </section>
      <section ref={planRef} className="mf-workflow-plan" aria-label="Последовательность действий">
        <div className="mf-workflow-name">
          <label htmlFor="mf-workflow-name">НАЗВАНИЕ СЦЕНАРИЯ</label>
          <input
            id="mf-workflow-name"
            aria-label="Название сценария"
            value={running ? workflow?.name || name : (customName ?? automaticName)}
            placeholder={automaticName}
            maxLength={120}
            disabled={locked}
            onChange={(event) => setCustomName(event.target.value)}
            onBlur={() => {
              if (!customName?.trim()) setCustomName(null);
            }}
          />
          <button
            type="button"
            className="mf-name-auto"
            aria-pressed={customName === null}
            disabled={locked || !steps.length}
            data-tooltip="Подобрать автоматическое название"
            onClick={() => {
              setCustomName(null);
              setNameVariant((value) => (customName === null ? value + 1 : 0));
            }}
          >
            Авто
          </button>
        </div>
        <header className="mf-plan-header">
          <h4>
            ПОРЯДОК ДЕЙСТВИЙ{" "}
            <span>
              {shownSteps.length} / {WORKFLOW_STEP_LIMIT}
            </span>
          </h4>
          <button
            type="button"
            className="mf-text-button"
            disabled={locked || !steps.length}
            onClick={() => {
              setSteps([]);
              setCustomName(null);
              setNameVariant(0);
              setEditing(null);
              setError("");
            }}
          >
            Очистить
          </button>
          <div className="mf-plan-run-actions">
            {running ? (
              <>
                <button
                  type="button"
                  className="mf-button"
                  disabled={sending || workflow?.phase === "stopping"}
                  onClick={() =>
                    void control(
                      workflow?.phase === "paused" || workflow?.phase === "pausing"
                        ? "resume"
                        : "pause",
                    )
                  }
                >
                  {workflow?.phase === "paused" || workflow?.phase === "pausing"
                    ? "Продолжить"
                    : "Пауза после шага"}
                </button>
                <button
                  type="button"
                  className="mf-button"
                  disabled={sending || workflow?.phase === "stopping"}
                  onClick={() => void control("stop")}
                >
                  Остановить
                </button>
              </>
            ) : (
              <button
                type="button"
                className="mf-button mf-button--primary"
                disabled={
                  !connected ||
                  !steps.length ||
                  sending ||
                  otherWork ||
                  steps.some(
                    (step) => ["mine", "craft", "smelt"].includes(step.kind) && !step.item?.trim(),
                  )
                }
                onClick={() => void control("start")}
              >
                <WorkflowIcon kind="play" />
                {sending ? "Запускаю…" : "Запустить сценарий"}
              </button>
            )}
          </div>
          {workflow &&
            workflow.phase !== "idle" &&
            (workflow.phase !== "complete" ||
              !history.some((entry) => entry.id === workflow.id)) && (
              <div
                className={`mf-workflow-progress${workflow.phase === "error" ? " is-error" : ""}`}
                role={workflow.phase === "error" ? "alert" : "status"}
              >
                <div>
                  <strong>
                    {workflow.phase === "complete"
                      ? "Сценарий выполнен"
                      : workflow.phase === "paused"
                        ? "На паузе"
                        : workflow.phase === "pausing"
                          ? "Завершаю шаг перед паузой"
                          : workflow.phase === "stopped"
                            ? "Сценарий остановлен"
                            : workflow.phase === "error"
                              ? "Нужна ваша помощь"
                              : "Выполняю сценарий"}
                  </strong>
                  <span>
                    {completed} / {workflow.steps.length}
                  </span>
                </div>
                <progress
                  max={workflow.steps.length || 1}
                  value={completed}
                  aria-label="Завершённые шаги"
                />
                <p>
                  {workflow.message}
                  {running && status?.gathering?.active
                    ? ` · ${status.gathering.message}`
                    : running && status?.inventory?.production?.busy
                      ? ` · ${status.inventory.production.message}`
                      : ""}
                </p>
              </div>
            )}
        </header>
        {!shownSteps.length ? (
          <div className="mf-plan-empty">
            <p>В сценарии пока нет действий.</p>
            <span>Добавьте действие сверху. Его параметры откроются здесь.</span>
          </div>
        ) : (
          <ol
            className={`mf-plan-steps${!locked && steps.length > 1 ? " is-reorderable" : ""}${drag?.beforeId === null ? " is-drop-end" : ""}`}
            onPointerDown={onPointerDown}
            onClickCapture={onClickCapture}
            onDragStart={(event) => event.preventDefault()}
          >
            {shownSteps.map((step, index) => {
              const state = running ? workflow?.steps[index].state : undefined;
              const expanded = !running && editing === step.id;
              return (
                <li
                  key={step.id}
                  data-workflow-step={step.id}
                  className={`mf-plan-step${expanded ? " is-editing" : ""}${state ? ` is-${state}` : ""}${drag?.id === step.id ? " is-dragging" : ""}${drag?.beforeId === step.id ? " is-drop-before" : ""}`}
                >
                  <div className="mf-step-row">
                    {!locked && steps.length > 1 && (
                      <span
                        className="mf-step-grip"
                        data-tooltip="Зажмите и перетащите шаг"
                        aria-hidden="true"
                      >
                        <WorkflowIcon kind="grip" />
                      </span>
                    )}
                    <span className="mf-step-index">
                      {state === "complete" ? <WorkflowIcon kind="check" /> : index + 1}
                    </span>
                    <button
                      type="button"
                      className="mf-step-summary"
                      disabled={locked}
                      aria-expanded={expanded}
                      aria-controls={`mf-step-${step.id}`}
                      onClick={() => setEditing(expanded ? null : step.id)}
                    >
                      <MineflayerActionIcon kind={step.kind} />
                      <span>
                        <strong>
                          {WORKFLOW_ACTIONS.find((action) => action.kind === step.kind)?.label}
                        </strong>
                        <small>{detail(step)}</small>
                      </span>
                      {!locked && (
                        <span className="mf-step-edit">
                          <WorkflowIcon kind={expanded ? "up" : "down"} />
                        </span>
                      )}
                    </button>
                    {!locked && (
                      <div className="mf-step-tools">
                        <button
                          type="button"
                          aria-label={`Поднять шаг ${index + 1}`}
                          data-tooltip="Выше"
                          disabled={index === 0}
                          onClick={() =>
                            setSteps((current) => moveWorkflowStep(current, step.id, -1))
                          }
                        >
                          <WorkflowIcon kind="up" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Опустить шаг ${index + 1}`}
                          data-tooltip="Ниже"
                          disabled={index === steps.length - 1}
                          onClick={() =>
                            setSteps((current) => moveWorkflowStep(current, step.id, 1))
                          }
                        >
                          <WorkflowIcon kind="down" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Дублировать шаг ${index + 1}`}
                          data-tooltip="Дублировать"
                          disabled={!canAdd}
                          onClick={() => {
                            const copy = { ...step, id: crypto.randomUUID() };
                            setSteps((current) => [
                              ...current.slice(0, index + 1),
                              copy,
                              ...current.slice(index + 1),
                            ]);
                            setEditing(copy.id);
                          }}
                        >
                          <WorkflowIcon kind="copy" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Удалить шаг ${index + 1}`}
                          data-tooltip="Удалить"
                          onClick={() =>
                            setSteps((current) => current.filter((entry) => entry.id !== step.id))
                          }
                        >
                          <WorkflowIcon kind="remove" />
                        </button>
                      </div>
                    )}
                  </div>
                  {expanded && (
                    <div className="mf-step-editor" id={`mf-step-${step.id}`}>
                      <div className="mineflayer-bot-grid">
                        {["mine", "craft", "smelt"].includes(step.kind) && (
                          <MinecraftSearchField
                            label={
                              step.kind === "mine"
                                ? "ЧТО ДОБЫТЬ"
                                : step.kind === "smelt"
                                  ? "СЫРЬЁ"
                                  : "РЕЗУЛЬТАТ КРАФТА"
                            }
                            value={step.item || ""}
                            onChange={(item) => patch(step.id, { item })}
                            catalog={searchCatalog}
                            scope={step.kind === "mine" ? "blocks" : "items"}
                            multiple={step.kind === "mine"}
                          />
                        )}
                        {step.kind !== "collect" &&
                          step.kind !== "deposit" &&
                          step.kind !== "return" &&
                          number(
                            step,
                            "count",
                            step.kind === "mine"
                              ? "КОЛИЧЕСТВО БЛОКОВ"
                              : step.kind === "forest"
                                ? "КОЛИЧЕСТВО БРЁВЕН"
                                : "КОЛИЧЕСТВО ПРЕДМЕТОВ",
                            step.kind === "mine" ? 4096 : step.kind === "smelt" ? 64 : 256,
                          )}
                        {["mine", "forest", "collect"].includes(step.kind) &&
                          number(step, "radius", "РАДИУС · БЛОКОВ", 64)}
                      </div>
                      {["craft", "smelt"].includes(step.kind) && (
                        <div className="mf-step-mode">
                          <span className="mf-eyebrow">
                            {step.kind === "craft" ? "МЕСТО КРАФТА" : "ТИП ПЕЧИ"}
                          </span>
                          <div
                            className="mineflayer-bot-mode"
                            role="group"
                            aria-label={step.kind === "craft" ? "Место крафта" : "Тип печи"}
                          >
                            {(step.kind === "craft"
                              ? [
                                  ["auto", "Авто"],
                                  ["inventory", "Инвентарь"],
                                  ["table", "Верстак"],
                                ]
                              : [
                                  ["auto", "Авто"],
                                  ["furnace", "Печь"],
                                  ["blast_furnace", "Плавильная"],
                                  ["smoker", "Коптильня"],
                                ]
                            ).map(([mode, label]) => (
                              <button
                                type="button"
                                key={mode}
                                className={step.mode === mode ? "active" : ""}
                                aria-pressed={step.mode === mode}
                                onClick={() => patch(step.id, { mode })}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <p>
                        {step.kind === "craft"
                          ? "Промежуточные ингредиенты, включая доски, бот скрафтит сам. В режиме «Авто» найдёт верстак в 32 блоках или сделает и поставит его."
                          : step.kind === "smelt"
                            ? "Печь должна быть рядом, а сырьё и топливо — в инвентаре. Бот сам подберёт топливо и заберёт результат."
                            : step.kind === "return"
                              ? "Бот вернётся к месту запуска сценария. Запускайте сценарий рядом с печью и местом для крафта."
                              : step.kind === "deposit"
                                ? "Используются группы сундуков из настроек склада."
                                : step.kind === "mine"
                                  ? "Количество считается в блоках. Для железа нужна каменная кирка или лучше."
                                  : "Действие начнётся после завершения предыдущего шага."}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <footer className="mf-plan-footer">
          <p>
            {!connected ? (
              <>
                Подключите бота, чтобы запустить сценарий.{" "}
                <button type="button" className="mf-text-button" onClick={onOpenConnection}>
                  Подключение ↗
                </button>
              </>
            ) : running ? (
              "Пауза сработает после текущего шага. Остановка прервёт работу сразу."
            ) : otherWork ? (
              "Бот занят. Завершите текущую работу перед запуском."
            ) : (
              "При ошибке выполнение остановится на проблемном шаге."
            )}
          </p>
        </footer>
      </section>
      {drag &&
        draggedStep &&
        createPortal(
          <div
            className="mf-workflow-drag-preview"
            style={{ left: drag.left, top: drag.top, width: drag.width }}
            aria-hidden="true"
          >
            <WorkflowIcon kind="grip" />
            <MineflayerActionIcon kind={draggedStep.kind} />
            <span>
              <strong>
                {WORKFLOW_ACTIONS.find((action) => action.kind === draggedStep.kind)?.label}
              </strong>
              <small>{detail(draggedStep)}</small>
            </span>
          </div>,
          document.body,
        )}
      <MineflayerWorkflowHistory
        entries={history}
        locked={locked}
        detail={detail}
        onRepeat={(entry) => {
          if (locked) return;
          setSteps(readWorkflowDraft(JSON.stringify(workflowPayload(entry.steps))));
          const variant = findWorkflowNameVariant(entry.name, entry.steps);
          setCustomName(variant === null ? entry.name : null);
          setNameVariant(variant || 0);
          setEditing(null);
          setError("");
          planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      {error && (
        <p className="mineflayer-bot-error" role="alert">
          {error}
        </p>
      )}
      <details className="mf-workflow-footnote">
        <summary>Что нужно для пресета «Железные инструменты»</summary>
        <p>
          Для заготовки железных инструментов нужны каменная кирка, доступные руды, деревья и пустая
          печь рядом с местом запуска. После добычи бот вернётся к старту. Доски и верстак изготовит
          из дерева.
        </p>
      </details>
    </div>
  );
}
