import type { MineflayerWorkflowStep } from "../../../types";
import bundledCatalog from "../../../data/minecraftCatalog.json";
import { isPlainMessageKey, readLocale, translateFor, type Locale } from "../../../i18n/locale";

const catalogNames = new Map(
  bundledCatalog.entries.map((entry) => [entry.name, entry.displayName]),
);
const shorten = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
/** Item name for workflow texts: a `bot.item.*` message when the launcher has one, else the catalog name. */
export function workflowItemLabel(value: string, locale: Locale = readLocale()): string {
  const name = value.trim().replace(/^minecraft:/, "");
  const key = `bot.item.${name}`;
  if (isPlainMessageKey(key)) return translateFor(locale, key);
  return catalogNames.get(name) || name.replace(/_/g, " ");
}
const itemName = workflowItemLabel;

const SHORT_NAME_LIMIT = 36;
const THEMES = {
  wood: ["Лесной", "Лесная"],
  iron: ["Железный", "Железная"],
  gold: ["Золотой", "Золотая"],
  copper: ["Медный", "Медная"],
  diamond: ["Алмазный", "Алмазная"],
  emerald: ["Изумрудный", "Изумрудная"],
  netherite: ["Незеритовый", "Незеритовая"],
  coal: ["Угольный", "Угольная"],
  stone: ["Каменный", "Каменная"],
  redstone: ["Редстоуновый", "Редстоуновая"],
  lapis: ["Лазуритовый", "Лазуритовая"],
  sand: ["Песчаный", "Песчаная"],
  glass: ["Стеклянный", "Стеклянная"],
  food: ["Сытный", "Сытная"],
  cargo: ["Грузовой", "Грузовая"],
  mining: ["Шахтёрский", "Шахтёрская"],
  field: ["Полевой", "Полевая"],
} as const;
type Theme = keyof typeof THEMES;
const MATERIALS: Array<[Theme, RegExp]> = [
  ["netherite", /netherite|ancient_debris/],
  ["diamond", /diamond/],
  ["emerald", /emerald/],
  ["gold", /gold|golden/],
  ["iron", /iron/],
  ["copper", /copper/],
  ["redstone", /redstone/],
  ["lapis", /lapis/],
  ["coal", /coal|charcoal/],
  ["stone", /stone|deepslate|granite|diorite|andesite|tuff/],
  ["glass", /glass/],
  ["sand", /sand/],
  ["wood", /wood|log|planks|stem|hyphae|stick|crafting_table/],
  ["food", /beef|porkchop|chicken|mutton|rabbit|cod|salmon|potato|bread|carrot|kelp/],
];

function stepTheme(step: MineflayerWorkflowStep): Theme | undefined {
  const tokens = (step.item || "").toLowerCase().split(",");
  for (const token of tokens) {
    const material = MATERIALS.find(([, pattern]) => pattern.test(token));
    if (material) return material[0];
  }
  if (step.kind === "forest") return "wood";
}

function legacyCompactWorkflowName(steps: MineflayerWorkflowStep[]): string {
  const has = (kind: MineflayerWorkflowStep["kind"]) => steps.some((step) => step.kind === kind);
  // The last production goal describes the result; fall back to gathered resources.
  const production = steps.filter((step) => step.kind === "craft" || step.kind === "smelt");
  const theme =
    [...production].reverse().map(stepTheme).find(Boolean) ||
    [...steps].reverse().map(stepTheme).find(Boolean) ||
    (has("deposit") || has("collect") ? "cargo" : has("mine") ? "mining" : "field");
  const last = steps[steps.length - 1].kind;
  let noun: string, gender: 0 | 1;
  if (last === "deposit" || last === "return") {
    noun = last === "deposit" ? "караван" : "рейс";
    gender = 0;
  } else if (has("craft")) {
    noun = "мастерская";
    gender = 1;
  } else if (has("smelt")) {
    noun = theme === "food" ? "кухня" : "плавильня";
    gender = 1;
  } else if (has("forest")) {
    noun = "промысел";
    gender = 0;
  } else if (has("mine")) {
    noun = "рудник";
    gender = 0;
  } else {
    noun = "поход";
    gender = 0;
  }
  return `${THEMES[theme][gender]} ${noun}`;
}

