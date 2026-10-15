import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createWorkflowController } from "./workflow.cjs";
const require = createRequire(import.meta.url);
const registry = require("minecraft-data")("1.21.4");
const delay = () => new Promise((resolve) => setTimeout(resolve, 5));
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await delay();
  }
  assert.fail("Timed out waiting for workflow state");
}
function fixture({ finishGathering = true, productionOutcome = "complete" } = {}) {
  const events = [],
    history = [];
  let active = false,
    id = 0,
    prepared = 0;
  const bot = { registry };
  const gathering = {
    phase: "scan",
    automaticPause: false,
    reason: "",
    get busy() {
      return active;
    },
    get snapshot() {
      return {
        history,
        phase: this.phase,
        automaticPause: this.automaticPause,
        reason: this.reason,
      };
    },
    validate(step) {
      if (step.kind === "mine" && !["iron", "coal"].includes(step.blocks))
        throw new Error("Unknown block");
    },
    enqueue(step) {
      active = true;
      const next = ++id;
      events.push(`gather:${step.kind}`);
      if (finishGathering) queueMicrotask(() => this.finish(next));
      return next;
    },
    finish(next = id, outcome = "готово") {
      active = false;
      history.push({ id: next, outcome, reason: outcome === "готово" ? "" : "Не найдена руда" });
    },
    async stop() {
      active = false;
      events.push("stop:gathering");
    },
  };
  const production = {
    busy: false,
    task: Promise.resolve(),
    prepareCraft(item) {
      events.push(`prepare:${item}`);
      return { item };
    },
    craft(plan) {
      events.push(`craft:${plan.item}`);
    },
    prepareSmelt(item) {
      events.push(`prepare:${item}`);
      return { item };
    },
    smelt(plan) {
      events.push(`smelt:${plan.item}`);
    },
    snapshot() {
      return {
        phase: productionOutcome === "error" ? "error" : "idle",
        outcome: productionOutcome,
        message: "Нет топлива",
      };
    },
    async stop() {
      events.push("stop:production");
    },
  };
  const controller = createWorkflowController({
    bot,
    gathering,
    production,
    pollMs: 2,
    prepare: async () => {
      prepared++;
      return true;
    },
  });
  return {
    controller,
    gathering,
    production,
    events,
    get prepared() {
      return prepared;
    },
  };
}
const ore = { kind: "mine", item: "iron", count: 9, radius: 32 };
const sticks = { kind: "craft", item: "stick", count: 8, mode: "auto" };

test("waits for gathering before resolving future recipes and runs mixed actions in order", async () => {
  const f = fixture({ finishGathering: false });
  await f.controller.start([
    ore,
    { kind: "forest", count: 4, radius: 16 },
    sticks,
    { kind: "smelt", item: "raw_iron", count: 9 },
    { kind: "craft", item: "iron_pickaxe", count: 1 },
  ]);
  assert.deepEqual(f.events, ["gather:mine"]);
  f.gathering.finish();
  await until(() => f.events.length === 2);
  assert.deepEqual(f.events, ["gather:mine", "gather:forest"]);
  f.gathering.finish();
  await f.controller.task;
  assert.deepEqual(f.events, [
    "gather:mine",
    "gather:forest",
    "prepare:stick",
    "craft:stick",
    "prepare:raw_iron",
    "smelt:raw_iron",
    "prepare:iron_pickaxe",
    "craft:iron_pickaxe",
  ]);
  assert.equal(f.controller.snapshot().phase, "complete");
  assert.ok(f.controller.snapshot().steps.every((step) => step.state === "complete"));
});

test("validates the entire plan before stopping movement or gathering resources", async () => {
  for (const invalid of [
    [],
    Array(101).fill(ore),
    [ore, { ...sticks, item: "nonexistent_item" }],
    [ore, { ...sticks, count: -1 }],
    [{ ...ore, radius: 500 }],
    [{ kind: "arbitrary_command" }],
    [{ kind: "smelt", item: "raw_iron", count: 1, mode: "smoker" }],
  ]) {
    const f = fixture();
    await assert.rejects(f.controller.start(invalid));
    assert.equal(f.prepared, 0);
    assert.deepEqual(f.events, []);
  }
});

test("runs and archives all 100 steps, and rejects the 101st before replacing work", async () => {
  const f = fixture();
  await f.controller.start(Array(100).fill(sticks));
  await f.controller.task;
  assert.equal(f.controller.snapshot().phase, "complete");
  assert.equal(f.controller.snapshot().history[0].steps.length, 100);
  assert.equal(f.events.filter((event) => event === "craft:stick").length, 100);
  await assert.rejects(f.controller.start(Array(101).fill(sticks)), /100 шагов/);
  assert.equal(f.controller.snapshot().history.length, 1);
});

test("partial gathering stops the scenario with the failed step and reason", async () => {
  const f = fixture({ finishGathering: false });
  await f.controller.start([ore, sticks]);
  f.gathering.finish(1, "частично");
  await f.controller.task;
  assert.deepEqual(f.events, ["gather:mine"]);
  assert.equal(f.controller.snapshot().phase, "error");
  assert.match(f.controller.snapshot().message, /Шаг 1: Не найдена руда/);
  assert.equal(f.controller.snapshot().steps[1].state, "waiting");
});

test("a blocked gathering step stops with its reason while automatic recovery keeps waiting", async () => {
  const f = fixture({ finishGathering: false });
  await f.controller.start([ore, sticks]);
  f.gathering.phase = "paused";
  f.gathering.automaticPause = true;
  await delay();
  assert.equal(f.controller.snapshot().phase, "running");
  f.gathering.automaticPause = false;
  f.gathering.reason = "Нужна каменная кирка";
  await f.controller.task;
  assert.equal(f.controller.snapshot().phase, "error");
  assert.match(f.controller.snapshot().message, /Нужна каменная кирка/);
  assert.ok(f.events.includes("stop:gathering"));
  assert.ok(!f.events.includes("prepare:stick"));
});

