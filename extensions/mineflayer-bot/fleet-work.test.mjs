import assert from "node:assert/strict";
import test from "node:test";
import work from "./fleet-work.cjs";

test("healthy workers have no artificial delay; sustained lag shrinks search slices and recovers", () => {
  const budget = work.createWorkBudget({ observe: false });
  for (let i = 0; i < 100; i++) budget.sample(2, 0.95);
  assert.equal(budget.delayMs, 0);
  assert.equal(budget.sliceMs, 5);
  budget.sample(60, 0.95);
  assert.ok(budget.delayMs > 0 && budget.delayMs <= 8);
  assert.ok(budget.sliceMs < 5);
  for (let i = 0; i < 5; i++) budget.sample(1, 0.1);
  assert.equal(budget.delayMs, 0);
  assert.equal(budget.sliceMs, 5);
  budget.dispose();
});
