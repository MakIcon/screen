const { integer, itemByName, smeltingRecipe } = require("./production-plan.cjs");
const { goals } = require("./pathfinder.cjs");
const { randomUUID } = require("node:crypto");
const WORKFLOW_STEP_LIMIT = 100;

class WorkflowStopped extends Error {}

// Validate names and limits up front; resolve recipes against the inventory
// only when the step starts, after earlier steps have supplied its materials.
function validateWorkflow(steps, { bot, gathering }) {
  if (!Array.isArray(steps) || !steps.length || steps.length > WORKFLOW_STEP_LIMIT)
    throw new Error(`Добавьте от 1 до ${WORKFLOW_STEP_LIMIT} шагов`);
  return steps.map((step, index) => {
    try {
      if (!step || typeof step !== "object") throw new Error("Некорректный шаг");
      const kind = step.kind;
      if (kind === "return") return { kind };
      if (["till", "plant", "harvest", "farm"].includes(kind)) {
        const spec = { kind, item: String(step.item || "auto"),
          count: integer(step.count ?? 0, "Действия", 0, 4096),
          radius: integer(step.radius ?? 8, "Радиус", 4, 64), replant: step.replant ?? true };
        gathering.validate(spec);
        return spec;
      }
      if (["mine", "forest", "collect", "deposit"].includes(kind)) {
        const spec =
          kind === "mine"
            ? {
                kind,
                blocks: String(step.item || ""),
                count: integer(step.count, "Блоки", 1, 4096),
                radius: integer(step.radius, "Радиус", 4, 64),
              }
            : kind === "forest"
              ? {
                  kind,
                  count: integer(step.count, "Брёвна", 1, 256),
                  radius: integer(step.radius, "Радиус", 4, 64),
                  leaves: false,
                  scaffold: true,
                }
              : kind === "collect"
                ? { kind, radius: integer(step.radius, "Радиус", 4, 64) }
                : { kind };
        gathering.validate(spec);
        return { ...spec, item: kind === "mine" ? spec.blocks : undefined };
      }
      if (kind === "craft") {
        const item = itemByName(bot, step.item).name;
        const count = integer(step.count, "Количество");
        const mode = step.mode || "auto";
        if (!["auto", "inventory", "table"].includes(mode))
          throw new Error("Выберите место крафта");
        return { kind, item, count, mode };
      }
      if (kind === "smelt") {
        const mode = step.mode || "auto";
        if (!["auto", "furnace", "blast_furnace", "smoker"].includes(mode))
          throw new Error("Выберите печь");
        const recipe = smeltingRecipe(bot, step.item, mode);
        return {
          kind,
          item: recipe.input.name,
          count: integer(step.count, "Количество", 1, Math.min(64, recipe.input.stackSize || 64)),
          mode,
        };
      }
      throw new Error("Неизвестное действие");
    } catch (error) {
      throw new Error(`Шаг ${index + 1}: ${error.message}`, { cause: error });
    }
  });
}