test("production errors and interruptions keep distinct outcomes and never advance", async () => {
  for (const productionOutcome of ["error", "stopped"]) {
    const f = fixture({ productionOutcome });
    await f.controller.start([sticks, ore]);
    await f.controller.task;
    assert.equal(
      f.controller.snapshot().phase,
      productionOutcome === "error" ? "error" : "stopped",
    );
    assert.deepEqual(f.events, ["prepare:stick", "craft:stick"]);
  }
});

test("archives each run once with its name, timestamps and immutable step outcomes", async () => {
  const f = fixture();
  await f.controller.start([ore, sticks], "Дерево и инструменты");
  await f.controller.task;
  const first = f.controller.snapshot();
  assert.equal(first.history.length, 1);
  assert.equal(first.history[0].id, first.id);
  assert.equal(first.history[0].name, "Дерево и инструменты");
  assert.ok(first.finishedAt >= first.startedAt);
  assert.ok(first.history[0].steps.every((step) => step.state === "complete"));
  first.history[0].steps[0].state = "error";
  await f.controller.stop();
  assert.equal(f.controller.snapshot().history[0].steps[0].state, "complete");
  await f.controller.start([sticks], "Второй запуск");
  await f.controller.task;
  assert.equal(f.controller.snapshot().history.length, 2);
  assert.notEqual(f.controller.snapshot().id, first.id);
  assert.equal(f.controller.snapshot().history[1].name, "Дерево и инструменты");
});

test("cancelling gathering outside the scenario records a stopped run, not an error", async () => {
  const f = fixture({ finishGathering: false });
  await f.controller.start([ore, sticks]);
  f.gathering.finish(1, "отменено");
  await f.controller.task;
  assert.equal(f.controller.snapshot().phase, "stopped");
  assert.equal(f.controller.snapshot().history[0].phase, "stopped");
  assert.equal(f.controller.snapshot().steps[1].state, "waiting");
  assert.ok(!f.events.includes("craft:stick"));
});

test("a finished gathering task wins over a late paused status", async () => {
  const f = fixture({ finishGathering: false });
  await f.controller.start([ore, sticks]);
  f.gathering.finish();
  f.gathering.phase = "paused";
  await f.controller.task;
  assert.equal(f.controller.snapshot().phase, "complete");
  assert.ok(!f.events.includes("stop:gathering"));
});

test("history stays bounded while preserving the newest runs", async () => {
  const f = fixture();
  for (let i = 0; i < 34; i++) {
    await f.controller.start([sticks], `Запуск ${i}`);
    await f.controller.task;
  }
  assert.equal(f.controller.snapshot().history.length, 30);
  assert.equal(f.controller.snapshot().history[0].name, "Запуск 33");
});

test("return steps use the launch position and can be stopped while navigation is pending", async () => {
  const f = fixture();
  const bot = {
    registry,
    entity: { position: { x: 10, y: 64, z: 20 } },
    pathfinder: {
      async goto(goal) {
        assert.equal(goal.x, 10);
        assert.equal(goal.y, 64);
        assert.equal(goal.z, 20);
      },
      async stop() {},
    },
  };
  const controller = createWorkflowController({
    bot,
    gathering: f.gathering,
    production: f.production,
    prepare: async () => true,
    pollMs: 2,
  });
  await controller.start([{ kind: "return" }, sticks]);
  bot.entity.position.x = 200;
  await controller.task;
  assert.equal(controller.snapshot().phase, "complete");
  let stopped = false;
  bot.pathfinder.goto = () => new Promise(() => {});
  bot.pathfinder.stop = async () => {
    stopped = true;
  };
  await controller.start([{ kind: "return" }, ore]);
  await controller.stop();
  assert.ok(stopped);
  assert.equal(controller.snapshot().phase, "stopped");
  assert.ok(!f.events.includes("gather:mine"));
});

test("pause waits for the current step; resume continues without repeating it", async () => {
  const f = fixture({ finishGathering: false });
  await f.controller.start([ore, sticks]);
  f.controller.pause();
  assert.equal(f.controller.snapshot().phase, "pausing");
  f.gathering.finish();
  await until(() => f.controller.snapshot().phase === "paused");
  assert.deepEqual(f.events, ["gather:mine"]);
  f.controller.resume();
  await f.controller.task;
  assert.equal(f.controller.snapshot().phase, "complete");
  assert.equal(f.events.filter((event) => event === "craft:stick").length, 1);
});

test("stop cancels active work and a paused scenario without starting later steps", async () => {
  for (const pause of [false, true]) {
    const f = fixture({ finishGathering: false });
    await f.controller.start([ore, sticks]);
    if (pause) {
      f.controller.pause();
      f.gathering.finish();
      await until(() => f.controller.snapshot().phase === "paused");
    }
    await f.controller.stop();
    assert.equal(f.controller.snapshot().phase, "stopped");
    assert.ok(!f.events.includes("prepare:stick"));
    assert.ok(f.events.includes("stop:gathering"));
    assert.ok(f.events.includes("stop:production"));
  }
});

test("rejects overlapping runs and busy manual work without replacing either", async () => {
  const f = fixture({ finishGathering: false });
  await f.controller.start([ore]);
  await assert.rejects(f.controller.start([sticks]), /уже запущен/);
  await f.controller.stop();
  f.production.busy = true;
  await assert.rejects(f.controller.start([sticks]), /текущую работу/);
  assert.equal(f.prepared, 1);
});
