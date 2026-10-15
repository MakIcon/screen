import { describe, expect, it } from "vitest";
import {
  moveWorkflowStep,
  placeWorkflowStep,
  newWorkflowStep,
  readWorkflowDraft,
  workflowPayload,
  workflowTemplate,
} from "./workflowDraft";

describe("scenario drafts", () => {
  it("preserves user choices across reopening and strips UI identity from worker payloads", () => {
    const steps = [
      newWorkflowStep("mine"),
      { ...newWorkflowStep("craft"), item: "iron_pickaxe", count: 3, mode: "table" },
    ];
    const payload = workflowPayload(steps);
    const restored = readWorkflowDraft(JSON.stringify(payload));
    expect(workflowPayload(restored)).toEqual(payload);
    expect(payload.every((step) => !("id" in step))).toBe(true);
    expect(new Set(restored.map((step) => step.id)).size).toBe(2);
  });

  it("rejects corrupted or oversized drafts and bounds restored values", () => {
    for (const value of [
      "not json",
      "null",
      "{}",
      '[{"kind":"exec"}]',
      JSON.stringify(Array(101).fill({ kind: "craft" })),
    ]) {
      expect(readWorkflowDraft(value)).toEqual([]);
    }
    expect(readWorkflowDraft('[{"kind":"smelt","count":900,"mode":"bad"}]')[0]).toMatchObject({
      count: 64,
      mode: "auto",
    });
  });
  it("restores a full 100-step scenario without truncation", () => {
    const payload = workflowPayload(Array.from({ length: 100 }, () => newWorkflowStep("craft")));
    expect(workflowPayload(readWorkflowDraft(JSON.stringify(payload)))).toEqual(payload);
  });

  it("moves a chosen action without losing its configuration", () => {
    const steps = workflowTemplate("wood");
    const moved = moveWorkflowStep(steps, steps[0].id, 1);
    expect(moved).toEqual([steps[1], steps[0]]);
    expect(moveWorkflowStep(steps, steps[0].id, -1)).toBe(steps);
    expect(steps[0].kind).toBe("forest");
  });

  it("provides fuel and smelts iron before crafting the tool set", () => {
    const steps = workflowTemplate("iron");
    expect(steps).toHaveLength(11);
    expect(steps[0]).toMatchObject({ kind: "mine", item: "coal", count: 2 });
    expect(steps[2].kind).toBe("return");
    expect(steps[4].kind).toBe("return");
    expect(steps[6]).toMatchObject({ kind: "smelt", item: "raw_iron", count: 9 });
    expect(steps.slice(7).map((step) => step.item)).toEqual([
      "iron_pickaxe",
      "iron_axe",
      "iron_sword",
      "iron_shovel",
    ]);
  });

  it("inserts a dragged step across multiple actions without swapping or losing their settings", () => {
    const steps = workflowTemplate("iron");
    const down = placeWorkflowStep(steps, steps[0].id, steps[5].id);
    expect(down).toEqual([steps[1], steps[2], steps[3], steps[4], steps[0], ...steps.slice(5)]);
    const up = placeWorkflowStep(steps, steps[8].id, steps[1].id);
    expect(up).toEqual([steps[0], steps[8], ...steps.slice(1, 8), ...steps.slice(9)]);
    expect(placeWorkflowStep(steps, steps[0].id, null)).toEqual([...steps.slice(1), steps[0]]);
    expect(steps[0]).toMatchObject({ item: "coal", count: 2 });
  });

  it("leaves the order unchanged for the same position or a stale drag target", () => {
    const steps = workflowTemplate("wood");
    expect(placeWorkflowStep(steps, steps[0].id, steps[0].id)).toBe(steps);
    expect(placeWorkflowStep(steps, steps[0].id, steps[1].id)).toBe(steps);
    expect(placeWorkflowStep(steps, steps[1].id, null)).toBe(steps);
    expect(placeWorkflowStep(steps, "missing", null)).toBe(steps);
    expect(placeWorkflowStep(steps, steps[0].id, "missing")).toBe(steps);
  });
});