type Adjective = readonly [string, string, string];
type Gender = 0 | 1 | 2;
const adjective = (stem: string, ending = "ый"): Adjective => [
  stem + ending,
  stem + "ая",
  stem + "ое",
];
const NAME_THEMES = {
  wood: [adjective("Лесн", "ой"), adjective("Смолист"), adjective("Таёжн"), adjective("Древесн")],
  oak: [adjective("Дубов"), adjective("Крепк", "ий"), adjective("Лесн", "ой")],
  birch: [adjective("Берёзов"), adjective("Светл"), adjective("Белоствольн")],
  spruce: [adjective("Елов"), adjective("Таёжн"), adjective("Северн"), adjective("Хвойн")],
  darkOak: [adjective("Тенист"), adjective("Тёмн"), adjective("Дубов")],
  paleOak: [adjective("Бледн"), adjective("Сумрачн"), adjective("Тих", "ий")],
  jungle: [adjective("Тропическ", "ий"), adjective("Джунглев"), adjective("Зелён")],
  acacia: [adjective("Акациев"), adjective("Солнечн"), adjective("Сух", "ой")],
  mangrove: [adjective("Мангров"), adjective("Болотн"), adjective("Прибрежн")],
  cherry: [adjective("Вишнёв"), adjective("Розов"), adjective("Садов")],
  bamboo: [adjective("Бамбуков"), adjective("Тростников"), adjective("Зелён")],
  iron: [
    adjective("Железн"),
    adjective("Закалённ"),
    adjective("Рудн"),
    adjective("Металлическ", "ий"),
  ],
  gold: [adjective("Золот", "ой"), adjective("Золотоносн"), adjective("Драгоценн")],
  copper: [adjective("Медн"), adjective("Патинированн"), adjective("Рудн")],
  diamond: [adjective("Алмазн"), adjective("Кристальн"), adjective("Драгоценн")],
  emerald: [adjective("Изумрудн"), adjective("Зелён"), adjective("Самоцветн")],
  netherite: [adjective("Незеритов"), ["Древний", "Древняя", "Древнее"], adjective("Огнеупорн")],
  coal: [adjective("Угольн"), adjective("Чёрн"), adjective("Топливн")],
  stone: [adjective("Каменн"), adjective("Скальн"), adjective("Гранитн"), adjective("Глубинн")],
  redstone: [adjective("Редстоунов"), adjective("Импульсн"), adjective("Сигнальн")],
  lapis: [adjective("Лазуритов"), adjective("Лазурн"), adjective("Самоцветн")],
  sand: [adjective("Песчан"), adjective("Барханн"), adjective("Пустынн")],
  glass: [adjective("Стеклянн"), adjective("Прозрачн"), adjective("Витражн")],
  food: [
    adjective("Сытн"),
    ["Домашний", "Домашняя", "Домашнее"],
    adjective("Съестн", "ой"),
    adjective("Походн"),
  ],
  ocean: [adjective("Морск", "ой"), adjective("Подводн"), adjective("Прибрежн")],
  ice: [adjective("Ледян", "ой"), adjective("Снежн"), adjective("Морозн")],
  quartz: [adjective("Кварцев"), adjective("Бел"), adjective("Кристальн")],
  amethyst: [adjective("Аметистов"), adjective("Лилов"), adjective("Кристальн")],
  obsidian: [adjective("Обсидианов"), adjective("Вулканическ", "ий"), adjective("Чёрн")],
  nether: [adjective("Незерск", "ий"), adjective("Багров"), adjective("Пепельн")],
  end: [adjective("Эндерск", "ий"), adjective("Пустотн"), adjective("Краев", "ой")],
  sculk: [adjective("Скалков"), adjective("Глубинн"), adjective("Тенев", "ой")],
  farming: [adjective("Фермерск", "ий"), adjective("Урожайн"), adjective("Полев", "ой")],
  textile: [adjective("Шерстян", "ой"), adjective("Тёпл"), adjective("Мягк", "ий")],
  leather: [adjective("Кожан"), adjective("Походн"), adjective("Прочн")],
  clay: [adjective("Глинян"), adjective("Кирпичн"), adjective("Терракотов")],
  dye: [adjective("Цветн", "ой"), adjective("Красочн"), adjective("Пёстр")],
  cargo: [
    adjective("Грузов", "ой"),
    adjective("Запасн", "ой"),
    ["Дальний", "Дальняя", "Дальнее"],
    adjective("Походн"),
  ],
  mining: [
    adjective("Шахтёрск", "ий"),
    adjective("Рудн"),
    adjective("Подземн"),
    adjective("Глубинн"),
  ],
  field: [
    adjective("Полев", "ой"),
    adjective("Походн"),
    ["Дальний", "Дальняя", "Дальнее"],
    adjective("Ночн", "ой"),
  ],
} satisfies Record<string, Adjective[]>;
type NameTheme = keyof typeof NAME_THEMES;
const EXTRA_MATERIALS: Array<[NameTheme, RegExp]> = [
  ["paleOak", /pale_oak/],
  ["darkOak", /dark_oak/],
  ["oak", /(?:^|_)oak(?:_|$)/],
  ["birch", /birch/],
  ["spruce", /spruce/],
  ["jungle", /jungle/],
  ["acacia", /acacia/],
  ["mangrove", /mangrove/],
  ["cherry", /cherry/],
  ["bamboo", /bamboo/],
  ["quartz", /quartz/],
  ["amethyst", /amethyst/],
  ["obsidian", /obsidian/],
  ["nether", /netherrack|crimson|warped|soul_|blackstone|basalt|nether_brick/],
  ["end", /ender|end_stone|chorus|purpur|shulker/],
  ["sculk", /sculk|echo_shard/],
  ["ocean", /prismarine|sponge|coral|sea_lantern|cod|salmon|kelp|turtle|nautilus/],
  ["ice", /(?:^|_)ice(?:_|$)|(?:^|_)snow/],
  ["farming", /wheat|seeds|pumpkin|melon|sugar_cane|cactus|beetroot/],
  ["textile", /wool|string|carpet/],
  ["leather", /leather|rabbit_hide/],
  ["clay", /clay|brick|terracotta/],
  ["dye", /dye|ink_sac/],
];
type Noun = readonly [string, Gender];
const NOUNS = {
  delivery: [
    ["караван", 0],
    ["обоз", 0],
    ["конвой", 0],
    ["груз", 0],
    ["поставка", 1],
    ["рейс", 0],
  ],
  return: [
    ["маршрут", 0],
    ["рейс", 0],
    ["поход", 0],
    ["экспедиция", 1],
    ["круг", 0],
    ["переход", 0],
  ],
  workshop: [
    ["мастерская", 1],
    ["артель", 1],
    ["производство", 2],
    ["фабрика", 1],
    ["комбинат", 0],
    ["цех", 0],
  ],
  equipment: [
    ["арсенал", 0],
    ["снаряжение", 2],
    ["оснастка", 1],
    ["набор", 0],
    ["экипировка", 1],
    ["кузница", 1],
  ],
  building: [
    ["стройка", 1],
    ["проект", 0],
    ["заготовка", 1],
    ["партия", 1],
    ["поставка", 1],
    ["цех", 0],
  ],
  mechanism: [
    ["механизм", 0],
    ["схема", 1],
    ["сборка", 1],
    ["автоматика", 1],
    ["контур", 0],
    ["система", 1],
  ],
  smelting: [
    ["плавильня", 1],
    ["горн", 0],
    ["печь", 1],
    ["литейная", 1],
    ["заготовка", 1],
    ["цех", 0],
  ],
  cooking: [
    ["кухня", 1],
    ["очаг", 0],
    ["запас", 0],
    ["паёк", 0],
    ["угощение", 2],
    ["провиант", 0],
  ],
  forest: [
    ["лесоповал", 0],
    ["промысел", 0],
    ["делянка", 1],
    ["заготовка", 1],
    ["артель", 1],
    ["запас", 0],
  ],
  mining: [
    ["рудник", 0],
    ["выработка", 1],
    ["забой", 0],
    ["жила", 1],
    ["прииск", 0],
    ["шахта", 1],
  ],
  collect: [
    ["сбор", 0],
    ["поиск", 0],
    ["улов", 0],
    ["запас", 0],
    ["находка", 1],
    ["поход", 0],
  ],
  travel: [
    ["маршрут", 0],
    ["переход", 0],
    ["экспедиция", 1],
    ["разведка", 1],
    ["поход", 0],
    ["рейс", 0],
  ],
} satisfies Record<string, Noun[]>;
type Purpose = keyof typeof NOUNS;

