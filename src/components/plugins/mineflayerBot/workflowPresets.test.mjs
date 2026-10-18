import { createRequire } from "node:module";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";
import { WORKFLOW_PRESETS, WORKFLOW_PRESET_GROUPS, workflowTemplate } from "./workflowPresets";
import { readWorkflowDraft, workflowPayload, WORKFLOW_STEP_LIMIT } from "./workflowDraft";
const runtime = createRequire(
  new URL("../../../../extensions/mineflayer-bot/package.json", import.meta.url),
);
const native = createRequire(runtime.resolve("mineflayer"));
const mcData = runtime("minecraft-data");
const { Vec3 } = runtime("vec3");
const { validateWorkflow } = runtime("./workflow.cjs");
const { normalizeTask } = runtime("./gathering-plan.cjs");
const { planCraft, smeltingRecipe } = runtime("./production-plan.cjs");
function fixture(version) {
  const registry = mcData(version);
  const Recipe = native("prismarine-recipe")(registry).Recipe;
  const stock = new Map();
  const add = (name, count) => {
    const next = (stock.get(name) || 0) + count;
    expect(next, `Insufficient ${name}`).toBeGreaterThanOrEqual(0);
    stock.set(name, next);
  };
  const bot = {
    registry,
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: {
      items: () =>
        [...stock]
          .filter(([, count]) => count > 0)
          .map(([name, count]) => ({
            name,
            type: registry.itemsByName[name].id,
            count,
            metadata: 0,
          })),
    },
    recipesAll: (id, metadata, table) =>
      Recipe.find(id, metadata).filter((recipe) => table || !recipe.requiresTable),
  };
  // Apply the real recipes selected by the worker, consuming shared ingredients.
  const applyRecipes = (recipes) => {
    for (const step of recipes)
      for (const delta of step.recipe.delta)
        add(registry.items[delta.id].name, delta.count * step.times);
  };
  return { bot, stock, add, applyRecipes };
}
describe("workflow preset library", () => {
  it("has unique presets in every category, all within the plan limit", () => {
    expect(WORKFLOW_PRESETS).toHaveLength(31);
    expect(new Set(WORKFLOW_PRESETS.map((preset) => preset.id)).size).toBe(WORKFLOW_PRESETS.length);
    for (const group of WORKFLOW_PRESET_GROUPS)
      expect(WORKFLOW_PRESETS.some((preset) => preset.group === group.id)).toBe(true);
    for (const preset of WORKFLOW_PRESETS) {
      expect(preset.steps.length).toBeGreaterThan(0);
      expect(preset.steps.length).toBeLessThanOrEqual(WORKFLOW_STEP_LIMIT);
      expect(preset.requires.length).toBeGreaterThan(0);
    }
  });
  it("keeps added copies independent and saves every preset without changing its settings", () => {
    for (const preset of WORKFLOW_PRESETS) {
      const first = workflowTemplate(preset.id),
        second = workflowTemplate(preset.id);
      expect(workflowPayload(readWorkflowDraft(JSON.stringify(workflowPayload(first))))).toEqual(
        workflowPayload(first),
      );
      expect(first.every((step, index) => step.id !== second[index].id)).toBe(true);
      first[0].count = 123;
      expect(second[0].count).toEqual(preset.steps[0].count);
    }
  });
  for (const version of ["1.20.4", "26.1.2"]) {
    it(`validates all preset blocks, crop IDs, recipes and limits through the worker on ${version}`, () => {
      const f = fixture(version);
      for (const preset of WORKFLOW_PRESETS) {
        expect(
          () =>
            validateWorkflow(workflowTemplate(preset.id), {
              bot: f.bot,
              gathering: { validate: (input) => normalizeTask(f.bot, input) },
            }),
          preset.label,
        ).not.toThrow();
      }
    });
    it(`provides enough gathered materials and fuel for production presets on ${version}`, () => {
      for (const preset of WORKFLOW_PRESETS.filter((entry) =>
        entry.steps.some((step) => step.kind === "craft" || step.kind === "smelt"),
      )) {
        const f = fixture(version);
        let table = preset.requires.includes("верстак рядом");
        for (const step of preset.steps) {
          if (step.kind === "forest") f.add("oak_log", step.count);
          if (step.kind === "mine") {
            const drops = {
              stone: "cobblestone",
              iron: "raw_iron",
              gold: "raw_gold",
              copper: "raw_copper",
            };
            f.add(drops[step.item] || step.item, step.count);
          }
          if (step.kind === "harvest" && step.count) f.add(step.item, step.count);
          if (step.kind === "smelt") {
            f.add("coal", -Math.ceil(step.count / 8));
            f.add(step.item, -step.count);
            f.add(smeltingRecipe(f.bot, step.item).output.name, step.count);
          }
          if (step.kind === "craft") {
            let recipes = planCraft(f.bot, [{ item: step.item, count: step.count }]);
            if (!table && recipes.some((recipe) => recipe.recipe.requiresTable)) {
              if (!f.stock.get("crafting_table"))
                f.applyRecipes(planCraft(f.bot, [{ item: "crafting_table", count: 1 }]));
              f.add("crafting_table", -1);
              table = true;
              recipes = planCraft(f.bot, [{ item: step.item, count: step.count }]);
            }
            f.applyRecipes(recipes);
            expect(f.stock.get(step.item), `${preset.id}: ${step.item}`).toBeGreaterThanOrEqual(
              step.count,
            );
          }
        }
      }
    });
  }
  it("returns to the starting stations before smelting and keeps farming passes finite", () => {
    for (const preset of WORKFLOW_PRESETS) {
      for (const [index, step] of preset.steps.entries()) {
        if (step.kind === "smelt") {
          const previousTravel = preset.steps
            .slice(0, index)
            .filter((entry) => ["mine", "forest", "harvest", "return"].includes(entry.kind))
            .at(-1);
          expect(previousTravel?.kind, preset.id).toBe("return");
        }
        if (["farm", "plant", "harvest"].includes(step.kind)) {
          expect(step.radius).toBe(8);
          expect(step.replant).toBe(true);
        }
      }
    }
  });
});
