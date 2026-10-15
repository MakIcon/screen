import type { MineflayerWorkflowRun, MineflayerWorkflowStep } from "../../../types";
import { readWorkflowDraft, workflowPayload } from "./workflowDraft";
import { workflowName, isGenericWorkflowName, isAutomaticWorkflowName } from "./workflowName";

export const WORKFLOW_HISTORY_KEY = "screenlauncher.mineflayer.history.v1";
export const WORKFLOW_NAME_KEY = "screenlauncher.mineflayer.workflow-name.v1";
export type WorkflowHistoryEntry = MineflayerWorkflowRun & { server: string };
const LIMIT = 50;

export function readWorkflowHistory(value: string | null): WorkflowHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, LIMIT).flatMap((entry) => {
      if (
        !entry ||
        typeof entry.id !== "string" ||
        !entry.id ||
        entry.id.length > 128 ||
        !["complete", "stopped", "error"].includes(entry.phase) ||
        !Number.isSafeInteger(entry.startedAt) ||
        !Number.isSafeInteger(entry.finishedAt) ||
        entry.startedAt <= 0 ||
        entry.finishedAt < entry.startedAt ||
        entry.finishedAt > 8.64e15 ||
        !Array.isArray(entry.steps)
      )
        return [];
      const steps = readWorkflowDraft(JSON.stringify(entry.steps));
      if (!steps.length || steps.length !== entry.steps.length) return [];
      const states = ["waiting", "running", "complete", "error", "stopped"];
      if (entry.steps.some((step: { state?: string }) => !states.includes(step?.state || "")))
        return [];
      if (
        entry.phase === "complete" &&
        entry.steps.some((step: { state: string }) => step.state !== "complete")
      )
        return [];
      return [
        {
          id: entry.id,
          name:
            isGenericWorkflowName(entry.name) || isAutomaticWorkflowName(entry.name, steps)
              ? workflowName(steps)
              : entry.name.slice(0, 120),
          server: typeof entry.server === "string" ? entry.server.slice(0, 300) : "",
          startedAt: entry.startedAt,
          finishedAt: entry.finishedAt,
          phase: entry.phase,
          message: typeof entry.message === "string" ? entry.message.slice(0, 1000) : "",
          steps: workflowPayload(steps).map((step, index) => ({
            ...step,
            state: entry.steps[index].state,
          })),
        } as WorkflowHistoryEntry,
      ];
    });
  } catch {
    return [];
  }
}

export function mergeWorkflowHistory(
  current: WorkflowHistoryEntry[],
  incoming: WorkflowHistoryEntry[],
) {
  const entries = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) entries.set(entry.id, entry);
  return [...entries.values()].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, LIMIT);
}

export function sameWorkflow(steps: MineflayerWorkflowStep[], run: MineflayerWorkflowRun) {
  return JSON.stringify(workflowPayload(steps)) === JSON.stringify(workflowPayload(run.steps));
}
