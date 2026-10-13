import type { MinecraftCatalogEntry } from "../../types";

const MATERIALS: Array<[string, string]> = [
  ["diamond", "алмаз алмазы алмазный"],
  ["iron", "желез железо железный"],
  ["gold", "золот золото золотой"],
  ["copper", "мед медь"],
  ["coal", "уголь угля"],
  ["emerald", "изумруд"],
  ["redstone", "редстоун красн"],
  ["lapis", "лазурит"],
  ["quartz", "кварц"],
  ["log", "бревно ствол древес"],
  ["wood", "дерево древес"],
  ["leaves", "листва листья"],
  ["stone", "камень камен"],
  ["ore", "руда руды"],
  ["planks", "доски"],
  ["oak", "дуб"],
  ["spruce", "ель елов"],
  ["birch", "береза берез"],
  ["dirt", "земля"],
  ["sand", "песок песчан"],
  ["netherite", "незерит"],
];
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^minecraft:/, "")
    .replace(/[_-]/g, " ")
    .trim();

export function searchMinecraft(
  entries: MinecraftCatalogEntry[],
  query: string,
  scope: "blocks" | "items",
) {
  const term = normalize(query);
  const words = term.split(/\s+/).filter(Boolean);
  return entries
    .filter((entry) => (scope === "blocks" ? entry.mineable : entry.item))
    .map((entry) => {
      const name = normalize(entry.name);
      const title = normalize(entry.displayName);
      const aliases = MATERIALS.filter(([part]) => entry.name.includes(part))
        .map(([, alias]) => alias)
        .join(" ");
      const haystack = `${name} ${title} ${normalize(entry.description || "")} ${aliases}`;
      return { entry, name, title, matches: words.every((word) => haystack.includes(word)) };
    })
    .filter((result) => result.matches)
    .sort((a, b) => {
      const score = (result: typeof a) =>
        term && result.name === term
          ? 0
          : term && (result.name.startsWith(term) || result.title.startsWith(term))
            ? 1
            : term && result.name.split(" ").some((word) => word.startsWith(term))
              ? 2
              : 3;
      const rank = score(a) - score(b);
      return (
        rank ||
        Number(b.entry.kind === "group") - Number(a.entry.kind === "group") ||
        (term && score(a) === 1 ? a.name.length - b.name.length : 0) ||
        a.title.localeCompare(b.title, "ru")
      );
    })
    .map((result) => result.entry);
}

export function minecraftToken(value: string, caret: number, multiple: boolean) {
  if (!multiple) return { start: 0, end: value.length, query: value.trim() };
  const start = value.lastIndexOf(",", Math.max(0, caret - 1)) + 1;
  const next = value.indexOf(",", caret);
  const end = next < 0 ? value.length : next;
  return { start, end, query: value.slice(start, end).trim() };
}

export function selectMinecraftToken(
  value: string,
  caret: number,
  name: string,
  multiple: boolean,
) {
  const { start, end } = minecraftToken(value, caret, multiple);
  return value.slice(0, start) + name + value.slice(end);
}

export type MinecraftSearchSection = { id: string; label: string };

export const MINECRAFT_SEARCH_SECTIONS: MinecraftSearchSection[] = [
  { id: "collections", label: "Сборные группы" },
  { id: "resources", label: "Руды по материалу" },
  { id: "group", label: "Группы" },
  { id: "block", label: "Отдельные блоки" },
  { id: "item", label: "Предметы" },
];

export function minecraftResultSections(
  entries: MinecraftCatalogEntry[],
  sections = MINECRAFT_SEARCH_SECTIONS,
) {
  const grouped = new Map<string, MinecraftCatalogEntry[]>();
  for (const entry of entries) {
    const id = entry.section || entry.kind;
    const group = grouped.get(id) || [];
    group.push(entry);
    grouped.set(id, group);
  }
  const order = [
    ...sections,
    ...Array.from(grouped.keys())
      .filter((id) => !sections.some((section) => section.id === id))
      .map((id) => ({ id, label: id })),
  ];
  return order
    .filter(({ id }) => grouped.has(id))
    .map((section) => ({ ...section, entries: grouped.get(section.id)! }));
}

export function minecraftSelectedNames(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((name) => name.trim().replace(/^minecraft:/, ""))
        .filter(Boolean),
    ),
  ];
}

export function selectMinecraftEntries(
  value: string,
  caret: number,
  names: string[],
  mode: "single" | "toggle" | "range" | "add",
  validNames: Set<string>,
) {
  if (mode === "single") return names[0] || "";
  if (mode === "range") return [...new Set(names)].join(", ");
  const token = minecraftToken(value, caret, true);
  // A partially typed search is not a selected block. Preserve other tokens,
  // including manually entered IDs that are absent from this server's catalog.
  const base =
    validNames.has(token.query.replace(/^minecraft:/, "")) || token.query.includes("*")
      ? value
      : value.slice(0, token.start) + value.slice(token.end);
  const selected = minecraftSelectedNames(base);
  if (mode === "toggle" && selected.includes(names[0]))
    return selected.filter((name) => name !== names[0]).join(", ");
  return [...new Set([...selected, ...names])].join(", ");
}
