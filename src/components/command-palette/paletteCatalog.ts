import { invoke } from "@tauri-apps/api/core";
import type { InstanceItem, ModrinthProject, ModrinthSearchResponse } from "../../types";
import { CATALOG_KINDS, type CatalogKind } from "./commandSearch";

export type PaletteCatalogTargets = Record<CatalogKind, InstanceItem | null>;
export type PaletteProject = { kind: CatalogKind; project: ModrinthProject };
export type PaletteCatalogResult = { projects: PaletteProject[]; failed: CatalogKind[] };
type CatalogInvoker = (
  command: string,
  args: Record<string, unknown>,
) => Promise<ModrinthSearchResponse>;

export async function searchPaletteCatalog(
  query: string,
  targets: PaletteCatalogTargets,
  kind?: CatalogKind,
  request: CatalogInvoker = invoke,
): Promise<PaletteCatalogResult> {
  const kinds = CATALOG_KINDS.filter(
    (candidate) => (!kind || candidate === kind) && targets[candidate],
  );
  const pages = await Promise.allSettled(
    kinds.map(async (candidate) => {
      const target = targets[candidate]!;
      return request(`search_modrinth_${candidate}`, {
        instanceId: target.id,
        query,
        ...(candidate === "mods" ? {} : { gameVersion: target.version }),
        offset: 0,
        limit: 4,
      });
    }),
  );
  const result: PaletteCatalogResult = { projects: [], failed: [] };
  pages.forEach((page, index) => {
    if (page.status === "fulfilled") {
      result.projects.push(...page.value.hits.map((project) => ({ kind: kinds[index], project })));
    } else result.failed.push(kinds[index]);
  });
  return result;
}