function createWorkflowController({
  bot,
  gathering,
  production,
  prepare,
  onStatus = () => {},
  pollMs = 150,
}) {
  let phase = "idle",
    message = "Добавьте действия в сценарий",
    steps = [],
    current = -1,
    origin = null;
  let runId = null,
    name = "Мой сценарий",
    startedAt = null,
    finishedAt = null;
  const history = [];
  let generation = 0,
    paused = false,
    pending = Promise.resolve();
  const busy = () => ["starting", "running", "pausing", "paused", "stopping"].includes(phase);
  const report = (text) => {
    message = text;
    onStatus(text);
  };
  const record = () => {
    if (!runId || history.some((entry) => entry.id === runId)) return;
    finishedAt = Date.now();
    history.unshift({
      id: runId,
      name,
      startedAt,
      finishedAt,
      phase,
      message,
      steps: steps.map((step) => ({ ...step })),
    });
    history.splice(30);
  };
  const sleep = () => new Promise((resolve) => setTimeout(resolve, pollMs));
  const check = (token) => {
    if (token !== generation) throw new Error("Сценарий остановлен");
  };
  async function runStep(step, token) {
    if (step.kind === "return") {
      let done = false,
        failure;
      void Promise.resolve(
        bot.pathfinder.goto(new goals.GoalNear(origin.x, origin.y, origin.z, 2)),
      ).then(
        () => {
          done = true;
        },
        (error) => {
          done = true;
          failure = error;
        },
      );
      while (!done) {
        await sleep();
        check(token);
      }
      if (failure) throw failure;
      return;
    }
    if (["mine", "forest", "collect", "deposit", "till", "plant", "harvest", "farm"].includes(step.kind)) {
      const id = gathering.enqueue(step);
      for (;;) {
        check(token);
        const snapshot = gathering.snapshot;
        const result = snapshot.history.find((entry) => entry.id === id);
        if (result) {
          if (result.outcome === "отменено") throw new WorkflowStopped("Добыча остановлена");
          if (result.outcome !== "готово")
            throw new Error(result.reason || `Добыча завершена: ${result.outcome}`);
          return;
        }
        if (snapshot.phase === "paused" && !snapshot.automaticPause) {
          const reason = snapshot.reason || "Добыча требует вашего вмешательства";
          await gathering.stop();
          throw new Error(reason);
        }
        if (!gathering.busy) throw new WorkflowStopped("Добыча остановлена до завершения шага");
        await sleep();
      }
    }
    if (step.kind === "craft")
      production.craft(production.prepareCraft(step.item, step.count, step.mode));
    else production.smelt(production.prepareSmelt(step.item, step.count, "auto", step.mode));
    await production.task;
    check(token);
    const result = production.snapshot();
    if (result.phase === "error") throw new Error(result.message);
    if (result.outcome === "stopped")
      throw new WorkflowStopped("Работа остановлена до завершения шага");
    if (result.outcome !== "complete") throw new Error("Работа прервана до завершения шага");
  }
  async function run(token) {
    try {
      for (let index = 0; index < steps.length; index++) {
        check(token);
        while (paused) {
          phase = "paused";
          await sleep();
          check(token);
        }
        current = index;
        phase = "running";
        steps[index].state = "running";
        report(`Шаг ${index + 1} из ${steps.length}`);
        await runStep(steps[index], token);
        check(token);
        steps[index].state = "complete";
      }
      phase = "complete";
      report("Сценарий выполнен. Все шаги завершены");
      record();
    } catch (error) {
      if (token !== generation) return;
      phase = error instanceof WorkflowStopped ? "stopped" : "error";
      if (steps[current]) steps[current].state = phase;
      report(`Шаг ${current + 1}: ${error.message}`);
      record();
    }
  }
  const controller = {
    get busy() {
      return busy();
    },
    get task() {
      return pending;
    },
    snapshot() {
      return {
        id: runId,
        name,
        startedAt,
        finishedAt,
        phase,
        message,
        current,
        steps: steps.map((step) => ({ ...step })),
        history: history.map((entry) => ({
          ...entry,
          steps: entry.steps.map((step) => ({ ...step })),
        })),
      };
    },
    async start(input, title) {
      if (busy()) throw new Error("Сценарий уже запущен");
      const validated = validateWorkflow(input, { bot, gathering });
      if (validated.some((step) => step.kind === "return")) {
        const position = bot.entity?.position;
        if (!position || ![position.x, position.y, position.z].every(Number.isFinite))
          throw new Error("Позиция бота ещё недоступна");
        origin = { x: position.x, y: position.y, z: position.z };
      }
      if (gathering.busy || production.busy)
        throw new Error("Завершите текущую работу бота перед запуском сценария");
      const token = ++generation;
      runId = randomUUID();
      name =
        typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : "Мой сценарий";
      startedAt = Date.now();
      finishedAt = null;
      phase = "starting";
      paused = false;
      current = -1;
      steps = validated.map((step) => ({ ...step, state: "waiting" }));
      try {
        if ((await prepare()) === false) throw new Error("Подготовка бота прервана");
        check(token);
      } catch (error) {
        if (token !== generation) return "Сценарий остановлен";
        if (token === generation) {
          phase = "error";
          report(error.message);
          record();
        }
        throw error;
      }
      pending = run(token);
      return "Сценарий запущен";
    },
    pause() {
      if (!["running", "pausing"].includes(phase)) throw new Error("Нет выполняемого сценария");
      paused = true;
      phase = "pausing";
      report("Пауза после текущего шага");
      return message;
    },
    resume() {
      if (!["paused", "pausing"].includes(phase)) throw new Error("Сценарий не на паузе");
      paused = false;
      phase = "running";
      report("Выполнение сценария продолжено");
      return message;
    },
    async stop() {
      if (!busy()) return "Нет выполняемого сценария";
      ++generation;
      paused = false;
      phase = "stopping";
      try {
        const results = await Promise.allSettled([
          gathering.stop(),
          production.stop(),
          bot.pathfinder?.stop(),
        ]);
        await pending;
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length)
          report(
            `Остановка работы: ${failures.map((result) => result.reason?.message || String(result.reason)).join("; ")}`,
          );
      } finally {
        if (steps[current]?.state === "running") steps[current].state = "stopped";
        phase = "stopped";
        report("Сценарий остановлен");
        record();
      }
      return message;
    },
    async dispatch(action, input, title) {
      if (!["start", "pause", "resume", "stop"].includes(action))
        throw new Error("Неизвестное действие сценария");
      return action === "start" ? controller.start(input, title) : controller[action]();
    },
  };
  bot.launcherWorkflow = controller;
  return controller;
}

module.exports = { validateWorkflow, createWorkflowController };