// English names are plain "<adjective> <noun>" pairs, so they need no grammatical gender.
const NAME_THEMES_EN: Record<NameTheme, string[]> = {
  wood: ["Forest", "Resinous", "Taiga", "Timber"],
  oak: ["Oak", "Sturdy", "Forest"],
  birch: ["Birch", "Bright", "Whitewood"],
  spruce: ["Spruce", "Taiga", "Northern", "Pine"],
  darkOak: ["Shady", "Dark", "Oaken"],
  paleOak: ["Pale", "Twilight", "Quiet"],
  jungle: ["Tropical", "Jungle", "Green"],
  acacia: ["Acacia", "Sunny", "Dry"],
  mangrove: ["Mangrove", "Swamp", "Coastal"],
  cherry: ["Cherry", "Pink", "Orchard"],
  bamboo: ["Bamboo", "Reed", "Green"],
  iron: ["Iron", "Tempered", "Ore", "Metallic"],
  gold: ["Golden", "Gilded", "Precious"],
  copper: ["Copper", "Weathered", "Ore"],
  diamond: ["Diamond", "Crystal", "Precious"],
  emerald: ["Emerald", "Green", "Gem"],
  netherite: ["Netherite", "Ancient", "Fireproof"],
  coal: ["Coal", "Black", "Fuel"],
  stone: ["Stone", "Rocky", "Granite", "Deep"],
  redstone: ["Redstone", "Pulse", "Signal"],
  lapis: ["Lapis", "Azure", "Gem"],
  sand: ["Sandy", "Dune", "Desert"],
  glass: ["Glass", "Clear", "Stained"],
  food: ["Hearty", "Homemade", "Edible", "Trail"],
  ocean: ["Sea", "Underwater", "Coastal"],
  ice: ["Icy", "Snowy", "Frosty"],
  quartz: ["Quartz", "White", "Crystal"],
  amethyst: ["Amethyst", "Violet", "Crystal"],
  obsidian: ["Obsidian", "Volcanic", "Black"],
  nether: ["Nether", "Crimson", "Ashen"],
  end: ["Ender", "Void", "Chorus"],
  sculk: ["Sculk", "Deep", "Shadow"],
  farming: ["Farmer's", "Bountiful", "Field"],
  textile: ["Woolen", "Warm", "Soft"],
  leather: ["Leather", "Trail", "Tough"],
  clay: ["Clay", "Brick", "Terracotta"],
  dye: ["Colorful", "Vivid", "Motley"],
  cargo: ["Cargo", "Reserve", "Distant", "Trail"],
  mining: ["Miner's", "Ore", "Underground", "Deep"],
  field: ["Field", "Trail", "Distant", "Night"],
};
const NOUNS_EN: Record<Purpose, string[]> = {
  delivery: ["Caravan", "Convoy", "Haul", "Shipment", "Run"],
  return: ["Route", "Run", "Trek", "Expedition", "Loop", "Crossing"],
  workshop: ["Workshop", "Guild", "Production", "Factory", "Works", "Shop"],
  equipment: ["Armory", "Gear", "Rig", "Kit", "Outfit", "Forge"],
  building: ["Build", "Project", "Stock", "Batch", "Supply", "Shop"],
  mechanism: ["Mechanism", "Circuit", "Assembly", "Automation", "Contour", "System"],
  smelting: ["Smeltery", "Forge", "Furnace", "Foundry", "Stock", "Works"],
  cooking: ["Kitchen", "Hearth", "Stash", "Ration", "Treat", "Provisions"],
  forest: ["Logging", "Lumber Camp", "Clearing", "Stock", "Guild", "Stash"],
  mining: ["Mine", "Dig", "Face", "Vein", "Claim", "Shaft"],
  collect: ["Pickup", "Search", "Haul", "Stash", "Find", "Trek"],
  travel: ["Route", "Crossing", "Expedition", "Scouting", "Trek", "Run"],
};

