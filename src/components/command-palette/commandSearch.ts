export type PaletteCommand = {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  category?: string;
  imageUrl?: string | null;
  icon: "arrow" | "build" | "folder" | "plus" | "play" | "search" | "settings" | "archive";
  run: () => void;
};

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/ё/g, "е").trim().replace(/\s+/g, " ");
}

export type CatalogKind = "mods" | "resourcepacks" | "shaders";
export const CATALOG_KINDS: CatalogKind[] = ["mods", "resourcepacks", "shaders"];

/** Optional scope, e.g. `ресурспаки: Faithful` or `shaders Complementary`. */
export function parsePaletteQuery(value: string): { query: string; kind?: CatalogKind } {
  const scopes: [CatalogKind, RegExp][] = [
    ["mods", /^(?:mods?|мод(?:ы|ов)?)(?:\s*:\s*|\s+|$)/i],
    [
      "resourcepacks",
      /^(?:resource\s*packs?|packs?|ресурс\s*пак(?:и|ов)?|текстуры)(?:\s*:\s*|\s+|$)/i,
    ],
    ["shaders", /^(?:shaders?|шейдер(?:ы|ов)?)(?:\s*:\s*|\s+|$)/i],
  ];
  const query = value.trim();
  for (const [kind, pattern] of scopes) {
    const match = query.match(pattern);
    if (match) return { kind, query: query.slice(match[0].length).trim() };
  }
  return { query };
}

/** Keep exact build names ahead of commands that only mention the build. */
export function filterPaletteCommands(commands: PaletteCommand[], query: string) {
  const needle = normalize(query);
  if (!needle) return commands;
  const words = needle.split(" ");
  return commands
    .map((command) => {
      const label = normalize(command.label);
      const text = normalize(
        [command.label, command.description, ...(command.keywords ?? [])].join(" "),
      );
      const score =
        label === needle ? 0 : label.startsWith(needle) ? 1 : label.includes(needle) ? 2 : 3;
      return { command, score, matches: words.every((word) => text.includes(word)) };
    })
    .filter((entry) => entry.matches)
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.command);
}

export function isCommandPaletteShortcut(
  event: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
) {
  // Use the physical key so Ctrl+K also works with a Russian keyboard layout.
  return (
    event.code === "KeyK" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
  );
}
