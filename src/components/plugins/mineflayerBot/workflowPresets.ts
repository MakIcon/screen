import type { MineflayerWorkflowStep } from "../../../types";

export const WORKFLOW_PRESET_GROUPS = [
  "farm",
  "mining",
  "gear",
  "craft",
  "food",
  "storage",
] as const;

type Preset = {
  id: string;
  group: (typeof WORKFLOW_PRESET_GROUPS)[number];
  steps: readonly MineflayerWorkflowStep[];
};

const mine = (item: string, count: number): MineflayerWorkflowStep => ({
  kind: "mine",
  item,
  count,
  radius: 32,
});
const forest = (count = 4): MineflayerWorkflowStep => ({ kind: "forest", count, radius: 16 });
const home = (): MineflayerWorkflowStep => ({ kind: "return" });
const craft = (item: string, count = 1): MineflayerWorkflowStep => ({
  kind: "craft",
  item,
  count,
  mode: "auto",
});
const smelt = (item: string, count: number): MineflayerWorkflowStep => ({
  kind: "smelt",
  item,
  count,
  mode: "auto",
});
const field = (
  kind: "farm" | "plant" | "harvest",
  item = "auto",
  count = 0,
): MineflayerWorkflowStep => ({ kind, item, count, radius: 8, replant: true });
const planting = (crop: string): MineflayerWorkflowStep[] => [
  forest(),
  home(),
  craft("wooden_hoe"),
  { kind: "till", count: 0, radius: 8 },
  field("plant", crop),
];
const tools = (material: string): MineflayerWorkflowStep[] =>
  ["pickaxe", "axe", "sword", "shovel", "hoe"].map((tool) => craft(`${material}_${tool}`));
const ingots = (ore: string): MineflayerWorkflowStep[] => [
  mine("coal", 4),
  mine(ore, 32),
  home(),
  smelt(`raw_${ore}`, 32),
];

export const WORKFLOW_PRESETS = [
  {
    id: "new_farm",
    group: "farm",
    steps: planting("auto"),
  },
  {
    id: "farm",
    group: "farm",
    steps: [field("farm")],
  },
  {
    id: "harvest",
    group: "farm",
    steps: [field("harvest")],
  },
  {
    id: "wheat",
    group: "farm",
    steps: planting("wheat"),
  },
  {
    id: "carrots",
    group: "farm",
    steps: planting("carrot"),
  },
  {
    id: "potatoes",
    group: "farm",
    steps: planting("potato"),
  },
  {
    id: "beetroot",
    group: "farm",
    steps: planting("beetroot"),
  },
  {
    id: "pumpkins",
    group: "farm",
    steps: planting("pumpkin"),
  },
  {
    id: "melons",
    group: "farm",
    steps: planting("melon"),
  },
  {
    id: "nether_wart",
    group: "farm",
    steps: [field("plant", "nether_wart")],
  },
  {
    id: "coal",
    group: "mining",
    steps: [mine("coal", 32), home()],
  },
  {
    id: "iron_ingots",
    group: "mining",
    steps: ingots("iron"),
  },
  {
    id: "copper_ingots",
    group: "mining",
    steps: ingots("copper"),
  },
  {
    id: "gold_ingots",
    group: "mining",
    steps: ingots("gold"),
  },
  {
    id: "diamonds",
    group: "mining",
    steps: [mine("diamond", 8), home()],
  },
  {
    id: "building_stone",
    group: "mining",
    steps: [mine("stone", 128), home()],
  },
  {
    id: "starter",
    group: "gear",
    steps: [forest(8), home(), craft("crafting_table"), ...tools("wooden")],
  },
  {
    id: "stone_tools",
    group: "gear",
    steps: [
      forest(),
      home(),
      craft("wooden_pickaxe"),
      mine("stone", 16),
      home(),
      ...tools("stone"),
    ],
  },
  {
    id: "iron",
    group: "gear",
    steps: [
      mine("coal", 2),
      mine("iron", 9),
      home(),
      forest(),
      home(),
      craft("stick", 8),
      smelt("raw_iron", 9),
      ...["pickaxe", "axe", "sword", "shovel"].map((tool) => craft(`iron_${tool}`)),
    ],
  },
  {
    id: "iron_armor",
    group: "gear",
    steps: [
      mine("coal", 4),
      mine("iron", 24),
      home(),
      smelt("raw_iron", 24),
      ...["helmet", "chestplate", "leggings", "boots"].map((part) => craft(`iron_${part}`)),
    ],
  },
  {
    id: "farmer_gear",
    group: "gear",
    steps: [
      forest(),
      home(),
      mine("coal", 1),
      mine("iron", 5),
      home(),
      smelt("raw_iron", 5),
      craft("iron_hoe"),
      craft("bucket"),
    ],
  },
  {
    id: "wood",
    group: "craft",
    steps: [forest(), craft("stick", 16)],
  },
  {
    id: "torches",
    group: "craft",
    steps: [forest(), home(), mine("coal", 16), home(), craft("torch", 64)],
  },
  {
    id: "chests",
    group: "craft",
    steps: [forest(20), home(), craft("chest", 8)],
  },
  {
    id: "glass",
    group: "craft",
    steps: [mine("coal", 4), mine("sand", 32), home(), smelt("sand", 32)],
  },
  {
    id: "stone_bricks",
    group: "craft",
    steps: [
      mine("coal", 4),
      mine("stone", 32),
      home(),
      smelt("cobblestone", 32),
      craft("stone_bricks", 32),
    ],
  },
  {
    id: "furnaces",
    group: "craft",
    steps: [forest(), home(), mine("stone", 32), home(), craft("furnace", 4)],
  },
  {
    id: "bread",
    group: "food",
    steps: [forest(), home(), field("harvest", "wheat", 24), home(), craft("bread", 8)],
  },
  {
    id: "baked_potatoes",
    group: "food",
    steps: [mine("coal", 2), home(), field("harvest", "potato", 16), home(), smelt("potato", 16)],
  },
  {
    id: "harvest_storage",
    group: "storage",
    steps: [field("harvest"), home(), { kind: "deposit" }],
  },
  {
    id: "cleanup",
    group: "storage",
    steps: [{ kind: "collect", radius: 16 }, home(), { kind: "deposit" }],
  },
] as const satisfies readonly Preset[];

export type WorkflowPresetId = (typeof WORKFLOW_PRESETS)[number]["id"];

export function workflowTemplate(
  id: WorkflowPresetId,
): Array<MineflayerWorkflowStep & { id: string }> {
  const preset = WORKFLOW_PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Unknown workflow preset: ${id}`);
  return preset.steps.map((step) => ({ ...step, id: crypto.randomUUID() }));
}