function nameTheme(step: MineflayerWorkflowStep): NameTheme | undefined {
  for (const token of (step.item || "").toLowerCase().split(",")) {
    const extra = EXTRA_MATERIALS.find(([, pattern]) =>
      pattern.test(token.trim().replace(/^minecraft:/, "")),
    );
    if (extra) return extra[0];
  }
  return stepTheme(step);
}
function namePurpose(steps: MineflayerWorkflowStep[]): Purpose {
  const last = steps[steps.length - 1];
  if (last.kind === "deposit") return "delivery";
  if (last.kind === "return") return "return";
  const crafts = steps.filter((step) => step.kind === "craft");
  if (crafts.length) {
    const goal = crafts[crafts.length - 1].item || "";
    if (
      /sword|spear|pickaxe|_axe|shovel|_hoe|helmet|chestplate|leggings|boots|shield|bow|mace/.test(
        goal,
      )
    )
      return "equipment";
    if (/piston|observer|repeater|comparator|hopper|redstone|dispenser|dropper|crafter/.test(goal))
      return "mechanism";
    if (/brick|stairs|slab|fence|wall|door|planks|concrete|terracotta|glass/.test(goal))
      return "building";
    if (/bread|cookie|cake|stew|soup|pie/.test(goal)) return "cooking";
    return "workshop";
  }
  if (steps.some((step) => step.kind === "smelt"))
    return steps.some((step) =>
      /beef|porkchop|chicken|mutton|rabbit|cod|salmon|potato|kelp/.test(step.item || ""),
    )
      ? "cooking"
      : "smelting";
  if (steps.some((step) => step.kind === "forest")) return "forest";
  if (steps.some((step) => step.kind === "mine")) return "mining";
  return steps.some((step) => step.kind === "collect") ? "collect" : "travel";
}
function nameHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function nameOptions(steps: MineflayerWorkflowStep[], locale: Locale = readLocale()) {
  const production = steps.filter((step) => step.kind === "craft" || step.kind === "smelt");
  const theme =
    [...production].reverse().map(nameTheme).find(Boolean) ||
    [...steps].reverse().map(nameTheme).find(Boolean) ||
    (steps.some((step) => step.kind === "deposit" || step.kind === "collect")
      ? "cargo"
      : steps.some((step) => step.kind === "mine")
        ? "mining"
        : "field");
  const purpose = namePurpose(steps);
  const adjectives: Adjective[] =
    locale === "en"
      ? NAME_THEMES_EN[theme].map((word) => [word, word, word] as const)
      : NAME_THEMES[theme];
  const nouns: Noun[] =
    locale === "en" ? NOUNS_EN[purpose].map((word) => [word, 0] as const) : NOUNS[purpose];
  // Amounts and radius do not rename a plan. Its actions and materials do.
  const signature = steps
    .map((step) => `${step.kind}:${(step.item || "").toLowerCase()}`)
    .join("|");
  return { adjectives, nouns, hash: nameHash(signature), count: adjectives.length * nouns.length };
}
function compactWorkflowName(options: ReturnType<typeof nameOptions>, variant: number): string {
  const { adjectives, nouns, hash, count } = options;
  // Step through both words, rather than showing several adjectives for one noun.
  const index = (hash + variant * 5) % count;
  const [word, gender] = nouns[Math.floor(index / adjectives.length)];
  return `${adjectives[index % adjectives.length][gender]} ${word}`;
}

