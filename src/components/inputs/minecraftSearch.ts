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
      const haystack = `${name} ${title} ${aliases}`;
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
