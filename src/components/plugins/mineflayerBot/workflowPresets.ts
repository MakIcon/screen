import type { MineflayerWorkflowStep } from "../../../types";

export const WORKFLOW_PRESET_GROUPS = [
  { id: "farm", label: "Огород" },
  { id: "mining", label: "Ресурсы" },
  { id: "gear", label: "Снаряжение" },
  { id: "craft", label: "Крафт и стройка" },
  { id: "food", label: "Еда" },
  { id: "storage", label: "Склад" },
] as const;

type Preset = {
  id: string;
  group: (typeof WORKFLOW_PRESET_GROUPS)[number]["id"];
  label: string;
  description: string;
  requires: string;
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
const FIELD_REQUIREMENTS =
  "Запускайте рядом с водой. Нужны семена или овощи для посадки; древесину и мотыгу бот подготовит сам.";
const STATION_REQUIREMENTS =
  "Печь у места старта; верстак рядом или древесина для его изготовления.";

export const WORKFLOW_PRESETS = [
  {
    id: "new_farm",
    group: "farm",
    label: "Новый огород",
    description: "Заготовить дерево, сделать мотыгу, вспахать и засадить грядки.",
    requires: FIELD_REQUIREMENTS,
    steps: planting("auto"),
  },
  {
    id: "farm",
    group: "farm",
    label: "Уход за огородом",
    description: "Собрать зрелое, пересадить и заполнить пустые грядки за один проход.",
    requires: "Мотыга и семена у бота; для новой вспашки нужна вода рядом.",
    steps: [field("farm")],
  },
  {
    id: "harvest",
    group: "farm",
    label: "Сбор урожая",
    description: "Собрать все зрелые культуры в 8 блоках и пересадить их.",
    requires: "Зрелые растения рядом; семена для пересадки из инвентаря и урожая.",
    steps: [field("harvest")],
  },
  {
    id: "wheat",
    group: "farm",
    label: "Посев пшеницы",
    description: "Подготовить грядки и посадить семена пшеницы.",
    requires: FIELD_REQUIREMENTS,
    steps: planting("wheat"),
  },
  {
    id: "carrots",
    group: "farm",
    label: "Морковные грядки",
    description: "Вспахать землю и посадить морковь из инвентаря.",
    requires: FIELD_REQUIREMENTS,
    steps: planting("carrot"),
  },
  {
    id: "potatoes",
    group: "farm",
    label: "Посадка картофеля",
    description: "Сделать мотыгу, подготовить землю и посадить картофель.",
    requires: FIELD_REQUIREMENTS,
    steps: planting("potato"),
  },
  {
    id: "beetroot",
    group: "farm",
    label: "Свекольные грядки",
    description: "Вспахать и засеять свободную землю семенами свёклы.",
    requires: FIELD_REQUIREMENTS,
    steps: planting("beetroot"),
  },
  {
    id: "pumpkins",
    group: "farm",
    label: "Тыквенная бахча",
    description: "Посадить тыквы, сохранив рядом место для будущих плодов.",
    requires: FIELD_REQUIREMENTS,
    steps: planting("pumpkin"),
  },
  {
    id: "melons",
    group: "farm",
    label: "Арбузная бахча",
    description: "Подготовить и засадить грядки семенами арбуза.",
    requires: FIELD_REQUIREMENTS,
    steps: planting("melon"),
  },
  {
    id: "nether_wart",
    group: "farm",
    label: "Нарост Незера",
    description: "Засадить свободный песок душ в радиусе 8 блоков.",
    requires: "Нарост Незера в инвентаре и подготовленный песок душ рядом.",
    steps: [field("plant", "nether_wart")],
  },
  {
    id: "coal",
    group: "mining",
    label: "Запас угля",
    description: "Добыть 32 блока угольной руды и вернуться к старту.",
    requires: "Деревянная кирка или лучше; загруженная руда в радиусе 32 блоков.",
    steps: [mine("coal", 32), home()],
  },
  {
    id: "iron_ingots",
    group: "mining",
    label: "32 слитка железа",
    description: "Добыть уголь и железо, вернуться и переплавить сырьё.",
    requires: `Каменная кирка или лучше. ${STATION_REQUIREMENTS}`,
    steps: ingots("iron"),
  },
  {
    id: "copper_ingots",
    group: "mining",
    label: "32 слитка меди",
    description: "Заготовить топливо и медь, переплавить 32 единицы сырья.",
    requires: `Каменная кирка или лучше. ${STATION_REQUIREMENTS}`,
    steps: ingots("copper"),
  },
  {
    id: "gold_ingots",
    group: "mining",
    label: "32 слитка золота",
    description: "Добыть уголь и золотую руду, затем переплавить золото.",
    requires: `Железная кирка или лучше. ${STATION_REQUIREMENTS}`,
    steps: ingots("gold"),
  },
  {
    id: "diamonds",
    group: "mining",
    label: "Алмазная вылазка",
    description: "Добыть 8 блоков алмазной руды и вернуться на базу.",
    requires: "Железная кирка или лучше; алмазная руда в загруженных чанках.",
    steps: [mine("diamond", 8), home()],
  },
  {
    id: "building_stone",
    group: "mining",
    label: "Камень для стройки",
    description: "Добыть 128 блоков камня и принести полученный булыжник к старту.",
    requires: "Кирка с запасом прочности и свободное место в инвентаре.",
    steps: [mine("stone", 128), home()],
  },
  {
    id: "starter",
    group: "gear",
    label: "Деревянный старт",
    description: "Заготовить дерево, сделать верстак и пять деревянных инструментов.",
    requires: "Деревья в радиусе 16 блоков; верстак бот сделает сам.",
    steps: [forest(8), home(), craft("crafting_table"), ...tools("wooden")],
  },
  {
    id: "stone_tools",
    group: "gear",
    label: "Каменные инструменты",
    description: "Сделать деревянную кирку, добыть камень и собрать пять инструментов.",
    requires: "Деревья и обычный камень поблизости; кирку бот сначала скрафтит сам.",
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
    label: "Железные инструменты",
    description: "Добыть топливо, железо и дерево; сделать кирку, топор, меч и лопату.",
    requires: `Каменная кирка или лучше. ${STATION_REQUIREMENTS}`,
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
    label: "Полная железная броня",
    description: "Добыть и переплавить железо, скрафтить четыре части брони.",
    requires: `Каменная кирка или лучше. ${STATION_REQUIREMENTS}`,
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
    label: "Набор фермера",
    description: "Заготовить ресурсы, сделать железную мотыгу и пустое ведро.",
    requires: `Каменная кирка или лучше. ${STATION_REQUIREMENTS}`,
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
    label: "Дерево → палки",
    description: "Срубить 4 бревна и скрафтить 16 палок.",
    requires: "Деревья в радиусе 16 блоков.",
    steps: [forest(), craft("stick", 16)],
  },
  {
    id: "torches",
    group: "craft",
    label: "64 факела",
    description: "Заготовить дерево и уголь, вернуться и сделать факелы.",
    requires: "Кирка для угля; деревья и угольная руда поблизости.",
    steps: [forest(), home(), mine("coal", 16), home(), craft("torch", 64)],
  },
  {
    id: "chests",
    group: "craft",
    label: "8 сундуков",
    description: "Заготовить 20 брёвен и сделать сундуки для будущего склада.",
    requires: "Деревья поблизости; сундуки останутся в инвентаре бота.",
    steps: [forest(20), home(), craft("chest", 8)],
  },
  {
    id: "glass",
    group: "craft",
    label: "32 блока стекла",
    description: "Добыть уголь и песок, вернуться и переплавить стекло.",
    requires: `Кирка для угля; песок рядом. ${STATION_REQUIREMENTS}`,
    steps: [mine("coal", 4), mine("sand", 32), home(), smelt("sand", 32)],
  },
  {
    id: "stone_bricks",
    group: "craft",
    label: "32 каменных кирпича",
    description: "Добыть камень и уголь, обжечь булыжник и скрафтить кирпичи.",
    requires: `Обычная кирка без «Шёлкового касания». ${STATION_REQUIREMENTS}`,
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
    label: "4 печи",
    description: "Заготовить дерево и камень, сделать четыре обычные печи.",
    requires: "Кирка без «Шёлкового касания»; деревья и камень поблизости.",
    steps: [forest(), home(), mine("stone", 32), home(), craft("furnace", 4)],
  },
  {
    id: "bread",
    group: "food",
    label: "8 хлеба",
    description: "Заготовить дерево, собрать и пересадить 24 зрелые пшеницы, испечь хлеб.",
    requires: "Не менее 24 зрелых растений пшеницы в радиусе 8 блоков; семена для пересадки.",
    steps: [forest(), home(), field("harvest", "wheat", 24), home(), craft("bread", 8)],
  },
  {
    id: "baked_potatoes",
    group: "food",
    label: "16 печёных картофелин",
    description: "Добыть уголь, собрать и пересадить картофель, затем приготовить его.",
    requires: "Кирка для угля, 16 зрелых растений картофеля рядом и печь или коптильня у старта.",
    steps: [mine("coal", 2), home(), field("harvest", "potato", 16), home(), smelt("potato", 16)],
  },
  {
    id: "harvest_storage",
    group: "storage",
    label: "Урожай на склад",
    description: "Собрать и пересадить зрелые культуры, вернуться и выгрузить добычу.",
    requires: "Настроенные группы сундуков и подходящие фильтры для урожая.",
    steps: [field("harvest"), home(), { kind: "deposit" }],
  },
  {
    id: "cleanup",
    group: "storage",
    label: "Уборка территории",
    description: "Подобрать дроп в радиусе 16 блоков и сложить его на склад.",
    requires: "Настроенный склад с подходящими фильтрами и свободным местом.",
    steps: [{ kind: "collect", radius: 16 }, home(), { kind: "deposit" }],
  },
] as const satisfies readonly Preset[];

export type WorkflowPresetId = (typeof WORKFLOW_PRESETS)[number]["id"];

export function workflowTemplate(
  id: WorkflowPresetId,
): Array<MineflayerWorkflowStep & { id: string }> {
  const preset = WORKFLOW_PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new Error("Неизвестный пресет сценария");
  return preset.steps.map((step) => ({ ...step, id: crypto.randomUUID() }));
}