export function readWorkflowNameVariant(value: string | null): number {
  try {
    const variant: unknown = JSON.parse(value || "null")?.variant;
    return typeof variant === "number" && Number.isSafeInteger(variant) && variant >= 0
      ? variant
      : 0;
  } catch {
    return 0;
  }
}

function workflowLabels(steps: MineflayerWorkflowStep[], locale: Locale = readLocale()): string[] {
  return steps.map((step) => {
    const item = (step.item || "")
      .split(",")
      .filter((name) => name.trim())
      .map((name) => itemName(name, locale))
      .join(", ");
    const amount = step.count && step.count > 1 ? ` × ${step.count}` : "";
    switch (step.kind) {
      case "forest":
        return translateFor(locale, "bot.workflowName.wood", { amount });
      case "till":
        return translateFor(locale, "bot.workflowName.till");
      case "plant":
        return translateFor(locale, "bot.workflowName.plant");
      case "harvest":
        return translateFor(locale, "bot.workflowName.harvest");
      case "farm":
        return translateFor(locale, "bot.workflowName.farm");
      case "mine":
        return translateFor(locale, "bot.workflowName.mine", {
          item: shorten(item || translateFor(locale, "bot.workflowName.mineFallback"), 36),
          amount,
        });
      case "craft":
        return `${shorten(item || translateFor(locale, "bot.workflowName.craftFallback"), 36)}${amount}`;
      case "smelt":
        return translateFor(locale, "bot.workflowName.smelt", {
          item: shorten(item || translateFor(locale, "bot.workflowName.smeltFallback"), 32),
          amount,
        });
      case "collect":
        return translateFor(locale, "bot.workflowName.collect");
      case "deposit":
        return translateFor(locale, "bot.workflowName.deposit");
      case "return":
        return translateFor(locale, "bot.workflowName.return");
    }
  });
}

