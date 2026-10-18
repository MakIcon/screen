import type { MineflayerWorkflowStep } from "../../../types";

export type WorkflowDraftStep = MineflayerWorkflowStep & { id: string };
export { workflowTemplate } from "./workflowPresets";
export const WORKFLOW_DRAFT_KEY = "screenlauncher.mineflayer.workflow.v1";
export const WORKFLOW_STEP_LIMIT = 100;
export const WORKFLOW_ACTIONS = [
  { kind: "mine", label: "Добыть блоки", note: "Руды, камень и другие блоки" },
  { kind: "forest", label: "Заготовить дерево", note: "Срубить и подобрать брёвна" },
  { kind: "till", label: "Вспахать землю", note: "Подготовить грядки рядом с водой" },
  { kind: "plant", label: "Посадить семена", note: "Засадить пустые грядки" },
  { kind: "harvest", label: "Собрать урожай", note: "Только зрелые растения, с пересадкой" },
  { kind: "farm", label: "Обработать огород", note: "Собрать, вспахать и посадить за один проход" },
  { kind: "craft", label: "Скрафтить", note: "Ингредиенты и инструменты" },
  { kind: "smelt", label: "Переплавить", note: "Металлы, еда и материалы" },
  { kind: "return", label: "Вернуться к старту", note: "К месту запуска сценария" },
  { kind: "collect", label: "Подобрать предметы", note: "Собрать дроп поблизости" },
  { kind: "deposit", label: "Сложить в сундуки", note: "Выгрузить на настроенный склад" },
] as const;

export function newWorkflowStep(kind: MineflayerWorkflowStep["kind"]): WorkflowDraftStep {
  const defaults: Record<MineflayerWorkflowStep["kind"], MineflayerWorkflowStep> = {
    mine: { kind, item: "iron", count: 9, radius: 32 },
    forest: { kind, count: 4, radius: 16 },
    till: { kind, count: 0, radius: 8 },
    plant: { kind, item: "auto", count: 0, radius: 8 },
    harvest: { kind, item: "auto", count: 0, radius: 8, replant: true },
    farm: { kind, item: "auto", count: 0, radius: 8, replant: true },
    craft: { kind, item: "stick", count: 8, mode: "auto" },
    smelt: { kind, item: "raw_iron", count: 9, mode: "auto" },
    collect: { kind, radius: 16 },
    deposit: { kind },
    return: { kind },
  };
  return { ...defaults[kind], id: crypto.randomUUID() };
}

export function workflowPayload(steps: MineflayerWorkflowStep[]): MineflayerWorkflowStep[] {
  return steps.map(({ kind, item, count, radius, mode, replant }) => ({
    kind,
    item,
    count,
    radius,
    mode,
    ...(typeof replant === "boolean" ? { replant } : {}),
  }));
}

export function readWorkflowDraft(value: string | null): WorkflowDraftStep[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed) || parsed.length > WORKFLOW_STEP_LIMIT) return [];
    return parsed.map((step) => {
      if (!step || !WORKFLOW_ACTIONS.some((action) => action.kind === step.kind))
        throw new Error("kind");
      const result = newWorkflowStep(step.kind);
      if (typeof step.item === "string") result.item = step.item.slice(0, 512);
      for (const key of ["count", "radius"] as const) {
        const farming = ["till", "plant", "harvest", "farm"].includes(step.kind);
        if (
          typeof step[key] === "number" &&
          Number.isSafeInteger(step[key]) &&
          (step[key] > 0 || (key === "count" && farming && step[key] === 0))
        )
          result[key] = Math.max(
            key === "radius" ? 4 : farming ? 0 : 1,
            Math.min(
              step[key],
              key === "radius"
                ? 64
                : step.kind === "mine" || farming
                  ? 4096
                  : step.kind === "smelt"
                    ? 64
                    : 256,
            ),
          );
      }
      const modes =
        step.kind === "smelt"
          ? ["auto", "furnace", "blast_furnace", "smoker"]
          : ["auto", "inventory", "table"];
      if (modes.includes(step.mode)) result.mode = step.mode;
      if (typeof step.replant === "boolean") result.replant = step.replant;
      return result;
    });
  } catch {
    return [];
  }
}

export function moveWorkflowStep(steps: WorkflowDraftStep[], id: string, offset: number) {
  const from = steps.findIndex((step) => step.id === id),
    to = from + offset;
  if (from < 0 || to < 0 || to >= steps.length) return steps;
  const next = steps.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function placeWorkflowStep(steps: WorkflowDraftStep[], id: string, beforeId: string | null) {
  const from = steps.findIndex((step) => step.id === id);
  const before = beforeId === null ? steps.length : steps.findIndex((step) => step.id === beforeId);
  if (from < 0 || before < 0 || from === before || from + 1 === before) return steps;
  const next = steps.slice();
  const [step] = next.splice(from, 1);
  next.splice(before > from ? before - 1 : before, 0, step);
  return next;
}
