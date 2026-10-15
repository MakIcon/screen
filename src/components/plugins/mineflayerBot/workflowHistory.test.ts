import { describe, expect, it } from "vitest";
import { workflowName } from "./workflowName";
import {
  mergeWorkflowHistory,
  readWorkflowHistory,
  sameWorkflow,
  type WorkflowHistoryEntry,
} from "./workflowHistory";

const run: WorkflowHistoryEntry = {
  id: "run-1",
  name: "Дерево → копьё",
  server: "localhost:25565",
  phase: "complete",
  startedAt: 1000,
  finishedAt: 2000,
  message: "Готово",
  steps: [
    { kind: "forest", count: 4, radius: 16, state: "complete" },
    { kind: "craft", item: "wooden_spear", count: 1, mode: "auto", state: "complete" },
  ],
};
describe("scenario history", () => {
  it("persists full runs and distinguishes errors, stops and success", () => {
    const entries = [
      run,
      { ...run, id: "stopped", phase: "stopped", steps: [{ ...run.steps[0], state: "stopped" }] },
      { ...run, id: "error", phase: "error", steps: [{ ...run.steps[0], state: "error" }] },
    ];
    expect(readWorkflowHistory(JSON.stringify(entries))).toEqual(entries);
    expect(readWorkflowHistory("broken")).toEqual([]);
    expect(
      readWorkflowHistory(
        JSON.stringify([
          { ...run, finishedAt: 0 },
          { ...run, steps: [{ kind: "exec" }] },
          { ...run, steps: [{ ...run.steps[0], state: "error" }] },
        ]),
      ),
    ).toEqual([]);
  });
  it("deduplicates telemetry snapshots, keeps newest first and bounds storage", () => {
    expect(mergeWorkflowHistory([run], [run])).toHaveLength(1);
    const entries = Array.from({ length: 55 }, (_, i) => ({
      ...run,
      id: String(i),
      finishedAt: 2000 + i,
    }));
    const merged = mergeWorkflowHistory([run], entries);
    expect(merged).toHaveLength(50);
    expect(merged[0].id).toBe("54");
  });
  it("moves only the matching finished draft into history", () => {
    expect(sameWorkflow(run.steps, run)).toBe(true);
    expect(sameWorkflow([{ kind: "craft", item: "stone_spear", count: 1 }], run)).toBe(false);
  });
  it("gives old unnamed runs a useful name from their saved steps", () => {
    const restored = readWorkflowHistory(
      JSON.stringify([
        { ...run, name: "Мой сценарий" },
        { ...run, id: "empty-name", name: "" },
      ]),
    );
    expect(restored.map((entry) => entry.name)).toEqual([
      "Дерево × 4 → Деревянное копьё",
      "Дерево × 4 → Деревянное копьё",
    ]);
    expect(readWorkflowHistory(JSON.stringify([run]))[0].name).toBe(run.name);
  });
  it("shortens old automatic route titles while preserving custom history names", () => {
    const longRun = {
      ...run,
      name: "Добыча: Железо × 9 → Переплавка: Рудное железо × 9",
      steps: [
        { kind: "mine", item: "iron", count: 9, state: "complete" },
        { kind: "smelt", item: "raw_iron", count: 9, state: "complete" },
      ],
    };
    expect(readWorkflowHistory(JSON.stringify([longRun]))[0].name).toBe(
      workflowName(longRun.steps as WorkflowHistoryEntry["steps"]),
    );
    expect(
      readWorkflowHistory(JSON.stringify([{ ...longRun, name: "Для базы на севере" }]))[0].name,
    ).toBe("Для базы на севере");
  });
  it("preserves chosen name variants and all 100 saved steps", () => {
    const steps = Array.from({ length: 100 }, () => ({
      kind: "craft" as const,
      item: "iron_pickaxe",
      count: 1,
      mode: "auto",
      state: "complete" as const,
    }));
    const name = workflowName(steps, 5);
    const restored = readWorkflowHistory(JSON.stringify([{ ...run, name, steps }]));
    expect(restored[0].steps).toHaveLength(100);
    expect(restored[0].name).toBe(name);
  });
});