/** Short sequences describe their steps; longer ones get a stable, meaningful nickname. */
export function workflowName(
  steps: MineflayerWorkflowStep[],
  variant = 0,
  locale: Locale = readLocale(),
): string {
  if (!steps.length) return translateFor(locale, "bot.workflowName.new");
  if (steps.length <= 2 && variant === 0) {
    const description = workflowLabels(steps, locale).join(" → ");
    if (description.length <= SHORT_NAME_LIMIT && !description.includes("…")) return description;
  }
  return compactWorkflowName(nameOptions(steps, locale), variant);
}

export function findWorkflowNameVariant(
  value: string,
  steps: MineflayerWorkflowStep[],
): number | null {
  if (value === workflowName(steps)) return 0;
  if (!steps.length) return null;
  // A name saved in the other interface language is still an automatic name.
  for (const locale of ["ru", "en"] as const) {
    if (value === workflowName(steps, 0, locale)) return 0;
    const options = nameOptions(steps, locale);
    for (let variant = 1; variant <= options.count; variant++)
      if (compactWorkflowName(options, variant) === value) return variant;
  }
  return null;
}

/** Recognize titles generated by the previous version so saved runs can be shortened too. */
export function isAutomaticWorkflowName(value: string, steps: MineflayerWorkflowStep[]): boolean {
  if (value === workflowName(steps)) return true;
  if (!steps.length) return false;
  if (findWorkflowNameVariant(value, steps) !== null) return false;
  if (value === legacyCompactWorkflowName(steps)) return true;
  return (["ru", "en"] as const).some((locale) => {
    if (value === workflowName(steps, 0, locale)) return true;
    const labels = workflowLabels(steps, locale);
    const result =
      labels.length <= 3
        ? labels
            .map((label) =>
              shorten(label, Math.floor((120 - (labels.length - 1) * 3) / labels.length)),
            )
            .join(" → ")
        : `${shorten(labels[0], 42)} → … → ${shorten(labels[labels.length - 1], 42)} · ${steps.length} ${locale === "ru" ? "шагов" : "steps"}`; // exact format of names saved by older versions
    return value === shorten(result, 120);
  });
}

export function isGenericWorkflowName(value: unknown): boolean {
  return (
    typeof value !== "string" ||
    !value.trim() ||
    [
      "мой сценарий",
      "новый сценарий",
      "без названия",
      "my workflow",
      "new workflow",
      "untitled",
    ].includes(value.trim().toLocaleLowerCase("ru-RU"))
  );
}

export function readCustomWorkflowName(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && "manual" in parsed)
      return typeof parsed.manual === "string" && parsed.manual.trim()
        ? parsed.manual.slice(0, 120)
        : null;
  } catch {
    /* Migrate the previous plain-text name without retaining placeholder titles. */
  }
  if (isGenericWorkflowName(value) || ["Дерево → палки", "Железные инструменты"].includes(value))
    return null;
  return value.slice(0, 120);
}
