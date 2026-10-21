import { useEffect, useState } from "react";
import { parsePaletteQuery } from "./commandSearch";
import {
  searchPaletteCatalog,
  type PaletteCatalogResult,
  type PaletteCatalogTargets,
} from "./paletteCatalog";

export function usePaletteCatalog(open: boolean, search: string, targets: PaletteCatalogTargets) {
  const { query, kind } = parsePaletteQuery(search);
  const key = JSON.stringify([query, kind, targets]);
  const hasTarget = kind ? Boolean(targets[kind]) : Object.values(targets).some(Boolean);
  const enabled = open && query.length >= 2 && hasTarget;
  const [snapshot, setSnapshot] = useState<
    PaletteCatalogResult & { key: string; loading: boolean }
  >({
    key: "",
    projects: [],
    failed: [],
    loading: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setSnapshot({ key, projects: [], failed: [], loading: true });
    const timer = window.setTimeout(() => {
      void searchPaletteCatalog(query, targets, kind).then((result) => {
        if (!cancelled) setSnapshot({ ...result, key, loading: false });
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, key, query, kind, targets]);

  // Hide results synchronously when query/compatibility changes, before effects run.
  if (!enabled || snapshot.key !== key) {
    return { projects: [], failed: [], loading: enabled } satisfies PaletteCatalogResult & {
      loading: boolean;
    };
  }
  return snapshot;
}
