export type TextSearchMatch = {
  start: number;
  end: number;
  line: number;
};

export function normalizeSearchText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function getTextSearchMatches(value: string, query: string): TextSearchMatch[] {
  const source = normalizeSearchText(value);
  const needle = query.trim();
  if (!needle) return [];

  const haystack = source.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const matches: TextSearchMatch[] = [];
  let line = 0;
  let lineScanIndex = 0;
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const start = haystack.indexOf(lowerNeedle, searchIndex);
    if (start === -1) break;

    while (lineScanIndex < start) {
      if (source[lineScanIndex] === "\n") line += 1;
      lineScanIndex += 1;
    }

    matches.push({
      start,
      end: start + needle.length,
      line,
    });

    searchIndex = start + needle.length;
  }

  return matches;
}

export function replaceTextSearchMatch(
  value: string,
  match: TextSearchMatch,
  replacement: string,
) {
  const source = normalizeSearchText(value);
  return `${source.slice(0, match.start)}${replacement}${source.slice(match.end)}`;
}

export function replaceAllTextSearchMatches(
  value: string,
  query: string,
  replacement: string,
) {
  const source = normalizeSearchText(value);
  const matches = getTextSearchMatches(source, query);

  return [...matches].reverse().reduce(
    (nextValue, match) => replaceTextSearchMatch(nextValue, match, replacement),
    source,
  );
}
